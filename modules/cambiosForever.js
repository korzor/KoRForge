/**
 * KoRForge - «Latest Forever Changes» (dueño, 02-11-2026).
 *
 * QUE ES: la pestaña que antes era «Noticias» pasa a enseñar las notas del parche y los hotfixes de
 * WoW Forever tal y como se publican en ForeverChanges, con su texto, sus iconos y sus imágenes.
 *
 * DE DONDE SALEN: el dueño pidió estas dos fuentes (y el autor del sitio dio permiso para copiar las
 * noticias enteras):
 *   1. El feed RSS `https://foreverchanges.pro/patch-notes/feed.xml`, que manda la lista ordenada
 *      de noticias (título, fecha y ancla de cada una).
 *   2. La propia página de notas `https://foreverchanges.pro/patch-notes`, de donde se toma el
 *      cuerpo con formato (párrafos, iconos de hechizo y de clase, pliegues por clase y objetos).
 *      El feed solo trae un resumen en texto plano: sin la página se perderían los iconos.
 *
 * EN INGLÉS (dueño, 03-11-2026): se usan las URL sin prefijo de idioma, que son las inglesas. En las
 * españolas (`/es/...`) los hechizos, clases y secciones salían en castellano y el resto en inglés,
 * así que la pestaña quedaba mezclada. En inglés está todo en el mismo idioma.
 *
 * QUE SE QUITA: toda alusión al sitio. No queda ni un enlace (los <a> se desenvuelven y sus href se
 * tiran), no se muestran URL suyas, se borra el nombre del sitio del texto y se quitan las frases que
 * hablaban de «esta página», «la página Razas» o «the Races page». El título de cada noticia se queda
 * tal cual, sin añadir de dónde viene.
 *
 * LAS IMÁGENES: no se enlazan contra el sitio. Cada icono se pide al propio servidor de KoRForge
 * (`/cambios-img?p=...`), que lo descarga una vez y lo cachea en memoria. La app nunca muestra un
 * enlace ni un dominio del sitio.
 *
 * CACHÉ: en memoria, 10 minutos (la página pesa más de 2 MB). El botón «Actualizar» la salta.
 */
'use strict';

const FEED_URL = 'https://foreverchanges.pro/patch-notes/feed.xml';
const PAGINA_URL = 'https://foreverchanges.pro/patch-notes';
const IMAGENES_URL = 'https://foreverchanges.pro';
const USER_AGENT = 'KoRForge/1.6.4 (+https://github.com/korzor/KoRForge)';
const CACHE_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 20000;
const MAX_ARTICULOS = 40;
const MAX_IMAGEN_BYTES = 2 * 1024 * 1024;
const CACHE_IMAGENES_MAX = 800;

/* Prefijos de imagen que se aceptan. Solo iconos de hechizo/clase/objeto y el arte de referencia:
   nada de la cabecera del sitio (su logotipo se descarta). */
const PREFIJOS_IMAGEN = ['/icon/', '/wow-ui/'];
const EXTENSIONES_IMAGEN = /\.(?:jpg|jpeg|png|webp|gif|svg)$/i;

/* Etiquetas que se conservan del HTML original. El resto se desenvuelve (su texto se queda) y las
   peligrosas se tiran enteras con su contenido. */
const ETIQUETAS_PERMITIDAS = new Set([
  'p', 'ul', 'ol', 'li', 'div', 'span', 'small', 'b', 'strong', 'em',
  'section', 'details', 'summary', 'h3', 'h4', 'img', 'svg', 'path', 'title', 'br',
  /* Tablas y citas: las usan las notas y también los blue posts del foro de Blizzard. */
  'blockquote', 'aside', 'table', 'thead', 'tbody', 'tr', 'td', 'th'
]);
const ETIQUETAS_VACIAS = new Set(['img', 'br', 'path']);
const ETIQUETAS_DESCARTADAS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select',
  'textarea', 'video', 'audio', 'source', 'template', 'noscript', 'link', 'meta'
]);

/* Clases con significado visual en las notas. Cualquier otra clase se tira: así no se cuela nada
   del sitio y el CSS de la app manda. */
const CLASES_PERMITIDAS = new Set([
  'pn-lines', 'pn-line', 'pn-spec', 'pn-head', 'pn-notes', 'pn-shape', 'pn-found',
  'pn-points', 'pn-later', 'pn-topic', 'pn-items-minor',
  'bt-notes', 'bt-note-class', 'bt-note-items', 'bt-note-body', 'bt-note-said',
  'bt-build-body', 'bt-said', 'bt-set-name', 'bt-set-bonus', 'bt-items-note',
  'v2-mark', 'is-buff', 'is-nerf', 'is-change', 'is-new', 'is-removed', 'is-moved',
  'is-wording', 'is-announced', 'is-current', 'q1', 'q2', 'q3', 'q4'
]);

let cache = { cuando: 0, datos: null };
const cacheImagenes = new Map();

/* ---------------------------------------------------------------- utilidades */

/** Quita etiquetas y decodifica entidades: para campos cortos del feed. */
function aTextoPlano(valor) {
  return decodificar(String(valor || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodificar(texto) {
  return String(texto || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&hellip;/gi, '...')
    .replace(/&mdash;/gi, '-')
    .replace(/&ndash;/gi, '-')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function escapar(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Deja el texto sin alusiones al sitio (ver cabecera). */
function limpiarTexto(texto) {
  let limpio = String(texto || '')
    .replace(/https?:\/\/\S*foreverchanges\S*/gi, '')
    .replace(/foreverchanges(?:\.pro)?/gi, '')
    /* Direcciones sueltas en mitad de una frase: no se muestran (los blue posts del foro citan
       enlaces a mano y así la frase se lee sin dominios). */
    .replace(/https?:\/\/\S+/gi, '');

  /* Las frases que hablan de la web del sitio se van enteras: son una alusión, y dejarlas a medias
     rompería la frase («Según , esto cambia»). */
  const SITIO = /(\besta web\b|\bthis web\b|\besta p[áa]gina\b|\bthis page\b|\beste sitio\b|\bthis site\b|\bnuestra web\b|\bour site\b)/i;
  if (SITIO.test(limpio)) {
    limpio = limpio
      .split(/(?<=[.!?])\s+/)
      .filter((frase) => !SITIO.test(frase))
      .join(' ');
  }

  return limpio
    .replace(/y la p[áa]gina Razas los muestra bajo cada racial/gi, '')
    /* «The lines below say what changes at launch, and the Races page shows them under each
       racial.»: se va la coletilla de la página del sitio y se queda la frase útil. */
    .replace(/,\s*and the [A-Z][\w'-]* page[^.]*\./g, '.')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[ \t]{2,}/g, ' ');
}

async function descargar(url, acepta) {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: control.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: acepta, 'Accept-Language': 'en' }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/* ---------------------------------------------------------------- feed RSS */

/** Lista ordenada de noticias del feed: { id, titulo, fecha, resumen, ancla }. */
function parsearFeed(xml) {
  const items = [];
  const trozos = String(xml || '').match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const trozo of trozos) {
    const campo = (nombre) => {
      const m = trozo.match(new RegExp(`<${nombre}\\b[^>]*>([\\s\\S]*?)<\\/${nombre}>`, 'i'));
      return m ? decodificar(m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1')).trim() : '';
    };
    const titulo = aTextoPlano(campo('title'));
    const enlace = campo('link');
    const fecha = campo('pubDate');
    const resumen = aTextoPlano(campo('description'));
    if (!titulo) continue;
    const ancla = (enlace.match(/#(.+)$/) || [])[1] || '';
    const marca = Date.parse(fecha);
    items.push({
      id: ancla || `nota-${items.length + 1}`,
      titulo,
      resumen,
      ancla,
      fecha: Number.isFinite(marca) ? new Date(marca).toISOString() : ''
    });
  }
  return items.slice(0, MAX_ARTICULOS);
}

/* ---------------------------------------------------------------- página de notas */

/** Trozos `<li id="ancla">…</li>` de la lista de builds, indexados por ancla. */
function extraerSecciones(html) {
  const texto = String(html || '');
  const inicio = texto.search(/<ol[^>]*class="[^"]*bt-builds[^"]*"/i);
  const desde = inicio >= 0 ? inicio : 0;
  const fin = desde ? texto.indexOf('</ol>', desde) : -1;
  const zona = desde ? texto.slice(desde, fin > 0 ? fin : texto.length) : texto;

  const mapa = new Map();
  const aperturas = [...zona.matchAll(/<li\s+id="([^"]+)"[^>]*>/gi)];
  for (let i = 0; i < aperturas.length; i += 1) {
    const m = aperturas[i];
    const siguiente = i + 1 < aperturas.length ? aperturas[i + 1].index : zona.length;
    mapa.set(m[1], zona.slice(m.index, siguiente));
  }
  return mapa;
}

function etiquetaDe(seccion) {
  const m = String(seccion || '').match(/<span[^>]*class="[^"]*pn-version[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  return m ? aTextoPlano(m[1]) : '';
}

function fechaDe(seccion) {
  const m = String(seccion || '').match(/<time[^>]*datetime="([^"]+)"/i);
  return m ? m[1] : '';
}

/** Tipo de nota, solo para el color de la etiqueta. */
function tipoDe(etiqueta, titulo) {
  const texto = `${etiqueta || ''} ${titulo || ''}`.toLowerCase();
  if (/^hotfix|hotfix,/.test(texto)) return 'hotfix';
  if (/anunciad|announce/.test(texto)) return 'announced';
  return 'build';
}

/* ---------------------------------------------------------------- saneado HTML */

function leerAtributos(bruto) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
  let m;
  while ((m = re.exec(bruto)) !== null) {
    const nombre = m[1].toLowerCase();
    if (attrs[nombre] === undefined) {
      attrs[nombre] = decodificar(m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : '')));
    }
  }
  return attrs;
}

/** Posición del `>` de la etiqueta que empieza en `inicio`, sin contar los que van entre comillas. */
function finDeEtiqueta(texto, inicio) {
  let comilla = '';
  for (let i = inicio + 1; i < texto.length; i += 1) {
    const c = texto[i];
    if (comilla) {
      if (c === comilla) comilla = '';
    } else if (c === '"' || c === "'") {
      comilla = c;
    } else if (c === '>') {
      return i;
    }
  }
  return -1;
}

function analizar(html) {
  const nodos = [];
  const texto = String(html || '');
  let i = 0;
  while (i < texto.length) {
    const lt = texto.indexOf('<', i);
    if (lt < 0) {
      nodos.push({ tipo: 'texto', valor: texto.slice(i) });
      break;
    }
    if (lt > i) nodos.push({ tipo: 'texto', valor: texto.slice(i, lt) });

    if (texto.startsWith('<!--', lt)) {
      const cierre = texto.indexOf('-->', lt + 4);
      i = cierre < 0 ? texto.length : cierre + 3;
      continue;
    }
    if (texto.startsWith('<!', lt)) {
      const cierre = texto.indexOf('>', lt);
      i = cierre < 0 ? texto.length : cierre + 1;
      continue;
    }

    const gt = finDeEtiqueta(texto, lt);
    if (gt < 0) {
      nodos.push({ tipo: 'texto', valor: texto.slice(lt) });
      break;
    }
    const bruto = texto.slice(lt + 1, gt).trim();
    i = gt + 1;
    if (!bruto) continue;

    if (bruto.startsWith('/')) {
      nodos.push({ tipo: 'fin', nombre: bruto.slice(1).trim().toLowerCase() });
      continue;
    }
    const m = bruto.match(/^([a-zA-Z][\w:-]*)/);
    if (!m) continue;
    const nombre = m[1].toLowerCase();
    nodos.push({
      tipo: 'inicio',
      nombre,
      attrs: leerAtributos(bruto.slice(m[0].length)),
      autocierre: /\/\s*$/.test(bruto)
    });
  }
  return nodos;
}

function aArbol(nodos) {
  const raiz = { tipo: 'raiz', hijos: [] };
  const pila = [raiz];
  for (const nodo of nodos) {
    if (nodo.tipo === 'texto') {
      pila[pila.length - 1].hijos.push(nodo);
    } else if (nodo.tipo === 'inicio') {
      const el = { tipo: 'elemento', nombre: nodo.nombre, attrs: nodo.attrs, hijos: [] };
      pila[pila.length - 1].hijos.push(el);
      if (!ETIQUETAS_VACIAS.has(nodo.nombre) && !nodo.autocierre) pila.push(el);
    } else {
      for (let k = pila.length - 1; k > 0; k -= 1) {
        if (pila[k].nombre === nodo.nombre) {
          pila.length = k;
          break;
        }
      }
    }
  }
  return raiz;
}

/** URL local del icono; '' si la imagen no es de las permitidas. */
function rutaImagen(src) {
  const limpio = String(src || '').trim();
  if (!limpio || limpio.includes('..') || !EXTENSIONES_IMAGEN.test(limpio)) return '';
  if (!PREFIJOS_IMAGEN.some((prefijo) => limpio.startsWith(prefijo))) return '';
  if (!/^[A-Za-z0-9_\-./]+$/.test(limpio)) return '';
  return `/cambios-img?p=${encodeURIComponent(limpio)}`;
}

function clasesDe(valor) {
  return String(valor || '')
    .split(/\s+/)
    .filter((clase) => CLASES_PERMITIDAS.has(clase))
    .join(' ');
}

function atributosDe(nombre, attrs) {
  const partes = [];
  const clase = clasesDe(attrs.class);
  if (clase) partes.push(`class="${clase}"`);

  if (nombre === 'img') {
    const src = rutaImagen(attrs.src);
    if (!src) return '';
    partes.push(`src="${src}"`);
    partes.push('loading="lazy"');
    partes.push('alt=""');
    const ancho = Number(attrs.width);
    const alto = Number(attrs.height);
    if (Number.isFinite(ancho) && ancho > 0 && ancho <= 64) partes.push(`width="${ancho}"`);
    if (Number.isFinite(alto) && alto > 0 && alto <= 64) partes.push(`height="${alto}"`);
  } else if (nombre === 'svg') {
    const caja = attrs.viewbox || '';
    if (/^0 0 \d{1,3} \d{1,3}$/.test(caja)) partes.push(`viewBox="${caja}"`);
    if (/^\d{1,2}$/.test(attrs.width || '')) partes.push(`width="${attrs.width}"`);
    if (/^\d{1,2}$/.test(attrs.height || '')) partes.push(`height="${attrs.height}"`);
    partes.push('aria-hidden="true"');
  } else if (nombre === 'path') {
    const d = String(attrs.d || '');
    if (/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]{1,400}$/.test(d)) partes.push(`d="${d}"`);
  }
  return partes.length ? ' ' + partes.join(' ') : '';
}

function pintarNodos(nodos) {
  let salida = '';
  for (const nodo of nodos) {
    if (nodo.tipo === 'texto') {
      /* Primero se decodifican las entidades del sitio (&amp;, &#x27;…) y luego se escapa el texto
         ya limpio: si no, se vería «&amp;» en pantalla. */
      salida += escapar(limpiarTexto(decodificar(nodo.valor)));
      continue;
    }
    salida += pintarElemento(nodo);
  }
  return salida;
}

function pintarElemento(el) {
  const nombre = el.nombre;
  if (ETIQUETAS_DESCARTADAS.has(nombre)) return '';
  const hijos = () => pintarNodos(el.hijos);

  if (nombre === 'a') {
    /* Nunca queda un enlace: el texto se conserva. En los objetos se conserva el color de calidad. */
    const calidad = String(el.attrs.class || '').split(/\s+/).find((c) => /^q[1-4]$/.test(c));
    return calidad ? `<span class="${calidad}">${hijos()}</span>` : hijos();
  }
  if (!ETIQUETAS_PERMITIDAS.has(nombre)) return hijos();

  if (nombre === 'img') {
    const attrs = atributosDe('img', el.attrs);
    return attrs ? `<img${attrs}>` : '';
  }
  if (nombre === 'br') return '<br>';
  if (nombre === 'path') {
    const attrs = atributosDe('path', el.attrs);
    return `<path${attrs}></path>`;
  }

  const attrs = atributosDe(nombre, el.attrs);
  return `<${nombre}${attrs}>${hijos()}</${nombre}>`;
}

/** Convierte el HTML del sitio en HTML propio: sin enlaces, sin scripts y con iconos locales. */
function sanear(html) {
  return pintarNodos(aArbol(analizar(html)).hijos);
}

/* ---------------------------------------------------------------- armado */

function cuerpoDeRespaldo(articulo) {
  const texto = articulo.resumen || '';
  return texto ? `<p>${escapar(limpiarTexto(texto))}</p>` : '';
}

async function construir() {
  const [xml, html] = await Promise.all([
    descargar(FEED_URL, 'application/rss+xml, application/xml, text/xml'),
    descargar(PAGINA_URL, 'text/html')
  ]);

  if (!xml) throw new Error('el feed no respondió');

  const feed = parsearFeed(xml);
  const secciones = html ? extraerSecciones(html) : new Map();
  const articulos = [];
  let sinFormato = 0;

  for (const item of feed) {
    const seccion = (item.ancla && secciones.get(item.ancla)) || '';
    let cuerpo = '';
    if (seccion) {
      const sinCabecera = seccion
        .replace(/^<li\b[^>]*>/i, '')
        .replace(/<\/li>\s*$/i, '')
        .replace(/<div[^>]*class="[^"]*bt-build-id[^"]*"[\s\S]*?<\/div>/i, '');
      cuerpo = sanear(sinCabecera);
    }
    if (!cuerpo) {
      cuerpo = cuerpoDeRespaldo(item);
      sinFormato += 1;
    }

    const etiqueta = limpiarTexto(etiquetaDe(seccion)) || (item.titulo.match(/^(Build\s+[\w.]+)/i) || [])[1] || 'Notas';
    const fecha = fechaDe(seccion) || item.fecha;

    articulos.push({
      id: item.id,
      titulo: limpiarTexto(item.titulo),
      etiqueta,
      tipo: tipoDe(etiqueta, item.titulo),
      fecha,
      cuerpo
    });
  }

  const fechas = articulos.map((a) => Date.parse(a.fecha)).filter((n) => Number.isFinite(n));
  /* Aviso de carga parcial solo si falla una parte de verdad: una nota sin sección (las más viejas)
     cae al resumen del feed y eso no merece un aviso en pantalla. */
  const umbral = Math.max(2, Math.ceil(articulos.length * 0.25));
  return {
    actualizado: new Date().toISOString(),
    total: articulos.length,
    parcial: !html || sinFormato >= umbral,
    sinFormato,
    ultimaFecha: fechas.length ? new Date(Math.max(...fechas)).toISOString() : '',
    articulos
  };
}

/** Lista de notas (con caché). `forzar` la salta. */
async function listar(forzar = false) {
  const ahora = Date.now();
  if (!forzar && cache.datos && (ahora - cache.cuando) < CACHE_TTL_MS) return cache.datos;
  const datos = await construir();
  cache = { cuando: ahora, datos };
  return datos;
}

/* ---------------------------------------------------------------- imágenes */

function tipoDeImagen(ruta) {
  const ext = (ruta.match(/\.([a-z0-9]+)$/i) || [])[1] || 'jpg';
  const tipos = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml'
  };
  return tipos[ext.toLowerCase()] || 'application/octet-stream';
}

/** Descarga (y cachea) una imagen del sitio. Devuelve { cuerpo, tipo } o null. */
async function imagen(ruta) {
  const limpia = String(ruta || '');
  if (!rutaImagen(limpia)) return null;

  const guardada = cacheImagenes.get(limpia);
  if (guardada) return guardada;

  const control = new AbortController();
  const t = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${IMAGENES_URL}${limpia}`, {
      signal: control.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' }
    });
    if (!res.ok) return null;
    const largo = Number(res.headers.get('content-length') || 0);
    if (largo > MAX_IMAGEN_BYTES) return null;
    const cuerpo = Buffer.from(await res.arrayBuffer());
    if (!cuerpo.length || cuerpo.length > MAX_IMAGEN_BYTES) return null;

    const entrada = { cuerpo, tipo: tipoDeImagen(limpia) };
    if (cacheImagenes.size >= CACHE_IMAGENES_MAX) {
      const primera = cacheImagenes.keys().next().value;
      cacheImagenes.delete(primera);
    }
    cacheImagenes.set(limpia, entrada);
    return entrada;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

module.exports = {
  listar,
  imagen,
  /* Internos, para la sonda de verificación */
  _internos: { FEED_URL, PAGINA_URL, parsearFeed, extraerSecciones, sanear, decodificar, limpiarTexto, rutaImagen, aTextoPlano }
};
