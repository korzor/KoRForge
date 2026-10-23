'use strict';

/**
 * Publica la version actual de KoRForge en GitHub Releases **por la API REST**.
 *
 * Por que existe (dueño/entrega 23-10-2026): el CLI `gh release upload` se atasca con varios
 * assets seguidos ("accepts at most 1 arg(s)"). La API REST (POST /releases + POST uploads...)
 * funciona siempre y permite reemplazar assets con --clobber (DELETE + POST).
 *
 * Orden antes de lanzarlo (docs/REGLAS-VERSIONES.md):
 *   node scripts/proteger-build.js
 *   npx electron-builder --win nsis zip dir
 *   node scripts/proteger-build.js --restaurar
 *   node scripts/subir-release-github.js
 *
 * Token: usa GH_TOKEN/GITHUB_TOKEN del entorno o, si no hay, `gh auth token`.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { leerCambios, notasGithub } = require('./notas-release');
const { hashesDe, escribirSha256Sums, binariosDeVersion } = require('./sha256-release');

const REPO = 'korzor/KoRForge';
const projectDir = path.resolve(__dirname, '..');
const { version, titulo, cambios } = leerCambios(projectDir);
const tagName = `v${version}`;

function tokenDeGitHub() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync('gh auth token', { encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}

const TOKEN = tokenDeGitHub();
if (!TOKEN) {
  console.error('No hay token de GitHub (GH_TOKEN, GITHUB_TOKEN o `gh auth token`).');
  process.exit(1);
}

const CABECERAS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'KoRForge-release-script'
};

async function api(metodo, ruta, body) {
  const res = await fetch(`https://api.github.com${ruta}`, {
    method: metodo,
    headers: body !== undefined ? { ...CABECERAS, 'Content-Type': 'application/json' } : CABECERAS,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const texto = await res.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch (_) {}
  if (!res.ok) {
    const detalle = (json && (json.message || json.errors)) || texto || res.statusText;
    throw new Error(`${metodo} ${ruta} -> ${res.status}: ${JSON.stringify(detalle)}`);
  }
  return json;
}

async function subirAsset(releaseId, ruta, nombre) {
  const bytes = fs.readFileSync(ruta);
  const url = `https://uploads.github.com/repos/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(nombre)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...CABECERAS, 'Content-Type': 'application/octet-stream' },
    body: bytes
  });
  if (!res.ok) {
    throw new Error(`Subida de ${nombre} -> ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  console.log(`  asset subido: ${json.name} (${(json.size / 1048576).toFixed(1)} MB)`);
}

(async () => {
  const binarios = binariosDeVersion(version);
  if (!binarios.length) {
    console.error(`No hay binarios de la ${version} en release/. Empaqueta primero (sin --no-build).`);
    process.exit(1);
  }
  const entradas = hashesDe(binarios);
  const sumsPath = escribirSha256Sums(path.join(projectDir, 'release', 'SHA256SUMS.txt'), entradas);
  console.log(`Binarios de v${version}:`);
  for (const e of entradas) console.log(`  ${e.sha256}  ${e.archivo}`);
  console.log(`SHA256SUMS.txt: ${sumsPath}`);

  const archivos = entradas.map((e) => ({
    nombre: e.archivo,
    bytes: e.bytes,
    detalle: /\.exe$/i.test(e.archivo)
      ? 'Instalador oficial para Windows (recomendado)'
      : 'Linux x86_64 (AppImage, con actualizador propio)'
  }));
  const notas = notasGithub({ version, titulo, cambios, entradas, archivos });

  let release = null;
  try {
    release = await api('GET', `/repos/${REPO}/releases/tags/${tagName}`);
    console.log(`La release ${tagName} ya existe (id ${release.id}): se reemplazan los assets.`);
    for (const asset of release.assets || []) {
      const homonimo = archivos.some((a) => a.nombre === asset.name) || asset.name === 'SHA256SUMS.txt';
      if (!homonimo) continue;
      await api('DELETE', `/repos/${REPO}/releases/assets/${asset.id}`);
      console.log(`  asset anterior borrado: ${asset.name}`);
    }
    release = await api('PATCH', `/repos/${REPO}/releases/${release.id}`, { name: titulo, body: notas });
  } catch (err) {
    if (!/404/.test(err.message)) throw err;
    console.log(`Creando la release ${tagName}...`);
    release = await api('POST', `/repos/${REPO}/releases`, {
      tag_name: tagName,
      target_commitish: 'main',
      name: titulo,
      body: notas,
      draft: false,
      prerelease: false
    });
  }

  console.log(`Subiendo assets a la release ${tagName} (id ${release.id})...`);
  for (const ruta of binarios) {
    await subirAsset(release.id, ruta, path.basename(ruta));
  }
  await subirAsset(release.id, sumsPath, 'SHA256SUMS.txt');

  const final = await api('GET', `/repos/${REPO}/releases/tags/${tagName}`);
  console.log(`Release ${tagName} publicada: ${final.html_url}`);
  console.log('Assets: ' + (final.assets || []).map((a) => a.name).join(', '));
})().catch((err) => {
  console.error('FALLO publicando la release:', err.message);
  process.exit(1);
});
