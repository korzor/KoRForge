/**
 * KoRForge — Notas y parches por juego (dueño, 02-11-2026).
 *
 * QUE ES: lo mismo que «Latest Forever Changes» pero para las otras versiones. El selector de juego
 * de arriba manda: Retail, Classic Era y Classic Prog tienen aquí sus notas.
 *
 * DE DONDE SALEN (portal oficial de Blizzard, HTML servido):
 *   · Índice: `https://worldofwarcraft.blizzard.com/en-us/content-update-notes`
 *     (notas de parche mayores y recopilatorios de hotfixes de Retail y de las ramas Classic).
 *   · Cada entrada: `https://worldofwarcraft.blizzard.com/en-us/news/<id>/<slug>`, cuyo cuerpo va en
 *     `<div id="blog"> … <div class="detail">`: párrafos, `<hr>` entre fechas y listas anidadas
 *     (sección → clase → especialización → cambios).
 *
 * CÓMO SE REPARTE POR JUEGO: los hotfixes mezclan versiones en el mismo artículo. Dentro del cuerpo,
 * una cabecera con el nombre de una rama («WoW Classic Era», «Mists of Pandaria Classic»,
 * «The Burning Crusade Classic»…) cambia el juego de lo que viene detrás; lo que no lleva cabecera de
 * rama es Retail. Cada fecha del artículo es una tarjeta distinta, como las notas del Forever.
 *
 * CÓMO SE PINTA: con el mismo marcado que las notas del Forever (`bt-note-class`, `pn-spec`,
 * `pn-lines`, `v2-mark` con `is-buff` / `is-nerf` / `is-change`), así que hereda el mismo CSS: iconos
 * de clase, flechas de mejora/nerfeo y rombo ámbar cuando el cambio no es ni una cosa ni la otra.
 *
 * CACHÉ: en memoria, 10 minutos por juego.
 */
'use strict';

const { _internos: forever } = require('./cambiosForever');

const BASE = 'https://worldofwarcraft.blizzard.com';
const INDICE = `${BASE}/en-us/content-update-notes`;
const USER_AGENT = 'KoRForge/1.6.7 (+https://github.com/korzor/KoRForge)';
const CACHE_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 20000;
const MAX_ARTICULOS = 12;
const PAUSA_ENTRE_ARTICULOS_MS = 250;

const JUEGOS = ['retail', 'classicEra', 'classicProg'];

/* Cómo titula Blizzard cada rama dentro del cuerpo. */
const RAMAS = [
  { juego: 'classicEra', nombres: [/^wow classic era$/i, /^classic era$/i, /^hardcore$/i, /^season of discovery$/i] },
  { juego: 'classicProg', nombres: [/mists of pandaria classic/i, /cataclysm classic/i, /wrath of the lich king classic/i, /burning crusade classic/i] }
];

const CLASES = {
  'death knight': 'deathknight', 'demon hunter': 'demonhunter', druid: 'druid', evoker: 'evoker',
  hunter: 'hunter', mage: 'mage', monk: 'monk', paladin: 'paladin', priest: 'priest',
  rogue: 'rogue', shaman: 'shaman', warlock: 'warlock', warrior: 'warrior'
};

const MARCAS = {
  isBuff: '<svg class="v2-mark is-buff" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><title>Buffs</title><path d="M6 1.5 11 7.5H7.8V11H4.2V7.5H1Z"></path></svg>',
  isNerf: '<svg class="v2-mark is-nerf" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><title>Nerfs</title><path d="M6 10.5 11 4.5H7.8V1H4.2V4.5H1Z"></path></svg>',
  isChange: '<svg class="v2-mark is-change" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><title>Changes</title><path d="M6 2 10 6 6 10 2 6Z"></path></svg>'
};

const cache = new Map();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- utilidades */

function escapar(texto) {
  return String(texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function descargar(url) {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: control.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html', 'Accept-Language': 'en' }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const aTexto = (html) => forever.aTextoPlano(html);

function nombreClase(texto) {
  return CLASES[aTexto(texto).toLowerCase().trim()] || '';
}

function ramaDe(texto) {
  const limpio = aTexto(texto);
  for (const rama of RAMAS) {
    if (rama.nombres.some((re) => re.test(limpio))) return rama.juego;
  }
  return '';
}

/** ¿Sube o baja? Solo decide el color de la flecha; si no está claro, rombo ámbar. */
function marcaDeCambio(texto) {
  const t = String(texto || '');
  const sube = /\b(increased|increases|increase|improved|improves|higher|now also|additionally)\b/i.test(t);
  const baja = /\b(reduced|reduces|reduce|decreased|decreases|decrease|lowered|lower|no longer|removed|removes)\b/i.test(t);
  if (sube && !baja) return 'isBuff';
  if (baja && !sube) return 'isNerf';
  return 'isChange';
}

/* ---------------------------------------------------------------- índice */

/** Entradas del índice: [{ id, url, titulo, fecha }]. */
function leerIndice(html) {
  const entradas = [];
  const bloques = String(html || '').split('<article class="NewsBlog">').slice(1);
  for (const bloque of bloques) {
    const enlace = bloque.match(/href="\/news\/(\d+)\/([^"]+)"/);
    if (!enlace) continue;
    const titulo = (bloque.match(/<div class="NewsBlog-title">([\s\S]*?)<\/div>/) || [])[1] || '';
    const fecha = (bloque.match(/"iso8601":"([^"]+)"/) || [])[1] || '';
    const marca = Date.parse(fecha);
    entradas.push({
      id: enlace[1],
      url: `${BASE}/en-us/news/${enlace[1]}/${enlace[2]}`,
      titulo: aTexto(titulo),
      fecha: Number.isFinite(marca) ? new Date(marca).toISOString() : ''
    });
    if (entradas.length >= MAX_ARTICULOS) break;
  }
  return entradas;
}

/* ---------------------------------------------------------------- cuerpo */

/** HTML del cuerpo del artículo (contenedor `#blog .detail`). */
function extraerCuerpo(html) {
  const bruto = String(html || '');
  const ini = bruto.indexOf('<div id="blog">');
  if (ini < 0) return '';
  const detalle = bruto.indexOf('<div class="detail">', ini);
  if (detalle < 0) return '';
  const desde = detalle + '<div class="detail">'.length;
  const fin = bruto.indexOf('<div class="space-medium">', desde);
  return bruto.slice(desde, fin > desde ? fin : bruto.length);
}

/** Trozos separados por <hr>: cada uno es una fecha (hotfixes) o el artículo entero. */
function porFechas(cuerpo) {
  return String(cuerpo || '')
    .split(/<hr\s*\/?>/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

function esFecha(texto) {
  return /^(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}$/i.test(aTexto(texto));
}

const MESES = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
};

const MESES_LARGOS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** ISO → «October 30, 2026» (el formato de Blizzard). */
function fechaLarga(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${MESES_LARGOS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** «October 30, 2026» → ISO en UTC (Date.parse lo tomaría como hora local y restaría un día). */
function fechaDeTexto(texto) {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(aTexto(texto));
  if (!m) return '';
  const mes = MESES[m[1].toLowerCase()];
  if (mes === undefined) return '';
  return new Date(Date.UTC(Number(m[3]), mes, Number(m[2]))).toISOString();
}

/* ---------------------------------------------------------------- bloques */

/** Trocea el cuerpo en elementos de primer nivel: p, h2, h3, ul (con sus anidados) y hr. */
function trocear(html) {
  const bruto = String(html || '');
  const bloques = [];
  const re = /<(p|h2|h3|ul|hr)\b/gi;
  let i = 0;

  while (i < bruto.length) {
    re.lastIndex = i;
    const m = re.exec(bruto);
    if (!m) break;
    const nombre = m[1].toLowerCase();
    const inicio = m.index;

    if (nombre === 'hr') {
      const fin = bruto.indexOf('>', inicio) + 1;
      bloques.push({ tipo: 'hr', html: bruto.slice(inicio, fin) });
      i = fin;
      continue;
    }

    const finApertura = bruto.indexOf('>', inicio) + 1;
    if (finApertura <= 0) break;

    if (nombre !== 'ul') {
      const cierre = bruto.indexOf(`</${nombre}`, finApertura);
      if (cierre < 0) break;
      const fin = bruto.indexOf('>', cierre) + 1;
      bloques.push({ tipo: nombre, html: bruto.slice(inicio, fin) });
      i = fin;
      continue;
    }

    /* Las listas pueden llevar otras dentro: se cuenta la profundidad. */
    let profundidad = 1;
    let j = finApertura;
    const reUl = /<(\/?)ul\b[^>]*>/gi;
    while (profundidad > 0) {
      reUl.lastIndex = j;
      const t = reUl.exec(bruto);
      if (!t) break;
      profundidad += t[1] === '/' ? -1 : 1;
      j = t.index + t[0].length;
    }
    bloques.push({ tipo: 'ul', html: bruto.slice(inicio, j) });
    i = j;
  }
  return bloques;
}

/** Listas anidadas del artículo → [{ etiqueta, hijos|null }]. */
function parsearLista(html) {
  const re = /<(\/?)(ul|li)\b[^>]*>/gi;
  const raiz = [];
  const pilaListas = [];
  const pilaItems = [];
  let ultimo = 0;
  let m;

  while ((m = re.exec(html))) {
    const cierre = m[1] === '/';
    const tipo = m[2].toLowerCase();
    if (tipo === 'li') {
      if (!cierre) {
        const item = { etiqueta: '', hijos: null };
        const lista = pilaListas[pilaListas.length - 1] || raiz;
        lista.push(item);
        pilaItems.push(item);
        ultimo = m.index + m[0].length;
      } else {
        const item = pilaItems.pop();
        if (item && !item.hijos) item.etiqueta = html.slice(ultimo, m.index);
        ultimo = m.index + m[0].length;
      }
    } else if (!cierre) {
      const padre = pilaItems[pilaItems.length - 1];
      if (padre) {
        if (!padre.hijos) padre.hijos = [];
        if (!padre.etiqueta) padre.etiqueta = html.slice(ultimo, m.index);
        pilaListas.push(padre.hijos);
      } else {
        pilaListas.push(raiz);
      }
      ultimo = m.index + m[0].length;
    } else {
      pilaListas.pop();
      ultimo = m.index + m[0].length;
    }
  }
  return raiz;
}

/* Texto de un cambio: se sanea como el resto (sin enlaces; los blue posts son otra cosa). */
function cambiarATexto(html) {
  return forever.sanear('<p>' + String(html || '') + '</p>').replace(/^<p>/, '').replace(/<\/p>$/, '').trim();
}

function pintarItems(items, ctx = {}) {
  let salida = '';
  let cambios = [];

  const cerrar = () => {
    if (!cambios.length) return;
    salida += '<ul class="pn-lines">' + cambios.join('') + '</ul>';
    cambios = [];
  };

  for (const item of items) {
    const etiqueta = aTexto(item.etiqueta);
    if (item.hijos) {
      cerrar();
      const clase = nombreClase(etiqueta);
      /* Si lo que va en negrita es una frase (no una sección ni una clase), es un cambio más. */
      const esFrase = etiqueta.length > 60 || /[.!?]$/.test(etiqueta);
      if (clase) {
        salida += `<details class="bt-note-class"><summary><img src="/juego-img?p=${encodeURIComponent('/us/icons/56/classicon_' + clase + '.jpg')}" loading="lazy" alt="" width="20" height="20"><span>${escapar(etiqueta)}</span></summary>`;
        salida += pintarItems(item.hijos, { clase: etiqueta });
        salida += '</details>';
      } else if (esFrase) {
        const texto = cambiarATexto(item.etiqueta);
        const marca = marcaDeCambio(etiqueta);
        cambios.push(`<li>${MARCAS[marca]}<span class="pn-line">${texto}</span></li>`);
        cerrar();
        salida += pintarItems(item.hijos, ctx);
      } else {
        salida += `<h4 class="pn-spec">${escapar(etiqueta)}</h4>`;
        salida += pintarItems(item.hijos, ctx);
      }
      continue;
    }

    const texto = cambiarATexto(item.etiqueta);
    if (!texto.trim()) continue;
    const marca = marcaDeCambio(etiqueta);
    cambios.push(`<li>${MARCAS[marca]}<span class="pn-line">${texto}</span></li>`);
  }
  cerrar();
  return salida;
}

/* ---------------------------------------------------------------- armado */

/** Convierte el HTML de una fecha del artículo en bloques ya repartidos por juego. */
function repartirPorJuego(bloques) {
  const porJuego = { retail: [], classicEra: [], classicProg: [] };
  let actual = 'retail';

  for (const bloque of bloques) {
    if (bloque.tipo === 'p') {
      const soloTitulo = /^\s*<p>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>\s*$/i.exec(bloque.html);
      if (soloTitulo) {
        const titulo = aTexto(soloTitulo[1]);
        if (esFecha(titulo)) continue; /* la fecha ya da nombre a la tarjeta */
        const rama = ramaDe(titulo);
        if (rama) { actual = rama; continue; }
        /* Un <strong> suelto es cabecera solo si es corto; si es una frase con punto, es un cambio
           más (Blizzard a veces pone en negrita la primera línea de un arreglo). */
        if (titulo.length <= 60 && !/[.!?]$/.test(titulo)) {
          porJuego[actual].push(`<h4 class="pn-spec">${escapar(titulo)}</h4>`);
        } else {
          const texto = cambiarATexto(soloTitulo[1]);
          const marca = marcaDeCambio(titulo);
          porJuego[actual].push(`<ul class="pn-lines"><li>${MARCAS[marca]}<span class="pn-line">${texto}</span></li></ul>`);
        }
        continue;
      }
      const intro = /here you'?ll find a list of hotfixes/i.test(aTexto(bloque.html));
      if (intro) continue;
      const texto = cambiarATexto(bloque.html);
      if (texto.trim()) porJuego[actual].push(`<p>${texto}</p>`);
      continue;
    }

    if (bloque.tipo === 'h2' || bloque.tipo === 'h3') {
      const titulo = aTexto(bloque.html);
      if (!titulo || /^hotfixes$/i.test(titulo) || /table of contents/i.test(titulo)) continue;
      const rama = ramaDe(titulo);
      if (rama) { actual = rama; continue; }
      if (titulo.length <= 60 && !/[.!?]$/.test(titulo)) {
        porJuego[actual].push(`<h4 class="pn-spec">${escapar(titulo)}</h4>`);
      } else {
        const marca = marcaDeCambio(titulo);
        porJuego[actual].push(`<ul class="pn-lines"><li>${MARCAS[marca]}<span class="pn-line">${escapar(titulo)}</span></li></ul>`);
      }
      continue;
    }

    if (bloque.tipo === 'ul') {
      const html = pintarItems(parsearLista(bloque.html));
      if (html.trim()) porJuego[actual].push(html);
    }
  }

  return porJuego;
}

/** Tarjetas de un artículo, ya filtradas al juego pedido. */
function tarjetasDeArticulo(entrada, cuerpo, juego) {
  const tarjetas = [];
  const fechas = porFechas(cuerpo);

  for (const trozo of fechas) {
    const bloques = trocear(trozo);
    let fecha = entrada.fecha;

    /* La fecha abre el trozo, pero puede venir detrás del párrafo de introducción: se buscan los
       primeros bloques y, si uno es una fecha, manda y se quita. */
    for (let i = 0; i < Math.min(bloques.length, 4); i += 1) {
      const bloque = bloques[i];
      if (bloque.tipo !== 'p') continue;
      const titulo = /^\s*<p>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>\s*$/i.exec(bloque.html);
      if (titulo && esFecha(aTexto(titulo[1]))) {
        fecha = fechaDeTexto(titulo[1]) || fecha;
        bloques.splice(i, 1);
        break;
      }
    }

    const reparto = repartirPorJuego(bloques);
    const html = reparto[juego].join('\n');
    if (!html.trim()) continue;
    if (aTexto(html).length < 40) continue;

    const esHotfix = /^hotfixes/i.test(entrada.titulo);
    const fechaCorta = fecha ? fechaLarga(fecha) : '';
    tarjetas.push({
      id: `${entrada.id}-${fecha || tarjetas.length}`,
      titulo: esHotfix ? `${entrada.titulo.split(':')[0]}: ${fechaCorta}` : entrada.titulo,
      etiqueta: esHotfix ? 'Hotfix' : 'Content update',
      tipo: esHotfix ? 'hotfix' : 'build',
      fecha,
      cuerpo: html
    });
  }

  return tarjetas;
}

async function construir(juego) {
  const htmlIndice = await descargar(INDICE);
  if (!htmlIndice) throw new Error('el índice de notas no respondió');

  const entradas = leerIndice(htmlIndice).filter((e) => !/^hotfixes: (?:november|december|january)/i.test(e.titulo) || true);
  const articulos = [];

  for (const entrada of entradas) {
    const html = await descargar(entrada.url);
    await dormir(PAUSA_ENTRE_ARTICULOS_MS);
    if (!html) continue;
    const cuerpo = extraerCuerpo(html);
    if (!cuerpo) continue;
    articulos.push(...tarjetasDeArticulo(entrada, cuerpo, juego));
  }

  articulos.sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));

  return {
    actualizado: new Date().toISOString(),
    total: articulos.length,
    articulos: articulos.slice(0, 20)
  };
}

/** Notas de un juego (con caché). `forzar` la salta. */
async function listar(juego, forzar = false) {
  if (!JUEGOS.includes(juego)) throw new Error('juego no soportado');
  const guardada = cache.get(juego);
  const ahora = Date.now();
  if (!forzar && guardada && (ahora - guardada.cuando) < CACHE_TTL_MS) return guardada.datos;

  const datos = await construir(juego);
  cache.set(juego, { cuando: ahora, datos });
  return datos;
}

function limpiarCache() {
  cache.clear();
  cacheIconos.clear();
}

/* ---------------------------------------------------------------- iconos */

const ICONOS_BASE = 'https://render.worldofwarcraft.com';
const RUTA_ICONO = /^\/us\/icons\/[\w\-./]+\.(?:jpg|jpeg|png|webp|gif)$/i;
const MAX_ICONO_BYTES = 1024 * 1024;
const cacheIconos = new Map();

/** Descarga (y cachea) un icono de clase del CDN de Blizzard. Devuelve { cuerpo, tipo } o null. */
async function imagen(ruta) {
  const limpia = String(ruta || '');
  if (!RUTA_ICONO.test(limpia) || limpia.includes('..')) return null;

  const guardada = cacheIconos.get(limpia);
  if (guardada) return guardada;

  const control = new AbortController();
  const t = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ICONOS_BASE}${limpia}`, {
      signal: control.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' }
    });
    if (!res.ok) return null;
    const cuerpo = Buffer.from(await res.arrayBuffer());
    if (!cuerpo.length || cuerpo.length > MAX_ICONO_BYTES) return null;
    const ext = (limpia.match(/\.([a-z0-9]+)$/i) || [])[1].toLowerCase();
    const tipo = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    const entrada = { cuerpo, tipo };
    if (cacheIconos.size >= 200) cacheIconos.delete(cacheIconos.keys().next().value);
    cacheIconos.set(limpia, entrada);
    return entrada;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

module.exports = {
  JUEGOS,
  listar,
  imagen,
  limpiarCache,
  _internos: { leerIndice, extraerCuerpo, porFechas, trocear, parsearLista, pintarItems, repartirPorJuego, tarjetasDeArticulo, marcaDeCambio, ramaDe, nombreClase, esFecha, fechaDeTexto, INDICE, RUTA_ICONO }
};
