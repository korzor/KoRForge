/**
 * KoRForge — «Blue posts» de WoW Forever (dueño, 02-11-2026).
 *
 * QUE ES: los mensajes que los Community Manager de Blizzard escriben en el foro oficial, dentro de
 * la categoría «WoW: Forever». Van en la misma pestaña que las notas del parche, en su propia vista.
 *
 * DE DONDE SALEN (foro oficial, API pública de Discourse):
 *   1. `GET /en/wow/search.json?q=#wow-forever group:community-manager order:latest`
 *      → los posts del grupo «Community Manager» en esa categoría (y sus subforos), con su id,
 *      fecha y autor. Hay unos 20-25 y se renuevan poco.
 *   2. `GET /en/wow/posts/<id>.json` → el cuerpo ya renderizado (`cooked`) de un post concreto.
 *      Se pide solo al abrir la tarjeta, para no hacer veinte peticiones de golpe.
 *
 * QUE SE QUITA: como en las notas, no queda ni un enlace (los <a> se desenvuelven y su href se tira).
 * Las imágenes del foro no se enlazan: se descartan (no se pide nada a su CDN). Los vídeos de YouTube
 * sí se quedan: el onebox del foro se sustituye por un botón que abre el reproductor dentro de la app
 * (`www.youtube-nocookie.com`, modo sin cookies), y solo cuando el usuario le da al play.
 *
 * CACHÉ: 10 minutos la lista y los cuerpos ya pedidos (en memoria). El botón «Actualizar» la salta.
 */
'use strict';

const { _internos: forever } = require('./cambiosForever');

const BASE = 'https://us.forums.blizzard.com/en/wow';
const BUSQUEDA = '#wow-forever group:community-manager order:latest';
const USER_AGENT = 'KoRForge/1.6.4 (+https://github.com/korzor/KoRForge)';
const CACHE_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 20000;
const MAX_ARTICULOS = 30;
const MAX_CUERPOS = 300;

let cache = { cuando: 0, datos: null };
const cacheCuerpos = new Map();

/* ---------------------------------------------------------------- utilidades */

function escapar(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function pedirJson(url) {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: control.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Accept-Language': 'en' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Fecha ISO válida o ''. */
function fechaValida(valor) {
  const marca = Date.parse(valor);
  return Number.isFinite(marca) ? new Date(marca).toISOString() : '';
}

/* ---------------------------------------------------------------- vídeos */

/* El foro incrusta YouTube como un «onebox»: un div con data-video-id y una miniatura enlazada.
   Se sustituye por un botón nuestro; el reproductor (iframe) lo monta la interfaz al pulsar. */
const ONEBOX_YT = /<div[^>]*class="[^"]*youtube-onebox[^"]*"[^>]*>[\s\S]*?<\/div>\s*/gi;

function bloqueDeVideo(html) {
  const id = (String(html).match(/data-video-id="([A-Za-z0-9_-]{6,20})"/) || [])[1] || '';
  if (!id) return '';
  const titulo = (String(html).match(/data-video-title="([^"]*)"/) || [])[1] || '';
  return `<div class="bp-video"><button type="button" class="bp-video-play" data-video-id="${id}">`
    + `<span class="bp-video-icon" aria-hidden="true">▶</span>`
    + `<span class="bp-video-title">${escapar(forever.decodificar(titulo))}</span>`
    + `</button></div>`;
}

/** HTML del foro → HTML propio: sin enlaces, sin imágenes de fuera y con los vídeos como botón. */
function sanear(texto) {
  const bruto = String(texto || '');
  let salida = '';
  let ultimo = 0;
  for (const m of bruto.matchAll(ONEBOX_YT)) {
    salida += forever.sanear(bruto.slice(ultimo, m.index));
    salida += bloqueDeVideo(m[0]);
    ultimo = m.index + m[0].length;
  }
  return salida + forever.sanear(bruto.slice(ultimo));
}

/* ---------------------------------------------------------------- lista */

function autoresDeLosTemas(topics) {
  const mapa = new Map();
  for (const t of topics || []) {
    if (t && t.id) mapa.set(t.id, String(t.title || ''));
  }
  return mapa;
}

async function construirLista() {
  const datos = await pedirJson(`${BASE}/search.json?q=${encodeURIComponent(BUSQUEDA)}`);
  if (!datos || !Array.isArray(datos.posts)) throw new Error('el foro no respondió');

  const titulos = autoresDeLosTemas(datos.topics);
  const articulos = [];

  for (const p of datos.posts) {
    if (!p || !p.id) continue;
    const titulo = forever.aTextoPlano(titulos.get(p.topic_id) || '');
    if (!titulo) continue;
    articulos.push({
      id: String(p.id),
      topico: String(p.topic_id || ''),
      titulo,
      autor: String(p.username || ''),
      fecha: fechaValida(p.created_at),
      extracto: forever.aTextoPlano(p.blurb || '').replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, 400)
    });
  }

  articulos.sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));

  return {
    actualizado: new Date().toISOString(),
    total: articulos.length,
    articulos: articulos.slice(0, MAX_ARTICULOS)
  };
}

/** Lista de blue posts (con caché). `forzar` la salta. */
async function listar(forzar = false) {
  const ahora = Date.now();
  if (!forzar && cache.datos && (ahora - cache.cuando) < CACHE_TTL_MS) return cache.datos;
  const datos = await construirLista();
  cache = { cuando: ahora, datos };
  return datos;
}

/* ---------------------------------------------------------------- cuerpo */

/** Cuerpo saneado de un blue post concreto, o null si el id no vale o el foro no responde. */
async function publicacion(id) {
  const limpio = String(id || '');
  if (!/^\d{5,12}$/.test(limpio)) return null;

  const guardado = cacheCuerpos.get(limpio);
  if (guardado) return guardado;

  const post = await pedirJson(`${BASE}/posts/${limpio}.json`);
  if (!post || !post.cooked) return null;

  const datos = {
    id: limpio,
    autor: String(post.username || ''),
    fecha: fechaValida(post.created_at),
    cuerpo: sanear(post.cooked)
  };

  if (cacheCuerpos.size >= MAX_CUERPOS) {
    cacheCuerpos.delete(cacheCuerpos.keys().next().value);
  }
  cacheCuerpos.set(limpio, datos);
  return datos;
}

function limpiarCache() {
  cache = { cuando: 0, datos: null };
  cacheCuerpos.clear();
}

module.exports = {
  listar,
  publicacion,
  limpiarCache,
  /* Internos, para la sonda de verificación */
  _internos: { BASE, BUSQUEDA, sanear, bloqueDeVideo, fechaValida }
};
