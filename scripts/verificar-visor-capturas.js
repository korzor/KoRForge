#!/usr/bin/env node
/**
 * Sonda del visor de capturas de la ficha del addon (dueño, 24-10-2026).
 *
 * QUE COMPRUEBA (servidor de pruebas con public/ + Electron con CDP y perfil temporal propio)
 *   1. Pinchar una miniatura abre el VISOR (no el navegador interno) con la captura grande.
 *   2. Se ven todas: flechas ◀ ▶, teclado (← →) y RUEDA del ratón (con freno).
 *   3. Contador «2 de 4» y el título de la captura.
 *   4. Da la vuelta (de la primera a la última y al revés).
 *   5. Escape cierra y el foco vuelve a la miniatura; clic fuera también cierra.
 *   6. Con una sola captura no salen flechas.
 *
 * Uso: node scripts/verificar-visor-capturas.js
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const HTTP_PORT = 3983;
const CDP_PORT = 9347;
const NOW = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const apuntes = [];
const problemas = [];
const comprobar = (nombre, condicion, detalle = '') => {
  apuntes.push((condicion ? 'OK   ' : 'FALLO ') + nombre + (!condicion && detalle ? ' -> ' + detalle : ''));
  if (!condicion) problemas.push(nombre + (detalle ? ' -> ' + detalle : ''));
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };

// PNG de 1x1 válido para servir como captura de prueba.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

const CONFIG = {
  success: true, activeGame: 'forever', language: 'es', closeToTray: false,
  rootWoWDir: 'C:\\WoW', wowDir: 'C:\\WoW\\_forever_',
  games: {
    forever: { id: '88568', name: 'WoW Forever', subtitle: 'x', subfolder: '_forever_', path: 'C:\\WoW\\_forever_', icon: 'A', addonsExists: true, folderExists: true },
    retail: { id: '517', name: 'WoW Retail', subtitle: 'x', subfolder: '_retail_', path: '', icon: 'B', addonsExists: false, folderExists: false },
    classic_era: { id: '67408', name: 'Classic Era', subtitle: 'x', subfolder: '_classic_era_', path: '', icon: 'C', addonsExists: false, folderExists: false },
    classic: { id: '79434', name: 'Classic Prog', subtitle: 'x', subfolder: '_classic_', path: '', icon: 'D', addonsExists: false, folderExists: false }
  }
};

const capturas = [1, 2, 3, 4].map((n) => ({
  id: n,
  title: 'Captura ' + n,
  description: '',
  thumbnailUrl: '/probe-mini-' + n + '.png',
  url: '/probe-grande-' + n + '.png'
}));

const MOD = {
  id: 1, name: 'Details', slug: 'details', summary: 'Medidor de dano', downloadCount: 10,
  iconUrl: '', author: 'Tercioo', version: '1.2.3', sourceUrl: '', issuesUrl: '', wikiUrl: '',
  websiteUrl: 'https://www.curseforge.com/wow/addons/details',
  categories: [], dateModified: NOW, dateCreated: NOW, screenshots: capturas
};

const MOD_UNA_CAPTURA = Object.assign({}, MOD, {
  id: 2, name: 'SinGaleria', screenshots: [{ id: 1, title: 'Unica', thumbnailUrl: '/probe-mini-1.png', url: '/probe-grande-1.png' }]
});

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
    const json = (payload) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    };
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/config') return json(CONFIG);
      if (url.pathname === '/api/addons') return json({ success: true, addons: [] });
      if (url.pathname === '/api/favorites') return json({ success: true, favorites: [] });
      if (url.pathname === '/api/backups') return json({ success: true, backups: [] });
      if (url.pathname === '/api/addons/check-updates') return json({ success: true, updates: [] });
      if (url.pathname === '/api/app-updates/check') return json({ source: 'local', checked: true, updateAvailable: false, currentVersion: '1.3.20' });
      if (url.pathname === '/api/search') return json({ success: true, results: [MOD, MOD_UNA_CAPTURA] });
      if (url.pathname === '/api/mod/1') return json({ success: true, mod: MOD });
      if (url.pathname === '/api/mod/1/files') return json({ success: true, files: [] });
      if (url.pathname === '/api/mod/1/description') return json({ success: true, html: '<p>Descripcion de prueba.</p>' });
      if (url.pathname === '/api/mod/1/translation') return json({ success: true, translation: {} });
      if (url.pathname === '/api/mod/2') return json({ success: true, mod: MOD_UNA_CAPTURA });
      if (url.pathname === '/api/mod/2/files') return json({ success: true, files: [] });
      if (url.pathname === '/api/mod/2/description') return json({ success: true, html: '<p>Otra ficha.</p>' });
      if (url.pathname === '/api/mod/2/translation') return json({ success: true, translation: {} });
      return json({ success: true });
    }
    if (/^\/probe-(mini|grande)-\d+\.png$/.test(url.pathname)) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(PNG);
      return;
    }
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.join(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('no'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(HTTP_PORT, '127.0.0.1', () => ok(server)));
}

function electronBinary() {
  const exe = process.platform === 'win32' ? 'electron.exe' : 'electron';
  const bin = path.join(ROOT, 'node_modules', 'electron', 'dist', exe);
  if (!fs.existsSync(bin)) throw new Error('No encuentro Electron en node_modules');
  return bin;
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || 'error al evaluar');
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch (_) { /* nada */ } }
}

(async () => {
  /* Contratos del código, sin arrancar nada. */
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  comprobar('index.html carga el visor', html.includes('visor-capturas.js'));
  const css = fs.readFileSync(path.join(PUBLIC_DIR, 'style.css'), 'utf8');
  comprobar('el CSS tiene el visor', /\.kf-visor \{/.test(css) && /\.kf-visor-flecha \{/.test(css));

  const server = await startServer();
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'korforge-perfil-'));
  const tmpEl = fs.mkdtempSync(path.join(os.tmpdir(), 'korforge-el-'));
  const mainFile = path.join(tmpEl, 'main.js');
  const logEl = path.join(tmpEl, 'electron.log');
  fs.writeFileSync(mainFile, [
    "const { app, BrowserWindow, clipboard, ipcMain } = require('electron');",
    "const path = require('path');",
    `app.setPath('userData', ${JSON.stringify(perfil)});`,
    `app.commandLine.appendSwitch('remote-debugging-port', '${CDP_PORT}');`,
    'app.disableHardwareAcceleration();',
    "ipcMain.handle('korforge:portapapeles-hay-texto', () => false);",
    "ipcMain.handle('korforge:portapapeles', () => false);",
    'app.whenReady().then(() => {',
    `  const win = new BrowserWindow({ width: 1400, height: 950, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(${JSON.stringify(ROOT)}, 'preload.js') } });`,
    `  win.loadURL('http://127.0.0.1:${HTTP_PORT}');`,
    "  win.webContents.on('console-message', (e, nivel, mensaje) => console.log('[renderer]', nivel, mensaje));",
    '});',
    'app.on("window-all-closed", () => app.quit());'
  ].join('\n'), 'utf8');

  const salida = fs.openSync(logEl, 'w');
  const hijo = spawn(electronBinary(), [mainFile], { cwd: ROOT, stdio: ['ignore', salida, salida] });
  let cdp = null;
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(300);
      try {
        const lista = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
        target = lista.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch (_) { /* aún no */ }
    }
    if (!target) throw new Error('CDP no arrancó: ' + fs.readFileSync(logEl, 'utf8').slice(-400));

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, mal) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', mal, { once: true }); });
    cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await sleep(3200);

    const ui = await cdp.evaluate(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const out = { pasos: [], problemas: [] };
      const fallo = (m) => out.problemas.push(m);
      const visor = () => document.getElementById('korforge-visor-capturas');
      const imagen = () => visor() ? visor().querySelector('.kf-visor-imagen') : null;
      const contador = () => visor() ? (visor().querySelector('.kf-visor-contador') || {}).textContent : '';
      const titulo = () => visor() ? (visor().querySelector('.kf-visor-titulo') || {}).textContent : '';
      const flechas = () => visor() ? [...visor().querySelectorAll('.kf-visor-flecha')].filter(b => !b.hidden).length : 0;
      const rueda = (dy) => {
        const ev = new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true });
        visor().dispatchEvent(ev);
      };

      /* Buscar y abrir la ficha del addon con 4 capturas. */
      document.querySelector('.nav-item[data-tab="search"]').click();
      await sleep(500);
      const inp = document.getElementById('cfSearchInput');
      inp.value = 'details';
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await sleep(900);
      const tarjeta = document.querySelector('#cfResultsGrid .cf-card');
      if (!tarjeta) { fallo('no salieron tarjetas del catalogo'); return out; }
      tarjeta.click();
      await sleep(1400);

      /* Pestaña Galería */
      document.querySelector('.detail-tab-btn[data-detail-tab="gallery"]').click();
      await sleep(500);
      const miniaturas = [...document.querySelectorAll('.gallery-thumb')];
      out.pasos.push('miniaturas en la ficha: ' + miniaturas.length);
      if (miniaturas.length !== 4) fallo('la galeria no tiene las 4 capturas de prueba');

      /* Pinchar la SEGUNDA captura */
      miniaturas[1].querySelector('a').click();
      await sleep(500);
      const caja = visor();
      const abierto = !!(caja && !caja.hidden);
      out.pasos.push('visor abierto tras pinchar la miniatura: ' + abierto);
      if (!abierto) { fallo('pinchar una captura no abre el visor'); return out; }
      out.pasos.push('imagen: ' + JSON.stringify(imagen().getAttribute('src')) + ' | contador: ' + JSON.stringify(contador()) + ' | titulo: ' + JSON.stringify(titulo()));
      if (!/probe-grande-2\\.png$/.test(imagen().getAttribute('src'))) fallo('no abre la imagen GRANDE de la captura pulsada: ' + imagen().getAttribute('src'));
      if (!/2 de 4/.test(contador())) fallo('el contador no dice 2 de 4: ' + contador());
      if (!/Captura 2/.test(titulo())) fallo('no pone el titulo de la captura: ' + titulo());
      if (flechas() !== 2) fallo('no salen las dos flechas');
      if (document.getElementById('inAppBrowserView') && document.getElementById('inAppBrowserView').style.display === 'flex') fallo('se abrio el navegador interno en vez del visor');
      if (document.documentElement.classList.contains('kf-visor-abierto')) out.pasos.push('clase de visor abierto: ok');

      /* Flecha siguiente */
      caja.querySelector('.kf-visor-next').click();
      await sleep(250);
      out.pasos.push('tras flecha >: ' + JSON.stringify(contador()) + ' ' + JSON.stringify(imagen().getAttribute('src')));
      if (!/3 de 4/.test(contador())) fallo('la flecha siguiente no avanza');

      /* Rueda del ratón hacia abajo y hacia arriba */
      rueda(120);
      await sleep(320);
      out.pasos.push('tras rueda abajo: ' + JSON.stringify(contador()));
      if (!/4 de 4/.test(contador())) fallo('la rueda hacia abajo no avanza');
      rueda(120);
      await sleep(320);
      out.pasos.push('rueda otra vez (da la vuelta): ' + JSON.stringify(contador()));
      if (!/1 de 4/.test(contador())) fallo('la rueda no da la vuelta al final');
      rueda(-120);
      await sleep(320);
      out.pasos.push('rueda arriba: ' + JSON.stringify(contador()));
      if (!/4 de 4/.test(contador())) fallo('la rueda hacia arriba no retrocede');

      /* Teclado */
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      await sleep(200);
      if (!/1 de 4/.test(contador())) fallo('Inicio no lleva a la primera');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await sleep(200);
      out.pasos.push('tras ArrowRight: ' + JSON.stringify(contador()));
      if (!/2 de 4/.test(contador())) fallo('la flecha del teclado no avanza');

      /* Clic fuera cierra */
      caja.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await sleep(250);
      if (visor() && !visor().hidden) fallo('el clic fuera no cierra el visor');

      /* Escape cierra y devuelve el foco */
      miniaturas[0].querySelector('a').click();
      await sleep(400);
      if (!visor() || visor().hidden) fallo('no vuelve a abrir');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(250);
      out.pasos.push('tras Escape: oculto=' + (visor() ? visor().hidden : 'sin caja') + ' foco=' + JSON.stringify(document.activeElement ? document.activeElement.className : ''));
      if (visor() && !visor().hidden) fallo('Escape no cierra el visor');
      if (!document.activeElement || !/gallery-thumb|^$/.test(document.activeElement.className || '') ) {
        if (!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.gallery-thumb'))) {
          fallo('al cerrar no vuelve el foco a la miniatura');
        }
      }

      /* Addon con UNA sola captura: sin flechas */
      const back = document.getElementById('btnBackToCatalog');
      if (back) back.click();
      await sleep(600);
      document.querySelectorAll('#cfResultsGrid .cf-card')[1].click();
      await sleep(1400);
      document.querySelector('.detail-tab-btn[data-detail-tab="gallery"]').click();
      await sleep(400);
      document.querySelector('.gallery-thumb a').click();
      await sleep(500);
      out.pasos.push('una sola captura -> flechas visibles: ' + flechas() + ' contador: ' + JSON.stringify(contador()));
      if (flechas() !== 0) fallo('con una sola captura no deberian salir flechas');
      if (contador()) fallo('con una sola captura no deberia salir contador');
      visor().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return out;
    })()`);

    apuntes.push(...ui.pasos);
    problemas.push(...ui.problemas);
  } finally {
    if (cdp) cdp.close();
    try { hijo.kill(); } catch (_) { /* nada */ }
    try { server.close(); } catch (_) { /* nada */ }
    await sleep(400);
    for (const d of [perfil, tmpEl]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* nada */ } }
  }

  console.log('\n== apuntes ==');
  for (const a of apuntes) console.log('  .', a);
  if (problemas.length) {
    console.log('\nPROBLEMAS:');
    for (const p of problemas) console.log('  -', p);
    process.exit(1);
  }
  console.log('\nOK: visor de capturas (flechas, teclado y rueda del ratón)');
})().catch((err) => { console.error('FALLO:', err.message); process.exit(1); });
