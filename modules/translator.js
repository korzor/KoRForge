const fs = require('fs');
const path = require('path');

const USER_DATA_DIR = process.env.KORFORGE_USER_DATA || path.join(process.env.APPDATA || '', 'KoRForge');
const CACHE_DIR = path.join(USER_DATA_DIR, 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'translations.json');

function ensureCacheFile() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  if (!fs.existsSync(CACHE_FILE)) {
    // Check if we can seed from local cache
    const localCache = path.join(__dirname, '..', 'cache', 'translations.json');
    if (fs.existsSync(localCache)) {
      try {
        fs.copyFileSync(localCache, CACHE_FILE);
        return;
      } catch (_) {}
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify({}), 'utf-8');
  }
}

function loadCache() {
  try {
    ensureCacheFile();
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch (err) {
    console.error('[Translator] Error al leer caché de traducciones:', err.message);
    return {};
  }
}

function saveCache(cache) {
  try {
    ensureCacheFile();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Translator] Error al guardar caché de traducciones:', err.message);
  }
}

async function translateChunk(text, targetLang = 'es') {
  if (!text || !text.trim()) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Google translate error: ${res.status}`);
    }
    const data = await res.json();
    return (data[0] || []).map(item => item[0]).join('');
  } catch (err) {
    console.warn('[Translator] Fallo al traducir fragmento, devolviendo original:', err.message);
    return text;
  }
}

async function translateHtml(html, targetLang = 'es') {
  if (!html || !html.trim()) return html;

  // Split safely by HTML block closing tags to preserve DOM tags
  const parts = html.split(/(<\/(?:p|div|li|h[1-6]|tr|blockquote|ul|ol|table)>)/gi);
  const chunks = [];
  let current = '';

  for (const part of parts) {
    if ((current + part).length > 1400) {
      if (current) chunks.push(current);
      current = part;
    } else {
      current += part;
    }
  }
  if (current) chunks.push(current);

  const translatedChunks = [];
  for (const chunk of chunks) {
    const translated = await translateChunk(chunk, targetLang);
    translatedChunks.push(translated);
  }

  return translatedChunks.join('');
}

async function getTranslation(modId) {
  const cache = loadCache();
  return cache[String(modId)] || null;
}

async function translateMod({ modId, summary, html, targetLang = 'es' }) {
  const cache = loadCache();
  const key = String(modId);

  // Return from cache if already translated
  if (cache[key] && cache[key][targetLang]) {
    return {
      cached: true,
      summary: cache[key][targetLang].summary,
      html: cache[key][targetLang].html
    };
  }

  const [translatedSummary, translatedHtml] = await Promise.all([
    summary ? translateChunk(summary, targetLang) : '',
    html ? translateHtml(html, targetLang) : ''
  ]);

  if (!cache[key]) cache[key] = {};
  cache[key][targetLang] = {
    summary: translatedSummary,
    html: translatedHtml,
    translatedAt: new Date().toISOString()
  };

  saveCache(cache);

  return {
    cached: false,
    summary: translatedSummary,
    html: translatedHtml
  };
}

module.exports = {
  translateChunk,
  translateHtml,
  translateMod,
  getTranslation
};
