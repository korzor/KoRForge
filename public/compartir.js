/**
 * KoRForge - botón de compartir un addon (dueño, 24-10-2026).
 *
 * POR QUÉ EXISTE: el dueño quiere compartir un addon SIN citar la página de CurseForge. Lo que se
 * comparte es el repositorio del autor (GitHub, GitLab...) o, si el addon no declara ninguno, una
 * búsqueda real en GitHub.
 *
 * DE DÓNDE SALE LA URL: del campo `links.sourceUrl` de la API oficial de CurseForge, que ya es lo
 * que la ficha pinta como «Repositorio». Si falta, se mira `issuesUrl` y `wikiUrl` (muchos autores
 * solo pegan ahí el GitHub). NO se rastrea la página de CurseForge: está detrás de Cloudflare y no
 * tendría más datos que esos campos. Si no hay nada, no se inventa una URL.
 *
 * CÓMO COMPARTE: un menú pequeño (Copiar / Abrir / Buscar). El portapapeles no lo puede tocar la
 * página, así que se lo pide a Electron por el puente (preload.js -> main.js).
 */
(function () {
  'use strict';

  var ID_MENU = 'korforge-menu-compartir';
  var menu = null;
  var botonAbierto = null;
  var botones = [];
  var indice = 0;
  var acciones = null; // lo que hay que hacer al elegir (texto, url) del addon abierto

  /* Hosts donde vive código: se acepta el enlace solo si es de uno de estos. */
  var URL_REPO = /^(https?:\/\/(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org|codeberg\.org|git\.sr\.ht)\/[^\/\s?#]+\/[^\/\s?#]+)/i;

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

  function limpiar(valor) {
    return valor == null ? '' : String(valor).trim();
  }

  function urlSegura(valor) {
    var s = limpiar(valor);
    return /^https?:\/\//i.test(s) ? s : '';
  }

  function nombreDe(mod) {
    return limpiar(mod && (mod.name || mod.title || mod.actualName));
  }

  function autorDe(mod) {
    var autor = limpiar(mod && mod.author);
    /* La API devuelve «Desconocido» cuando no hay autor: eso no se comparte. */
    return autor && !/^desconocid/i.test(autor) ? autor : '';
  }

  function versionDe(mod) {
    var v = limpiar(mod && (mod.version || mod.myVersion));
    if (!v) return '';
    return /^\d/.test(v) ? 'v' + v : v;
  }

  /**
   * Repositorio del addon. Vacío si no declara ninguno: aquí no se adivina nada.
   * (Los datos del catálogo ya traen `sourceUrl`; los de un addon instalado se piden aparte.)
   */
  function repoDe(mod) {
    if (!mod) return '';
    var directo = urlSegura(mod.sourceUrl);
    if (directo) return directo;
    var candidatos = [mod.issuesUrl, mod.wikiUrl];
    for (var i = 0; i < candidatos.length; i += 1) {
      var encontrado = urlSegura(candidatos[i]).match(URL_REPO);
      if (encontrado) return encontrado[1];
    }
    return '';
  }

  /** Lo que se copia cuando hay repositorio: «Nombre vX.Y · https://github.com/autor/repo». */
  function textoConEnlace(mod) {
    var repo = repoDe(mod);
    if (!repo) return '';
    var partes = [nombreDe(mod), versionDe(mod)].filter(function (p) { return !!p; });
    return (partes.join(' ') + ' · ' + repo).trim();
  }

  /** Lo que se copia cuando NO hay repositorio: «Nombre vX.Y · Autor». Nunca una URL inventada. */
  function textoSinEnlace(mod) {
    var nombre = nombreDe(mod);
    var version = versionDe(mod);
    var autor = autorDe(mod);
    var cabecera = (nombre + (version ? ' ' + version : '')).trim();
    return (cabecera + (autor ? ' · ' + autor : '')).trim();
  }

  /** Búsqueda real de repositorios en GitHub (el que busca elige; la app no adivina el repo). */
  function urlBusquedaGithub(mod) {
    var nombre = nombreDe(mod).replace(/[!¡?¿]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!nombre) return 'https://github.com/search?type=repositories';
    var consulta = encodeURIComponent('"' + nombre + '" wow addon');
    return 'https://github.com/search?q=' + consulta + '&type=repositories';
  }

  /** Copia texto al portapapeles por el puente de Electron (o por el navegador, si no hay app). */
  function copiarTexto(texto) {
    var puente = window.electronAPI && window.electronAPI.portapapeles;
    if (puente && typeof puente.copiarTexto === 'function') {
      try {
        return Promise.resolve(puente.copiarTexto(texto))
          .then(function (ok) { return ok === true; })
          .catch(function () { return false; });
      } catch (e) { /* se prueba por el navegador */ }
    }
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(texto)
          .then(function () { return true; })
          .catch(function () { return false; });
      }
    } catch (e) { /* nada */ }
    return Promise.resolve(false);
  }

  function construirMenu() {
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = ID_MENU;
    menu.className = 'kf-menu-contextual';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', t('share_menu_label', 'Compartir addon'));
    menu.hidden = true;
    document.body.appendChild(menu);
    return menu;
  }

  function cerrar() {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    menu.innerHTML = '';
    botones = [];
    indice = 0;
    acciones = null;
    var devolver = botonAbierto;
    botonAbierto = null;
    if (devolver && typeof devolver.focus === 'function') {
      try { devolver.focus({ preventScroll: true }); } catch (e) { /* nada */ }
    }
  }

  function enfocar(i) {
    if (!botones.length) return;
    indice = (i + botones.length) % botones.length;
    botones.forEach(function (b, n) { b.classList.toggle('kf-menu-foco', n === indice); });
    try { botones[indice].focus({ preventScroll: true }); } catch (e) { /* nada */ }
  }

  function avisarCon(fn, mensaje, esError) {
    try {
      if (typeof fn === 'function') fn(mensaje, esError ? 'error' : 'ok');
    } catch (e) { /* la app decide cómo avisar */ }
  }

  function abrirEnApp(plan, url, titulo) {
    var limpia = urlSegura(url);
    if (!limpia) return;
    try {
      if (plan && typeof plan.abrirEnApp === 'function') plan.abrirEnApp(limpia, titulo);
      else if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') window.electronAPI.openExternal(limpia);
      else window.open(limpia, '_blank');
    } catch (e) { /* nunca rompe la app */ }
  }

  function ejecutar(nombre) {
    /* El plan se guarda aparte porque cerrar() lo suelta, y copiar contesta más tarde. */
    var plan = acciones;
    cerrar();
    if (!plan) return;

    if (nombre === 'copiar-nombre-enlace' || nombre === 'copiar-enlace' || nombre === 'copiar-nombre') {
      var texto = nombre === 'copiar-enlace'
        ? (plan.repo || '')
        : (nombre === 'copiar-nombre' ? (plan.nombre || '') : (plan.conEnlace || ''));
      if (!texto) return;
      copiarTexto(texto).then(function (ok) {
        avisarCon(plan.avisar, ok ? t('share_toast_copied', 'Copiado al portapapeles') : t('share_toast_copy_error', 'No se pudo copiar'), !ok);
      });
      return;
    }

    if (nombre === 'abrir-repo' && plan.repo) abrirEnApp(plan, plan.repo, plan.titulo);
    if (nombre === 'buscar-github') abrirEnApp(plan, plan.busqueda, plan.titulo);
  }

  /** Entradas del menú según lo que sepa del addon (con repositorio o sin él). */
  function entradasPara(mod) {
    var repo = repoDe(mod);
    var lista = [];
    if (repo) {
      lista.push({ nombre: 'copiar-nombre-enlace', etiqueta: t('share_copy_name_link', 'Copiar nombre y enlace'), icono: '📋' });
      lista.push({ nombre: 'copiar-enlace', etiqueta: t('share_copy_repo', 'Copiar enlace del repositorio'), icono: '🔗' });
      lista.push({ separador: true });
      lista.push({ nombre: 'abrir-repo', etiqueta: t('share_open_repo', 'Abrir repositorio'), icono: '🌐' });
      return lista;
    }
    lista.push({ nombre: 'buscar-github', etiqueta: t('share_search_github', 'Buscar en GitHub'), icono: '🔎' });
    lista.push({ separador: true });
    lista.push({ nombre: 'copiar-nombre', etiqueta: t('share_copy_name', 'Copiar nombre y versión'), icono: '📋' });
    return lista;
  }

  /** Coloca la caja junto al punto pedido, sin salirse de la ventana. */
  function colocar(x, y) {
    var caja = construirMenu();
    var ancho = caja.offsetWidth;
    var alto = caja.offsetHeight;
    var xFinal = Math.min(x, window.innerWidth - ancho - 8);
    var yFinal = Math.min(y, window.innerHeight - alto - 8);
    caja.style.left = Math.max(8, xFinal) + 'px';
    caja.style.top = Math.max(8, yFinal) + 'px';
  }

  /**
   * Al hacer scroll (la lista de addons se mueve) el menú se pega otra vez a su botón en vez de
   * cerrarse: en una tarjeta, un scroll que provoca el propio clic no debe cerrar lo que acaba de
   * abrirse. Solo se cierra si el botón se va de la ventana.
   */
  function reposicionar() {
    if (!menu || menu.hidden) return;
    if (!botonAbierto || !document.body.contains(botonAbierto)) { cerrar(); return; }
    var rect = botonAbierto.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) { cerrar(); return; }
    colocar(rect.left, rect.bottom + 6);
  }

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
      boton.dataset.accion = entrada.nombre;
      var icono = document.createElement('span');
      icono.className = 'kf-menu-icono';
      icono.setAttribute('aria-hidden', 'true');
      icono.textContent = entrada.icono || '';
      var etiqueta = document.createElement('span');
      etiqueta.className = 'kf-menu-etiqueta';
      etiqueta.textContent = entrada.etiqueta;
      boton.appendChild(icono);
      boton.appendChild(etiqueta);
      boton.addEventListener('click', function () { ejecutar(entrada.nombre); });
      boton.addEventListener('mouseenter', function () { enfocar(botones.indexOf(boton)); });
      caja.appendChild(boton);
      botones.push(boton);
    });

    caja.hidden = false;
    /* Se mide ya puesto para no salirse de la ventana. */
    colocar(x, y);

    enfocar(0);
  }

  /**
   * Abre el menú de compartir pegado al botón que se ha pulsado.
   * opciones: { avisar(texto, tipo), abrirEnApp(url, titulo) }
   * Devuelve false si no hay nada que ofrecer (addon sin nombre).
   */
  function abrir(boton, mod, opciones) {
    if (!mod || !nombreDe(mod)) return false;
    cerrar();
    acciones = {
      repo: repoDe(mod),
      conEnlace: textoConEnlace(mod),
      nombre: textoSinEnlace(mod),
      busqueda: urlBusquedaGithub(mod),
      titulo: nombreDe(mod),
      avisar: (opciones && opciones.avisar) || null,
      abrirEnApp: (opciones && opciones.abrirEnApp) || null,
    };
    botonAbierto = boton || null;
    var entradas = entradasPara(mod);

    var caja = construirMenu();
    var rect = boton && typeof boton.getBoundingClientRect === 'function' ? boton.getBoundingClientRect() : null;
    var x = rect ? rect.left : 40;
    var y = rect ? rect.bottom + 6 : 40;
    pintar(entradas, x, y);
    return !caja.hidden;
  }

  /* Cerrar en los casos normales de cualquier menú. */
  document.addEventListener('mousedown', function (ev) {
    if (menu && !menu.hidden && !menu.contains(ev.target)) cerrar();
  }, true);
  window.addEventListener('blur', cerrar);
  window.addEventListener('resize', cerrar);
  window.addEventListener('scroll', reposicionar, true);

  /* Teclado dentro del menú: Escape, flechas, Home/End y Enter/Espacio (el botón ya los tiene). */
  document.addEventListener('keydown', function (ev) {
    if (!menu || menu.hidden) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cerrar(); return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); enfocar(indice + 1); return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); enfocar(indice - 1); return; }
    if (ev.key === 'Home') { ev.preventDefault(); enfocar(0); return; }
    if (ev.key === 'End') { ev.preventDefault(); enfocar(botones.length - 1); return; }
  }, true);

  /* Para las pruebas y para que la app pueda cerrarlo. */
  window.KorforgeCompartir = {
    abrir: abrir,
    cerrar: cerrar,
    abierto: function () { return !!(menu && !menu.hidden); },
    entradasPara: entradasPara,
    repoDe: repoDe,
    textoConEnlace: textoConEnlace,
    textoSinEnlace: textoSinEnlace,
    urlBusquedaGithub: urlBusquedaGithub,
    copiarTexto: copiarTexto,
    _menu: function () { return menu; },
  };
})();
