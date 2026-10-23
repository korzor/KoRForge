'use strict';

/**
 * Sonda de seguridad del API local de KoRForge (auditoría 22-10-2026, K1-K4).
 *
 * Arranca server.js en un puerto y un directorio de datos TEMPORALES (no toca la app ni la config
 * real) y comprueba, con peticiones HTTP de verdad, el perímetro del API:
 *
 *   K1  Host/Origin/Sec-Fetch-Site y token de sesión en /api/*
 *   K2  nombres de carpeta de addons (sin traversal) en toggle y borrado
 *   K3  open-folder valida el nombre (nada que inyectar en el shell)
 *   K4  nombres de backup .zip (sin traversal) en restaurar y borrar
 *
 * Uso:  node scripts/verificar-seguridad-api.js      → exit 0 si todo está protegido
 *       (opcional) PUERTO_PRUEBA=39901
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PUERTO = Number(process.env.PUERTO_PRUEBA) || 39901;
const nombresSeguros = require(path.join(RAIZ, 'modules', 'nombresSeguros.js'));

function peticion(metodo, ruta, { token, host, origin, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const opciones = {
      hostname: '127.0.0.1',
      port: PUERTO,
      method: metodo,
      path: ruta,
      headers: Object.assign({ 'Content-Type': 'application/json' },
        host ? { Host: host } : {},
        origin ? { Origin: origin } : {},
        token ? { 'X-KoRForge-Token': token } : {},
        headers)
    };
    const req = http.request(opciones, (res) => {
      let datos = '';
      res.on('data', (c) => { datos += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(datos); } catch (_) { /* respuesta no JSON */ }
        resolve({ status: res.statusCode, json, texto: datos });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const fallos = [];
  const comprobar = (nombre, condicion, detalle) => {
    if (condicion) {
      console.log('OK   ' + nombre);
    } else {
      console.log('FALLO ' + nombre + (detalle ? ' -> ' + detalle : ''));
      fallos.push(nombre);
    }
  };

  /* --- Módulo de nombres (puro) ------------------------------------------- */
  comprobar('nombres: ".." no vale', nombresSeguros.esNombreDeCarpetaValido('..') === false);
  comprobar('nombres: "..\\..\\x" no vale', nombresSeguros.esNombreDeCarpetaValido('..\\..\\x') === false);
  comprobar('nombres: "C:/x" no vale', nombresSeguros.esNombreDeCarpetaValido('C:/x') === false);
  comprobar('nombres: "Questie" vale', nombresSeguros.esNombreDeCarpetaValido('Questie') === true);
  comprobar('nombres: "EllesmereUI.disabled" vale', nombresSeguros.esNombreDeCarpetaValido('EllesmereUI.disabled') === true);
  comprobar('nombres: backup "..\\..\\x.zip" no vale', nombresSeguros.esNombreDeBackupValido('..\\..\\x.zip') === false);
  comprobar('nombres: backup "WTF_forever_1.zip" vale', nombresSeguros.esNombreDeBackupValido('WTF_forever_1.zip') === true);
  comprobar('nombres: contención dentro', nombresSeguros.estaDentroDe('C:\\juegos\\AddOns', 'C:\\juegos\\AddOns\\Questie') === true);
  comprobar('nombres: contención fuera (sibling)', nombresSeguros.estaDentroDe('C:\\juegos\\AddOns', 'C:\\juegos\\AddOns2\\x') === false);

  /* --- Servidor de prueba ------------------------------------------------ */
  const datosPrueba = fs.mkdtempSync(path.join(os.tmpdir(), 'korforge-api-'));
  const juegoDir = path.join(datosPrueba, 'WoW Forever');
  fs.mkdirSync(path.join(juegoDir, 'Interface', 'AddOns'), { recursive: true });
  fs.writeFileSync(path.join(datosPrueba, 'config.json'), JSON.stringify({
    activeGame: 'forever',
    rootWoWDir: '',
    games: {
      forever: {
        id: 'forever', name: 'WoW Forever', subtitle: 'Cliente 1.60.1',
        icon: '⚔️', path: juegoDir, subfolder: '_forever_',
        flavorId: '88568', flavorName: 'Forever'
      }
    },
    wowDir: juegoDir,
    closeToTray: false,
    startMinimized: false,
    language: 'es',
    favorites: [],
    autoStart: false
  }, null, 2));

  const hijo = spawn(process.execPath, [path.join(RAIZ, 'server.js')], {
    cwd: RAIZ,
    env: Object.assign({}, process.env, {
      KORFORGE_PORT: String(PUERTO),
      KORFORGE_USER_DATA: datosPrueba
    }),
    stdio: 'ignore'
  });

  const limpiar = () => {
    try { hijo.kill(); } catch (_) { /* ya murió */ }
    try { fs.rmSync(datosPrueba, { recursive: true, force: true }); } catch (_) { /* en uso */ }
  };
  process.on('exit', limpiar);

  let arriba = false;
  for (let i = 0; i < 40; i++) {
    await esperar(250);
    try {
      const r = await peticion('GET', '/api/session');
      if (r.status === 200) { arriba = true; break; }
    } catch (_) { /* todavía no escucha */ }
  }
  if (!arriba) {
    console.error('FALLO el servidor de prueba no arrancó en el puerto ' + PUERTO);
    process.exit(1);
  }

  const sesion = await peticion('GET', '/api/session');
  const token = (sesion.json && sesion.json.token) || '';
  comprobar('K1 /api/session da token', sesion.status === 200 && token.length >= 32);

  const evilHost = await peticion('GET', '/api/session', { host: 'evil.example' });
  comprobar('K1 Host ajeno rechazado (DNS-rebinding)', evilHost.status === 403 && evilHost.json && evilHost.json.code === 'err_bad_host');

  const evilOrigin = await peticion('GET', '/api/session', { origin: 'https://evil.example' });
  comprobar('K1 Origin ajeno rechazado', evilOrigin.status === 403 && evilOrigin.json && evilOrigin.json.code === 'err_bad_origin');

  const crossSite = await peticion('GET', '/api/ping', { token, headers: { 'Sec-Fetch-Site': 'cross-site' } });
  comprobar('K1 Sec-Fetch-Site cross-site rechazado', crossSite.status === 403);

  const sinToken = await peticion('GET', '/api/ping');
  comprobar('K1 /api/ping sin token -> 401', sinToken.status === 401 && sinToken.json && sinToken.json.code === 'err_bad_token');

  const tokenMalo = await peticion('GET', '/api/ping', { token: 'x'.repeat(48) });
  comprobar('K1 token falso -> 401', tokenMalo.status === 401);

  const conToken = await peticion('GET', '/api/ping', { token });
  comprobar('K1 /api/ping con token -> 200', conToken.status === 200 && conToken.json && conToken.json.pong === true);

  const porQuery = await peticion('GET', '/api/ping?token=' + encodeURIComponent(token));
  comprobar('K1 token por query (carga de la ventana) -> 200', porQuery.status === 200);

  const configOk = await peticion('GET', '/api/config', { token });
  comprobar('K1 /api/config con token -> 200', configOk.status === 200 && configOk.json && configOk.json.app === 'KoRForge');

  const traversal = await peticion('DELETE', '/api/addons/..%2F..%2Fevil', { token });
  comprobar('K2 delete addon con ../.. -> 400 err_invalid_name', traversal.status === 400 && traversal.json && traversal.json.code === 'err_invalid_name');

  const toggleMal = await peticion('POST', '/api/addons/toggle', { token, body: { folderName: '..\\..\\evil' } });
  comprobar('K2 toggle addon con ../.. -> 400 err_invalid_name', toggleMal.status === 400 && toggleMal.json && toggleMal.json.code === 'err_invalid_name');

  const inyeccion = await peticion('POST', '/api/addons/open-folder', { token, body: { folderName: 'x" & calc & "' } });
  comprobar('K3 open-folder con comillas/metacaracteres -> 400 err_invalid_name', inyeccion.status === 400 && inyeccion.json && inyeccion.json.code === 'err_invalid_name');

  const restoreMal = await peticion('POST', '/api/backups/restore', { token, body: { fileName: '..\\..\\algo.zip' } });
  comprobar('K4 restore backup con ../.. -> 400 err_invalid_name', restoreMal.status === 400 && restoreMal.json && restoreMal.json.code === 'err_invalid_name');

  const deleteBackupMal = await peticion('DELETE', '/api/backups/..%2F..%2Falgo.zip', { token });
  comprobar('K4 delete backup con ../.. -> 400 err_invalid_name', deleteBackupMal.status === 400 && deleteBackupMal.json && deleteBackupMal.json.code === 'err_invalid_name');

  const sinZip = await peticion('POST', '/api/backups/restore', { token, body: { fileName: 'algo.txt' } });
  comprobar('K4 restore backup que no es .zip -> 400 err_invalid_name', sinZip.status === 400 && sinZip.json && sinZip.json.code === 'err_invalid_name');

  /* --- K5: actualizador (versión/URL canónicas y SHA-256 del release) ------ */
  const updater = require(path.join(RAIZ, 'modules', 'updater.js'));
  comprobar('K5 versión "1.2.23" válida', updater.esVersionValida('1.2.23') === true);
  comprobar('K5 versión "..\\..\\AppData" no válida', updater.esVersionValida('..\\..\\AppData') === false);
  comprobar('K5 URL canónica aceptada', updater.esUrlDeInstalador(updater.urlInstaladorOficial('1.2.23'), '1.2.23') === true);
  comprobar('K5 URL ajena rechazada', updater.esUrlDeInstalador('https://evil.example/x.exe', '1.2.23') === false);
  comprobar('K5 URL de OTRA versión rechazada', updater.esUrlDeInstalador(updater.urlInstaladorOficial('1.2.22'), '1.2.23') === false);
  comprobar('K5 asset API ajeno rechazado', updater.esUrlDeInstalador('https://api.github.com/repos/otro/Repo/releases/assets/1', '1.2.23') === false);

  const dlVersion = await peticion('POST', '/api/app-updates/download', {
    token, body: { downloadUrl: 'https://evil.example/x.exe', version: '..\\..\\x' }
  });
  comprobar('K5 /api/app-updates/download con versión basura -> 400 err_invalid_version',
    dlVersion.status === 400 && dlVersion.json && dlVersion.json.code === 'err_invalid_version');

  const dlUrl = await peticion('POST', '/api/app-updates/download', {
    token, body: { downloadUrl: 'https://evil.example/x.exe', version: '1.2.23' }
  });
  comprobar('K5 /api/app-updates/download con URL ajena -> 400 err_invalid_url',
    dlUrl.status === 400 && dlUrl.json && dlUrl.json.code === 'err_invalid_url');

  /* Contrato del release real: SHA256SUMS.txt publicado incluye el hash del instalador de ESTA
     versión y coincide con el binario local de release/ (si lo hay). Necesita red; si no hay,
     se avisa y no cuenta como fallo. */
  const versionActual = require(path.join(RAIZ, 'package.json')).version;
  try {
    const rSums = await fetch(updater.urlSha256Sums(versionActual), {
      headers: { 'User-Agent': 'KoRForge-security-probe/1.0' }
    });
    const texto = rSums.ok ? await rSums.text() : '';
    const nombreExe = `KoRForge-Setup-${versionActual}.exe`;
    const linea = texto.split(/\r?\n/).map((l) => l.trim()).find((l) => l.endsWith('  ' + nombreExe));
    comprobar('K5 el release publica SHA256SUMS del instalador', !!(linea && /^[0-9a-f]{64}\s/.test(linea)), 'sin línea para ' + nombreExe);
    if (linea) {
      const hashSums = linea.split(/\s+/)[0].toLowerCase();
      const instaladorLocal = path.join(RAIZ, 'release', nombreExe);
      if (fs.existsSync(instaladorLocal)) {
        const { sha256DeArchivo } = require(path.join(RAIZ, 'scripts', 'sha256-release.js'));
        comprobar('K5 SHA-256 del release = binario local', sha256DeArchivo(instaladorLocal) === hashSums, 'no coincide');
      }
    }
  } catch (_) {
    console.log('AVISO no se pudo comprobar SHA256SUMS del release (sin red?); no cuenta como fallo');
  }

  /* --- K6: URLs de descarga de addons (SSRF) ------------------------------- */
  const installer = require(path.join(RAIZ, 'modules', 'installer.js'));
  comprobar('K6 https a forgecdn permitido', installer.esUrlDeDescargaPermitida('https://edge.forgecdn.net/files/1/x.zip') === true);
  comprobar('K6 https a github permitido', installer.esUrlDeDescargaPermitida('https://github.com/o/r/releases/download/v1/a.zip') === true);
  comprobar('K6 http rechazado (solo https)', installer.esUrlDeDescargaPermitida('http://edge.forgecdn.net/x.zip') === false);
  comprobar('K6 127.0.0.1 rechazado', installer.esUrlDeDescargaPermitida('https://127.0.0.1/x.zip') === false);
  comprobar('K6 localhost rechazado', installer.esUrlDeDescargaPermitida('https://localhost/x.zip') === false);
  comprobar('K6 host ajeno rechazado', installer.esUrlDeDescargaPermitida('https://evil.example/x.zip') === false);
  comprobar('K6 sufijo falso rechazado', installer.esUrlDeDescargaPermitida('https://github.com.evil.example/x.zip') === false);
  comprobar('K6 file: rechazado', installer.esUrlDeDescargaPermitida('file:///C:/x.zip') === false);
  comprobar('K6 IP privadas detectadas',
    installer.esIpNoPublica('192.168.1.10') === true
    && installer.esIpNoPublica('10.0.0.8') === true
    && installer.esIpNoPublica('169.254.1.1') === true
    && installer.esIpNoPublica('::1') === true
    && installer.esIpNoPublica('fe80::1') === true);
  comprobar('K6 IP pública no marcada',
    installer.esIpNoPublica('8.8.8.8') === false && installer.esIpNoPublica('2606:4700:4700::1111') === false);

  const instUrl = await peticion('POST', '/api/install-url', { token, body: { url: 'http://127.0.0.1/x.zip' } });
  comprobar('K6 /api/install-url con http+loopback -> 400 err_bad_url',
    instUrl.status === 400 && instUrl.json && instUrl.json.code === 'err_bad_url');

  const instFile = await peticion('POST', '/api/install-file', { token, body: { downloadUrl: 'https://evil.example/x.zip' } });
  comprobar('K6 /api/install-file con host ajeno -> 400 err_bad_url',
    instFile.status === 400 && instFile.json && instFile.json.code === 'err_bad_url');

  const dnsPrivado = await installer.validarUrlDescarga('https://localhost.dev/x.zip');
  comprobar('K6 validación con DNS rechaza host no permitido', dnsPrivado.ok === false);
  try {
    const dnsPublico = await installer.validarUrlDescarga('https://github.com/o/r/releases/download/v1/a.zip');
    comprobar('K6 validación DNS pública de github.com', dnsPublico.ok === true, dnsPublico.motivo || '');
  } catch (_) {
    console.log('AVISO no se pudo resolver DNS (sin red?); no cuenta como fallo');
  }

  /* --- K9: perfiles (anti zip-bomb y topes) -------------------------------- */
  const profiles = require(path.join(RAIZ, 'modules', 'profiles.js'));
  const zlib = require('zlib');
  const bomba = 'KORP-' + zlib.gzipSync(Buffer.alloc(1024 * 1024, 97), { level: 9 })
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  let k9ok = false;
  try { profiles.parseProfile(bomba); } catch (e) { k9ok = /inválido|danado|dañado|grande|500/i.test(e.message); }
  comprobar('K9 código bomba rechazado sin reventar', k9ok);

  /* --- K10: la clave de CurseForge no está en el código fuente ------------ */
  const fuenteCurseforge = fs.readFileSync(path.join(RAIZ, 'modules', 'curseforge.js'), 'utf8');
  comprobar('K10 sin clave de CurseForge hardcodeada', !fuenteCurseforge.includes('$2a$10$'));

  /* --- K12: token de gh cacheado ------------------------------------------ */
  const updater2 = require(path.join(RAIZ, 'modules', 'updater.js'));
  updater2.getGitHubToken(); /* primera llamada (puede ejecutar gh) */
  const t1 = Date.now();
  updater2.getGitHubToken();
  comprobar('K12 segunda llamada a getGitHubToken cacheada (<20 ms)', Date.now() - t1 < 20);

  /* --- K15: autostart y kills sin globales -------------------------------- */
  const fuenteServer = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  const fuenteUpdater = fs.readFileSync(path.join(RAIZ, 'modules', 'updater.js'), 'utf8');
  comprobar('K15 autostart apunta al ejecutable real (sin wscript/vbs)', !fuenteServer.includes("TargetPath = 'wscript.exe'") && !fuenteServer.includes('vbsPath'));
  comprobar('K15 el runner no mata KoRForge/electron ajenos', !fuenteUpdater.includes("'KoRForge','electron'"));

  /* --- K-C3/K-C4/K-C8/K14 (cierre de la auditoría) ------------------------- */
  const pkgVersion = require(path.join(RAIZ, 'package.json')).version;
  const configExport = await peticion('GET', '/api/config', { token });
  comprobar('K-C3 /api/config devuelve la versión real', configExport.status === 200 && configExport.json && configExport.json.version === pkgVersion, `esperado ${pkgVersion}, recibido ${configExport.json && configExport.json.version}`);
  comprobar('K-C4 sin respuestas 500 con err.message', !fuenteServer.includes('res.status(500).json({ error: err.message })'));

  const dirRegistro = fs.mkdtempSync(path.join(os.tmpdir(), 'korforge-reg-'));
  process.env.KORFORGE_USER_DATA = dirRegistro;
  const registro = require(path.join(RAIZ, 'modules', 'installedRegistry.js'));
  registro.recordInstallation('forever', { modId: 123, name: 'Prueba', version: '1.0.0', folders: ['Prueba'] });
  await registro.recordInstallation || null;
  const ficheroRegistro = path.join(dirRegistro, 'installed-registry.json');
  let registroValido = false;
  try { registroValido = !!JSON.parse(fs.readFileSync(ficheroRegistro, 'utf8'))['forever']; } catch (_) {}
  const sinTemporales = fs.readdirSync(dirRegistro).every((n) => !n.includes('.tmp-'));
  comprobar('K-C8 registro escrito de forma atómica (JSON válido, sin .tmp)', registroValido && sinTemporales);

  const fuenteInstaller = fs.readFileSync(path.join(RAIZ, 'modules', 'installer.js'), 'utf8');
  comprobar('K14 topes anti zip-bomb en installer.js', fuenteInstaller.includes('TAMANO_MAX_DESCOMPRIMIDO') && fuenteInstaller.includes('TAMANO_MAX_DESCARGA'));

  console.log('');
  if (fallos.length > 0) {
    console.error(fallos.length + ' comprobación(es) FALLIDA(S): ' + fallos.join(', '));
    process.exit(1);
  }
  console.log('Todo en verde: el API local rechaza lo que debe rechazar.');
  process.exit(0);
}

main().catch((err) => {
  console.error('FALLO general:', err && err.stack ? err.stack : err);
  process.exit(1);
});
