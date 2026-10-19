const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const USER_DATA_DIR = process.env.KORFORGE_USER_DATA || path.join(process.env.APPDATA || '', 'KoRForge');
const BACKUPS_DIR = path.join(USER_DATA_DIR, 'backups');

function ensureBackupsDir(gameId = 'forever') {
  const dir = path.join(BACKUPS_DIR, gameId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Migrate any legacy root backups to 'forever'
  if (gameId === 'forever' && fs.existsSync(BACKUPS_DIR)) {
    try {
      const rootFiles = fs.readdirSync(BACKUPS_DIR);
      for (const f of rootFiles) {
        if (f.toLowerCase().endsWith('.zip')) {
          const oldP = path.join(BACKUPS_DIR, f);
          const newP = path.join(dir, f);
          if (!fs.existsSync(newP)) {
            fs.renameSync(oldP, newP);
          }
        }
      }
    } catch (_) {}
  }
  return dir;
}

function listBackups(gameId = 'forever') {
  const dir = ensureBackupsDir(gameId);
  const files = fs.readdirSync(dir);
  return files
    .filter(f => f.toLowerCase().endsWith('.zip'))
    .map(fileName => {
      const filePath = path.join(dir, fileName);
      const stat = fs.statSync(filePath);
      return {
        fileName,
        filePath,
        gameId,
        sizeMb: (stat.size / (1024 * 1024)).toFixed(2),
        date: stat.mtime.toLocaleString('es-ES'),
        timestamp: stat.mtimeMs
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

function createBackup(wtfPath, gameId = 'forever') {
  const dir = ensureBackupsDir(gameId);
  if (!wtfPath || !fs.existsSync(wtfPath)) {
    throw new Error(`La carpeta WTF no existe aún en: ${wtfPath || 'Ruta no configurada'}. Entra al menos una vez al juego para que WoW la cree.`);
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const backupFileName = `WTF_${gameId}_${dateStr}.zip`;
  const backupFilePath = path.join(dir, backupFileName);

  const zip = new AdmZip();
  zip.addLocalFolder(wtfPath, 'WTF');
  zip.writeZip(backupFilePath);

  const stat = fs.statSync(backupFilePath);
  return {
    fileName: backupFileName,
    filePath: backupFilePath,
    gameId,
    sizeMb: (stat.size / (1024 * 1024)).toFixed(2),
    date: stat.mtime.toLocaleString('es-ES')
  };
}

function restoreBackup(backupFileName, wtfPath, gameId = 'forever') {
  const dir = ensureBackupsDir(gameId);
  const backupFilePath = path.join(dir, backupFileName);
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`El archivo de backup ${backupFileName} no existe.`);
  }

  if (!wtfPath) {
    throw new Error('Ruta de carpeta WTF no configurada.');
  }

  const zip = new AdmZip(backupFilePath);
  const targetParent = path.dirname(wtfPath);
  zip.extractAllTo(targetParent, true);

  return { success: true, restoredFrom: backupFileName, gameId };
}

function deleteBackup(backupFileName, gameId = 'forever') {
  const dir = ensureBackupsDir(gameId);
  const backupFilePath = path.join(dir, backupFileName);
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`El backup ${backupFileName} no existe.`);
  }
  fs.unlinkSync(backupFilePath);
  return { success: true, deleted: backupFileName, gameId };
}

module.exports = {
  listBackups,
  createBackup,
  restoreBackup,
  deleteBackup
};
