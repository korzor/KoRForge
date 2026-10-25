#!/usr/bin/env node
/**
 * Sonda de idiomas de KoRForge (dueño, 25-10-2026).
 *
 * Levanta un servidor de pruebas con `public/` y datos falsos, abre la app en Electron sin ventana
 * (CDP) y comprueba en el DOM real:
 *   1. El desplegable de Ajustes ofrece los nueve idiomas.
 *   2. Al elegir ruso, chino, coreano o japonés la interfaz cambia de verdad (etiquetas y lang).
 *   3. La elección se guarda en localStorage.
 *   4. La traducción de la ficha se ofrece en el idioma de la app y NUNCA en inglés.
 *   5. Al cambiar de idioma con la ficha abierta, el botón se actualiza solo.
 *
 * Uso: node scripts/verificar-idiomas-ui.js
 * Sale con código 1 si algo falla.
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const HTTP_PORT = 3966;
const CDP_PORT = 9340;
const NOW = new Date().toISOString();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CONFIG = {
  success: true,
  activeGame: 'forever',
  language: 'en',
  closeToTray: true,
  rootWoWDir: 'C:\\WoW',
  wowDir: 'C:\\WoW\\_forever_',
  games: {
    forever: { id: '88568', name: 'WoW Forever', subtitle: 'x', subfolder: '_forever_', path: 'C:\\WoW\\_forever_', icon: '⚔️', addonsExists: true, folderExists: true },
    retail: { id: '517', name: 'WoW Retail', subtitle: 'x', subfolder: '_retail_', path: '', icon: '🎮', addonsExists: false, folderExists: false },
    classic_era: { id: '67408', name: 'Classic Era', subtitle: 'x', subfolder: '_classic_era_', path: '', icon: '🪓', addonsExists: false, folderExists: false },
    classic: { id: '79434', name: 'Classic Prog', subtitle: 'x', subfolder: '_classic_', path: '', icon: '🐉', addonsExists: false, folderExists: true }
  }
};

const FAVORITO = {
  id: 11, name: 'Details', slug: 'details', summary: 'Medidor de dano', author: 'Tercioo',
  iconUrl: '', categories: [], sourceUrl: '', version: '1.2.3', downloadCount: 1,
  dateModified: NOW, dateCreated: NOW, agregadoEn: Date.now()
};

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
    const json = (payload) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    };

    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/config') return json(CONFIG);
      if (url.pathname === '/api/addons') return json({ success: true, addons: [] });
      if (url.pathname === '/api/search') return json({ success: true, results: [] });
      if (url.pathname === '/api/favorites') return json({ success: true, favorites: [FAVORITO] });
      if (url.pathname === '/api/backups') return json({ success: true, backups: [] });
      if (url.pathname === '/api/mod/11') return json({ success: true, mod: { ...FAVORITO, screenshots: [] } });
      if (url.pathname === '/api/mod/11/files') return json({ success: true, files: [] });
      if (url.pathname === '/api/mod/11/description') return json({ success: true, html: '<p>Damage meter for WoW.</p>' });
      if (url.pathname === '/api/mod/11/translation') return json({ success: true, translation: {} });
      if (url.pathname === '/api/noticias') return json({ success: true, noticias: [] });
      if (url.pathname === '/api/app-updates/check') return json({ source: 'github', checked: true, updateAvailable: false, currentVersion: '1.4.7' });
      if (url.pathname === '/api/addons/check-updates') return json({ success: true, updates: [] });
      return json({ success: true });
    }

    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.join(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('no encontrado');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => server.listen(HTTP_PORT, '127.0.0.1', () => resolve(server)));
}

function electronBinary() {
  const exe = process.platform === 'win32' ? 'electron.exe' : 'electron';
  const candidate = path.join(ROOT, 'node_modules', 'electron', 'dist', exe);
  if (!fs.existsSync(candidate)) throw new Error('No encuentro Electron en node_modules/electron/dist');
  return candidate;
}

function startElectron() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'korforge-idiomas-'));
  const mainFile = path.join(tmpDir, 'main.js');
  fs.writeFileSync(mainFile, `
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('remote-debugging-port', '${CDP_PORT}');
app.disableHardwareAcceleration();
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.loadURL('http://127.0.0.1:${HTTP_PORT}');
});
app.on('window-all-closed', () => app.quit());
`, 'utf8');

  const child = spawn(electronBinary(), [mainFile], { cwd: ROOT, stdio: 'ignore' });
  return { child, tmpDir };
}

async function cdpTargets() {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  if (!res.ok) throw new Error(`CDP no responde (HTTP ${res.status})`);
  return res.json();
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
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
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Error al evaluar');
    return result.result.value;
  }

  close() { try { this.ws.close(); } catch (_) {} }
}

const CHECK = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { pasos: [], problemas: [] };
  const T = (k) => window.I18N.t(k);
  const navTexto = () => (document.querySelector('.nav-item[data-tab="search"] .nav-label') || {}).textContent || '';
  const engNav = 'Search Addons';

  // 0. Desplegable de Ajustes con los nueve idiomas
  const sel = document.getElementById('settingAppLanguage');
  if (!sel) {
    out.problemas.push('no existe el desplegable de idioma en Ajustes');
    return out;
  }
  const valores = [...sel.options].map((o) => o.value);
  out.pasos.push('idiomas en Ajustes: ' + JSON.stringify(valores));
  const esperados = ['en', 'es', 'gl', 'fr', 'it', 'ru', 'zh', 'ko', 'ja'];
  for (const v of esperados) {
    if (!valores.includes(v)) out.problemas.push('el desplegable de Ajustes no ofrece el idioma ' + v);
  }

  // 1. Cambiar a cada idioma nuevo y comprobar que la interfaz cambia de verdad
  const nuevos = ['ru', 'zh', 'ko', 'ja'];
  const textos = {};
  for (const lang of nuevos) {
    sel.value = lang;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(650);
    const nav = navTexto().trim();
    textos[lang] = nav;
    out.pasos.push(lang + ': lang=' + document.documentElement.lang + ' nav=' + JSON.stringify(nav)
      + ' buscar=' + JSON.stringify(T('btn_search')));
    if (window.I18N.getLanguage() !== lang) out.problemas.push('no se activo el idioma ' + lang);
    if (document.documentElement.lang !== lang) out.problemas.push('el idioma del documento no es ' + lang);
    if (!nav) out.problemas.push('la etiqueta del menu quedo vacia en ' + lang);
    if (nav === engNav) out.problemas.push('la etiqueta del menu sigue en ingles en ' + lang);
    if (T('btn_search') === 'Search') out.problemas.push('los textos internos siguen en ingles en ' + lang);
    let guardado = null;
    try { guardado = localStorage.getItem('korforge_language'); } catch (_) {}
    if (guardado !== lang) out.problemas.push('la eleccion de idioma no se guardo (' + lang + ' -> ' + guardado + ')');
  }
  const distintos = new Set(Object.values(textos));
  out.pasos.push('etiquetas distintas entre los cuatro: ' + distintos.size);
  if (distintos.size !== 4) out.problemas.push('varios idiomas nuevos ensenan la misma etiqueta de menu');

  // 2. La traduccion de la ficha se ofrece en el idioma de la app, nunca en ingles
  document.querySelector('.nav-item[data-tab="favorites"]').click();
  await sleep(800);
  const tarjeta = document.querySelector('#favoritesTabGrid .cf-card');
  if (!tarjeta) out.problemas.push('no hay tarjeta de favoritos para abrir la ficha');
  else {
    tarjeta.click();
    await sleep(1200);
  }
  const boton = document.getElementById('btnTranslateToggle');
  if (!boton) out.problemas.push('no existe el boton de traducir en la ficha');
  else {
    const visible = () => boton.style.display !== 'none';
    out.pasos.push('ficha en ' + window.I18N.getLanguage() + ': boton traducir visible=' + visible()
      + ' texto=' + JSON.stringify((boton.textContent || '').trim()));
    if (!visible()) out.problemas.push('con la app en ' + window.I18N.getLanguage() + ' no se ofrece traducir');
    if (/espa|spanish/i.test(boton.textContent || '')) out.problemas.push('el boton de traducir sigue anunciando espanol');

    // En ingles no se ofrece traduccion: al cambiar de idioma el boton se esconde solo
    sel.value = 'en';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(700);
    out.pasos.push('ficha en en: boton traducir visible=' + visible());
    if (visible()) out.problemas.push('con la app en ingles se sigue ofreciendo traducir');

    sel.value = 'es';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(700);
    out.pasos.push('ficha en es: boton traducir visible=' + visible()
      + ' texto=' + JSON.stringify((boton.textContent || '').trim()));
    if (!visible()) out.problemas.push('al volver a espanol no se ofrece traducir');
    if (!/traduc/i.test(boton.textContent || '')) out.problemas.push('el boton de traducir no esta en espanol: ' + JSON.stringify((boton.textContent || '').trim()));
  }

  out.errores = (window.__erroresPagina || []).slice(0, 5);
  return out;
})()`;

async function main() {
  console.log('Sonda de idiomas de KoRForge\n');
  const server = await startStaticServer();
  const { child, tmpDir } = startElectron();
  let cdp = null;
  const cleanup = () => {
    try { cdp?.close(); } catch (_) {}
    try { child.kill(); } catch (_) {}
    try { server.close(); } catch (_) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  };

  try {
    let page = null;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try {
        const list = await cdpTargets();
        page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) break;
      } catch (_) {}
    }
    if (!page) throw new Error('Electron no abrio ninguna pestana depurable');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('No se pudo conectar al CDP')), { once: true });
    });
    cdp = new Cdp(ws);
    await cdp.send('Page.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: 'window.__erroresPagina = []; window.addEventListener("error", (e) => window.__erroresPagina.push(String(e.message)));'
    });
    await cdp.send('Runtime.enable');

    for (let i = 0; i < 40; i++) {
      const ready = await cdp.evaluate('!!(window.I18N && document.querySelector("#addonsGrid"))');
      if (ready) break;
      await sleep(250);
    }
    await sleep(900);

    const r = await cdp.evaluate(CHECK);
    for (const p of r.pasos) console.log('   · ' + p);
    for (const p of r.problemas) console.error('   ! ' + p);
    if (r.errores && r.errores.length) {
      console.error('   ! errores en la pagina: ' + JSON.stringify(r.errores));
      r.problemas.push('la pagina lanzo errores de JavaScript');
    }

    cleanup();
    if (r.problemas.length) {
      console.error(`\n${r.problemas.length} problema(s) de idiomas.`);
      process.exit(1);
    }
    console.log('\nIdiomas en orden: nueve lenguas, traduccion ofrecida en el idioma de la app.');
  } catch (err) {
    cleanup();
    console.error('Fallo la sonda: ' + err.message);
    process.exit(1);
  }
}

main();
