const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const dns = require('dns').promises;
const AdmZip = require('adm-zip');

/* K6 (auditoría 22-10-2026): las descargas de addons solo salen hacia hosts conocidos (CurseForge y
 * GitHub), SIEMPRE por https, y con el DNS resuelto a direcciones públicas: ni `127.0.0.1`, ni la
 * intranet, ni `file:`. Cada redirección se vuelve a validar antes de seguirla. */
const HOSTS_PERMITIDOS = new Set([
  'github.com',
  'www.github.com',
  'api.github.com',
  'codeload.github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com'
]);
const SUFIJOS_PERMITIDOS = ['.forgecdn.net'];

function hostDeDescarga(url) {
  try { return new URL(String(url)).hostname.toLowerCase().replace(/\.$/, ''); } catch (_) { return ''; }
}

function esHostDeDescargaPermitido(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!h) return false;
  if (HOSTS_PERMITIDOS.has(h)) return true;
  return SUFIJOS_PERMITIDOS.some((sufijo) => h.endsWith(sufijo) && h.length > sufijo.length);
}

/** ¿Es una IP privada, loopback, link-local o no enrutable? */
function esIpNoPublica(ip) {
  if (!net.isIP(ip)) return false;
  if (net.isIPv4(ip)) {
    const o = ip.split('.').map(Number);
    return o[0] === 10
      || o[0] === 127
      || o[0] === 0
      || (o[0] === 169 && o[1] === 254)
      || (o[0] === 172 && o[1] >= 16 && o[1] <= 31)
      || (o[0] === 192 && o[1] === 168);
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true;  // fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(v6)) return true;  // fe80::/10
  return false;
}

/** Validación SIN red: esquema https, sin credenciales en la URL y host permitido. */
function esUrlDeDescargaPermitida(url) {
  let u;
  try { u = new URL(String(url)); } catch (_) { return false; }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  return esHostDeDescargaPermitido(u.hostname);
}

/**
 * Validación completa: además de esquema y host, resuelve el DNS y exige que todas las
 * direcciones sean públicas (evita SSRF contra la intranet).
 */
async function validarUrlDescarga(url) {
  let u;
  try { u = new URL(String(url)); } catch (_) { return { ok: false, motivo: 'url-malformada' }; }
  if (u.protocol !== 'https:') return { ok: false, motivo: 'solo-https' };
  if (u.username || u.password) return { ok: false, motivo: 'credenciales-en-url' };
  if (!esHostDeDescargaPermitido(u.hostname)) return { ok: false, motivo: 'host-no-permitido' };
  try {
    const registros = await dns.lookup(u.hostname, { all: true });
    if (!registros.length) return { ok: false, motivo: 'dns-sin-registros' };
    for (const r of registros) {
      if (esIpNoPublica(r.address)) return { ok: false, motivo: 'ip-no-publica' };
    }
  } catch (_) {
    return { ok: false, motivo: 'dns-fallo' };
  }
  return { ok: true };
}

/**
 * Descarga siguiendo redirecciones a mano: cada salto se valida antes de pedirlo y hay un tope.
 */
async function descargarConValidacion(url) {
  let actual = String(url);
  for (let salto = 0; salto < 5; salto++) {
    const v = await validarUrlDescarga(actual);
    if (!v.ok) {
      throw new Error(`Descarga no permitida (${v.motivo}).`);
    }
    const res = await fetch(actual, {
      redirect: 'manual',
      headers: { 'User-Agent': 'KoRForge-AddonManager/1.0 (Windows NT 10.0; Win64; x64)' }
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`Redirección sin destino (HTTP ${res.status}).`);
      actual = new URL(loc, actual).href;
      continue;
    }
    return res;
  }
  throw new Error('Demasiadas redirecciones en la descarga del addon.');
}

// Downloads a file from a URL to a target local path
async function downloadFile(url, targetPath, onProgress) {
  const res = await descargarConValidacion(url);

  if (!res.ok) {
    throw new Error(`Error en descarga HTTP ${res.status}: ${res.statusText}`);
  }

  const fileStream = fs.createWriteStream(targetPath);
  const reader = res.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(Buffer.from(value));
  }

  await new Promise((resolve, reject) => {
    fileStream.end();
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });
}

// Resolves a GitHub repository link to its latest release zip
async function resolveGitHubRelease(url) {
  // matches github.com/owner/repo
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
  if (!match) return url;

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, '').replace(/\/$/, '');
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'KoRForge-AddonManager/1.0',
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!res.ok) {
    // Fallback to repo zipball
    return `https://github.com/${owner}/${repo}/archive/refs/heads/master.zip`;
  }

  const data = await res.json();
  const zipAsset = (data.assets || []).find(a => a.name.toLowerCase().endsWith('.zip'));
  if (zipAsset && zipAsset.browser_download_url) {
    return zipAsset.browser_download_url;
  }

  return data.zipball_url || `https://github.com/${owner}/${repo}/archive/refs/heads/master.zip`;
}

// Installs an addon zip file into addonsDir
async function installFromZip(zipPath, addonsDir, addonHintName = 'Addon') {
  if (!fs.existsSync(addonsDir)) {
    fs.mkdirSync(addonsDir, { recursive: true });
  }

  const tempExtractDir = path.join(os.tmpdir(), `korforge_${Date.now()}`);
  fs.mkdirSync(tempExtractDir, { recursive: true });

  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempExtractDir, true);

    // Recursively locate all directories that contain a .toc file
    const installedFolders = [];

    function searchForAddons(dir, depth = 0) {
      if (depth > 3) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const hasToc = entries.some(e => !e.isDirectory() && e.name.toLowerCase().endsWith('.toc'));

      if (hasToc) {
        // This folder IS an addon!
        const folderName = path.basename(dir);
        const destination = path.join(addonsDir, folderName);

        // Remove old version if it exists
        if (fs.existsSync(destination)) {
          fs.rmSync(destination, { recursive: true, force: true });
        }

        // Copy directory to AddOns
        fs.cpSync(dir, destination, { recursive: true });
        installedFolders.push(folderName);
      } else {
        // Search subdirectories
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name !== '__MACOSX') {
            searchForAddons(path.join(dir, entry.name), depth + 1);
          }
        }
      }
    }

    searchForAddons(tempExtractDir);

    if (installedFolders.length === 0) {
      // Loose files at root? If tempExtractDir has .toc, copy it as addonHintName
      const rootFiles = fs.readdirSync(tempExtractDir);
      const rootToc = rootFiles.find(f => f.toLowerCase().endsWith('.toc'));
      if (rootToc) {
        const destName = path.basename(rootToc, path.extname(rootToc)) || addonHintName;
        const destination = path.join(addonsDir, destName);
        if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
        fs.cpSync(tempExtractDir, destination, { recursive: true });
        installedFolders.push(destName);
      } else {
        throw new Error('No se encontró ningún archivo .toc en el paquete del addon.');
      }
    }

    return installedFolders;
  } finally {
    // Cleanup temp extraction folder
    try {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

// High-level install workflow from any URL (GitHub, direct zip, or CurseForge)
async function installFromUrl(rawUrl, addonsDir, nameHint = 'Addon') {
  /* K6: la URL de entrada también se valida (la ruta del API ya responde 400 antes, esto es la
     segunda barrera por si se llama desde otro sitio). */
  const validacionEntrada = await validarUrlDescarga(rawUrl);
  if (!validacionEntrada.ok) {
    throw new Error(`err_bad_url: URL de descarga no permitida (${validacionEntrada.motivo}).`);
  }

  let downloadUrl = rawUrl;
  if (rawUrl.includes('github.com')) {
    downloadUrl = await resolveGitHubRelease(rawUrl);
  }

  const tempZipPath = path.join(os.tmpdir(), `korforge_dl_${Date.now()}.zip`);
  try {
    await downloadFile(downloadUrl, tempZipPath);
    const installed = await installFromZip(tempZipPath, addonsDir, nameHint);
    return {
      success: true,
      installedFolders: installed,
      sourceUrl: downloadUrl
    };
  } finally {
    try {
      if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
    } catch (_) {}
  }
}

module.exports = {
  installFromUrl,
  installFromZip,
  resolveGitHubRelease,
  esUrlDeDescargaPermitida,
  validarUrlDescarga,
  esIpNoPublica
};
