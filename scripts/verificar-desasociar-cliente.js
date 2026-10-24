#!/usr/bin/env node
/**
 * Sonda de «eliminar asociación» de un cliente (dueño, 24-10-2026).
 *
 * QUE COMPRUEBA
 *   1. SERVIDOR (HTTP de verdad, server.js con datos y puerto temporales):
 *      - `POST /api/config/unlink-game` olvida la ruta del cliente y lo marca desasociado;
 *      - esa marca MANDA sobre la ruta derivada de la raíz (si la carpeta existe bajo `rootWoWDir`,
 *        el cliente sigue desasociado: si no, el botón no serviría de nada);
 *      - guardar una ruta y la autodetección vuelven a asociarlo;
 *      - si se quita el cliente ACTIVO y queda otro con carpeta, la app se pasa a ese;
 *      - un cliente que no existe responde 400 `err_game_unknown`.
 *   2. INTERFAZ (Electron con CDP y perfil temporal propio, contra ese mismo servidor):
 *      - en cada tarjeta de Ajustes hay un botón DEBAJO de Guardar/Abrir;
 *      - pregunta antes (modal de la casa) y cancelar no cambia nada;
 *      - al quitar la asociación el cliente sale EN GRIS arriba (`is-sin-carpeta` + disabled) y en
 *        la tarjeta se lee «sin asociación»;
 *      - volver a guardar la ruta lo deja como estaba.
 *
 * Uso: node scripts/verificar-desasociar-cliente.js
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUERTO = 3977;
const CDP_PORT = 9343;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const apuntes = [];
const problemas = [];
const comprobar = (nombre, condicion, detalle = '') => {
  apuntes.push((condicion ? 'OK   ' : 'FALLO ') + nombre + (!condicion && detalle ? ' -> ' + detalle : ''));
  if (!condicion) problemas.push(nombre + (detalle ? ' -> ' + detalle : ''));
};

function peticion(metodo, ruta, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: PUERTO,
      method: metodo,
      path: ruta,
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'X-KoRForge-Token': token } : {})
    }, (res) => {
      let datos = '';
      res.on('data', (c) => { datos += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(datos); } catch (_) { /* no JSON */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
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
  const detalle = fs.existsSync(logSalida) ? fs.readFileSync(logSalida, 'utf8').slice(-700) : '(sin log)';
  throw new Error('CDP no arrancó. Electron dijo:\n' + detalle);
}

(async () => {
  /* --- Datos de prueba: dos clientes con carpeta, dos sin ella ------------- */
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'korforge-desasociar-'));
  const raiz = path.join(base, 'wow-root');
  const dirForever = path.join(base, 'wow-forever', '_forever_');
  const dirRetail = path.join(base, 'wow-retail', '_retail_');
  for (const d of [dirForever, dirRetail, path.join(raiz, '_retail_'), path.join(raiz, '_forever_')]) {
    fs.mkdirSync(path.join(d, 'Interface', 'AddOns'), { recursive: true });
  }

  const config = {
    activeGame: 'retail',
    rootWoWDir: raiz,
    games: {
      forever: { id: 'forever', name: 'WoW Forever', subtitle: '1.60.1', icon: 'A', path: dirForever, subfolder: '_forever_', flavorId: '88568', flavorName: 'Forever' },
      retail: { id: 'retail', name: 'WoW Retail', subtitle: '11.x', icon: 'B', path: dirRetail, subfolder: '_retail_', flavorId: '517', flavorName: 'Retail' },
      classic_era: { id: 'classic_era', name: 'Classic Era', subtitle: '1.15', icon: 'C', path: '', subfolder: '_classic_era_', flavorId: '67408', flavorName: 'Classic Era' },
      classic: { id: 'classic', name: 'Classic Prog', subtitle: 'Mists', icon: 'D', path: '', subfolder: '_classic_', flavorId: '79434', flavorName: 'Classic' }
    },
    wowDir: dirRetail,
    closeToTray: false,
    startMinimized: false,
    language: 'es',
    favorites: [],
    autoStart: false
  };
  fs.writeFileSync(path.join(base, 'config.json'), JSON.stringify(config, null, 2));

  const servidor = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { KORFORGE_PORT: String(PUERTO), KORFORGE_USER_DATA: base }),
    stdio: 'ignore'
  });

  let hijoElectron = null;
  const limpiar = () => {
    try { servidor.kill(); } catch (_) { /* nada */ }
    try { if (hijoElectron) hijoElectron.kill(); } catch (_) { /* nada */ }
    try { fs.rmSync(base, { recursive: true, force: true }); } catch (_) { /* en uso */ }
  };
  process.on('exit', limpiar);

  try {
    /* ---------------- 1. SERVIDOR ---------------- */
    let token = '';
    for (let i = 0; i < 40 && !token; i++) {
      await sleep(250);
      try {
        const r = await peticion('GET', '/api/session');
        if (r.json && r.json.token) token = r.json.token;
      } catch (_) { /* aún no */ }
    }
    if (!token) throw new Error('El servidor de pruebas no arrancó');

    const cfgInicial = await peticion('GET', '/api/config', { token });
    comprobar('el cliente retail empieza asociado', cfgInicial.json?.games?.retail?.folderExists === true && !cfgInicial.json.games.retail.unlinked);

    const desasociado = await peticion('POST', '/api/config/unlink-game', { token, body: { gameId: 'retail' } });
    const retail = desasociado.json?.games?.retail || {};
    comprobar('unlink-game responde success', desasociado.json?.success === true, JSON.stringify(desasociado.json).slice(0, 160));
    comprobar('el cliente queda marcado desasociado', retail.unlinked === true);
    comprobar('sin ruta efectiva (resolvedPath vacío)', retail.resolvedPath === '', retail.resolvedPath);
    comprobar('folderExists false aunque la carpeta exista bajo la raíz', retail.folderExists === false);
    comprobar('el cliente ACTIVO pasa al otro que sí tiene carpeta', desasociado.json?.activeGame === 'forever' && desasociado.json?.switchedTo === 'forever', 'activeGame=' + desasociado.json?.activeGame);

    const trasGuardar = await peticion('POST', '/api/config', { token, body: { games: { retail: { path: dirRetail } } } });
    comprobar('guardar la ruta vuelve a asociar el cliente', trasGuardar.json?.games?.retail?.unlinked === false || !trasGuardar.json?.games?.retail?.unlinked);
    comprobar('y otra vez hay carpeta', trasGuardar.json?.games?.retail?.folderExists === true);

    const otroSinRuta = await peticion('POST', '/api/config/unlink-game', { token, body: { gameId: 'classic' } });
    comprobar('quitar un cliente que no era el activo no cambia el activo', otroSinRuta.json?.success === true && otroSinRuta.json?.switchedTo === '' && otroSinRuta.json?.activeGame === 'forever');

    const malo = await peticion('POST', '/api/config/unlink-game', { token, body: { gameId: 'inventado' } });
    comprobar('cliente desconocido -> 400 err_game_unknown', malo.status === 400 && malo.json?.code === 'err_game_unknown', malo.status + ' ' + (malo.json?.code || ''));

    /* La marca tiene que mandar sobre la ruta DERIVADA de la raíz: en <raiz>/_retail_ hay
       Interface/AddOns, así que sin la marca el cliente volvería a contar como asociado. */
    await peticion('POST', '/api/config/unlink-game', { token, body: { gameId: 'retail' } });
    const derivada = await peticion('GET', '/api/config', { token });
    comprobar('la marca manda sobre la carpeta que existe bajo la raíz', derivada.json?.games?.retail?.folderExists === false && derivada.json?.games?.retail?.unlinked === true);

    const detectado = await peticion('POST', '/api/config/auto-detect', { token, body: { rootDir: raiz } });
    comprobar('la autodetección vuelve a asociar el cliente', detectado.json?.games?.retail?.unlinked === false || !detectado.json?.games?.retail?.unlinked);

    /* ---------------- 2. INTERFAZ ---------------- */
    // Se deja el escenario que interesa para la ventana: retail activo y con carpeta.
    await peticion('POST', '/api/config', { token, body: { activeGame: 'retail', games: { retail: { path: dirRetail }, forever: { path: dirForever } } } });

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
      `  const win = new BrowserWindow({ width: 1400, height: 950, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(${JSON.stringify(ROOT)}, 'preload.js') } });`,
      `  win.loadURL('http://127.0.0.1:${PUERTO}/?token=${token}');`,
      "  win.webContents.on('console-message', (e, nivel, mensaje) => console.log('[renderer]', nivel, mensaje));",
      '});',
      'app.on("window-all-closed", () => app.quit());'
    ].join('\n'), 'utf8');

    const salida = fs.openSync(logEl, 'w');
    hijoElectron = spawn(electronBinary(), [mainFile], { cwd: ROOT, stdio: ['ignore', salida, salida] });

    const target = await primerTarget(logEl);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, mal) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', mal, { once: true }); });
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await sleep(3500);

    const ui = await cdp.evaluate(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const out = { pasos: [], problemas: [] };
      const fallo = (t) => out.problemas.push(t);
      const tarjetaDe = (id) => document.querySelector('.game-manage-item[data-game-id="' + id + '"]');
      const pillDe = (id) => document.querySelector('.game-version-pill[data-game-id="' + id + '"]');
      const modal = () => document.getElementById('confirmModal');

      document.querySelector('.nav-item[data-tab="settings"]').click();
      await sleep(900);

      const tarjetaRetail = tarjetaDe('retail');
      if (!tarjetaRetail) { fallo('no hay tarjeta del cliente retail en Ajustes'); return out; }
      const boton = tarjetaRetail.querySelector('.btn-unlink-game');
      out.pasos.push('boton de quitar asociacion: ' + (boton ? JSON.stringify(boton.textContent.trim()) : 'NO EXISTE'));
      if (!boton) { fallo('la tarjeta no tiene boton de eliminar asociacion'); return out; }

      const filaIpRow = tarjetaRetail.querySelector('.game-manage-input-row');
      const filaBoton = boton.closest('.game-manage-input-row');
      const r1 = filaIpRow.getBoundingClientRect();
      const r2 = filaBoton.getBoundingClientRect();
      out.pasos.push('debajo de Guardar/Abrir: fila input bottom=' + Math.round(r1.bottom) + ' boton top=' + Math.round(r2.top));
      if (r2.top < r1.bottom - 1) fallo('el boton no esta debajo de Guardar/Abrir');

      /* Cancelar no cambia nada. */
      boton.click();
      await sleep(400);
      const modalAbierto = modal() && modal().style.display !== 'none';
      out.pasos.push('modal antes de quitar: ' + modalAbierto + ' | ' + JSON.stringify((document.getElementById('confirmText') || {}).textContent || ''));
      if (!modalAbierto) fallo('no pregunto antes de quitar la asociacion');
      document.getElementById('btnConfirmCancel').click();
      await sleep(500);
      if (pillDe('retail').classList.contains('is-sin-carpeta')) fallo('cancelar dejo el cliente desasociado');

      /* Quitar de verdad el cliente ACTIVO: tiene que pasar a WoW Forever y salir en gris. */
      tarjetaRetail.querySelector('.btn-unlink-game').click();
      await sleep(400);
      document.getElementById('btnConfirmOk').click();
      await sleep(1600);

      const pillRetail = pillDe('retail');
      const pillForever = pillDe('forever');
      out.pasos.push('tras quitar: retail clases=' + JSON.stringify(pillRetail.className) + ' disabled=' + pillRetail.disabled + ' | forever activo=' + pillForever.classList.contains('active'));
      if (!pillRetail.classList.contains('is-sin-carpeta')) fallo('el cliente quitado no sale en gris arriba');
      if (!pillRetail.disabled) fallo('el cliente quitado se puede seguir eligiendo arriba');
      if (!pillForever.classList.contains('active')) fallo('la app no paso al otro cliente con carpeta');

      const tarjetaTras = tarjetaDe('retail');
      const estado = tarjetaTras.querySelector('.status-txt');
      out.pasos.push('estado en la tarjeta: ' + JSON.stringify(estado ? estado.textContent.trim() : ''));
      if (!estado || !/Sin asociación/i.test(estado.textContent)) fallo('la tarjeta no dice que el cliente quedo sin asociacion');
      if (tarjetaTras.querySelector('.btn-unlink-game')) fallo('sigue saliendo el boton de quitar asociacion');

      const tostadas = [...document.querySelectorAll('#toastContainer .toast')].map(t => t.textContent.trim());
      out.pasos.push('avisos: ' + JSON.stringify(tostadas));
      if (!tostadas.some(t => /Asociación quitada/i.test(t))) fallo('no aviso de que se quito la asociacion');

      /* Y volver a asociarlo guardando la ruta. */
      const input = tarjetaTras.querySelector('.game-path-input');
      input.value = ${JSON.stringify(dirRetail)};
      tarjetaTras.querySelector('.btn-save-game-path').click();
      await sleep(1500);
      const pillRetail2 = pillDe('retail');
      out.pasos.push('tras volver a guardar: clases=' + JSON.stringify(pillRetail2.className) + ' disabled=' + pillRetail2.disabled);
      if (pillRetail2.classList.contains('is-sin-carpeta') || pillRetail2.disabled) fallo('guardar la ruta no volvio a asociar el cliente arriba');
      return out;
    })()`);

    apuntes.push(...ui.pasos);
    for (const p of ui.problemas) problemas.push(p);
  } finally {
    limpiar();
    await sleep(400);
  }

  console.log('\n== apuntes ==');
  for (const a of apuntes) console.log('  .', a);
  if (problemas.length) {
    console.log('\nPROBLEMAS:');
    for (const p of problemas) console.log('  -', p);
    process.exit(1);
  }
  console.log('\nOK: eliminar asociacion (servidor, gris arriba y volver a asociar)');
})().catch((err) => {
  console.error('FALLO:', err.message);
  process.exit(1);
});
