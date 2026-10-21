/**
 * SHA-256 de los binarios de una release de KoRForge.
 *
 * Para que sirve (decidido el 21-10-2026):
 *   1. Integridad: que el .exe que alguien descarga es exactamente el que se compilo.
 *   2. Prueba de autoria: el hash publicado con fecha demuestra que ese binario salio de aqui
 *      antes de que aparezca una copia en otro sitio (docs/PROTECCION-DERECHOS.md).
 *
 * El mismo hash viaja a tres sitios: al cuerpo de la release de GitHub, al fichero
 * SHA256SUMS.txt que se sube como asset y a la web (registro de descargas).
 *
 * Uso como modulo:  const { hashesDe, escribirSha256Sums } = require('./sha256-release');
 * Uso desde consola: node scripts/sha256-release.js            (version del package.json)
 *                    node scripts/sha256-release.js 1.2.0      (version concreta)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');

/** SHA-256 en hexadecimal de un archivo, leyendolo por trozos (los binarios pesan 100 MB o mas). */
function sha256DeArchivo(ruta) {
  const hash = crypto.createHash('sha256');
  const tamano = 4 * 1024 * 1024;
  const buffer = Buffer.allocUnsafe(tamano);
  const fd = fs.openSync(ruta, 'r');
  try {
    let leidos;
    while ((leidos = fs.readSync(fd, buffer, 0, tamano, null)) > 0) {
      hash.update(buffer.subarray(0, leidos));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/** Lista de { archivo, ruta, sha256, bytes } para los archivos que existan. */
function hashesDe(archivos) {
  return (archivos || [])
    .filter((ruta) => ruta && fs.existsSync(ruta))
    .map((ruta) => ({
      archivo: path.basename(ruta),
      ruta,
      sha256: sha256DeArchivo(ruta),
      bytes: fs.statSync(ruta).size,
    }));
}

/** Contenido de un SHA256SUMS.txt al estilo de GNU coreutils (hash, dos espacios, nombre). */
function textoSha256Sums(entradas) {
  return (entradas || []).map((e) => `${e.sha256}  ${e.archivo}`).join('\n') + '\n';
}

/** Escribe el SHA256SUMS.txt y devuelve su ruta. */
function escribirSha256Sums(destino, entradas) {
  fs.writeFileSync(destino, textoSha256Sums(entradas), 'utf-8');
  return destino;
}

/** Busca en release/ el instalador y el ZIP portable de una version concreta. */
function binariosDeVersion(version) {
  const releaseDir = path.join(projectDir, 'release');
  const candidatos = [
    path.join(releaseDir, `KoRForge-Setup-${version}.exe`),
    path.join(releaseDir, `KoRForge-${version}-win.zip`),
    path.join(releaseDir, `KoRForge-v${version}-win-x64.zip`),
    path.join(releaseDir, `KoRForge-${version}-win-x64.zip`),
  ];
  return candidatos.filter((ruta) => fs.existsSync(ruta));
}

module.exports = {
  sha256DeArchivo,
  hashesDe,
  textoSha256Sums,
  escribirSha256Sums,
  binariosDeVersion,
};

/* Modo consola ------------------------------------------------------------- */
if (require.main === module) {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'));
  const version = process.argv[2] || pkg.version;
  const archivos = binariosDeVersion(version);
  if (!archivos.length) {
    console.error(`No hay binarios de la version ${version} en release/. Empaqueta primero.`);
    process.exit(1);
  }
  const entradas = hashesDe(archivos);
  const destino = escribirSha256Sums(path.join(projectDir, 'release', 'SHA256SUMS.txt'), entradas);
  console.log(`SHA-256 de KoRForge v${version}:`);
  for (const e of entradas) {
    console.log(`  ${e.sha256}  ${e.archivo}  (${(e.bytes / 1048576).toFixed(1)} MB)`);
  }
  console.log(`\nEscrito en ${destino}`);
}
