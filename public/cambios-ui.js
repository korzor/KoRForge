/**
 * public/cambios-ui.js — «Latest Forever Changes» (dueño, 02-11-2026).
 *
 * Pinta dos vistas dentro de #pane-changes:
 *   · Notas del parche — el texto, los iconos y las tablas vienen ya saneados del servidor
 *     (/api/cambios-forever): no hay enlaces y las imágenes apuntan al servidor local (/cambios-img).
 *   · Blue posts — los mensajes de los Community Manager de Blizzard en el foro oficial de
 *     WoW: Forever (/api/blue-posts). El cuerpo de cada uno se pide al abrir su tarjeta y se pinta
 *     ya saneado (sin enlaces ni imágenes de fuera); los vídeos de YouTube se montan aquí, solo
 *     cuando el usuario le da al play, y con el dominio sin cookies.
 *
 * El cuerpo de cada nota se inyecta la primera vez que se abre (las más largas pesan decenas de KB)
 * y así la pestaña abre al instante aunque haya 30 notas con cientos de iconos.
 */

'use strict';

window.KorforgeCambios = (() => {
  const VISTAS = {
    notes: { articulos: [], aviso: false, cargada: false },
    blue: { articulos: [], cargada: false }
  };
  let vista = 'notes';
  let cargando = false;

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
      cuerpo.hidden = !abierto;
    };

    boton.addEventListener('click', () => {
      abrir(boton.getAttribute('aria-expanded') !== 'true');
    });

    tarjeta.appendChild(boton);
    tarjeta.appendChild(cuerpo);
    /* La más reciente abre sola; el resto, a un clic. */
    if (abierta) abrir(true);
    return tarjeta;
  }

  function tarjetaNota(articulo, indice) {
    return tarjeta({
      tipo: articulo.tipo || 'build',
      titulo: articulo.titulo,
      sub: fechaCorta(articulo.fecha),
      tituloLargo: fechaLarga(articulo.fecha),
      abierta: indice === 0,
      alAbrir: (cuerpo) => {
        /* HTML saneado en el servidor: sin enlaces, sin scripts y con los iconos ya locales. */
        cuerpo.innerHTML = articulo.cuerpo || '';
      }
    });
  }

  function tarjetaBlue(articulo, indice) {
    const autor = articulo.autor ? `${tr('blue_author')} · ${articulo.autor}` : tr('blue_author');
    const fecha = fechaCorta(articulo.fecha);
    return tarjeta({
      tipo: 'blue',
      titulo: articulo.titulo,
      sub: [autor, fecha].filter(Boolean).join(' · '),
      tituloLargo: fechaLarga(articulo.fecha),
      abierta: indice === 0,
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
    if (caja) caja.replaceChildren(marco);
  }

  /* ---------------------------------------------------------------- pintado */

  function pintar() {
    const lista = document.getElementById('changesList');
    if (!lista) return;
    lista.replaceChildren();

    const datos = VISTAS[vista];

    if (!datos.articulos.length) {
      if (vista === 'blue') {
        lista.appendChild(estado('💬', tr('blue_empty_title'), tr('blue_empty_desc')));
      } else {
        lista.appendChild(estado('📜', tr('changes_empty_title'), tr('changes_empty_desc')));
      }
      return;
    }

    if (vista === 'notes' && datos.aviso) {
      const aviso = document.createElement('p');
      aviso.className = 'changes-warning';
      aviso.textContent = tr('changes_partial');
      lista.appendChild(aviso);
    }

    const crear = vista === 'blue' ? tarjetaBlue : tarjetaNota;
    datos.articulos.forEach((articulo, indice) => lista.appendChild(crear(articulo, indice)));
  }

  /* ---------------------------------------------------------------- carga */

  async function cargar(forzar = false) {
    const lista = document.getElementById('changesList');
    const boton = document.getElementById('btnRefreshChanges');
    if (!lista || cargando) return;

    const actual = VISTAS[vista];
    if (actual.cargada && !forzar) {
      pintar();
      return;
    }

    cargando = true;
    if (boton) {
      boton.disabled = true;
      etiquetaBoton(boton, 'changes_refreshing');
    }
    lista.replaceChildren(estado('⏳', tr(vista === 'blue' ? 'blue_loading' : 'changes_loading')));

    try {
      const url = vista === 'blue'
        ? `/api/blue-posts${forzar ? '?forzar=1' : ''}`
        : `/api/cambios-forever${forzar ? '?forzar=1' : ''}`;
      const res = await fetch(url);
      const datos = await res.json();
      if (!datos || !datos.success) throw new Error((datos && datos.code) || 'err_changes');
      actual.articulos = Array.isArray(datos.articulos) ? datos.articulos : [];
      actual.aviso = !!datos.parcial;
      actual.cargada = true;
      pintar();
    } catch (_) {
      lista.replaceChildren(estado('⚠️',
        tr(vista === 'blue' ? 'blue_error_title' : 'changes_error_title'),
        tr(vista === 'blue' ? 'blue_error_desc' : 'changes_error_desc')));
      actual.cargada = false;
    } finally {
      cargando = false;
      if (boton) {
        boton.disabled = false;
        etiquetaBoton(boton, 'changes_refresh');
        aplicarPistaBoton(boton);
      }
    }
  }

  /* ---------------------------------------------------------------- vistas */

  function aplicarPistaBoton(boton) {
    if (!boton) return;
    const clave = vista === 'blue' ? 'changes_refresh_hint_blue' : 'changes_refresh_hint';
    boton.setAttribute('data-i18n-title', clave);
    boton.title = tr(clave);
  }

  function cambiarVista(nueva) {
    if (!VISTAS[nueva] || nueva === vista) return;
    vista = nueva;
    document.querySelectorAll('.changes-view').forEach((b) => {
      const activa = b.dataset.view === nueva;
      b.classList.toggle('is-active', activa);
      b.setAttribute('aria-selected', activa ? 'true' : 'false');
    });
    aplicarPistaBoton(document.getElementById('btnRefreshChanges'));
    cargar(false);
  }

  function limpiar() {
    Object.values(VISTAS).forEach((v) => {
      v.articulos = [];
      v.cargada = false;
    });
    const lista = document.getElementById('changesList');
    if (lista) lista.replaceChildren();
  }

  /** Al cambiar de idioma: se repinta lo que ya está cargado (fechas y textos del botón). */
  function repintar() {
    aplicarPistaBoton(document.getElementById('btnRefreshChanges'));
    if (VISTAS[vista].cargada) pintar();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const boton = document.getElementById('btnRefreshChanges');
    if (boton) boton.addEventListener('click', () => cargar(true));
    document.querySelectorAll('.changes-view').forEach((b) => {
      b.addEventListener('click', () => cambiarVista(b.dataset.view));
    });
  });

  return { cargar, pintar, limpiar, cambiarVista, repintar };
})();
