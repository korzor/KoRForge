const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 [KoRForge Release Pipeline] Iniciando pipeline de publicación en GitHub Releases...');

const projectDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'));
const version = pkg.version || '1.0.0';
const tagName = `v${version}`;

// 0. Puerta de idiomas (docs/REGLAS-IDIOMAS.md): no se publica con textos sin traducir.
console.log('\n🌍 [0/3] Comprobando que todos los idiomas están completos...');
try {
  execSync('node scripts/verificar-i18n.js', { cwd: projectDir, stdio: 'inherit' });
} catch (_) {
  console.error('\n❌ Release cancelada: hay textos de interfaz sin traducir o claves que faltan.');
  console.error('   Arregla lo que señala el verificador y vuelve a lanzar la release.');
  process.exit(1);
}

// 1. Cerrar instancias previas para liberar bloqueos de archivos en release/
try {
  execSync('taskkill /F /IM KoRForge.exe /T 2>nul || exit 0', { shell: 'cmd.exe', stdio: 'ignore' });
  execSync('taskkill /F /IM electron.exe /T 2>nul || exit 0', { shell: 'cmd.exe', stdio: 'ignore' });
} catch (_) {}

// 2. Empaquetar con electron-builder (NSIS installer + ZIP portable + unpacked)
console.log(`\n📦 [1/3] Empaquetando KoRForge v${version} con electron-builder...`);
execSync('npx electron-builder --win nsis zip dir', { cwd: projectDir, stdio: 'inherit' });

const releaseDir = path.join(projectDir, 'release');
const installerName = `KoRForge-Setup-${version}.exe`;
const defaultZipName = `KoRForge-${version}-win.zip`;

let zipSrc = path.join(releaseDir, defaultZipName);
if (!fs.existsSync(zipSrc)) {
  const matchingZips = fs.readdirSync(releaseDir)
    .filter(f => f.toLowerCase().endsWith('.zip') && f.includes(version) && !f.includes('test'))
    .map(f => ({ name: f, path: path.join(releaseDir, f), time: fs.statSync(path.join(releaseDir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  if (matchingZips.length > 0) {
    zipSrc = matchingZips[0].path;
  }
}

const installerSrc = path.join(releaseDir, installerName);

if (!fs.existsSync(installerSrc)) {
  console.error(`❌ Error: No se encontró el instalador en ${installerSrc}`);
  process.exit(1);
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

const installerSize = formatSize(fs.statSync(installerSrc).size);
const zipSize = fs.existsSync(zipSrc) ? formatSize(fs.statSync(zipSrc).size) : '240 MB';

console.log(`\n✔ [2/3] Archivos generados con éxito:`);
console.log(`  - Instalador: ${installerName} (${installerSize})`);
if (fs.existsSync(zipSrc)) {
  console.log(`  - Portable:   ${path.basename(zipSrc)} (${zipSize})`);
}

// 3. Publicar en GitHub Releases con gh CLI
console.log(`\n☁️ [3/3] Publicando Release ${tagName} en GitHub (korzor/KoRForge)...`);

const notesFile = path.join(releaseDir, 'release-notes.tmp.md');
const notesContent = `## KoRForge ${tagName}

### 📐 Cambios y Novedades (v1.1.2 ➔ v1.1.3)

**Una sola vertical a la derecha**
- El **botón Buscar** termina en la misma línea vertical que el **botón de apoyo (Ko-fi)** de la barra superior.
- La **barra de scroll** de la derecha queda en esa misma línea: en el catálogo, en las pestañas y en la ficha del addon.
- Un único margen derecho (10 px) para toda la ventana, comprobado de **1120 a 1920 px** de ancho.

### 📥 Archivos Disponibles
- \`${installerName}\` - Instalador oficial para Windows (${installerSize})
${fs.existsSync(zipSrc) ? `- \`${path.basename(zipSrc)}\` - Versión portable en ZIP (${zipSize})` : ''}
`;

fs.writeFileSync(notesFile, notesContent, 'utf-8');

try {
  // Comprobar si la release ya existe en GitHub
  let releaseExists = false;
  try {
    execSync(`gh release view ${tagName} --repo korzor/KoRForge`, { stdio: 'pipe' });
    releaseExists = true;
  } catch (_) {
    releaseExists = false;
  }

  const filesToUpload = [`"${installerSrc}"`];
  if (fs.existsSync(zipSrc)) {
    filesToUpload.push(`"${zipSrc}"`);
  }

  if (releaseExists) {
    console.log(`  ℹ Release ${tagName} ya existe en GitHub. Subiendo nuevos assets...`);
    execSync(`gh release upload ${tagName} ${filesToUpload.join(' ')} --clobber --repo korzor/KoRForge`, { stdio: 'inherit' });
  } else {
    console.log(`  🚀 Creando nueva Release ${tagName} en GitHub...`);
    execSync(`gh release create ${tagName} ${filesToUpload.join(' ')} --title "KoRForge ${tagName}" --notes-file "${notesFile}" --repo korzor/KoRForge`, { stdio: 'inherit' });
  }

  console.log(`  ✔ Release ${tagName} publicada en GitHub con éxito.`);
} catch (err) {
  console.error('  ⚠️ Advertencia subiendo a GitHub:', err.message);
} finally {
  try { if (fs.existsSync(notesFile)) fs.unlinkSync(notesFile); } catch (_) {}
}

console.log(`\n🎉 ¡Lanzamiento v${version} completado con éxito en GitHub Releases!`);
