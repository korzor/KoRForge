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
      if (url.pathname === '/api/favorites') {
        /* Dos favoritos: hacen falta para comprobar que la barra de arriba filtra la lista. */
        return json({
          success: true,
          favorites: [
            { id: 11, name: 'Details', slug: 'details', summary: 'Medidor de dano', author: 'Tercioo', iconUrl: '', categories: [], sourceUrl: '', version: '1.2.3', downloadCount: 1, dateModified: NOW },
            { id: 12, name: 'Questie', slug: 'questie', summary: 'Ayuda de misiones', author: 'Questie', iconUrl: '', categories: [], sourceUrl: '', version: '2.0.0', downloadCount: 2, dateModified: NOW }
          ]
        });
      }
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

  // 4. El buscador de la barra compartida ocupa el ancho libre (pegado a los botones de la derecha)
  const cajaBusqueda = document.querySelector('.app-toolbar-row .cf-search-input-wrap');
  const barraCompartida = document.querySelector('.app-toolbar-row .cf-top-toolbar');
  if (cajaBusqueda && barraCompartida) {
    const bw = cajaBusqueda.getBoundingClientRect().width;
    const tw = barraCompartida.getBoundingClientRect().width;
    const resto = document.querySelector('.app-toolbar-row .cf-sort-wrap');
    const rw = resto ? resto.getBoundingClientRect().width : 0;
    const ratio = bw / Math.max(1, tw - rw);
    out.pasos.push('buscador de la barra: ' + Math.round(bw) + 'px de ' + Math.round(tw) + 'px (controles ' + Math.round(rw) + 'px, ratio ' + ratio.toFixed(2) + ')');
    if (ratio < 0.6) out.problemas.push('el buscador de la barra no ocupa el ancho libre (ratio ' + ratio.toFixed(2) + ')');
    if (getComputedStyle(cajaBusqueda).maxWidth !== 'none') out.problemas.push('el buscador sigue con max-width: ' + getComputedStyle(cajaBusqueda).maxWidth);
  } else {
    out.problemas.push('no encuentro el buscador de la barra compartida');
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

/* La zona superior lleva el banner del dueño de fondo (dueño, 25-10-2026): la capa `.app-banner` baja
   hasta casi tocar los botones del panel lateral y va por detrás de la barra de búsqueda; la barra y
   el panel lateral son transparentes arriba para dejar verlo. Además se comprueba que las píldoras de
   juego (activa e inactivas) y los botones de ventana se ven. */
const CHECK_BANNER = `(async () => {
  const out = { pasos: [], problemas: [] };
  const caja = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { el, top: r.top, bottom: r.bottom, alto: r.height };
  };
  const banner = caja('.app-banner');
  const barra = document.querySelector('.app-topbar');
  const nav = caja('.nav-menu .nav-item[data-tab="search"]');
  const toolbar = document.querySelector('.cf-top-toolbar');
  const sidebar = document.querySelector('.app-sidebar');
  if (!banner) { out.problemas.push('no existe la capa .app-banner'); return out; }
  if (!barra || !nav || !toolbar || !sidebar) { out.problemas.push('faltan elementos de la zona superior'); return out; }

  const estiloBanner = getComputedStyle(banner.el);
  out.pasos.push('banner: top=' + Math.round(banner.top) + ' bottom=' + Math.round(banner.bottom) + ' alto=' + Math.round(banner.alto));
  out.pasos.push('primer boton del panel lateral: top=' + Math.round(nav.top) + ' | hueco banner-boton=' + Math.round(nav.top - banner.bottom) + ' px');
  out.pasos.push('barra de busqueda: top=' + Math.round(toolbar.getBoundingClientRect().top) + ' bottom=' + Math.round(toolbar.getBoundingClientRect().bottom) + ' | fondo=' + getComputedStyle(toolbar).backgroundColor);
  if (!/topbar-grifon\\.jpg/.test(estiloBanner.backgroundImage)) out.problemas.push('la capa del banner no lleva topbar-grifon.jpg');
  /* Encuadre arriba: se ve la parte alta del dibujo (dueño, 25-10-2026). */
  out.pasos.push('encuadre de la imagen: ' + estiloBanner.backgroundPosition);
  if (!/50% 0%|center top|top/.test(estiloBanner.backgroundPosition)) {
    out.problemas.push('el banner no esta encuadrado por arriba: ' + estiloBanner.backgroundPosition);
  }
  if (banner.alto < 110) out.problemas.push('el banner no baja lo suficiente (alto ' + Math.round(banner.alto) + ' px)');
  /* Línea divisoria entre la imagen y el resto de la app (dueño, 25-10-2026): se pinta como sombra
     de 1 px en el borde inferior del banner, así que se comprueba que exista. */
  if (!/1px|0px 1px/.test(estiloBanner.boxShadow) && !/rgb|rgba/.test(estiloBanner.boxShadow)) {
    out.problemas.push('el banner no lleva linea divisoria abajo: ' + estiloBanner.boxShadow);
  }
  out.pasos.push('linea divisoria (sombra del banner): ' + String(estiloBanner.boxShadow).slice(0, 70));
  if (banner.bottom < toolbar.getBoundingClientRect().bottom) out.problemas.push('el banner no llega por detras de la barra de busqueda');
  if (getComputedStyle(barra).backgroundImage !== 'none') out.problemas.push('la barra superior sigue pintando su propio fondo (tapa el banner)');

  /* Panel lateral = misma tarjeta que el de filtros (dueño, 25-10-2026). */
  const filtros = document.querySelector('.cf-filters-sidebar');
  const eS = getComputedStyle(sidebar);
  const eF = filtros ? getComputedStyle(filtros) : null;
  out.pasos.push('panel lateral: bg=' + eS.backgroundColor + ' borde=' + eS.borderTopColor + ' radio=' + eS.borderTopLeftRadius);
  out.pasos.push('panel de filtros: bg=' + (eF ? eF.backgroundColor : '-') + ' borde=' + (eF ? eF.borderTopColor : '-') + ' radio=' + (eF ? eF.borderTopLeftRadius : '-'));
  if (eS.backgroundColor === 'rgba(0, 0, 0, 0)') out.problemas.push('el panel lateral es transparente (deberia ser una tarjeta como el de filtros)');
  if (eS.borderTopWidth === '0px') out.problemas.push('el panel lateral no tiene borde');
  if (parseFloat(eS.borderTopLeftRadius) < 8) out.problemas.push('el panel lateral no tiene el redondeo del de filtros (' + eS.borderTopLeftRadius + ')');
  if (eF) {
    const rf = filtros.getBoundingClientRect();
    out.pasos.push('alto: panel lateral ' + Math.round(sidebar.getBoundingClientRect().top) + '-' + Math.round(sidebar.getBoundingClientRect().bottom) + ' | filtros ' + Math.round(rf.top) + '-' + Math.round(rf.bottom));
    if (Math.abs(sidebar.getBoundingClientRect().top - rf.top) > 2) out.problemas.push('el panel lateral no arranca a la altura del de filtros');
    if (Math.abs(sidebar.getBoundingClientRect().bottom - rf.bottom) > 2) out.problemas.push('el panel lateral no acaba a la altura del de filtros');
    if (eS.backgroundColor !== eF.backgroundColor) out.problemas.push('el panel lateral y el de filtros no tienen el mismo fondo');
  }

  const r = await fetch('/topbar-grifon.jpg');
  out.pasos.push('el fichero se sirve: HTTP ' + r.status);
  if (r.status !== 200) out.problemas.push('el banner topbar-grifon.jpg no se sirve');

  /* Píldoras: la activa en dorado y las inactivas también visibles. */
  const activa = document.querySelector('.game-version-pill.active');
  const inactiva = document.querySelector('.game-version-pill:not(.active)');
  const eA = activa ? getComputedStyle(activa) : null;
  const eI = inactiva ? getComputedStyle(inactiva) : null;
  out.pasos.push('pildora activa: borde=' + (eA ? eA.borderTopColor : '-') + ' fondo=' + (eA ? eA.backgroundImage.slice(0, 46) : '-'));
  out.pasos.push('pildora inactiva: borde=' + (eI ? eI.borderTopColor : '-') + ' fondo=' + (eI ? eI.backgroundColor : '-'));
  if (!eA || !/251, 191, 36/.test(eA.borderTopColor)) out.problemas.push('la pildora activa no tiene el borde dorado');
  if (!eI) out.problemas.push('no hay pildoras inactivas');
  else {
    const alphaFondo = Number((eI.backgroundColor.match(/[\\d.]+\\)$/) || ['0)'])[0].replace(')', ''));
    const alphaBorde = Number((eI.borderTopColor.match(/[\\d.]+\\)$/) || ['0)'])[0].replace(')', ''));
    if (!(alphaFondo >= 0.06)) out.problemas.push('la pildora inactiva casi no tiene fondo (alpha ' + alphaFondo + ')');
    if (!(alphaBorde >= 0.2)) out.problemas.push('la pildora inactiva casi no tiene borde (alpha ' + alphaBorde + ')');
  }

  /* Botones de ventana: trazo claro y fondo propio para que se vean sobre el banner. */
  const win = document.querySelector('.win-btn');
  if (!win) out.problemas.push('no hay botones de ventana');
  else {
    const eW = getComputedStyle(win);
    const brillo = Number((eW.color.match(/(\\d+), (\\d+), (\\d+)/) || [])[1] || 0) + Number((eW.color.match(/(\\d+), (\\d+), (\\d+)/) || [])[2] || 0) + Number((eW.color.match(/(\\d+), (\\d+), (\\d+)/) || [])[3] || 0);
    out.pasos.push('boton de ventana: color=' + eW.color + ' fondo=' + eW.backgroundColor + ' brillo=' + brillo);
    if (brillo < 520) out.problemas.push('los botones de ventana siguen muy apagados (brillo ' + brillo + ')');
    if (/rgba\\(0, 0, 0, 0\\)/.test(eW.backgroundColor)) out.problemas.push('los botones de ventana no tienen fondo propio');
  }
  return out;
})()`;

/* La barra de navegación y búsqueda es la MISMA en todas las pestañas (dueño, 25-10-2026): empieza a
   la izquierda del todo (a la altura del panel lateral y de la K de KoRForge), no cambia de sitio al
   cambiar de pestaña y las pestañas ya no llevan sus títulos grandes. Además, en Favoritos la barra
   filtra la lista. */
const CHECK_BARRA_COMPARTIDA = `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const out = { pasos: [], problemas: [] };
  const barra = document.querySelector('.app-toolbar-row');
  if (!barra) { out.problemas.push('no existe la barra compartida .app-toolbar-row'); return out; }
  const situacion = () => { const r = barra.getBoundingClientRect(); return { izq: Math.round(r.left), ancho: Math.round(r.width), top: Math.round(r.top), alto: Math.round(r.height) }; };

  const nav = document.querySelector('.nav-menu .nav-item[data-tab="search"]').getBoundingClientRect();
  const marca = document.querySelector('.brand .app-brand-icon') ? document.querySelector('.brand .app-brand-icon').getBoundingClientRect() : nav;
  const s0 = situacion();
  out.pasos.push('barra: izq=' + s0.izq + ' ancho=' + s0.ancho + ' top=' + s0.top);
  out.pasos.push('referencia (boton lateral izq=' + Math.round(nav.left) + ', logo izq=' + Math.round(marca.left) + ')');
  if (Math.abs(s0.izq - marca.left) > 14 && Math.abs(s0.izq - nav.left) > 14) {
    out.problemas.push('la barra no empieza a la izquierda como el panel lateral/logo (izq ' + s0.izq + ')');
  }

  const pestanas = ['favorites', 'addons', 'backups', 'news', 'search'];
  for (const t of pestanas) {
    const boton = document.querySelector('.nav-item[data-tab="' + t + '"]');
    if (!boton) { out.problemas.push('no hay boton de la pestaña ' + t); continue; }
    boton.click();
    await sleep(700);
    const s = situacion();
    const titulo = document.querySelector('#pane-' + t + ' .page-title');
    out.pasos.push('pestaña ' + t + ': barra izq=' + s.izq + ' top=' + s.top + ' | titulo grande=' + (titulo ? JSON.stringify(titulo.textContent.trim()) : 'ninguno'));
    if (s.izq !== s0.izq || s.top !== s0.top) out.problemas.push('la barra se mueve al cambiar a la pestaña ' + t + ' (izq ' + s.izq + ', top ' + s.top + ')');
    if (barra.offsetParent === null) out.problemas.push('la barra no se ve en la pestaña ' + t);
    if (titulo) out.problemas.push('la pestaña ' + t + ' sigue con el título grande');
  }

  /* En Favoritos, escribir en la barra filtra la lista. */
  const campo = document.getElementById('cfSearchInput');
  const botonFav = document.querySelector('.nav-item[data-tab="favorites"]');
  botonFav.click();
  await sleep(700);
  const antes = document.querySelectorAll('#favoritesTabGrid .cf-card').length;
  campo.value = 'zzzznoexiste';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(500);
  const despues = document.querySelectorAll('#favoritesTabGrid .cf-card').length;
  out.pasos.push('filtro desde la barra en Favoritos: tarjetas ' + antes + ' -> ' + despues + ' con ' + JSON.stringify(campo.value));
  if (!(despues <= antes)) out.problemas.push('la barra no filtra la lista de Favoritos');
  campo.value = '';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(300);
  document.querySelector('.nav-item[data-tab="search"]').click();
  await sleep(400);
  return out;
})()`;

async function main() {  console.log('Sonda de interfaz de KoRForge\n');
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

    const r4 = await cdp.evaluate(CHECK_BANNER);
    console.log('\n4) Banner del grifón en la barra superior');
    for (const p of r4.pasos) console.log('   Â· ' + p);
    for (const p of r4.problemas) console.error('   ! ' + p);

    const r5 = await cdp.evaluate(CHECK_BARRA_COMPARTIDA);
    console.log('\n5) Barra de búsqueda compartida en todas las pestañas');
    for (const p of r5.pasos) console.log('   Â· ' + p);
    for (const p of r5.problemas) console.error('   ! ' + p);

    if (log.deletes.length) console.log('\nDELETE de prueba: ' + log.deletes.join(' | '));

    const problemas = [...r1.problemas, ...r2.problemas, ...r3.problemas, ...r4.problemas, ...r5.problemas];
    if (problemas.length) {
      console.error(`\nERRORES: ${problemas.length}`);
      process.exitCode = 1;
    } else {
      console.log('\nOK: desinstalar y Boveda con modal, estados vacios centrados, buscador flexible, panel lateral a la altura de Filtros y banner en la barra superior.');
    }
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('ERROR: ' + err.message);
  process.exit(1);
});

