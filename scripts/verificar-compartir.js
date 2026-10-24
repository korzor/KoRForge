#!/usr/bin/env node
/**
 * Sonda del botón de compartir un addon (dueño, 25-10-2026).
 *
 * Comprueba, con public/ servido en local y Electron con CDP y PERFIL TEMPORAL PROPIO (nunca el de
 * la app instalada):
 *   1. De dónde sale el enlace: `sourceUrl` de la API, o el `issuesUrl`/`wikiUrl` si apuntan a un
 *      repositorio; y que SIN repositorio no se invente ninguna URL de CurseForge.
 *   2. Las tres vistas: tarjeta del catálogo, ficha del addon y «Mis addons».
 *   3. Que el icono mide lo mismo que el de favoritos (32x32 el botón, 17px el dibujo).
 *   4. Copiar de verdad: el texto acaba en el portapapeles del sistema (se pega y se lee).
 *   5. Escape cierra el menú.
 *
 * Uso: node scripts/verificar-compartir.js
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const HTTP_PORT = 3975;
const CDP_PORT = 9341;
const NOW = new Date().toISOString();
const REPO = 'https://github.com/Tercioo/Details-Damage-Meter';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CONFIG = {
  success: true, activeGame: 'forever', language: 'es', closeToTray: false,
  rootWoWDir: 'C:\\WoW', wowDir: 'C:\\WoW\\_forever_',
  games: {
    forever: { id: '88568', name: 'WoW Forever', subtitle: 'x', subfolder: '_forever_', path: 'C:\\WoW\\_forever_', icon: 'A', addonsExists: true, folderExists: true },
    retail: { id: '517', name: 'WoW Retail', subtitle: 'x', subfolder: '_retail_', path: '', icon: 'B', addonsExists: false, folderExists: false },
    classic_era: { id: '67408', name: 'Classic Era', subtitle: 'x', subfolder: '_classic_era_', path: '', icon: 'C', addonsExists: false, folderExists: false },
    classic: { id: '79434', name: 'Classic Prog', subtitle: 'x', subfolder: '_classic_', path: '', icon: 'D', addonsExists: false, folderExists: true },
  },
};

// Tres addons: con sourceUrl, solo con issuesUrl (GitHub) y sin nada de nada.
const MOD_CON_REPO = {
  id: 1, name: 'Details', slug: 'details', summary: 'Medidor de dano', downloadCount: 10,
  iconUrl: '', author: 'Tercioo', version: '1.2.3', sourceUrl: REPO, issuesUrl: REPO + '/issues', wikiUrl: '',
  websiteUrl: 'https://www.curseforge.com/wow/addons/details', categories: [], dateModified: NOW, dateCreated: NOW,
};
const MOD_SOLO_ISSUES = {
  id: 2, name: 'AtlasLoot Classic', slug: 'atlasloot', summary: 'Botin', downloadCount: 20,
  iconUrl: '', author: 'Hoizame', version: '2.0.1', sourceUrl: '',
  issuesUrl: 'https://github.com/Hoizame/AtlasLootClassic/issues', wikiUrl: '',
  websiteUrl: 'https://www.curseforge.com/wow/addons/atlasloot', categories: [], dateModified: NOW, dateCreated: NOW,
};
const MOD_SIN_NADA = {
  id: 3, name: 'RestedXP Guide', slug: 'restedxp-guide', summary: 'Guias', downloadCount: 30,
  iconUrl: '', author: 'Desconocido', version: '4.5.6', sourceUrl: '', issuesUrl: '', wikiUrl: '',
  websiteUrl: 'https://www.curseforge.com/wow/addons/restedxp-guide', categories: [], dateModified: NOW, dateCreated: NOW,
};

const ADDON_INSTALADO = { folderName: 'Details', actualName: 'Details', title: 'Details', version: '1.2.3', enabled: true, notes: '', modId: 1, hasMissingDeps: false, compatibility: null, missingDependencies: [], dependencies: [] };

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
    const json = (payload) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    };
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/config') return json(CONFIG);
      if (url.pathname === '/api/addons') return json({ success: true, addons: [ADDON_INSTALADO] });
      if (url.pathname === '/api/search') return json({ success: true, results: [MOD_CON_REPO, MOD_SOLO_ISSUES, MOD_SIN_NADA] });
      if (url.pathname === '/api/favorites') return json({ success: true, favorites: [MOD_CON_REPO] });
      if (url.pathname === '/api/backups') return json({ success: true, backups: [] });
      if (url.pathname === '/api/mod/1') return json({ success: true, mod: MOD_CON_REPO });
      if (url.pathname === '/api/mod/1/files') return json({ success: true, files: [] });
      if (url.pathname === '/api/mod/1/description') return json({ success: true, html: '<p>Descripcion de prueba.</p>' });
      if (url.pathname === '/api/mod/1/translation') return json({ success: true, translation: {} });
      if (url.pathname === '/api/app-updates/check') return json({ source: 'local', checked: true, updateAvailable: false, currentVersion: '1.3.17' });
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
    "ipcMain.handle('korforge:copiar-texto', (evento, texto) => {",
    "  try { const valor = String(texto == null ? '' : texto).slice(0, 2000); if (!valor.trim()) return false; clipboard.writeText(valor); return true; } catch (_) { return false; }",
    '});',
    "ipcMain.handle('korforge:portapapeles-hay-texto', () => { try { return String(clipboard.readText() || '').length > 0; } catch (_) { return false; } });",
    'app.whenReady().then(() => {',
    '  console.log("whenReady");',
    `  const win = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(${JSON.stringify(ROOT)}, 'preload.js') } });`,
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

  /* 1. Contratos del código, sin arrancar nada. */
  const mainJs = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  if (!mainJs.includes('korforge:copiar-texto')) problemas.push('main.js no registra korforge:copiar-texto');
  const preload = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
  if (!preload.includes('copiarTexto')) problemas.push('preload.js no expone portapapeles.copiarTexto');
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  if (!html.includes('compartir.js')) problemas.push('index.html no carga compartir.js');
  if (!html.includes('id="btnDetailShare"')) problemas.push('index.html no tiene el boton de compartir de la ficha');
  if (!html.includes('data-i18n="detail_share"')) problemas.push('el boton de la ficha no pasa su texto por i18n');
  apuntes.push('contratos main/preload/index.html: ' + (problemas.length ? 'FALLA' : 'ok'));

  const css = fs.readFileSync(path.join(PUBLIC_DIR, 'style.css'), 'utf8');
  const ancho = (bloque, prop) => {
    const m = bloque.match(new RegExp(prop + ':\\s*([0-9.]+)px'));
    return m ? Number(m[1]) : null;
  };
  const bloqueFav = (css.match(/\.btn-card-fav \{[^}]*\}/) || [''])[0];
  const bloqueShare = (css.match(/\.btn-card-share \{[^}]*\}/) || [''])[0];
  const iconoFav = (css.match(/\.fav-star-icon \{[^}]*\}/) || [''])[0];
  const iconoShare = (css.match(/\.share-icon \{[^}]*\}/) || [''])[0];
  if (ancho(bloqueFav, 'width') !== 32) problemas.push('el boton de favoritos ya no mide 32px: la sonda se quedo vieja');
  if (ancho(bloqueShare, 'width') !== 32) problemas.push('.btn-card-share debe medir 32px como el de favoritos');
  if (ancho(iconoShare, 'width') !== ancho(iconoFav, 'width')) problemas.push('.share-icon debe medir lo mismo que .fav-star-icon');
  apuntes.push('tamanos css: compartir ' + ancho(bloqueShare, 'width') + 'px / icono ' + ancho(iconoShare, 'width') + 'px (favoritos ' + ancho(bloqueFav, 'width') + 'px / ' + ancho(iconoFav, 'width') + 'px)');

  const server = await startStaticServer();
  const { child, tmpDir, perfilDir, logSalida } = startElectron();
  let cdp = null;
  try {
    const target = await primerTarget(logSalida);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, mal) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', mal, { once: true }); });
    cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await sleep(3000);

    const resultado = await cdp.evaluate(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const out = { pasos: [], problemas: [] };
      const caja = () => document.getElementById('korforge-menu-compartir');
      const entradas = () => [...document.querySelectorAll('#korforge-menu-compartir .kf-menu-item')]
        .map(b => b.querySelector('.kf-menu-etiqueta').textContent);
      const pulsar = (texto) => {
        const b = [...document.querySelectorAll('#korforge-menu-compartir .kf-menu-item')]
          .find(x => x.querySelector('.kf-menu-etiqueta').textContent === texto);
        if (!b) return false;
        b.click();
        return true;
      };

      const K = window.KorforgeCompartir;
      if (!K) { out.problemas.push('no existe window.KorforgeCompartir (compartir.js no cargo)'); return out; }

      /* A. De donde sale el enlace. */
      const soloRepos = K.repoDe({ sourceUrl: '${REPO}' });
      const porIssues = K.repoDe({ sourceUrl: '', issuesUrl: 'https://github.com/Hoizame/AtlasLootClassic/issues' });
      const sinNada = K.repoDe({ sourceUrl: '', issuesUrl: '', wikiUrl: '', websiteUrl: 'https://www.curseforge.com/wow/addons/x' });
      const soloWikiCurse = K.repoDe({ wikiUrl: 'https://www.curseforge.com/wow/addons/x/wiki' });
      out.pasos.push('repoDe: sourceUrl=' + soloRepos + ' | issuesUrl=' + porIssues + ' | sin nada="' + sinNada + '" | wiki de Curse="' + soloWikiCurse + '"');
      if (soloRepos !== '${REPO}') out.problemas.push('repoDe no usa sourceUrl');
      if (porIssues !== 'https://github.com/Hoizame/AtlasLootClassic') out.problemas.push('repoDe no saca el repo del issuesUrl');
      if (sinNada) out.problemas.push('repoDe inventa una URL cuando el addon no declara repositorio');
      if (soloWikiCurse) out.problemas.push('repoDe acepta un wiki de CurseForge como repositorio');

      /* B. Textos que se comparten. */
      const conEnlace = K.textoConEnlace({ name: 'Details', version: '1.2.3', sourceUrl: '${REPO}' });
      const sinEnlace = K.textoSinEnlace({ name: 'RestedXP Guide', version: '4.5.6', author: 'Ana' });
      const sinEnlaceSinAutor = K.textoSinEnlace({ name: 'RestedXP Guide', version: '1.2', author: 'Desconocido' });
      out.pasos.push('texto con enlace: ' + JSON.stringify(conEnlace));
      out.pasos.push('texto sin enlace: ' + JSON.stringify(sinEnlace));
      if (conEnlace !== 'Details v1.2.3 · ${REPO}') out.problemas.push('textoConEnlace no es nombre + version + repositorio');
      if (/curseforge/i.test(conEnlace) || /curseforge/i.test(sinEnlace)) out.problemas.push('el texto compartido cita CurseForge');
      if (sinEnlace !== 'RestedXP Guide v4.5.6 · Ana') out.problemas.push('textoSinEnlace no es nombre + version + autor: ' + sinEnlace);
      if (/Desconocido/.test(sinEnlaceSinAutor)) out.problemas.push('textoSinEnlace comparte el autor generico Desconocido');

      /* C. Busqueda en GitHub: una busqueda de verdad, no una pagina de Curse. */
      const busqueda = K.urlBusquedaGithub({ name: 'RestedXP Guide' });
      out.pasos.push('busqueda: ' + busqueda);
      if (!/^https:\\/\\/github\\.com\\/search\\?q=/.test(busqueda)) out.problemas.push('la busqueda no es de github.com/search');
      if (!busqueda.includes('%22RestedXP%20Guide%22')) out.problemas.push('la busqueda no lleva el nombre del addon entre comillas');

      /* D. Tarjeta del catalogo: buscar y abrir el menu del primer addon (con repositorio). */
      document.querySelector('.nav-item[data-tab="search"]').click();
      await sleep(600);
      const inp = document.getElementById('cfSearchInput');
      inp.value = 'details';
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await sleep(900);

      const tarjetas = [...document.querySelectorAll('#cfResultsGrid .cf-card')];
      out.pasos.push('tarjetas del catalogo: ' + tarjetas.length);
      if (tarjetas.length !== 3) out.problemas.push('no se pintaron las 3 tarjetas de prueba');

      const botonCompartir = tarjetas[0] ? tarjetas[0].querySelector('.btn-card-share') : null;
      const botonFav = tarjetas[0] ? tarjetas[0].querySelector('.btn-card-fav') : null;
      if (!botonCompartir) out.problemas.push('la tarjeta del catalogo no tiene boton de compartir');
      if (botonCompartir && botonFav) {
        const a = botonCompartir.getBoundingClientRect();
        const b = botonFav.getBoundingClientRect();
        const ia = botonCompartir.querySelector('.share-icon').getBoundingClientRect();
        const ib = botonFav.querySelector('.fav-star-icon').getBoundingClientRect();
        out.pasos.push('tamanos en pantalla: compartir ' + Math.round(a.width) + 'x' + Math.round(a.height) + ' icono ' + Math.round(ia.width) + 'px | favoritos ' + Math.round(b.width) + 'x' + Math.round(b.height) + ' icono ' + Math.round(ib.width) + 'px');
        if (Math.round(a.width) !== Math.round(b.width) || Math.round(a.height) !== Math.round(b.height)) out.problemas.push('el boton de compartir no mide lo mismo que el de favoritos');
        if (Math.round(ia.width) !== Math.round(ib.width)) out.problemas.push('el icono de compartir no mide lo mismo que el de favoritos');
      }

      botonCompartir.click();
      await sleep(400);
      const abierto = !!caja() && !caja().hidden;
      const lista = abierto ? entradas() : [];
      out.pasos.push('menu en la tarjeta: ' + JSON.stringify(lista));
      if (!abierto) out.problemas.push('el menu de compartir no se abrio desde la tarjeta');
      if (!lista.some(t => /Copiar nombre y enlace/.test(t))) out.problemas.push('falta Copiar nombre y enlace');
      if (!lista.some(t => /Abrir repositorio/.test(t))) out.problemas.push('falta Abrir repositorio');
      if (lista.some(t => /Buscar en GitHub/.test(t))) out.problemas.push('con repositorio declarado no debe ofrecerse Buscar en GitHub');

      /* E. Copiar de verdad: se pega en un campo y se lee. */
      if (!pulsar('Copiar nombre y enlace')) out.problemas.push('no pude pulsar Copiar nombre y enlace');
      await sleep(500);
      const campo = document.createElement('textarea');
      campo.id = 'campo-de-prueba-compartir';
      document.body.appendChild(campo);
      campo.focus();
      campo.value = '';
      await window.electronAPI.portapapeles.pegar();
      await sleep(250);
      const pegado = campo.value;
      campo.remove();
      out.pasos.push('portapapeles: ' + JSON.stringify(pegado));
      if (pegado !== 'Details v1.2.3 · ${REPO}') out.problemas.push('el portapapeles no tiene el texto de compartir: ' + JSON.stringify(pegado));

      const tostada = document.querySelector('#toastContainer .toast');
      out.pasos.push('aviso en pantalla: ' + JSON.stringify(tostada ? tostada.textContent.trim() : ''));

      /* F. Escape cierra el menu. */
      botonCompartir.click();
      await sleep(300);
      const antes = !!caja() && !caja().hidden;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(250);
      const despues = !!caja() && !caja().hidden;
      out.pasos.push('escape: antes=' + antes + ' despues=' + despues);
      if (!antes || despues) out.problemas.push('Escape no cerro el menu de compartir');

      /* G. Un addon sin repositorio: buscqueda en GitHub y copiar nombre y version. */
      const sinRepo = tarjetas[2] ? tarjetas[2].querySelector('.btn-card-share') : null;
      if (!sinRepo) out.problemas.push('la tercera tarjeta no tiene boton de compartir');
      else {
        sinRepo.click();
        await sleep(400);
        const listaSin = entradas();
        out.pasos.push('menu sin repositorio: ' + JSON.stringify(listaSin));
        if (!listaSin.some(t => /Buscar en GitHub/.test(t))) out.problemas.push('sin repositorio falta Buscar en GitHub');
        if (listaSin.some(t => /Abrir repositorio/.test(t))) out.problemas.push('sin repositorio no debe ofrecerse Abrir repositorio');
        if (!pulsar('Copiar nombre y versión')) out.problemas.push('no pude pulsar Copiar nombre y version');
        await sleep(500);
        const campo2 = document.createElement('textarea');
        document.body.appendChild(campo2);
        campo2.focus();
        campo2.value = '';
        await window.electronAPI.portapapeles.pegar();
        await sleep(250);
        const pegado2 = campo2.value;
        campo2.remove();
        out.pasos.push('copiado sin repositorio: ' + JSON.stringify(pegado2));
        if (!/^RestedXP Guide v4\\.5\\.6$/.test(pegado2)) out.problemas.push('sin repositorio se copio otra cosa: ' + JSON.stringify(pegado2));
      }

      /* H. La ficha del addon: boton propio en la barra de acciones. */
      tarjetas[0].click();
      await sleep(1200);
      const btnDetalle = document.getElementById('btnDetailShare');
      const vistaDetalle = document.getElementById('cfDetailView');
      out.pasos.push('ficha abierta: ' + !!(vistaDetalle && vistaDetalle.style.display !== 'none') + ' boton: ' + !!btnDetalle);
      if (!btnDetalle) out.problemas.push('la ficha no tiene boton de compartir');
      else {
        btnDetalle.click();
        await sleep(400);
        const listaDetalle = entradas();
        out.pasos.push('menu en la ficha: ' + JSON.stringify(listaDetalle));
        if (!listaDetalle.some(t => /Copiar enlace del repositorio/.test(t))) out.problemas.push('en la ficha falta Copiar enlace del repositorio');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(200);
      }

      /* I. Mis addons: el boton de la tarjeta del addon instalado, que pregunta al catalogo. */
      document.querySelector('.nav-item[data-tab="addons"]').click();
      await sleep(900);
      const btnInstalado = document.querySelector('.btn-addon-share');
      out.pasos.push('mis addons tiene boton de compartir: ' + !!btnInstalado);
      if (!btnInstalado) out.problemas.push('Mis addons no tiene boton de compartir');
      else {
        /* El dibujo de esa tarjeta tiene que ir a LÍNEA (antes los círculos salían como puntos negros,
           dueño 24-10-2026). */
        const svg = btnInstalado.querySelector('svg');
        const estilo = getComputedStyle(svg);
        const circulo = getComputedStyle(svg.querySelector('circle'));
        out.pasos.push('icono de instalados: fill=' + estilo.fill + ' stroke=' + circulo.stroke + ' ancho=' + estilo.strokeWidth);
        if (circulo.fill !== 'none') out.problemas.push('el icono de compartir de Mis addons sale RELLENO (puntos negros): fill=' + circulo.fill);
        if (circulo.stroke === 'none') out.problemas.push('el icono de compartir de Mis addons no tiene trazo');

        btnInstalado.click();
        await sleep(900);
        const listaInstalado = entradas();
        out.pasos.push('menu en Mis addons: ' + JSON.stringify(listaInstalado));
        if (!listaInstalado.some(t => /Abrir repositorio/.test(t))) out.problemas.push('el addon instalado no saco su repositorio del catalogo');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(200);
      }

      /* J. Favoritos: sus tarjetas tienen que llevar también el botón de compartir. */
      document.querySelector('.nav-item[data-tab="favorites"]').click();
      await sleep(1000);
      const tarjetasFav = [...document.querySelectorAll('#favoritesTabGrid .cf-card')];
      const btnFavCompartir = document.querySelector('#favoritesTabGrid .btn-card-share');
      out.pasos.push('favoritos: ' + tarjetasFav.length + ' tarjeta(s) | boton de compartir: ' + !!btnFavCompartir);
      if (!tarjetasFav.length) out.problemas.push('la pestaña Favoritos no pinto ninguna tarjeta');
      if (!btnFavCompartir) out.problemas.push('las tarjetas de Favoritos no tienen boton de compartir');
      else {
        btnFavCompartir.click();
        await sleep(400);
        const listaFav = entradas();
        out.pasos.push('menu en Favoritos: ' + JSON.stringify(listaFav));
        if (!listaFav.length) out.problemas.push('el boton de compartir de Favoritos no abre el menu');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(200);
      }

      return out;
    })()`);

    apuntes.push(...resultado.pasos);
    problemas.push(...resultado.problemas);
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
  console.log('\nOK: boton de compartir (enlace del autor, copiar de verdad y las tres vistas)');
})().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
