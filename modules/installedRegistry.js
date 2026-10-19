const fs = require('fs');
const path = require('path');

const USER_DATA_DIR = process.env.KORFORGE_USER_DATA || path.join(process.env.APPDATA || '', 'KoRForge');
const REGISTRY_FILE = path.join(USER_DATA_DIR, 'installed-registry.json');

function ensureRegistryFile() {
  if (!fs.existsSync(USER_DATA_DIR)) {
    try { fs.mkdirSync(USER_DATA_DIR, { recursive: true }); } catch (_) {}
  }
  if (!fs.existsSync(REGISTRY_FILE)) {
    try {
      fs.writeFileSync(REGISTRY_FILE, JSON.stringify({}), 'utf-8');
    } catch (_) {}
  }
}

function loadRegistry() {
  ensureRegistryFile();
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[Registry] Error leyendo registro de addons:', err.message);
  }
  return {};
}

function saveRegistry(data) {
  ensureRegistryFile();
  try {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Registry] Error guardando registro de addons:', err.message);
  }
}

function getGameRegistry(gameId = 'forever') {
  const reg = loadRegistry();
  return reg[gameId] || {};
}

function recordInstallation(gameId = 'forever', { modId, name, version, fileId, folders = [], dependencies = [] }) {
  const reg = loadRegistry();
  if (!reg[gameId]) reg[gameId] = {};

  const entry = {
    modId: Number(modId),
    name: name || '',
    version: version || '1.0.0',
    fileId: fileId ? Number(fileId) : null,
    folders: Array.isArray(folders) ? folders : [folders],
    dependencies: Array.isArray(dependencies) ? dependencies : [],
    installedAt: new Date().toISOString()
  };

  // Index by modId and also map associated folders
  reg[gameId][String(modId)] = entry;

  saveRegistry(reg);
  return entry;
}

function removeByFolderName(gameId = 'forever', folderName) {
  const reg = loadRegistry();
  if (!reg[gameId]) return;

  const target = String(folderName).toLowerCase();
  for (const [modId, entry] of Object.entries(reg[gameId])) {
    if (entry.folders && entry.folders.some(f => f.toLowerCase() === target)) {
      delete reg[gameId][modId];
      break;
    }
  }
  saveRegistry(reg);
}

function findByFolder(gameId = 'forever', folderName) {
  const gameReg = getGameRegistry(gameId);
  const target = String(folderName).toLowerCase();
  for (const entry of Object.values(gameReg)) {
    if (entry.folders && entry.folders.some(f => f.toLowerCase() === target)) {
      return entry;
    }
  }
  return null;
}

function findByModId(gameId = 'forever', modId) {
  const gameReg = getGameRegistry(gameId);
  return gameReg[String(modId)] || null;
}

module.exports = {
  loadRegistry,
  getGameRegistry,
  recordInstallation,
  removeByFolderName,
  findByFolder,
  findByModId
};
