#!/usr/bin/env node
/**
 * release-maestro.js — Orquestador maestro de release para KoRForge
 *
 * Uso:
 *   node scripts/release-maestro.js                  → flujo completo
 *   node scripts/release-maestro.js --solo-validar   → solo validaciones previas
 *   node scripts/release-maestro.js --dry-run        → alias de --solo-validar
 *   node scripts/release-maestro.js --desde=N        → reanuda desde el paso N
 *   node scripts/release-maestro.js --solo-github    → solo pasos 8-9
 *   node scripts/release-maestro.js --solo-web       → solo paso 10
 */

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const https = require('https');

// ─── Colores ANSI ────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  rojo:   '\x1b[31m',
  verde:  '\x1b[32m',
  amarillo: '\x1b[33m',
  azul:   '\x1b[34m',
  cyan:   '\x1b[36m',
  blanco: '\x1b[37m',
};
const ok  = (msg) => console.log(`${C.verde}✅ ${msg}${C.reset}`);
const err = (msg) => console.error(`${C.rojo}❌ ${msg}${C.reset}`);
const aviso = (msg) => console.log(`${C.amarillo}⚠️  ${msg}${C.reset}`);
const paso  = (n, msg) => console.log(`\n${C.azul}${C.bold}── Paso ${n}: ${msg}${C.reset}`);
const info  = (msg) => console.log(`${C.cyan}ℹ️  ${msg}${C.reset}`);
const separador = () => console.log(`${C.blanco}${'─'.repeat(60)}${C.reset}`);

// ─── Raíz del proyecto ────────────────────────────────────────────────────────
const RAIZ = path.resolve(__dirname, '..');

// ─── Leer package.json ────────────────────────────────────────────────────────
function leerVersion() {
  const pkgPath = path.join(RAIZ, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    err('No se encuentra package.json en la raíz del proyecto');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
}

// ─── Parsear argumentos ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const SOLO_VALIDAR = args.includes('--solo-validar') || args.includes('--dry-run');
const SOLO_GITHUB  = args.includes('--solo-github');
const SOLO_WEB     = args.includes('--solo-web');
const desdeArg     = args.find(a => a.startsWith('--desde='));
const DESDE        = desdeArg ? parseInt(desdeArg.split('=')[1], 10) : 1;

// ─── Ejecutar comando con spawnSync ───────────────────────────────────────────
function ejecutar(cmd, cargs = [], opts = {}) {
  const resultado = spawnSync(cmd, cargs, {
    cwd: RAIZ,
    stdio: 'inherit',
    shell: true,
    ...opts,
  });
  return resultado.status ?? 1;
}

// ─── Estado de protección del fuente ─────────────────────────────────────────
let fuenteProtegido = false;

// ─── Restaurar fuente y abortar ───────────────────────────────────────────────
function abortar(mensaje, pasoNum) {
  separador();
  err(`Fallo en el paso ${pasoNum}: ${mensaje}`);
  if (fuenteProtegido) {
    aviso('Restaurando el fuente (proteger-build --restaurar)…');
    const r = ejecutar('node', ['scripts/proteger-build.js', '--restaurar']);
    if (r === 0) {
      ok('Fuente restaurado correctamente');
      fuenteProtegido = false;
    } else {
      err('¡No se pudo restaurar el fuente! Hazlo manualmente: node scripts/proteger-build.js --restaurar');
    }
  }
  separador();
  process.exit(1);
}

// ─── Petición HTTPS simple ────────────────────────────────────────────────────
function peticionHttps(url, opciones = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD', ...opciones }, (res) => {
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// ─── VALIDACIONES PREVIAS ─────────────────────────────────────────────────────
async function validacionesPrevias(version) {
  separador();
  console.log(`${C.bold}${C.cyan}🔍 VALIDACIONES PREVIAS — KoRForge v${version}${C.reset}`);
  separador();

  let todoOk = true;

  // 1. node y npm disponibles
  {
    const rNode = spawnSync('node', ['--version'], { shell: true });
    const rNpm  = spawnSync('npm',  ['--version'], { shell: true });
    if (rNode.status === 0 && rNpm.status === 0) {
      ok(`node ${rNode.stdout?.toString().trim()} y npm ${rNpm.stdout?.toString().trim()} disponibles`);
    } else {
      err('node o npm no están disponibles en el PATH');
      todoOk = false;
    }
  }

  // 2. cf-key.local.txt
  {
    const cfKeyPath = path.join(RAIZ, 'cf-key.local.txt');
    if (!fs.existsSync(cfKeyPath)) {
      err('cf-key.local.txt no existe — la build saldrá sin clave CurseForge (buscador dará 403)');
      todoOk = false;
    } else {
      const contenido = fs.readFileSync(cfKeyPath, 'utf8').trim();
      if (!contenido) {
        err('cf-key.local.txt existe pero está vacío');
        todoOk = false;
      } else {
        ok('cf-key.local.txt presente y con contenido');
      }
    }
  }

  // 3. docs/CAMBIOS-ULTIMA.md más nuevo que el último tag git
  {
    const cambiosPath = path.join(RAIZ, 'docs', 'CAMBIOS-ULTIMA.md');
    if (!fs.existsSync(cambiosPath)) {
      err('docs/CAMBIOS-ULTIMA.md no existe');
      todoOk = false;
    } else {
      const rTag = spawnSync('git', ['log', '--tags', '--simplify-by-decoration', '--pretty=format:%aI', '-1'], {
        cwd: RAIZ, shell: true,
      });
      const mtime = fs.statSync(cambiosPath).mtimeMs;
      if (rTag.status !== 0 || !rTag.stdout?.toString().trim()) {
        aviso('No se encontró ningún tag git — se asume que CAMBIOS-ULTIMA.md es nuevo');
      } else {
        const tagFecha = new Date(rTag.stdout.toString().trim()).getTime();
        if (mtime > tagFecha) {
          ok('docs/CAMBIOS-ULTIMA.md fue modificado después del último tag git');
        } else {
          err('docs/CAMBIOS-ULTIMA.md NO ha sido modificado desde el último tag — ¿olvidaste editar el changelog?');
          todoOk = false;
        }
      }
    }
  }

  // 4. Working tree limpio (solo se permiten cambios en CAMBIOS-ULTIMA.md y package.json)
  {
    const rStatus = spawnSync('git', ['status', '--porcelain'], { cwd: RAIZ, shell: true });
    if (rStatus.status !== 0) {
      err('No se pudo ejecutar git status');
      todoOk = false;
    } else {
      const lineas = rStatus.stdout?.toString().trim().split('\n').filter(Boolean) ?? [];
      const permitidos = ['docs/CAMBIOS-ULTIMA.md', 'package.json', 'package-lock.json'];
      const noPermitidos = lineas.filter(l => {
        const archivo = l.slice(3).trim();
        return !permitidos.some(p => archivo.endsWith(p));
      });
      if (noPermitidos.length > 0) {
        err(`Working tree tiene cambios no esperados:\n  ${noPermitidos.join('\n  ')}`);
        aviso('Solo se permiten cambios en: docs/CAMBIOS-ULTIMA.md, package.json, package-lock.json');
        todoOk = false;
      } else {
        ok('Working tree limpio (solo cambios permitidos)');
      }
    }
  }

  // 5. Conectividad a GitHub
  {
    try {
      const code = await peticionHttps('https://api.github.com', {
        headers: { 'User-Agent': 'KoRForge-release-maestro' },
      });
      if (code < 500) {
        ok(`Conectividad a GitHub OK (HTTP ${code})`);
      } else {
        err(`GitHub respondió con HTTP ${code}`);
        todoOk = false;
      }
    } catch (e) {
      err(`Sin conectividad a GitHub: ${e.message}`);
      todoOk = false;
    }
  }

  // 6. Verificar que subir-release-github.js tiene lo que necesita (token en env o script existe)
  {
    const subirScript = path.join(RAIZ, 'scripts', 'subir-release-github.js');
    if (!fs.existsSync(subirScript)) {
      err('scripts/subir-release-github.js no existe');
      todoOk = false;
    } else {
      const tieneToken = !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
      if (tieneToken) {
        ok('GITHUB_TOKEN / GH_TOKEN disponible en el entorno');
      } else {
        // Intentar leer el token desde el script (puede estar hardcoded o en archivo)
        const contenidoScript = fs.readFileSync(subirScript, 'utf8');
        const usaTokenFile = contenidoScript.includes('gh-token') ||
                             contenidoScript.includes('token.txt') ||
                             contenidoScript.includes('GITHUB_TOKEN') ||
                             contenidoScript.includes('GH_TOKEN');
        if (usaTokenFile) {
          aviso('GITHUB_TOKEN no está en el entorno — asegúrate de que el script tiene acceso al token');
        } else {
          aviso('No se detectó GITHUB_TOKEN en el entorno — si el script lo necesita, fallará en el paso 9');
        }
      }
    }
  }

  // 7. Verificar cantidad de releases en GitHub (máximo 5)
  {
    try {
      const rReleases = await new Promise((resolve, reject) => {
        const opts = {
          hostname: 'api.github.com',
          path: '/repos/korzor/KoRForge/releases?per_page=10',
          method: 'GET',
          headers: {
            'User-Agent': 'KoRForge-release-maestro',
            ...(process.env.GITHUB_TOKEN || process.env.GH_TOKEN
              ? { Authorization: `token ${process.env.GITHUB_TOKEN || process.env.GH_TOKEN}` }
              : {}),
          },
        };
        const req = https.request(opts, (res) => {
          let data = '';
          res.on('data', d => { data += d; });
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
      });

      if (rReleases.status === 200) {
        const releases = JSON.parse(rReleases.body);
        if (releases.length >= 5) {
          aviso(`Hay ${releases.length} releases en GitHub (límite recomendado: 5)`);
          const masAntigua = releases[releases.length - 1];
          aviso(`Borra la más antigua antes de continuar:`);
          console.log(`${C.amarillo}  gh release delete "${masAntigua.tag_name}" --repo korzor/KoRForge --yes${C.reset}`);
          aviso('O usa la API: node -e "require(\'https\').request(...)"');
          // No es error fatal, es solo un aviso
        } else {
          ok(`${releases.length}/5 releases en GitHub — hay espacio para la nueva`);
        }
      } else if (rReleases.status === 401 || rReleases.status === 403) {
        aviso(`No se pudo comprobar releases en GitHub (HTTP ${rReleases.status}) — token no disponible o sin permisos`);
      } else {
        aviso(`Respuesta inesperada de GitHub al listar releases: HTTP ${rReleases.status}`);
      }
    } catch (e) {
      aviso(`No se pudo verificar releases en GitHub: ${e.message}`);
    }
  }

  separador();
  if (todoOk) {
    ok('Todas las validaciones previas superadas');
  } else {
    err('Algunas validaciones previas han fallado — corrige los errores antes de continuar');
    process.exit(1);
  }
  separador();
}

// ─── PLAN DE PASOS ────────────────────────────────────────────────────────────
function imprimirPlan(version) {
  console.log(`\n${C.bold}${C.cyan}📋 PLAN DE RELEASE — KoRForge v${version}${C.reset}`);
  separador();
  const pasos = [
    [ 1, 'Verificar i18n (9×569 claves)',          'node scripts/verificar-i18n.js'],
    [ 2, 'Proteger build (minificar + CF key)',     'node scripts/proteger-build.js'],
    [ 3, 'Electron-builder NSIS',                  'npx electron-builder --win nsis dir'],
    [ 4, 'Restaurar fuente',                       'node scripts/proteger-build.js --restaurar'],
    [ 5, 'Generar SHA256SUMS.txt',                 'node scripts/sha256-release.js'],
    [ 6, 'Subir release a GitHub',                 'node scripts/subir-release-github.js'],
    [ 7, 'Publicar en web Centolos + NAS',         'node scripts/publish-korforge-release.js --no-build'],
    [ 8, '⚠️  MANUAL: Actualizar tarjeta web',      '(ver instrucciones al final)'],
    [ 9, '⚠️  MANUAL: Deploy NAS',                  'powershell -File scripts/deploy-to-nas.ps1'],
    [10, '⚠️  MANUAL: Copiar JSON al NAS',          '(ver instrucciones al final)'],
  ];
  for (const [n, desc, cmd] of pasos) {
    const activo = (n >= DESDE) ? '' : `${C.amarillo}(omitido)${C.reset} `;
    console.log(`  ${C.bold}${String(n).padStart(2, ' ')}.${C.reset} ${desc}`);
    console.log(`      ${C.blanco}${cmd}${C.reset} ${activo}`);
  }
  separador();
}

// ─── PUNTO DE ENTRADA PRINCIPAL ───────────────────────────────────────────────
async function main() {
  const version = leerVersion();

  console.log(`\n${C.bold}${C.verde}╔══════════════════════════════════════════════════╗`);
  console.log(`║      KoRForge Release Maestro v${version.padEnd(17)}║`);
  console.log(`╚══════════════════════════════════════════════════╝${C.reset}\n`);

  if (SOLO_WEB) {
    info('Modo --solo-web: ejecutando solo el paso 10 (publish-korforge-release.js)');
    separador();
    paso(10, 'Publicar en web Centolos + NAS');
    const r = ejecutar('node', ['scripts/publish-korforge-release.js', '--no-build']);
    if (r !== 0) abortar('publish-korforge-release.js falló', 10);
    ok('Publicación web completada');
    imprimirResumenManual(version);
    return;
  }

  if (SOLO_GITHUB) {
    info('Modo --solo-github: ejecutando solo pasos 5 (SHA256) y 6 (GitHub)');
    separador();
    paso(5, 'Generar SHA256SUMS.txt');
    const r5 = ejecutar('node', ['scripts/sha256-release.js']);
    if (r5 !== 0) abortar('sha256-release.js falló', 5);
    validarSha256(5);

    paso(6, 'Subir release a GitHub');
    const r6 = ejecutar('node', ['scripts/subir-release-github.js']);
    if (r6 !== 0) abortar('subir-release-github.js falló', 6);
    await validarGithubRelease(version, 6);

    imprimirResumenManual(version);
    return;
  }

  // Imprimir plan
  imprimirPlan(version);

  // Validaciones previas siempre
  await validacionesPrevias(version);

  if (SOLO_VALIDAR) {
    ok('Modo --solo-validar: validaciones completadas, no se ejecuta nada más');
    return;
  }

  if (DESDE > 1) {
    aviso(`Reanudando desde el paso ${DESDE}`);
  }

  // ── Paso 1: Verificar i18n ─────────────────────────────────────────────────
  if (DESDE <= 1) {
    paso(1, 'Verificar i18n (DEBE pasar antes de ofuscar)');
    const r = ejecutar('node', ['scripts/verificar-i18n.js']);
    if (r !== 0) abortar('verificar-i18n.js falló', 1);
    ok('i18n verificado');
  }

  // ── Paso 2: Proteger build ────────────────────────────────────────────────
  if (DESDE <= 2) {
    paso(2, 'Proteger build (minificar + inyectar CF key)');
    const r = ejecutar('node', ['scripts/proteger-build.js']);
    if (r !== 0) abortar('proteger-build.js falló', 2);
    fuenteProtegido = true;

    // Validación: modules/_cfkey.generated.js debe existir
    const cfGenPath = path.join(RAIZ, 'modules', '_cfkey.generated.js');
    if (!fs.existsSync(cfGenPath)) {
      abortar('modules/_cfkey.generated.js NO existe tras proteger-build — la build saldrá sin clave CF', 2);
    }
    ok('modules/_cfkey.generated.js presente — CF key inyectada correctamente');
  } else if (DESDE <= 4) {
    // Si reanudamos en el medio, asumir que el fuente ya está protegido
    fuenteProtegido = true;
    aviso('Se asume que el fuente ya está protegido (reanudando desde paso ' + DESDE + ')');
  }

  // ── Paso 3: Electron-builder ──────────────────────────────────────────────
  if (DESDE <= 3) {
    paso(3, 'Electron-builder — Windows NSIS + dir');
    const r = ejecutar('npx', ['electron-builder', '--win', 'nsis', 'dir']);
    if (r !== 0) abortar('electron-builder falló', 3);

    // Validación: .exe en release/ con tamaño > 80 MB
    validarInstaladorExe(3);
    ok('Instalador .exe generado correctamente');
  }

  // ── Paso 4: Restaurar fuente ──────────────────────────────────────────────
  if (DESDE <= 4) {
    paso(4, 'Restaurar fuente (proteger-build --restaurar)');
    const r = ejecutar('node', ['scripts/proteger-build.js', '--restaurar']);
    if (r !== 0) {
      fuenteProtegido = true; // sigue protegido, abortar intentará restaurar de nuevo
      abortar('proteger-build.js --restaurar falló', 4);
    }
    fuenteProtegido = false;

    // Validación: public/app.js no debe contener la CF key
    validarFuenteLimpio(4);
    ok('Fuente restaurado y limpio (sin CF key)');
  }

  // Linux AppImage: aviso de paso manual
  if (DESDE <= 4) {
    separador();
    aviso('Paso 7 (Linux AppImage) se construye en WSL — FUERA de este script');
    aviso('Si no has construido el AppImage en WSL, hazlo ahora antes de continuar con SHA256');
    console.log(`${C.amarillo}  Pulsa Ctrl+C para interrumpir, o el script continuará en 10 segundos…${C.reset}`);
    await esperar(10000);
  }

  // ── Paso 5: SHA256 ────────────────────────────────────────────────────────
  if (DESDE <= 5) {
    paso(5, 'Generar SHA256SUMS.txt');
    const r = ejecutar('node', ['scripts/sha256-release.js']);
    if (r !== 0) abortar('sha256-release.js falló', 5);
    validarSha256(5);
    ok('SHA256SUMS.txt generado');
  }

  // ── Paso 6: Subir a GitHub ────────────────────────────────────────────────
  if (DESDE <= 6) {
    paso(6, `Subir release a GitHub — "KoRForge v${version}"`);
    const r = ejecutar('node', ['scripts/subir-release-github.js']);
    if (r !== 0) abortar('subir-release-github.js falló', 6);
    await validarGithubRelease(version, 6);
    ok('Release subida a GitHub');
  }

  // ── Paso 7: Publicar en web Centolos ─────────────────────────────────────
  if (DESDE <= 7) {
    paso(7, 'Publicar en web Centolos + NAS (publish-korforge-release.js --no-build)');
    const r = ejecutar('node', ['scripts/publish-korforge-release.js', '--no-build']);
    if (r !== 0) abortar('publish-korforge-release.js falló', 7);
    ok('Publicación web y NAS completada');
  }

  // ── Resumen final ─────────────────────────────────────────────────────────
  imprimirResumenManual(version);
}

// ─── VALIDACIONES INTERMEDIAS ─────────────────────────────────────────────────

function validarInstaladorExe(pasoNum) {
  const releaseDir = path.join(RAIZ, 'release');
  if (!fs.existsSync(releaseDir)) {
    abortar('El directorio release/ no existe tras electron-builder', pasoNum);
  }
  const archivos = fs.readdirSync(releaseDir);
  const exeFiles = archivos.filter(f => f.endsWith('.exe'));
  if (exeFiles.length === 0) {
    abortar('No se encontró ningún archivo .exe en release/', pasoNum);
  }
  const MINIMO_BYTES = 80 * 1024 * 1024; // 80 MB
  for (const exeFile of exeFiles) {
    const exePath = path.join(releaseDir, exeFile);
    const stat = fs.statSync(exePath);
    if (stat.size < MINIMO_BYTES) {
      abortar(`El instalador ${exeFile} tiene solo ${(stat.size / 1024 / 1024).toFixed(1)} MB (mínimo 80 MB) — ¿la build salió mal?`, pasoNum);
    }
    ok(`${exeFile} — ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
  }
}

function validarFuenteLimpio(pasoNum) {
  // Leer cf-key.local.txt para saber qué buscar
  const cfKeyPath = path.join(RAIZ, 'cf-key.local.txt');
  if (!fs.existsSync(cfKeyPath)) return; // no podemos verificar sin la clave

  const cfKey = fs.readFileSync(cfKeyPath, 'utf8').trim();
  if (!cfKey) return;

  // Buscar en public/app.js (y src/app.js como fallback)
  const candidatos = [
    path.join(RAIZ, 'public', 'app.js'),
    path.join(RAIZ, 'src', 'app.js'),
    path.join(RAIZ, 'app.js'),
  ];

  for (const candidato of candidatos) {
    if (!fs.existsSync(candidato)) continue;
    const contenido = fs.readFileSync(candidato, 'utf8');
    if (contenido.includes(cfKey)) {
      abortar(`${path.basename(candidato)} contiene la CF key tras restaurar — ¡el fuente no quedó limpio!`, pasoNum);
    }
  }
}

function validarSha256(pasoNum) {
  const sha256Path = path.join(RAIZ, 'SHA256SUMS.txt');
  if (!fs.existsSync(sha256Path)) {
    abortar('SHA256SUMS.txt no existe tras sha256-release.js', pasoNum);
  }
  const lineas = fs.readFileSync(sha256Path, 'utf8').trim().split('\n').filter(Boolean);
  if (lineas.length === 0) {
    abortar('SHA256SUMS.txt existe pero está vacío', pasoNum);
  }
  const tieneExe = lineas.some(l => l.toLowerCase().includes('.exe'));
  if (!tieneExe) {
    aviso('SHA256SUMS.txt no contiene ninguna línea con .exe — ¿falta el instalador de Windows?');
  } else {
    ok(`SHA256SUMS.txt tiene ${lineas.length} entradas (incluyendo .exe)`);
  }
}

async function validarGithubRelease(version, pasoNum) {
  info('Verificando que la release existe en GitHub…');
  try {
    const resultado = await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'api.github.com',
        path: '/repos/korzor/KoRForge/releases/latest',
        method: 'GET',
        headers: {
          'User-Agent': 'KoRForge-release-maestro',
          ...(process.env.GITHUB_TOKEN || process.env.GH_TOKEN
            ? { Authorization: `token ${process.env.GITHUB_TOKEN || process.env.GH_TOKEN}` }
            : {}),
        },
      };
      const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', d => { data += d; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });

    if (resultado.status === 200) {
      const release = JSON.parse(resultado.body);
      if (release.tag_name && release.tag_name.includes(version)) {
        ok(`Release "KoRForge v${version}" verificada en GitHub (tag: ${release.tag_name})`);
      } else {
        aviso(`La release más reciente en GitHub es "${release.tag_name}" — no coincide con v${version}`);
        aviso('Puede ser que la release tarde unos segundos en propagarse');
      }
    } else if (resultado.status === 401 || resultado.status === 403) {
      aviso(`No se pudo verificar la release en GitHub (HTTP ${resultado.status}) — token sin permisos de lectura`);
    } else {
      aviso(`Respuesta inesperada de GitHub al verificar release: HTTP ${resultado.status}`);
    }
  } catch (e) {
    aviso(`No se pudo verificar la release en GitHub: ${e.message}`);
  }
}

// ─── RESUMEN DE PASOS MANUALES ────────────────────────────────────────────────
function imprimirResumenManual(version) {
  separador();
  console.log(`\n${C.bold}${C.verde}🎉 Release KoRForge v${version} completada${C.reset}\n`);
  console.log(`${C.bold}${C.amarillo}📋 PASOS MANUALES PENDIENTES:${C.reset}\n`);

  console.log(`${C.amarillo}  1. Actualizar tarjeta estática de la web${C.reset}`);
  console.log(`     → Editar manualmente la tarjeta en la web de Centolos con la nueva versión`);
  console.log(`     → La URL de descarga debe apuntar a v${version}\n`);

  console.log(`${C.amarillo}  2. Deploy al NAS${C.reset}`);
  console.log(`     → powershell -File scripts/deploy-to-nas.ps1\n`);

  console.log(`${C.amarillo}  3. Copiar korforge-releases.json al NAS${C.reset}`);
  console.log(`     → Copiar data/korforge-releases.json al directorio correspondiente del NAS\n`);

  console.log(`${C.amarillo}  4. Linux AppImage (si no está hecho)${C.reset}`);
  console.log(`     → Construir en WSL y subir manualmente a GitHub\n`);

  separador();
  console.log(`${C.verde}${C.bold}✅ ¡Todo listo! KoRForge v${version} publicada.${C.reset}\n`);
}

// ─── Utilidad: esperar N ms ───────────────────────────────────────────────────
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Arrancar ─────────────────────────────────────────────────────────────────
main().catch(e => {
  err(`Error inesperado: ${e.message}`);
  if (fuenteProtegido) {
    aviso('Restaurando fuente por seguridad…');
    ejecutar('node', ['scripts/proteger-build.js', '--restaurar']);
  }
  process.exit(1);
});
