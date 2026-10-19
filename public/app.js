// KoRForge Client Application Logic
document.addEventListener('DOMContentLoaded', () => {
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
      const match = pill.getAttribute('data-game-id') === gameId;
      pill.classList.toggle('active', match);
    });
  }

  // Application Data State
  let favoriteMods = [];
  let installedAddons = [];
  let availableAddonUpdates = [];

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

  function switchTabInternal(tabId) {
    navItems.forEach(i => i.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));

    const targetNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    const targetPane = document.getElementById(`pane-${tabId}`);
    if (targetNav) targetNav.classList.add('active');
    if (targetPane) targetPane.classList.add('active');

    const labels = {
      search: { icon: '🔍', text: window.I18N ? window.I18N.t('topbar_search', 'KoRForge / Search Addons') : 'KoRForge / Search Addons' },
      addons: { icon: '📦', text: window.I18N ? window.I18N.t('topbar_installed', 'KoRForge / Installed Addons') : 'KoRForge / Installed Addons' },
      favorites: { icon: '⭐', text: window.I18N ? window.I18N.t('topbar_favorites', 'KoRForge / Favorite Addons') : 'KoRForge / Favorite Addons' },
      backups: { icon: '💾', text: window.I18N ? window.I18N.t('topbar_backups', 'KoRForge / WTF Vault') : 'KoRForge / WTF Vault' },
      settings: { icon: '⚙️', text: window.I18N ? window.I18N.t('topbar_settings', 'KoRForge / Settings') : 'KoRForge / Settings' }
    };
    const current = labels[tabId] || { icon: '🔍', text: `KoRForge / ${tabId}` };
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
      if (detectedPathEl) detectedPathEl.textContent = currentGamesData[currentActiveGame]?.path || data.wowDir || 'No configurado';
      if (rootWoWPath) rootWoWPath.value = data.rootWoWDir || '';

      if (settingAutoStart) settingAutoStart.checked = !!data.autoStart;
      if (settingStartMinimized) settingStartMinimized.checked = !!data.startMinimized;
      if (settingCloseToTray) settingCloseToTray.checked = data.closeToTray !== false;

      const appLang = data.language || 'en';
      if (window.I18N) {
        window.I18N.initLanguage(appLang);
      }
      const settingAppLanguage = document.getElementById('settingAppLanguage');
      if (settingAppLanguage) {
        settingAppLanguage.value = window.I18N ? window.I18N.getLanguage() : appLang;
      }

      renderGamesManagement(currentGamesData, currentActiveGame);
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

      item.innerHTML = `
        <div class="game-manage-top">
          <div class="game-manage-badge">
            <span class="game-manage-icon">${g.icon}</span>
            <div>
              <h4 class="game-manage-title">${g.name}</h4>
              <span class="game-manage-sub">${g.subtitle} • Carpeta típica: <code>${g.subfolder}</code></span>
            </div>
          </div>
          <div class="game-manage-actions-top">
            ${isActive ? `<span class="active-pill-tag">● Cliente Activo</span>` : `<button class="btn btn-secondary btn-sm btn-activate-game" data-game-id="${g.id}">⚡ Usar como Activo</button>`}
          </div>
        </div>
        <div class="game-manage-input-row">
          <input type="text" class="game-path-input" data-game-id="${g.id}" value="${g.path || ''}" placeholder="Ej: C:\\World of Warcraft\\${g.subfolder}">
          <button class="btn btn-primary btn-sm btn-save-game-path" data-game-id="${g.id}">Guardar</button>
          <button class="btn btn-secondary btn-sm btn-open-game-folder" data-game-id="${g.id}">📁 Abrir</button>
        </div>
        <div class="game-manage-status">
          <span class="pulse-dot ${g.addonsExists ? '' : 'error'}"></span>
          <span class="status-txt ${g.addonsExists ? 'connected' : (g.folderExists ? 'warning' : '')}">
            ${g.addonsExists ? `Conectado a Interface/AddOns (${g.path})` : (g.folderExists ? `Carpeta detectada (${g.path}), pero no tiene Interface/AddOns todavía` : 'Ruta no configurada o no encontrada')}
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
        showToast(`Abriendo carpeta de ${g.name}`);
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
        if (detectedPathEl) detectedPathEl.textContent = activeGameObj?.path || 'No configurado';

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
        const addonsSub = document.querySelector('#pane-addons .page-subtitle');
        if (addonsSub) {
          addonsSub.textContent = `Addons detectados en tiempo real en tu carpeta de ${activeGameObj?.name || gameId}.`;
        }
        const backupsSub = document.querySelector('#pane-backups .page-subtitle');
        if (backupsSub) {
          backupsSub.textContent = `Snapshots limpios de configuración para ${activeGameObj?.name || gameId}.`;
        }

        // Re-run search with new game version
        triggerCurseForgeSearch();

        showToast(`🎮 Cliente activo cambiado a: ${activeGameObj?.name || gameId}`);
      }
    } catch (err) {
      showToast(`Error al cambiar juego activo: ${err.message}`, 'error');
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
          if (detectedPathEl) detectedPathEl.textContent = newPath || 'No configurado';
          await loadInstalledAddons(true);
        }
        showToast('Ruta guardada y verificada');
      }
    } catch (err) {
      showToast(`Error guardando ruta: ${err.message}`, 'error');
    }
  }

  // Auto-Detect Game Versions Handler
  btnAutoDetectGames?.addEventListener('click', async () => {
    const rootDir = rootWoWPath ? rootWoWPath.value.trim() : '';
    if (!rootDir) {
      showToast('Introduce una carpeta raíz para escanear', 'error');
      return;
    }
    btnAutoDetectGames.disabled = true;
    btnAutoDetectGames.textContent = 'Buscando...';

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
          showToast(`¡Auto-detección completada! ${count} cliente(s) detectado(s): ${names}`);
        } else {
          showToast('No se encontraron carpetas típicas (_forever_, _retail_...). Puedes configurar las rutas abajo.', 'warning');
        }

        const activeGameObj = currentGamesData[currentActiveGame];
        if (detectedPathEl) detectedPathEl.textContent = activeGameObj?.path || 'No configurado';
        await loadInstalledAddons();
      } else {
        throw new Error(data.error || 'Error en auto-detección');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnAutoDetectGames.disabled = false;
      btnAutoDetectGames.textContent = '🔍 Auto-detectar Clientes';
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
        showToast(`Ajuste guardado: ${label}`);
      }
    } catch (err) {
      showToast(`Error guardando ajuste: ${err.message}`, 'error');
    }
  }

  settingAutoStart?.addEventListener('change', () => {
    updateSetting({ autoStart: settingAutoStart.checked }, 'Arrancar con Windows');
  });
  settingStartMinimized?.addEventListener('change', () => {
    updateSetting({ startMinimized: settingStartMinimized.checked }, 'Arrancar en segundo plano');
  });
  settingCloseToTray?.addEventListener('change', () => {
    updateSetting({ closeToTray: settingCloseToTray.checked }, 'Minimizar a la bandeja al pulsar Cerrar');
  });

  const settingAppLanguage = document.getElementById('settingAppLanguage');
  settingAppLanguage?.addEventListener('change', async () => {
    const lang = settingAppLanguage.value;
    if (window.I18N) {
      window.I18N.setLanguage(lang);
    }
    await updateSetting({ language: lang }, 'Language / Idioma');
  });

  window.addEventListener('korforge:languageChanged', () => {
    const activeTabEl = document.querySelector('.nav-item.active');
    const curTab = activeTabEl ? activeTabEl.getAttribute('data-tab') : 'search';
    switchTabInternal(curTab);
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
      showToast(data.isFavorite ? `★ "${mod.name}" añadido a Favoritos` : `"${mod.name}" quitado de Favoritos`);
      return data.isFavorite;
    } catch (err) {
      showToast('Error al actualizar favoritos', 'error');
      return false;
    }
  }

  function isModFavorite(modId) {
    if (!Array.isArray(favoriteMods)) return false;
    return favoriteMods.some(f => f && f.id === modId);
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
      const activeGameObj = currentGamesData[currentActiveGame];
      favoritesTabGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <span class="empty-icon">⭐</span>
          <h3 class="empty-title">${favoriteMods.length === 0 ? `No tienes addons en favoritos para ${activeGameObj?.name || 'este juego'}` : 'No se encontraron favoritos con ese filtro'}</h3>
          <p class="empty-desc">
            ${favoriteMods.length === 0 
              ? 'Guarda los addons que más te gusten pulsando la estrella dorada en cualquier tarjeta del catálogo para tenerlos aquí organizados.' 
              : 'Prueba con otra palabra clave en el buscador.'}
          </p>
          ${favoriteMods.length === 0 ? `<button class="btn btn-primary" id="btnGoExploreFromEmptyFav">⚡ Abrir Explorador de Addons</button>` : ''}
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
      showToast('Carpeta abierta en el Explorador de Windows');
    } catch (_) {
      showToast('Error al abrir la carpeta de addons', 'error');
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
      const addonsSub = document.querySelector('#pane-addons .page-subtitle');
      if (addonsSub) {
        addonsSub.textContent = `Addons detectados en tiempo real en tu carpeta de ${activeGameObj?.name || g}.`;
      }

      renderInstalledAddons();
      if (notify) showToast(`Escaneo completado: ${installedAddons.length} addons`);
    } catch (err) {
      console.error('Error escaneando addons:', err);
      showToast('Error al escanear la carpeta de addons', 'error');
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
      const activeGameObj = currentGamesData[currentActiveGame];
      addonsGrid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📁</span>
          <h3 class="empty-title">Ruta no configurada para ${activeGameObj?.name || currentActiveGame}</h3>
          <p class="empty-desc">
            No has configurado la carpeta de instalación para este cliente de juego.<br>
            Añade la ruta en la pestaña de Configuración para poder gestionar e instalar addons aquí.
          </p>
          <button class="btn btn-primary" id="btnGoToSettingsFromAddons">⚙️ Abrir Configuración</button>
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
      const activeGameObj = currentGamesData[currentActiveGame];
      addonsGrid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🛡️</span>
          <h3 class="empty-title">${installedAddons.length === 0 ? `La forja está vacía para ${activeGameObj?.name || currentActiveGame}` : 'No hay addons con ese filtro'}</h3>
          <p class="empty-desc">
            ${installedAddons.length === 0 
              ? 'No tienes ningún addon instalado en este cliente de WoW. Explora el Explorador de Addons para equiparte en un clic.' 
              : 'Prueba a buscar con otro término o limpia los filtros.'}
          </p>
          ${installedAddons.length === 0 ? `<button class="btn btn-primary" id="btnGoToSearch">⚡ Abrir Explorador de Addons</button>` : ''}
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
      const compatHtml = compat ? `<span class="compat-badge ${compat.status}" title="${compat.label}">${compat.badge}</span>` : '';
      const missingDepsHtml = (addon.missingDependencies && addon.missingDependencies.length > 0)
        ? `<div class="missing-deps-alert" title="Faltan librerías requeridas en Interface/AddOns">⚠️ Requiere: <strong>${addon.missingDependencies.join(', ')}</strong></div>`
        : '';
      const updateInfo = (availableAddonUpdates || []).find(u => (addon.modId && u.modId === addon.modId) || u.folderName === addon.folderName);
      const updatePillHtml = updateInfo ? `
        <span class="addon-card-update-pill" title="Actualización a ${updateInfo.newVersion} disponible">⚡ v${updateInfo.newVersion}</span>
        <button class="btn-card-update btn-addon-update-single" data-modid="${updateInfo.modId}" data-url="${updateInfo.downloadUrl}" data-name="${addon.title}" data-ver="${updateInfo.newVersion}" data-fileid="${updateInfo.newFileId || ''}" title="Descargar e instalar actualización ahora">⚡ Actualizar</button>
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
                <label class="switch" title="${addon.enabled ? 'Desactivar addon' : 'Activar addon'}">
                  <input type="checkbox" ${addon.enabled ? 'checked' : ''} data-folder="${addon.folderName}">
                  <span class="slider"></span>
                </label>
              </div>
            </div>
            <div class="cf-card-sub">
              <div class="card-version-tag installed" title="Versión instalada: ${addon.version}">
                <span class="ver-label">Ver:</span> <span class="ver-val">${prefixV}${dispAddonVer}</span>
              </div>
              ${compatHtml}
              ${updatePillHtml}
            </div>
            <p class="cf-summary" title="${addon.notes || ''}">${addon.notes || 'Addon instalado en World of Warcraft.'}</p>
            ${missingDepsHtml}
          </div>
          <div class="cf-card-bottom">
            <div class="cf-card-meta-col">
              <div class="cf-card-stats">
                <span class="installed-folder-tag" title="Carpeta en Interface/AddOns">📁 <code>${addon.folderName}</code></span>
                ${addon.dependencies && addon.dependencies.length > 0 ? `<span class="installed-deps-tag" title="Librerías / Dependencias: ${addon.dependencies.join(', ')}">🔗 ${addon.dependencies.join(', ')}</span>` : ''}
              </div>
            </div>
            <div class="installed-card-actions">
              ${updateInfo ? `<button class="btn-card-update-action btn-addon-update-single" data-modid="${updateInfo.modId}" data-url="${updateInfo.downloadUrl}" data-name="${addon.title}" data-ver="${updateInfo.newVersion}" data-fileid="${updateInfo.newFileId || ''}" title="Actualizar ${addon.title} a ${updateInfo.newVersion}">⚡ Actualizar</button>` : ''}
              <button class="installed-btn-action btn-addon-folder" data-folder="${addon.folderName}" title="Abrir carpeta Interface/AddOns/${addon.folderName} en el Explorador de Windows">
                <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="installed-btn-action btn-addon-trash" data-folder="${addon.folderName}" data-title="${addon.title}" title="Desinstalar addon">
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
            showToast(`${addon.title} ${resData.enabled ? 'activado' : 'desactivado'}`);
            loadInstalledAddons();
          }
        } catch (err) {
          showToast('Error al cambiar estado del addon', 'error');
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
          showToast(`Carpeta de "${addon.title}" abierta en el Explorador`);
        } catch (err) {
          showToast('Error al abrir carpeta del addon', 'error');
        }
      });

      // 4. Uninstall Button
      const btnUninstall = card.querySelector('.btn-addon-trash');
      btnUninstall?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`¿Seguro que deseas desinstalar "${addon.title}" de tu juego?\n\nSe eliminará la carpeta Interface/AddOns/${addon.folderName}.`)) return;
        try {
          const res = await fetch(`/api/addons/${encodeURIComponent(addon.folderName)}?gameId=${encodeURIComponent(currentActiveGame)}`, {
            method: 'DELETE'
          });
          const resData = await res.json();
          if (resData.deleted) {
            showToast(`"${addon.title}" desinstalado`);
            loadInstalledAddons();
          }
        } catch (err) {
          showToast('Error al desinstalar addon', 'error');
        }
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
      pill.innerHTML = `<span>${f.name}</span><button data-id="${f.id}" title="Quitar filtro">✕</button>`;
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
    if (optRelevance) optRelevance.textContent = 'Destacados (Featured)';
    cfSortSelect.value = '2|desc';
    updateFiltersUI();
    triggerCurseForgeSearch();
    showToast('Filtros y búsqueda restablecidos', 'success');
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
      optRelevance.textContent = hasText ? 'Mejor coincidencia (Relevancia)' : 'Destacados (Featured)';
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
        <h3 class="empty-title">Explorando addons...</h3>
        <p class="empty-desc">Consultando catálogo oficial con tus filtros aplicados.</p>
      </div>
    `;

    const filterLabels = [];
    if (activeFlavor?.name) filterLabels.push(`${activeFlavor.name}`);
    if (categories.length > 0) filterLabels.push(`Categoría: ${categories.map(c => c.name).join(', ')}`);

    let infoText = query ? `Resultados para "${query}"` : 'Addons destacados';
    if (filterLabels.length > 0) infoText += ` (${filterLabels.join(' • ')})`;
    cfResultsInfo.textContent = infoText;

    try {
      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();
      const results = data.results || [];

      if (results.length === 0) {
        cfResultsGrid.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">🔎</span>
            <h3 class="empty-title">Sin resultados para esta combinación</h3>
            <p class="empty-desc">Prueba a desmarcar alguna categoría o buscar un término más amplio.</p>
          </div>
        `;
        return;
      }

      renderCatalogCards(results);
    } catch (err) {
      console.error('Error al consultar addons:', err);
      cfResultsGrid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">⚠️</span>
          <h3 class="empty-title">Error al consultar addons</h3>
          <p class="empty-desc">${err.message}</p>
        </div>
      `;
    }
  }

  function renderFavoritesCatalog(query = '') {
    const term = query.toLowerCase().trim();
    const filtered = favoriteMods.filter(f => 
      !term || f.name.toLowerCase().includes(term) || f.summary.toLowerCase().includes(term)
    );

    cfResultsInfo.textContent = `Mis Favoritos guardados (${filtered.length})`;

    if (filtered.length === 0) {
      cfResultsGrid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">⭐</span>
          <h3 class="empty-title">No tienes favoritos guardados todavía</h3>
          <p class="empty-desc">Haz clic en la estrella ★ de cualquier tarjeta o dentro de su página para guardarlo aquí.</p>
        </div>
      `;
      return;
    }

    renderCatalogCards(filtered);
  }

  // Format relative date helper
  function formatRelativeDate(isoStr) {
    if (!isoStr) return '';
    try {
      const date = new Date(isoStr);
      const now = new Date();
      const diffMs = now - date;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffHours < 1) return 'hace unos minutos';
      if (diffHours < 24) return `hace ${diffHours}h`;
      if (diffDays === 1) return 'ayer';
      if (diffDays < 30) return `hace ${diffDays}d`;
      if (diffDays < 365) return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
      return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) {
      return '';
    }
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
          <span class="cf-ver-pill cf-ver-avail" title="Versión disponible en el catálogo: ${availVer}">
            <span class="ver-lbl">Versión:</span>
            <span class="ver-val">${dispAvailVer}</span>
          </span>
        `;
      }

      let myVerPill = '';
      if (isInstalled) {
        const myVer = (installedMatch.version && installedMatch.version !== 'N/A') ? installedMatch.version : 'Instalado';
        const dispMyVer = formatVersionDisplay(myVer);
        const hasUpdate = !!(availVer && myVer && myVer !== 'Instalado' && availVer !== myVer && !availVer.includes(myVer) && !myVer.includes(availVer));
        myVerPill = `
          <span class="cf-ver-pill cf-ver-mine ${hasUpdate ? 'has-update' : ''}" title="${hasUpdate ? `Actualización disponible: ${availVer} (tienes ${myVer})` : `Instalado en tu cliente: ${myVer}`}">
            <span class="ver-lbl">${hasUpdate ? 'Tu ver:' : '✓ Tu ver:'}</span>
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
        <img class="cf-logo" src="${mod.iconUrl || 'favicon.png'}" alt="${mod.name}" onerror="this.src='favicon.png'">
        <div class="cf-card-content">
          <div class="cf-card-main">
            <div class="cf-card-top">
              <h4 class="cf-title" title="${mod.name}">${mod.name}</h4>
              <button class="btn-card-fav ${isFav ? 'is-fav' : ''}" data-id="${mod.id}" title="${isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}">
                <svg class="fav-star-icon" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>
            </div>
            <div class="cf-card-sub">
              <span class="cf-author">por ${mod.author}${mod.categories && mod.categories[0] ? ` <span style="color:var(--text-faint); font-weight:normal;">• ${mod.categories[0].name}</span>` : ''}</span>
            </div>
            <p class="cf-summary" title="${mod.summary || ''}">${mod.summary || 'Sin descripción disponible.'}</p>
          </div>
          <div class="cf-card-bottom">
            <div class="cf-card-meta-col">
              ${versionsRowHtml}
              <div class="cf-card-stats">
                <span class="cf-downloads">📥 ${Number(mod.downloadCount || 0).toLocaleString()}</span>
                ${updatedText ? `<span class="cf-updated" title="Actualizado: ${new Date(mod.dateModified).toLocaleString('es-ES')}">• 🕒 ${updatedText}</span>` : ''}
              </div>
            </div>
            <button class="btn-install-cf ${isInstalled ? 'installed' : ''}" data-id="${mod.id}" data-name="${mod.name}">
              ${isInstalled ? '✓ Instalado' : '⚡ Instalar'}
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
        btnFav.title = newFavState ? 'Quitar de favoritos' : 'Añadir a favoritos';

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
          btnInstall.textContent = '⏳ Descargando...';

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
              btnInstall.textContent = '✓ Instalado';
              showToast(`¡"${mod.name}" instalado en Interface/AddOns!`);
              await loadInstalledAddons();

              // Update version badge dynamically on card: remove from cf-card-sub and place beside VERSIÓN in cf-card-versions-row
              const oldSubTag = card.querySelector('.cf-card-sub .card-version-tag');
              if (oldSubTag) oldSubTag.remove();

              const refreshedMatch = findInstalledAddon(mod);
              const installedVer = (refreshedMatch && refreshedMatch.version !== 'N/A') ? refreshedMatch.version : 'Instalado';

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

                const hasUpdate = !!(availVer && installedVer && installedVer !== 'Instalado' && availVer !== installedVer && !availVer.includes(installedVer) && !installedVer.includes(availVer));
                const dispInstalledVer = formatVersionDisplay(installedVer);
                const myPillEl = document.createElement('span');
                myPillEl.className = `cf-ver-pill cf-ver-mine ${hasUpdate ? 'has-update' : ''}`;
                myPillEl.title = hasUpdate ? `Actualización disponible: ${availVer} (tienes ${installedVer})` : `Instalado en tu cliente: ${installedVer}`;
                myPillEl.innerHTML = `
                  <span class="ver-lbl">${hasUpdate ? 'Tu ver:' : '✓ Tu ver:'}</span>
                  <span class="ver-val">${dispInstalledVer}</span>
                `;
                versionsRow.appendChild(myPillEl);
              }
            } else {
              throw new Error(installData.error || 'Error al instalar');
            }
          } catch (err) {
            btnInstall.classList.remove('loading');
            btnInstall.textContent = 'Reintentar';
            showToast(`Error: ${err.message}`, 'error');
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
    setAddressBar('⚡', 'KoRForge / Explorador de Addons');
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
      btnTranslateToggle.innerHTML = '<span class="translate-icon">⏳</span><span class="translate-label">Traduciendo...</span>';
    } else if (translated) {
      btnTranslateToggle.classList.remove('loading');
      btnTranslateToggle.classList.add('translated');
      btnTranslateToggle.innerHTML = '<span class="translate-icon">🇬🇧</span><span class="translate-label">Ver Original (EN)</span>';
    } else {
      btnTranslateToggle.classList.remove('loading', 'translated');
      btnTranslateToggle.innerHTML = '<span class="translate-icon">🇪🇸</span><span class="translate-label">Traducir a Español</span>';
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
        showToast('Descripción mostrada en español');
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
          showToast('¡Addon traducido al español!');
        } else {
          throw new Error(data.error || 'Fallo al traducir');
        }
      } catch (err) {
        updateTranslateButtonUI(false, false);
        showToast(`Error al traducir: ${err.message}`, 'error');
      }
    } else {
      isTranslated = false;
      detailHtmlBody.innerHTML = currentOriginalDesc;
      if (heroSummaryEl) heroSummaryEl.textContent = currentOriginalSummary;
      updateTranslateButtonUI(false, false);
      showToast('Mostrando descripción original en inglés');
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

    // Ensure search tab is active in sidebar
    navItems.forEach(i => i.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));
    document.querySelector('.nav-item[data-tab="search"]')?.classList.add('active');
    document.getElementById('pane-search')?.classList.add('active');

    setAddressBar('📦', `KoRForge / Addons / ${modName || 'Detalles'}`);

    // Reset Tabs
    detailTabsBtns.forEach(b => b.classList.remove('active'));
    detailTabContents.forEach(c => c.classList.remove('active'));
    document.querySelector('.detail-tab-btn[data-detail-tab="desc"]')?.classList.add('active');
    document.getElementById('detailTabDesc')?.classList.add('active');

    detailHeroCard.innerHTML = `
      <div class="empty-state" style="width:100%;">
        <span class="empty-icon">⏳</span>
        <h3 class="empty-title">Cargando detalles de ${modName || 'Addon'}...</h3>
      </div>
    `;
    detailHtmlBody.innerHTML = '<p>Cargando descripción oficial...</p>';
    detailFilesList.innerHTML = '<p>Consultando versiones disponibles...</p>';
    detailGalleryGrid.innerHTML = '';

    try {
      // 1. Fetch Mod Details
      const res = await fetch(`/api/mod/${modId}`);
      const data = await res.json();
      const mod = data.mod;
      currentDetailMod = mod;

      setAddressBar('📦', `KoRForge / Addons / ${mod.name}`);

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

      const isFav = isModFavorite(mod.id);
      btnDetailToggleFav.className = `btn btn-secondary btn-fav-detail ${isFav ? 'is-fav' : ''}`;
      btnDetailToggleFav.innerHTML = `<span class="star-icon">${isFav ? '★' : '☆'}</span><span class="fav-label">${isFav ? 'En Favoritos' : 'Añadir a Favoritos'}</span>`;

      const installedMatch = findInstalledAddon(mod);
      const isInstalled = !!installedMatch;

      btnDetailInstall.className = `btn btn-gold btn-install-detail ${isInstalled ? 'installed' : ''}`;
      btnDetailInstall.textContent = isInstalled ? '✓ Ya Instalado' : '⚡ Instalar Última Versión';

      const availVer = formatVersionString(mod.version);
      const myVer = installedMatch ? ((installedMatch.version && installedMatch.version !== 'N/A') ? installedMatch.version : 'Instalado') : '';

      // Render Hero Card with Author Repo Links & Version details
      detailHeroCard.innerHTML = `
        <img class="detail-hero-logo" src="${mod.iconUrl || 'favicon.png'}" alt="${mod.name}" onerror="this.src='favicon.png'">
        <div class="detail-hero-info">
          <div>
            <h2 class="detail-hero-title">${mod.name}</h2>
            <div class="detail-hero-author">por <strong>${mod.author}</strong></div>
            <p class="detail-hero-summary" id="detailHeroSummary">${mod.summary}</p>
          </div>
          <div class="detail-hero-meta">
            <span class="meta-item">Descargas: <strong class="gold">${Number(mod.downloadCount).toLocaleString()}</strong></span>
            ${availVer ? `<span class="meta-item">Versión catálogo: <strong>${availVer}</strong></span>` : ''}
            ${isInstalled ? `<span class="meta-item">Tu versión instalada: <strong style="color:var(--status-green);">✓ ${myVer}</strong></span>` : ''}
            <span class="meta-item">Actualizado: <strong>${new Date(mod.dateModified).toLocaleDateString('es-ES')}</strong></span>
            <span class="meta-item">Creado: <strong>${new Date(mod.dateCreated).toLocaleDateString('es-ES')}</strong></span>
            ${mod.sourceUrl ? `<span class="meta-item"><a href="${mod.sourceUrl}" class="repo-link" title="Ver código fuente y repositorio oficial">📦 Repositorio / Código ↗</a></span>` : ''}
            ${mod.wikiUrl ? `<span class="meta-item"><a href="${mod.wikiUrl}" class="repo-link" title="Wiki oficial del autor">📖 Wiki ↗</a></span>` : ''}
            ${mod.issuesUrl ? `<span class="meta-item"><a href="${mod.issuesUrl}" class="repo-link" title="Rastreador de incidencias">🐛 Reportar Bug ↗</a></span>` : ''}
          </div>
        </div>
      `;

      // 2. Fetch Description
      fetch(`/api/mod/${modId}/description`)
        .then(r => r.json())
        .then(descData => {
          currentOriginalDesc = descData.html || '<p>No hay descripción disponible.</p>';
          detailHtmlBody.innerHTML = isTranslated && currentTranslatedDesc ? currentTranslatedDesc : currentOriginalDesc;
        })
        .catch(() => {
          detailHtmlBody.innerHTML = '<p>Error al cargar la descripción.</p>';
        });

      // 3. Fetch Files
      fetch(`/api/mod/${modId}/files`)
        .then(r => r.json())
        .then(filesData => {
          renderDetailFiles(filesData.files || [], mod.name);
        })
        .catch(() => {
          detailFilesList.innerHTML = '<p>Error cargando archivos.</p>';
        });

      // 4. Render Gallery / Screenshots
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
            <p class="empty-desc">Este addon no tiene capturas de pantalla registradas.</p>
          </div>
        `;
      }

    } catch (err) {
      console.error('Error cargando detalle:', err);
      detailHeroCard.innerHTML = `
        <div class="empty-state" style="width:100%;">
          <span class="empty-icon">⚠️</span>
          <h3 class="empty-title">Error al cargar el addon</h3>
          <p class="empty-desc">${err.message}</p>
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
    showToast('Abriendo enlace en tu navegador web externo');
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
  function renderDetailFiles(files, addonName) {
    if (files.length === 0) {
      detailFilesList.innerHTML = '<p>No se encontraron archivos descargables.</p>';
      return;
    }

    detailFilesList.innerHTML = '';
    files.forEach(f => {
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
            <span>${new Date(f.fileDate).toLocaleDateString('es-ES')}</span>
            <span>• ${f.fileLength}</span>
            <span>• 📥 ${Number(f.downloadCount).toLocaleString()}</span>
            <span>Versiones: ${versionsBadges}</span>
          </div>
        </div>
        <button class="btn btn-secondary btn-install-file" data-url="${f.downloadUrl}" data-name="${addonName}">
          ${isForever ? '⚡ Instalar (Forever)' : 'Instalar versión'}
        </button>
      `;

      const btnInst = item.querySelector('.btn-install-file');
      btnInst.addEventListener('click', async () => {
        btnInst.disabled = true;
        btnInst.textContent = 'Instalando...';

        try {
          const res = await fetch('/api/install-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ downloadUrl: f.downloadUrl, name: addonName, gameId: currentActiveGame })
          });
          const resData = await res.json();
          if (resData.success) {
            btnInst.textContent = '✓ Instalado';
            showToast(`¡"${addonName}" instalado en Interface/AddOns!`);
            loadInstalledAddons();
          } else {
            throw new Error(resData.error || 'Error al instalar');
          }
        } catch (err) {
          btnInst.disabled = false;
          btnInst.textContent = 'Reintentar';
          showToast(`Error: ${err.message}`, 'error');
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
    });
  });

  // Detail View Favorite Toggle
  btnDetailToggleFav?.addEventListener('click', async () => {
    if (!currentDetailMod) return;
    const isNowFav = await toggleFavorite(currentDetailMod);
    btnDetailToggleFav.className = `btn btn-secondary btn-fav-detail ${isNowFav ? 'is-fav' : ''}`;
    btnDetailToggleFav.innerHTML = `<span class="star-icon">${isNowFav ? '★' : '☆'}</span><span class="fav-label">${isNowFav ? 'En Favoritos' : 'Añadir a Favoritos'}</span>`;
  });

  // Detail View Install Latest
  btnDetailInstall?.addEventListener('click', async () => {
    if (!currentDetailMod) return;
    btnDetailInstall.disabled = true;
    btnDetailInstall.textContent = '⏳ Descargando...';

    try {
      const res = await fetch('/api/install-curseforge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modId: currentDetailMod.id, name: currentDetailMod.name, gameId: currentActiveGame })
      });
      const data = await res.json();
      if (data.success) {
        btnDetailInstall.textContent = '✓ Instalado con éxito';
        showToast(`¡"${currentDetailMod.name}" instalado en Interface/AddOns!`);
        loadInstalledAddons();
      } else {
        throw new Error(data.error || 'Error al instalar');
      }
    } catch (err) {
      btnDetailInstall.disabled = false;
      btnDetailInstall.textContent = 'Reintentar';
      showToast(`Error: ${err.message}`, 'error');
    }
  });

  // 5. Install from URL / GitHub
  btnInstallUrl?.addEventListener('click', async () => {
    const url = installUrlInput.value.trim();
    if (!url) return;

    btnInstallUrl.disabled = true;
    btnInstallUrl.textContent = 'Descargando...';

    const log = (msg, type = 'info') => {
      const line = document.createElement('div');
      line.className = `log-line ${type}`;
      line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      installConsole.appendChild(line);
      installConsole.scrollTop = installConsole.scrollHeight;
    };

    log(`Iniciando descarga de: ${url}`);

    try {
      const res = await fetch('/api/install-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, gameId: currentActiveGame })
      });

      const data = await res.json();
      if (data.success) {
        log(`✓ Instalación completada con éxito: ${data.installedFolders.join(', ')}`, 'info');
        showToast(`Instalado: ${data.installedFolders.join(', ')}`);
        installUrlInput.value = '';
        loadInstalledAddons();
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (err) {
      log(`❌ Error: ${err.message}`, 'error');
      showToast(err.message, 'error');
    } finally {
      btnInstallUrl.disabled = false;
      btnInstallUrl.textContent = 'Descargar e Instalar';
    }
  });

  // 6. Backups WTF
  async function loadBackups(gameId) {
    try {
      const g = gameId || currentActiveGame || 'forever';
      const res = await fetch(`/api/backups?gameId=${encodeURIComponent(g)}`);
      const data = await res.json();
      const backups = data.backups || [];
      backupsCountBadge.textContent = backups.length;

      const activeGameObj = currentGamesData[g];
      const backupsSub = document.querySelector('#pane-backups .page-subtitle');
      if (backupsSub) {
        backupsSub.textContent = `Snapshots limpios de configuración para ${activeGameObj?.name || g}.`;
      }

      backupsList.innerHTML = '';
      if (backups.length === 0) {
        backupsList.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">💾</span>
            <h3 class="empty-title">Sin backups para ${activeGameObj?.name || g}</h3>
            <p class="empty-desc">Crea un snapshot de tus macros y configuraciones antes de jugar.</p>
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
            <button class="card-btn btn-restore-backup" data-file="${b.fileName}">Restaurar</button>
            <button class="card-btn btn-danger btn-delete-backup" data-file="${b.fileName}">Borrar</button>
          </div>
        `;

        item.querySelector('.btn-restore-backup').addEventListener('click', async () => {
          if (!confirm(`¿Restaurar configuración desde "${b.fileName}"? Sobrescribirá tu carpeta WTF actual de ${activeGameObj?.name || g}.`)) return;
          try {
            const res = await fetch('/api/backups/restore', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileName: b.fileName, gameId: currentActiveGame })
            });
            const resData = await res.json();
            if (resData.success) {
              showToast('Configuración WTF restaurada con éxito');
            }
          } catch (err) {
            showToast('Error restaurando backup', 'error');
          }
        });

        item.querySelector('.btn-delete-backup').addEventListener('click', async () => {
          if (!confirm(`¿Borrar el backup "${b.fileName}"?`)) return;
          try {
            await fetch(`/api/backups/${encodeURIComponent(b.fileName)}?gameId=${encodeURIComponent(currentActiveGame)}`, { method: 'DELETE' });
            showToast('Backup eliminado');
            loadBackups();
          } catch (err) {
            showToast('Error borrando backup', 'error');
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
    btnCreateBackup.textContent = 'Creando snapshot...';

    try {
      const res = await fetch('/api/backups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: currentActiveGame })
      });
      const data = await res.json();
      if (data.fileName) {
        showToast(`Backup creado: ${data.fileName} (${data.sizeMb} MB)`);
        loadBackups();
      } else {
        throw new Error(data.error || 'Error al crear backup');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnCreateBackup.disabled = false;
      btnCreateBackup.textContent = '💾 Crear Nuevo Backup Ahora';
    }
  });

  // App Update System (GitHub Releases)
  const btnAppUpdate = document.getElementById('btnAppUpdate');
  const appUpdateVerBadge = document.getElementById('appUpdateVerBadge');
  const updateModal = document.getElementById('updateModal');
  const btnCloseUpdateModal = document.getElementById('btnCloseUpdateModal');
  const btnDismissUpdate = document.getElementById('btnDismissUpdate');
  const btnDownloadUpdate = document.getElementById('btnDownloadUpdate');
  const modalCurrentVer = document.getElementById('modalCurrentVer');
  const modalNewVer = document.getElementById('modalNewVer');
  const modalReleaseNotes = document.getElementById('modalReleaseNotes');
  let appUpdateData = null;

  async function checkAppUpdates() {
    try {
      const res = await fetch('/api/app-updates/check');
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.updateAvailable) {
        appUpdateData = data;
        const formattedVer = 'v' + String(data.remoteVersion).replace(/^v/, '');
        if (appUpdateVerBadge) {
          appUpdateVerBadge.textContent = formattedVer;
        }
        if (btnAppUpdate) {
          btnAppUpdate.style.display = 'inline-flex';
          btnAppUpdate.title = `¡Nueva versión KoRForge ${formattedVer} disponible! Haz clic para actualizar`;
        }
      } else {
        if (btnAppUpdate) {
          btnAppUpdate.style.display = 'none';
        }
      }
    } catch (err) {
      console.warn('[KoRForge Updates] Comprobación de actualizaciones fallida:', err.message);
      if (btnAppUpdate) {
        btnAppUpdate.style.display = 'none';
      }
    }
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
    btnAppUpdate.addEventListener('click', () => {
      if (!appUpdateData) return;
      if (modalCurrentVer) modalCurrentVer.textContent = 'v' + String(appUpdateData.currentVersion || '1.0.0').replace(/^v/, '');
      if (modalNewVer) modalNewVer.textContent = 'v' + String(appUpdateData.remoteVersion || '').replace(/^v/, '');
      if (modalReleaseNotes) {
        modalReleaseNotes.innerHTML = appUpdateData.releaseNotes 
          ? appUpdateData.releaseNotes.replace(/\n/g, '<br>')
          : 'Hay una nueva versión disponible para descargar desde GitHub Releases.';
      }
      if (updateProgressWrap) updateProgressWrap.style.display = 'none';
      if (btnDownloadUpdate) {
        btnDownloadUpdate.style.display = 'inline-flex';
        btnDownloadUpdate.disabled = false;
        btnDownloadUpdate.textContent = '⚡ Actualizar dentro de la App';
      }
      if (btnApplyUpdateRestart) btnApplyUpdateRestart.style.display = 'none';
      if (updateModal) updateModal.style.display = 'flex';
    });
  }

  btnCloseUpdateModal?.addEventListener('click', closeUpdateModal);
  btnDismissUpdate?.addEventListener('click', closeUpdateModal);
  updateModal?.addEventListener('click', (e) => {
    if (e.target === updateModal) closeUpdateModal();
  });

  // In-App Download Trigger
  btnDownloadUpdate?.addEventListener('click', async () => {
    if (!appUpdateData || !appUpdateData.downloadUrl) {
      showToast('No se encontró URL de actualización', 'error');
      return;
    }

    try {
      btnDownloadUpdate.disabled = true;
      btnDownloadUpdate.textContent = 'Descargando...';
      if (updateProgressWrap) updateProgressWrap.style.display = 'block';
      if (updateProgressFill) updateProgressFill.style.width = '0%';
      if (updateProgressInfo) updateProgressInfo.textContent = 'Iniciando descarga de la actualización...';

      const res = await fetch('/api/app-updates/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          downloadUrl: appUpdateData.downloadUrl,
          version: appUpdateData.remoteVersion
        })
      });

      if (!res.ok) throw new Error('Error al iniciar la descarga');

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
              updateProgressInfo.textContent = `Descargando... ${prog.percent}% (${mbDown} MB de ${mbTotal} MB @ ${prog.speedMb || '0.0'} MB/s)`;
            }
          } else if (prog.status === 'completed') {
            clearInterval(updatePollInterval);
            if (updateProgressFill) updateProgressFill.style.width = '100%';
            if (updateProgressInfo) updateProgressInfo.textContent = '✓ ¡Descarga completa! Todo listo para actualizar.';
            btnDownloadUpdate.style.display = 'none';
            if (btnApplyUpdateRestart) {
              btnApplyUpdateRestart.style.display = 'inline-flex';
            }
            showToast('Actualización descargada con éxito', 'success');
          } else if (prog.status === 'error') {
            clearInterval(updatePollInterval);
            if (updateProgressInfo) updateProgressInfo.textContent = `❌ Error: ${prog.error || 'Fallo de descarga'}`;
            btnDownloadUpdate.disabled = false;
            btnDownloadUpdate.textContent = 'Reintentar Descarga';
            showToast(`Fallo al descargar actualización: ${prog.error}`, 'error');
          }
        } catch (_) {}
      }, 400);

    } catch (err) {
      showToast(`Error al iniciar descarga: ${err.message}`, 'error');
      btnDownloadUpdate.disabled = false;
      btnDownloadUpdate.textContent = '⚡ Actualizar dentro de la App';
    }
  });

  // Apply Update and Restart
  btnApplyUpdateRestart?.addEventListener('click', async () => {
    try {
      btnApplyUpdateRestart.disabled = true;
      btnApplyUpdateRestart.textContent = 'Reiniciando KoRForge...';
      showToast('Cerrando KoRForge y aplicando actualización...', 'info');

      await fetch('/api/app-updates/apply', { method: 'POST' });
    } catch (err) {
      showToast(`Error al reiniciar: ${err.message}`, 'error');
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
    if (!silent) showToast('Buscando actualizaciones de addons en CurseForge...', 'info');
    try {
      const res = await fetch(`/api/addons/check-updates?gameId=${encodeURIComponent(currentActiveGame)}`);
      const data = await res.json();
      availableAddonUpdates = data.updates || [];

      if (availableAddonUpdates.length > 0) {
        if (bulkUpdateBanner) bulkUpdateBanner.style.display = 'flex';
        if (bulkUpdateSummary) {
          bulkUpdateSummary.textContent = `Hay ${availableAddonUpdates.length} addon(s) con versión más reciente lista para instalar.`;
        }
        if (!silent) showToast(`¡${availableAddonUpdates.length} actualizaciones disponibles!`, 'warning');
      } else {
        if (bulkUpdateBanner) bulkUpdateBanner.style.display = 'none';
        if (!silent) showToast('Todos tus addons están al día ✓', 'success');
      }

      // Re-render installed addons to show update pills
      const activePill = document.querySelector('.filter-pills .pill.active');
      const filter = activePill ? activePill.getAttribute('data-filter') : 'all';
      renderInstalledAddons(filter, document.getElementById('searchInput')?.value || '');
    } catch (err) {
      if (!silent) showToast('Error al comprobar actualizaciones de addons', 'error');
    }
  }

  btnCheckAddonUpdates?.addEventListener('click', () => checkAddonUpdates(false));

  btnUpdateAllAddons?.addEventListener('click', async () => {
    if (availableAddonUpdates.length === 0) return;

    if (bulkUpdateModal) bulkUpdateModal.style.display = 'flex';
    if (bulkProgressFill) bulkProgressFill.style.width = '0%';
    if (bulkProgressInfo) bulkProgressInfo.textContent = `Actualizando 0 de ${availableAddonUpdates.length} addons...`;
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
        bulkProgressInfo.textContent = `✓ Actualización completada: ${data.updatedCount} actualizados, ${data.failedCount} errores.`;
      }

      if (bulkUpdateResultsList && Array.isArray(data.results)) {
        bulkUpdateResultsList.innerHTML = data.results.map(r => `
          <div style="padding: 4px 0; color: ${r.success ? '#4ade80' : '#f87171'};">
            ${r.success ? '✓' : '✗'} <strong>${r.name}</strong> ${r.success ? 'actualizado con éxito' : `(${r.error})`}
          </div>
        `).join('');
      }

      availableAddonUpdates = [];
      if (bulkUpdateBanner) bulkUpdateBanner.style.display = 'none';
      if (btnCloseBulkModal) btnCloseBulkModal.style.display = 'inline-flex';
      if (btnCloseBulkModalX) btnCloseBulkModalX.style.display = 'block';

      loadInstalledAddons();
    } catch (err) {
      if (bulkProgressInfo) bulkProgressInfo.textContent = `Error en actualización masiva: ${err.message}`;
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

    showToast(`Actualizando "${name}" a ${ver}...`, 'info');
    try {
      const res = await fetch('/api/install-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadUrl: url, name, gameId: currentActiveGame, modId, version: ver, fileId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`"${name}" actualizado con éxito`, 'success');
        availableAddonUpdates = availableAddonUpdates.filter(u => u.modId != modId);
        if (availableAddonUpdates.length === 0 && bulkUpdateBanner) bulkUpdateBanner.style.display = 'none';
        loadInstalledAddons();
      } else {
        throw new Error(data.error || 'Error al actualizar');
      }
    } catch (err) {
      showToast(`Error al actualizar addon: ${err.message}`, 'error');
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

  btnExportProfile?.addEventListener('click', async () => {
    try {
      const activeGameObj = currentGamesData[currentActiveGame];
      const title = exportProfileTitle?.value || `Pack de Addons (${activeGameObj?.name || 'WoW'})`;
      const res = await fetch(`/api/profiles/export?gameId=${encodeURIComponent(currentActiveGame)}&title=${encodeURIComponent(title)}`);
      const data = await res.json();

      if (data.code && exportProfileCode) {
        exportProfileCode.value = data.code;
        if (exportProfileTitle) exportProfileTitle.value = data.profile.title;
        if (exportProfileModal) exportProfileModal.style.display = 'flex';
      }
    } catch (err) {
      showToast(`Error al generar pack: ${err.message}`, 'error');
    }
  });

  const closeExportModal = () => { if (exportProfileModal) exportProfileModal.style.display = 'none'; };
  btnCloseExportModal?.addEventListener('click', closeExportModal);
  btnDismissExport?.addEventListener('click', closeExportModal);
  btnCopyProfileCode?.addEventListener('click', () => {
    if (exportProfileCode) {
      navigator.clipboard.writeText(exportProfileCode.value);
      showToast('¡Código del pack copiado al portapapeles! Compártelo por chat o Discord', 'success');
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
      showToast('Pega un código de pack válido', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/profiles/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: raw, gameId: currentActiveGame })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      currentAnalyzedProfile = data.analysis;
      if (importInputPhase) importInputPhase.style.display = 'none';
      if (importAnalysisPhase) importAnalysisPhase.style.display = 'block';

      if (profileAnalysisSummary) {
        profileAnalysisSummary.innerHTML = `
          <strong>📦 ${data.analysis.title}</strong> (${data.analysis.gameName})<br>
          <span style="font-size: 0.82rem; opacity: 0.9;">Total de addons: ${data.analysis.totalCount} | Ya instalados: ${data.analysis.alreadyInstalledCount} | <strong>Faltan por instalar: ${data.analysis.missingCount}</strong></span>
        `;
      }

      if (profileMissingList) {
        if (data.analysis.missingCount === 0) {
          profileMissingList.innerHTML = `<div style="color: #4ade80; padding: 10px;">✓ ¡Ya tienes instalados todos los addons de este pack!</div>`;
          if (btnInstallMissingAddons) btnInstallMissingAddons.style.display = 'none';
        } else {
          profileMissingList.innerHTML = data.analysis.missing.map(m => `
            <div style="padding: 6px 4px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05);">
              <div>
                <strong>${m.title || m.name}</strong>
                <span style="font-size: 0.75rem; color: #94a3b8; margin-left: 6px;">v${m.version || '1.0.0'}</span>
              </div>
              <span style="font-size: 0.72rem; color: ${m.canInstall ? '#fbbf24' : '#f87171'};">
                ${m.canInstall ? '⚡ Listo para instalar' : '⚠️ Manual'}
              </span>
            </div>
          `).join('');
          if (btnInstallMissingAddons) btnInstallMissingAddons.style.display = 'inline-flex';
        }
      }
    } catch (err) {
      showToast(`Error al analizar pack: ${err.message}`, 'error');
    }
  });

  btnInstallMissingAddons?.addEventListener('click', async () => {
    if (!currentAnalyzedProfile || !currentAnalyzedProfile.missing || currentAnalyzedProfile.missing.length === 0) return;

    btnInstallMissingAddons.disabled = true;
    if (importProgressWrap) importProgressWrap.style.display = 'block';
    if (importProgressFill) importProgressFill.style.width = '20%';
    if (importProgressInfo) importProgressInfo.textContent = 'Descargando e instalando addons del pack...';

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
      if (importProgressInfo) importProgressInfo.textContent = `✓ Instalados ${data.installedCount} addons con éxito.`;

      showToast(`¡${data.installedCount} addons instalados desde el pack!`, 'success');
      setTimeout(() => {
        closeImportModal();
        loadInstalledAddons();
      }, 1000);
    } catch (err) {
      showToast(`Error al instalar addons del pack: ${err.message}`, 'error');
      btnInstallMissingAddons.disabled = false;
    }
  });

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
    // Comprobar si hay nueva actualización de KoRForge en GitHub Releases
    checkAppUpdates();
  }
  initApp();
});
