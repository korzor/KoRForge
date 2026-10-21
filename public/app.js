// KoRForge Client Application Logic
document.addEventListener('DOMContentLoaded', () => {
  // --- Textos -----------------------------------------------------------
  // REGLA (docs/REGLAS-IDIOMAS.md): aquí no se escribe NI UN texto visible a mano.
  // Todo pasa por T('clave', {variables}) y vive en public/i18n.js, en los cinco idiomas.
  const T = (key, vars) => (window.I18N ? window.I18N.t(key, vars) : key);
  const LOCALE = () => (window.I18N ? window.I18N.getLocale() : 'en-US');
  const fmtDate = (value, options) => (window.I18N ? window.I18N.fmtDate(value, options) : '');
  const fmtDateTime = (value) => (window.I18N ? window.I18N.fmtDateTime(value) : '');
  const fmtNumber = (value) => (window.I18N ? window.I18N.fmtNumber(value) : String(value || 0));
  const relDate = (value) => (window.I18N ? window.I18N.relativeDate(value) : '');

  // Nombre legible del cliente activo (los nombres son marcas, no se traducen).
  const gameLabel = (gameId) => {
    const g = currentGamesData[gameId] || currentGamesData[currentActiveGame];
    return (g && g.name) || String(gameId || '');
  };

  /**
   * Texto de un error que viene del servidor.
   *
   * El servidor manda `code` (una clave de i18n) y, cuando hace falta, `params` con los datos para
   * el mensaje. El caso que lo motivó (dueño, 21-10-2026): «no hay ruta del juego» sin decir CUÁL,
   * con la ruta configurada en otro de los cuatro juegos. Ahora `err_game_path_missing` viene con
   * `params.juego` (el activo) y `params.otros` (los que sí tienen ruta), y se cuentan los dos.
   */
  function mensajeDeError(data) {
    if (!data) return '';
    if (!data.code) return data.error || '';
    const params = data.params || {};
    if (data.code === 'err_game_path_missing') {
      let msg = T('err_game_path_missing');
      if (params.juego) msg += ' ' + T('err_game_path_missing_juego', { juego: params.juego });
      if (params.otros) msg += ' ' + T('err_game_path_missing_otros', { otros: params.otros });
      return msg;
    }
    return T('err_' + data.code, params);
  }

  /**
   * Aviso de «este cliente no tiene carpeta».
   *
   * Sin carpeta de juego el servidor rechaza toda instalación (`err_game_path_missing`). El dueño
   * (21-10-2026) no quiere carteles grandes en la pantalla principal: sale un toast, una sola vez por
   * cliente y sesión, y sin proponer otro cliente (antes proponía «WoW Forever», que no venía a
   * cuento: era el primero de la lista, no el que tiene que ver).
   */
  let avisoRutaDada = '';

  function avisarFaltaDeCarpeta() {
    const activo = currentGamesData[currentActiveGame];
    if (!activo || activo.folderExists) {
      avisoRutaDada = '';
      return;
    }
    if (avisoRutaDada === currentActiveGame) return;
    avisoRutaDada = currentActiveGame;
    showToast(T('toast_no_path', { juego: activo.name || String(currentActiveGame || '') }), 'warning');
  }

  // Navigation & Shell
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const addonsGrid = document.getElementById('addonsGrid');
  const addonCountBadge = document.getElementById('addonCountBadge');
  const backupsList = document.getElementById('backupsList');
  const backupsCountBadge = document.getElementById('backupsCountBadge');
  const toastContainer = document.getElementById('toastContainer');
  const sidebarFavoritesCount = document.getElementById('sidebarFavoritesCount');

  // Toast Notification System
  function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'error' ? '⚠️' : type === 'success' ? '✓' : type === 'warning' ? '⚡' : 'ℹ️';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        try { toast.remove(); } catch (_) {}
      }, 300);
    }, 3500);
  }

  // Multi-Game Version Management Elements
  const activeGameSelect = document.getElementById('activeGameSelect');
  const widgetGameIcon = document.getElementById('widgetGameIcon');
  const detectedPathEl = document.getElementById('detectedPath');
  const rootWoWPath = document.getElementById('rootWoWPath');
  const btnAutoDetectGames = document.getElementById('btnAutoDetectGames');
  const gamesManagementList = document.getElementById('gamesManagementList');
  let currentGamesData = {};
  let currentActiveGame = 'forever';

  const GAME_FLAVOR_MAP = {
    forever: { id: '88568', name: 'WoW Forever' },
    retail: { id: '517', name: 'WoW Retail' },
    classic_era: { id: '67408', name: 'Classic Era' },
    classic: { id: '79434,77522,73713,81212', name: 'Classic Prog' }
  };

  function updateTopbarGamePills(gameId) {
    document.querySelectorAll('.game-version-pill').forEach(pill => {
      const id = pill.getAttribute('data-game-id');
      const match = id === gameId;
      pill.classList.toggle('active', match);

      /* Un cliente SIN carpeta configurada se apaga y no se puede elegir desde la barra: se queda a
         la vista (para saber que existe) pero no lleva a un sitio donde no se puede instalar nada.
         Dueño, 21-10-2026. El activo no se bloquea, solo se marca. */
      const juego = currentGamesData[id];
      const sinCarpeta = !!juego && !juego.folderExists;
      pill.classList.toggle('is-sin-carpeta', sinCarpeta);
      pill.disabled = sinCarpeta && !match;
      const claveTitulo = pill.getAttribute('data-i18n-title');
      if (sinCarpeta && !match) {
        pill.setAttribute('title', T('pill_no_path', { juego: juego.name || id }));
      } else if (claveTitulo) {
        pill.setAttribute('title', T(claveTitulo));
      }
    });
  }

  // Application Data State
  let favoriteMods = [];
  let installedAddons = [];
  let availableAddonUpdates = [];
  let lastBackups = [];

  // Folder & Addons Action Elements
  const btnOpenAddonsFolder = document.getElementById('btnOpenAddonsFolder');
  const btnScanAddons = document.getElementById('btnScanAddons');
  const btnRefreshAddons = document.getElementById('btnRefreshAddons');

  // Settings Elements
  const settingAutoStart = document.getElementById('settingAutoStart');
  const settingStartMinimized = document.getElementById('settingStartMinimized');
  const settingCloseToTray = document.getElementById('settingCloseToTray');

  // Backups Action Elements
  const btnCreateBackup = document.getElementById('btnCreateBackup');

  // CurseForge Catalog View
  const cfCatalogLayout = document.getElementById('cfCatalogLayout');
  const cfSearchInput = document.getElementById('cfSearchInput');
  const btnCfSearch = document.getElementById('btnCfSearch');
  const btnClearSearchText = document.getElementById('btnClearSearchText');
  const cfSortSelect = document.getElementById('cfSortSelect');
  const cfResultsGrid = document.getElementById('cfResultsGrid');
  const cfResultsInfo = document.getElementById('cfResultsInfo');
  const cfActiveFilterCount = document.getElementById('cfActiveFilterCount');
  const btnClearAllFilters = document.getElementById('btnClearAllFilters');
  const cfActiveFiltersBar = document.getElementById('cfActiveFiltersBar');
  const cfFavoritesFilter = document.getElementById('cfFavoritesFilter');

  // Addon Detail View Elements
  const cfDetailView = document.getElementById('cfDetailView');
  const btnBackToCatalog = document.getElementById('btnBackToCatalog');
  const btnBackToCatalogBottom = document.getElementById('btnBackToCatalogBottom');
  const btnResetFiltersToolbar = document.getElementById('btnResetFiltersToolbar');
  const btnTranslateToggle = document.getElementById('btnTranslateToggle');
  const detailHeroCard = document.getElementById('detailHeroCard');
  const btnDetailToggleFav = document.getElementById('btnDetailToggleFav');
  const btnDetailInstall = document.getElementById('btnDetailInstall');
  const detailTabsBtns = document.querySelectorAll('.detail-tab-btn');
  const detailTabContents = document.querySelectorAll('.detail-tab-content');
  const detailHtmlBody = document.getElementById('detailHtmlBody');
  const detailFilesList = document.getElementById('detailFilesList');
  const detailGalleryGrid = document.getElementById('detailGalleryGrid');

  // Translation State
  let currentDetailMod = null;
  let currentOriginalDesc = '';
  let currentTranslatedDesc = '';
  let currentOriginalSummary = '';
  let currentTranslatedSummary = '';
  let isTranslated = false;

  // URL Install Elements
  const installUrlInput = document.getElementById('installUrlInput');
  const btnInstallUrl = document.getElementById('btnInstallUrl');
  const installConsole = document.getElementById('installConsole');

  // Favorites Tab Elements
  const favoritesBadge = document.getElementById('favoritesBadge');
  const favoritesTabGrid = document.getElementById('favoritesTabGrid');
  const favSearchInput = document.getElementById('favSearchInput');
  const btnExploreFromFav = document.getElementById('btnExploreFromFav');

  // Topbar Browser-Style Navigation Elements
  const btnNavBack = document.getElementById('btnNavBack');
  const btnNavForward = document.getElementById('btnNavForward');
  const btnNavReload = document.getElementById('btnNavReload');
  const browserAddressBar = document.getElementById('browserAddressBar');
  const addressIcon = document.getElementById('addressIcon');
  const addressText = document.getElementById('addressText');

  // In-App Webview / External Links View Elements
  const inAppBrowserView = document.getElementById('inAppBrowserView');
  const btnBrowserBack = document.getElementById('btnBrowserBack');
  const browserCurrentUrl = document.getElementById('browserCurrentUrl');
  const btnBrowserReload = document.getElementById('btnBrowserReload');
  const btnBrowserOpenExternal = document.getElementById('btnBrowserOpenExternal');
  const browserFrameWrap = document.getElementById('browserFrameWrap');
  let currentBrowserFrame = null;
  let currentWebUrl = '';

  // Window Controls (Frameless Titlebar)
  const btnWinMinimize = document.getElementById('btnWinMinimize');
  const btnWinMaximize = document.getElementById('btnWinMaximize');
  const btnWinClose = document.getElementById('btnWinClose');

  if (window.electronAPI) {
    btnWinMinimize?.addEventListener('click', () => window.electronAPI.minimize());
    btnWinMaximize?.addEventListener('click', () => window.electronAPI.maximize());
    btnWinClose?.addEventListener('click', () => window.electronAPI.close());
    if (window.electronAPI.onMaximizedChange) {
      window.electronAPI.onMaximizedChange((isMax) => {
        document.body.classList.toggle('is-maximized', !!isMax);
      });
    }
    // Check initial maximized state on startup
    if (window.electronAPI.isMaximized) {
      window.electronAPI.isMaximized().then((isMax) => {
        document.body.classList.toggle('is-maximized', !!isMax);
      }).catch(() => {});
    }

    // Immediate sync on window resize / drag tear-off
    window.addEventListener('resize', () => {
      if (window.electronAPI && window.electronAPI.isMaximized) {
        window.electronAPI.isMaximized().then((isMax) => {
          document.body.classList.toggle('is-maximized', !!isMax);
        }).catch(() => {});
      }
    });

    // Double-click on Titlebar empty/non-interactive areas to maximize/restore
    document.addEventListener('dblclick', (e) => {
      const topbar = e.target.closest('.app-topbar');
      if (!topbar) return;
      if (e.target.closest('button, a, input, select, .win-btn, .game-version-pill, .nav-control-btn, .btn-app-update')) {
        return;
      }
      if (window.electronAPI && window.electronAPI.maximize) {
        window.electronAPI.maximize();
      }
    }, true);
  }

  // Botón de apoyo (Buy Me a Coffee), debajo de minimizar/maximizar/cerrar: abre la página en el navegador
  const btnBmc = document.getElementById('btnBmc');
  btnBmc?.addEventListener('click', (e) => {
    e.stopPropagation();
    const url = 'https://www.buymeacoffee.com/korzor';
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener');
    }
  });

  // Navigation History Management
  const navHistory = [];
  let historyIndex = -1;
  let isNavigatingHistory = false;

  function updateNavButtons() {
    if (btnNavBack) btnNavBack.disabled = historyIndex <= 0;
    if (btnNavForward) btnNavForward.disabled = historyIndex >= navHistory.length - 1;
  }

  function setAddressBar(icon, text) {
    if (addressIcon) addressIcon.textContent = icon;
    if (addressText) addressText.textContent = text;
  }

  function pushNavState(state) {
    if (isNavigatingHistory) return;
    if (historyIndex < navHistory.length - 1) {
      navHistory.splice(historyIndex + 1);
    }
    navHistory.push(state);
    historyIndex = navHistory.length - 1;
    updateNavButtons();
  }

  function applyNavState(state) {
    if (!state) return;
    if (state.type === 'tab') {
      if (inAppBrowserView) inAppBrowserView.style.display = 'none';
      if (cfDetailView) cfDetailView.style.display = 'none';
      switchTabInternal(state.tabId);
    } else if (state.type === 'detail') {
      if (inAppBrowserView) inAppBrowserView.style.display = 'none';
      openAddonDetailInternal(state.modId, state.modName);
    } else if (state.type === 'web') {
      openInAppBrowserInternal(state.url, state.title);
    }
    updateNavButtons();
  }

  btnNavBack?.addEventListener('click', () => {
    if (historyIndex > 0) {
      isNavigatingHistory = true;
      historyIndex--;
      applyNavState(navHistory[historyIndex]);
      isNavigatingHistory = false;
    }
  });

  btnNavForward?.addEventListener('click', () => {
    if (historyIndex < navHistory.length - 1) {
      isNavigatingHistory = true;
      historyIndex++;
      applyNavState(navHistory[historyIndex]);
      isNavigatingHistory = false;
    }
  });

  btnNavReload?.addEventListener('click', () => {
    if (historyIndex >= 0 && navHistory[historyIndex]) {
      const cur = navHistory[historyIndex];
      if (cur.type === 'tab') {
        if (cur.tabId === 'addons') loadInstalledAddons(true);
        else if (cur.tabId === 'search') triggerCurseForgeSearch();
        else if (cur.tabId === 'favorites') renderFavoritesTab(favSearchInput ? favSearchInput.value : '');
        else if (cur.tabId === 'backups') loadBackups();
        else if (cur.tabId === 'settings') loadConfig();
      } else if (cur.type === 'detail') {
        openAddonDetailInternal(cur.modId, cur.modName);
      } else if (cur.type === 'web') {
        if (currentBrowserFrame) {
          if (typeof currentBrowserFrame.reload === 'function') currentBrowserFrame.reload();
          else currentBrowserFrame.src = currentWebUrl;
        }
      }
    }
  });

  // Global browser keyboard shortcuts (Alt+Left, Alt+Right, F5)
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      btnNavBack?.click();
    } else if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      btnNavForward?.click();
    } else if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r')) {
      e.preventDefault();
      btnNavReload?.click();
    }
  });

  // Tab Navigation
  function switchTab(tabId) {
    if (inAppBrowserView) inAppBrowserView.style.display = 'none';
    if (cfDetailView) cfDetailView.style.display = 'none';
    pushNavState({ type: 'tab', tabId });
    switchTabInternal(tabId);
  }

  // Texto de la barra de dirección para cada pestaña
  function addressBarFor(tabId) {
    const labels = {
      search: { icon: '🔍', text: T('topbar_search') },
      addons: { icon: '📦', text: T('topbar_installed') },
      favorites: { icon: '⭐', text: T('topbar_favorites') },
      backups: { icon: '💾', text: T('topbar_backups') },
      settings: { icon: '⚙️', text: T('topbar_settings') }
    };
    return labels[tabId] || { icon: '🔍', text: T('topbar_explorer') };
  }

  function switchTabInternal(tabId) {
    navItems.forEach(i => i.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));

    const targetNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    const targetPane = document.getElementById(`pane-${tabId}`);
    if (targetNav) targetNav.classList.add('active');
    if (targetPane) targetPane.classList.add('active');

    const current = addressBarFor(tabId);
    setAddressBar(current.icon, current.text);

    if (tabId === 'addons') loadInstalledAddons();
    if (tabId === 'favorites') renderFavoritesTab(favSearchInput ? favSearchInput.value : '');
    if (tabId === 'search') {
      showCatalogView();
      if (cfResultsGrid.children.length === 0) triggerCurseForgeSearch();
    }
    if (tabId === 'backups') loadBackups();
    if (tabId === 'settings') loadConfig();
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      switchTab(item.getAttribute('data-tab'));
    });
  });

  // Topbar Brand Logo Click -> Switch to search/catalog
  const brandLogoBtn = document.getElementById('brandLogoBtn');
  brandLogoBtn?.addEventListener('click', () => {
    switchTab('search');
  });

  // Topbar Game Version Tabs Click Event
  document.querySelectorAll('.game-version-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const gameId = pill.getAttribute('data-game-id');
      if (gameId && gameId !== currentActiveGame) {
        switchActiveGame(gameId);
      }
    });
  });

  // 1. Multi-Game & Config Manager
  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();

      currentActiveGame = data.activeGame || 'forever';
      currentGamesData = data.games || {};
      updateTopbarGamePills(currentActiveGame);

      if (activeGameSelect) activeGameSelect.value = currentActiveGame;
      if (widgetGameIcon) widgetGameIcon.textContent = currentGamesData[currentActiveGame]?.icon || '⚔️';
      /* Sin la ruta de OTRO juego de por medio: si el cliente activo no tiene carpeta, se dice
         «No configurado» y ya (antes caía a `wowDir`, que es la ruta del juego activo ANTERIOR y
         hacía creer al dueño que estaba configurado, 21-10-2026). */
      if (detectedPathEl) detectedPathEl.textContent = currentGamesData[currentActiveGame]?.resolvedPath || currentGamesData[currentActiveGame]?.path || T('game_path_empty');
      if (rootWoWPath) rootWoWPath.value = data.rootWoWDir || '';

      if (settingAutoStart) settingAutoStart.checked = !!data.autoStart;
      if (settingStartMinimized) settingStartMinimized.checked = !!data.startMinimized;
      if (settingCloseToTray) settingCloseToTray.checked = data.closeToTray === true;

      const appLang = data.language || 'en';
      if (window.I18N) {
        window.I18N.initLanguage(appLang);
      }
      // La bandeja del sistema usa el mismo idioma que la app
      if (window.electronAPI && typeof window.electronAPI.setLanguage === 'function' && window.I18N) {
        try { window.electronAPI.setLanguage(window.I18N.getLanguage()); } catch (_) {}
      }
      const settingAppLanguage = document.getElementById('settingAppLanguage');
      if (settingAppLanguage) {
        settingAppLanguage.value = window.I18N ? window.I18N.getLanguage() : appLang;
      }

      renderGamesManagement(currentGamesData, currentActiveGame);
      avisarFaltaDeCarpeta();
    } catch (err) {
      console.error('Error cargando configuración:', err);
    }
  }

  function renderGamesManagement(games, activeGame) {
    if (!gamesManagementList) return;
    gamesManagementList.innerHTML = '';

    for (const [key, g] of Object.entries(games)) {
      const isActive = key === activeGame;
      const item = document.createElement('div');
      item.className = `game-manage-item ${isActive ? 'is-active' : ''}`;
      item.dataset.gameId = g.id;

      const subKey = 'game_sub_' + key;
      const gameSubtitle = (window.I18N && window.I18N.hasKey(subKey)) ? T(subKey) : (g.subtitle || '');
      const statusTxt = g.addonsExists
        ? T('game_status_connected', { path: g.resolvedPath || g.path })
        : (g.folderExists ? T('game_status_detected', { path: g.resolvedPath || g.path }) : T('game_status_missing'));

      item.innerHTML = `
        <div class="game-manage-top">
          <div class="game-manage-badge">
            <span class="game-manage-icon">${g.icon}</span>
            <div>
              <h4 class="game-manage-title">${g.name}</h4>
              <span class="game-manage-sub">${gameSubtitle} • ${T('game_typical_folder', { folder: g.subfolder })}</span>
            </div>
          </div>
          <div class="game-manage-actions-top">
            ${isActive ? `<span class="active-pill-tag">${T('game_active_tag')}</span>` : `<button class="btn btn-secondary btn-sm btn-activate-game" data-game-id="${g.id}">${T('game_use_active')}</button>`}
          </div>
        </div>
        <div class="game-manage-input-row">
          <input type="text" class="game-path-input" data-game-id="${g.id}" value="${g.path || g.resolvedPath || ''}" placeholder="${T('game_path_placeholder', { folder: g.subfolder })}">
          <button class="btn btn-primary btn-sm btn-save-game-path" data-game-id="${g.id}">${T('game_save')}</button>
          <button class="btn btn-secondary btn-sm btn-open-game-folder" data-game-id="${g.id}">${T('game_open')}</button>
        </div>
        <div class="game-manage-status">
          <span class="pulse-dot ${g.addonsExists ? '' : 'error'}"></span>
          <span class="status-txt ${g.addonsExists ? 'connected' : (g.folderExists ? 'warning' : '')}">
            ${statusTxt}
          </span>
        </div>
      `;

      // Save button
      item.querySelector('.btn-save-game-path')?.addEventListener('click', async () => {
        const inputEl = item.querySelector('.game-path-input');
        const newPath = inputEl ? inputEl.value.trim() : '';
        await saveGamePath(g.id, newPath);
      });

      // Open button
      item.querySelector('.btn-open-game-folder')?.addEventListener('click', async () => {
        await fetch('/api/addons/open-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: g.id })
        });
        showToast(T('toast_folder_opening', { name: g.name }));
      });

      // Activate button
      item.querySelector('.btn-activate-game')?.addEventListener('click', async () => {
        await switchActiveGame(g.id);
      });

      gamesManagementList.appendChild(item);
    }
  }

  async function switchActiveGame(gameId) {
    if (!gameId) return;
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeGame: gameId })
      });
      const data = await res.json();
      if (data.success) {
        currentActiveGame = data.activeGame;
        currentGamesData = data.games || {};
        const activeGameObj = currentGamesData[currentActiveGame];

        // Update topbar pills
        updateTopbarGamePills(currentActiveGame);

        // Update sidebar widget
        if (activeGameSelect) activeGameSelect.value = currentActiveGame;
        if (widgetGameIcon) widgetGameIcon.textContent = activeGameObj?.icon || '⚔️';
        if (detectedPathEl) detectedPathEl.textContent = activeGameObj?.resolvedPath || activeGameObj?.path || T('game_path_empty');
        avisarFaltaDeCarpeta();

        // Re-render settings list
        renderGamesManagement(currentGamesData, currentActiveGame);

        // Reload installed addons for this new game client
        await loadInstalledAddons(false);

        // Reload favorites for this new game client
        await loadFavorites(currentActiveGame);
        renderFavoritesTab(favSearchInput ? favSearchInput.value : '');

        // Reload backups for this new game client
        await loadBackups(currentActiveGame);

        // Update page subtitles
        const addonsSub = document.getElementById('addonsSubtitle');
        if (addonsSub) {
          addonsSub.textContent = T('addons_subtitle', { game: gameLabel(currentActiveGame) });
        }
        const backupsSub = document.querySelector('#pane-backups .page-subtitle');
        if (backupsSub) {
          backupsSub.textContent = T('vault_subtitle_game', { game: gameLabel(currentActiveGame) });
        }

        // Re-run search with new game version
        triggerCurseForgeSearch();

        showToast(T('toast_game_switched', { name: gameLabel(currentActiveGame) }));
      }
    } catch (err) {
      showToast(T('toast_game_switch_error', { message: err.message }), 'error');
    }
  }

  async function saveGamePath(gameId, newPath) {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          games: {
            [gameId]: { path: newPath }
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        currentGamesData = data.games || {};
        renderGamesManagement(currentGamesData, currentActiveGame);
        if (gameId === currentActiveGame) {
          if (detectedPathEl) detectedPathEl.textContent = newPath || T('game_path_empty');
          await loadInstalledAddons(true);
        }
        avisarFaltaDeCarpeta();
        showToast(T('toast_path_saved'));
      }
    } catch (err) {
      showToast(T('toast_path_error', { message: err.message }), 'error');
    }
  }

  // Auto-Detect Game Versions Handler
  btnAutoDetectGames?.addEventListener('click', async () => {
    const rootDir = rootWoWPath ? rootWoWPath.value.trim() : '';
    if (!rootDir) {
      showToast(T('toast_enter_root'), 'error');
      return;
    }
    btnAutoDetectGames.disabled = true;
    btnAutoDetectGames.textContent = T('settings_autodetect_detecting');

    try {
      const res = await fetch('/api/config/auto-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootDir })
      });
      const data = await res.json();
      if (data.success) {
        currentGamesData = data.games || {};
        currentActiveGame = data.activeGame || currentActiveGame;
        renderGamesManagement(currentGamesData, currentActiveGame);

        const count = data.detectedCount || 0;
        if (count > 0) {
          const names = Object.keys(data.detected || {}).map(k => currentGamesData[k]?.name || k).join(', ');
          showToast(T('toast_autodetect_ok', { count, names }));
        } else {
          showToast(T('toast_autodetect_none'), 'warning');
        }

        const activeGameObj = currentGamesData[currentActiveGame];
        if (detectedPathEl) detectedPathEl.textContent = activeGameObj?.resolvedPath || activeGameObj?.path || T('game_path_empty');
        await loadInstalledAddons();
      } else {
        throw new Error(data.code ? mensajeDeError(data) : (data.error || T('toast_autodetect_error')));
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnAutoDetectGames.disabled = false;
      btnAutoDetectGames.textContent = T('settings_autodetect_btn');
    }
  });

  activeGameSelect?.addEventListener('change', () => {
    switchActiveGame(activeGameSelect.value);
  });

  async function updateSetting(patch, label) {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      const data = await res.json();
      if (data.success) {
        showToast(T('toast_setting_saved', { label }));
      }
    } catch (err) {
      showToast(T('toast_setting_error', { message: err.message }), 'error');
    }
  }

  settingAutoStart?.addEventListener('change', () => {
    updateSetting({ autoStart: settingAutoStart.checked }, T('settings_autostart_title'));
  });
  settingStartMinimized?.addEventListener('change', () => {
    updateSetting({ startMinimized: settingStartMinimized.checked }, T('settings_minimized_title'));
  });
  settingCloseToTray?.addEventListener('change', () => {
    updateSetting({ closeToTray: settingCloseToTray.checked }, T('settings_closetotray_title'));
  });

  const settingAppLanguage = document.getElementById('settingAppLanguage');
  settingAppLanguage?.addEventListener('change', async () => {
    const lang = settingAppLanguage.value;
    if (window.I18N) {
      window.I18N.setLanguage(lang);
    }
    await updateSetting({ language: lang }, T('settings_lang_title'));
  });

  // Al cambiar de idioma se repinta TODO lo dinámico (listas, fichas, modales, barra de título).
  window.addEventListener('korforge:languageChanged', () => {
    refrescarTextosDinamicos();
  });

  async function loadFavorites(gameId) {
    try {
      const g = gameId || currentActiveGame || 'forever';
      const res = await fetch(`/api/favorites?gameId=${encodeURIComponent(g)}`);
      const data = await res.json();
      favoriteMods = data.favorites || [];
      if (sidebarFavoritesCount) sidebarFavoritesCount.textContent = favoriteMods.length;
      if (favoritesBadge) favoritesBadge.textContent = favoriteMods.length;
    } catch (err) {
      console.error('Error cargando favoritos:', err);
    }
  }

  async function toggleFavorite(mod) {
    try {
      const res = await fetch('/api/favorites/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mod, gameId: currentActiveGame })
      });
      const data = await res.json();
      favoriteMods = data.favorites || [];
      if (sidebarFavoritesCount) sidebarFavoritesCount.textContent = favoriteMods.length;
      if (favoritesBadge) favoritesBadge.textContent = favoriteMods.length;
      showToast(data.isFavorite
        ? T('toast_fav_added', { name: mod.name })
        : T('toast_fav_removed', { name: mod.name }));
      return data.isFavorite;
    } catch (err) {
      showToast(T('toast_fav_error'), 'error');
      return false;
    }
  }

  function isModFavorite(modId) {
    if (!Array.isArray(favoriteMods)) return false;
    return favoriteMods.some(f => f && f.id === modId);
  }

  /**
   * Identificador con el que se guarda en favoritos un addon instalado.
   * Si lo instaló la app, el registro ya sabe su modId de CurseForge. Si se instaló a mano (ZIP o
   * URL) no hay modId: se usa un número negativo estable sacado del nombre de la carpeta, para poder
   * marcarlo igual y no chocar con ningún modId real (los de CurseForge son positivos).
   */
  function idFavoritoDeAddon(addon) {
    if (!addon) return 0;
    if (addon.modId) return Number(addon.modId);
    const clave = String(addon.actualName || addon.folderName || '').toLowerCase();
    let h = 0;
    for (let i = 0; i < clave.length; i += 1) h = ((h * 31) + clave.charCodeAt(i)) % 1000000000;
    return -(h + 1);
  }

  /**
   * Los datos que guarda la lista de favoritos, sacados del addon instalado.
   *
   * El icono del addon instalado casi nunca sirve: el .toc trae el nombre de una textura del juego.
   * Si lo instaló la app sabemos su modId, así que al guardarlo se pide el icono bueno al catálogo
   * (una petición, solo al marcar). Sin esto, en Favoritos salía el icono de la app en vez del addon
   * (dueño, 21-10-2026: «hay algunos addons que se les cambia el icono… TipTac»).
   */
  async function modFavoritoDeAddon(addon) {
    let icono = getInstalledAddonIcon(addon);
    const datos = {
      id: idFavoritoDeAddon(addon),
      name: addon.title || addon.actualName || addon.folderName,
      slug: addon.actualName || addon.folderName || '',
      summary: addon.notes || '',
      author: addon.author || '',
      iconUrl: '',
      categories: []
    };

    if (addon && addon.modId) {
      try {
        const res = await fetch(`/api/mod/${encodeURIComponent(addon.modId)}`);
        const respuesta = await res.json();
        /* La API contesta { mod: {...} }; se aceptan las dos formas por si cambia. */
        const detalles = respuesta && (respuesta.mod || respuesta);
        if (detalles) {
          if (/^https?:/i.test(String(detalles.iconUrl || ''))) icono = detalles.iconUrl;
          if (detalles.name) datos.name = detalles.name;
          if (detalles.slug) datos.slug = detalles.slug;
          if (detalles.summary) datos.summary = detalles.summary;
          if (detalles.author && detalles.author !== 'Desconocido') datos.author = detalles.author;
        }
      } catch (_) { /* sin datos del catálogo: se queda lo del .toc */ }
    }

    datos.iconUrl = /^https?:/i.test(String(icono || '')) ? icono : '';
    return datos;
  }

  function renderFavoritesTab(searchTerm = '') {
    if (!favoritesTabGrid) return;
    favoritesTabGrid.innerHTML = '';
    const term = searchTerm.toLowerCase().trim();

    const filtered = (favoriteMods || []).filter(f => {
      if (!term) return true;
      return (f.name && f.name.toLowerCase().includes(term)) ||
             (f.summary && f.summary.toLowerCase().includes(term)) ||
             (f.author && f.author.toLowerCase().includes(term));
    });

    if (filtered.length === 0) {
      favoritesTabGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <span class="empty-icon">⭐</span>
          <h3 class="empty-title">${favoriteMods.length === 0
            ? T('favorites_empty_title', { game: gameLabel(currentActiveGame) })
            : T('favorites_empty_filter_title')}</h3>
          <p class="empty-desc">
            ${favoriteMods.length === 0
              ? T('favorites_empty_desc')
              : T('favorites_empty_filter_desc')}
          </p>
          ${favoriteMods.length === 0 ? `<button class="btn btn-primary" id="btnGoExploreFromEmptyFav">${T('favorites_open_explorer_btn')}</button>` : ''}
        </div>
      `;
      document.getElementById('btnGoExploreFromEmptyFav')?.addEventListener('click', () => {
        switchTab('search');
      });
      return;
    }

    renderCatalogCards(filtered, favoritesTabGrid);
  }

  favSearchInput?.addEventListener('input', () => {
    renderFavoritesTab(favSearchInput.value);
  });

  btnExploreFromFav?.addEventListener('click', () => {
    switchTab('search');
  });


  btnOpenAddonsFolder?.addEventListener('click', async () => {
    try {
      await fetch('/api/addons/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: currentActiveGame })
      });
      showToast(T('toast_open_folder_win'));
    } catch (_) {
      showToast(T('toast_open_folder_error'), 'error');
    }
  });

  btnScanAddons?.addEventListener('click', () => loadInstalledAddons(true));
  btnRefreshAddons?.addEventListener('click', () => loadInstalledAddons(true));

  // 2. Mis Addons Loader
  let installedAddonsNoPath = false;

  async function loadInstalledAddons(notify = false) {
    try {
      const g = currentActiveGame || 'forever';
      const res = await fetch(`/api/addons?gameId=${encodeURIComponent(g)}`);
      const data = await res.json();
      installedAddons = data.addons || [];
      installedAddonsNoPath = !!data.noPath;
      if (addonCountBadge) addonCountBadge.textContent = installedAddons.length;

      const activeGameObj = currentGamesData[g];
      const addonsSub = document.getElementById('addonsSubtitle');
      if (addonsSub) {
        addonsSub.textContent = T('addons_subtitle', { game: gameLabel(g) });
      }

      renderInstalledAddons();
      if (notify) showToast(T('toast_scan_done', { count: installedAddons.length }));
    } catch (err) {
      console.error('Error escaneando addons:', err);
      showToast(T('toast_scan_error'), 'error');
    }
  }

  function getInstalledAddonIcon(addon) {
    if (favoriteMods && favoriteMods.length > 0) {
      const targetSlug = (addon.actualName || addon.folderName || '').toLowerCase().replace(/\.disabled$/, '');
      const targetTitle = (addon.title || '').toLowerCase();
      const favMatch = favoriteMods.find(f => {
        const fSlug = (f.slug || '').toLowerCase();
        const fName = (f.name || '').toLowerCase();
        return fSlug === targetSlug || fName === targetTitle || fName.includes(targetTitle) || targetTitle.includes(fName);
      });
      if (favMatch && favMatch.iconUrl) return favMatch.iconUrl;
    }
    return 'addon-default.svg';
  }

  function renderInstalledAddons(filter = 'all', searchTerm = '') {
    addonsGrid.innerHTML = '';
    const term = searchTerm.toLowerCase().trim();

    if (installedAddonsNoPath) {
      addonsGrid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📁</span>
          <h3 class="empty-title">${T('addons_no_path_title', { game: gameLabel(currentActiveGame) })}</h3>
          <p class="empty-desc">
            ${T('addons_no_path_desc')}
          </p>
          <button class="btn btn-primary" id="btnGoToSettingsFromAddons">${T('addons_open_settings')}</button>
        </div>
      `;
      document.getElementById('btnGoToSettingsFromAddons')?.addEventListener('click', () => {
        switchTab('settings');
      });
      return;
    }

    const filtered = installedAddons.filter(addon => {
      if (!addon) return false;
      const titleLower = String(addon.title || '').toLowerCase();
      const notesLower = String(addon.notes || '').toLowerCase();
      const actualLower = String(addon.actualName || addon.folderName || '').toLowerCase();
      const matchesSearch = !term || titleLower.includes(term) || notesLower.includes(term) || actualLower.includes(term);
      if (!matchesSearch) return false;

      if (filter === 'enabled') return !!addon.enabled;
      if (filter === 'disabled') return !addon.enabled;
      if (filter === 'alerts') return !!addon.hasMissingDeps || addon.compatibility?.status === 'warning' || addon.compatibility?.status === 'incompatible';
      return true;
    });

    if (filtered.length === 0) {
      addonsGrid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🛡️</span>
          <h3 class="empty-title">${installedAddons.length === 0
            ? T('addons_empty_title', { game: gameLabel(currentActiveGame) })
            : T('addons_empty_filter_title')}</h3>
          <p class="empty-desc">
            ${installedAddons.length === 0
              ? T('addons_empty_desc')
              : T('addons_empty_filter_desc')}
          </p>
          ${installedAddons.length === 0 ? `<button class="btn btn-primary" id="btnGoToSearch">${T('addons_explore_btn')}</button>` : ''}
        </div>
      `;

      document.getElementById('btnGoToSearch')?.addEventListener('click', () => {
        switchTab('search');
      });
      return;
    }

    filtered.forEach(addon => {
      const addonIcon = getInstalledAddonIcon(addon);
      const card = document.createElement('div');
      card.className = `cf-card installed-addon-card ${addon.enabled ? 'is-enabled' : 'is-disabled'}`;

      const compat = addon.compatibility;
      const compatHtml = compat
        ? `<span class="compat-badge ${compat.status}" title="${compatLabel(compat)}">${compatBadge(compat)}</span>`
        : '';
      const missingDepsHtml = (addon.missingDependencies && addon.missingDependencies.length > 0)
        ? `<div class="missing-deps-alert" title="${T('missing_deps_hint')}">${T('missing_deps_label', { deps: `<strong>${addon.missingDependencies.join(', ')}</strong>` })}</div>`
        : '';
      const esFavorito = isModFavorite(idFavoritoDeAddon(addon));
      const updateInfo = (availableAddonUpdates || []).find(u => (addon.modId && u.modId === addon.modId) || u.folderName === addon.folderName);
      const updatePillHtml = updateInfo ? `
        <span class="addon-card-update-pill" title="${T('card_update_hint', { version: updateInfo.newVersion })}">⚡ v${updateInfo.newVersion}</span>
        <button class="btn-card-update btn-addon-update-single" data-modid="${updateInfo.modId}" data-url="${updateInfo.downloadUrl}" data-name="${addon.title}" data-ver="${updateInfo.newVersion}" data-fileid="${updateInfo.newFileId || ''}" title="${T('card_update_now_hint')}">${T('card_btn_update')}</button>
      ` : '';

      const dispAddonVer = formatVersionDisplay(addon.version);
      const prefixV = (dispAddonVer && !dispAddonVer.toLowerCase().startsWith('v') && /^\d/.test(dispAddonVer)) ? 'v' : '';

      card.innerHTML = `
        <img class="cf-logo" src="${addonIcon}" alt="${addon.title}" onerror="this.src='addon-default.svg'">
        <div class="cf-card-content">
          <div class="cf-card-main">
            <div class="cf-card-top">
              <h4 class="cf-title" title="${addon.title}">${addon.title}</h4>
              <div class="addon-status-toggle">
                <label class="switch" title="${addon.enabled ? T('card_toggle_disable') : T('card_toggle_enable')}">
                  <input type="checkbox" ${addon.enabled ? 'checked' : ''} data-folder="${addon.folderName}">
                  <span class="slider"></span>
                </label>
              </div>
            </div>
            <div class="cf-card-sub">
              <div class="card-version-tag installed" title="${T('card_ver_installed_hint', { version: addon.version })}">
                <span class="ver-label">${T('card_ver_label')}</span> <span class="ver-val">${prefixV}${dispAddonVer}</span>
              </div>
              ${compatHtml}
              ${updatePillHtml}
            </div>
            <p class="cf-summary" title="${addon.notes || ''}">${addon.notes || T('addon_notes_fallback')}</p>
            ${missingDepsHtml}
          </div>
          <div class="cf-card-bottom">
            <div class="cf-card-meta-col">
              <div class="cf-card-stats">
                <span class="installed-folder-tag" title="${T('card_folder_hint')}">📁 <code>${addon.folderName}</code></span>
                ${addon.dependencies && addon.dependencies.length > 0 ? `<span class="installed-deps-tag" title="${T('card_deps_hint', { deps: addon.dependencies.join(', ') })}">🔗 ${addon.dependencies.join(', ')}</span>` : ''}
              </div>
            </div>
            <div class="installed-card-actions">
              ${updateInfo ? `<button class="btn-card-update-action btn-addon-update-single" data-modid="${updateInfo.modId}" data-url="${updateInfo.downloadUrl}" data-name="${addon.title}" data-ver="${updateInfo.newVersion}" data-fileid="${updateInfo.newFileId || ''}" title="${T('card_update_action_hint', { name: addon.title, version: updateInfo.newVersion })}">${T('card_btn_update')}</button>` : ''}
              <button class="installed-btn-action btn-addon-fav ${esFavorito ? 'is-fav' : ''}" data-folder="${addon.folderName}" title="${esFavorito ? T('card_fav_remove_hint') : T('detail_fav_add')}">
                <span class="fav-star">${esFavorito ? '★' : '☆'}</span>
              </button>
              <button class="installed-btn-action btn-addon-folder" data-folder="${addon.folderName}" title="${T('card_open_folder_hint', { folder: addon.folderName })}">
                <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="installed-btn-action btn-addon-trash" data-folder="${addon.folderName}" data-title="${addon.title}" title="${T('card_uninstall_hint')}">
                <svg viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;

      // 1. Card Click: Open Addon in Catalog / Search (ignoring switches and action buttons)
      card.addEventListener('click', (e) => {
        if (e.target.closest('.switch') || e.target.closest('.installed-btn-action') || e.target.closest('.btn-addon-update-single') || e.target.closest('.btn-card-update') || e.target.closest('.btn-card-update-action')) return;
        switchTab('search');
        if (cfSearchInput) {
          cfSearchInput.value = addon.actualName || addon.title;
        }
        triggerCurseForgeSearch();
      });

      // 2. Toggle Switch
      const toggle = card.querySelector('.switch input');
      toggle.addEventListener('change', async (e) => {
        e.stopPropagation();
        try {
          const res = await fetch('/api/addons/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderName: addon.folderName, gameId: currentActiveGame })
          });
          const resData = await res.json();
          if (resData.newName) {
            showToast(resData.enabled
              ? T('toast_addon_enabled', { name: addon.title })
              : T('toast_addon_disabled', { name: addon.title }));
            loadInstalledAddons();
          }
        } catch (err) {
          showToast(T('toast_toggle_error'), 'error');
        }
      });

      // 3. Open Specific Addon Folder in Windows Explorer
      const btnFolder = card.querySelector('.btn-addon-folder');
      btnFolder?.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await fetch('/api/addons/open-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: currentActiveGame, folderName: addon.folderName })
          });
          showToast(T('toast_addon_folder_open', { name: addon.title }));
        } catch (err) {
          showToast(T('toast_addon_folder_error'), 'error');
        }
      });

      // 4. Uninstall Button
      const btnUninstall = card.querySelector('.btn-addon-trash');
      btnUninstall?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(T('confirm_uninstall', { name: addon.title, folder: addon.folderName }))) return;
        try {
          const res = await fetch(`/api/addons/${encodeURIComponent(addon.folderName)}?gameId=${encodeURIComponent(currentActiveGame)}`, {
            method: 'DELETE'
          });
          const resData = await res.json();
          if (resData.deleted) {
            showToast(T('toast_uninstall_done', { name: addon.title }));
            loadInstalledAddons();
          }
        } catch (err) {
          showToast(T('toast_uninstall_error'), 'error');
        }
      });

      // 5. Favorite Button (dueño, 21-10-2026: poder marcar favorito desde Mis Addons)
      const btnFav = card.querySelector('.btn-addon-fav');
      btnFav?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await toggleFavorite(await modFavoritoDeAddon(addon));
        renderInstalledAddons(filter, searchTerm);
      });

      addonsGrid.appendChild(card);
    });
  }

  // Filter Pills in Mis Addons
  const filterPills = document.querySelectorAll('.filter-pills .pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderInstalledAddons(pill.getAttribute('data-filter'), document.getElementById('searchInput')?.value || '');
    });
  });

  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    const activePill = document.querySelector('.filter-pills .pill.active');
    const filter = activePill ? activePill.getAttribute('data-filter') : 'all';
    renderInstalledAddons(filter, e.target.value);
  });

  // 3. CurseForge Dynamic Filter & Search Engine
  // Accordion Header Collapsing (Flavor, Categories)
  document.querySelectorAll('.cf-accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const accordion = header.closest('.cf-accordion');
      accordion.classList.toggle('closed');
      const arrow = header.querySelector('.accordion-arrow');
      if (arrow) {
        arrow.textContent = accordion.classList.contains('closed') ? '▼' : '▲';
      }
    });
  });

  // Subcategory toggle (+ / -)
  document.querySelectorAll('.btn-toggle-sub').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetId = btn.getAttribute('data-target');
      const subList = document.getElementById(targetId);
      if (subList) {
        subList.classList.toggle('open');
        btn.textContent = subList.classList.contains('open') ? '−' : '+';
      }
    });
  });

  // Collect Active Filters
  function getActiveFilters() {
    const selectedCategories = Array.from(document.querySelectorAll('input[name="cf-cat"]:checked')).map(cb => ({
      id: cb.value,
      name: cb.closest('.cf-checkbox-item').querySelector('.cf-check-label').textContent.trim(),
      type: 'cat',
      el: cb
    }));

    const activeFlavor = GAME_FLAVOR_MAP[currentActiveGame] || GAME_FLAVOR_MAP.forever;

    return {
      activeFlavor,
      categories: selectedCategories,
      totalCount: selectedCategories.length
    };
  }

  // Update UI Filter Counter and Active Pills
  function updateFiltersUI() {
    const { categories, totalCount } = getActiveFilters();

    // Update Counter Badge & Clear All button
    if (totalCount > 0) {
      cfActiveFilterCount.style.display = 'inline-block';
      cfActiveFilterCount.textContent = totalCount;
      btnClearAllFilters?.classList.add('has-filters');
    } else {
      cfActiveFilterCount.style.display = 'none';
      cfActiveFilterCount.textContent = '0';
      btnClearAllFilters?.classList.remove('has-filters');
    }

    // Render Active Pills
    cfActiveFiltersBar.innerHTML = '';

    categories.forEach(f => {
      const pill = document.createElement('span');
      pill.className = 'active-filter-pill';
      pill.innerHTML = `<span>${f.name}</span><button data-id="${f.id}" title="${T('remove_filter_hint')}">✕</button>`;
      pill.querySelector('button').addEventListener('click', () => {
        f.el.checked = false;
        updateFiltersUI();
        triggerCurseForgeSearch();
      });
      cfActiveFiltersBar.appendChild(pill);
    });
  }

  // Unified Reset All Filters & Search
  function resetAllFilters() {
    document.querySelectorAll('.cf-filters-sidebar input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });
    cfSearchInput.value = '';
    btnClearSearchText.style.display = 'none';
    if (optRelevance) optRelevance.textContent = T('sort_featured');
    cfSortSelect.value = '2|desc';
    updateFiltersUI();
    triggerCurseForgeSearch();
    showToast(T('reset_filters_done'), 'success');
  }

  btnClearAllFilters?.addEventListener('click', resetAllFilters);
  btnResetFiltersToolbar?.addEventListener('click', resetAllFilters);

  // Checkbox Change Event Listener
  document.querySelectorAll('.cf-filters-sidebar input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      updateFiltersUI();
      triggerCurseForgeSearch();
    });
  });

  // Search Input Clear Button & Dynamic Label
  const optRelevance = document.getElementById('optRelevance');
  cfSearchInput?.addEventListener('input', () => {
    const hasText = cfSearchInput.value.trim().length > 0;
    btnClearSearchText.style.display = hasText ? 'block' : 'none';
    if (optRelevance) {
      optRelevance.textContent = hasText ? T('sort_best_match') : T('sort_featured');
    }
  });

  btnClearSearchText?.addEventListener('click', () => {
    cfSearchInput.value = '';
    btnClearSearchText.style.display = 'none';
    triggerCurseForgeSearch();
  });

  // Sort Select Listener
  cfSortSelect?.addEventListener('change', () => {
    triggerCurseForgeSearch();
  });

  // Submit Search
  btnCfSearch?.addEventListener('click', () => triggerCurseForgeSearch());
  cfSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') triggerCurseForgeSearch();
  });

  // Execute CurseForge API Query
  async function triggerCurseForgeSearch() {
    /* La barra de búsqueda ahora vive fuera del catálogo y también se ve dentro de la ficha de un
       addon: si buscas desde ahí, hay que volver a la parrilla para ver los resultados
       (dueño, 20-10-2026). */
    const vistaDetalle = document.getElementById('cfDetailView');
    const vistaCatalogo = document.getElementById('cfCatalogLayout');
    if (vistaDetalle && vistaCatalogo && vistaDetalle.style.display !== 'none') {
      vistaDetalle.style.display = 'none';
      vistaCatalogo.style.display = 'flex';
    }

    const { activeFlavor, categories } = getActiveFilters();
    const query = cfSearchInput.value.trim();

    // Parse Sort Field and Order: "2|desc", "4|asc", etc.
    const sortVal = cfSortSelect.value || '2|desc';
    const [sortField, sortOrder] = sortVal.split('|');

    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (activeFlavor && activeFlavor.id) params.set('gameVersionTypeId', activeFlavor.id);
    if (categories.length > 0) params.set('categoryId', categories.map(c => c.id).join(','));
    params.set('sortField', sortField);
    params.set('sortOrder', sortOrder || 'desc');
    params.set('pageSize', '36');

    // UI Feedback: Loading
    cfResultsGrid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⚡</span>
        <h3 class="empty-title">${T('catalog_loading_title')}</h3>
        <p class="empty-desc">${T('catalog_loading_desc')}</p>
      </div>
    `;

    const filterLabels = [];
    if (activeFlavor?.name) filterLabels.push(`${activeFlavor.name}`);
    if (categories.length > 0) filterLabels.push(T('results_category_label', { cats: categories.map(c => c.name).join(', ') }));

    let infoText = query ? T('results_for', { query }) : T('results_featured');
    if (filterLabels.length > 0) infoText += ` (${filterLabels.join(' • ')})`;
    cfResultsInfo.textContent = infoText;

    try {
      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();
      const results = data.results || [];

      if (results.length === 0) {
        lastCatalogResults = [];
        lastCatalogMode = 'catalog';
        cfResultsGrid.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">🔎</span>
            <h3 class="empty-title">${T('catalog_no_results_title')}</h3>
            <p class="empty-desc">${T('catalog_no_results_desc')}</p>
          </div>
        `;
        return;
      }

      lastCatalogResults = results;
      lastCatalogMode = 'catalog';
      renderCatalogCards(results);
    } catch (err) {
      console.error('Error al consultar addons:', err);
      cfResultsGrid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">⚠️</span>
          <h3 class="empty-title">${T('catalog_error_title')}</h3>
          <p class="empty-desc">${err.message}</p>
        </div>
      `;
    }
  }

  // Estado de la última consulta: permite repintar tarjetas al cambiar de idioma
  let lastCatalogResults = [];
  let lastCatalogMode = 'catalog';

  function renderFavoritesCatalog(query = '') {
    const term = query.toLowerCase().trim();
    const filtered = favoriteMods.filter(f => 
      !term || f.name.toLowerCase().includes(term) || f.summary.toLowerCase().includes(term)
    );

    lastCatalogResults = filtered;
    lastCatalogMode = 'favorites';
    cfResultsInfo.textContent = T('results_favorites', { count: filtered.length });

    if (filtered.length === 0) {
      cfResultsGrid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">⭐</span>
          <h3 class="empty-title">${T('favorites_empty_title', { game: gameLabel(currentActiveGame) })}</h3>
          <p class="empty-desc">${T('favorites_empty_desc')}</p>
        </div>
      `;
      return;
    }

    renderCatalogCards(filtered);
  }

  // Format relative date helper (idioma activo, vía I18N)
  function formatRelativeDate(isoStr) {
    return relDate(isoStr);
  }

  // Etiqueta e insignia de compatibilidad: el escáner manda un código y aquí se traduce.
  function compatKey(compat) {
    return 'compat_' + ((compat && compat.code) || 'generic_ok');
  }

  function compatBadge(compat) {
    if (!compat) return '';
    return T(compatKey(compat) + '_badge');
  }

  function compatLabel(compat) {
    if (!compat) return '';
    const value = (compat.interfaces && compat.interfaces.length) ? compat.interfaces.join(', ') : '';
    return T(compatKey(compat) + '_label', { value });
  }

  function formatVersionString(v) {
    if (!v) return '';
    let str = String(v).trim();
    str = str.replace(/\.(zip|rar)$/i, '').trim();
    return str;
  }

  function formatVersionDisplay(v) {
    if (!v) return '';
    let str = formatVersionString(v);
    if (str === 'Instalado' || str === 'N/A') return str;

    // If short (<= 7 chars), it already fits comfortably in parallel
    if (str.length <= 7) return str;

    // Clean common packaging tags at the end (e.g. -release, -titan)
    const cleanedTag = str.replace(/[-_](release|alpha|beta|titan|retail|classic|bcc|wotlk)$/i, '').trim();
    if (cleanedTag && cleanedTag.length <= 7) return cleanedTag;
    if (cleanedTag) str = cleanedTag;

    // Addon name prefix with '-' or '_' before version token
    const matchSep = str.match(/[-_]([vV]?\d[a-zA-Z0-9._-]*|[rR]\d+)$/);
    if (matchSep && matchSep[1]) {
      str = matchSep[1];
      if (str.length <= 7) return str;
    }

    // Addon name prefix followed by dot (e.g. Details.20261015.15339.172)
    const dotMatch = str.match(/^[a-zA-Z]{3,}\.(.+)$/);
    if (dotMatch && dotMatch[1]) {
      str = dotMatch[1];
      if (str.length <= 7) return str;
    }

    // Take the trailing 6 numbers/characters as requested by user
    const tail = str.slice(-6).replace(/^[._-]+/, '');
    return tail || str.slice(-6);
  }

  function findInstalledAddon(mod) {
    if (!mod) return null;
    const modNameLower = (mod.name || '').toLowerCase().trim();
    const slugLower = (mod.slug || '').toLowerCase().trim();
    return installedAddons.find(a => {
      const actualLower = (a.actualName || '').toLowerCase().trim();
      const titleLower = (a.title || '').toLowerCase().trim();
      const folderLower = (a.folderName || '').toLowerCase().trim();
      return actualLower === modNameLower || 
             titleLower === modNameLower || 
             (slugLower && (actualLower === slugLower || folderLower.includes(slugLower)));
    }) || null;
  }

  function renderCatalogCards(mods, targetContainer = cfResultsGrid) {
    targetContainer.innerHTML = '';
    mods.forEach(mod => {
      const installedMatch = findInstalledAddon(mod);
      const isInstalled = !!installedMatch;
      const isFav = isModFavorite(mod.id);
      const updatedText = formatRelativeDate(mod.dateModified);

      // Version pills row above stats: catalogue version first, and installed version beside it (only if installed)
      const availVer = formatVersionString(mod.version);
      const dispAvailVer = formatVersionDisplay(availVer);
      let versionsRowHtml = '';

      let availPill = '';
      if (availVer) {
        availPill = `
          <span class="cf-ver-pill cf-ver-avail" title="${T('ver_available_hint', { version: availVer })}">
            <span class="ver-lbl">${T('ver_available_label')}</span>
            <span class="ver-val">${dispAvailVer}</span>
          </span>
        `;
      }

      let myVerPill = '';
      if (isInstalled) {
        const myVerRaw = (installedMatch.version && installedMatch.version !== 'N/A') ? installedMatch.version : null;
        const dispMyVer = myVerRaw ? formatVersionDisplay(myVerRaw) : T('status_installed');
        const hasUpdate = !!(availVer && myVerRaw && availVer !== myVerRaw && !availVer.includes(myVerRaw) && !myVerRaw.includes(availVer));
        const myVerPillTitle = hasUpdate
          ? T('ver_update_hint', { version: availVer, current: myVerRaw })
          : T('ver_mine_hint', { version: myVerRaw || T('status_installed') });
        myVerPill = `
          <span class="cf-ver-pill cf-ver-mine ${hasUpdate ? 'has-update' : ''}" title="${myVerPillTitle}">
            <span class="ver-lbl">${hasUpdate ? T('ver_mine') : T('ver_mine_ok')}</span>
            <span class="ver-val">${dispMyVer}</span>
          </span>
        `;
      }

      if (availPill || myVerPill) {
        versionsRowHtml = `
          <div class="cf-card-versions-row">
            ${availPill}
            ${myVerPill}
          </div>
        `;
      }

      const card = document.createElement('div');
      card.className = 'cf-card';
      card.innerHTML = `
        <img class="cf-logo" src="${mod.iconUrl || 'addon-default.svg'}" alt="${mod.name}" onerror="this.src='addon-default.svg'">
        <div class="cf-card-content">
          <div class="cf-card-main">
            <div class="cf-card-top">
              <h4 class="cf-title" title="${mod.name}">${mod.name}</h4>
              <button class="btn-card-fav ${isFav ? 'is-fav' : ''}" data-id="${mod.id}" title="${isFav ? T('fav_remove_hint') : T('fav_add_hint')}">
                <svg class="fav-star-icon" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>
            </div>
            <div class="cf-card-sub">
              <span class="cf-author">${T('card_by', { author: mod.author })}${mod.categories && mod.categories[0] ? ` <span style="color:var(--text-faint); font-weight:normal;">• ${mod.categories[0].name}</span>` : ''}</span>
            </div>
            <p class="cf-summary" title="${mod.summary || ''}">${mod.summary || T('card_no_summary')}</p>
          </div>
          <div class="cf-card-bottom">
            <div class="cf-card-meta-col">
              ${versionsRowHtml}
              <div class="cf-card-stats">
                <span class="cf-downloads" title="${T('card_downloads_hint', { count: fmtNumber(mod.downloadCount) })}">📥 ${fmtNumber(mod.downloadCount)}</span>
                ${updatedText ? `<span class="cf-updated" title="${T('card_updated_hint', { date: fmtDateTime(mod.dateModified) })}">• 🕒 ${updatedText}</span>` : ''}
              </div>
            </div>
            <button class="btn-install-cf ${isInstalled ? 'installed' : ''}" data-id="${mod.id}" data-name="${mod.name}">
              ${isInstalled ? T('btn_installed') : T('btn_install')}
            </button>
          </div>
        </div>
      `;

      // 1. Click to open Detail View (when clicking card body, except install & fav buttons)
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-install-cf') || e.target.closest('.btn-card-fav')) return;
        openAddonDetail(mod.id, mod.name);
      });

      // 2. Favorite Toggle Button
      const btnFav = card.querySelector('.btn-card-fav');
      btnFav.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newFavState = await toggleFavorite(mod);
        btnFav.classList.toggle('is-fav', newFavState);
        btnFav.title = newFavState ? T('fav_remove_hint') : T('fav_add_hint');

        // If toggled inside the dedicated Favorites tab, animate card out smoothly
        if (targetContainer === favoritesTabGrid && !newFavState) {
          card.style.opacity = '0';
          card.style.transform = 'scale(0.92)';
          card.style.transition = 'all 0.2s ease';
          setTimeout(() => {
            card.remove();
            if (favoritesTabGrid.children.length === 0) {
              renderFavoritesTab(favSearchInput ? favSearchInput.value : '');
            }
          }, 200);
        }
      });

      // 3. Install Button
      const btnInstall = card.querySelector('.btn-install-cf');
      if (!isInstalled) {
        btnInstall.addEventListener('click', async (e) => {
          e.stopPropagation();
          btnInstall.classList.add('loading');
          btnInstall.textContent = T('btn_downloading');

          try {
            const installRes = await fetch('/api/install-curseforge', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ modId: mod.id, name: mod.name, gameId: currentActiveGame })
            });

            const installData = await installRes.json();
            if (installData.success) {
              btnInstall.classList.remove('loading');
              btnInstall.classList.add('installed');
              btnInstall.textContent = T('btn_installed');
              showToast(T('toast_install_done', { name: mod.name }));
              await loadInstalledAddons();

              // Update version badge dynamically on card: remove from cf-card-sub and place beside VERSIÓN in cf-card-versions-row
              const oldSubTag = card.querySelector('.cf-card-sub .card-version-tag');
              if (oldSubTag) oldSubTag.remove();

              const refreshedMatch = findInstalledAddon(mod);
              const installedVer = (refreshedMatch && refreshedMatch.version !== 'N/A') ? refreshedMatch.version : null;

              let versionsRow = card.querySelector('.cf-card-versions-row');
              if (!versionsRow) {
                const metaCol = card.querySelector('.cf-card-meta-col');
                if (metaCol) {
                  versionsRow = document.createElement('div');
                  versionsRow.className = 'cf-card-versions-row';
                  metaCol.prepend(versionsRow);
                }
              }

              if (versionsRow) {
                const existingMine = versionsRow.querySelector('.cf-ver-mine');
                if (existingMine) existingMine.remove();

                const hasUpdate = !!(availVer && installedVer && availVer !== installedVer && !availVer.includes(installedVer) && !installedVer.includes(availVer));
                const dispInstalledVer = installedVer ? formatVersionDisplay(installedVer) : T('status_installed');
                const myPillEl = document.createElement('span');
                myPillEl.className = `cf-ver-pill cf-ver-mine ${hasUpdate ? 'has-update' : ''}`;
                myPillEl.title = hasUpdate
                  ? T('ver_update_hint', { version: availVer, current: installedVer })
                  : T('ver_mine_hint', { version: installedVer || T('status_installed') });
                myPillEl.innerHTML = `
                  <span class="ver-lbl">${hasUpdate ? T('ver_mine') : T('ver_mine_ok')}</span>
                  <span class="ver-val">${dispInstalledVer}</span>
                `;
                versionsRow.appendChild(myPillEl);
              }
            } else {
              throw new Error(installData.code ? mensajeDeError(installData) : (installData.error || T('toast_install_error', { message: '' })));
            }
          } catch (err) {
            btnInstall.classList.remove('loading');
            btnInstall.textContent = T('btn_retry');
            showToast(T('toast_install_error', { message: err.message }), 'error');
          }
        });
      }

      targetContainer.appendChild(card);
    });
  }

  // 4. Addon Detail View Logic
  function showCatalogView() {
    if (inAppBrowserView) inAppBrowserView.style.display = 'none';
    cfDetailView.style.display = 'none';
    cfCatalogLayout.style.display = 'flex';
    setAddressBar('⚡', T('topbar_explorer'));
    pushNavState({ type: 'tab', tabId: 'search' });
  }

  btnBackToCatalog?.addEventListener('click', () => {
    if (historyIndex > 0) btnNavBack?.click();
    else showCatalogView();
  });
  btnBackToCatalogBottom?.addEventListener('click', () => {
    if (historyIndex > 0) btnNavBack?.click();
    else showCatalogView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cfDetailView && cfDetailView.style.display !== 'none') {
      btnNavBack?.click();
    }
  });

  function updateTranslateButtonUI(loading, translated) {
    if (!btnTranslateToggle) return;
    if (loading) {
      btnTranslateToggle.classList.add('loading');
      btnTranslateToggle.innerHTML = `<span class="translate-icon">⏳</span><span class="translate-label">${T('detail_translating')}</span>`;
    } else if (translated) {
      btnTranslateToggle.classList.remove('loading');
      btnTranslateToggle.classList.add('translated');
      btnTranslateToggle.innerHTML = `<span class="translate-icon">🇬🇧</span><span class="translate-label">${T('detail_original')}</span>`;
    } else {
      btnTranslateToggle.classList.remove('loading', 'translated');
      btnTranslateToggle.innerHTML = `<span class="translate-icon">🇪🇸</span><span class="translate-label">${T('detail_translate')}</span>`;
    }
  }

  btnTranslateToggle?.addEventListener('click', async () => {
    if (!currentDetailMod) return;
    const heroSummaryEl = document.getElementById('detailHeroSummary');

    if (!isTranslated) {
      if (currentTranslatedDesc && currentTranslatedSummary) {
        isTranslated = true;
        detailHtmlBody.innerHTML = currentTranslatedDesc;
        if (heroSummaryEl) heroSummaryEl.textContent = currentTranslatedSummary;
        updateTranslateButtonUI(false, true);
        showToast(T('toast_translated'));
        return;
      }

      updateTranslateButtonUI(true, false);
      try {
        const res = await fetch('/api/translate-mod', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modId: currentDetailMod.id,
            summary: currentOriginalSummary,
            html: currentOriginalDesc,
            targetLang: 'es'
          })
        });
        const data = await res.json();
        if (data.success) {
          currentTranslatedDesc = data.html || currentOriginalDesc;
          currentTranslatedSummary = data.summary || currentOriginalSummary;
          isTranslated = true;
          detailHtmlBody.innerHTML = currentTranslatedDesc;
          if (heroSummaryEl) heroSummaryEl.textContent = currentTranslatedSummary;
          updateTranslateButtonUI(false, true);
          showToast(T('toast_translated_ok'));
        } else {
          throw new Error(data.code ? mensajeDeError(data) : (data.error || T('toast_translate_error', { message: '' })));
        }
      } catch (err) {
        updateTranslateButtonUI(false, false);
        showToast(T('toast_translate_error', { message: err.message }), 'error');
      }
    } else {
      isTranslated = false;
      detailHtmlBody.innerHTML = currentOriginalDesc;
      if (heroSummaryEl) heroSummaryEl.textContent = currentOriginalSummary;
      updateTranslateButtonUI(false, false);
      showToast(T('toast_original'));
    }
  });

  function openAddonDetail(modId, modName = '') {
    pushNavState({ type: 'detail', modId, modName });
    openAddonDetailInternal(modId, modName);
  }

  async function openAddonDetailInternal(modId, modName = '') {
    if (inAppBrowserView) inAppBrowserView.style.display = 'none';
    cfCatalogLayout.style.display = 'none';
    cfDetailView.style.display = 'flex';
    cfDetailView.scrollTop = 0; // cada addon abre la ficha desde arriba

    // Ensure search tab is active in sidebar
    navItems.forEach(i => i.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));
    document.querySelector('.nav-item[data-tab="search"]')?.classList.add('active');
    document.getElementById('pane-search')?.classList.add('active');

    setAddressBar('📦', modName ? T('topbar_addon', { name: modName }) : T('topbar_details'));

    // Reset Tabs
    detailTabsBtns.forEach(b => b.classList.remove('active'));
    detailTabContents.forEach(c => c.classList.remove('active'));
    document.querySelector('.detail-tab-btn[data-detail-tab="desc"]')?.classList.add('active');
    document.getElementById('detailTabDesc')?.classList.add('active');

    detailHeroCard.innerHTML = `
      <div class="empty-state" style="width:100%;">
        <span class="empty-icon">⏳</span>
        <h3 class="empty-title">${T('detail_loading_title', { name: modName || T('nav_search') })}</h3>
      </div>
    `;
    detailHtmlBody.innerHTML = `<p>${T('detail_loading_desc')}</p>`;
    detailFilesList.innerHTML = `<p>${T('detail_loading_files')}</p>`;
    detailGalleryGrid.innerHTML = '';

    try {
      // 1. Fetch Mod Details
      const res = await fetch(`/api/mod/${modId}`);
      const data = await res.json();
      const mod = data.mod;
      currentDetailMod = mod;

      setAddressBar('📦', T('topbar_addon', { name: mod.name }));

      currentOriginalSummary = mod.summary || '';
      currentTranslatedSummary = '';
      currentOriginalDesc = '';
      currentTranslatedDesc = '';
      isTranslated = false;
      updateTranslateButtonUI(false, false);

      // Pre-check if cached translation exists
      fetch(`/api/mod/${modId}/translation`)
        .then(r => r.json())
        .then(tData => {
          if (tData.translation && tData.translation.es) {
            currentTranslatedDesc = tData.translation.es.html || '';
            currentTranslatedSummary = tData.translation.es.summary || '';
          }
        })
        .catch(() => {});

      renderDetailHero(mod, findInstalledAddon(mod));

      // 2. Fetch Description
      fetch(`/api/mod/${modId}/description`)
        .then(r => r.json())
        .then(descData => {
          currentOriginalDesc = descData.html || `<p>${T('detail_no_desc')}</p>`;
          detailHtmlBody.innerHTML = isTranslated && currentTranslatedDesc ? currentTranslatedDesc : currentOriginalDesc;
        })
        .catch(() => {
          detailHtmlBody.innerHTML = `<p>${T('detail_desc_error')}</p>`;
        });

      // 3. Fetch Files
      fetch(`/api/mod/${modId}/files`)
        .then(r => r.json())
        .then(filesData => {
          renderDetailFiles(filesData.files || [], mod.name);
        })
        .catch(() => {
          detailFilesList.innerHTML = `<p>${T('detail_files_error')}</p>`;
        });

      // 4. Render Gallery / Screenshots
      renderDetailGallery(mod);

    } catch (err) {
      console.error('Error cargando detalle:', err);
      detailHeroCard.innerHTML = `
        <div class="empty-state" style="width:100%;">
          <span class="empty-icon">⚠️</span>
          <h3 class="empty-title">${T('detail_error_title')}</h3>
          <p class="empty-desc">${err.message}</p>
        </div>
      `;
    }
  }

  // Pinta la cabecera de la ficha (y sus botones) con los datos ya cargados.
  function renderDetailHero(mod, installedMatch) {
    if (!mod) return;
    const isFav = isModFavorite(mod.id);
    const isInstalled = !!installedMatch;
    const myVerRaw = (installedMatch && installedMatch.version && installedMatch.version !== 'N/A') ? installedMatch.version : null;

    btnDetailToggleFav.className = `btn btn-secondary btn-fav-detail ${isFav ? 'is-fav' : ''}`;
    btnDetailToggleFav.innerHTML = `<span class="star-icon">${isFav ? '★' : '☆'}</span><span class="fav-label">${isFav ? T('detail_fav_has') : T('detail_fav_add')}</span>`;

    btnDetailInstall.className = `btn btn-gold btn-install-detail ${isInstalled ? 'installed' : ''}`;
    btnDetailInstall.textContent = isInstalled ? T('detail_installed') : T('detail_install_latest');

    const availVer = formatVersionString(mod.version);
    const heroSummary = (isTranslated && currentTranslatedSummary) ? currentTranslatedSummary : (mod.summary || '');

    detailHeroCard.innerHTML = `
      <img class="detail-hero-logo" src="${mod.iconUrl || 'favicon.png'}" alt="${mod.name}" onerror="this.src='favicon.png'">
      <div class="detail-hero-info">
        <div>
          <h2 class="detail-hero-title">${mod.name}</h2>
          <div class="detail-hero-author">${T('detail_by')} <strong>${mod.author}</strong></div>
          <p class="detail-hero-summary" id="detailHeroSummary">${heroSummary}</p>
        </div>
        <div class="detail-hero-meta">
          <span class="meta-item">${T('detail_downloads')} <strong class="gold">${fmtNumber(mod.downloadCount)}</strong></span>
          ${availVer ? `<span class="meta-item">${T('detail_cat_ver')} <strong>${availVer}</strong></span>` : ''}
          ${isInstalled ? `<span class="meta-item">${T('detail_my_ver')} <strong style="color:var(--status-green);">✓ ${myVerRaw ? formatVersionDisplay(myVerRaw) : T('status_installed')}</strong></span>` : ''}
          <span class="meta-item">${T('detail_updated')} <strong>${fmtDate(mod.dateModified, { day: 'numeric', month: 'numeric', year: 'numeric' })}</strong></span>
          <span class="meta-item">${T('detail_created')} <strong>${fmtDate(mod.dateCreated, { day: 'numeric', month: 'numeric', year: 'numeric' })}</strong></span>
          ${mod.sourceUrl ? `<span class="meta-item"><a href="${mod.sourceUrl}" class="repo-link" title="${T('detail_repo_hint')}">${T('detail_repo')}</a></span>` : ''}
          ${mod.wikiUrl ? `<span class="meta-item"><a href="${mod.wikiUrl}" class="repo-link" title="${T('detail_wiki_hint')}">${T('detail_wiki')}</a></span>` : ''}
          ${mod.issuesUrl ? `<span class="meta-item"><a href="${mod.issuesUrl}" class="repo-link" title="${T('detail_issues_hint')}">${T('detail_issues')}</a></span>` : ''}
        </div>
      </div>
    `;
  }

  // Pinta la galería de capturas de la ficha.
  function renderDetailGallery(mod) {
    if (!mod) return;
    if (mod.screenshots && mod.screenshots.length > 0) {
      detailGalleryGrid.innerHTML = '';
      mod.screenshots.forEach(s => {
        const item = document.createElement('div');
        item.className = 'gallery-thumb';
        item.innerHTML = `
          <a href="${s.url}" title="${s.title || mod.name}">
            <img src="${s.thumbnailUrl || s.url}" alt="${s.title || mod.name}">
          </a>
          ${s.title ? `<div class="gallery-title">${s.title}</div>` : ''}
        `;
        detailGalleryGrid.appendChild(item);
      });
    } else {
      detailGalleryGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <span class="empty-icon">🖼️</span>
          <p class="empty-desc">${T('detail_no_screenshots')}</p>
        </div>
      `;
    }
  }

  // In-App Browser Navigation
  function openInAppBrowser(url, title = '') {
    pushNavState({ type: 'web', url, title });
    openInAppBrowserInternal(url, title);
  }

  function openInAppBrowserInternal(url, title = '') {
    tabPanes.forEach(p => p.classList.remove('active'));
    if (cfDetailView) cfDetailView.style.display = 'none';
    if (cfCatalogLayout) cfCatalogLayout.style.display = 'none';
    if (inAppBrowserView) inAppBrowserView.style.display = 'flex';

    currentWebUrl = url;
    if (browserCurrentUrl) browserCurrentUrl.textContent = url;
    setAddressBar('🌐', title ? `KoRForge / Web / ${title}` : `KoRForge / ${url}`);

    if (browserFrameWrap) {
      browserFrameWrap.innerHTML = '';
      let frame;
      if (window.electronAPI) {
        frame = document.createElement('webview');
        frame.setAttribute('src', url);
        frame.setAttribute('allowpopups', 'true');
        frame.style.width = '100%';
        frame.style.height = '100%';
        frame.style.border = 'none';

        frame.addEventListener('did-navigate', (e) => {
          if (e.url) {
            currentWebUrl = e.url;
            if (browserCurrentUrl) browserCurrentUrl.textContent = e.url;
          }
        });
        frame.addEventListener('did-navigate-in-page', (e) => {
          if (e.url) {
            currentWebUrl = e.url;
            if (browserCurrentUrl) browserCurrentUrl.textContent = e.url;
          }
        });
        frame.addEventListener('page-title-updated', (e) => {
          if (e.title) {
            setAddressBar('🌐', `KoRForge / Web / ${e.title}`);
          }
        });
      } else {
        frame = document.createElement('iframe');
        frame.src = url;
        frame.style.width = '100%';
        frame.style.height = '100%';
        frame.style.border = 'none';
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
      }
      currentBrowserFrame = frame;
      browserFrameWrap.appendChild(frame);
    }
  }

  btnBrowserBack?.addEventListener('click', () => {
    btnNavBack?.click();
  });

  btnBrowserReload?.addEventListener('click', () => {
    if (currentBrowserFrame) {
      if (typeof currentBrowserFrame.reload === 'function') currentBrowserFrame.reload();
      else currentBrowserFrame.src = currentWebUrl;
    }
  });

  btnBrowserOpenExternal?.addEventListener('click', () => {
    const targetUrl = currentWebUrl || 'https://www.curseforge.com';
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(targetUrl);
    } else {
      window.open(targetUrl, '_blank');
    }
    showToast(T('toast_open_external'));
  });

  // Delegated link click inside Addon Detail View to open in In-App Browser
  cfDetailView?.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (href && /^https?:\/\//i.test(href)) {
      e.preventDefault();
      const title = anchor.getAttribute('title') || anchor.textContent.trim() || href;
      openInAppBrowser(href, title);
    }
  });

  // Render Files Table inside Detail View
  // Última lista de versiones pintada (para repintar al cambiar de idioma)
  let lastDetailFiles = [];
  let lastDetailAddonName = '';

  function renderDetailFiles(files, addonName) {
    lastDetailFiles = Array.isArray(files) ? files : [];
    lastDetailAddonName = addonName || '';

    if (lastDetailFiles.length === 0) {
      detailFilesList.innerHTML = `<p>${T('detail_no_files')}</p>`;
      return;
    }

    detailFilesList.innerHTML = '';
    lastDetailFiles.forEach(f => {
      const item = document.createElement('div');
      item.className = 'file-item';

      const typeClass = f.releaseType === 1 ? 'file-type-release' : f.releaseType === 2 ? 'file-type-beta' : 'file-type-alpha';
      const isForever = (f.gameVersions || []).some(v => v.includes('1.60') || v.toLowerCase().includes('forever'));

      const versionsBadges = (f.gameVersions || []).slice(0, 6).map(v => {
        const isVerForever = v.includes('1.60') || v.toLowerCase().includes('forever');
        return `<span class="game-ver-tag ${isVerForever ? 'forever' : ''}">${v}</span>`;
      }).join(' ');

      item.innerHTML = `
        <div>
          <span class="file-name">${f.displayName || f.fileName}</span>
          <div class="file-meta-line">
            <span class="file-type-badge ${typeClass}">${f.releaseTypeLabel}</span>
            <span>${fmtDate(f.fileDate, { day: 'numeric', month: 'numeric', year: 'numeric' })}</span>
            <span>• ${f.fileLength}</span>
            <span>• 📥 ${fmtNumber(f.downloadCount)}</span>
            <span>${T('file_versions', { versions: versionsBadges })}</span>
          </div>
        </div>
        <button class="btn btn-secondary btn-install-file" data-url="${f.downloadUrl}" data-name="${lastDetailAddonName}">
          ${isForever ? T('file_install_forever') : T('file_install')}
        </button>
      `;

      const btnInst = item.querySelector('.btn-install-file');
      btnInst.addEventListener('click', async () => {
        btnInst.disabled = true;
        btnInst.textContent = T('btn_installing_file');

        try {
          const res = await fetch('/api/install-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ downloadUrl: f.downloadUrl, name: lastDetailAddonName, gameId: currentActiveGame })
          });
          const resData = await res.json();
          if (resData.success) {
            btnInst.textContent = T('btn_installed');
            showToast(T('toast_install_done', { name: lastDetailAddonName }));
            loadInstalledAddons();
          } else {
            throw new Error(resData.code ? mensajeDeError(resData) : (resData.error || T('toast_install_error', { message: '' })));
          }
        } catch (err) {
          btnInst.disabled = false;
          btnInst.textContent = T('btn_retry');
          showToast(T('toast_install_error', { message: err.message }), 'error');
        }
      });

      detailFilesList.appendChild(item);
    });
  }

  // Detail View Tabs Switching
  detailTabsBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      detailTabsBtns.forEach(b => b.classList.remove('active'));
      detailTabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = btn.getAttribute('data-detail-tab');
      if (targetTab === 'desc') document.getElementById('detailTabDesc')?.classList.add('active');
      if (targetTab === 'files') document.getElementById('detailTabFiles')?.classList.add('active');
      if (targetTab === 'gallery') document.getElementById('detailTabGallery')?.classList.add('active');

      // Cada pestaña empieza a leerse desde arriba (la barra de acciones queda fija)
      if (cfDetailView) cfDetailView.scrollTop = 0;
    });
  });

  // Detail View Favorite Toggle
  btnDetailToggleFav?.addEventListener('click', async () => {
    if (!currentDetailMod) return;
    const isNowFav = await toggleFavorite(currentDetailMod);
    btnDetailToggleFav.className = `btn btn-secondary btn-fav-detail ${isNowFav ? 'is-fav' : ''}`;
    btnDetailToggleFav.innerHTML = `<span class="star-icon">${isNowFav ? '★' : '☆'}</span><span class="fav-label">${isNowFav ? T('detail_fav_has') : T('detail_fav_add')}</span>`;
  });

  // Detail View Install Latest
  btnDetailInstall?.addEventListener('click', async () => {
    if (!currentDetailMod) return;
    btnDetailInstall.disabled = true;
    btnDetailInstall.textContent = T('btn_downloading');

    try {
      const res = await fetch('/api/install-curseforge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modId: currentDetailMod.id, name: currentDetailMod.name, gameId: currentActiveGame })
      });
      const data = await res.json();
      if (data.success) {
        btnDetailInstall.textContent = T('detail_install_done');
        showToast(T('toast_install_done', { name: currentDetailMod.name }));
        loadInstalledAddons();
      } else {
        throw new Error(data.code ? mensajeDeError(data) : (data.error || T('toast_install_error', { message: '' })));
      }
    } catch (err) {
      btnDetailInstall.disabled = false;
      btnDetailInstall.textContent = T('btn_retry');
      showToast(T('toast_install_error', { message: err.message }), 'error');
    }
  });

  // 5. Install from URL / GitHub
  btnInstallUrl?.addEventListener('click', async () => {
    const url = installUrlInput.value.trim();
    if (!url) return;

    btnInstallUrl.disabled = true;
    btnInstallUrl.textContent = T('btn_downloading');

    const log = (msg, type = 'info') => {
      const line = document.createElement('div');
      line.className = `log-line ${type}`;
      line.textContent = `[${new Date().toLocaleTimeString(LOCALE())}] ${msg}`;
      installConsole.appendChild(line);
      installConsole.scrollTop = installConsole.scrollHeight;
    };

    log(T('manual_log_start', { url }));

    try {
      const res = await fetch('/api/install-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, gameId: currentActiveGame })
      });

      const data = await res.json();
      if (data.success) {
        log(`✓ ${T('manual_log_done', { folders: data.installedFolders.join(', ') })}`, 'info');
        showToast(T('manual_toast_done', { folders: data.installedFolders.join(', ') }));
        installUrlInput.value = '';
        loadInstalledAddons();
      } else {
        throw new Error(data.code ? mensajeDeError(data) : (data.error || T('manual_error_unknown')));
      }
    } catch (err) {
      log(`❌ ${T('manual_log_error', { message: err.message })}`, 'error');
      showToast(err.message, 'error');
    } finally {
      btnInstallUrl.disabled = false;
      btnInstallUrl.textContent = T('settings_manual_btn');
    }
  });

  // 6. Backups WTF
  async function loadBackups(gameId) {
    try {
      const g = gameId || currentActiveGame || 'forever';
      const res = await fetch(`/api/backups?gameId=${encodeURIComponent(g)}`);
      const data = await res.json();
      const backups = data.backups || [];
      lastBackups = backups;
      backupsCountBadge.textContent = backups.length;

      const backupsSub = document.querySelector('#pane-backups .page-subtitle');
      if (backupsSub) {
        backupsSub.textContent = T('vault_subtitle_game', { game: gameLabel(g) });
      }

      backupsList.innerHTML = '';
      if (backups.length === 0) {
        backupsList.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">💾</span>
            <h3 class="empty-title">${T('vault_empty_title', { game: gameLabel(g) })}</h3>
            <p class="empty-desc">${T('vault_empty_desc')}</p>
          </div>
        `;
        return;
      }

      backups.forEach(b => {
        const item = document.createElement('div');
        item.className = 'backup-item';
        item.innerHTML = `
          <div class="backup-info">
            <span class="backup-title">${b.fileName}</span>
            <span class="backup-date">${b.date} • ${b.sizeMb} MB</span>
          </div>
          <div class="backup-actions">
            <button class="card-btn btn-restore-backup" data-file="${b.fileName}">${T('vault_restore')}</button>
            <button class="card-btn btn-danger btn-delete-backup" data-file="${b.fileName}">${T('vault_delete')}</button>
          </div>
        `;

        item.querySelector('.btn-restore-backup').addEventListener('click', async () => {
          if (!confirm(T('confirm_restore', { file: b.fileName, game: gameLabel(currentActiveGame) }))) return;
          try {
            const res = await fetch('/api/backups/restore', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileName: b.fileName, gameId: currentActiveGame })
            });
            const resData = await res.json();
            if (resData.success) {
              showToast(T('toast_restore_ok'));
            }
          } catch (err) {
            showToast(T('toast_restore_error'), 'error');
          }
        });

        item.querySelector('.btn-delete-backup').addEventListener('click', async () => {
          if (!confirm(T('confirm_delete_backup', { file: b.fileName }))) return;
          try {
            await fetch(`/api/backups/${encodeURIComponent(b.fileName)}?gameId=${encodeURIComponent(currentActiveGame)}`, { method: 'DELETE' });
            showToast(T('toast_delete_ok'));
            loadBackups();
          } catch (err) {
            showToast(T('toast_delete_error'), 'error');
          }
        });

        backupsList.appendChild(item);
      });
    } catch (err) {
      console.error('Error cargando backups:', err);
    }
  }

  btnCreateBackup?.addEventListener('click', async () => {
    btnCreateBackup.disabled = true;
    btnCreateBackup.textContent = T('vault_create_loading');

    try {
      const res = await fetch('/api/backups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: currentActiveGame })
      });
      const data = await res.json();
      if (data.fileName) {
        showToast(T('toast_backup_created', { file: data.fileName, size: data.sizeMb }));
        loadBackups();
      } else {
        throw new Error(data.code ? mensajeDeError(data) : (data.error || T('toast_backup_error')));
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnCreateBackup.disabled = false;
      btnCreateBackup.textContent = T('vault_create');
    }
  });

  // App Update System (GitHub Releases)
  const btnAppUpdate = document.getElementById('btnAppUpdate');
  const appUpdateVerBadge = document.getElementById('appUpdateVerBadge');
  const appUpdateLabel = document.getElementById('appUpdateLabel');
  const updateModal = document.getElementById('updateModal');
  const btnCloseUpdateModal = document.getElementById('btnCloseUpdateModal');
  const btnDismissUpdate = document.getElementById('btnDismissUpdate');
  const btnRecheckUpdate = document.getElementById('btnRecheckUpdate');
  const btnDownloadUpdate = document.getElementById('btnDownloadUpdate');
  const modalIcon = document.getElementById('modalIcon');
  const modalTitle = document.getElementById('modalTitle');
  const modalSub = document.getElementById('modalSub');
  const modalCurrentVer = document.getElementById('modalCurrentVer');
  const modalNewVer = document.getElementById('modalNewVer');
  const modalNewVerCol = document.getElementById('modalNewVerCol');
  const modalVerArrow = document.getElementById('modalVerArrow');
  const modalNotesTitle = document.getElementById('modalNotesTitle');
  const modalReleaseNotes = document.getElementById('modalReleaseNotes');
  let appUpdateData = null;
  let versionInstalada = '';

  function versionLimpia(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    return s.toLowerCase().startsWith('v') ? s : `v${s}`;
  }

  function textoI18n(clave) {
    return T(clave);
  }

  /**
   * Pinta el botón del menú lateral. Dos estados:
   *  - 'latest': apagado, mostrando la versión instalada.
   *  - 'update': encendido (verde, con pulso), «Actualizar a vX».
   */
  function pintarBotonVersion(modo, verInstalada, verRemota) {
    if (!btnAppUpdate) return;
    btnAppUpdate.style.display = 'flex';

    if (modo === 'update' && verRemota) {
      btnAppUpdate.classList.remove('is-latest');
      if (appUpdateLabel) appUpdateLabel.textContent = T('nav_update_to');
      if (appUpdateVerBadge) appUpdateVerBadge.textContent = versionLimpia(verRemota);
      btnAppUpdate.title = T('upd_nav_new_hint', { version: versionLimpia(verRemota) });
    } else {
      const ver = versionLimpia(verInstalada || versionInstalada);
      btnAppUpdate.classList.add('is-latest');
      if (appUpdateLabel) appUpdateLabel.textContent = T('nav_update_latest');
      if (appUpdateVerBadge) appUpdateVerBadge.textContent = ver || 'v…';
      btnAppUpdate.title = ver
        ? T('upd_nav_latest_hint', { version: ver })
        : T('upd_nav_unknown_hint');
    }
  }

  async function checkAppUpdates() {
    try {
      const res = await fetch('/api/app-updates/check');
      const data = await res.json().catch(() => null);
      if (data && data.currentVersion) versionInstalada = String(data.currentVersion);
      if (data && data.updateAvailable) {
        appUpdateData = data;
        pintarBotonVersion('update', versionInstalada, data.remoteVersion);
      } else {
        appUpdateData = data || null;
        pintarBotonVersion('latest', versionInstalada);
      }
      return data;
    } catch (err) {
      console.warn('[KoRForge Updates] Comprobación de actualizaciones fallida:', err.message);
      appUpdateData = null;
      pintarBotonVersion('latest', versionInstalada);
      return null;
    }
  }

  // Abre el modal en el estado que toque: con versión nueva o en «al día»
  function abrirModalActualizacion() {
    if (!updateModal) return;
    const hayNueva = !!(appUpdateData && appUpdateData.updateAvailable);
    const verInstaladaTxt = versionLimpia((appUpdateData && appUpdateData.currentVersion) || versionInstalada) || '?';
    const verRemotaTxt = versionLimpia(appUpdateData && appUpdateData.remoteVersion);

    /* Icono del modal: el cohete goblin cuando hay versión nueva y la marca verde cuando ya
       estás al día (dueño, 20-10-2026: fuera los emojis de cohete de la interfaz). */
    if (modalIcon) {
      const iconCohete = modalIcon.querySelector('.modal-icon-img');
      const iconOk = modalIcon.querySelector('.modal-icon-ok');
      if (iconCohete && iconOk) {
        iconCohete.hidden = !hayNueva;
        iconOk.hidden = hayNueva;
      }
    }
    if (modalTitle) modalTitle.textContent = hayNueva ? T('upd_title_new') : T('upd_title_latest');
    if (modalSub) {
      modalSub.textContent = hayNueva
        ? T('upd_sub_github')
        : T('upd_sub_latest', { version: verInstaladaTxt });
    }
    if (modalCurrentVer) modalCurrentVer.textContent = verInstaladaTxt;
    if (modalNewVer) modalNewVer.textContent = verRemotaTxt || verInstaladaTxt;
    if (modalVerArrow) modalVerArrow.style.display = hayNueva ? '' : 'none';
    if (modalNewVerCol) modalNewVerCol.style.display = hayNueva ? '' : 'none';
    if (modalNotesTitle) modalNotesTitle.textContent = hayNueva ? T('upd_notes_title_new') : T('upd_notes_title_latest');
    if (modalReleaseNotes) {
      if (hayNueva || (appUpdateData && appUpdateData.releaseNotes)) {
        modalReleaseNotes.innerHTML = formatReleaseNotes(appUpdateData && appUpdateData.releaseNotes);
      } else {
        modalReleaseNotes.innerHTML = `<p style="color:#94a3b8;">${T('upd_notes_offline')}</p>`;
      }
    }
    if (updateProgressWrap) updateProgressWrap.style.display = 'none';
    if (btnDownloadUpdate) {
      btnDownloadUpdate.style.display = hayNueva ? 'inline-flex' : 'none';
      btnDownloadUpdate.disabled = false;
      btnDownloadUpdate.textContent = T('upd_btn_update_app');
    }
    if (btnApplyUpdateRestart) btnApplyUpdateRestart.style.display = 'none';
    if (btnRecheckUpdate) btnRecheckUpdate.style.display = hayNueva ? 'none' : 'inline-flex';
    if (btnDismissUpdate) btnDismissUpdate.textContent = hayNueva ? T('upd_btn_later') : T('upd_btn_close');
    updateModal.style.display = 'flex';
  }

  function formatInlineMd(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function formatReleaseNotes(rawMarkdown) {
    if (!rawMarkdown) return `<p>${T('upd_notes_default')}</p>`;

    const lines = rawMarkdown.split('\n');
    let html = '';
    let inList = false;

    for (let rawLine of lines) {
      let line = rawLine.trim();
      if (!line) continue;

      // Omitir títulos principales redundantes (ya mostrados en la cabecera del modal)
      if (line.match(/^##\s+KoRForge/i)) continue;

      // Subtítulos
      if (line.startsWith('### ') || line.startsWith('## ')) {
        if (inList) { html += '</ul>'; inList = false; }
        const title = line.replace(/^#+\s*/, '');
        html += `<h3>${formatInlineMd(title)}</h3>`;
        continue;
      }

      // Elementos de lista
      if (line.startsWith('- ') || line.startsWith('* ')) {
        if (!inList) { html += '<ul>'; inList = true; }
        const item = line.replace(/^[-*]\s+/, '');
        html += `<li>${formatInlineMd(item)}</li>`;
        continue;
      }

      // Texto normal
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p style="margin-bottom: 6px; color: #94a3b8;">${formatInlineMd(line)}</p>`;
    }

    if (inList) html += '</ul>';
    return html || `<p>${T('upd_notes_default')}</p>`;
  }

  function closeUpdateModal() {
    if (updateModal) updateModal.style.display = 'none';
  }

  const updateProgressWrap = document.getElementById('updateProgressWrap');
  const updateProgressFill = document.getElementById('updateProgressFill');
  const updateProgressInfo = document.getElementById('updateProgressInfo');
  const btnApplyUpdateRestart = document.getElementById('btnApplyUpdateRestart');
  let updatePollInterval = null;

  if (btnAppUpdate) {
    btnAppUpdate.addEventListener('click', abrirModalActualizacion);
  }

  btnCloseUpdateModal?.addEventListener('click', closeUpdateModal);
  btnDismissUpdate?.addEventListener('click', closeUpdateModal);
  updateModal?.addEventListener('click', (e) => {
    if (e.target === updateModal) closeUpdateModal();
  });

  // «Comprobar de nuevo» (solo en el estado «al día»)
  btnRecheckUpdate?.addEventListener('click', async () => {
    if (!btnRecheckUpdate) return;
    btnRecheckUpdate.disabled = true;
    btnRecheckUpdate.textContent = T('upd_btn_checking');
    const data = await checkAppUpdates();
    btnRecheckUpdate.disabled = false;
    btnRecheckUpdate.textContent = T('upd_btn_recheck');
    if (data && data.updateAvailable) {
      showToast(T('toast_update_available', { version: versionLimpia(data.remoteVersion) }), 'success');
    } else {
      showToast(T('toast_on_latest'), 'info');
    }
    abrirModalActualizacion();
  });

  // In-App Download Trigger
  btnDownloadUpdate?.addEventListener('click', async () => {
    if (!appUpdateData || !appUpdateData.downloadUrl) {
      showToast(T('toast_no_update_url'), 'error');
      return;
    }

    try {
      btnDownloadUpdate.disabled = true;
      btnDownloadUpdate.textContent = T('btn_downloading');
      if (updateProgressWrap) updateProgressWrap.style.display = 'block';
      if (updateProgressFill) updateProgressFill.style.width = '0%';
      if (updateProgressInfo) updateProgressInfo.textContent = T('upd_starting');

      const res = await fetch('/api/app-updates/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          downloadUrl: appUpdateData.downloadUrl,
          version: appUpdateData.remoteVersion
        })
      });

      if (!res.ok) throw new Error(T('upd_download_failed'));

      // Poll progress every 400ms
      clearInterval(updatePollInterval);
      updatePollInterval = setInterval(async () => {
        try {
          const progRes = await fetch('/api/app-updates/download-progress');
          const prog = await progRes.json();

          if (prog.status === 'downloading') {
            if (updateProgressFill) updateProgressFill.style.width = `${prog.percent}%`;
            const mbDown = (prog.downloadedBytes / (1024 * 1024)).toFixed(1);
            const mbTotal = (prog.totalBytes / (1024 * 1024)).toFixed(1);
            if (updateProgressInfo) {
              updateProgressInfo.textContent = T('upd_downloading', {
                percent: prog.percent,
                done: mbDown,
                total: mbTotal,
                speed: prog.speedMb || '0.0'
              });
            }
          } else if (prog.status === 'completed') {
            clearInterval(updatePollInterval);
            if (updateProgressFill) updateProgressFill.style.width = '100%';
            if (updateProgressInfo) updateProgressInfo.textContent = T('upd_complete');
            btnDownloadUpdate.style.display = 'none';
            if (btnApplyUpdateRestart) {
              btnApplyUpdateRestart.style.display = 'inline-flex';
            }
            showToast(T('toast_download_ok'), 'success');
          } else if (prog.status === 'error') {
            clearInterval(updatePollInterval);
            if (updateProgressInfo) updateProgressInfo.textContent = T('upd_error', { message: prog.error || T('upd_download_failed') });
            btnDownloadUpdate.disabled = false;
            btnDownloadUpdate.textContent = T('upd_btn_retry_download');
            showToast(T('toast_download_fail', { message: prog.error || T('upd_download_failed') }), 'error');
          }
        } catch (_) {}
      }, 400);

    } catch (err) {
      showToast(T('toast_download_start_error', { message: err.message }), 'error');
      btnDownloadUpdate.disabled = false;
      btnDownloadUpdate.textContent = T('upd_btn_update_app');
    }
  });

  // Apply Update and Restart
  btnApplyUpdateRestart?.addEventListener('click', async () => {
    try {
      btnApplyUpdateRestart.disabled = true;
      btnApplyUpdateRestart.textContent = T('upd_btn_restarting');
      showToast(T('toast_applying'), 'info');

      const res = await fetch('/api/app-updates/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // El idioma se manda para que la tarjeta de carga del actualizador (interfaz nativa)
        // salga en el idioma en el que está la app (docs/REGLAS-IDIOMAS.md)
        body: JSON.stringify({ lang: (document.documentElement.lang || 'en') })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.code ? mensajeDeError(data) : (data.error || `HTTP ${res.status}`));
      }
    } catch (err) {
      showToast(T('toast_restart_error', { message: err.message }), 'error');
      btnApplyUpdateRestart.disabled = false;
      btnApplyUpdateRestart.textContent = T('upd_btn_retry_restart');
    }
  });

  // --- Bulk Addon Updates ("El Botón Mágico") ---
  const btnCheckAddonUpdates = document.getElementById('btnCheckAddonUpdates');
  const bulkUpdateBanner = document.getElementById('bulkUpdateBanner');
  const bulkUpdateSummary = document.getElementById('bulkUpdateSummary');
  const btnUpdateAllAddons = document.getElementById('btnUpdateAllAddons');

  const bulkUpdateModal = document.getElementById('bulkUpdateModal');
  const bulkProgressFill = document.getElementById('bulkProgressFill');
  const bulkProgressInfo = document.getElementById('bulkProgressInfo');
  const bulkUpdateResultsList = document.getElementById('bulkUpdateResultsList');
  const btnCloseBulkModal = document.getElementById('btnCloseBulkModal');
  const btnCloseBulkModalX = document.getElementById('btnCloseBulkModalX');

  async function checkAddonUpdates(silent = false) {
    if (!silent) showToast(T('toast_checking_addons'), 'info');
    try {
      const res = await fetch(`/api/addons/check-updates?gameId=${encodeURIComponent(currentActiveGame)}`);
      const data = await res.json();
      availableAddonUpdates = data.updates || [];

      if (availableAddonUpdates.length > 0) {
        if (bulkUpdateBanner) bulkUpdateBanner.style.display = 'flex';
        if (bulkUpdateSummary) {
          bulkUpdateSummary.textContent = T('bulk_summary_count', { count: availableAddonUpdates.length });
        }
        if (!silent) showToast(T('toast_updates_found', { count: availableAddonUpdates.length }), 'warning');
      } else {
        if (bulkUpdateBanner) bulkUpdateBanner.style.display = 'none';
        if (!silent) showToast(T('toast_all_up_to_date'), 'success');
      }

      // Re-render installed addons to show update pills
      const activePill = document.querySelector('.filter-pills .pill.active');
      const filter = activePill ? activePill.getAttribute('data-filter') : 'all';
      renderInstalledAddons(filter, document.getElementById('searchInput')?.value || '');
    } catch (err) {
      if (!silent) showToast(T('toast_check_addons_error'), 'error');
    }
  }

  btnCheckAddonUpdates?.addEventListener('click', () => checkAddonUpdates(false));

  btnUpdateAllAddons?.addEventListener('click', async () => {
    if (availableAddonUpdates.length === 0) return;

    if (bulkUpdateModal) bulkUpdateModal.style.display = 'flex';
    if (bulkProgressFill) bulkProgressFill.style.width = '0%';
    if (bulkProgressInfo) bulkProgressInfo.textContent = T('bulk_progress', { done: 0, total: availableAddonUpdates.length });
    if (bulkUpdateResultsList) bulkUpdateResultsList.innerHTML = '';
    if (btnCloseBulkModal) btnCloseBulkModal.style.display = 'none';
    if (btnCloseBulkModalX) btnCloseBulkModalX.style.display = 'none';

    try {
      const res = await fetch('/api/addons/update-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: availableAddonUpdates,
          gameId: currentActiveGame
        })
      });

      const data = await res.json();
      if (bulkProgressFill) bulkProgressFill.style.width = '100%';
      if (bulkProgressInfo) {
        bulkProgressInfo.textContent = T('bulk_done', { updated: data.updatedCount, failed: data.failedCount });
      }

      if (bulkUpdateResultsList && Array.isArray(data.results)) {
        bulkUpdateResultsList.innerHTML = data.results.map(r => `
          <div style="padding: 4px 0; color: ${r.success ? '#4ade80' : '#f87171'};">
            ${r.success ? '✓' : '✗'} <strong>${r.name}</strong> ${r.success ? T('bulk_item_ok') : `(${r.code ? mensajeDeError(r) : r.error})`}
          </div>
        `).join('');
      }

      availableAddonUpdates = [];
      if (bulkUpdateBanner) bulkUpdateBanner.style.display = 'none';
      if (btnCloseBulkModal) btnCloseBulkModal.style.display = 'inline-flex';
      if (btnCloseBulkModalX) btnCloseBulkModalX.style.display = 'block';

      loadInstalledAddons();
    } catch (err) {
      if (bulkProgressInfo) bulkProgressInfo.textContent = T('bulk_error', { message: err.message });
      if (btnCloseBulkModal) btnCloseBulkModal.style.display = 'inline-flex';
    }
  });

  const closeBulkModal = () => { if (bulkUpdateModal) bulkUpdateModal.style.display = 'none'; };
  btnCloseBulkModal?.addEventListener('click', closeBulkModal);
  btnCloseBulkModalX?.addEventListener('click', closeBulkModal);

  // Single Addon Update from card
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-addon-update-single');
    if (!btn) return;
    e.stopPropagation();

    const name = btn.getAttribute('data-name');
    const url = btn.getAttribute('data-url');
    const modId = btn.getAttribute('data-modid');
    const ver = btn.getAttribute('data-ver');
    const fileId = btn.getAttribute('data-fileid');

    showToast(T('toast_updating_one', { name, version: ver }), 'info');
    try {
      const res = await fetch('/api/install-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadUrl: url, name, gameId: currentActiveGame, modId, version: ver, fileId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(T('toast_updated_one', { name }), 'success');
        availableAddonUpdates = availableAddonUpdates.filter(u => u.modId != modId);
        if (availableAddonUpdates.length === 0 && bulkUpdateBanner) bulkUpdateBanner.style.display = 'none';
        loadInstalledAddons();
      } else {
        throw new Error(data.code ? mensajeDeError(data) : (data.error || T('toast_update_one_error', { message: '' })));
      }
    } catch (err) {
      showToast(T('toast_update_one_error', { message: err.message }), 'error');
    }
  });

  // --- Addon Profiles Export / Import ---
  const btnExportProfile = document.getElementById('btnExportProfile');
  const exportProfileModal = document.getElementById('exportProfileModal');
  const exportProfileTitle = document.getElementById('exportProfileTitle');
  const exportProfileCode = document.getElementById('exportProfileCode');
  const btnCloseExportModal = document.getElementById('btnCloseExportModal');
  const btnDismissExport = document.getElementById('btnDismissExport');
  const btnCopyProfileCode = document.getElementById('btnCopyProfileCode');

  const btnImportProfile = document.getElementById('btnImportProfile');
  const importProfileModal = document.getElementById('importProfileModal');
  const btnCloseImportModal = document.getElementById('btnCloseImportModal');
  const btnDismissImport = document.getElementById('btnDismissImport');
  const importInputPhase = document.getElementById('importInputPhase');
  const importProfileInput = document.getElementById('importProfileInput');
  const btnAnalyzeProfile = document.getElementById('btnAnalyzeProfile');
  const importAnalysisPhase = document.getElementById('importAnalysisPhase');
  const profileAnalysisSummary = document.getElementById('profileAnalysisSummary');
  const profileMissingList = document.getElementById('profileMissingList');
  const btnInstallMissingAddons = document.getElementById('btnInstallMissingAddons');
  const importProgressWrap = document.getElementById('importProgressWrap');
  const importProgressFill = document.getElementById('importProgressFill');
  const importProgressInfo = document.getElementById('importProgressInfo');

  let currentAnalyzedProfile = null;

  // Exporta el pack: reutilizable al repintar (el título por defecto se traduce)
  let lastExportProfile = null;

  async function exportProfile() {
    try {
      const title = exportProfileTitle?.value || T('pack_default_title', { game: gameLabel(currentActiveGame) });
      const res = await fetch(`/api/profiles/export?gameId=${encodeURIComponent(currentActiveGame)}&title=${encodeURIComponent(title)}`);
      const data = await res.json();

      if (data.code && exportProfileCode) {
        lastExportProfile = data.profile;
        exportProfileCode.value = data.code;
        if (exportProfileTitle) exportProfileTitle.value = data.profile.title;
        if (exportProfileModal) exportProfileModal.style.display = 'flex';
      }
    } catch (err) {
      showToast(T('toast_pack_error', { message: err.message }), 'error');
    }
  }

  btnExportProfile?.addEventListener('click', exportProfile);

  const closeExportModal = () => { if (exportProfileModal) exportProfileModal.style.display = 'none'; };
  btnCloseExportModal?.addEventListener('click', closeExportModal);
  btnDismissExport?.addEventListener('click', closeExportModal);
  btnCopyProfileCode?.addEventListener('click', () => {
    if (exportProfileCode) {
      navigator.clipboard.writeText(exportProfileCode.value);
      showToast(T('toast_pack_copied'), 'success');
    }
  });

  btnImportProfile?.addEventListener('click', () => {
    if (importProfileInput) importProfileInput.value = '';
    if (importInputPhase) importInputPhase.style.display = 'block';
    if (importAnalysisPhase) importAnalysisPhase.style.display = 'none';
    if (btnInstallMissingAddons) btnInstallMissingAddons.style.display = 'none';
    if (importProgressWrap) importProgressWrap.style.display = 'none';
    currentAnalyzedProfile = null;
    if (importProfileModal) importProfileModal.style.display = 'flex';
  });

  const closeImportModal = () => { if (importProfileModal) importProfileModal.style.display = 'none'; };
  btnCloseImportModal?.addEventListener('click', closeImportModal);
  btnDismissImport?.addEventListener('click', closeImportModal);

  btnAnalyzeProfile?.addEventListener('click', async () => {
    const raw = importProfileInput?.value?.trim();
    if (!raw) {
      showToast(T('toast_need_code'), 'warning');
      return;
    }

    try {
      const res = await fetch('/api/profiles/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: raw, gameId: currentActiveGame })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.code ? mensajeDeError(data) : (data.error || T('toast_pack_analyze_error', { message: '' })));

      currentAnalyzedProfile = data.analysis;
      if (importInputPhase) importInputPhase.style.display = 'none';
      if (importAnalysisPhase) importAnalysisPhase.style.display = 'block';

      renderProfileAnalysis(data.analysis);
    } catch (err) {
      showToast(T('toast_pack_analyze_error', { message: err.message }), 'error');
    }
  });

  // Pinta el resumen del pack analizado (se repinta al cambiar de idioma)
  function renderProfileAnalysis(analysis) {
    if (!analysis) return;

    if (profileAnalysisSummary) {
      profileAnalysisSummary.innerHTML = `
        <strong>📦 ${analysis.title}</strong> (${analysis.gameName})<br>
        <span style="font-size: 0.82rem; opacity: 0.9;">
          ${T('pack_summary_total', { total: analysis.totalCount })} |
          ${T('pack_summary_have', { count: analysis.alreadyInstalledCount })} |
          <strong>${T('pack_summary_missing', { count: analysis.missingCount })}</strong>
        </span>
      `;
    }

    if (!profileMissingList) return;

    if (analysis.missingCount === 0) {
      profileMissingList.innerHTML = `<div style="color: #4ade80; padding: 10px;">${T('pack_all_installed')}</div>`;
      if (btnInstallMissingAddons) btnInstallMissingAddons.style.display = 'none';
      return;
    }

    profileMissingList.innerHTML = analysis.missing.map(m => `
      <div style="padding: 6px 4px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05);">
        <div>
          <strong>${m.title || m.name}</strong>
          <span style="font-size: 0.75rem; color: #94a3b8; margin-left: 6px;">v${m.version || '1.0.0'}</span>
        </div>
        <span style="font-size: 0.72rem; color: ${m.canInstall ? '#fbbf24' : '#f87171'};">
          ${m.canInstall ? T('pack_ready') : T('pack_manual')}
        </span>
      </div>
    `).join('');
    if (btnInstallMissingAddons) btnInstallMissingAddons.style.display = 'inline-flex';
  }

  btnInstallMissingAddons?.addEventListener('click', async () => {
    if (!currentAnalyzedProfile || !currentAnalyzedProfile.missing || currentAnalyzedProfile.missing.length === 0) return;

    btnInstallMissingAddons.disabled = true;
    if (importProgressWrap) importProgressWrap.style.display = 'block';
    if (importProgressFill) importProgressFill.style.width = '20%';
    if (importProgressInfo) importProgressInfo.textContent = T('pack_installing');

    try {
      const res = await fetch('/api/profiles/install-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missingAddons: currentAnalyzedProfile.missing,
          gameId: currentActiveGame
        })
      });

      const data = await res.json();
      if (importProgressFill) importProgressFill.style.width = '100%';
      if (importProgressInfo) importProgressInfo.textContent = T('toast_pack_installed', { count: data.installedCount });

      showToast(T('toast_pack_installed_toast', { count: data.installedCount }), 'success');
      setTimeout(() => {
        closeImportModal();
        loadInstalledAddons();
      }, 1000);
    } catch (err) {
      showToast(T('toast_pack_install_error', { message: err.message }), 'error');
      btnInstallMissingAddons.disabled = false;
    }
  });

  // --- Repintado completo al cambiar de idioma --------------------------
  // Se ejecuta después de que i18n.js haya traducido el HTML estático: aquí se
  // vuelve a pintar TODO lo que app.js genera por su cuenta.
  function refrescarTextosDinamicos() {
    // 0. Interfaz nativa (bandeja del sistema) al mismo idioma
    if (window.electronAPI && typeof window.electronAPI.setLanguage === 'function' && window.I18N) {
      try { window.electronAPI.setLanguage(window.I18N.getLanguage()); } catch (_) {}
    }

    // 1. Subtítulos con el nombre del cliente activo
    const addonsSub = document.getElementById('addonsSubtitle');
    if (addonsSub) addonsSub.textContent = T('addons_subtitle', { game: gameLabel(currentActiveGame) });
    const backupsSub = document.querySelector('#pane-backups .page-subtitle');
    if (backupsSub) backupsSub.textContent = T('vault_subtitle_game', { game: gameLabel(currentActiveGame) });

    // 2. Listas
    const activePill = document.querySelector('.filter-pills .pill.active');
    const filter = activePill ? activePill.getAttribute('data-filter') : 'all';
    if (addonsGrid) renderInstalledAddons(filter, document.getElementById('searchInput')?.value || '');
    if (favoritesTabGrid) renderFavoritesTab(favSearchInput ? favSearchInput.value : '');
    if (gamesManagementList && Object.keys(currentGamesData).length) {
      renderGamesManagement(currentGamesData, currentActiveGame);
    }

    // 3. Tarjetas del catálogo (o de favoritos, según lo último consultado)
    if (cfResultsGrid) {
      if (lastCatalogMode === 'favorites' && lastCatalogResults.length === 0) {
        renderFavoritesCatalog(cfSearchInput ? cfSearchInput.value : '');
      } else if (lastCatalogResults.length > 0) {
        cfResultsInfo.textContent = lastCatalogMode === 'favorites'
          ? T('results_favorites', { count: lastCatalogResults.length })
          : (cfSearchInput && cfSearchInput.value.trim()
              ? T('results_for', { query: cfSearchInput.value.trim() })
              : T('results_featured'));
        renderCatalogCards(lastCatalogResults);
      }
    }

    // 4. Bóveda
    if (backupsList) loadBackups();

    // 5. Ficha abierta
    if (cfDetailView && cfDetailView.style.display !== 'none' && currentDetailMod) {
      renderDetailHero(currentDetailMod, findInstalledAddon(currentDetailMod));
      renderDetailGallery(currentDetailMod);
      if (lastDetailFiles.length) renderDetailFiles(lastDetailFiles, lastDetailAddonName);
      if (detailHtmlBody) {
        detailHtmlBody.innerHTML = (isTranslated && currentTranslatedDesc) ? currentTranslatedDesc : (currentOriginalDesc || `<p>${T('detail_loading_desc')}</p>`);
      }
      updateTranslateButtonUI(false, isTranslated);
      setAddressBar('📦', T('topbar_addon', { name: currentDetailMod.name }));
    } else {
      // Sin ensuciar el historial: solo se repinta la barra de dirección
      const activeTabEl = document.querySelector('.nav-item.active');
      const curTab = activeTabEl ? activeTabEl.getAttribute('data-tab') : 'search';
      const bar = addressBarFor(curTab);
      setAddressBar(bar.icon, bar.text);
    }

    // 6. Botón de versión del menú lateral
    if (appUpdateData && appUpdateData.updateAvailable) {
      pintarBotonVersion('update', versionInstalada, appUpdateData.remoteVersion);
    } else if (btnAppUpdate && btnAppUpdate.style.display !== 'none') {
      pintarBotonVersion('latest', versionInstalada);
    }

    // 7. Modales abiertos
    if (updateModal && updateModal.style.display === 'flex') abrirModalActualizacion();
    if (importAnalysisPhase && importAnalysisPhase.style.display !== 'none' && currentAnalyzedProfile) {
      renderProfileAnalysis(currentAnalyzedProfile);
    }
    if (bulkUpdateSummary && bulkUpdateBanner && bulkUpdateBanner.style.display !== 'none') {
      bulkUpdateSummary.textContent = T('bulk_summary_count', { count: availableAddonUpdates.length });
    }
  }

  // App Initialization
  async function initApp() {
    pushNavState({ type: 'tab', tabId: 'search' });
    try {
      await loadConfig();
    } catch (err) {
      console.error('Error cargando configuración:', err);
    }
    try {
      await loadFavorites();
    } catch (err) {
      console.error('Error cargando favoritos:', err);
    }
    updateFiltersUI();
    try {
      await loadInstalledAddons();
    } catch (err) {
      console.error('Error cargando addons instalados:', err);
    }
    triggerCurseForgeSearch();
    // Botón de versión del menú lateral: primero la versión local (instantánea),
    // después se comprueba GitHub y, si hay una nueva, el botón se enciende.
    if (window.electronAPI && typeof window.electronAPI.getAppVersion === 'function') {
      try {
        versionInstalada = String((await window.electronAPI.getAppVersion()) || '');
        pintarBotonVersion('latest', versionInstalada);
        const aboutVer = document.getElementById('aboutVersionVal');
        if (aboutVer) aboutVer.textContent = versionLimpia(versionInstalada);
      } catch (_) {}
    }
    checkAppUpdates();
  }
  initApp();
});
