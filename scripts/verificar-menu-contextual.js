#!/usr/bin/env node
/**
 * Sonda del menú contextual y del foco de los campos (dueño, 24-10-2026).
 * Servidor de pruebas con public/ y datos falsos + Electron con CDP y PERFIL TEMPORAL PROPIO
 * (nunca el de la app instalada). Uso: node scripts/verificar-menu-contextual.js
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const HTTP_PORT = 3973;
const CDP_PORT = 9339;
const NOW = new Date().toISOString();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CONFIG = {
  success: true, activeGame: 'forever', language: 'es', closeToTray: true,
  rootWoWDir: 'C:\\WoW', wowDir: 'C:\\WoW\\_forever_',
  games: {
    forever: { id: '88568', name: 'WoW Forever', subtitle: 'x', subfolder: '_forever_', path: 'C:\\WoW\\_forever_', icon: 'A', addonsExists: true, folderExists: true },
    retail: { id: '517', name: 'WoW Retail', subtitle: 'x', subfolder: '_retail_', path: '', icon: 'B', addonsExists: false, folderExists: false },
    classic_era: { id: '67408', name: 'Classic Era', subtitle: 'x', subfolder: '_classic_era_', path: '', icon: 'C', addonsExists: false, folderExists: false },
    classic: { id: '79434', name: 'Classic Prog', subtitle: 'x', subfolder: '_classic_', path: '', icon: 'D', addonsExists: false, folderExists: true },
  },
};

const ADDON = { folderName: 'Details', actualName: 'Details', title: 'Details', version: '1.2.3', enabled: true, notes: '', modId: 1, hasMissingDeps: false, compatibility: null, missingDependencies: [], dependencies: [] };

function startStaticServer() {
  global.__buscadas = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
    const json = (payload) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    };
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/config') return json(CONFIG);
      if (url.pathname === '/api/addons') return json({ success: true, addons: [ADDON] });
      if (url.pathname === '/api/__buscadas') return json({ buscadas: global.__buscadas || 0 });
      if (url.pathname === '/api/search') { global.__buscadas = (global.__buscadas || 0) + 1; return json({ success: true, results: [] }); }
      if (url.pathname === '/api/favorites') return json({ success: true, favorites: [] });
      if (url.pathname === '/api/backups') return json({ success: true, backups: [] });
      if (url.pathname === '/api/mod/1') return json({ success: true, mod: { id: 1, name: 'Details', author: 'x', summary: 'Resumen de prueba', downloadCount: 1, dateModified: NOW, dateCreated: NOW, version: '1.2.3', iconUrl: '', screenshots: [] } });
      if (url.pathname === '/api/mod/1/files') return json({ success: true, files: [] });
      if (url.pathname === '/api/mod/1/description') return json({ success: true, html: '<p>Descripcion de prueba para copiar con el raton.</p>' });
      if (url.pathname === '/api/mod/1/translation') return json({ success: true, translation: {} });
      if (url.pathname === '/api/app-updates/check') return json({ source: 'local', checked: true, updateAvailable: false, currentVersion: '1.3.16' });
      if (url.pathname === '/api/addons/check-updates') return json({ success: true, updates: [] });
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
  const c = path.join(ROOT, 'node_modules', 'electron', 'dist', exe);
  if (!fs.existsSync(c)) throw new Error('No encuentro Electron');
  return c;
}

function startElectron() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'korforge-sonda-'));
  const perfilDir = fs.mkdtempSync(path.join(os.tmpdir(), 'korforge-perfil-'));
  const mainFile = path.join(tmpDir, 'main.js');
  const logSalida = path.join(tmpDir, 'electron.log');

  const codigo = [
    "const { app, BrowserWindow, ipcMain, clipboard } = require('electron');",
    "const path = require('path');",
    `app.setPath('userData', ${JSON.stringify(perfilDir)});`,
    `app.commandLine.appendSwitch('remote-debugging-port', '${CDP_PORT}');`,
    'app.disableHardwareAcceleration();',
    "const ACCIONES = { cortar: 'cut', copiar: 'copy', pegar: 'paste', seleccionarTodo: 'selectAll' };",
    "ipcMain.handle('korforge:portapapeles', (evento, accion) => {",
    "  const metodo = ACCIONES[String(accion || '')];",
    '  if (!metodo) return false;',
    "  try { const wc = evento.sender; if (typeof wc[metodo] !== 'function') return false; wc[metodo](); return true; } catch (_) { return false; }",
    '});',
    "ipcMain.handle('korforge:portapapeles-hay-texto', () => { try { return String(clipboard.readText() || '').length > 0; } catch (_) { return false; } });",
    'app.whenReady().then(() => {',
    '  console.log("whenReady");',
    `  const win = new BrowserWindow({ width: 1280, height: 860, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(${JSON.stringify(ROOT)}, 'preload.js') } });`,
    `  win.loadURL('http://127.0.0.1:${HTTP_PORT}');`,
    "  win.webContents.on('did-fail-load', (e, c, d) => console.log('did-fail-load', c, d));",
    "  win.webContents.on('console-message', (e, nivel, mensaje) => console.log('[renderer]', nivel, mensaje));",
    '});',
    'app.on("window-all-closed", () => app.quit());',
  ].join('\n');

  fs.writeFileSync(mainFile, codigo, 'utf8');
  const salida = fs.openSync(logSalida, 'w');
  const child = spawn(electronBinary(), [mainFile], { cwd: ROOT, stdio: ['ignore', salida, salida] });
  return { child, tmpDir, perfilDir, logSalida };
}

async function primerTarget(logSalida) {
  for (let i = 0; i < 60; i++) {
    await sleep(300);
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const lista = await res.json();
      const pagina = lista.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pagina) return pagina;
    } catch (_) { /* aun no */ }
  }
  const detalle = fs.existsSync(logSalida) ? fs.readFileSync(logSalida, 'utf8').slice(-900) : '(sin log)';
  throw new Error('CDP no arranco. Electron dijo:\n' + detalle);
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
  const problemas = [];
  const apuntes = [];

  const mainJs = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  for (const clave of ['korforge:portapapeles', 'korforge:portapapeles-hay-texto']) {
    if (!mainJs.includes(clave)) problemas.push('main.js no registra ' + clave);
  }
  if (!/, clipboard }/.test(mainJs)) problemas.push('main.js no importa clipboard');
  apuntes.push('contrato main.js: ' + (problemas.length ? 'FALLA' : 'ok'));

  /* Contrato del CSS: la ficha del addon tiene que permitir seleccionar texto (si no, no hay nada
     que copiar). Y el menú, en cambio, no. */
  const css = fs.readFileSync(path.join(PUBLIC_DIR, 'style.css'), 'utf8');
  if (!/#detailTabDesc[\s\S]{0,400}user-select: text/.test(css) && !/user-select: text[\s\S]{0,400}#detailTabDesc/.test(css)) {
    problemas.push('el CSS no permite seleccionar texto en #detailTabDesc (la ficha del addon)');
  }
  if (!/\.kf-menu-contextual[\s\S]{0,120}user-select: none/.test(css)) {
    problemas.push('el CSS no desactiva la selección dentro del menú');
  }
  apuntes.push('contrato del CSS: ' + (problemas.length ? 'revisar' : 'ok'));

  const server = await startStaticServer();
  const { child, tmpDir, perfilDir, logSalida } = startElectron();
  let cdp = null;
  try {
    const target = await primerTarget(logSalida);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, mal) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', mal, { once: true }); });
    cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__buscadasSonda = 0;' });
    await sleep(3000);

    /* La app arranca en otra pestaña: hay que entrar en «Mis Addons» para que el buscador se vea
       (un input oculto no coge el foco, y sin foco el portapapeles no tiene dónde actuar). */
    const entrar = await cdp.evaluate(`(async () => {
      const boton = document.querySelector('.nav-item[data-tab="search"]');
      if (!boton) return 'no hay boton de addons';
      boton.click();
      await new Promise(r => setTimeout(r, 1200));
      const inp = document.getElementById('cfSearchInput');
      return JSON.stringify({ visible: !!(inp && inp.offsetParent !== null), pane: !!document.querySelector('#pane-addons') });
    })()`);
    apuntes.push('entrada a Mis Addons: ' + entrar);

    const foco = await cdp.evaluate(`(async () => {
      const inp = document.getElementById('cfSearchInput');
      if (!inp) return { error: 'no hay #cfSearchInput' };
      inp.focus();
      await new Promise(r => setTimeout(r, 150));
      const st = getComputedStyle(inp);
      const caja = inp.closest('.search-box');
      const stCaja = caja ? getComputedStyle(caja) : null;
      return { outlineStyle: st.outlineStyle, outlineWidth: st.outlineWidth, cajaBorde: stCaja ? stCaja.borderTopColor : null, activo: document.activeElement === inp };
    })()`);
    apuntes.push('foco del buscador: ' + JSON.stringify(foco));
    if (foco.error) problemas.push(foco.error);
    if (foco.outlineStyle !== 'none') problemas.push('el campo sigue con recuadro (outline ' + foco.outlineStyle + ')');
    if (!foco.activo) problemas.push('el buscador no cogio el foco');

    const menu = await cdp.evaluate(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const out = { pasos: [], problemas: [] };
      const inp = document.getElementById('cfSearchInput');
      const caja = () => document.getElementById('korforge-menu-contextual');
      const abrir = async (el) => {
        const r = el.getBoundingClientRect();
        el.focus();
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: Math.round(r.left + 25), clientY: Math.round(r.top + 14) }));
        await sleep(300);
      };
      const etiquetas = () => [...document.querySelectorAll('#korforge-menu-contextual .kf-menu-item')].map(b => ({ t: b.querySelector('.kf-menu-etiqueta').textContent, apagado: b.disabled }));
      const pulsar = (texto) => {
        const b = [...document.querySelectorAll('#korforge-menu-contextual .kf-menu-item')].find(x => x.querySelector('.kf-menu-etiqueta').textContent === texto);
        if (!b) return false;
        b.click();
        return true;
      };

      inp.value = 'hola mundo';
      inp.focus();
      inp.setSelectionRange(0, 0);
      await abrir(inp);
      if (!caja() || caja().hidden) out.problemas.push('el menu no se abrio en el buscador');
      const sinSel = etiquetas();
      out.pasos.push('sin seleccion: ' + JSON.stringify(sinSel.map(e => e.t + (e.apagado ? '(apagado)' : ''))));
      const cortar = sinSel.find(e => /Cortar/i.test(e.t));
      const copiar = sinSel.find(e => /Copiar/i.test(e.t));
      if (!cortar || !copiar) out.problemas.push('faltan Cortar/Copiar');
      else if (!cortar.apagado || !copiar.apagado) out.problemas.push('sin seleccion, Cortar y Copiar deben estar apagados');
      if (!sinSel.some(e => /Pegar y buscar/i.test(e.t))) out.problemas.push('falta Pegar y buscar en un buscador');

      inp.setSelectionRange(0, 4);
      await abrir(inp);
      const conSel = etiquetas();
      out.pasos.push('con seleccion: ' + JSON.stringify(conSel.map(e => e.t + (e.apagado ? '(apagado)' : ''))));
      const c2 = conSel.find(e => /Copiar/i.test(e.t));
      if (!c2 || c2.apagado) out.problemas.push('con texto seleccionado, Copiar debe estar encendido');

      if (!pulsar('Copiar')) out.problemas.push('no pude pulsar Copiar');
      await sleep(350);
      inp.value = '';
      await abrir(inp);
      if (!pulsar('Pegar')) out.problemas.push('no pude pulsar Pegar');
      await sleep(450);
      out.pasos.push('tras copiar+pegar: ' + JSON.stringify(inp.value));
      if (inp.value !== 'hola') out.problemas.push('copiar y pegar no devolvio el texto: ' + JSON.stringify(inp.value));

      /* «Pegar y buscar»: además de pegar, tiene que buscar (dueño, 25-10-2026). */
      inp.value = '';
      inp.focus();
      inp.setSelectionRange(0, 0);
      document.body.dataset.tab = 'search';
      const buscadasAntes = (await (await fetch('/api/__buscadas')).json()).buscadas;
      await abrir(inp);
      if (!pulsar('Pegar y buscar')) out.problemas.push('no pude pulsar Pegar y buscar');
      await sleep(1200);
      const buscadasDespues = (await (await fetch('/api/__buscadas')).json()).buscadas;
      out.pasos.push('tras pegar y buscar: valor=' + JSON.stringify(inp.value) + ' | busquedas al servidor: ' + buscadasAntes + ' -> ' + buscadasDespues);
      if (inp.value !== 'hola') out.problemas.push('pegar y buscar no pego el texto: ' + JSON.stringify(inp.value));
      if (!(buscadasDespues > buscadasAntes)) out.problemas.push('pegar y buscar no lanzo la busqueda');

      await abrir(inp);
      const abiertoAntes = !!caja() && !caja().hidden;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(200);
      const abiertoDespues = !!caja() && !caja().hidden;
      out.pasos.push('escape: antes=' + abiertoAntes + ' despues=' + abiertoDespues);
      if (!abiertoAntes || abiertoDespues) out.problemas.push('Escape no cerro el menu');

      const zona = document.querySelector('.tab-pane.active') || document.querySelector('.app-content') || document.body;
      const parrafo = document.createElement('p');
      parrafo.id = 'texto-de-prueba';
      /* En la app el texto de la ficha es seleccionable desde el cambio del 24-10; aquí se fuerza
         para probar el MENÚ sin depender de qué zona esté abierta. */
      parrafo.style.userSelect = 'text';
      parrafo.textContent = 'Texto de una ficha de solo lectura.';
      zona.appendChild(parrafo);
      const rango = document.createRange();
      rango.selectNodeContents(parrafo);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(rango);
      const r = parrafo.getBoundingClientRect();
      const diag = {
        seleccion: (window.getSelection() ? String(window.getSelection()).slice(0, 40) : '(sin objeto selection)'),
        entradasDirectas: (window.KorforgeMenuContextual && window.KorforgeMenuContextual.entradasPara)
          ? window.KorforgeMenuContextual.entradasPara(parrafo).map(e => e.nombre || 'sep')
          : '(no expuesto)',
        rect: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) },
      };
      out.pasos.push('diagnostico solo lectura: ' + JSON.stringify(diag));
      parrafo.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: Math.round(r.left + 6), clientY: Math.round(r.top + 6) }));
      await sleep(300);
      const soloLectura = etiquetas();
      out.pasos.push('solo lectura: ' + JSON.stringify(soloLectura.map(e => e.t)));
      if (!soloLectura.length) out.problemas.push('en solo lectura no salio menu con texto seleccionado');
      if (soloLectura.some(e => /Cortar|Pegar/i.test(e.t))) out.problemas.push('en solo lectura no debe haber Cortar ni Pegar');
      if (!soloLectura.some(e => /Copiar/i.test(e.t))) out.problemas.push('en solo lectura falta Copiar');
      sel.removeAllRanges();
      parrafo.remove();
      return out;
    })()`);

    apuntes.push(...menu.pasos);
    problemas.push(...menu.problemas);
  } finally {
    if (cdp) cdp.close();
    try { child.kill(); } catch (_) { /* nada */ }
    try { server.close(); } catch (_) { /* nada */ }
    await sleep(500);
    for (const d of [tmpDir, perfilDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* nada */ } }
  }

  console.log('\n== apuntes ==');
  for (const a of apuntes) console.log('  .', a);
  if (problemas.length) {
    console.log('\nPROBLEMAS:');
    for (const p of problemas) console.log('  -', p);
    process.exit(1);
  }
  console.log('\nOK: menu contextual y foco, todo correcto');
})().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
