#!/usr/bin/env node
/**
 * Sonda de las NOVEDADES en la ventana de actualización (dueño, 24-10-2026 de noche).
 *
 * POR QUÉ EXISTE: el dueño se encontró la ventana de actualización sin los cambios («no salen los
 * cambios que hemos hecho en la última versión»). La causa era que las releases se publicaban con el
 * cuerpo VACÍO (decisión anterior del mismo día) y el servidor devuelve `release.body` tal cual; sin
 * cuerpo, la ventana pinta el texto genérico. Además GitHub enseñaba en su lugar el README del repo
 * (eso de «KoRForge - repositorio de descargas»).
 *
 * QUE COMPRUEBA
 *   1. El generador del cuerpo (`scripts/notas-release.js` → `cuerpoRelease`) saca los cambios de
 *      docs/CAMBIOS-ULTIMA.md, sin bloques de código ni separadores que la ventana no sabe pintar.
 *   2. La ventana de la app, de verdad: con esos mismos datos servidos por un servidor de pruebas,
 *      el modal de actualización pinta una lista con los cambios, el apartado de archivos, y no pinta
 *      ni el README ni el texto genérico.
 *
 * Uso: node scripts/verificar-notas-actualizador.js
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const HTTP_PORT = 3981;
const CDP_PORT = 9345;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const apuntes = [];
const problemas = [];
const comprobar = (nombre, condicion, detalle = '') => {
  apuntes.push((condicion ? 'OK   ' : 'FALLO ') + nombre + (!condicion && detalle ? ' -> ' + detalle : ''));
  if (!condicion) problemas.push(nombre + (detalle ? ' -> ' + detalle : ''));
};

const { leerCambios, cuerpoRelease } = require(path.join(ROOT, 'scripts', 'notas-release'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };

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

function startServer(notas) {
  /* La PRIMERA consulta (la del arranque de la app) contesta con notas VIEJAS a propósito: reproduce
     el caso del dueño (la release se publicó después de abrir la app y la ventana seguía sin
     novedades). La ventana, al abrirse, tiene que volver a preguntar y pintar las notas buenas. */
  let llamadas = 0;
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
      if (url.pathname === '/api/__llamadas') return json({ llamadas });
      if (url.pathname === '/api/app-updates/check') {
        llamadas += 1;
        return json({
          source: 'github', checked: true, updateAvailable: true,
          currentVersion: '1.3.18', remoteVersion: '1.3.19',
          downloadUrl: 'https://github.com/korzor/KoRForge/releases/download/v1.3.19/KoRForge-1.3.19-Windows.exe',
          releaseNotes: llamadas === 1 ? 'Nueva versión de KoRForge' : notas,
          date: '2026-10-24'
        });
      }
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
  /* ---------------- 1. El generador del cuerpo ---------------- */
  const { version, titulo, cambios } = leerCambios(ROOT);
  const notas = cuerpoRelease({
    titulo,
    cambios,
    archivos: [
      { nombre: `KoRForge-${version}-Windows.exe`, bytes: 119537664, detalle: 'Instalador para Windows (recomendado)' },
      { nombre: `KoRForge-${version}-Linux.AppImage`, bytes: 124780544, detalle: 'Linux x86_64, sin instalación' }
    ]
  });

  comprobar('el cuerpo empieza por el titulo de la version', notas.startsWith('## KoRForge v' + version), JSON.stringify(notas.split('\n')[0]));
  comprobar('lleva los cambios de docs/CAMBIOS-ULTIMA.md', cambios.length > 0 && cambios.every((c) => notas.includes(c)), 'cambios: ' + cambios.length);
  comprobar('lleva la lista de archivos', /### Archivos de esta versión/.test(notas) && notas.includes(`KoRForge-${version}-Windows.exe`));
  comprobar('sin bloques de codigo (la ventana no los pinta)', !notas.includes('```'));
  comprobar('sin separadores --- (se verian como texto suelto)', !/^---$/m.test(notas));
  comprobar('no lleva el texto del README del repo', !/repositorio de descargas/i.test(notas));

  /* ---------------- 2. La ventana de la app ---------------- */
  const server = await startServer(notas);
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
    "ipcMain.handle('korforge:portapapeles-hay-texto', () => { try { return String(clipboard.readText() || '').length > 0; } catch (_) { return false; } });",
    "ipcMain.handle('korforge:portapapeles', () => false);",
    'app.whenReady().then(() => {',
    `  const win = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(${JSON.stringify(ROOT)}, 'preload.js') } });`,
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
    if (!target) throw new Error('CDP no arrancó');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, mal) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', mal, { once: true }); });
    cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await sleep(3200);

    const ui = await cdp.evaluate(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const out = { pasos: [], problemas: [] };
      /* Se comprueba contra lo que hay HOY en docs/CAMBIOS-ULTIMA.md (la sonda no lleva textos
         clavados: vale igual en la próxima versión). */
      const primerCambio = ${JSON.stringify(cambios[0] || '')};
      const archivoWindows = ${JSON.stringify(`KoRForge-${version}-Windows.exe`)};
      const boton = document.getElementById('btnAppUpdate');
      if (!boton) { out.problemas.push('no hay boton de version en el menu'); return out; }
      const llamadas = async () => (await (await fetch('/api/__llamadas')).json()).llamadas;
      const antes = await llamadas();
      boton.click();
      await sleep(1500);
      const despues = await llamadas();
      out.pasos.push('consultas a GitHub antes de abrir: ' + antes + ' / despues: ' + despues);
      if (despues <= antes) out.problemas.push('abrir la ventana NO vuelve a preguntar las novedades (se queda con la foto del arranque)');
      const modal = document.getElementById('updateModal');
      const visible = !!(modal && getComputedStyle(modal).display !== 'none');
      out.pasos.push('modal visible: ' + visible);
      if (!visible) { out.problemas.push('el modal de actualizacion no se abrio'); return out; }

      const notasEl = document.getElementById('modalReleaseNotes');
      const html = notasEl ? notasEl.innerHTML : '';
      const texto = notasEl ? notasEl.textContent : '';
      const items = notasEl ? [...notasEl.querySelectorAll('li')].map(li => li.textContent.trim()) : [];
      const titulos = notasEl ? [...notasEl.querySelectorAll('h3')].map(h => h.textContent.trim()) : [];
      out.pasos.push('titulo de novedades: ' + JSON.stringify((document.getElementById('modalNotesTitle') || {}).textContent || ''));
      out.pasos.push('subtitulos pintados: ' + JSON.stringify(titulos));
      out.pasos.push('numero de cambios en la lista: ' + items.length);
      out.pasos.push('primer cambio: ' + JSON.stringify(items[0] || ''));
      out.pasos.push('ultima linea: ' + JSON.stringify(items[items.length - 1] || ''));

      if (items.length < 3) out.problemas.push('la ventana no pinta los cambios como lista');
      if (primerCambio && !texto.includes(primerCambio.slice(0, 40))) out.problemas.push('los cambios del CAMBIOS-ULTIMA no llegan a la ventana');
      if (!titulos.some(t => /Archivos de esta versión/i.test(t))) out.problemas.push('falta el apartado de archivos');
      if (!items.some(t => t.includes(archivoWindows))) out.problemas.push('no se listan los archivos de la version');
      if (/repositorio de descargas/i.test(texto)) out.problemas.push('sigue saliendo el texto del README del repo');
      if (/Hay una nueva versión disponible para descargar desde GitHub Releases/.test(texto)) out.problemas.push('sigue saliendo el texto generico de relleno');
      if (/##/.test(texto)) out.problemas.push('se cuela markdown sin pintar en la ventana');
      if (texto.indexOf(String.fromCharCode(96)) >= 0) out.problemas.push('se cuelan comillas invertidas de markdown');
      if (/\\u2014/.test(texto)) out.problemas.push('hay guion largo en las notas');
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
  console.log('\nOK: la ventana de actualización enseña los cambios de la última versión');
})().catch((err) => { console.error('FALLO:', err.message); process.exit(1); });
