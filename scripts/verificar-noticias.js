#!/usr/bin/env node
/**
 * Sonda de la pestaña Noticias (dueño, 24-10-2026).
 *
 * QUE COMPRUEBA
 *   1. Las funciones puras del módulo (`modules/noticias.js`): a qué versión va cada noticia, qué tipo
 *      de aviso es y cómo se limpia el HTML de los foros.
 *   2. El servidor de verdad (datos y puerto temporales): `/api/noticias?gameId=…` devuelve las noticias
 *      de ESE cliente; si los foros no contestan, responde un código en vez de reventar.
 *   3. La ventana (Electron + CDP, perfil temporal propio, servidor de pruebas): el botón «Noticias» del
 *      panel lateral pinta las tarjetas, «Actualizar» vuelve a pedirlas y cambiar de cliente pide las del
 *      cliente nuevo.
 *
 * Uso: node scripts/verificar-noticias.js
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const HTTP_PORT = 3987;
const CDP_PORT = 9353;
const PUERTO_SERVIDOR_REAL = 3988;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const apuntes = [];
const problemas = [];
const comprobar = (nombre, condicion, detalle = '') => {
  apuntes.push((condicion ? 'OK   ' : 'FALLO ') + nombre + (!condicion && detalle ? ' -> ' + detalle : ''));
  if (!condicion) problemas.push(nombre + (detalle ? ' -> ' + detalle : ''));
};

const noticiasMod = require(path.join(ROOT, 'modules', 'noticias.js'));

/* ---------------- 1. Funciones puras ---------------- */
comprobar('version: anuncio de Forever -> forever', noticiasMod.versionDe('Dive Into WoW: Forever, the Gods of Zul’Aman', '', 171) === 'forever');
comprobar('version: MoP -> classic', noticiasMod.versionDe('New Services Channel Coming to MoP Classic', '', 254) === 'classic');
comprobar('version: hotfixes de Classic -> classic_era', noticiasMod.versionDe('WoW Classic Era and Hardcore Hotfixes', '', 172) === 'classic_era');
comprobar('version: categoria de retail -> retail', noticiasMod.versionDe('Class Tuning Incoming', '', 171) === 'retail');
comprobar('version: categoria sin noticias -> null', noticiasMod.versionDe('Respuesta del staff en un hilo', '', 174) === null);
comprobar('version: podcast -> null', noticiasMod.versionDe('Our new podcast is live', '', 171) === null);
comprobar('tipo: hotfix -> patch', noticiasMod.tipoDe('Midnight Hotfixes - October 23', '') === 'patch');
comprobar('tipo: mantenimiento -> maintenance', noticiasMod.tipoDe('Scheduled Weekly Maintenance', '') === 'maintenance');
comprobar('tipo: test de estrés -> stress', noticiasMod.tipoDe('Stress Test on Friday', '') === 'stress');
comprobar('tipo: problemas conocidos -> issues', noticiasMod.tipoDe('Known Issues with the new patch', '') === 'issues');
comprobar('tipo: aviso normal -> announcement', noticiasMod.tipoDe('Watch the Motion Comic', '') === 'announcement');
comprobar('limpieza de HTML', noticiasMod.limpiarHtml('<p>Hola&hellip;</p>') === 'Hola...', noticiasMod.limpiarHtml('<p>Hola&hellip;</p>'));
comprobar('primera imagen del mensaje', noticiasMod.primeraImagen('<p><a href="x"><img src="https://bnetcmsus-a.akamaihd.net/x.png"></a></p>') === 'https://bnetcmsus-a.akamaihd.net/x.png');

/* ---------------- 2. Servidor de verdad (con red) ---------------- */
async function probarServidorReal() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-noticias-'));
  fs.writeFileSync(path.join(base, 'config.json'), JSON.stringify({
    activeGame: 'retail', rootWoWDir: '', wowDir: '', closeToTray: false, startMinimized: false,
    language: 'es', favorites: [], autoStart: false,
    games: {
      forever: { id: 'forever', name: 'WoW Forever', subtitle: '', icon: 'A', path: '', subfolder: '_forever_', flavorId: '88568' },
      retail: { id: 'retail', name: 'WoW Retail', subtitle: '', icon: 'B', path: '', subfolder: '_retail_', flavorId: '517' }
    }
  }, null, 2));

  const hijo = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { KORFORGE_PORT: String(PUERTO_SERVIDOR_REAL), KORFORGE_USER_DATA: base }),
    stdio: 'ignore'
  });

  const pedir = (ruta, token) => new Promise((ok, mal) => {
    const req = http.request({ hostname: '127.0.0.1', port: PUERTO_SERVIDOR_REAL, path: ruta, headers: token ? { 'X-KoRForge-Token': token } : {} }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {} ok({ status: res.statusCode, json: j }); });
    });
    req.on('error', mal);
    req.end();
  });

  try {
    let token = '';
    for (let i = 0; i < 40 && !token; i++) {
      await sleep(250);
      try { token = (await pedir('/api/session')).json?.token || ''; } catch (_) {}
    }
    if (!token) { comprobar('servidor real: arranca', false, 'no respondió /api/session'); return; }

    const forever = await pedir('/api/noticias?gameId=forever&forzar=1&limite=10', token);
    const retail = await pedir('/api/noticias?gameId=retail&forzar=1&limite=10', token);
    comprobar('servidor real: /api/noticias responde', forever.status === 200 && forever.json?.success === true, 'HTTP ' + forever.status);
    if (forever.json?.success) {
      comprobar('servidor real: devuelve la versión pedida', forever.json.version === 'forever');
      const lista = forever.json.noticias || [];
      apuntes.push('  noticias de forever: ' + lista.length + (lista[0] ? ' | primera: ' + JSON.stringify(lista[0].titulo).slice(0, 70) : ''));
      comprobar('servidor real: llegan noticias con título, fecha y enlace', lista.length > 0 && lista.every((n) => n.titulo && n.fecha && /^https:\/\//.test(n.enlace)));
      comprobar('servidor real: cada noticia trae su versión', lista.every((n) => n.version === 'forever'));
    }
    if (retail.json?.success) {
      const listaRetail = retail.json.noticias || [];
      apuntes.push('  noticias de retail: ' + listaRetail.length + (listaRetail[0] ? ' | primera: ' + JSON.stringify(listaRetail[0].titulo).slice(0, 70) : ''));
      comprobar('servidor real: retail pide otra lista (no la de forever)',
        listaRetail.length === 0 || !forever.json?.noticias?.length || listaRetail[0].id !== forever.json.noticias[0].id);
    }
  } finally {
    try { hijo.kill(); } catch (_) {}
    try { fs.rmSync(base, { recursive: true, force: true }); } catch (_) {}
  }
}

/* ---------------- 3. La ventana ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };

const CONFIG = {
  success: true, activeGame: 'forever', language: 'es', closeToTray: false,
  rootWoWDir: 'C:\\WoW', wowDir: 'C:\\WoW\\_forever_',
  games: {
    forever: { id: '88568', name: 'WoW Forever', subtitle: 'x', subfolder: '_forever_', path: 'C:\\WoW\\_forever_', icon: 'A', addonsExists: true, folderExists: true },
    retail: { id: '517', name: 'WoW Retail', subtitle: 'x', subfolder: '_retail_', path: 'C:\\WoW\\_retail_', icon: 'B', addonsExists: true, folderExists: true },
    classic_era: { id: '67408', name: 'Classic Era', subtitle: 'x', subfolder: '_classic_era_', path: '', icon: 'C', addonsExists: false, folderExists: false },
    classic: { id: '79434', name: 'Classic Prog', subtitle: 'x', subfolder: '_classic_', path: '', icon: 'D', addonsExists: false, folderExists: false }
  }
};

const NOTICIAS_PRUEBA = {
  forever: [
    { id: 'a1', titulo: 'Dive Into WoW: Forever', resumen: 'Todo lo que llega con el parche de Zul’Aman.', imagen: '', enlace: 'https://us.forums.blizzard.com/en/wow/t/a/1', fecha: new Date().toISOString(), autor: 'Linxy', version: 'forever', tipo: 'announcement' },
    { id: 'a2', titulo: 'Beta Realm Restart Today', resumen: 'Reinicio del reino beta a las 2:00 p.m. PDT.', imagen: '', enlace: 'https://us.forums.blizzard.com/en/wow/t/b/2', fecha: new Date(Date.now() - 3600e3).toISOString(), autor: 'Linxy', version: 'forever', tipo: 'maintenance' }
  ],
  retail: [
    { id: 'r1', titulo: 'Midnight Hotfixes - October 23', resumen: 'Arreglos de clases y de la Casa de Subastas.', imagen: '', enlace: 'https://us.forums.blizzard.com/en/wow/t/c/3', fecha: new Date().toISOString(), autor: 'Linxy', version: 'retail', tipo: 'patch' }
  ]
};

const llamadas = [];

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
    const json = (payload) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    };
    const conCuerpo = (cb) => {
      let datos = '';
      req.on('data', (c) => { datos += c; });
      req.on('end', () => cb(datos));
    };
    if (url.pathname.startsWith('/api/')) {
      /* POST /api/config de verdad: cambiar de cliente (lo usa switchActiveGame). */
      if (url.pathname === '/api/config' && req.method === 'POST') {
        return conCuerpo((cuerpo) => {
          let body = {};
          try { body = JSON.parse(cuerpo || '{}'); } catch (_) {}
          if (body.activeGame && CONFIG.games[body.activeGame]) CONFIG.activeGame = body.activeGame;
          return json({ success: true, activeGame: CONFIG.activeGame, games: CONFIG.games, config: CONFIG });
        });
      }
      if (url.pathname === '/api/config') return json(CONFIG);
      if (url.pathname === '/api/addons') return json({ success: true, addons: [] });
      if (url.pathname === '/api/favorites') return json({ success: true, favorites: [] });
      if (url.pathname === '/api/backups') return json({ success: true, backups: [] });
      if (url.pathname === '/api/search') return json({ success: true, results: [] });
      if (url.pathname === '/api/addons/check-updates') return json({ success: true, updates: [] });
      if (url.pathname === '/api/app-updates/check') return json({ source: 'local', checked: true, updateAvailable: false, currentVersion: '1.3.21' });
      if (url.pathname === '/api/noticias') {
        const version = url.searchParams.get('gameId') || 'forever';
        llamadas.push({ version, forzar: url.searchParams.get('forzar') });
        const lista = NOTICIAS_PRUEBA[version] || [];
        return json({ success: true, version, actualizado: new Date().toISOString(), total: lista.length, noticias: lista });
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
  /* Contratos del código. */
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  comprobar('index.html tiene el botón Noticias', /data-tab="news"/.test(html) && /id="pane-news"/.test(html));
  const css = fs.readFileSync(path.join(PUBLIC_DIR, 'style.css'), 'utf8');
  comprobar('el CSS tiene las tarjetas de noticias', /\.news-card \{/.test(css) && /\.news-list \{/.test(css));
  const serverJs = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  comprobar('server.js expone /api/noticias', serverJs.includes("app.get('/api/noticias'"));

  await probarServidorReal();

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
    `  const win = new BrowserWindow({ width: 1360, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(${JSON.stringify(ROOT)}, 'preload.js') } });`,
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

      const boton = document.querySelector('.nav-item[data-tab="news"]');
      out.pasos.push('boton lateral Noticias: ' + (boton ? JSON.stringify(boton.textContent.trim()) : 'NO EXISTE'));
      if (!boton) { fallo('no hay botón Noticias en el panel lateral'); return out; }
      boton.click();
      await sleep(1200);

      const pane = document.getElementById('pane-news');
      const tarjetas = [...document.querySelectorAll('#newsList .news-card')];
      out.pasos.push('pestaña activa: ' + !!(pane && pane.classList.contains('active')) + ' | tarjetas: ' + tarjetas.length);
      if (!pane || !pane.classList.contains('active')) fallo('la pestaña Noticias no se abre');
      if (tarjetas.length !== 2) fallo('no pinta las 2 noticias de prueba de WoW Forever');
      const primera = tarjetas[0];
      if (primera) {
        const titulo = primera.querySelector('.news-card-title');
        const etiqueta = primera.querySelector('.news-tag');
        const fecha = primera.querySelector('.news-date');
        const resumen = primera.querySelector('.news-card-summary');
        out.pasos.push('primera tarjeta: ' + JSON.stringify({
          titulo: titulo ? titulo.textContent : '',
          etiqueta: etiqueta ? etiqueta.textContent : '',
          fecha: fecha ? fecha.textContent : '',
          resumen: resumen ? resumen.textContent.slice(0, 40) : ''
        }));
        if (!titulo || !/Dive Into WoW: Forever/.test(titulo.textContent)) fallo('la primera tarjeta no tiene el titulo de la noticia');
        if (!etiqueta || !etiqueta.textContent.trim()) fallo('la tarjeta no lleva etiqueta de tipo');
        if (!fecha || !fecha.textContent.trim()) fallo('la tarjeta no lleva fecha');
        if (!resumen || !resumen.textContent.trim()) fallo('la tarjeta no lleva resumen');
      }

      const subtitulo = (document.getElementById('newsSubtitle') || {}).textContent || '';
      out.pasos.push('subtitulo: ' + JSON.stringify(subtitulo));
      if (!/WoW Forever/.test(subtitulo)) fallo('el subtitulo no dice el cliente activo');

      /* Actualizar vuelve a pedir. */
      document.getElementById('btnRefreshNews').click();
      await sleep(1200);
      out.pasos.push('tras Actualizar, tarjetas: ' + document.querySelectorAll('#newsList .news-card').length);

      /* Cambiar de cliente: la pestaña debe pedir las noticias del cliente nuevo. */
      document.querySelector('.game-version-pill[data-game-id="retail"]').click();
      await sleep(1800);
      const tarjetasRetail = [...document.querySelectorAll('#newsList .news-card')];
      const tituloRetail = tarjetasRetail[0] ? tarjetasRetail[0].querySelector('.news-card-title').textContent : '';
      out.pasos.push('tras cambiar a retail: ' + tarjetasRetail.length + ' tarjeta(s) | ' + JSON.stringify(tituloRetail));
      if (tarjetasRetail.length !== 1) fallo('al cambiar de cliente no carga las noticias del cliente nuevo');
      if (!/Midnight Hotfixes/.test(tituloRetail)) fallo('las noticias tras cambiar de cliente no son las de retail');

      /* Abrir una noticia: navegador interno con su URL. */
      tarjetasRetail[0].click();
      await sleep(1200);
      const url = (document.getElementById('browserCurrentUrl') || {}).textContent || '';
      out.pasos.push('al abrir la noticia, barra de direcciones: ' + JSON.stringify(url));
      if (!/us\\.forums\\.blizzard\\.com/.test(url)) fallo('abrir la noticia no llevo al navegador interno');

      return out;
    })()`);

    apuntes.push(...ui.pasos);
    problemas.push(...ui.problemas);
    apuntes.push('peticiones vistas por el servidor de pruebas: ' + JSON.stringify(llamadas));
    comprobar('la ventana pidió las noticias de forever', llamadas.some((l) => l.version === 'forever'));
    comprobar('la ventana pidió las noticias de retail al cambiar de cliente', llamadas.some((l) => l.version === 'retail'));
    comprobar('Actualizar fuerza la consulta (forzar=1)', llamadas.some((l) => l.forzar === '1'));
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
  console.log('\nOK: pestaña Noticias (foros de Blizzard por cliente, actualizar y abrir)');
})().catch((err) => { console.error('FALLO:', err.message); process.exit(1); });
