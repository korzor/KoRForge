/**
 * Protección de la build: minifica/ofusca el código del proceso principal (y lo empaqueta en
 * ASAR vía package.json). El fuente del repo se queda legible: esto SOLO se aplica a los
 * binarios de release.
 *
 * Uso (dueño, 23-10-2026: «empaquetar con asar + minificado ofuscado»):
 *   node scripts/proteger-build.js              # minifica en sitio (guarda copia en .build-src-backup)
 *   npx electron-builder --win nsis zip dir     # empaqueta el código minificado
 *   node scripts/proteger-build.js --restaurar  # devuelve el fuente legible al repo
 *
 * No toca lo que va en public/ (interfaz) ni package.json: solo lo que se ejecuta en el
 * proceso principal y en el servidor interno.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const raiz = path.resolve(__dirname, '..');
const respaldo = path.join(raiz, '.build-src-backup');

const objetivos = [
  'main.js',
  'preload.js',
  'server.js',
].concat(
  fs.existsSync(path.join(raiz, 'modules'))
    ? fs.readdirSync(path.join(raiz, 'modules'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => path.join('modules', f))
    : []
);

function rutaRelativa(p) {
  return path.relative(raiz, p);
}

function asegurarRespaldoListo(paraRestaurar) {
  const hayRespaldo = fs.existsSync(respaldo);
  if (paraRestaurar) {
    if (!hayRespaldo) {
      console.log('[proteger] No hay copia que restaurar: el fuente ya está limpio.');
      process.exit(0);
    }
    return;
  }
  if (hayRespaldo) {
    console.error('[proteger] Ya existe .build-src-backup (¿quedó una build a medias?).');
    console.error('  Restaura primero con: node scripts/proteger-build.js --restaurar');
    process.exit(1);
  }
}

async function proteger() {
  asegurarRespaldoListo(false);
  fs.mkdirSync(respaldo, { recursive: true });

  let totalAntes = 0;
  let totalDespues = 0;
  for (const rel of objetivos) {
    const src = path.join(raiz, rel);
    if (!fs.existsSync(src)) continue;
    const original = fs.readFileSync(src, 'utf8');
    fs.mkdirSync(path.dirname(path.join(respaldo, rel)), { recursive: true });
    fs.writeFileSync(path.join(respaldo, rel), original, 'utf8');
    let salida;
    try {
      const r = await minify(original, {
        /* main.js usa `return` de nivel superior (patrón CommonJS de Electron): permitido. */
        parse: { bare_returns: true },
        compress: { passes: 2 },
        mangle: true,
        module: false,
        toplevel: false,
        format: { comments: false },
      });
      salida = r.code;
    } catch (err) {
      console.error(`[proteger] terser falló en ${rel}: ${err.message}`);
      console.error('  Restaurando el respaldo de este fichero y abortando.');
      fs.copyFileSync(path.join(respaldo, rel), src);
      fs.rmSync(respaldo, { recursive: true, force: true });
      process.exit(1);
    }
    if (!salida || !salida.trim()) {
      console.error(`[proteger] ${rel} salió vacío; abortando.`);
      fs.copyFileSync(path.join(respaldo, rel), src);
      fs.rmSync(respaldo, { recursive: true, force: true });
      process.exit(1);
    }
    fs.writeFileSync(src, salida + '\n', 'utf8');
    totalAntes += Buffer.byteLength(original);
    totalDespues += Buffer.byteLength(salida);
    console.log(`[proteger] ${rel}: ${(Buffer.byteLength(original) / 1024).toFixed(1)} KB -> ${(Buffer.byteLength(salida) / 1024).toFixed(1)} KB`);
  }
  console.log(`[proteger] Listo. ${(totalAntes / 1024).toFixed(0)} KB -> ${(totalDespues / 1024).toFixed(0)} KB (copia en .build-src-backup)`);
}

function restaurar() {
  asegurarRespaldoListo(true);
  for (const rel of objetivos) {
    const copia = path.join(respaldo, rel);
    if (!fs.existsSync(copia)) continue;
    fs.copyFileSync(copia, path.join(raiz, rel));
    console.log(`[proteger] restaurado ${rutaRelativa(path.join(raiz, rel))}`);
  }
  fs.rmSync(respaldo, { recursive: true, force: true });
  console.log('[proteger] Fuente restaurado y copia borrada.');
}

const paraRestaurar = process.argv.includes('--restaurar');
(paraRestaurar ? Promise.resolve().then(restaurar) : proteger()).catch((err) => {
  console.error('[proteger] Error:', err);
  process.exit(1);
});
