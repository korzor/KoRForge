/**
 * public/orden-listas-ui.js — Subsistema de Ordenación para Favoritos e Instalados.
 *
 * Desacoplado de app.js (K-C1): Gestiona el desplegable de orden (#sortLista),
 * recuerda las opciones en localStorage por pestaña y aplica las funciones
 * de ordenación lexicográfica y versionada.
 */

'use strict';

window.KorforgeOrden = (() => {
  const OPCIONES_ORDEN = {
    favorites: ['added', 'name_az', 'downloads', 'updated'],
    addons: ['name_az', 'version', 'updates', 'state', 'problems'],
  };

  const CLAVE_ORDEN = {
    added: 'sort_added',
    name_az: 'sort_name_az',
    name_za: 'sort_name_za',
    author: 'sort_author',
    downloads: 'sort_downloads',
    updated: 'sort_updated',
    version: 'sort_version',
    updates: 'sort_updates',
    state: 'sort_state',
    problems: 'sort_problems',
  };

  const ordenLista = {
    favorites: (() => {
      try { return localStorage.getItem('korforge:orden:favorites') || 'added'; } catch (_) { return 'added'; }
    })(),
    addons: (() => {
      try { return localStorage.getItem('korforge:orden:addons') || 'name_az'; } catch (_) { return 'name_az'; }
    })(),
  };

  function pestanaConOrden() {
    return document.body.dataset.tab === 'addons' ? 'addons' : 'favorites';
  }

  function getLocale() {
    if (typeof window.LOCALE === 'function') return window.LOCALE();
    if (window.I18N && typeof window.I18N.getLocale === 'function') return window.I18N.getLocale();
    return 'es';
  }

  function getT(k, vars) {
    if (typeof window.T === 'function') return window.T(k, vars);
    if (window.I18N && typeof window.I18N.t === 'function') return window.I18N.t(k, vars);
    return k;
  }

  function comparar(a, b) {
    return String(a || '').localeCompare(String(b || ''), getLocale(), { sensitivity: 'base', numeric: true });
  }

  function rellenarOpcionesOrden() {
    const sortLista = document.getElementById('sortLista');
    if (!sortLista) return;
    const p = pestanaConOrden();
    if (!OPCIONES_ORDEN[p].includes(ordenLista[p])) ordenLista[p] = OPCIONES_ORDEN[p][0];
    sortLista.innerHTML = '';
    OPCIONES_ORDEN[p].forEach((valor) => {
      const op = document.createElement('option');
      op.value = valor;
      op.textContent = getT(CLAVE_ORDEN[valor] || valor);
      sortLista.appendChild(op);
    });
    sortLista.value = ordenLista[p];
  }

  function ordenarFavoritos(lista) {
    const copia = (lista || []).slice();
    switch (ordenLista.favorites) {
      case 'name_az': return copia.sort((a, b) => comparar(a.name, b.name));
      case 'name_za': return copia.sort((a, b) => comparar(b.name, a.name));
      case 'author': return copia.sort((a, b) => comparar(a.author, b.author) || comparar(a.name, b.name));
      case 'downloads': return copia.sort((a, b) => (Number(b.downloadCount) || 0) - (Number(a.downloadCount) || 0) || comparar(a.name, b.name));
      case 'updated': return copia.sort((a, b) => String(b.dateModified || '').localeCompare(String(a.dateModified || '')) || comparar(a.name, b.name));
      case 'added':
      default:
        return copia
          .map((f, i) => ({ f, i }))
          .sort((x, y) => {
            const fx = Number(x.f.agregadoEn) || 0;
            const fy = Number(y.f.agregadoEn) || 0;
            if (fx !== fy) return fy - fx;
            return y.i - x.i;
          })
          .map((o) => o.f);
    }
  }

  function addonConActualizacion(addon) {
    const updates = window.availableAddonUpdates || [];
    return updates.some((u) => (addon.modId && u.modId === addon.modId) || u.folderName === addon.folderName);
  }

  function addonConProblemas(addon) {
    const estado = addon.compatibility && addon.compatibility.status;
    return !!addon.hasMissingDeps || (Array.isArray(addon.missingDependencies) && addon.missingDependencies.length > 0)
      || estado === 'warning' || estado === 'incompatible';
  }

  function compararVersiones(a, b) {
    const trozos = (v) => String(v || '').split(/[^0-9]+/).filter(Boolean).map(Number);
    const va = trozos(a);
    const vb = trozos(b);
    for (let i = 0; i < Math.max(va.length, vb.length); i += 1) {
      const d = (vb[i] || 0) - (va[i] || 0);
      if (d !== 0) return d;
    }
    return 0;
  }

  function ordenarInstalados(lista) {
    const copia = (lista || []).slice();
    switch (ordenLista.addons) {
      case 'name_za': return copia.sort((a, b) => comparar(b.title, a.title));
      case 'version': return copia.sort((a, b) => compararVersiones(a.version, b.version) || comparar(a.title, b.title));
      case 'updates': return copia.sort((a, b) => (addonConActualizacion(b) ? 1 : 0) - (addonConActualizacion(a) ? 1 : 0) || comparar(a.title, b.title));
      case 'state': return copia.sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0) || comparar(a.title, b.title));
      case 'problems': return copia.sort((a, b) => (addonConProblemas(b) ? 1 : 0) - (addonConProblemas(a) ? 1 : 0) || comparar(a.title, b.title));
      case 'name_az':
      default:
        return copia.sort((a, b) => comparar(a.title, b.title));
    }
  }

  function inicializar() {
    const sortLista = document.getElementById('sortLista');
    sortLista?.addEventListener('change', () => {
      const p = pestanaConOrden();
      ordenLista[p] = sortLista.value;
      try { localStorage.setItem('korforge:orden:' + p, sortLista.value); } catch (_) { /* nada */ }
      if (typeof window.aplicarOrdenDeLista === 'function') {
        window.aplicarOrdenDeLista();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', inicializar);

  return {
    rellenarOpciones: rellenarOpcionesOrden,
    ordenarFavoritos: ordenarFavoritos,
    ordenarInstalados: ordenarInstalados,
    pestanaConOrden: pestanaConOrden,
    get ordenActual() { return ordenLista; },
  };
})();
