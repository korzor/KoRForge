/**
 * KoRForge - visor de capturas de la ficha del addon (dueño, 24-10-2026).
 *
 * POR QUE EXISTE: antes, pinchar una captura la abría en el navegador interno, una sola imagen y sin
 * forma de pasar a la siguiente. El dueño quería ver TODAS: «con unas flechas a cada lado de la imagen
 * o con la rueda del ratón».
 *
 * CÓMO: capa a pantalla completa con la imagen grande y flechas a los lados. Se pasa de captura con:
 *   - las flechas de la pantalla (◀ ▶),
 *   - la rueda del ratón (una captura por «clic» de rueda, con un pequeño freno anti-doble-salto),
 *   - el teclado (flechas ← →, Inicio/Fin, Escape para cerrar),
 *   - o el botón de cerrar / clic fuera de la imagen.
 * Al cerrar se devuelve el foco a la miniatura desde la que se abrió.
 *
 * Las URL salen de la propia ficha (screenshots[]): se usa `url` (la grande) y, si falta, el
 * thumbnail. La CSP de la app permite imágenes https (img-src 'self' https: data: blob:).
 */
(function () {
  'use strict';

  var ID = 'korforge-visor-capturas';
  var FRENO_RUEDA_MS = 220;

  var caja = null;
  var botonPrev = null;
  var botonNext = null;
  var botonCerrar = null;
  var img = null;
  var contadorEl = null;
  var tituloEl = null;

  var lista = [];
  var indice = 0;
  var tituloFicha = '';
  var abierto = false;
  var focoPrevio = null;
  var ultimaRueda = 0;

  /* Texto traducido con respaldo: si I18N no está, el visor sigue funcionando en español. */
  function t(clave, respaldo, vars) {
    try {
      if (window.I18N && typeof window.I18N.t === 'function') {
        var texto = window.I18N.t(clave, vars || {});
        if (texto && texto !== clave) return texto;
      }
    } catch (e) { /* sin i18n */ }
    var salida = String(respaldo || clave);
    Object.keys(vars || {}).forEach(function (k) {
      salida = salida.split('{' + k + '}').join(String(vars[k]));
    });
    return salida;
  }

  function construir() {
    if (caja) return caja;

    caja = document.createElement('div');
    caja.id = ID;
    caja.className = 'kf-visor';
    caja.hidden = true;
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-modal', 'true');
    caja.setAttribute('aria-label', t('shot_viewer_label', 'Capturas del addon'));

    botonPrev = document.createElement('button');
    botonPrev.type = 'button';
    botonPrev.className = 'kf-visor-flecha kf-visor-prev';
    botonPrev.setAttribute('aria-label', t('shot_prev', 'Captura anterior'));
    botonPrev.title = t('shot_prev', 'Captura anterior');
    botonPrev.textContent = '‹';

    botonNext = document.createElement('button');
    botonNext.type = 'button';
    botonNext.className = 'kf-visor-flecha kf-visor-next';
    botonNext.setAttribute('aria-label', t('shot_next', 'Captura siguiente'));
    botonNext.title = t('shot_next', 'Captura siguiente');
    botonNext.textContent = '›';

    botonCerrar = document.createElement('button');
    botonCerrar.type = 'button';
    botonCerrar.className = 'kf-visor-cerrar';
    botonCerrar.setAttribute('aria-label', t('shot_close', 'Cerrar'));
    botonCerrar.title = t('shot_close', 'Cerrar');
    botonCerrar.textContent = '×';

    var figura = document.createElement('figure');
    figura.className = 'kf-visor-figura';
    img = document.createElement('img');
    img.className = 'kf-visor-imagen';
    img.decoding = 'async';
    figura.appendChild(img);

    var pie = document.createElement('div');
    pie.className = 'kf-visor-pie';
    tituloEl = document.createElement('div');
    tituloEl.className = 'kf-visor-titulo';
    contadorEl = document.createElement('div');
    contadorEl.className = 'kf-visor-contador';
    var pista = document.createElement('div');
    pista.className = 'kf-visor-pista';
    pista.textContent = t('shot_hint', 'Flechas del teclado o rueda del ratón');
    pie.appendChild(tituloEl);
    pie.appendChild(contadorEl);
    pie.appendChild(pista);

    caja.appendChild(botonPrev);
    caja.appendChild(figura);
    caja.appendChild(botonNext);
    caja.appendChild(botonCerrar);
    caja.appendChild(pie);

    botonPrev.addEventListener('click', function () { anterior(); });
    botonNext.addEventListener('click', function () { siguiente(); });
    botonCerrar.addEventListener('click', cerrar);

    /* Clic en el fondo (no en la imagen ni en los botones) cierra. */
    caja.addEventListener('mousedown', function (ev) {
      if (ev.target === caja) cerrar();
    });

    /* Rueda del ratón: una captura por gesto. Se frena para que una rueda «suelta» no se coma diez
       imágenes de golpe. */
    caja.addEventListener('wheel', function (ev) {
      if (!abierto) return;
      ev.preventDefault();
      var ahora = Date.now();
      if (ahora - ultimaRueda < FRENO_RUEDA_MS) return;
      if (Math.abs(ev.deltaY) < 2) return;
      ultimaRueda = ahora;
      if (ev.deltaY > 0) siguiente();
      else anterior();
    }, { passive: false });

    document.body.appendChild(caja);
    return caja;
  }

  /** Pinta la captura actual y precarga la anterior y la siguiente (para que no parpadee). */
  function pintar() {
    var actual = lista[indice] || {};
    var grande = actual.url || actual.thumbnailUrl || '';
    var titulo = actual.title || '';
    var total = lista.length;

    img.src = grande;
    img.alt = titulo || tituloFicha || t('shot_viewer_label', 'Capturas del addon');
    tituloEl.textContent = titulo || tituloFicha || '';
    contadorEl.textContent = total > 1
      ? t('shot_counter', '{i} de {n}', { i: indice + 1, n: total })
      : '';

    var hayVarias = total > 1;
    botonPrev.hidden = !hayVarias;
    botonNext.hidden = !hayVarias;

    if (hayVarias) {
      [lista[(indice + 1) % total], lista[(indice - 1 + total) % total]].forEach(function (s) {
        var url = s && (s.url || s.thumbnailUrl);
        if (url) { var pre = new Image(); pre.src = url; }
      });
    }
  }

  function ir(nuevoIndice) {
    if (!lista.length) return;
    indice = ((nuevoIndice % lista.length) + lista.length) % lista.length;
    pintar();
  }

  function siguiente() { ir(indice + 1); }
  function anterior() { ir(indice - 1); }

  function alTeclear(ev) {
    if (!abierto) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cerrar(); return; }
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' || ev.key === 'PageDown') { ev.preventDefault(); siguiente(); return; }
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' || ev.key === 'PageUp') { ev.preventDefault(); anterior(); return; }
    if (ev.key === 'Home') { ev.preventDefault(); ir(0); return; }
    if (ev.key === 'End') { ev.preventDefault(); ir(lista.length - 1); return; }
  }

  /**
   * Abre el visor.
   * @param {Array} capturas  [{ url, thumbnailUrl, title }]
   * @param {number} desde    índice de la captura pulsada
   * @param {string} titulo   nombre del addon (para el pie cuando la captura no trae título)
   * @param {Element} origen  miniatura pulsada (para devolverle el foco al cerrar)
   */
  function abrir(capturas, desde, titulo, origen) {
    if (!Array.isArray(capturas) || !capturas.length) return false;
    construir();
    lista = capturas.filter(function (s) { return s && (s.url || s.thumbnailUrl); });
    if (!lista.length) return false;
    indice = Math.min(Math.max(Number(desde) || 0, 0), lista.length - 1);
    tituloFicha = String(titulo || '');
    focoPrevio = origen || document.activeElement || null;

    abierto = true;
    caja.hidden = false;
    document.documentElement.classList.add('kf-visor-abierto');
    document.addEventListener('keydown', alTeclear, true);
    pintar();
    try { botonCerrar.focus({ preventScroll: true }); } catch (e) { /* nada */ }
    return true;
  }

  function cerrar() {
    if (!abierto) return;
    abierto = false;
    if (caja) caja.hidden = true;
    if (img) img.removeAttribute('src');
    document.documentElement.classList.remove('kf-visor-abierto');
    document.removeEventListener('keydown', alTeclear, true);
    var devolver = focoPrevio;
    focoPrevio = null;
    if (devolver && typeof devolver.focus === 'function') {
      try { devolver.focus({ preventScroll: true }); } catch (e) { /* nada */ }
    }
  }

  /* Para las pruebas y para que la app pueda cerrarlo si cambia de vista. */
  window.KorforgeVisorCapturas = {
    abrir: abrir,
    cerrar: cerrar,
    abierto: function () { return abierto; },
    indice: function () { return indice; },
    _caja: function () { return construir(); },
  };
})();
