'use strict';

/**
 * modules/kfgPackage.js — Exportación e importación completa (.kfg) para KoRForge.
 *
 * Un paquete .kfg es un contenedor ZIP autónomo que reúne en un solo archivo:
 *   1. manifest.json: metadatos del paquete, juego, versión, fecha y resumen.
 *   2. favorites.json: listado completo de addons favoritos del usuario.
 *   3. installed.json: registro de addons instalados y procedencia.
 *   4. addons/: carpetas completas de los addons instalados en Interface/AddOns/.
 *   5. wtf/: configuración íntegra de la carpeta WTF (cuentas, SavedVariables, etc.).
 *
 * Diseñado con contención estricta de rutas (nombresSeguros.estaDentroDe) para
 * prevenir cualquier path traversal y con límites seguros anti-zipbomb.
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { estaDentroDe, esNombreDeCarpetaValido } = require('./nombresSeguros');

const MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB tope de seguridad
const MAX_ENTRIES_COUNT = 60000; // tope de ficheros dentro del paquete

/**
 * Genera un archivo o buffer .kfg con todo el contenido del cliente seleccionado.
 */
function crearPaqueteKfg({
  gameId = 'forever',
  gameName = 'WoW Forever',
  titulo = '',
  addonsDir = '',
  wtfDir = '',
  favoritos = [],
  installedList = [],
  versionApp = '1.4.15',
}) {
  const zip = new AdmZip();
  const addonsIncluidos = [];

  // 1. Añadir addons instalados
  if (addonsDir && fs.existsSync(addonsDir)) {
    try {
      const entradas = fs.readdirSync(addonsDir, { withFileTypes: true });
      for (const ent of entradas) {
        if (!ent.isDirectory()) continue;
        const nombre = ent.name;
        // Evitar temporales o carpetas ocultas
        if (nombre.startsWith('.') || nombre.startsWith('__')) continue;
        const rutaOrigen = path.join(addonsDir, nombre);
        if (!estaDentroDe(addonsDir, rutaOrigen)) continue;

        zip.addLocalFolder(rutaOrigen, `addons/${nombre}`);
        addonsIncluidos.push(nombre);
      }
    } catch (err) {
      console.error('[KoRForge KFG] Error leyendo addonsDir:', err.message);
    }
  }

  // 2. Añadir carpeta WTF
  let tieneWtf = false;
  if (wtfDir && fs.existsSync(wtfDir)) {
    try {
      zip.addLocalFolder(wtfDir, 'wtf');
      tieneWtf = true;
    } catch (err) {
      console.error('[KoRForge KFG] Error leyendo wtfDir:', err.message);
    }
  }

  // 3. Favoritos y registro
  const favsLimpios = Array.isArray(favoritos) ? favoritos : [];
  zip.addFile('favorites.json', Buffer.from(JSON.stringify(favsLimpios, null, 2), 'utf-8'));

  const instLimpios = Array.isArray(installedList) ? installedList : [];
  zip.addFile('installed.json', Buffer.from(JSON.stringify(instLimpios, null, 2), 'utf-8'));

  // 4. Manifest del paquete
  const manifest = {
    format: 'KoRForge-Package',
    version: 1,
    appVersion: versionApp,
    createdAt: new Date().toISOString(),
    gameId,
    gameName,
    title: String(titulo || '').trim() || `Pack KoRForge (${gameName})`,
    stats: {
      addonsCount: addonsIncluidos.length,
      favoritesCount: favsLimpios.length,
      hasWtf: tieneWtf,
    },
    addons: addonsIncluidos,
  };

  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

  return {
    buffer: zip.toBuffer(),
    manifest,
  };
}

/**
 * Analiza un fichero o buffer .kfg sin extraerlo a disco.
 */
function analizarPaqueteKfg(ficheroOrBuffer) {
  let zip;
  try {
    zip = new AdmZip(ficheroOrBuffer);
  } catch (err) {
    throw new Error('El archivo no es un paquete .kfg válido o está dañado.');
  }

  const entries = zip.getEntries();
  if (entries.length > MAX_ENTRIES_COUNT) {
    throw new Error('El paquete contiene demasiados archivos (tope de seguridad excedido).');
  }

  let totalDescomprimido = 0;
  for (const e of entries) {
    totalDescomprimido += e.header ? e.header.size : 0;
    if (totalDescomprimido > MAX_UNCOMPRESSED_BYTES) {
      throw new Error('El tamaño descomprimido supera el límite máximo de seguridad (2 GB).');
    }
  }

  // Leer manifest.json
  const manifestEntry = zip.getEntry('manifest.json');
  let manifest = null;
  if (manifestEntry) {
    try {
      manifest = JSON.parse(zip.readAsText(manifestEntry));
    } catch (_) {
      manifest = null;
    }
  }

  // Detectar addons y WTF aunque falte manifest (compatibilidad)
  const addonFolders = new Set();
  const wtfAccounts = new Set();
  let tieneWtf = false;

  for (const e of entries) {
    const raw = e.entryName.replace(/\\/g, '/');
    if (raw.startsWith('addons/')) {
      const parts = raw.split('/').filter(Boolean);
      if (parts.length >= 2) addonFolders.add(parts[1]);
    } else if (raw.startsWith('wtf/')) {
      tieneWtf = true;
      const parts = raw.split('/').filter(Boolean);
      if (parts.length >= 3 && parts[1].toLowerCase() === 'account') {
        wtfAccounts.add(parts[2]);
      }
    }
  }

  // Leer favoritos si existen
  let favsCount = 0;
  let favoritos = [];
  const favEntry = zip.getEntry('favorites.json');
  if (favEntry) {
    try {
      favoritos = JSON.parse(zip.readAsText(favEntry));
      if (Array.isArray(favoritos)) favsCount = favoritos.length;
    } catch (_) {}
  }

  // Leer installed.json si existe
  let installedData = [];
  const instEntry = zip.getEntry('installed.json');
  if (instEntry) {
    try {
      installedData = JSON.parse(zip.readAsText(instEntry));
    } catch (_) {}
  }

  return {
    valid: true,
    format: 'KoRForge-Package',
    title: (manifest && manifest.title) || 'Pack de Addons KoRForge',
    gameId: (manifest && manifest.gameId) || 'forever',
    gameName: (manifest && manifest.gameName) || 'WoW Forever',
    createdAt: (manifest && manifest.createdAt) || new Date().toISOString(),
    appVersion: (manifest && manifest.appVersion) || '1.4.15',
    addonsCount: (manifest && manifest.stats && manifest.stats.addonsCount) || addonFolders.size,
    favoritesCount: (manifest && manifest.stats && manifest.stats.favoritesCount) || favsCount,
    hasWtf: manifest && manifest.stats ? !!manifest.stats.hasWtf : tieneWtf,
    addons: (manifest && Array.isArray(manifest.addons)) ? manifest.addons : Array.from(addonFolders),
    wtfAccounts: Array.from(wtfAccounts),
    favoritos,
    installedData,
  };
}

/**
 * Restaura el contenido del paquete .kfg en el cliente destino.
 */
function restaurarPaqueteKfg({
  ficheroOrBuffer,
  addonsDir,
  wtfDir,
  crearBackupWtfPrevio = null,
  opciones = { incluirAddons: true, incluirWtf: true, incluirFavoritos: true },
}) {
  const analisis = analizarPaqueteKfg(ficheroOrBuffer);
  const zip = new AdmZip(ficheroOrBuffer);
  const entries = zip.getEntries();

  // 1. Respaldo de seguridad previo de WTF si se va a restaurar WTF
  if (opciones.incluirWtf && analisis.hasWtf && wtfDir && fs.existsSync(wtfDir)) {
    if (typeof crearBackupWtfPrevio === 'function') {
      try {
        crearBackupWtfPrevio(wtfDir);
      } catch (err) {
        console.error('[KoRForge KFG] Aviso: no se pudo crear backup previo de WTF:', err.message);
      }
    }
  }

  // 2. Extraer Addons si está activo
  let addonsRestaurados = 0;
  if (opciones.incluirAddons && addonsDir) {
    if (!fs.existsSync(addonsDir)) fs.mkdirSync(addonsDir, { recursive: true });

    for (const entry of entries) {
      const raw = entry.entryName.replace(/\\/g, '/');
      if (!raw.startsWith('addons/')) continue;
      const relativo = raw.slice('addons/'.length);
      if (!relativo) continue;

      const rutaDestino = path.join(addonsDir, relativo);
      if (!estaDentroDe(addonsDir, rutaDestino)) {
        console.warn('[KoRForge KFG] Ruta peligrosa rechazada en addons:', entry.entryName);
        continue;
      }

      if (entry.isDirectory) {
        if (!fs.existsSync(rutaDestino)) fs.mkdirSync(rutaDestino, { recursive: true });
      } else {
        const parent = path.dirname(rutaDestino);
        if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
        fs.writeFileSync(rutaDestino, entry.getData());
      }
    }
    addonsRestaurados = analisis.addonsCount;
  }

  // 3. Extraer WTF si está activo
  let wtfRestaurado = false;
  if (opciones.incluirWtf && analisis.hasWtf && wtfDir) {
    if (!fs.existsSync(wtfDir)) fs.mkdirSync(wtfDir, { recursive: true });

    for (const entry of entries) {
      const raw = entry.entryName.replace(/\\/g, '/');
      if (!raw.startsWith('wtf/')) continue;
      const relativo = raw.slice('wtf/'.length);
      if (!relativo) continue;

      const rutaDestino = path.join(wtfDir, relativo);
      if (!estaDentroDe(wtfDir, rutaDestino)) {
        console.warn('[KoRForge KFG] Ruta peligrosa rechazada en WTF:', entry.entryName);
        continue;
      }

      if (entry.isDirectory) {
        if (!fs.existsSync(rutaDestino)) fs.mkdirSync(rutaDestino, { recursive: true });
      } else {
        const parent = path.dirname(rutaDestino);
        if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
        fs.writeFileSync(rutaDestino, entry.getData());
      }
    }
    wtfRestaurado = true;
  }

  return {
    success: true,
    analisis,
    addonsRestaurados,
    wtfRestaurado,
    favoritos: analisis.favoritos,
    installedData: analisis.installedData,
  };
}

module.exports = {
  crearPaqueteKfg,
  analizarPaqueteKfg,
  restaurarPaqueteKfg,
};
