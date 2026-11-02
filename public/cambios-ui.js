/**
 * public/cambios-ui.js — «Latest Forever Changes» (dueño, 02-11-2026).
 *
 * Pinta las notas del parche de WoW Forever en #pane-changes. El texto, los iconos y las tablas de
 * clases vienen ya saneados del servidor (/api/cambios-forever): aquí no se mete nada del sitio tal
 * cual, no hay enlaces y las imágenes apuntan al propio servidor local (/cambios-img).
 *
 * El cuerpo de cada nota se inyecta la primera vez que se abre (las más largas pesan decenas de KB)
 * y así la pestaña abre al instante aunque haya 30 notas con cientos de iconos.
 */

'use strict';

window.KorforgeCambios = (() => {
  let articulos = [];
  let avisoParcial = false;
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

  function crearTarjeta(articulo, indice) {
    const tarjeta = document.createElement('article');
    tarjeta.className = `changes-item is-${articulo.tipo || 'build'}`;

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'changes-toggle';
    boton.setAttribute('aria-expanded', 'false');

    const punto = document.createElement('span');
    punto.className = 'changes-dot';
    punto.setAttribute('aria-hidden', 'true');

    const textos = document.createElement('span');
    textos.className = 'changes-headings';

    const titulo = document.createElement('span');
    titulo.className = 'changes-title';
    titulo.textContent = articulo.titulo || '';

    const sub = document.createElement('span');
    sub.className = 'changes-sub';
    const fecha = fechaCorta(articulo.fecha);
    sub.textContent = fecha;
    if (fechaLarga(articulo.fecha)) sub.title = fechaLarga(articulo.fecha);

    textos.appendChild(titulo);
    if (fecha) textos.appendChild(sub);

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
        /* HTML saneado en el servidor: sin enlaces, sin scripts y con los iconos ya locales. */
        cuerpo.innerHTML = articulo.cuerpo || '';
        preparado = true;
      }
      cuerpo.hidden = !abierto;
    };

    boton.addEventListener('click', () => {
      abrir(boton.getAttribute('aria-expanded') !== 'true');
    });

    tarjeta.appendChild(boton);
    tarjeta.appendChild(cuerpo);
    /* La nota más reciente abre sola; el resto, a un clic. */
    if (indice === 0) abrir(true);
    return tarjeta;
  }

  function pintar() {
    const lista = document.getElementById('changesList');
    if (!lista) return;
    lista.replaceChildren();

    if (!articulos.length) {
      lista.appendChild(estado('📜', tr('changes_empty_title'), tr('changes_empty_desc')));
      return;
    }

    if (avisoParcial) {
      const aviso = document.createElement('p');
      aviso.className = 'changes-warning';
      aviso.textContent = tr('changes_partial');
      lista.appendChild(aviso);
    }

    articulos.forEach((articulo, indice) => lista.appendChild(crearTarjeta(articulo, indice)));
  }

  async function cargar(forzar = false) {
    const lista = document.getElementById('changesList');
    const boton = document.getElementById('btnRefreshChanges');
    if (!lista || cargando) return;

    cargando = true;
    if (boton) {
      boton.disabled = true;
      etiquetaBoton(boton, 'changes_refreshing');
    }
    if (!articulos.length) {
      lista.replaceChildren(estado('⏳', tr('changes_loading')));
    }

    try {
      const res = await fetch(`/api/cambios-forever${forzar ? '?forzar=1' : ''}`);
      const datos = await res.json();
      if (!datos || !datos.success) throw new Error((datos && datos.code) || 'err_changes');
      articulos = Array.isArray(datos.articulos) ? datos.articulos : [];
      avisoParcial = !!datos.parcial;
      pintar();
    } catch (_) {
      lista.replaceChildren(estado('⚠️', tr('changes_error_title'), tr('changes_error_desc')));
    } finally {
      cargando = false;
      if (boton) {
        boton.disabled = false;
        etiquetaBoton(boton, 'changes_refresh');
      }
    }
  }

  function limpiar() {
    articulos = [];
    const lista = document.getElementById('changesList');
    if (lista) lista.replaceChildren();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const boton = document.getElementById('btnRefreshChanges');
    if (boton) boton.addEventListener('click', () => cargar(true));
  });

  return { cargar, pintar, limpiar };
})();
