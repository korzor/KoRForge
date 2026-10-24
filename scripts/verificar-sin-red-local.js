#!/usr/bin/env node
/**
 * Sonda de RED de KoRForge: la app NO se conecta a la despensa ni al NAS (regla del dueño, 25-10-2026).
 *
 * REGLA: *«la app espero que no se conecte para nada con el pc de la despensa ni con el nas, esa es una
 * regla fundamental»*. Esa máquina y su NAS (y todo lo que hay detrás de la red local del dueño) no
 * tienen nada que ver con KoRForge: la app solo habla con servicios públicos.
 *
 * QUÉ COMPRUEBA
 *   1. **Código**: ningún fichero de la app ni de la interfaz contiene una dirección de la red local
 *      (10.x, 172.16-31.x, 192.168.x, 127.x salvo el propio servidor interno), ni `.local`, ni rutas
 *      `\\NAS…`, ni los nombres de la despensa/NAS/Centolos.
 *   2. **Hosts**: toda URL http(s) del código apunta a uno de los servicios PÚBLICOS permitidos
 *      (lista cerrada, abajo). Si alguien añade uno nuevo, esta sonda falla y hay que decidirlo a
 *      conciencia.
 *   3. **Servidor en marcha**: con server.js arrancado, las descargas por URL (`/api/install-url`)
 *      rechazan una dirección de la red local y las locales del API solo escuchan en 127.0.0.1.
 *
 * Uso: node scripts/verificar-sin-red-local.js
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUERTO = 3993;

const apuntes = [];
const problemas = [];
const comprobar = (nombre, condicion, detalle = '') => {
  apuntes.push((condicion ? 'OK   ' : 'FALLO ') + nombre + (!condicion && detalle ? ' -> ' + detalle : ''));
  if (!condicion) problemas.push(nombre + (detalle ? ' -> ' + detalle : ''));
};

/* Servicios públicos permitidos. Cualquier otro host es un fallo: primero se decide, luego se añade. */
const HOSTS_PERMITIDOS = new Set([
  'api.github.com',          // actualizador y descargas de releases
  'github.com',
  'api.curseforge.com',      // catálogo de addons
  'www.curseforge.com',
  'media.forgecdn.net',      // imágenes de addons
  'edge.forgecdn.net',
  'us.forums.blizzard.com',  // noticias (foros oficiales)
  'worldofwarcraft.blizzard.com',
  'bnetcmsus-a.akamaihd.net',
  'fonts.googleapis.com',    // tipografías de la interfaz
  'fonts.gstatic.com',
  'translate.googleapis.com', // traducir la descripción de un addon
  'www.buymeacoffee.com',     // enlace de donación del «Acerca de»
  'localhost',                // el propio servidor interno de la app
  '127.0.0.1',
  '[::1]',
]);

/* Palabras que no deben aparecer en el código de la app: la despensa, su NAS y el proyecto web. */
const PALABRAS_PROHIBIDAS = [/despensa/i, /\bnas\b/i, /\\\\nas/i, /centos/i, /korzor-tv/i, /ugreen/i, /synology/i];

const FICHEROS = [];
for (const rel of ['main.js', 'server.js', 'preload.js', 'build.js', 'package.json', 'config.example.json']) {
  FICHEROS.push(rel);
}
for (const dir of ['modules', 'public']) {
  const ruta = path.join(ROOT, dir);
  if (!fs.existsSync(ruta)) continue;
  for (const f of fs.readdirSync(ruta)) {
    if (/\.(js|mjs|html|css|json)$/i.test(f)) FICHEROS.push(path.join(dir, f));
  }
}
/* La sonda y los documentos del repositorio hablan de la regla a propósito: no se auditan. */
const EXCLUIDOS = [path.join('scripts', 'verificar-sin-red-local.js'), path.join('scripts', 'verificar-seguridad-api.js')];

let revisados = 0;
for (const rel of FICHEROS) {
  if (EXCLUIDOS.includes(rel)) continue;
  const ruta = path.join(ROOT, rel);
  if (!fs.existsSync(ruta)) continue;
  revisados += 1;
  const texto = fs.readFileSync(ruta, 'utf8');

  /* 1a. Direcciones de la red local escritas a mano. */
  const privadas = texto.match(/\b(?:10|127|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || [];
  const privadasReales = privadas.filter((ip) => !/^127\.0\.0\.1$/.test(ip));
  if (privadasReales.length) {
    comprobar(`sin IPs de red local en ${rel}`, false, privadasReales.slice(0, 4).join(', '));
  }

  /* 1b. Comparticiones de red y nombres de la casa. */
  /* UNC de verdad en el código fuente: \\\\equipo\\recurso (cuatro barras y un nombre). */
  if (/[\\]{4}[A-Za-z0-9_.-]+[\\]{1,2}/.test(texto)) {
    comprobar(`sin rutas de red (\\\\equipo\\…) en ${rel}`, false);
  }
  for (const patron of PALABRAS_PROHIBIDAS) {
    const m = texto.match(patron);
    if (m) comprobar(`sin menciones a la despensa/NAS/Centolos en ${rel}`, false, JSON.stringify(m[0]));
  }

  /* 2. Hosts de las URL http(s). */
  const urls = texto.match(/https?:\/\/[^\s"'`)<>,]+/g) || [];
  for (const url of urls) {
    let host = '';
    try { host = new URL(url.replace(/[.,;]+$/, '')).hostname.toLowerCase(); } catch (_) { continue; }
    if (!host || !/[a-z]/.test(host) || host.includes('...')) continue;
    if (!HOSTS_PERMITIDOS.has(host)) {
      comprobar(`host permitido en ${rel}`, false, host + ' (¿es de la despensa/NAS? entonces NO)');
    }
  }
}
comprobar(`se revisaron ${revisados} ficheros`, revisados > 10);

/* 3. Servidor en marcha: la red local también se rechaza al pedir una descarga. */
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-red-'));
fs.writeFileSync(path.join(base, 'config.json'), JSON.stringify({
  activeGame: 'forever', rootWoWDir: '', wowDir: '', closeToTray: false, startMinimized: false,
  language: 'es', favorites: [], autoStart: false,
  games: { forever: { id: 'forever', name: 'WoW Forever', subtitle: '', icon: 'A', path: '', subfolder: '_forever_', flavorId: '88568' } }
}, null, 2));

const hijo = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
  cwd: ROOT,
  env: Object.assign({}, process.env, { KORFORGE_PORT: String(PUERTO), KORFORGE_USER_DATA: base }),
  stdio: 'ignore'
});

const pedir = (metodo, ruta, { token, body } = {}) => new Promise((ok, mal) => {
  const req = http.request({
    hostname: '127.0.0.1', port: PUERTO, method: metodo, path: ruta,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'X-KoRForge-Token': token } : {})
  }, (res) => {
    let datos = '';
    res.on('data', (c) => { datos += c; });
    res.on('end', () => { let json = null; try { json = JSON.parse(datos); } catch (_) {} ok({ status: res.statusCode, json }); });
  });
  req.on('error', mal);
  if (body !== undefined) req.write(JSON.stringify(body));
  req.end();
});

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  try {
    let token = '';
    for (let i = 0; i < 40 && !token; i++) {
      await esperar(250);
      try { token = (await pedir('GET', '/api/session')).json?.token || ''; } catch (_) {}
    }
    if (!token) { comprobar('servidor de pruebas arranca', false); return; }

    /* Pedir a la app que descargue de la red del dueño: tiene que negarse. */
    for (const url of ['http://192.168.1.69/x.zip', 'http://10.0.0.5/addon.zip', 'http://127.0.0.1:3080/x.zip']) {
      const r = await pedir('POST', '/api/install-url', { token, body: { url, gameId: 'forever' } });
      comprobar(`descarga desde ${url} rechazada`, r.status === 400 && (r.json?.code === 'err_bad_url'), 'HTTP ' + r.status + ' ' + JSON.stringify(r.json).slice(0, 80));
    }

    /* El API escucha solo en 127.0.0.1: una petición con Host ajeno se rechaza. */
    const ajeno = await new Promise((ok) => {
      const req = http.request({ hostname: '127.0.0.1', port: PUERTO, path: '/api/ping', headers: { Host: '192.168.1.69:' + PUERTO } }, (res) => { res.resume(); ok(res.statusCode); });
      req.on('error', () => ok(0));
      req.end();
    });
    comprobar('Host ajeno (192.168.1.69) rechazado', ajeno === 403, 'HTTP ' + ajeno);
  } finally {
    try { hijo.kill(); } catch (_) {}
    await esperar(300);
    try { fs.rmSync(base, { recursive: true, force: true }); } catch (_) {}
  }

  console.log('\n== apuntes ==');
  for (const a of apuntes) console.log('  .', a);
  if (problemas.length) {
    console.log('\nPROBLEMAS:');
    for (const p of problemas) console.log('  -', p);
    console.log('\nKoRForge NO debe hablar con la despensa ni con el NAS (regla del dueño, 25-10-2026).');
    process.exit(1);
  }
  console.log('\nOK: la app no se conecta a la despensa ni al NAS (solo servicios públicos conocidos)');
})().catch((err) => { console.error('FALLO:', err.message); process.exit(1); });
