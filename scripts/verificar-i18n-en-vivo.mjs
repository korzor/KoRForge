#!/usr/bin/env node
/**
 * Verificación EN VIVO de los idiomas de KoRForge.
 *
 * Arranca un servidor de pruebas que sirve `public/` y responde a /api/* con datos falsos
 * (un addon instalado, resultados de catálogo, backups, una actualización disponible…),
 * abre la app en Electron sin mostrar ventana y comprueba en el DOM real:
 *
 *   1. ESTÁTICO: cada data-i18n / -html / -placeholder / -title / -alt lleva el texto del
 *      diccionario en los cinco idiomas, y el título de la ventana también.
 *   2. DINÁMICO: recorre todas las pestañas, abre una ficha, los tres modales y lanza un
 *      aviso, y comprueba que en inglés NO queda ni un texto en español ni una clave cruda.
 *   3. CAMBIO: pasar de español a inglés cambia el texto de verdad.
 *
 * Uso: node scripts/verificar-i18n-en-vivo.mjs [--keep]
 * Sale con código 1 si algo falla.
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const KEEP = process.argv.includes('--keep');

const HTTP_PORT = 3951;
const CDP_PORT = 9334;

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

// ------------------------------------------------------------------ datos falsos
const NOW = new Date().toISOString();

const FAKE = {
  config: {
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
  },
  addons: {
    success: true,
    addons: [{
      folderName: 'Details',
      actualName: 'Details',
      title: 'Details',
      version: '1.2.3',
      enabled: true,
      notes: '',
      modId: 123,
      hasMissingDeps: true,
      compatibility: { status: 'warning', code: 'forever_classic', interfaces: [11500] },
      missingDependencies: ['LibFoo'],
      dependencies: ['Ace3', 'LibBar']
    }]
  },
  search: {
    success: true,
    results: [{
      id: 1,
      name: 'Details',
      slug: 'details',
      author: 'Someone',
      summary: '',
      downloadCount: 123456,
      dateModified: NOW,
      version: '1.2.3',
      iconUrl: '',
      categories: [{ name: 'Combat' }]
    }]
  },
  mod: {
    success: true,
    mod: {
      id: 1, name: 'Details', author: 'Someone', summary: '', downloadCount: 123456,
      dateModified: NOW, dateCreated: NOW, version: '1.2.3', iconUrl: '',
      sourceUrl: 'https://example.com/repo', wikiUrl: '', issuesUrl: '', screenshots: []
    }
  },
  files: {
    success: true,
    files: [{
      displayName: 'Details-1.2.3.zip', fileName: 'Details.zip', releaseType: 1, releaseTypeLabel: 'Release',
      fileDate: NOW, fileLength: '1.0 MB', downloadCount: 99, downloadUrl: 'https://example.com/f.zip',
      gameVersions: ['1.60.1']
    }]
  },
  backups: { success: true, backups: [{ fileName: 'WTF-2026-10-20.zip', date: '20-10-2026', sizeMb: 12 }] },
  appUpdates: {
    source: 'github', checked: true, updateAvailable: true, currentVersion: '1.0.0',
    remoteVersion: '1.1.0', downloadUrl: 'https://example.com/KoRForge-Setup-1.1.0.exe',
    releaseNotes: '## KoRForge v1.1.0\n\n### Cambios\n- Uno\n- Dos\n'
  },
  profileExport: { success: true, code: 'KORP-abc123', profile: { title: 'Pack' } },
  profileAnalyze: {
    success: true,
    analysis: { title: 'Pack de prueba', gameName: 'WoW Forever', totalCount: 3, alreadyInstalledCount: 1, missingCount: 2, missing: [{ name: 'A', title: 'A', version: '1.0', canInstall: true }, { name: 'B', title: 'B', version: '1.0', canInstall: false }] }
  }
};

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
    const json = (payload) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    };

    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/config') return json(FAKE.config);
      if (url.pathname === '/api/addons') return json(FAKE.addons);
      if (url.pathname === '/api/search') return json(FAKE.search);
      if (url.pathname === '/api/backups') return json(FAKE.backups);
      if (url.pathname === '/api/favorites') return json({ success: true, favorites: [] });
      if (url.pathname === '/api/mod/1') return json(FAKE.mod);
      if (url.pathname === '/api/mod/1/description') return json({ success: true, html: '<p>Texto de prueba</p>' });
      if (url.pathname === '/api/mod/1/files') return json(FAKE.files);
      if (url.pathname === '/api/mod/1/translation') return json({ success: true, translation: {} });
      if (url.pathname === '/api/app-updates/check') return json(FAKE.appUpdates);
      if (url.pathname === '/api/profiles/export') return json(FAKE.profileExport);
      if (url.pathname === '/api/profiles/analyze') return json(FAKE.profileAnalyze);
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'korforge-i18n-'));
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

  const child = spawn(electronBinary(), [mainFile], {
    cwd: ROOT,
    stdio: 'ignore'
  });
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
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'Error al evaluar en la página');
    }
    return result.result.value;
  }

  close() {
    try { this.ws.close(); } catch (_) {}
  }
}

const CHECK_SCRIPT = `(async () => {
  const I = window.I18N;
  if (!I) return { fatal: 'window.I18N no existe' };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const langs = Object.keys(I.LANGS);
  const problems = [];
  const summary = {};

  // ---------- 1. Estático ----------
  const attrs = [
    ['data-i18n', 'textContent'],
    ['data-i18n-html', 'innerHTML'],
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-title', 'title'],
    ['data-i18n-alt', 'alt']
  ];

  for (const lang of langs) {
    I.setLanguage(lang);
    let checked = 0;
    for (const [attr, prop] of attrs) {
      document.querySelectorAll('[' + attr + ']').forEach((el) => {
        const key = el.getAttribute(attr);
        const expected = I.t(key);
        const actual = (prop === 'placeholder' || prop === 'title' || prop === 'alt') ? el.getAttribute(prop) : el[prop];
        checked++;
        if (String(actual || '').trim() !== String(expected || '').trim()) {
          problems.push(lang + ' · ' + attr + '="' + key + '" → "' + String(actual).slice(0, 45) + '" (esperado "' + String(expected).slice(0, 45) + '")');
        }
      });
    }
    if (document.title !== I.t('doc_title')) problems.push(lang + ' · document.title incorrecto: "' + document.title + '"');
    if (document.documentElement.lang !== lang) problems.push(lang + ' · <html lang> es "' + document.documentElement.lang + '"');
    summary[lang] = { checked, sample: [I.t('nav_search'), I.t('btn_search'), I.t('settings_lang_title')] };
  }

  // ---------- 2. Dinámico en inglés ----------
  I.setLanguage('en');
  await sleep(600);

  const SPANISH_WORDS = /(Actualizar|Instalar|Instalando|Desinstalar|Cerrar|Carpeta|Versión|Versiones|Buscar|Todos|Activos|Desactivados|Error al|Error en|Descargando|Instalado|Instalar|Ruta|Guardar|Eliminar|Borrar|Restaurar|Añadir|Anadir|Quitar|Cliente|Idioma|Ajuste|Novedades|Falta|Requiere|Snapshots|Comprob|Confirma|Copia|Listo|Continuar|Abrir|Escaneo|Cancelar|Título|Paquete|Semana)/;
  const ACCENTS = /[áéíóúñÁÉÍÓÚÑ¿¡]/;

  // Nombres de idioma del selector: se muestran siempre en su propio idioma (no se traducen).
  const LANG_NAMES = ['English (Default)', 'Español', 'Galego', 'Français', 'Italiano'];
  const stripLangNames = (text) => LANG_NAMES.reduce((acc, name) => acc.split(name).join(' '), text);

  const scan = (where) => {
    const visible = stripLangNames(document.body.innerText || '');
    if (ACCENTS.test(visible)) {
      const lines = visible.split('\\n').filter((l) => ACCENTS.test(l)).slice(0, 3);
      problems.push('en/' + where + ' · acentos españoles visibles: ' + JSON.stringify(lines));
    }
    const word = visible.match(SPANISH_WORDS);
    if (word) {
      const lines = visible.split('\\n').filter((l) => SPANISH_WORDS.test(l)).slice(0, 3);
      problems.push('en/' + where + ' · palabras en español: ' + JSON.stringify(lines));
    }
    const rawKeys = Object.keys(I.TRANSLATIONS.en).filter((k) => new RegExp('(^|[^a-z_])' + k + '([^a-z_]|$)').test(visible));
    if (rawKeys.length) problems.push('en/' + where + ' · claves crudas a la vista: ' + rawKeys.slice(0, 5).join(', '));
  };

  const click = (selector) => {
    const el = document.querySelector(selector);
    if (el) { el.click(); return true; }
    return false;
  };

  scan('inicio');

  for (const tab of ['addons', 'favorites', 'backups', 'settings']) {
    click('.nav-item[data-tab="' + tab + '"]');
    await sleep(400);
    scan('pestaña ' + tab);
  }

  // Catálogo + ficha
  click('.nav-item[data-tab="search"]');
  await sleep(500);
  scan('catálogo');
  click('#cfResultsGrid .cf-card');
  await sleep(700);
  scan('ficha del addon');
  click('.detail-tab-btn[data-detail-tab="files"]');
  await sleep(200);
  scan('ficha · versiones');

  // Modales
  click('#btnAppUpdate');
  await sleep(300);
  scan('modal de actualización');
  click('#btnCloseUpdateModal');
  await sleep(150);

  click('.nav-item[data-tab="addons"]');
  await sleep(300);
  click('#btnExportProfile');
  await sleep(400);
  scan('modal exportar pack');
  click('#btnCloseExportModal');
  await sleep(150);

  click('#btnImportProfile');
  await sleep(200);
  click('#btnAnalyzeProfile');
  await sleep(400);
  scan('modal importar pack');
  click('#btnCloseImportModal');
  await sleep(150);

  // Aviso (toast) real
  click('#btnScanAddons');
  await sleep(600);
  scan('aviso de escaneo');

  // ---------- 3. El cambio de idioma cambia el texto ----------
  click('.nav-item[data-tab="search"]');
  await sleep(300);
  const sample = () => document.querySelector('[data-i18n="nav_search"]').textContent;
  I.setLanguage('es');
  const esText = sample();
  I.setLanguage('en');
  const enText = sample();
  if (esText === enText) problems.push('el texto no cambia al pasar de español a inglés: "' + enText + '"');

  return { langs, problems, summary, esText, enText };
})()`;

async function main() {
  console.log('🌍 Verificación EN VIVO de idiomas (Electron + DOM real)\n');

  const server = await startStaticServer();
  const { child, tmpDir } = startElectron();
  let cdp = null;

  const cleanup = () => {
    try { cdp?.close(); } catch (_) {}
    try { child.kill(); } catch (_) {}
    try { server.close(); } catch (_) {}
    if (!KEEP) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
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
    if (!page) throw new Error('Electron no abrió ninguna pestaña depurable');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('No se pudo conectar al CDP')), { once: true });
    });
    cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');

    for (let i = 0; i < 40; i++) {
      const ready = await cdp.evaluate('!!(window.I18N && document.querySelector("[data-i18n]"))');
      if (ready) break;
      await sleep(250);
    }
    await sleep(800);

    const report = await cdp.evaluate(CHECK_SCRIPT);
    if (report.fatal) throw new Error(report.fatal);

    console.log(`Idiomas comprobados: ${report.langs.join(', ')}`);
    for (const lang of report.langs) {
      console.log(`  ${lang}: ${report.summary[lang].checked} textos · ${report.summary[lang].sample.join(' / ')}`);
    }
    console.log(`\nCambio de idioma: "es" → "${report.esText}" | "en" → "${report.enText}"`);

    if (report.problems.length) {
      console.error(`\n❌ ${report.problems.length} problema(s) en vivo:`);
      for (const p of report.problems) console.error('  · ' + p);
      process.exitCode = 1;
    } else {
      console.log('\n✅ En vivo: los cinco idiomas pintan el diccionario, cambian al instante y no queda texto fijo.');
    }
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('❌ ' + err.message);
  process.exit(1);
});
