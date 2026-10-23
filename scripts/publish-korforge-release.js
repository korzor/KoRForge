/**
 * Publica la version actual de KoRForge en la web.
 *
 * POR QUE ESTE FICHERO ESTA AQUI (y no solo en la carpeta de scripts de la web):
 * el script necesita `projectDir` = la raiz de KoRForge para leer su package.json y empaquetar.
 * La copia antigua que vivia fuera de este repo calculaba `projectDir` mal, asi que habria
 * compilado el proyecto equivocado (dueño, 20-10-2026).
 *
 * ADEMAS: la version anterior elegia el ZIP con `allZips[0]`, que es el primero por orden
 * alfabetico y por tanto puede ser el de una version VIEJA. Aqui se busca el que corresponde
 * a esta version y, si no aparece, se aborta en vez de subir un binario equivocado.
 *
 * Norma completa: docs/REGLAS-VERSIONES.md
 *   - La web enseña SOLO la ultima version.
 *   - «Subir a GitHub» = release en GitHub **y** web.
 *
 * Uso:  node scripts/publish-korforge-release.js
 *       node scripts/publish-korforge-release.js --no-build   (reutiliza los binarios de release/)
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const { leerCambios } = require('./notas-release');
const { hashesDe, escribirSha256Sums } = require('./sha256-release');

const projectDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'));
const version = pkg.version;
const sinBuild = process.argv.includes('--no-build');

const centolosDir = process.env.CENTOLOS_DIR
  || path.join(process.env.USERPROFILE || 'C:\\Users\\KoRZoR', 'centolos');
const releasesDir = path.join(centolosDir, 'public', 'wow', 'releases');
const registroPath = path.join(centolosDir, 'data', 'korforge-releases.json');

console.log(`[KoRForge web] Publicando v${version} en ${releasesDir}`);

const installerName = `KoRForge-Setup-${version}.exe`;
const zipDestName = `KoRForge-v${version}-win-x64.zip`;
const appImageName = `KoRForge-${version}-linux-x86_64.AppImage`;

/* 1. Empaquetar (salvo --no-build) ---------------------------------------- */
if (!sinBuild) {
  try {
    execSync('taskkill /F /IM KoRForge.exe /T 2>nul || exit 0', { shell: 'cmd.exe', stdio: 'ignore' });
    execSync('taskkill /F /IM electron.exe /T 2>nul || exit 0', { shell: 'cmd.exe', stdio: 'ignore' });
  } catch (_) { /* da igual si no habia ninguna abierta */ }
  console.log('[1/4] Empaquetando con electron-builder...');
  execSync('npx electron-builder --win nsis zip dir', { cwd: projectDir, stdio: 'inherit' });
} else {
  console.log('[1/4] Empaquetado saltado (--no-build): se usan los binarios de release/');
}

/* 2. Localizar los binarios DE ESTA VERSION (sin adivinar) ------------------ */
const releaseDir = path.join(projectDir, 'release');
const installerSrc = path.join(releaseDir, installerName);

/** Busca el ZIP portable de ESTA version. Devuelve null si no lo encuentra. */
function buscarZip() {
  const candidatos = [
    `KoRForge-${version}-win.zip`,
    `KoRForge-v${version}-win-x64.zip`,
    `KoRForge-${version}-win-x64.zip`,
  ];
  for (const c of candidatos) {
    const p = path.join(releaseDir, c);
    if (fs.existsSync(p)) return p;
  }
  /* Ultimo recurso: cualquier zip cuyo nombre contenga la version exacta. */
  if (fs.existsSync(releaseDir)) {
    const conVersion = fs.readdirSync(releaseDir)
      .filter((f) => f.toLowerCase().endsWith('.zip') && f.includes(version));
    if (conVersion.length === 1) return path.join(releaseDir, conVersion[0]);
    if (conVersion.length > 1) {
      console.error('  Varios ZIP con la version ' + version + ': ' + conVersion.join(', '));
      console.error('  Deja solo el bueno en release/ (o renombralo) y vuelve a lanzar.');
      return null;
    }
  }
  return null;
}

if (!fs.existsSync(installerSrc)) {
  console.error(`ERROR: no existe el instalador ${installerSrc}. Empaqueta primero (sin --no-build).`);
  process.exit(1);
}
const zipSrc = buscarZip();
if (!zipSrc) {
  console.error(`ERROR: no encuentro el ZIP portable de la version ${version} en ${releaseDir}.`);
  process.exit(1);
}

/* Linux (AppImage): se genera dentro de WSL (electron-builder desde Windows no puede crear los
   symlinks del AppDir). Si esta, se publica tambien en la web; si no, la build sigue siendo Windows. */
const appImageSrc = path.join(releaseDir, appImageName);
const hayAppImage = fs.existsSync(appImageSrc);
if (!hayAppImage) {
  console.warn(`AVISO: no hay ${appImageName} en release/; la web publicara solo Windows.`);
}

/* 3. Copiar a la web y limpiar las versiones anteriores -------------------- */
fs.mkdirSync(releasesDir, { recursive: true });
fs.copyFileSync(installerSrc, path.join(releasesDir, installerName));
fs.copyFileSync(zipSrc, path.join(releasesDir, zipDestName));
if (hayAppImage) fs.copyFileSync(appImageSrc, path.join(releasesDir, appImageName));
console.log(`[2/4] Copiados: ${installerName}, ${zipDestName}${hayAppImage ? ' y ' + appImageName : ''}`);

for (const f of fs.readdirSync(releasesDir)) {
  if (f === installerName || f === zipDestName || f === appImageName || f === '.gitkeep') continue;
  if (!/^KoRForge(-Setup-.*\.exe|-v.*\.zip|-\d.*-win\.zip|-\d.*-linux-x86_64\.AppImage)$/i.test(f)) continue;
  fs.unlinkSync(path.join(releasesDir, f));
  console.log(`  fuera de la web (version anterior): ${f}`);
}

/* 3 bis. Hashes: integridad y prueba de autoria (docs/PROTECCION-DERECHOS.md).
   Se publica SHA256SUMS.txt junto a los binarios y cada descarga lleva su hash en el registro. */
const rutasWeb = [path.join(releasesDir, installerName), path.join(releasesDir, zipDestName)];
if (hayAppImage) rutasWeb.push(path.join(releasesDir, appImageName));
const entradas = hashesDe(rutasWeb);
escribirSha256Sums(path.join(releasesDir, 'SHA256SUMS.txt'), entradas);
const hashPorArchivo = {};
for (const e of entradas) hashPorArchivo[e.archivo] = e.sha256;
console.log('  SHA-256 publicado en la web:');
for (const e of entradas) console.log(`    ${e.sha256}  ${e.archivo}`);

/* 4. Registro con UNA sola entrada (la ultima) ------------------------------ */
const mb = (f) => `${(fs.statSync(path.join(releasesDir, f)).size / 1048576).toFixed(1)} MB`;
const ahora = new Date();
const pad = (n) => String(n).padStart(2, '0');
const fecha = `${pad(ahora.getDate())}-${pad(ahora.getMonth() + 1)}-${String(ahora.getFullYear()).slice(-2)}`;

/* Los cambios y el titulo se leen de docs/CAMBIOS-ULTIMA.md, igual que en la release de GitHub
   (scripts/notas-release.js), para que las dos vias cuenten siempre lo mismo. */
const { titulo: tituloRelease, cambios } = leerCambios(projectDir);

const registro = [{
  version,
  fecha,
  esUltima: true,
  titulo: tituloRelease,
  descripcion: cambios[0] || '',
  cambios,
  descargas: [
    {
      tipo: 'instalador',
      nombre: `KoRForge v${version} (Instalador Oficial .exe)`,
      archivo: installerName,
      tamano: mb(installerName),
      sha256: hashPorArchivo[installerName] || '',
      arquitectura: 'Windows x64',
      url: `/api/wow/korforge/download/${installerName}`,
      recomendado: true,
    },
    {
      tipo: 'portable',
      nombre: `KoRForge v${version} (Portable Standalone .zip)`,
      archivo: zipDestName,
      tamano: mb(zipDestName),
      sha256: hashPorArchivo[zipDestName] || '',
      arquitectura: 'Windows x64',
      url: `/api/wow/korforge/download/${zipDestName}`,
      recomendado: false,
    },
    ...(hayAppImage ? [{
      tipo: 'appimage',
      nombre: `KoRForge v${version} (Linux .AppImage)`,
      archivo: appImageName,
      tamano: mb(appImageName),
      sha256: hashPorArchivo[appImageName] || '',
      arquitectura: 'Linux x86_64',
      url: `/api/wow/korforge/download/${appImageName}`,
      recomendado: true,
    }] : []),
  ],
}];

fs.mkdirSync(path.dirname(registroPath), { recursive: true });
fs.writeFileSync(registroPath, JSON.stringify(registro, null, 2), 'utf8');
console.log(`[3/4] Registro actualizado: ${registroPath} (solo v${version})`);

console.log('[4/4] Falta el despliegue y el JSON del NAS:');
console.log('  1) powershell -File scripts/deploy-to-nas.ps1   (copia public/wow/releases)');
console.log('  2) copiar data/korforge-releases.json al data/ de la web en el NAS');
console.log('     (el deploy EXCLUYE data/, ojo)');
console.log('  3) revisar la tarjeta estatica de la web');
console.log(`Hecho: v${version} lista en la web (pendiente de desplegar).`);
