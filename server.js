const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const scanner = require('./modules/scanner');
const installer = require('./modules/installer');
const curseforge = require('./modules/curseforge');
const backup = require('./modules/backup');
const translator = require('./modules/translator');
const updater = require('./modules/updater');
const registry = require('./modules/installedRegistry');
const profiles = require('./modules/profiles');

const app = express();
/* El puerto de siempre es 3847 (la ventana lo carga así). `KORFORGE_PORT` permite levantar una
   segunda instancia para probar sin cerrar la que el usuario tiene abierta. */
const PORT = Number(process.env.KORFORGE_PORT) || 3847;

const USER_DATA_DIR = process.env.KORFORGE_USER_DATA || path.join(process.env.APPDATA || '', 'KoRForge');
if (!fs.existsSync(USER_DATA_DIR)) {
  try { fs.mkdirSync(USER_DATA_DIR, { recursive: true }); } catch (_) {}
}

function resolveConfigFile() {
  const userCfg = path.join(USER_DATA_DIR, 'config.json');
  if (fs.existsSync(userCfg)) return userCfg;
  const localCfg = path.join(__dirname, 'config.json');
  if (fs.existsSync(localCfg)) {
    try { fs.copyFileSync(localCfg, userCfg); } catch (_) {}
    return userCfg;
  }
  return userCfg;
}
const CONFIG_FILE = resolveConfigFile();

const STARTUP_LNK = path.join(
  process.env.APPDATA || '',
  'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup',
  'KoRForge.lnk'
);

function isAutoStartEnabled() {
  return fs.existsSync(STARTUP_LNK);
}

function setAutoStart(enable) {
  try {
    if (enable) {
      const vbsPath = path.join(__dirname, 'Launch-KoRForge.vbs');
      const iconPath = path.join(__dirname, 'korforge.ico');
      const psScript = `$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('${STARTUP_LNK.replace(/'/g, "''")}'); $Shortcut.TargetPath = 'wscript.exe'; $Shortcut.Arguments = '\"${vbsPath.replace(/'/g, "''")}\"'; $Shortcut.WorkingDirectory = '${__dirname.replace(/'/g, "''")}'; $Shortcut.IconLocation = '${iconPath.replace(/'/g, "''")}'; $Shortcut.Save()`;
      exec(`powershell -NoProfile -Command "${psScript.replace(/"/g, '`"')}"`);
    } else {
      if (fs.existsSync(STARTUP_LNK)) {
        fs.unlinkSync(STARTUP_LNK);
      }
    }
    return true;
  } catch (err) {
    console.error('[KoRForge] Error cambiando auto-start:', err.message);
    return false;
  }
}

const DEFAULT_GAMES = {
  forever: {
    id: 'forever',
    name: 'WoW Forever',
    subtitle: 'Cliente 1.60.1',
    icon: '⚔️',
    path: '',
    subfolder: '_forever_',
    flavorId: '88568',
    flavorName: 'Forever'
  },
  retail: {
    id: 'retail',
    name: 'WoW Retail',
    subtitle: 'The War Within',
    icon: '🛡️',
    path: '',
    subfolder: '_retail_',
    flavorId: '517',
    flavorName: 'Retail'
  },
  classic_era: {
    id: 'classic_era',
    name: 'WoW Classic Era',
    subtitle: 'Vanilla 1.15',
    icon: '📜',
    path: '',
    subfolder: '_classic_era_',
    flavorId: '67408',
    flavorName: 'Classic'
  },
  classic: {
    id: 'classic',
    name: 'WoW Classic Progression',
    subtitle: 'Cataclysm / MoP / Titan',
    icon: '🔮',
    path: '',
    subfolder: '_classic_',
    flavorId: '79434,77522,73713,81212',
    flavorName: 'Classic Prog'
  }
};

function loadConfig() {
  const defaultDir = '';
  let cfg = {
    activeGame: 'forever',
    rootWoWDir: '',
    games: JSON.parse(JSON.stringify(DEFAULT_GAMES)),
    wowDir: defaultDir,
    closeToTray: false,
    startMinimized: false,
    language: 'en',
    favorites: []
  };

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      cfg = { ...cfg, ...parsed };
      if (parsed.games) {
        // Deep merge games so default metadata is preserved
        for (const [key, def] of Object.entries(DEFAULT_GAMES)) {
          cfg.games[key] = { ...def, ...(parsed.games[key] || {}) };
        }
      }
      if (!cfg.favorites) cfg.favorites = [];
      if (!cfg.favoritesByGame || typeof cfg.favoritesByGame !== 'object') {
        cfg.favoritesByGame = { forever: cfg.favorites || [] };
      }
    } catch (_) {}
  }

  // Backward compatibility
  if (!cfg.favoritesByGame) {
    cfg.favoritesByGame = { forever: cfg.favorites || [] };
  }
  if (cfg.wowDir && !cfg.games.forever.path) {
    cfg.games.forever.path = cfg.wowDir;
  }
  if (!cfg.games[cfg.activeGame]) {
    cfg.activeGame = 'forever';
  }
  cfg.wowDir = cfg.games[cfg.activeGame].path || cfg.wowDir || defaultDir;
  return cfg;
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

let config = loadConfig();

function getGameStatus(game) {
  /* La ruta EFECTIVA (la suya, o la derivada de la raíz configurada): así la interfaz no dice
     «no configurado» cuando el cliente sí está y se puede usar. */
  const gamePath = rutaDeJuego(game && game.id) || '';
  const folderExists = !!gamePath && fs.existsSync(gamePath);
  const addonsDir = folderExists ? path.join(gamePath, 'Interface', 'AddOns') : '';
  const wtfDir = folderExists ? path.join(gamePath, 'WTF') : '';
  const addonsExists = !!addonsDir && fs.existsSync(addonsDir);
  const wtfExists = !!wtfDir && fs.existsSync(wtfDir);
  return {
    ...game,
    resolvedPath: gamePath,
    folderExists,
    addonsDir,
    wtfDir,
    addonsExists,
    wtfExists
  };
}

/**
 * Ruta del cliente de un juego, con una red de seguridad.
 *
 * POR QUÉ (dueño, 21-10-2026: «intento meter un addon en la classic y me dice game path missing,
 * y lo tengo bien configurado en opciones»). Se configuran cuatro juegos por separado
 * (`games.<id>.path`), y es fácil tener la ruta puesta en «Classic Progression» y estar mirando
 * «Classic Era»: entonces el juego activo no tiene ruta aunque el usuario haya configurado *una*.
 * Dos arreglos aquí: (1) si el juego no tiene ruta propia pero la carpeta del cliente existe bajo
 * la raíz configurada (`rootWoWDir` + `subfolder`), se usa esa; y (2) los errores dicen qué juego
 * falta y cuáles sí valen (`respuestaSinRuta`), que es lo que de verdad desatasca.
 */
function rutaDeJuego(gameId) {
  const gKey = gameId || config.activeGame || 'forever';
  const game = config.games[gKey];
  const p = (game?.path || '').trim();
  if (p) return p;
  const raiz = (config.rootWoWDir || '').trim();
  const sub = (game?.subfolder || '').trim();
  if (raiz && sub) {
    const derivada = path.join(raiz, sub);
    if (fs.existsSync(derivada)) return derivada;
  }
  return '';
}

function getAddonsDir(gameId) {
  const p = rutaDeJuego(gameId);
  if (!p) return '';
  return path.join(p, 'Interface', 'AddOns');
}

function getWtfDir(gameId) {
  const p = rutaDeJuego(gameId);
  if (!p) return '';
  return path.join(p, 'WTF');
}

/** Nombre visible de un juego, para los mensajes de error. */
function nombreDeJuego(gameId) {
  const g = config.games[gameId || config.activeGame || 'forever'];
  return (g && g.name) || String(gameId || '');
}

/** Juegos que hoy tienen una ruta que existe en disco: «WoW Forever, WoW Classic Progression». */
function juegosConRuta() {
  return Object.entries(config.games)
    .filter(([key]) => {
      const p = rutaDeJuego(key);
      return !!p && fs.existsSync(p);
    })
    .map(([, g]) => g.name)
    .join(', ');
}

/**
 * Respuesta estándar de «a este juego le falta la ruta». Lleva el nombre del juego y los que sí
 * tienen ruta para que la interfaz pueda decirlo con palabras en vez de un mensaje genérico.
 */
function respuestaSinRuta(res, gameId) {
  const juego = nombreDeJuego(gameId);
  return res.status(400).json({
    error: `No hay ruta configurada para ${juego}. Configúrala en Ajustes.`,
    code: 'err_game_path_missing',
    params: { juego, otros: juegosConRuta() }
  });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API: Health check ping
app.get('/api/ping', (req, res) => {
  res.json({ pong: true, pid: process.pid, time: Date.now() });
});

// API: Config
app.get('/api/config', (req, res) => {
  const activeGame = config.activeGame || 'forever';
  const activeGameObj = config.games[activeGame] || config.games.forever;
  const activeGameStatus = getGameStatus(activeGameObj);

  const gamesStatus = {};
  for (const [key, g] of Object.entries(config.games)) {
    gamesStatus[key] = getGameStatus(g);
  }

  res.json({
    app: 'KoRForge',
    version: '1.0.0',
    activeGame,
    rootWoWDir: config.rootWoWDir || '',
    games: gamesStatus,
    wowDir: activeGameStatus.path,
    addonsDir: activeGameStatus.addonsDir,
    wtfDir: activeGameStatus.wtfDir,
    addonsExists: activeGameStatus.addonsExists,
    wtfExists: activeGameStatus.wtfExists,
    favoritesCount: (config.favorites || []).length,
    closeToTray: config.closeToTray === true,
    startMinimized: !!config.startMinimized,
    language: config.language || 'en',
    autoStart: isAutoStartEnabled()
  });
});

app.post('/api/config', (req, res) => {
  const { activeGame, rootWoWDir, games, wowDir, closeToTray, startMinimized, autoStart, language } = req.body;

  if (activeGame !== undefined && config.games[activeGame]) {
    config.activeGame = activeGame;
    config.wowDir = config.games[activeGame].path || config.wowDir;
  }
  if (rootWoWDir !== undefined && typeof rootWoWDir === 'string') {
    config.rootWoWDir = rootWoWDir.trim();
  }
  if (games && typeof games === 'object') {
    for (const [key, gData] of Object.entries(games)) {
      if (config.games[key]) {
        if (gData.path !== undefined) config.games[key].path = gData.path.trim();
      }
    }
    if (config.games[config.activeGame]?.path) {
      config.wowDir = config.games[config.activeGame].path;
    }
  }
  if (wowDir !== undefined && typeof wowDir === 'string') {
    config.wowDir = wowDir.trim();
    if (config.games[config.activeGame]) {
      config.games[config.activeGame].path = config.wowDir;
    }
  }
  if (closeToTray !== undefined) config.closeToTray = !!closeToTray;
  if (startMinimized !== undefined) config.startMinimized = !!startMinimized;
  if (language !== undefined && typeof language === 'string') {
    config.language = language.trim().toLowerCase();
  }
  if (autoStart !== undefined) {
    setAutoStart(!!autoStart);
    config.autoStart = !!autoStart;
  }

  saveConfig(config);

  const gamesStatus = {};
  for (const [key, g] of Object.entries(config.games)) {
    gamesStatus[key] = getGameStatus(g);
  }

  res.json({
    success: true,
    activeGame: config.activeGame,
    games: gamesStatus,
    config: {
      ...config,
      autoStart: isAutoStartEnabled()
    }
  });
});

// API: Auto-Detect Game Versions inside a Root Directory
app.post('/api/config/auto-detect', (req, res) => {
  const { rootDir } = req.body;
  const targetRoot = (rootDir || config.rootWoWDir || '').trim();
  if (!targetRoot || !fs.existsSync(targetRoot)) {
    return res.status(400).json({ error: 'Directorio raíz no existe o no es accesible', code: 'err_root_not_found' });
  }

  config.rootWoWDir = targetRoot;
  const detected = {};

  for (const [key, g] of Object.entries(config.games)) {
    const candidatePath = path.join(targetRoot, g.subfolder);
    if (fs.existsSync(candidatePath)) {
      config.games[key].path = candidatePath;
      detected[key] = candidatePath;
    }
  }

  // Fallback: If rootDir itself is an Interface/AddOns parent
  if (Object.keys(detected).length === 0 && fs.existsSync(path.join(targetRoot, 'Interface', 'AddOns'))) {
    config.games[config.activeGame].path = targetRoot;
    detected[config.activeGame] = targetRoot;
  }

  if (config.games[config.activeGame]?.path) {
    config.wowDir = config.games[config.activeGame].path;
  }

  saveConfig(config);

  const gamesStatus = {};
  for (const [key, g] of Object.entries(config.games)) {
    gamesStatus[key] = getGameStatus(g);
  }

  res.json({
    success: true,
    detected,
    detectedCount: Object.keys(detected).length,
    games: gamesStatus,
    activeGame: config.activeGame
  });
});

// API: Favorites (Segmented per Game)
app.get('/api/favorites', (req, res) => {
  const gameId = req.query.gameId || config.activeGame || 'forever';
  const list = (config.favoritesByGame && config.favoritesByGame[gameId]) || [];
  res.json({ favorites: list, gameId });
});

app.post('/api/favorites/toggle', (req, res) => {
  const { mod, gameId } = req.body;
  if (!mod || !mod.id) return res.status(400).json({ error: 'mod con id requerido', code: 'err_mod_id_required' });
  const targetGame = gameId || config.activeGame || 'forever';

  if (!config.favoritesByGame) config.favoritesByGame = {};
  if (!Array.isArray(config.favoritesByGame[targetGame])) config.favoritesByGame[targetGame] = [];

  const list = config.favoritesByGame[targetGame];
  const idx = list.findIndex(f => f.id === mod.id);

  let isFavorite = false;
  if (idx >= 0) {
    list.splice(idx, 1);
    isFavorite = false;
  } else {
    list.push({
      id: mod.id,
      name: mod.name,
      slug: mod.slug,
      summary: mod.summary || '',
      author: mod.author || '',
      iconUrl: mod.iconUrl || '',
      downloadCount: mod.downloadCount || 0,
      dateModified: mod.dateModified || '',
      sourceUrl: mod.sourceUrl || '',
      categories: mod.categories || []
    });
    isFavorite = true;
  }

  config.favorites = config.favoritesByGame[config.activeGame] || [];
  saveConfig(config);
  res.json({ success: true, isFavorite, favorites: list, gameId: targetGame });
});

// API: Installed Addons
app.get('/api/addons', (req, res) => {
  try {
    const gameId = req.query.gameId || config.activeGame || 'forever';
    const dir = getAddonsDir(gameId);
    if (!dir || !fs.existsSync(dir)) {
      return res.json({ addons: [], count: 0, noPath: !dir, dirNotExists: !!dir && !fs.existsSync(dir), gameId });
    }
    const addons = scanner.scanAddons(dir, gameId);
    res.json({ addons, count: addons.length, gameId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Check for Addons Updates (El Botón Mágico)
app.get('/api/addons/check-updates', async (req, res) => {
  try {
    const gameId = req.query.gameId || config.activeGame || 'forever';
    const dir = getAddonsDir(gameId);
    if (!dir || !fs.existsSync(dir)) {
      return res.json({ updates: [], count: 0, checked: 0 });
    }

    const addons = scanner.scanAddons(dir, gameId);
    const updates = [];
    let checkedCount = 0;

    for (const addon of addons) {
      if (!addon.enabled) continue;
      let modId = addon.modId;

      if (!modId) {
        try {
          const searchRes = await curseforge.searchAddons({ query: addon.actualName, pageSize: 3 });
          if (searchRes && searchRes.length > 0) {
            const match = searchRes.find(m => 
              m.slug.toLowerCase() === addon.actualName.toLowerCase() ||
              m.name.toLowerCase() === addon.actualName.toLowerCase() ||
              m.name.toLowerCase().includes(addon.actualName.toLowerCase())
            ) || searchRes[0];
            if (match) {
              modId = match.id;
              registry.recordInstallation(gameId, {
                modId: match.id,
                name: match.name,
                version: addon.version,
                folders: [addon.actualName]
              });
            }
          }
        } catch (_) {}
      }

      if (modId) {
        checkedCount++;
        try {
          const latestFile = await curseforge.getLatestFile(modId, gameId);
          if (latestFile && latestFile.downloadUrl) {
            const curVer = (addon.version || '').trim();
            const newVer = (latestFile.displayName || '').trim();

            const isSameVer = curVer && newVer && (
              curVer === newVer ||
              newVer.toLowerCase().includes(curVer.toLowerCase()) ||
              curVer.toLowerCase().includes(newVer.toLowerCase())
            );

            const hasNewerId = addon.fileId && latestFile.id > addon.fileId;
            const hasDifferentVer = !isSameVer && curVer && curVer !== 'N/A' && !addon.fileId;

            if (hasNewerId || hasDifferentVer) {
              updates.push({
                modId,
                name: addon.title || addon.actualName,
                folderName: addon.folderName,
                currentVersion: addon.version,
                newVersion: latestFile.displayName || 'Última versión',
                newFileId: latestFile.id,
                downloadUrl: latestFile.downloadUrl,
                fileLength: latestFile.fileLength
              });
            }
          }
        } catch (_) {}
      }
    }

    res.json({
      updates,
      count: updates.length,
      checked: checkedCount,
      totalAddons: addons.length
    });
  } catch (err) {
    console.error('[KoRForge] Error comprobando actualizaciones de addons:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API: Bulk Update Addons (El Botón Mágico)
app.post('/api/addons/update-all', async (req, res) => {
  try {
    const { updates, gameId } = req.body;
    const targetGame = gameId || config.activeGame || 'forever';
    const dir = getAddonsDir(targetGame);
    if (!dir || !fs.existsSync(dir)) {
      return res.status(400).json({ error: 'Ruta de WoW no disponible', code: 'err_no_wow_path' });
    }

    const listToUpdate = Array.isArray(updates) ? updates : [];
    const results = [];

    for (const item of listToUpdate) {
      try {
        if (!item.downloadUrl || !item.modId) continue;
        console.log(`[KoRForge Bulk] Actualizando ${item.name} (${item.newVersion})...`);
        const installRes = await installer.installFromUrl(item.downloadUrl, dir, item.name);
        registry.recordInstallation(targetGame, {
          modId: item.modId,
          name: item.name,
          version: item.newVersion,
          fileId: item.newFileId,
          folders: installRes.installedFolders
        });
        results.push({ name: item.name, success: true, folders: installRes.installedFolders });
      } catch (err) {
        results.push({ name: item.name, success: false, error: err.message });
      }
    }

    res.json({
      success: true,
      updatedCount: results.filter(r => r.success).length,
      failedCount: results.filter(r => !r.success).length,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/addons/toggle', (req, res) => {
  try {
    const { folderName, gameId } = req.body;
    if (!folderName) return res.status(400).json({ error: 'folderName requerido', code: 'err_folder_required' });
    const dir = getAddonsDir(gameId);
    if (!dir || !fs.existsSync(dir)) return res.status(400).json({ error: 'Ruta no configurada o inaccesible para este juego', code: 'err_path_unavailable' });
    const result = scanner.toggleAddon(dir, folderName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/addons/:folderName', (req, res) => {
  try {
    const { folderName } = req.params;
    const gameId = req.query.gameId || config.activeGame || 'forever';
    const dir = getAddonsDir(gameId);
    if (!dir || !fs.existsSync(dir)) return res.status(400).json({ error: 'Ruta no configurada o inaccesible para este juego', code: 'err_path_unavailable' });
    const result = scanner.deleteAddon(dir, folderName, gameId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/addons/open-folder', (req, res) => {
  const { gameId, folderName } = req.body || {};
  const gKey = gameId || config.activeGame || 'forever';
  const targetPath = rutaDeJuego(gKey);
  if (!targetPath) return respuestaSinRuta(res, gKey);
  const addonsPath = path.join(targetPath, 'Interface', 'AddOns');
  let dirToOpen = addonsPath;
  if (folderName) {
    const specific = path.join(addonsPath, folderName);
    if (fs.existsSync(specific)) {
      dirToOpen = specific;
    }
  }
  if (!fs.existsSync(dirToOpen)) {
    fs.mkdirSync(dirToOpen, { recursive: true });
  }
  exec(`explorer.exe "${dirToOpen}"`);
  res.json({ success: true, opened: dirToOpen });
});

// API: CurseForge Search
app.get('/api/search', async (req, res) => {
  try {
    const {
      q,
      gameVersionTypeId,
      categoryId,
      sortField,
      sortOrder,
      pageSize
    } = req.query;

    const parseList = (val) => {
      if (!val) return null;
      if (Array.isArray(val)) return val.map(Number);
      if (typeof val === 'string' && val.includes(',')) {
        return val.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      }
      const num = parseInt(val);
      return isNaN(num) ? null : num;
    };

    const results = await curseforge.searchAddons({
      query: q || '',
      gameVersionTypeId: parseList(gameVersionTypeId),
      categoryId: parseList(categoryId),
      sortField: sortField || '2',
      sortOrder: sortOrder || 'desc',
      pageSize: pageSize ? parseInt(pageSize) : 30
    });
    res.json({ results });
  } catch (err) {
    console.error('[KoRForge API] Error en /api/search:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API: CurseForge Addon Details & Description
app.get('/api/mod/:modId', async (req, res) => {
  try {
    const { modId } = req.params;
    const details = await curseforge.getModDetails(modId);
    res.json({ mod: details });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mod/:modId/description', async (req, res) => {
  try {
    const { modId } = req.params;
    const html = await curseforge.getModDescription(modId);
    res.json({ html });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mod/:modId/files', async (req, res) => {
  try {
    const { modId } = req.params;
    const files = await curseforge.getModFiles(modId, 25);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Translate Mod Description & Summary
app.post('/api/translate-mod', async (req, res) => {
  try {
    const { modId, summary, html, targetLang } = req.body;
    if (!modId) return res.status(400).json({ error: 'modId requerido', code: 'err_mod_id_required' });
    const result = await translator.translateMod({
      modId,
      summary,
      html,
      targetLang: targetLang || 'es'
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(`[KoRForge API] Error traduciendo mod ${req.body?.modId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mod/:modId/translation', async (req, res) => {
  try {
    const { modId } = req.params;
    const translation = await translator.getTranslation(modId);
    res.json({ translation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Install from CurseForge (Latest file)
app.post('/api/install-curseforge', async (req, res) => {
  try {
    const { modId, name, gameId } = req.body;
    if (!modId) return res.status(400).json({ error: 'modId requerido', code: 'err_mod_id_required' });

    const targetGame = gameId || config.activeGame || 'forever';
    const targetDir = getAddonsDir(targetGame);
    if (!targetDir) {
      return respuestaSinRuta(res, targetGame);
    }

    console.log(`[KoRForge] Obteniendo archivo para mod ${modId} (${name || 'Addon'}) en ${targetGame}...`);
    const fileInfo = await curseforge.getLatestFile(modId, targetGame);
    if (!fileInfo || !fileInfo.downloadUrl) {
      return res.status(404).json({ error: 'No se encontró archivo compatible con el cliente de WoW activo (Forever / Classic). Para evitar errores LUA, no se instalarán versiones exclusivas de Retail.', code: 'err_no_compatible_file' });
    }

    console.log(`[KoRForge] Descargando desde CDN: ${fileInfo.downloadUrl}`);
    const installResult = await installer.installFromUrl(fileInfo.downloadUrl, targetDir, name || fileInfo.displayName);

    // Auto-install required external dependencies (relationType === 3)
    const autoInstalledDeps = [];
    if (Array.isArray(fileInfo.requiredDependencies) && fileInfo.requiredDependencies.length > 0) {
      for (const dep of fileInfo.requiredDependencies) {
        const alreadyInstalled = registry.findByModId(targetGame, dep.modId);
        if (!alreadyInstalled) {
          try {
            console.log(`[KoRForge Deps] Auto-instalando dependencia obligatoria modId ${dep.modId} en ${targetGame}...`);
            const depFile = await curseforge.getLatestFile(dep.modId, targetGame);
            if (depFile && depFile.downloadUrl) {
              const depRes = await installer.installFromUrl(depFile.downloadUrl, targetDir, depFile.displayName);
              registry.recordInstallation(targetGame, {
                modId: dep.modId,
                name: depFile.displayName,
                version: depFile.displayName,
                fileId: depFile.id,
                folders: depRes.installedFolders
              });
              autoInstalledDeps.push(depFile.displayName);
            }
          } catch (depErr) {
            console.warn(`[KoRForge Deps] Advertencia al auto-instalar dependencia ${dep.modId}:`, depErr.message);
          }
        }
      }
    }

    // Record installation in registry
    registry.recordInstallation(targetGame, {
      modId,
      name: name || fileInfo.displayName,
      version: fileInfo.displayName,
      fileId: fileInfo.id,
      folders: installResult.installedFolders,
      dependencies: fileInfo.requiredDependencies
    });

    res.json({
      success: true,
      fileInfo,
      installed: installResult.installedFolders,
      autoInstalledDeps,
      gameId: targetGame
    });
  } catch (err) {
    console.error('[KoRForge] Error al instalar desde CurseForge:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API: Install a specific file directly
app.post('/api/install-file', async (req, res) => {
  try {
    const { downloadUrl, name, gameId, modId, version, fileId } = req.body;
    if (!downloadUrl) return res.status(400).json({ error: 'downloadUrl requerida', code: 'err_download_url_required' });

    const targetGame = gameId || config.activeGame || 'forever';
    const targetDir = getAddonsDir(targetGame);
    if (!targetDir) {
      return respuestaSinRuta(res, targetGame);
    }

    console.log(`[KoRForge] Instalando archivo específico en ${targetGame}: ${downloadUrl}`);
    const installResult = await installer.installFromUrl(downloadUrl, targetDir, name || 'Addon');

    if (modId) {
      registry.recordInstallation(targetGame, {
        modId: Number(modId),
        name: name || 'Addon',
        version: version || '1.0.0',
        fileId: fileId ? Number(fileId) : null,
        folders: installResult.installedFolders
      });
    }

    res.json({
      success: true,
      installed: installResult.installedFolders,
      gameId: targetGame
    });
  } catch (err) {
    console.error('[KoRForge] Error al instalar archivo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API: Install from URL / GitHub
app.post('/api/install-url', async (req, res) => {
  try {
    const { url, nameHint, gameId } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida', code: 'err_url_required' });

    const targetGame = gameId || config.activeGame || 'forever';
    const targetDir = getAddonsDir(targetGame);
    if (!targetDir) {
      return respuestaSinRuta(res, targetGame);
    }

    console.log(`[KoRForge] Instalando desde URL/GitHub en ${targetGame}: ${url}`);
    const result = await installer.installFromUrl(url.trim(), targetDir, nameHint || 'CustomAddon');
    res.json({ ...result, gameId: targetGame });
  } catch (err) {
    console.error('[KoRForge] Error al instalar URL:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API: WTF Backups (Segmented per Game)
app.get('/api/backups', (req, res) => {
  try {
    const gameId = req.query.gameId || config.activeGame || 'forever';
    const backups = backup.listBackups(gameId);
    res.json({ backups, gameId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups/create', (req, res) => {
  try {
    const gameId = req.body.gameId || config.activeGame || 'forever';
    const wtfDir = getWtfDir(gameId);
    if (!wtfDir) {
      return res.status(400).json({ error: 'Ruta no configurada para este juego.', code: 'err_path_unavailable' });
    }
    const result = backup.createBackup(wtfDir, gameId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups/restore', (req, res) => {
  try {
    const { fileName, gameId } = req.body;
    if (!fileName) return res.status(400).json({ error: 'fileName requerido', code: 'err_filename_required' });
    const targetGame = gameId || config.activeGame || 'forever';
    const wtfDir = getWtfDir(targetGame);
    if (!wtfDir) {
      return res.status(400).json({ error: 'Ruta no configurada para este juego.', code: 'err_path_unavailable' });
    }
    const result = backup.restoreBackup(fileName, wtfDir, targetGame);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/backups/:fileName', (req, res) => {
  try {
    const { fileName } = req.params;
    const gameId = req.query.gameId || config.activeGame || 'forever';
    const result = backup.deleteBackup(fileName, gameId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: App Version & Remote Update Checker (GitHub Releases)
const APP_VERSION = require('./package.json').version || '1.0.0';
const GITHUB_REPO = 'korzor/KoRForge';

function compareVersions(v1, v2) {
  const clean = (v) => (v || '').replace(/^v/i, '').trim().split('.').map(n => parseInt(n) || 0);
  const p1 = clean(v1);
  const p2 = clean(v2);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

async function checkGitHubRelease() {
  try {
    const token = updater.getGitHubToken();
    const headers = {
      'User-Agent': `KoRForge-Desktop/${APP_VERSION}`,
      'Accept': 'application/vnd.github+json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      signal: controller.signal,
      headers
    });
    clearTimeout(timeoutId);

    if (!ghRes.ok) return null;
    const release = await ghRes.json();
    if (!release || !release.tag_name) return null;

    const remoteVersion = release.tag_name.replace(/^v/i, '').trim();
    const updateAvailable = compareVersions(remoteVersion, APP_VERSION) > 0;

    let downloadUrl = '';
    const exeAsset = release.assets && release.assets.find(a => a.name.toLowerCase().endsWith('.exe'));
    if (exeAsset) {
      // In private repos or authenticated mode, use asset.url for stream download via API
      downloadUrl = token ? exeAsset.url : exeAsset.browser_download_url;
    }

    return {
      source: 'github',
      checked: true,
      updateAvailable,
      currentVersion: APP_VERSION,
      remoteVersion,
      downloadUrl: downloadUrl || `https://github.com/${GITHUB_REPO}/releases/latest`,
      releaseNotes: release.body || `KoRForge ${release.tag_name} disponible en GitHub.`,
      date: release.published_at ? release.published_at.substring(0, 10) : ''
    };
  } catch (err) {
    console.warn('[KoRForge Updates] Error consultando GitHub Releases:', err.message);
    return null;
  }
}

app.get('/api/app-updates/check', async (req, res) => {
  const result = await checkGitHubRelease();
  if (result && result.checked) {
    return res.json(result);
  }

  return res.json({
    source: 'github',
    checked: false,
    updateAvailable: false,
    currentVersion: APP_VERSION,
    error: 'No se pudo consultar GitHub Releases. Comprueba tu conexión a internet e inténtalo de nuevo.',
    code: 'err_github_unreachable'
  });
});

// API: Start In-App Update Download
app.post('/api/app-updates/download', async (req, res) => {
  try {
    const { downloadUrl, version } = req.body;
    if (!downloadUrl) return res.status(400).json({ error: 'downloadUrl requerida', code: 'err_download_url_required' });
    updater.startUpdateDownload(downloadUrl, version).catch(err => {
      console.error('[KoRForge Update] Error en descarga de fondo:', err.message);
    });
    res.json({ success: true, message: 'Descarga en segundo plano iniciada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: In-App Update Download Progress
app.get('/api/app-updates/download-progress', (req, res) => {
  res.json(updater.getDownloadProgress());
});

// API: Apply Downloaded In-App Update and Restart
app.post('/api/app-updates/apply', (req, res) => {
  try {
    // El idioma lo manda la ventana: la tarjeta de carga del actualizador es interfaz nativa
    const lang = (req.body && req.body.lang) || 'en';
    const result = updater.applyUpdateAndRestart(null, lang);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Profile Export (Compartir pack de addons)
app.get('/api/profiles/export', (req, res) => {
  try {
    const gameId = req.query.gameId || config.activeGame || 'forever';
    const dir = getAddonsDir(gameId);
    if (!dir || !fs.existsSync(dir)) {
      return respuestaSinRuta(res, gameId);
    }
    const scanned = scanner.scanAddons(dir, gameId);
    const gameInfo = config.games[gameId] || { name: 'WoW Forever' };
    const customTitle = req.query.title || '';
    const result = profiles.exportProfile(scanned, gameId, gameInfo.name, customTitle);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Profile Analyze (Analizar pack compartido)
app.post('/api/profiles/analyze', (req, res) => {
  try {
    const { code, profileData, gameId } = req.body;
    const targetGame = gameId || config.activeGame || 'forever';
    const dir = getAddonsDir(targetGame);
    const scanned = (dir && fs.existsSync(dir)) ? scanner.scanAddons(dir, targetGame) : [];

    const parsedProfile = profileData || profiles.parseProfile(code);
    // El codigo compacto no lleva el nombre del juego (lo pone el servidor segun el cliente)
    if (!parsedProfile.gameName && config.games[parsedProfile.gameId]) {
      parsedProfile.gameName = config.games[parsedProfile.gameId].name;
    }
    const analysis = profiles.analyzeProfile(parsedProfile, scanned);
    res.json({ success: true, profile: parsedProfile, analysis });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// API: Profile Install Missing (Instalar en 1 clic los addons que faltan del pack)
app.post('/api/profiles/install-missing', async (req, res) => {
  try {
    const { missingAddons, gameId } = req.body;
    const targetGame = gameId || config.activeGame || 'forever';
    const dir = getAddonsDir(targetGame);
    if (!dir || !fs.existsSync(dir)) {
      return res.status(400).json({ error: 'Ruta no configurada para este juego', code: 'err_path_unavailable' });
    }

    const toInstall = Array.isArray(missingAddons) ? missingAddons : [];
    const results = [];

    for (const item of toInstall) {
      if (!item.modId) continue;
      try {
        console.log(`[KoRForge Profile] Instalando addon del pack: ${item.name} (${item.modId})...`);
        const fileInfo = await curseforge.getLatestFile(item.modId);
        if (fileInfo && fileInfo.downloadUrl) {
          const instRes = await installer.installFromUrl(fileInfo.downloadUrl, dir, item.name);
          registry.recordInstallation(targetGame, {
            modId: item.modId,
            name: item.name,
            version: fileInfo.displayName,
            fileId: fileInfo.id,
            folders: instRes.installedFolders
          });
          results.push({ name: item.name, success: true, folders: instRes.installedFolders });
        } else {
          results.push({ name: item.name, success: false, error: 'No se encontró archivo descargable', code: 'err_no_downloadable' });
        }
      } catch (err) {
        results.push({ name: item.name, success: false, error: err.message });
      }
    }

    res.json({
      success: true,
      installedCount: results.filter(r => r.success).length,
      failedCount: results.filter(r => !r.success).length,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


const server = app.listen(PORT, '127.0.0.1', () => {
  try {
    fs.appendFileSync(path.join(USER_DATA_DIR, 'boot.log'), `[${new Date().toISOString()}] [SERVER] Listening on http://127.0.0.1:${PORT}\n`);
  } catch(_) {}
  console.log(`[KoRForge] Servidor activo en http://localhost:${PORT}`);
});

server.on('error', (err) => {
  try {
    fs.appendFileSync(path.join(USER_DATA_DIR, 'boot.log'), `[${new Date().toISOString()}] [SERVER ERROR] ${err.stack || err}\n`);
  } catch(_) {}
  if (err.code === 'EADDRINUSE') {
    console.warn(`[KoRForge] Puerto ${PORT} ya ocupado, reutilizando servidor activo.`);
  } else {
    console.error('[KoRForge] Error en servidor Express:', err);
  }
});

