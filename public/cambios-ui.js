/**
 * public/cambios-ui.js — «Latest Changes» (dueño, 02-11-2026).
 *
 * Una sola lista, mezclada y ordenada por fecha:
 *   · Notas del parche — Forever las trae de /api/cambios-forever (texto, iconos y tablas ya
 *     saneados); los demás juegos, de /api/notas/<juego> (portal de Blizzard).
 *   · Blue posts — solo en Forever: los mensajes de los Community Manager en el foro oficial
 *     (/api/blue-posts). El cuerpo se pide al abrir la tarjeta y las imágenes y los vídeos van
 *     también por el servidor local.
 *
 * El cuerpo de cada tarjeta se inyecta la primera vez que se abre (las más largas pesan decenas de
 * KB) y las de blue posts ni siquiera lo piden hasta entonces.
 */

'use strict';

window.KorforgeCambios = (() => {
  let articulos = [];
  let aviso = false;
  let cargada = false;
  let cargando = false;
  /* Qué juego está elegido arriba: Forever tiene dos fuentes; el resto, la de Blizzard. */
  let juegoApi = 'forever';

  const API_DE_JUEGO = {
    forever: null,
    retail: 'retail',
    classic_era: 'classicEra',
    classic: 'classicProg'
  };

  function apiDeJuego(clave) {
    return Object.prototype.hasOwnProperty.call(API_DE_JUEGO, clave) && API_DE_JUEGO[clave] ? API_DE_JUEGO[clave] : 'forever';
  }

  function tr(clave, vars) {
    return window.T ? window.T(clave, vars) : clave;
  }

  function etiquetaBoton(btn, clave) {
    const span = btn && btn.querySelector('[data-i18n="changes_refresh"]');
    if (span) span.textContent = tr(clave);
  }

  function fechaCorta(fecha) {
    if (!window.I18N) return '';
    const rel = window.I18N.relativeDate(fecha);
    return rel || window.I18N.fmtDate(fecha, { day: 'numeric', month: 'numeric', year: 'numeric' }) || '';
  }

  function fechaLarga(fecha) {
    if (!window.I18N) return '';
    return window.I18N.fmtDate(fecha, { day: 'numeric', month: 'long', year: 'numeric' }) || '';
  }

  function estado(icono, titulo, descripcion) {
    const caja = document.createElement('div');
    caja.className = 'empty-state changes-empty';
    const emoji = document.createElement('span');
    emoji.className = 'empty-icon';
    emoji.textContent = icono;
    const h = document.createElement('h3');
    h.className = 'empty-title';
    h.textContent = titulo;
    caja.appendChild(emoji);
    caja.appendChild(h);
    if (descripcion) {
      const p = document.createElement('p');
      p.className = 'empty-desc';
      p.textContent = descripcion;
      caja.appendChild(p);
    }
    return caja;
  }

  /* ---------------------------------------------------------------- mezcla */

  /** Notas y blue posts en una sola lista, de lo más nuevo a lo más viejo. */
  function mezclar(notas, azules) {
    const lista = [];
    for (const n of notas || []) lista.push(Object.assign({}, n, { origen: 'nota' }));
    for (const b of azules || []) lista.push(Object.assign({}, b, { origen: 'blue', tipo: 'blue' }));
    lista.sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));
    return lista;
  }

  /* ---------------------------------------------------------------- tarjetas */

  function tarjeta({ tipo, titulo, sub, tituloLargo, alAbrir, abierta }) {
    const tarjeta = document.createElement('article');
    tarjeta.className = `changes-item is-${tipo}`;

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'changes-toggle';
    boton.setAttribute('aria-expanded', 'false');

    const punto = document.createElement('span');
    punto.className = 'changes-dot';
    punto.setAttribute('aria-hidden', 'true');

    const textos = document.createElement('span');
    textos.className = 'changes-headings';

    const h = document.createElement('span');
    h.className = 'changes-title';
    h.textContent = titulo || '';

    textos.appendChild(h);
    if (sub) {
      const s = document.createElement('span');
      s.className = 'changes-sub';
      s.textContent = sub;
      if (tituloLargo) s.title = tituloLargo;
      textos.appendChild(s);
    }

    const flecha = document.createElement('span');
    flecha.className = 'changes-chevron';
    flecha.setAttribute('aria-hidden', 'true');

    boton.appendChild(punto);
    boton.appendChild(textos);
    boton.appendChild(flecha);

    const cuerpo = document.createElement('div');
    cuerpo.className = 'changes-body';
    cuerpo.hidden = true;

    let preparado = false;
    const abrir = (abierto) => {
      boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
      tarjeta.classList.toggle('is-open', abierto);
      if (abierto && !preparado) {
        preparado = true;
        alAbrir(cuerpo);
      }
      /* Al cerrar, el vídeo se para de verdad (se quita el iframe y vuelve el botón). */
      if (!abierto) pararVideos(cuerpo);
      cuerpo.hidden = !abierto;
    };

    boton.addEventListener('click', () => {
      abrir(boton.getAttribute('aria-expanded') !== 'true');
    });

    tarjeta.appendChild(boton);
    tarjeta.appendChild(cuerpo);
    if (abierta) abrir(true);
    return tarjeta;
  }

  function tarjetaNota(articulo) {
    return tarjeta({
      tipo: articulo.tipo || 'build',
      titulo: articulo.titulo,
      sub: fechaCorta(articulo.fecha),
      tituloLargo: fechaLarga(articulo.fecha),
      abierta: false,
      alAbrir: (cuerpo) => {
        /* HTML saneado en el servidor: sin enlaces, sin scripts y con los iconos ya locales. */
        cuerpo.innerHTML = articulo.cuerpo || '';
      }
    });
  }

  function tarjetaBlue(articulo) {
    const autor = articulo.autor ? `${tr('blue_author')} · ${articulo.autor}` : tr('blue_author');
    const fecha = fechaCorta(articulo.fecha);
    return tarjeta({
      tipo: 'blue',
      titulo: articulo.titulo,
      sub: [autor, fecha].filter(Boolean).join(' · '),
      tituloLargo: fechaLarga(articulo.fecha),
      abierta: false,
      alAbrir: (cuerpo) => cargarCuerpoBlue(articulo, cuerpo)
    });
  }

  /* ---------------------------------------------------------------- blue posts */

  async function cargarCuerpoBlue(articulo, cuerpo) {
    cuerpo.replaceChildren(estado('⏳', tr('blue_loading')));
    try {
      const res = await fetch(`/api/blue-posts/${encodeURIComponent(articulo.id)}`);
      const datos = await res.json();
      if (!datos || !datos.success) throw new Error((datos && datos.code) || 'err_blue');
      cuerpo.innerHTML = datos.cuerpo || '';
      engancharVideos(cuerpo);
    } catch (_) {
      cuerpo.replaceChildren(estado('⚠️', tr('blue_error_title'), tr('blue_error_desc')));
    }
  }

  /** El botón del vídeo lo sustituye un reproductor de YouTube (sin cookies) al pulsarlo. */
  function engancharVideos(raiz) {
    raiz.querySelectorAll('.bp-video-play').forEach((boton) => {
      boton.addEventListener('click', () => montarVideo(boton), { once: true });
    });
  }

  function montarVideo(boton) {
    const id = String(boton.dataset.videoId || '');
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return;
    const marco = document.createElement('iframe');
    marco.className = 'bp-video-frame';
    marco.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
    marco.title = (boton.querySelector('.bp-video-title') || {}).textContent || 'YouTube';
    marco.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    marco.allowFullscreen = true;
    marco.loading = 'lazy';
    const caja = boton.closest('.bp-video');
    if (!caja) return;
    caja.__boton = boton;
    caja.replaceChildren(marco);
  }

  /**
   * Al cerrar una tarjeta (o salir de la pestaña) se quita el iframe: así el vídeo deja de sonar.
   * Quitarlo del DOM es lo que corta la reproducción; el botón vuelve a su sitio para poder repetir.
   */
  function pararVideos(raiz) {
    if (!raiz) return;
    raiz.querySelectorAll('.bp-video').forEach((caja) => {
      if (!caja.querySelector('.bp-video-frame')) return;
      const boton = caja.__boton;
      caja.__boton = null;
      caja.replaceChildren();
      if (boton) {
        caja.appendChild(boton);
        boton.addEventListener('click', () => montarVideo(boton), { once: true });
      }
    });
  }

  /* ---------------------------------------------------------------- pintado */

  function pintar() {
    const lista = document.getElementById('changesList');
    if (!lista) return;
    lista.replaceChildren();

    if (!articulos.length) {
      lista.appendChild(estado('📜', tr('changes_empty_title'), tr('changes_empty_desc')));
      return;
    }

    if (aviso) {
      const nota = document.createElement('p');
      nota.className = 'changes-warning';
      nota.textContent = tr('changes_partial');
      lista.appendChild(nota);
    }

    for (const articulo of articulos) {
      lista.appendChild(articulo.origen === 'blue' ? tarjetaBlue(articulo) : tarjetaNota(articulo));
    }
  }

  /* ---------------------------------------------------------------- carga */

  async function quitarDatos(url) {
    try {
      const res = await fetch(url);
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  async function cargar(forzar = false) {
    const lista = document.getElementById('changesList');
    const boton = document.getElementById('btnRefreshChanges');
    if (!lista || cargando) return;

    if (cargada && !forzar) {
      pintar();
      return;
    }

    cargando = true;
    if (boton) {
      boton.disabled = true;
      etiquetaBoton(boton, 'changes_refreshing');
    }
    lista.replaceChildren(estado('⏳', tr('changes_loading')));

    const sufijo = forzar ? '?forzar=1' : '';
    try {
      if (juegoApi === 'forever') {
        /* Las dos fuentes a la vez; si el foro falla, las notas se ven igual. */
        const [notas, azules] = await Promise.all([
          quitarDatos(`/api/cambios-forever${sufijo}`),
          quitarDatos(`/api/blue-posts${sufijo}`)
        ]);
        if (!notas || !notas.success) throw new Error((notas && notas.code) || 'err_changes');
        articulos = mezclar(notas.articulos, azules && azules.success ? azules.articulos : []);
        aviso = !!notas.parcial;
      } else {
        const datos = await quitarDatos(`/api/notas/${juegoApi}${sufijo}`);
        if (!datos || !datos.success) throw new Error((datos && datos.code) || 'err_notas');
        articulos = mezclar(datos.articulos, []);
        aviso = false;
      }
      cargada = true;
      pintar();
    } catch (_) {
      lista.replaceChildren(estado('⚠️', tr('changes_error_title'), tr('changes_error_desc')));
      cargada = false;
    } finally {
      cargando = false;
      if (boton) {
        boton.disabled = false;
        etiquetaBoton(boton, 'changes_refresh');
      }
    }
  }

  /* ---------------------------------------------------------------- juego */

  /** Al cambiar de idioma: se repinta lo que ya está cargado (fechas y textos del botón). */
  function repintar() {
    if (!window.I18N) return;
    if (cargada) pintar();
  }

  /** El selector de juego de arriba manda: cada juego tiene sus notas (y Forever, sus blue posts). */
  function fijarJuego(clave) {
    const nuevo = apiDeJuego(clave);
    if (nuevo === juegoApi) return;

    juegoApi = nuevo;
    articulos = [];
    cargada = false;
    aviso = false;

    const lista = document.getElementById('changesList');
    if (lista) lista.replaceChildren();
    if (document.getElementById('pane-changes')?.classList.contains('active')) cargar(false);
  }

  function juegoActual() {
    return juegoApi;
  }

  function limpiar() {
    articulos = [];
    cargada = false;
    aviso = false;
    const lista = document.getElementById('changesList');
    if (lista) lista.replaceChildren();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const boton = document.getElementById('btnRefreshChanges');
    if (boton) boton.addEventListener('click', () => cargar(true));
    /* Si se sale de la pestaña con un vídeo sonando, se corta. */
    document.querySelectorAll('.nav-item').forEach((b) => {
      b.addEventListener('click', () => pararVideos(document.getElementById('changesList')));
    });
  });

  return { cargar, pintar, limpiar, repintar, fijarJuego, juegoActual };
})();
