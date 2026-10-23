/**
 * Publica la version actual de KoRForge en GitHub Releases.
 *
 * Que hace:
 *   0. Puerta de idiomas (docs internos: REGLAS-IDIOMAS): no se publica con textos sin traducir.
 *   1. Empaqueta con electron-builder (instalador NSIS y carpeta desempaquetada). El ZIP portable
 *      se retiro el 23-10-2026: era la via mas facil de copiar el codigo.
 *   2. Calcula el SHA-256 de los binarios y escribe release/SHA256SUMS.txt.
 *   3. Crea la release con el texto de docs/CAMBIOS-ULTIMA.md, los binarios y el SHA256SUMS.txt.
 *
 * Los hashes quedan en el cuerpo de la release y como asset: sirven para que cualquiera
 * verifique el archivo y como prueba fechada de que ese binario salio de aqui.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const { leerCambios, notasGithub } = require('./notas-release');
const { hashesDe, escribirSha256Sums } = require('./sha256-release');

console.log('[KoRForge Release] Publicando en GitHub Releases...');

const projectDir = path.resolve(__dirname, '..');
const { version, titulo, cambios } = leerCambios(projectDir);
const tagName = `v${version}`;

// 0. Puerta de idiomas
console.log('\n[0/3] Comprobando que todos los idiomas estan completos...');
try {
  execSync('node scripts/verificar-i18n.js', { cwd: projectDir, stdio: 'inherit' });
} catch (_) {
  console.error('\nRelease cancelada: hay textos de interfaz sin traducir o claves que faltan.');
  console.error('Arregla lo que senala el verificador y vuelve a lanzar la release.');
  process.exit(1);
}

// 1. Cerrar instancias previas para liberar bloqueos de archivos en release/
try {
  execSync('taskkill /F /IM KoRForge.exe /T 2>nul || exit 0', { shell: 'cmd.exe', stdio: 'ignore' });
  execSync('taskkill /F /IM electron.exe /T 2>nul || exit 0', { shell: 'cmd.exe', stdio: 'ignore' });
} catch (_) {}

console.log(`\n[1/3] Empaquetando KoRForge v${version} con electron-builder...`);
execSync('npx electron-builder --win nsis dir', { cwd: projectDir, stdio: 'inherit' });

const releaseDir = path.join(projectDir, 'release');
const installerName = `KoRForge-Setup-${version}.exe`;
const installerSrc = path.join(releaseDir, installerName);

if (!fs.existsSync(installerSrc)) {
  console.error(`ERROR: No se encontro el instalador en ${installerSrc}`);
  process.exit(1);
}

const tamano = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

console.log('\n[2/3] Archivos generados:');
console.log(`  - Instalador: ${installerName} (${tamano(fs.statSync(installerSrc).size)})`);
const appImageName = `KoRForge-${version}-linux-x86_64.AppImage`;
const appImageSrc = path.join(releaseDir, appImageName);
if (fs.existsSync(appImageSrc)) {
  console.log(`  - Linux:      ${appImageName} (${tamano(fs.statSync(appImageSrc).size)})`);
}

// 2. Hashes de los binarios
const entradas = hashesDe([installerSrc, fs.existsSync(appImageSrc) ? appImageSrc : null]);
const sumsPath = escribirSha256Sums(path.join(releaseDir, 'SHA256SUMS.txt'), entradas);
console.log('\nSHA-256 de los binarios:');
for (const e of entradas) console.log(`  ${e.sha256}  ${e.archivo}`);

// 3. Publicar en GitHub Releases
console.log(`\n[3/3] Publicando Release ${tagName} en GitHub (korzor/KoRForge)...`);

const notesFile = path.join(releaseDir, 'release-notes.tmp.md');
const archivos = [
  { nombre: installerName, bytes: fs.statSync(installerSrc).size, detalle: 'Instalador oficial para Windows (recomendado)' },
  ...(fs.existsSync(appImageSrc) ? [{ nombre: appImageName, bytes: fs.statSync(appImageSrc).size, detalle: 'Linux x86_64 (AppImage)' }] : []),
];
fs.writeFileSync(notesFile, notasGithub({ version, titulo, cambios, entradas, archivos }), 'utf-8');

try {
  let releaseExists = false;
  try {
    execSync(`gh release view ${tagName} --repo korzor/KoRForge`, { stdio: 'pipe' });
    releaseExists = true;
  } catch (_) {
    releaseExists = false;
  }

  const filesToUpload = [`"${installerSrc}"`];
  if (fs.existsSync(appImageSrc)) filesToUpload.push(`"${appImageSrc}"`);
  filesToUpload.push(`"${sumsPath}"`);

  if (releaseExists) {
    console.log(`  Release ${tagName} ya existe en GitHub. Subiendo assets y notas...`);
    execSync(`gh release upload ${tagName} ${filesToUpload.join(' ')} --clobber --repo korzor/KoRForge`, { stdio: 'inherit' });
    execSync(`gh release edit ${tagName} --notes-file "${notesFile}" --repo korzor/KoRForge`, { stdio: 'inherit' });
  } else {
    console.log(`  Creando nueva Release ${tagName} en GitHub...`);
    execSync(`gh release create ${tagName} ${filesToUpload.join(' ')} --title "${titulo}" --notes-file "${notesFile}" --repo korzor/KoRForge`, { stdio: 'inherit' });
  }

  console.log(`  Release ${tagName} publicada en GitHub.`);
} catch (err) {
  console.error('  AVISO subiendo a GitHub:', err.message);
} finally {
  try { if (fs.existsSync(notesFile)) fs.unlinkSync(notesFile); } catch (_) {}
}

console.log(`\nLanzamiento v${version} completado en GitHub Releases.`);
