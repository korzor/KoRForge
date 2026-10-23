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
