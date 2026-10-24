/**
 * KoRForge - menú contextual propio: cortar / copiar / pegar (dueño, 24-10-2026).
 *
 * POR QUÉ EXISTE: en un campo de texto, Electron no trae el menú del sistema (el de «Cortar/Copiar/
 * Pegar» de cualquier editor). El dueño lo quiere, con el diseño de la app, en TODOS los campos de
 * introducción de texto, y en las páginas de solo lectura (la ficha del addon) solo «Copiar».
 *
 * CÓMO: el portapapeles no lo puede tocar la página, así que se lo pide a Electron por el puente
 * (`window.electronAPI.portapapeles`, ver preload.js). Cada acción es lo mismo que su atajo de
 * teclado, sobre el elemento que tiene el foco: se le devuelve el foco al campo antes de ejecutar.
 *
 * TECLADO: Escape cierra y devuelve el foco; flechas arriba/abajo recorren; Enter/Espacio ejecutan.
 */
(function () {
  'use strict';

  var ID_MENU = 'korforge-menu-contextual';
  var menu = null;
  var objetivo = null; // el input/textarea sobre el que se ha hecho clic (null = solo lectura)
  var botones = [];
  var indice = 0;

  /* Texto traducido con respaldo: si I18N no está, el menú sigue funcionando en español. */
  function t(clave, respaldo) {
    try {
      if (window.I18N && typeof window.I18N.t === 'function') {
        var texto = window.I18N.t(clave);
        if (texto && texto !== clave) return texto;
      }
    } catch (e) { /* sin i18n */ }
    return respaldo;
  }

  function api() {
    return (window.electronAPI && window.electronAPI.portapapeles) || null;
  }

  /** ¿Es un campo donde se escribe? (los password y number también cuentan) */
  function esCampoEditable(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return !el.disabled && !el.readOnly;
    if (tag !== 'input') return false;
    var tipo = String(el.type || 'text').toLowerCase();
    var editables = ['text', 'search', 'url', 'email', 'tel', 'password', 'number'];
    return editables.indexOf(tipo) >= 0 && !el.disabled && !el.readOnly;
  }

  function haySeleccionEnCampo(el) {
    try { return el.selectionStart !== el.selectionEnd; } catch (e) { return false; }
  }

  function haySeleccionEnPagina() {
    try {
      var sel = window.getSelection && window.getSelection();
      return !!(sel && String(sel).trim().length > 0);
    } catch (e) { return false; }
  }

  function construirMenu() {
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = ID_MENU;
    menu.className = 'kf-menu-contextual';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', t('ctx_menu_label', 'Menú de texto'));
    menu.hidden = true;
    menu.addEventListener('mousedown', function (ev) {
      /* Que el clic no le quite el foco al campo antes de actuar. */
      ev.preventDefault();
    });
    document.body.appendChild(menu);
    return menu;
  }

  function cerrar() {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    menu.innerHTML = '';
    botones = [];
    indice = 0;
    var devolver = objetivo;
    objetivo = null;
    if (devolver && typeof devolver.focus === 'function') {
      try { devolver.focus({ preventScroll: true }); } catch (e) { /* nada */ }
    }
  }

  function enfocar(i) {
    if (!botones.length) return;
    indice = (i + botones.length) % botones.length;
    botones.forEach(function (b, n) { b.classList.toggle('kf-menu-foco', n === indice); });
    botones[indice].focus({ preventScroll: true });
  }

  function ejecutar(nombre) {
    var puente = api();
    var campo = objetivo;
    cerrar();
    if (!puente) return;
    try {
      if (campo && document.activeElement !== campo) campo.focus({ preventScroll: true });
      if (nombre === 'cortar') puente.cortar();
      else if (nombre === 'copiar') puente.copiar();
      else if (nombre === 'pegar') puente.pegar();
      else if (nombre === 'seleccionar') puente.seleccionarTodo();
      else if (nombre === 'pegarbuscar') {
        puente.pegar();
        /* El campo suele escuchar 'input' (buscador en vivo): se le avisa tras pegar. */
        setTimeout(function () {
          try { campo.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { /* nada */ }
        }, 0);
      }
    } catch (e) { /* el menú nunca rompe la página */ }
  }

  /** Pinta las entradas y la coloca junto al puntero, sin salirse de la ventana. */
  function pintar(entradas, x, y) {
    var caja = construirMenu();
    caja.innerHTML = '';
    botones = [];

    entradas.forEach(function (entrada) {
      if (entrada.separador) {
        var linea = document.createElement('div');
        linea.className = 'kf-menu-separador';
        caja.appendChild(linea);
        return;
      }
      var boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'kf-menu-item';
      boton.setAttribute('role', 'menuitem');
      boton.disabled = !entrada.activo;
      var etiqueta = document.createElement('span');
      etiqueta.className = 'kf-menu-etiqueta';
      etiqueta.textContent = entrada.etiqueta;
      boton.appendChild(etiqueta);
      if (entrada.atajo) {
        var atajo = document.createElement('span');
        atajo.className = 'kf-menu-atajo';
        atajo.textContent = entrada.atajo;
        boton.appendChild(atajo);
      }
      boton.addEventListener('click', function () { ejecutar(entrada.nombre); });
      boton.addEventListener('mouseenter', function () { enfocar(botones.indexOf(boton)); });
      caja.appendChild(boton);
      botones.push(boton);
    });

    caja.hidden = false;
    /* Se mide ya puesto para no salirse. */
    var ancho = caja.offsetWidth;
    var alto = caja.offsetHeight;
    var xFinal = Math.min(x, window.innerWidth - ancho - 8);
    var yFinal = Math.min(y, window.innerHeight - alto - 8);
    caja.style.left = Math.max(8, xFinal) + 'px';
    caja.style.top = Math.max(8, yFinal) + 'px';

    var primero = botones.findIndex(function (b) { return !b.disabled; });
    enfocar(primero >= 0 ? primero : 0);
  }

  /** Prepara las entradas según dónde se ha pulsado. Devuelve [] si no toca menú. */
  function entradasPara(el) {
    var lista = [];
    if (el && esCampoEditable(el)) {
      var haySel = haySeleccionEnCampo(el);
      lista.push({ nombre: 'cortar', etiqueta: t('ctx_cut', 'Cortar'), atajo: 'Ctrl+X', activo: haySel });
      lista.push({ nombre: 'copiar', etiqueta: t('ctx_copy', 'Copiar'), atajo: 'Ctrl+C', activo: haySel });
      lista.push({ nombre: 'pegar', etiqueta: t('ctx_paste', 'Pegar'), atajo: 'Ctrl+V', activo: true });
      lista.push({ separador: true });
      lista.push({ nombre: 'seleccionar', etiqueta: t('ctx_select_all', 'Seleccionar todo'), atajo: 'Ctrl+A', activo: true });
      /* En un buscador, pegar y buscar de una vez. */
      if (el.id && /search/i.test(el.id)) {
        lista.push({ nombre: 'pegarbuscar', etiqueta: t('ctx_paste_search', 'Pegar y buscar'), atajo: '', activo: true });
      }
      return lista;
    }
    /* Páginas de solo lectura (ficha del addon): solo copiar lo que hay seleccionado. */
    if (haySeleccionEnPagina()) {
      lista.push({ nombre: 'copiar', etiqueta: t('ctx_copy', 'Copiar'), atajo: 'Ctrl+C', activo: true });
      lista.push({ nombre: 'seleccionar', etiqueta: t('ctx_select_all', 'Seleccionar todo'), atajo: 'Ctrl+A', activo: true });
    }
    return lista;
  }

  function alPulsarDerecho(ev) {
    var el = ev.target;
    var entradas = entradasPara(el);
    if (!entradas.length) {
      /* Sin menú propio: se cierra el que hubiera y se deja el comportamiento normal. */
      cerrar();
      return;
    }
    ev.preventDefault();
    objetivo = esCampoEditable(el) ? el : null;

    /* «Pegar» solo si hay algo de texto en el portapapeles (el menú se pinta al saberlo). */
    var puente = api();
    var listo = puente && typeof puente.hayTexto === 'function'
      ? puente.hayTexto().then(function (hay) {
        entradas.forEach(function (e) { if (e.nombre === 'pegar') e.activo = !!hay; });
      }).catch(function () { /* se deja activo */ })
      : Promise.resolve();
    listo.then(function () { pintar(entradas, ev.clientX, ev.clientY); });
  }

  document.addEventListener('contextmenu', alPulsarDerecho);

  /* Cerrar en los casos normales de cualquier menú. */
  document.addEventListener('mousedown', function (ev) {
    if (menu && !menu.hidden && !menu.contains(ev.target)) cerrar();
  }, true);
  window.addEventListener('blur', cerrar);
  window.addEventListener('resize', cerrar);
  window.addEventListener('scroll', cerrar, true);

  /* Teclado dentro del menú. */
  document.addEventListener('keydown', function (ev) {
    if (!menu || menu.hidden) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cerrar(); return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); enfocar(indice + 1); return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); enfocar(indice - 1); return; }
    if (ev.key === 'Home') { ev.preventDefault(); enfocar(0); return; }
    if (ev.key === 'End') { ev.preventDefault(); enfocar(botones.length - 1); return; }
  }, true);

  /* Para las pruebas y para que otra parte de la app pueda cerrarlo. */
  window.KorforgeMenuContextual = {
    cerrar: cerrar,
    abierto: function () { return !!(menu && !menu.hidden); },
    entradasPara: entradasPara,
  };
})();
