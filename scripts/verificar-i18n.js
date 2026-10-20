#!/usr/bin/env node
/**
 * Verificador de idiomas de KoRForge (docs/REGLAS-IDIOMAS.md).
 *
 * Comprueba, sin arrancar la app:
 *   1. Que TODOS los idiomas tengan EXACTAMENTE las mismas claves que el inglés.
 *   2. Que toda clave usada en public/index.html (data-i18n, data-i18n-title,
 *      data-i18n-placeholder, data-i18n-html, data-i18n-alt) exista en el diccionario.
 *   3. Que toda clave pedida en public/app.js con T('...') exista en el diccionario.
 *   4. Que no queden textos visibles fijos en public/index.html (ni en title/placeholder/alt).
 *   5. Que no queden textos fijos en los puntos donde app.js pinta interfaz
 *      (showToast, confirm, alert, textContent, title, placeholder) ni letras acentuadas
 *      en literales de public/app.js.
 *   6. Que no haya guiones largos (—) ni medios (–) en textos de interfaz (REGLAS-TEXTOS.md).
 *
 * Uso:
 *   node scripts/verificar-i18n.js            # normal
 *   node scripts/verificar-i18n.js --verbose  # enseña también lo que está bien
 *
 * Sale con código 1 si algo falla: se engancha al pipeline de release.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const I18N_FILE = path.join(ROOT, 'public', 'i18n.js');
const HTML_FILE = path.join(ROOT, 'public', 'index.html');
const SPLASH_FILE = path.join(ROOT, 'public', 'splash.html');
const APP_FILE = path.join(ROOT, 'public', 'app.js');
const VERBOSE = process.argv.includes('--verbose');

const problems = [];
const notes = [];

function fail(file, line, message) {
  problems.push({ file, line, message });
}

function ok(message) {
  if (VERBOSE) console.log('  ✓ ' + message);
}

// ---------------------------------------------------------------- 1. Diccionario
function loadTranslations() {
  const src = fs.readFileSync(I18N_FILE, 'utf8');
  const sandboxWindow = {};
  const context = {
    window: sandboxWindow,
    console,
    document: {
      documentElement: {},
      querySelectorAll: () => [],
      querySelector: () => null
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    CustomEvent: function CustomEvent() {}
  };
  vm.createContext(context);
  vm.runInContext(src, context);

  if (!sandboxWindow.I18N || !sandboxWindow.I18N.TRANSLATIONS) {
    throw new Error('public/i18n.js no expone I18N.TRANSLATIONS');
  }
  return sandboxWindow.I18N.TRANSLATIONS;
}

function checkParity(translations) {
  const langs = Object.keys(translations);
  if (langs.length < 2) {
    fail(I18N_FILE, 0, 'el diccionario debe tener al menos dos idiomas');
    return { langs, enKeys: [] };
  }

  const enKeys = Object.keys(translations.en);
  for (const lang of langs) {
    const keys = Object.keys(translations[lang]);
    const set = new Set(keys);
    const enSet = new Set(enKeys);

    const missing = enKeys.filter((k) => !set.has(k));
    const extra = keys.filter((k) => !enSet.has(k));

    if (missing.length) {
      fail(I18N_FILE, 0, `idioma "${lang}": faltan ${missing.length} clave(s): ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}`);
    }
    if (extra.length) {
      fail(I18N_FILE, 0, `idioma "${lang}": sobran ${extra.length} clave(s) que no están en inglés: ${extra.slice(0, 12).join(', ')}${extra.length > 12 ? '…' : ''}`);
    }

    // Valores vacíos
    for (const key of keys) {
      if (typeof translations[lang][key] !== 'string' || translations[lang][key].trim() === '') {
        fail(I18N_FILE, 0, `idioma "${lang}": la clave "${key}" está vacía`);
      }
    }
  }

  if (!problems.length) ok(`${langs.length} idiomas con las mismas ${enKeys.length} claves`);
  return { langs, enKeys };
}

// Interpolaciones: todas las claves de un idioma deben usar los mismos {marcadores}
function checkPlaceholders(translations, enKeys) {
  const re = /\{(\w+)\}/g;
  const markers = (str) => {
    const out = [];
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(str)) !== null) out.push(m[1]);
    return out.sort().join(',');
  };

  for (const lang of Object.keys(translations)) {
    if (lang === 'en') continue;
    for (const key of enKeys) {
      const a = markers(String(translations.en[key] || ''));
      const b = markers(String(translations[lang][key] || ''));
      if (a !== b) {
        fail(I18N_FILE, 0, `idioma "${lang}": la clave "${key}" usa variables distintas que el inglés (${a || 'ninguna'} vs ${b || 'ninguna'})`);
      }
    }
  }
  if (!problems.length) ok('las variables {…} coinciden en todos los idiomas');
}

// ---------------------------------------------------------------- 2 y 4. HTML
const VOID_TAGS = new Set(['meta', 'link', 'img', 'input', 'br', 'hr', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'use', 'stop', 'ellipse']);

// Textos que no se traducen a propósito (marcas, nombres de idioma, rutas de ejemplo)
const TEXT_ALLOWLIST = [
  'ORFORGE',
  'English (Default)', 'Español', 'Galego', 'Français', 'Italiano',
  'https://github.com/...'
];
const TITLE_ALLOWLIST_IDS = new Set([]);
const PLACEHOLDER_ALLOWLIST_IDS = new Set(['rootWoWPath']);
const ALT_ALLOWLIST = new Set(['KoRForge', '']);

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function parseAttrs(raw) {
  const attrs = {};
  let rest = String(raw);
  let m;

  rest = rest.replace(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g, (match, key, value) => {
    attrs[key.toLowerCase()] = value;
    return ' '.repeat(match.length);
  });
  rest = rest.replace(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*'([^']*)'/g, (match, key, value) => {
    attrs[key.toLowerCase()] = value;
    return ' '.repeat(match.length);
  });

  // Atributos sin valor (data-i18n-skip, disabled, hidden…)
  const bare = /(?:^|\s)([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?=\s|$|\/)/g;
  while ((m = bare.exec(rest)) !== null) {
    const name = m[1].toLowerCase();
    if (attrs[name] === undefined) attrs[name] = '';
  }

  return attrs;
}

const I18N_ATTRS = ['data-i18n', 'data-i18n-html', 'data-i18n-title', 'data-i18n-placeholder', 'data-i18n-alt'];

function checkHtml(translations, file) {
  const has = (key) => Object.prototype.hasOwnProperty.call(translations.en, key);
  const html = fs.readFileSync(file, 'utf8');
  const clean = html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));

  const stack = [];
  const tokenRe = /<[^>]+>|[^<]+/g;
  let m;
  let insideScript = 0;
  let insideStyle = 0;

  while ((m = tokenRe.exec(clean)) !== null) {
    const token = m[0];
    const index = m.index;

    if (token.startsWith('</')) {
      const tag = token.replace(/[<\/>\s]/g, '').toLowerCase();
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      if (tag === 'script' && insideScript > 0) insideScript--;
      if (tag === 'style' && insideStyle > 0) insideStyle--;
      continue;
    }

    if (token.startsWith('<')) {
      if (token.startsWith('<!')) continue;
      const tagMatch = token.match(/^<\s*([a-zA-Z0-9-]+)/);
      if (!tagMatch) continue;
      const tag = tagMatch[1].toLowerCase();
      const rawAttrs = token.slice(tagMatch[0].length).replace(/\/?>$/, '');
      const attrs = parseAttrs(rawAttrs);

      if (tag === 'script') { insideScript++; continue; }
      if (tag === 'style') { insideStyle++; continue; }

      // 2. Claves usadas en el HTML
      for (const attr of I18N_ATTRS) {
        const key = attrs[attr];
        if (key && !has(key)) {
          fail(file, lineOf(clean, index), `<${tag}> usa ${attr}="${key}" y esa clave no existe en el diccionario`);
        }
      }

      // 4b. tooltips y placeholders fijos
      const id = attrs.id || '';
      if (attrs.title !== undefined && attrs['data-i18n-title'] === undefined && !TITLE_ALLOWLIST_IDS.has(id)) {
        if (/[A-Za-zÀ-ÿ]/.test(attrs.title)) {
          fail(file, lineOf(clean, index), `<${tag}${id ? ' id="' + id + '"' : ''}> tiene title fijo sin data-i18n-title: "${attrs.title}"`);
        }
      }
      if (attrs.placeholder !== undefined && attrs['data-i18n-placeholder'] === undefined && !PLACEHOLDER_ALLOWLIST_IDS.has(id)) {
        if (/[A-Za-zÀ-ÿ]/.test(attrs.placeholder)) {
          fail(file, lineOf(clean, index), `<${tag}${id ? ' id="' + id + '"' : ''}> tiene placeholder fijo sin data-i18n-placeholder: "${attrs.placeholder}"`);
        }
      }
      if (attrs.alt !== undefined && attrs['data-i18n-alt'] === undefined && !ALT_ALLOWLIST.has(attrs.alt)) {
        if (/[A-Za-zÀ-ÿ]/.test(attrs.alt)) {
          fail(file, lineOf(clean, index), `<${tag}> tiene alt fijo sin data-i18n-alt: "${attrs.alt}"`);
        }
      }

      if (!VOID_TAGS.has(tag) && !rawAttrs.trim().endsWith('/')) {
        stack.push({ tag, attrs, index });
      }
      continue;
    }

    // 4a. Texto visible
    if (insideScript > 0 || insideStyle > 0) continue;
    const text = token.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (!/[A-Za-zÀ-ÿ]/.test(text)) continue;
    if (TEXT_ALLOWLIST.includes(text)) continue;

    const parent = stack[stack.length - 1];
    if (!parent) continue;
    if (parent.attrs['data-i18n'] !== undefined || parent.attrs['data-i18n-html'] !== undefined) continue;
    // Elementos cuyo texto lo pinta app.js en ejecución (versión, notas, subtítulos)
    if (parent.attrs['data-i18n-skip'] !== undefined) continue;
    if (parent.attrs['data-i18n-doctitle'] !== undefined) continue;

    fail(file, lineOf(clean, index), `texto visible sin data-i18n dentro de <${parent.tag}>: "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
  }

  if (!problems.length) ok(`${path.relative(ROOT, file)}: todo el texto pasa por data-i18n`);
}

// ---------------------------------------------------------------- 3 y 5. app.js
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

// Los mensajes de console.* son trazas de desarrollo, no interfaz: se ignoran.
function blankConsoleCalls(source) {
  return source.replace(/console\.(log|warn|error|info|debug)\s*\([^\n]*\)/g, (m) => {
    const head = m.match(/^console\.\w+\s*\(/)[0];
    return head + ' '.repeat(Math.max(0, m.length - head.length - 1)) + ')';
  });
}

function checkApp(translations) {
  const has = (key) => Object.prototype.hasOwnProperty.call(translations.en, key);
  const raw = fs.readFileSync(APP_FILE, 'utf8');
  const code = blankConsoleCalls(stripComments(raw));

  // 3. Claves usadas con T('...') / I18N.t('...')
  const keyRe = /(?:^|[^A-Za-z0-9_$.])(?:T|textoI18n|I18N\.t|window\.I18N\.t)\(\s*'([A-Za-z0-9_]+)'/g;
  let m;
  while ((m = keyRe.exec(code)) !== null) {
    const key = m[1];
    if (has(key)) continue;
    // Prefijos dinámicos: T('err_' + code), T('compat_' + ...)
    if (key.endsWith('_') && Object.keys(translations.en).some((k) => k.startsWith(key))) {
      notes.push(`prefijo dinámico "${key}" (se completa en ejecución)`);
      continue;
    }
    fail(APP_FILE, lineOf(code, m.index), `T('${key}') usa una clave que no existe en el diccionario`);
  }

  // 5a. Letras acentuadas en literales (delata texto en español escrito a mano)
  const accentRe = /[\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00c1\u00c9\u00cd\u00d3\u00da\u00d1\u00bf\u00a1]/;
  const literalRe = /'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  while ((m = literalRe.exec(code)) !== null) {
    const value = m[1] !== undefined ? m[1] : m[2];
    // Quitar interpolaciones ${...} antes de mirar el texto
    const plain = String(value).replace(/\$\{[^}]*\}/g, '');
    if (accentRe.test(plain)) {
      fail(APP_FILE, lineOf(code, m.index), `texto con acentos escrito a mano (debe ir por T('clave')): "${plain.trim().slice(0, 60)}"`);
    }
  }

  // 5b. Texto fijo en los puntos donde se pinta interfaz
  const sinks = [
    { name: 'showToast', re: /showToast\(\s*(['"`])/g },
    { name: 'confirm', re: /\bconfirm\(\s*(['"`])/g },
    { name: 'alert', re: /\balert\(\s*(['"`])/g },
    { name: 'textContent', re: /\.textContent\s*=\s*(['"`])/g },
    { name: 'title', re: /\.title\s*=\s*(['"`])/g },
    { name: 'placeholder', re: /\.placeholder\s*=\s*(['"`])/g }
  ];

  for (const sink of sinks) {
    let hit;
    sink.re.lastIndex = 0;
    while ((hit = sink.re.exec(code)) !== null) {
      // Extraer el literal completo
      const quote = hit[1];
      const start = hit.index + hit[0].length - 1;
      let end = start + 1;
      while (end < code.length && (code[end] !== quote || code[end - 1] === '\\')) end++;
      const literal = code.slice(start + 1, end);
      const plain = literal.replace(/\$\{[^}]*\}/g, '').replace(/^[^\wÀ-ÿ]+/, '').trim();
      if (!/[A-Za-zÀ-ÿ]/.test(plain)) continue;
      // Nombres técnicos aceptados (rutas, selectores, clases)
      if (/^[\w./:-]+$/.test(plain) && !/^[A-Z][a-z]+/.test(plain)) continue;
      fail(APP_FILE, lineOf(code, hit.index), `${sink.name} pinta texto fijo en vez de T('clave'): "${plain.slice(0, 60)}"`);
    }
  }

  if (!problems.length) ok('public/app.js: las claves existen y no queda texto fijo');
}

// ---------------------------------------------------------------- 6. Guiones largos
function checkDashes(translations) {
  const bad = /[\u2014\u2013]/;
  for (const lang of Object.keys(translations)) {
    for (const [key, value] of Object.entries(translations[lang])) {
      if (typeof value === 'string' && bad.test(value)) {
        fail(I18N_FILE, 0, `idioma "${lang}": la clave "${key}" lleva guion largo o medio (usa · o coma)`);
      }
    }
  }
  for (const file of [HTML_FILE, APP_FILE]) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (bad.test(line)) fail(file, i + 1, 'guion largo o medio en un texto de interfaz');
    });
  }
  if (!problems.length) ok('sin guiones largos en los textos');
}

// ---------------------------------------------------------------- Main
function main() {
  console.log('🔎 Verificando idiomas de KoRForge…\n');

  let translations;
  try {
    translations = loadTranslations();
  } catch (err) {
    console.error('❌ No se pudo leer public/i18n.js:', err.message);
    process.exit(1);
  }

  const { enKeys } = checkParity(translations);
  checkPlaceholders(translations, enKeys);
  checkHtml(translations, HTML_FILE);
  if (fs.existsSync(SPLASH_FILE)) checkHtml(translations, SPLASH_FILE);
  checkApp(translations);
  checkDashes(translations);

  if (notes.length && VERBOSE) {
    console.log('\nℹ️  Notas:');
    notes.forEach((n) => console.log('   · ' + n));
  }

  if (problems.length) {
    console.error(`\n❌ ${problems.length} problema(s) de idioma:\n`);
    for (const p of problems) {
      const rel = path.relative(ROOT, p.file) || p.file;
      console.error(`  ${rel}${p.line ? ':' + p.line : ''} → ${p.message}`);
    }
    console.error('\nArregla esto antes de publicar (docs/REGLAS-IDIOMAS.md).');
    process.exit(1);
  }

  console.log(`\n✅ Idiomas en orden: ${Object.keys(translations).length} idiomas, ${enKeys.length} claves, sin textos fijos.`);
}

main();
