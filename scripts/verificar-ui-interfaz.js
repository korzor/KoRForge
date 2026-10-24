#!/usr/bin/env node
/**
 * Sonda de interfaz para KoRForge (dueÃ±o, 22-10-2026).
 *
 * Levanta un servidor de pruebas con `public/` y datos falsos, abre la app en Electron sin
 * ventana (CDP) y comprueba en el DOM real:
 *   1. El desinstalar pregunta con un MODAL, no con una ventana del sistema.
 *   2. La pregunta de los SavedVariables tambiÃ©n es un modal (SÃ­ borrar / No conservar).
 *   3. La BÃ³veda WTF pregunta con modal (restaurar y borrar).
 *   4. El estado vacÃ­o de Mis Addons sale centrado en la zona (no en una esquina).
 *   5. El estado vacÃ­o de la BÃ³veda tambiÃ©n sale centrado.
 *   6. El buscador de Mis Addons ocupa el ancho libre y queda pegado a los filtros.
 *   7. Ninguna ventana del sistema (window.confirm) se llega a abrir en todo el recorrido.
 *
 * Uso: node verificar-ui-korforge.mjs
 * Sale con cÃ³digo 1 si algo falla.
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const HTTP_PORT = 3961;
const CDP_PORT = 9335;
const NOW = new Date().toISOString();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADDON = {
  folderName: 'Details',
  actualName: 'Details',
  title: 'Details',
  version: '1.2.3',
  enabled: true,
  notes: '',
  modId: 123,
  hasMissingDeps: false,
  compatibility: null,
  missingDependencies: [],
  dependencies: [],
};

const CONFIG = {
  success: true,
  activeGame: 'forever',
  language: 'en',
  closeToTray: true,
  rootWoWDir: 'C:\\WoW',
  wowDir: 'C:\\WoW\\_forever_',
  games: {
    forever: { id: '88568', name: 'WoW Forever', subtitle: 'x', subfolder: '_forever_', path: 'C:\\WoW\\_forever_', icon: 'âš”ï¸', addonsExists: true, folderExists: true },
    retail: { id: '517', name: 'WoW Retail', subtitle: 'x', subfolder: '_retail_', path: '', icon: 'ðŸŽ®', addonsExists: false, folderExists: false },
    classic_era: { id: '67408', name: 'Classic Era', subtitle: 'x', subfolder: '_classic_era_', path: '', icon: 'ðŸª“', addonsExists: false, folderExists: false },
    classic: { id: '79434', name: 'Classic Prog', subtitle: 'x', subfolder: '_classic_', path: '', icon: 'ðŸ‰', addonsExists: false, folderExists: true },
  },
};

let emptyMode = false;
const log = { deletes: [] };

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
    const json = (payload) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    };

    if (url.pathname === '/__toggle-empty') {
      emptyMode = true;
      return json({ success: true });
    }

    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/config') return json(CONFIG);
      if (url.pathname === '/api/addons') {
        return json({ success: true, addons: emptyMode ? [] : [ADDON] });
      }
      if (url.pathname === '/api/addons/uninstall-preview') {
        return json({ success: true, folders: ['Details', 'Details_Core'], dependents: [], savedVariables: ['Details.lua'] });
      }
      if (url.pathname.startsWith('/api/addons/') && req.method === 'DELETE') {
        log.deletes.push(url.pathname + '?' + url.search);
        return json({ success: true, deleted: true, savedVariablesDeleted: (url.searchParams.get('deleteSaved') === '1') ? ['Details.lua'] : [] });
      }
      if (url.pathname === '/api/search') {
        return json({ success: true, results: [] });
      }
      if (url.pathname === '/api/backups') {
        return json({ success: true, backups: emptyMode ? [] : [{ fileName: 'WTF-2026-10-20.zip', date: '20-10-2026', sizeMb: 12 }] });
      }
      if (url.pathname === '/api/favorites') return json({ success: true, favorites: [] });
      if (url.pathname === '/api/mod/1') return json({ success: true, mod: { id: 1, name: 'Details', author: 'x', summary: '', downloadCount: 1, dateModified: NOW, dateCreated: NOW, version: '1.2.3', iconUrl: '', screenshots: [] } });
      if (url.pathname === '/api/mod/1/files') return json({ success: true, files: [] });
      if (url.pathname === '/api/mod/1/description') return json({ success: true, html: '<p>x</p>' });
      if (url.pathname === '/api/mod/1/translation') return json({ success: true, translation: {} });
      if (url.pathname === '/api/app-updates/check') return json({ source: 'github', checked: true, updateAvailable: false, currentVersion: '1.2.16' });
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'korforge-ui-'));
  const mainFile = path.join(tmpDir, 'main.js');
  fs.writeFileSync(mainFile, `
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('remote-debugging-port', '${CDP_PORT}');
app.disableHardwareAcceleration();
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
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

const CHECK_UNINSTALL = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { pasos: [], problemas: [] };
  const modal = () => document.getElementById('confirmModal');
  const visible = (el) => !!(el && el.style.display !== 'none');

  const click = (sel) => { const el = document.querySelector(sel); if (el) { el.click(); return true; } return false; };

  // 1. Desinstalar abre modal (no ventana del sistema)
  click('.nav-item[data-tab="addons"]');
  await sleep(700);
  click('.btn-addon-trash');
  await sleep(600);
  if (!visible(modal())) out.problemas.push('el modal de confirmacion del desinstalar no se abrio');
  const txt1 = document.getElementById('confirmText')?.textContent || '';
  if (!txt1.trim()) out.problemas.push('el modal del desinstalar salio sin texto');
  out.pasos.push('desinstalar modal: ' + JSON.stringify(txt1.slice(0, 60)));

  // 2. Aceptar -> pregunta SavedVariables, tambien en modal
  click('#btnConfirmOk');
  await sleep(400);
  if (!visible(modal())) out.problemas.push('el modal de SavedVariables no se abrio');
  const ok2 = document.getElementById('btnConfirmOk')?.textContent || '';
  const cancel2 = document.getElementById('btnConfirmCancel')?.textContent || '';
  out.pasos.push('savedvars botones: ' + JSON.stringify({ ok2, cancel2 }));
  if (!/delete/i.test(ok2)) out.problemas.push('el boton de borrar datos no dice "Yes, delete them": ' + JSON.stringify(ok2));
  if (!/keep/i.test(cancel2)) out.problemas.push('el boton de conservar no dice "No, keep them": ' + JSON.stringify(cancel2));

  // 3. "No, keep them" -> se borra el addon sin datos (DELETE con deleteSaved=0)
  click('#btnConfirmCancel');
  await sleep(500);
  if (visible(modal())) out.problemas.push('el modal no se cerro al cancelar');

  // 4. Buscador flexible pegado a los filtros
  const box = document.querySelector('.toolbar .search-box');
  const toolbar = document.querySelector('#pane-addons .toolbar');
  if (box && toolbar) {
    const bw = box.getBoundingClientRect().width;
    const tw = toolbar.getBoundingClientRect().width;
    const pills = document.querySelector('#pane-addons .filter-pills');
    const pw = pills ? pills.getBoundingClientRect().width : 0;
    const ratio = bw / Math.max(1, tw - pw);
    out.pasos.push('buscador: ' + Math.round(bw) + 'px de ' + Math.round(tw) + 'px (pills ' + Math.round(pw) + 'px, ratio ' + ratio.toFixed(2) + ')');
    if (ratio < 0.75) out.problemas.push('el buscador no ocupa el ancho libre (ratio ' + ratio.toFixed(2) + ')');
    if (getComputedStyle(box).maxWidth !== 'none') out.problemas.push('el buscador sigue con max-width: ' + getComputedStyle(box).maxWidth);
  } else {
    out.problemas.push('no encuentro el buscador o el toolbar de Mis Addons');
  }

  // 5. La Boveda WTF pregunta con modal (restaurar)
  click('.nav-item[data-tab="backups"]');
  await sleep(700);
  click('.btn-restore-backup');
  await sleep(500);
  if (!visible(modal())) out.problemas.push('el modal de restaurar backup no se abrio');
  const txtR = document.getElementById('confirmText')?.textContent || '';
  out.pasos.push('restaurar modal: ' + JSON.stringify(txtR.slice(0, 60)));
  click('#btnConfirmCancel');
  await sleep(300);

  // 6. Borrar backup tambien es modal
  click('.btn-delete-backup');
  await sleep(400);
  if (!visible(modal())) out.problemas.push('el modal de borrar backup no se abrio');
  click('#btnConfirmCancel');
  await sleep(300);

  // 7. Ninguna ventana del sistema en todo el recorrido
  if ((window.__nativeConfirms || 0) !== 0) out.problemas.push('se abrio la ventana del sistema (window.confirm) ' + window.__nativeConfirms + ' vez(es)');
  return out;
})()`;

const CHECK_EMPTY = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { pasos: [], problemas: [] };

  // Mis Addons vacio
  document.querySelector('.nav-item[data-tab="addons"]').click();
  await sleep(700);
  const es = document.querySelector('#addonsGrid .empty-state');
  if (!es) { out.problemas.push('no hay estado vacio en Mis Addons'); return out; }
  const cs = getComputedStyle(es);
  const rect = es.getBoundingClientRect();
  const zona = document.getElementById('addonsGrid').getBoundingClientRect();
  const centroX = rect.left + rect.width / 2;
  const centroZona = zona.left + zona.width / 2;
  out.pasos.push('vacio addons: alineado=' + cs.alignItems + '/' + cs.justifyContent + ' texto=' + cs.textAlign
    + ' centroX=' + Math.round(centroX) + ' zonaX=' + Math.round(centroZona));
  if (!/center/.test(cs.alignItems) || !/center/.test(cs.justifyContent)) out.problemas.push('el estado vacio de addons no esta centrado (' + cs.alignItems + '/' + cs.justifyContent + ')');
  if (Math.abs(centroX - centroZona) > 40) out.problemas.push('el estado vacio de addons no esta en el medio (' + Math.round(centroX) + ' vs ' + Math.round(centroZona) + ')');
  const colBtn = document.querySelector('#addonsGrid .empty-state .btn');
  if (colBtn) {
    const bcs = getComputedStyle(colBtn);
    const br = colBtn.getBoundingClientRect();
    const centroBtn = br.left + br.width / 2;
    out.pasos.push('boton vacio: centro=' + Math.round(centroBtn) + ' margenArriba=' + bcs.marginTop);
    if (Math.abs(centroBtn - centroZona) > 40) out.problemas.push('el boton del estado vacio no esta centrado');
  }

  // Boveda vacia
  document.querySelector('.nav-item[data-tab="backups"]').click();
  await sleep(700);
  const bv = document.querySelector('#backupsList .empty-state');
  if (!bv) { out.problemas.push('no hay estado vacio en la Boveda'); return out; }
  const bc = getComputedStyle(bv);
  out.pasos.push('vacio boveda: alineado=' + bc.alignItems + '/' + bc.justifyContent + ' texto=' + bc.textAlign);
  if (!/center/.test(bc.alignItems) || !/center/.test(bc.justifyContent)) out.problemas.push('el estado vacio de la Boveda no esta centrado');
  return out;
})()`;

/* El panel lateral tiene que quedar a la altura de la palabra «Filtros» del panel de búsqueda
   (dueño, 25-10-2026: «baja los botones del panel lateral para que se alineen con la palabra
   filtro»). Se comparan los CENTROS verticales, que es lo que se ve alineado. */
const CHECK_PANEL_LATERAL = `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const out = { pasos: [], problemas: [] };
  document.querySelector('.nav-item[data-tab="search"]').click();
  await sleep(900);
  const nav = document.querySelector('.nav-menu .nav-item[data-tab="search"]');
  const titulo = document.querySelector('.cf-filters-title');
  if (!nav || !titulo) { out.problemas.push('no encuentro el primer boton del panel lateral o la palabra Filtros'); return out; }
  const rn = nav.getBoundingClientRect();
  const rt = titulo.getBoundingClientRect();
  const centroNav = rn.top + rn.height / 2;
  const centroTitulo = rt.top + rt.height / 2;
  const desfase = Math.round(centroTitulo - centroNav);
  out.pasos.push('panel lateral: primer boton centro=' + Math.round(centroNav) + ' | palabra Filtros centro=' + Math.round(centroTitulo) + ' | desfase=' + desfase + ' px');
  out.pasos.push('ventana: ' + innerWidth + 'x' + innerHeight);
  if (Math.abs(desfase) > 3) out.problemas.push('los botones del panel lateral no estan a la altura de la palabra Filtros (desfase ' + desfase + ' px)');
  return out;
})()`;

async function main() {
  console.log('Sonda de interfaz de KoRForge\n');
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
      source: 'window.__nativeConfirms = 0; window.confirm = function () { window.__nativeConfirms++; return true; };',
    });
    await cdp.send('Runtime.enable');

    for (let i = 0; i < 40; i++) {
      const ready = await cdp.evaluate('!!(window.I18N && document.querySelector("#addonsGrid"))');
      if (ready) break;
      await sleep(250);
    }
    await sleep(900);

    const r1 = await cdp.evaluate(CHECK_UNINSTALL);
    console.log('\n1) Desinstalar y Boveda con modal');
    for (const p of r1.pasos) console.log('   Â· ' + p);
    for (const p of r1.problemas) console.error('   ! ' + p);

    // Recarga con los datos vacios (lista de addons y backups sin nada)
    await fetch(`http://127.0.0.1:${HTTP_PORT}/__toggle-empty`);
    await cdp.send('Page.reload', { ignoreCache: true });
    for (let i = 0; i < 40; i++) {
      const ready = await cdp.evaluate('!!document.querySelector("#addonsGrid")').catch(() => false);
      if (ready) break;
      await sleep(250);
    }
    await sleep(900);

    const r2 = await cdp.evaluate(CHECK_EMPTY);
    console.log('\n2) Estados vacios');
    for (const p of r2.pasos) console.log('   Â· ' + p);
    for (const p of r2.problemas) console.error('   ! ' + p);

    const r3 = await cdp.evaluate(CHECK_PANEL_LATERAL);
    console.log('\n3) Panel lateral alineado con «Filtros»');
    for (const p of r3.pasos) console.log('   Â· ' + p);
    for (const p of r3.problemas) console.error('   ! ' + p);

    if (log.deletes.length) console.log('\nDELETE de prueba: ' + log.deletes.join(' | '));

    const problemas = [...r1.problemas, ...r2.problemas, ...r3.problemas];
    if (problemas.length) {
      console.error(`\nERRORES: ${problemas.length}`);
      process.exitCode = 1;
    } else {
      console.log('\nOK: desinstalar y Boveda con modal, estados vacios centrados y buscador flexible.');
    }
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('ERROR: ' + err.message);
  process.exit(1);
});

