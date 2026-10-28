/**
 * public/noticias-ui.js — Subsistema de Noticias de Blizzard para KoRForge.
 *
 * Desacoplado de app.js (K-C1): se encarga de pedir las noticias de la versión
 * seleccionada al servidor (/api/noticias) y de pintarlas en el panel #pane-news.
 * Los textos externos se sanitizan siempre con textContent (nunca innerHTML)
 * y solo se aceptan URLs seguras http(s).
 */

'use strict';

window.KorforgeNoticias = (() => {
  let ultimasNoticias = [];
  let cargandoNoticias = false;

  function urlDeNoticia(valor) {
    const texto = String(valor || '').trim();
    return /^https?:\/\//i.test(texto) ? texto : '';
  }

  function etiquetaDeNoticia(tipo) {
    const claves = {
      patch: 'news_tag_patch',
      maintenance: 'news_tag_maintenance',
      stress: 'news_tag_stress',
      issues: 'news_tag_issues',
      announcement: 'news_tag_announcement',
    };
    return window.T ? window.T(claves[tipo] || 'news_tag_announcement') : tipo;
  }

  function abrirNoticia(noticia) {
    const url = noticia && urlDeNoticia(noticia.enlace);
    if (!url) return;
    if (typeof window.openInAppBrowser === 'function') {
      window.openInAppBrowser(url, noticia.titulo || '');
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function ponerEtiquetaNoticias(btnRefreshNews, clave) {
    if (!btnRefreshNews) return;
    const etiqueta = btnRefreshNews.querySelector('[data-i18n="news_refresh"]');
    if (etiqueta && window.T) {
      etiqueta.textContent = window.T(clave);
    }
  }

  async function cargarNoticias(forzar = false) {
    const newsList = document.getElementById('newsList');
    const newsSubtitle = document.getElementById('newsSubtitle');
    const btnRefreshNews = document.getElementById('btnRefreshNews');

    if (!newsList || cargandoNoticias) return;
    cargandoNoticias = true;

    const game = window.currentActiveGame || 'forever';
    const gameLabel = typeof window.gameLabel === 'function' ? window.gameLabel(game) : game;

    if (newsSubtitle && window.T) {
      newsSubtitle.textContent = window.T('news_subtitle', { game: gameLabel });
    }
    if (btnRefreshNews) {
      btnRefreshNews.disabled = true;
      ponerEtiquetaNoticias(btnRefreshNews, 'news_refreshing');
    }

    if (!ultimasNoticias.length) {
      newsList.innerHTML = '';
      const espera = document.createElement('div');
      espera.className = 'empty-state';
      const icono = document.createElement('span');
      icono.className = 'empty-icon';
      icono.textContent = '📰';
      const titulo = document.createElement('h3');
      titulo.className = 'empty-title';
      titulo.textContent = window.T ? window.T('news_loading') : 'Cargando...';
      espera.appendChild(icono);
      espera.appendChild(titulo);
      newsList.appendChild(espera);
    }

    try {
      const params = new URLSearchParams({ gameId: game, limite: '40' });
      if (forzar) params.set('forzar', '1');
      const res = await fetch(`/api/noticias?${params.toString()}`);
      const data = await res.json();
      if (!data || !data.success) throw new Error((data && data.code) || 'err_news');
      ultimasNoticias = Array.isArray(data.noticias) ? data.noticias : [];
      pintarNoticias();
    } catch (_) {
      newsList.innerHTML = '';
      const error = document.createElement('div');
      error.className = 'empty-state';
      const icono = document.createElement('span');
      icono.className = 'empty-icon';
      icono.textContent = '⚠️';
      const titulo = document.createElement('h3');
      titulo.className = 'empty-title';
      titulo.textContent = window.T ? window.T('news_error_title') : 'Error';
      const desc = document.createElement('p');
      desc.className = 'empty-desc';
      desc.textContent = window.T ? window.T('news_error_desc') : 'No se pudieron cargar las noticias.';
      error.appendChild(icono);
      error.appendChild(titulo);
      error.appendChild(desc);
      newsList.appendChild(error);
    } finally {
      cargandoNoticias = false;
      if (btnRefreshNews) {
        btnRefreshNews.disabled = false;
        ponerEtiquetaNoticias(btnRefreshNews, 'news_refresh');
      }
    }
  }

  function pintarNoticias() {
    const newsList = document.getElementById('newsList');
    const newsSubtitle = document.getElementById('newsSubtitle');
    if (!newsList) return;
    newsList.innerHTML = '';

    const game = window.currentActiveGame || 'forever';
    const gameLabel = typeof window.gameLabel === 'function' ? window.gameLabel(game) : game;

    if (!ultimasNoticias.length) {
      const vacio = document.createElement('div');
      vacio.className = 'empty-state';
      const icono = document.createElement('span');
      icono.className = 'empty-icon';
      icono.textContent = '📰';
      const titulo = document.createElement('h3');
      titulo.className = 'empty-title';
      titulo.textContent = window.T ? window.T('news_empty_title', { game: gameLabel }) : 'Sin noticias';
      const desc = document.createElement('p');
      desc.className = 'empty-desc';
      desc.textContent = window.T ? window.T('news_empty_desc') : '';
      vacio.appendChild(icono);
      vacio.appendChild(titulo);
      vacio.appendChild(desc);
      newsList.appendChild(vacio);
      if (newsSubtitle && window.T) {
        newsSubtitle.textContent = window.T('news_subtitle', { game: gameLabel });
      }
      return;
    }

    if (newsSubtitle && window.T) {
      newsSubtitle.textContent = window.T('news_subtitle_count', {
        game: gameLabel,
        count: ultimasNoticias.length,
      });
    }

    ultimasNoticias.forEach((noticia) => {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'news-card';
      tarjeta.tabIndex = 0;

      if (noticia.imagen && urlDeNoticia(noticia.imagen)) {
        const cajaImg = document.createElement('div');
        cajaImg.className = 'news-card-image';
        const img = document.createElement('img');
        img.src = noticia.imagen;
        img.alt = '';
        img.loading = 'lazy';
        cajaImg.appendChild(img);
        tarjeta.appendChild(cajaImg);
      }

      const cuerpo = document.createElement('div');
      cuerpo.className = 'news-card-body';

      const fila = document.createElement('div');
      fila.className = 'news-card-meta';

      const etiqueta = document.createElement('span');
      etiqueta.className = `news-tag news-tag-${noticia.tipo || 'announcement'}`;
      etiqueta.textContent = etiquetaDeNoticia(noticia.tipo);
      const fecha = document.createElement('span');
      fecha.className = 'news-date';
      const rel = typeof window.relDate === 'function' ? window.relDate(noticia.fecha) : '';
      const fmt = typeof window.fmtDate === 'function' ? window.fmtDate(noticia.fecha, { day: 'numeric', month: 'numeric', year: 'numeric' }) : noticia.fecha;
      fecha.textContent = rel || fmt || '';
      fila.appendChild(etiqueta);
      fila.appendChild(fecha);

      const titulo = document.createElement('h3');
      titulo.className = 'news-card-title';
      titulo.textContent = noticia.titulo || '';

      cuerpo.appendChild(fila);
      cuerpo.appendChild(titulo);

      if (noticia.resumen) {
        const resumen = document.createElement('p');
        resumen.className = 'news-card-summary';
        resumen.textContent = noticia.resumen;
        cuerpo.appendChild(resumen);
      }

      if (urlDeNoticia(noticia.enlace)) {
        const abrir = document.createElement('button');
        abrir.type = 'button';
        abrir.className = 'btn btn-secondary btn-sm news-open';
        abrir.textContent = window.T ? window.T('news_open') : 'Abrir';
        abrir.addEventListener('click', (ev) => {
          ev.stopPropagation();
          abrirNoticia(noticia);
        });
        cuerpo.appendChild(abrir);
      }

      tarjeta.appendChild(cuerpo);
      tarjeta.addEventListener('click', () => abrirNoticia(noticia));
      tarjeta.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          abrirNoticia(noticia);
        }
      });
      newsList.appendChild(tarjeta);
    });
  }

  function limpiar() {
    ultimasNoticias = [];
  }

  // Inicializar listeners del botón refrescar
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnRefreshNews');
    btn?.addEventListener('click', () => cargarNoticias(true));
  });

  return {
    cargar: cargarNoticias,
    pintar: pintarNoticias,
    limpiar: limpiar,
  };
})();
