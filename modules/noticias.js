/**
 * KoRForge - noticias de Blizzard (dueño, 24-10-2026).
 *
 * POR QUÉ EXISTE: el dueño quiere una pestaña «Noticias» en la app, «como se hace en el proyecto web del dueño», que
 * enseñe las noticias de Blizzard de la versión del cliente que tenga elegido arriba.
 *
 * DE DÓNDE SALEN: de los foros oficiales (Blizzard usa Discourse). El staff publica ahí las noticias
 * Ahí está el grupo `blizzard-tracker` (todos los mensajes del staff: notas de parche, mantenimientos,
 * avisos) y, además, se leen los temas FIJADOS de las categorías de cada versión, porque el tracker
 * solo devuelve los 20 mensajes del staff más recientes y las versiones «de catálogo» (WoW Forever,
 * Classic Era, Mists) se quedaban sin nada. Es el mismo planteamiento que se usa en su web, con los mismos ids de categoría ya comprobados.
 *
 * CACHÉ: en memoria, 5 minutos. Sin caché, abrir la pestaña en bucle machacaría los foros.
 */
'use strict';

const BASE = 'https://us.forums.blizzard.com/en/wow';
const TRACKER_URL = `${BASE}/groups/blizzard-tracker/posts.json?page=0`;
const USER_AGENT = 'KoRForge-News/1.0 (+https://github.com/korzor/KoRForge)';
const CACHE_TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 8000;

/* Categorías del foro oficial (US) y a qué versión de KoRForge pertenecen. Los ids están comprobados
   contra el foro; los mismos que se usan en su web. */
const CATEGORIAS = {
  /* WoW: Forever (346) y sus hijos: General (347), Community Connections (348) y Beta (349). */
  346: 'forever', 347: 'forever', 348: 'forever', 349: 'forever',
  /* Classic Progresivo: Mists of Pandaria Classic (254) y The Burning Crusade Classic (335). */
  254: 'classic', 335: 'classic',
  /* Classic Era y sus modalidades (SoD 302, Hardcore 296). */
  172: 'classic_era', 199: 'classic_era', 200: 'classic_era', 201: 'classic_era', 296: 'classic_era', 302: 'classic_era',
  /* Retail (Midnight): General (171), Oceanic (173), Council (261) y los PTR (345, 351). */
  171: 'retail', 173: 'retail', 261: 'retail', 345: 'retail', 351: 'retail',
};

/* Categorías donde el staff contesta dentro de hilos de jugadores: eso no es una noticia. */
const SIN_NOTICIA = new Set([12, 17, 20, 21, 43, 47, 50, 174]);

/* Temas fijados de cada versión: aunque el tracker no los traiga, son anuncios oficiales. */
const LISTAS_FIJADAS = {
  forever: ['346', '347', '349'],
  classic: ['254'],
  classic_era: ['172'],
  retail: [],
};

const VERSIONES_VALIDAS = ['forever', 'retail', 'classic_era', 'classic'];

let cache = { cuando: 0, porVersion: null };

function limpiarHtml(texto) {
  return String(texto || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&hellip;/g, '...')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Primera imagen del mensaje (el staff cuelga ahí la cabecera del blog). */
function primeraImagen(html) {
  const m = String(html || '').match(/<img[^>]+src=["']([^"']+)["']/i)
    || String(html || '').match(/(https:\/\/[^\s"']*bnetcms[^\s"']*\.(?:png|jpg|jpeg|webp))/i);
  return m ? String(m[1]).replace(/&amp;/g, '&') : '';
}

/** A qué versión pertenece una noticia, o null si no es noticia. */
function versionDe(titulo, resumen, categoriaId) {
  const cat = Number(categoriaId);
  if (SIN_NOTICIA.has(cat)) return null;
  const texto = `${titulo || ''} ${resumen || ''}`.toLowerCase();
  /* Promociones y podcasts: no son noticias. */
  if (/unlock a year|podcast/i.test(texto)) return null;
  /* El TÍTULO manda sobre la categoría: hay noticias de Forever publicadas en el foro general. */
  if (/wow:?\s*forever|world of warcraft:?\s*forever/.test(texto)) return 'forever';
  /* Mists of Pandaria Classic se llama «MoP Classic» a secas en la mitad de los anuncios. */
  if (/mists of pandaria|pandaria|\bmop\b/.test(texto)) return 'classic';
  if (/\bclassic\b/.test(texto)) return 'classic_era';
  return CATEGORIAS[cat] || 'retail';
}

/** Tipo de aviso, para la etiqueta de color de la tarjeta. */
function tipoDe(titulo, resumen) {
  const texto = `${titulo || ''} ${resumen || ''}`.toLowerCase();
  if (/development notes?|change log|patch notes|hotfix/i.test(texto)) return 'patch';
  if (/maintenance|reinici|restart|\bdown\b|scheduled weekly/i.test(texto)) return 'maintenance';
  if (/stress test/i.test(texto)) return 'stress';
  if (/known issues?|errores conocidos/i.test(texto)) return 'issues';
  return 'announcement';
}

async function pedirJson(url) {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: control.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Normaliza un mensaje del tracker del staff. */
function deTracker(post) {
  const titulo = limpiarHtml(post.topic_title || '');
  const resumen = limpiarHtml(post.excerpt || '');
  if (!titulo) return null;
  const version = versionDe(titulo, resumen, post.category_id);
  if (!version) return null;
  return {
    id: `${post.topic_id}`,
    titulo,
    resumen: resumen.length > 260 ? `${resumen.slice(0, 257)}...` : resumen,
    imagen: primeraImagen(post.excerpt),
    enlace: `${BASE}${post.url || `/t/${post.topic_slug || ''}/${post.topic_id}`}`,
    fecha: post.created_at || '',
    autor: post.username || '',
    version,
    tipo: tipoDe(titulo, resumen),
  };
}

/** Normaliza un tema de una lista de categoría (solo los fijados: son los anuncios). */
function deTemaFijado(tema) {
  if (!tema || !tema.pinned) return null;
  const titulo = limpiarHtml(tema.title || '');
  const resumen = limpiarHtml(tema.excerpt || '');
  if (!titulo) return null;
  const version = versionDe(titulo, resumen, tema.category_id);
  if (!version) return null;
  return {
    id: `${tema.id}`,
    titulo,
    resumen: resumen.length > 260 ? `${resumen.slice(0, 257)}...` : resumen,
    imagen: tema.image_url || primeraImagen(tema.excerpt),
    enlace: `${BASE}/t/${tema.slug || ''}/${tema.id}`,
    fecha: tema.created_at || tema.last_posted_at || '',
    autor: '',
    version,
    tipo: tipoDe(titulo, resumen),
  };
}

async function cargarTodo() {
  const peticiones = [pedirJson(TRACKER_URL)];
  const claves = [];
  for (const [version, cats] of Object.entries(LISTAS_FIJADAS)) {
    for (const cat of cats) {
      claves.push([version, cat]);
      peticiones.push(pedirJson(`${BASE}/c/${cat}.json`));
    }
  }

  const respuestas = await Promise.all(peticiones);
  const tracker = respuestas[0];
  const porVersion = { forever: [], retail: [], classic_era: [], classic: [] };
  const vistos = new Set();
  const titulosVistos = new Set();

  const meter = (noticia) => {
    if (!noticia) return;
    /* El mismo anuncio se publica dos veces (tema del foro y blog): se queda el primero, que es el
       más reciente porque las listas llegan ordenadas. */
    const claveTitulo = noticia.titulo.toLowerCase();
    if (vistos.has(noticia.id) || titulosVistos.has(claveTitulo)) return;
    vistos.add(noticia.id);
    titulosVistos.add(claveTitulo);
    porVersion[noticia.version].push(noticia);
  };

  const listaPosts = (tracker && (tracker.posts || (tracker.post_stream && tracker.post_stream.posts))) || [];
  for (const post of listaPosts) meter(deTracker(post));

  for (let i = 0; i < claves.length; i += 1) {
    const datos = respuestas[i + 1];
    const temas = (datos && datos.topic_list && datos.topic_list.topics) || [];
    for (const tema of temas) meter(deTemaFijado(tema));
  }

  for (const version of Object.keys(porVersion)) {
    porVersion[version].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }
  return porVersion;
}

/**
 * Noticias de una versión (o de todas, sin filtro).
 * @param {string} version  forever | retail | classic_era | classic
 * @param {number} limite   cuántas devolver
 * @param {boolean} forzar  saltarse la caché
 */
async function noticiasDe(version, limite = 30, forzar = false) {
  const ahora = Date.now();
  const caducada = !cache.porVersion || (ahora - cache.cuando) > CACHE_TTL_MS;
  if (caducada || forzar) {
    cache = { cuando: ahora, porVersion: await cargarTodo() };
  }

  const clave = VERSIONES_VALIDAS.includes(version) ? version : 'forever';
  const todas = cache.porVersion[clave] || [];
  return {
    version: clave,
    actualizado: new Date(cache.cuando).toISOString(),
    total: todas.length,
    noticias: todas.slice(0, Math.max(1, Math.min(Number(limite) || 30, 100))),
  };
}

module.exports = { noticiasDe, versionDe, tipoDe, primeraImagen, limpiarHtml, VERSIONES_VALIDAS };
