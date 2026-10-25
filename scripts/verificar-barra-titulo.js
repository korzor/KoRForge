#!/usr/bin/env node
/**
 * Sonda de la barra superior como barra de título de Windows (dueño, 25-10-2026):
 *   - doble clic en una zona que NO es botón → maximiza / restaura;
 *   - apretar con el botón izquierdo en una zona que NO es botón y arrastrar → la ventana se mueve;
 *   - pinchar un botón (píldora de juego) → no arrastra nada.
 *
 * CÓMO: servidor de pruebas con public/ + Electron sin marco (como la app). El proceso principal de la
 * prueba cuenta los avisos que llegan por IPC (`korforge:arrastre-*` y `window-maximize`) y los deja en
 * un fichero; la sonda los lee. Los clics se lanzan de verdad con CDP (`Input.dispatchMouseEvent`).
 *
 * Uso: node scripts/verificar-barra-titulo.js
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const HTTP_PORT = 4001;
const CDP_PORT = 9361;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const apuntes = [];
const problemas = [];
const comprobar = (nombre, condicion, detalle = '') => {
  apuntes.push((condicion ? 'OK   ' : 'FALLO ') + nombre + (!condicion && detalle ? ' -> ' + detalle : ''));
  if (!condicion) problemas.push(nombre + (detalle ? ' -> ' + detalle : ''));
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };

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
      if (url.pathname === '/api/search') return json({ success: true, results: [] });
      if (url.pathname === '/api/backups') return json({ success: true, backups: [] });
      if (url.pathname === '/api/addons/check-updates') return json({ success: true, updates: [] });
      if (url.pathname === '/api/app-updates/check') return json({ source: 'local', checked: true, updateAvailable: false, currentVersion: '1.4.1' });
      return json({ success: true });
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
  /* Contratos del código. */
  const mainJs = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  comprobar('main.js escucha korforge:arrastre-inicio', mainJs.includes("ipcMain.on('korforge:arrastre-inicio'"));
  comprobar('main.js mueve la ventana en korforge:arrastre-mover', mainJs.includes("ipcMain.on('korforge:arrastre-mover'") && mainJs.includes('win.setPosition'));
  const preload = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
  comprobar('preload expone moverVentana', preload.includes('moverVentana') && preload.includes('arrastre-inicio'));
  const css = fs.readFileSync(path.join(PUBLIC_DIR, 'style.css'), 'utf8');
  comprobar('el desplegable no lleva cuadro de foco (CSS)', /select:focus[^{]*\{[^}]*outline:\s*none/.test(css) && /:focus-visible:not\(input\):not\(textarea\):not\(select\)/.test(css));

  const server = await startServer();
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'korforge-perfil-'));
  const tmpEl = fs.mkdtempSync(path.join(os.tmpdir(), 'korforge-el-'));
  const mainFile = path.join(tmpEl, 'main.js');
  const logEl = path.join(tmpEl, 'electron.log');
  const contadores = path.join(tmpEl, 'contadores.json');
  fs.writeFileSync(contadores, JSON.stringify({ inicios: 0, movimientos: 0, fines: 0, maximizados: 0 }));

  fs.writeFileSync(mainFile, [
    "const { app, BrowserWindow, ipcMain, clipboard } = require('electron');",
    "const fs = require('fs');",
    "const path = require('path');",
    `app.setPath('userData', ${JSON.stringify(perfil)});`,
    `app.commandLine.appendSwitch('remote-debugging-port', '${CDP_PORT}');`,
    'app.disableHardwareAcceleration();',
    `const contadores = ${JSON.stringify(contadores)};`,
    'const c = { inicios: 0, movimientos: 0, fines: 0, maximizados: 0 };',
    "const apuntar = () => { try { fs.writeFileSync(contadores, JSON.stringify(c)); } catch (_) {} };",
    "ipcMain.on('korforge:arrastre-inicio', () => { c.inicios += 1; apuntar(); });",
    "ipcMain.on('korforge:arrastre-mover', () => { c.movimientos += 1; apuntar(); });",
    "ipcMain.on('korforge:arrastre-fin', () => { c.fines += 1; apuntar(); });",
    "ipcMain.on('window-maximize', () => { c.maximizados += 1; apuntar(); });",
    "ipcMain.handle('korforge:portapapeles-hay-texto', () => false);",
    "ipcMain.handle('korforge:portapapeles', () => false);",
    'app.whenReady().then(() => {',
    `  const win = new BrowserWindow({ width: 1200, height: 820, show: false, frame: false, transparent: false, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(${JSON.stringify(ROOT)}, 'preload.js') } });`,
    `  win.loadURL('http://127.0.0.1:${HTTP_PORT}');`,
    "  win.webContents.on('console-message', (e, nivel, mensaje) => console.log('[renderer]', nivel, mensaje));",
    '});',
    'app.on("window-all-closed", () => app.quit());'
  ].join('\n'), 'utf8');

  const salida = fs.openSync(logEl, 'w');
  const hijo = spawn(electronBinary(), [mainFile], { cwd: ROOT, stdio: ['ignore', salida, salida] });
  let cdp = null;
  const leer = () => { try { return JSON.parse(fs.readFileSync(contadores, 'utf8')); } catch (_) { return { inicios: 0, movimientos: 0, fines: 0, maximizados: 0 }; } };

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

    /* Coordenadas: una franja vacía de la barra superior (a la derecha de las píldoras, antes de los
       botones de ventana) y el primer botón de juego. */
    const puntos = await cdp.evaluate(`(() => {
      const barraEl = document.querySelector('.app-topbar');
      const barra = barraEl.getBoundingClientRect();
      const pill = document.querySelector('.game-version-pill').getBoundingClientRect();
      const y = Math.round(barra.top + barra.height / 2);
      /* Buscamos un punto donde el elemento de arriba sea la propia barra (zona vacía de verdad). */
      let huecoX = null;
      for (let x = Math.round(barra.left) + 2; x < Math.round(barra.right) - 2; x += 6) {
        if (document.elementFromPoint(x, y) === barraEl) { huecoX = x; break; }
      }
      return JSON.stringify({ hueco: huecoX === null ? null : { x: huecoX, y }, pill: { x: Math.round(pill.left + pill.width / 2), y: Math.round(pill.top + pill.height / 2) } });
    })()`);
    const p = JSON.parse(puntos);
    if (!p.hueco) { problemas.push('no encuentro una zona vacía en la barra superior'); }
    comprobar('hay una zona vacía en la barra para arrastrar', !!p.hueco, JSON.stringify(p));
    if (!p.hueco) { console.log('sin zona vacía'); process.exitCode = 1; return; }
    apuntes.push('punto de arrastre (zona vacía): ' + JSON.stringify(p.hueco) + ' | píldora: ' + JSON.stringify(p.pill));

    const raton = async (tipo, x, y, extra = {}) => {
      await cdp.send('Input.dispatchMouseEvent', Object.assign({ type: tipo, x, y, button: tipo === 'mouseMoved' ? 'none' : 'left', buttons: tipo === 'mouseReleased' ? 0 : 1, clickCount: 1 }, extra));
    };

    /* 1. Arrastre: apretar en la zona vacía, mover y soltar. */
    await raton('mousePressed', p.hueco.x, p.hueco.y);
    await sleep(80);
    for (let i = 1; i <= 4; i++) { await raton('mouseMoved', p.hueco.x + i * 10, p.hueco.y + i * 5); await sleep(40); }
    await raton('mouseReleased', p.hueco.x + 40, p.hueco.y + 20);
    await sleep(400);
    const trasArrastre = leer();
    apuntes.push('tras arrastrar: ' + JSON.stringify(trasArrastre));
    comprobar('arrastrar en zona vacía avisa al proceso principal', trasArrastre.inicios >= 1 && trasArrastre.movimientos >= 1, JSON.stringify(trasArrastre));
    comprobar('al soltar se termina el arrastre', trasArrastre.fines >= 1);

    /* 2. Doble clic en la misma zona vacía → maximizar / restaurar. */
    await cdp.evaluate('window.__dbl = 0; document.querySelector(".app-topbar").addEventListener("dblclick", () => { window.__dbl += 1; });');
    const antesDoble = leer().maximizados;
    await raton('mousePressed', p.hueco.x, p.hueco.y);
    await raton('mouseReleased', p.hueco.x, p.hueco.y);
    await raton('mousePressed', p.hueco.x, p.hueco.y, { clickCount: 2 });
    await raton('mouseReleased', p.hueco.x, p.hueco.y, { clickCount: 2 });
    await sleep(400);
    const trasDoble = leer();
    const dblEnPagina = await cdp.evaluate('window.__dbl');
    apuntes.push('dblclick que llegó a la página: ' + dblEnPagina);
    apuntes.push('tras doble clic: maximizados=' + trasDoble.maximizados + ' (antes ' + antesDoble + ')');
    comprobar('doble clic maximiza la ventana (un solo aviso)', trasDoble.maximizados - antesDoble === 1, 'avisos: ' + (trasDoble.maximizados - antesDoble));

    /* 3. Pinchar una píldora de juego NO arrastra. */
    const antesPill = leer().inicios;
    await raton('mousePressed', p.pill.x, p.pill.y);
    await raton('mouseMoved', p.pill.x + 30, p.pill.y + 10);
    await raton('mouseReleased', p.pill.x + 30, p.pill.y + 10);
    await sleep(300);
    const trasPill = leer();
    apuntes.push('tras pinchar la píldora: inicios=' + trasPill.inicios + ' (antes ' + antesPill + ')');
    comprobar('pinchar un botón no arrastra la ventana', trasPill.inicios === antesPill);
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
  console.log('\nOK: la barra superior se comporta como la barra de título (arrastrar y doble clic)');
})().catch((err) => { console.error('FALLO:', err.message); process.exit(1); });
