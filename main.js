const { app, BrowserWindow, ipcMain, Tray, Menu, shell, nativeImage, screen } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Dedicated, clean userData folder to prevent cache conflicts & warnings
const userDataPath = path.join(app.getPath('appData'), 'KoRForge');
app.setPath('userData', userDataPath);
process.env.KORFORGE_USER_DATA = userDataPath;

const bootLogFile = path.join(userDataPath, 'boot.log');
function logBoot(msg) {
  try {
    fs.appendFileSync(bootLogFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
}

logBoot('--- Process launch (PID: ' + process.pid + ') ---');

// Global hook for in-app updater to cleanly terminate before installer runs
global.quitAndApplyUpdate = function() {
  logBoot('[quitAndApplyUpdate] Cerrando KoRForge para aplicar actualizacion...');
  isQuitting = true;
  try {
    if (tray) {
      tray.destroy();
      tray = null;
    }
    if (win && !win.isDestroyed()) {
      win.destroy();
      win = null;
    }
  } catch (_) {}
  app.exit(0);
};

// Terminar cualquier proceso previo o zombie antes de comprobar la instancia única
const isMainProcess = !process.argv.some(arg => arg.startsWith('--type='));

if (isMainProcess && process.platform === 'win32') {
  try {
    const { execSync } = require('child_process');
    execSync(`taskkill /F /FI "PID ne ${process.pid}" /IM KoRForge.exe /T 2>nul || exit 0`, { shell: 'cmd.exe', stdio: 'ignore' });
  } catch (_) {}

  // Eliminar archivos de bloqueo huérfanos dejados por procesos colgados
  try {
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    for (const f of lockFiles) {
      const p = path.join(userDataPath, f);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (_) {}
      }
    }
  } catch (_) {}
}

// Prevent duplicate running instances
const gotTheLock = app.requestSingleInstanceLock();
logBoot('Single instance lock acquired: ' + gotTheLock);

if (!gotTheLock) {
  logBoot('Duplicate instance detected. Quitting duplicate instance...');
  app.quit();
  return;
}

app.on('second-instance', () => {
  logBoot('second-instance triggered');
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.setAlwaysOnTop(true);
    win.focus();
    win.setAlwaysOnTop(false);
    try {
      win.flashFrame(true);
    } catch (_) {}
  }
});

// Uncaught exception guards
process.on('uncaughtException', (err) => {
  logBoot('UncaughtException: ' + (err?.stack || err));
  console.error('[KoRForge Main Error]', err);
});
process.on('unhandledRejection', (reason) => {
  logBoot('UnhandledRejection: ' + (reason?.stack || reason));
  console.error('[KoRForge Rejection]', reason);
});

// Silence internal Chromium cache notices
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

function getConfigFile() {
  const userConfigFile = path.join(userDataPath, 'config.json');
  if (fs.existsSync(userConfigFile)) return userConfigFile;
  const localConfigFile = path.join(__dirname, 'config.json');
  if (fs.existsSync(localConfigFile)) return localConfigFile;
  return userConfigFile;
}

function loadConfigSync() {
  try {
    const cfgPath = getConfigFile();
    if (fs.existsSync(cfgPath)) {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    }
  } catch (_) {}
  return {
    wowDir: '',
    closeToTray: false,
    startMinimized: false,
    favorites: []
  };
}

let win = null;
let tray = null;
let isQuitting = false;
let isCustomMaximized = false;
let normalBounds = null;
let isTransitioningBounds = false;
let lastToggleTime = 0;

function getTargetWorkArea() {
  try {
    if (!win || win.isDestroyed()) return { x: 0, y: 0, width: 1920, height: 1040 };
    const currentBounds = win.getBounds();
    const currentDisplay = screen.getDisplayMatching(currentBounds) || screen.getPrimaryDisplay();
    return currentDisplay.workArea; // Excludes Windows taskbar
  } catch (_) {
    const primary = screen.getPrimaryDisplay();
    return primary ? primary.workArea : { x: 0, y: 0, width: 1920, height: 1040 };
  }
}

function updateNormalBounds() {
  if (win && !win.isDestroyed() && !isCustomMaximized && !isTransitioningBounds && !win.isMinimized()) {
    const b = win.getBounds();
    const wa = getTargetWorkArea();
    const isWorkArea = (Math.abs(b.width - wa.width) <= 25 && Math.abs(b.height - wa.height) <= 25);
    if (b && b.width > 400 && b.height > 300 && !isWorkArea) {
      normalBounds = b;
    }
  }
}

function syncMaximizedState() {
  if (win && !win.isDestroyed() && win.webContents) {
    win.webContents.send('window-maximized-change', isCustomMaximized);
  }
}

function restoreWindow() {
  if (!win || win.isDestroyed()) return;
  isCustomMaximized = false;
  isTransitioningBounds = true;
  try {
    if (normalBounds && normalBounds.width > 400 && normalBounds.height > 300) {
      logBoot('[restoreWindow] Restoring to normalBounds: ' + JSON.stringify(normalBounds));
      win.setBounds(normalBounds);
    } else {
      const fallback = { width: 1400, height: 900, x: 100, y: 100 };
      logBoot('[restoreWindow] Restoring to fallback: ' + JSON.stringify(fallback));
      win.setBounds(fallback);
    }
  } catch (err) {
    logBoot('[restoreWindow ERROR] ' + err.message);
  }
  setTimeout(() => { isTransitioningBounds = false; }, 300);
  syncMaximizedState();
}

function maximizeWindow() {
  if (!win || win.isDestroyed()) return;
  updateNormalBounds();
  const workArea = getTargetWorkArea();
  logBoot('[maximizeWindow] Maximizing to workArea: ' + JSON.stringify(workArea));
  isCustomMaximized = true;
  isTransitioningBounds = true;
  try {
    win.setBounds(workArea);
  } catch (err) {
    logBoot('[maximizeWindow ERROR] ' + err.message);
  }
  setTimeout(() => { isTransitioningBounds = false; }, 300);
  syncMaximizedState();
}

function toggleMaximize() {
  if (!win || win.isDestroyed()) return;
  const now = Date.now();
  if (now - lastToggleTime < 300) return; // Debounce rapid triggers
  lastToggleTime = now;

  logBoot('[toggleMaximize] current isCustomMaximized=' + isCustomMaximized);
  if (isCustomMaximized) {
    restoreWindow();
  } else {
    maximizeWindow();
  }
}

// Ensure internal Express backend is started
function ensureServer() {
  try {
    logBoot('Calling require(./server.js)');
    require('./server.js');
    logBoot('require(./server.js) finished');
  } catch (err) {
    logBoot('[KoRForge] Error al iniciar servidor interno: ' + (err?.stack || err));
    console.error('[KoRForge] Error al iniciar servidor interno:', err);
  }
  return Promise.resolve();
}

function createTray() {
  if (tray) return;
  try {
    const iconPath = path.join(__dirname, 'korforge.ico');
    const trayImg = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayImg);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '⚡ Abrir KoRForge',
        click: () => {
          if (win) {
            win.show();
            win.focus();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Cerrar KoRForge',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('KoRForge - WoW Forever Addon Forge');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (win) {
        win.isVisible() ? win.hide() : (win.show(), win.focus());
      }
    });

    tray.on('double-click', () => {
      if (win) {
        win.show();
        win.focus();
      }
    });
  } catch (err) {
    console.warn('[KoRForge] Bandeja del sistema no disponible:', err.message);
  }
}

function createWindow() {
  const cfg = loadConfigSync();

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    frame: false, // Custom borderless window
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    backgroundMaterial: 'none',
    thickFrame: false,
    title: 'KoRForge - WoW Forever Addon Forge',
    icon: path.join(__dirname, 'korforge.ico'),
    autoHideMenuBar: true,
    show: !cfg.startMinimized,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    }
  });

  win.once('ready-to-show', () => {
    logBoot('win ready-to-show event fired. startMinimized: ' + cfg.startMinimized);
    if (!cfg.startMinimized && win) {
      win.show();
      win.focus();
    }
  });

  const loadAppUrl = () => {
    if (!win || win.isDestroyed()) return;
    win.loadURL('http://127.0.0.1:3847').catch((err) => {
      console.log('[KoRForge] Error al cargar URL local, reintentando...', err.message);
      setTimeout(loadAppUrl, 800);
    });
  };
  loadAppUrl();

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.log(`[KoRForge] Carga fallida (${errorCode}: ${errorDescription}), reintentando...`);
    setTimeout(loadAppUrl, 800);
  });


  // Forward Renderer console logs to Node stdout for debugging
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelStr = level === 2 ? 'WARN' : level === 3 ? 'ERROR' : 'LOG';
    console.log(`[Renderer ${levelStr}] ${message} (${path.basename(sourceId || '')}:${line})`);
  });

  // F12 toggle DevTools
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Window Close Behavior (Close to Tray vs Quit)
  win.on('close', (e) => {
    const currentCfg = loadConfigSync();
    if (!isQuitting && currentCfg.closeToTray === true) {
      e.preventDefault();
      win.hide();
      return false;
    }
    isQuitting = true;
  });

  normalBounds = win.getBounds();

  // Detect if user dragged or resized window away while maximized
  const onBoundsChanged = () => {
    if (isTransitioningBounds || !win || win.isDestroyed()) return;
    if (isCustomMaximized) {
      const currentBounds = win.getBounds();
      const wa = getTargetWorkArea();
      const isStillAtWorkArea = (
        Math.abs(currentBounds.x - wa.x) <= 25 &&
        Math.abs(currentBounds.y - wa.y) <= 25 &&
        Math.abs(currentBounds.width - wa.width) <= 25 &&
        Math.abs(currentBounds.height - wa.height) <= 25
      );
      if (!isStillAtWorkArea) {
        logBoot('[onBoundsChanged] Window dragged away from work area -> unmaximizing');
        isCustomMaximized = false;
        syncMaximizedState();
        updateNormalBounds();
      }
    } else {
      updateNormalBounds();
    }
  };

  win.on('resize', onBoundsChanged);
  win.on('move', onBoundsChanged);
  win.on('moved', onBoundsChanged);

  // Native Windows Double-Click on Drag Caption to Maximize / Unmaximize
  if (process.platform === 'win32') {
    let lastNcDownTime = 0;
    let lastNcDownPos = { x: 0, y: 0 };

    // 1. Hook WM_NCLBUTTONDBLCLK (0x00A3)
    win.hookWindowMessage(0x00A3, (wParam) => {
      logBoot('[Hook 0x00A3 WM_NCLBUTTONDBLCLK] Triggering toggleMaximize()');
      toggleMaximize();
    });

    // 2. Hook two consecutive WM_NCLBUTTONDOWN (0x00A1) within double-click threshold
    win.hookWindowMessage(0x00A1, (wParam) => {
      const now = Date.now();
      const pos = screen.getCursorScreenPoint();
      const timeDiff = now - lastNcDownTime;
      const dist = Math.hypot(pos.x - lastNcDownPos.x, pos.y - lastNcDownPos.y);

      if (timeDiff > 40 && timeDiff < 500 && dist < 15) {
        logBoot(`[Hook 0x00A1 DoubleDown] timeDiff=${timeDiff}ms dist=${dist.toFixed(1)}px -> toggleMaximize()`);
        toggleMaximize();
        lastNcDownTime = 0;
      } else {
        lastNcDownTime = now;
        lastNcDownPos = pos;
      }
    });

    // 3. Hook WM_LBUTTONDBLCLK (0x0203) in topbar header area (client double-click fallback)
    win.hookWindowMessage(0x0203, () => {
      const pos = screen.getCursorScreenPoint();
      const b = win.getBounds();
      const relY = pos.y - b.y;
      logBoot(`[Hook 0x0203 WM_LBUTTONDBLCLK] relY=${relY}`);
      if (relY >= 0 && relY <= 72) {
        toggleMaximize();
      }
    });
  }

  createTray();
}

// Window Controls IPC
ipcMain.on('window-minimize', () => {
  if (!win) return;
  const currentCfg = loadConfigSync();
  if (currentCfg.minimizeToTray) {
    win.hide();
  } else {
    win.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (!win) return;
  toggleMaximize();
});

ipcMain.on('window-close', () => {
  if (!win) return;
  const currentCfg = loadConfigSync();
  if (currentCfg.closeToTray === true && !isQuitting) {
    win.hide();
  } else {
    isQuitting = true;
    app.quit();
  }
});

ipcMain.handle('window-is-maximized', () => {
  return isCustomMaximized;
});

ipcMain.on('open-external', (e, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  }
});

app.whenReady().then(async () => {
  logBoot('app.whenReady fired');
  await ensureServer();
  logBoot('ensureServer resolved');
  createWindow();
  logBoot('createWindow called');

  app.on('activate', () => {
    logBoot('app.activate fired');
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (win) {
      win.show();
      win.focus();
    }
  });
});

app.on('before-quit', () => {
  logBoot('app before-quit event fired');
  isQuitting = true;
});

app.on('will-quit', () => {
  logBoot('app will-quit event fired');
  try {
    if (tray) {
      tray.destroy();
      tray = null;
    }
  } catch (_) {}
  // Salida forzosa para garantizar que ningún proceso quede zombi
  setTimeout(() => process.exit(0), 100);
});

app.on('window-all-closed', () => {
  logBoot('app window-all-closed event fired. isQuitting: ' + isQuitting);
  if (process.platform !== 'darwin') {
    isQuitting = true;
    app.quit();
  }
});
