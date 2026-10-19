const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');

// Downloads a file from a URL to a target local path
async function downloadFile(url, targetPath, onProgress) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'KoRForge-AddonManager/1.0 (Windows NT 10.0; Win64; x64)'
    }
  });

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
  resolveGitHubRelease
};
