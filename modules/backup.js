const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const nombresSeguros = require('./nombresSeguros');

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

/**
 * Qué hay dentro del .zip, para poder enseñarlo sin abrirlo.
 *
 * El backup se crea metiendo la carpeta WTF dentro del zip bajo `WTF/`, así que los nombres de las
 * entradas son `WTF/Account/<cuenta>/SavedVariables/...`. De ahí se saca: cuántos archivos hay, qué
 * hay en el primer nivel (Account, Config.wtf…) y qué cuentas de Battle.net están incluidas.
 * Solo se lee el índice del zip (no se descomprime), así que listar 20 backups sigue siendo barato.
 */
function resumenContenido(filePath) {
  try {
    const zip = new AdmZip(filePath);
    const archivos = zip.getEntries().filter((e) => !e.isDirectory);
    const primerNivel = new Set();
    const cuentas = new Set();

    for (const entrada of archivos) {
      const partes = String(entrada.entryName || '').split('/').filter(Boolean);
      if (partes.length < 2) continue;
      if (partes[0].toUpperCase() !== 'WTF') continue;
      primerNivel.add(partes[1]);
      if (partes.length >= 3 && partes[1].toLowerCase() === 'account') cuentas.add(partes[2]);
    }

    return {
      archivos: archivos.length,
      primerNivel: [...primerNivel].slice(0, 8),
      cuentas: [...cuentas].slice(0, 8)
    };
  } catch (_) {
    return null;
  }
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
        timestamp: stat.mtimeMs,
        isPreClean: fileName.toLowerCase().includes('_prelimpieza_'),
        contenido: resumenContenido(filePath)
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

function createBackup(wtfPath, gameId = 'forever', prefix = '') {
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
  if (!nombresSeguros.esNombreDeBackupValido(backupFileName)) {
    throw new Error(`El nombre de backup "${backupFileName}" no es válido.`);
  }
  const backupFilePath = path.join(dir, backupFileName);
  if (!nombresSeguros.estaDentroDe(dir, backupFilePath)) {
    throw new Error(`El nombre de backup "${backupFileName}" se sale del directorio de backups.`);
  }
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
  if (!nombresSeguros.esNombreDeBackupValido(backupFileName)) {
    throw new Error(`El nombre de backup "${backupFileName}" no es válido.`);
  }
  const backupFilePath = path.join(dir, backupFileName);
  if (!nombresSeguros.estaDentroDe(dir, backupFilePath)) {
    throw new Error(`El nombre de backup "${backupFileName}" se sale del directorio de backups.`);
  }
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
