'use strict';

const fs = require('fs');
const path = require('path');
const scanner = require('./scanner');
const registry = require('./installedRegistry');
const backup = require('./backup');
const nombresSeguros = require('./nombresSeguros');

/**
 * Módulo de Limpieza y Auditoría de WTF para KoRForge.
 *
 * Analiza la carpeta WTF de World of Warcraft, detecta datos de SavedVariables
 * (.lua y .lua.bak), los correlaciona con los addons actualmente instalados y clasifica
 * los ficheros en:
 *   1. Huérfanos (addons desinstalados o inexistentes) -> candidatos a limpieza.
 *   2. Deshabilitados (addons presentes pero inactivos) -> protegidos, no se tocan.
 *   3. Activos (addons instalados en uso) -> protegidos, solo informativos.
 *
 * Reglas de seguridad:
 *   - NUNCA se tocan ficheros de sistema del juego (Config.wtf, config-cache, bindings, macros, etc.).
 *   - Ficheros con prefijo Blizzard_ o blizzard_ quedan totalmente excluidos.
 *   - Antes de cualquier eliminación se crea un respaldo automático en la Bóveda WTF.
 *   - Solo se permite borrar ficheros categorizados estrictamente como huérfanos.
 */

// Prefijos y nombres protegidos del cliente oficial de WoW
const ARCHIVOS_SISTEMA_IGNORADOS = new Set([
  'config.wtf',
  'config-cache.wtf',
  'config-cache.old',
  'config-cache.bak',
  'bindings-cache.wtf',
  'bindings-cache.old',
  'bindings-cache.bak',
  'macros-cache.txt',
  'macros-cache.old',
  'macros-cache.bak',
  'chat-cache.txt',
  'chat-cache.old',
  'chat-cache.bak',
  'layout-local.txt',
  'editmode-cache.txt',
  'cufprofiles.txt',
  'blocked-cache.txt',
  'addons.txt',
  'savedvariables.lua',
  'savedvariables.lua.bak'
]);

const REGEX_SAVED_VARIABLES = /^(.+?)\.(lua(\.(bak|old|tmp))?|bak|old|tmp)$/i;

function esVariableDeSistema(nombreBase) {
  if (!nombreBase) return true;
  const lower = nombreBase.toLowerCase();
  if (lower.startsWith('blizzard_')) return true;
  if (ARCHIVOS_SISTEMA_IGNORADOS.has(lower) || ARCHIVOS_SISTEMA_IGNORADOS.has(`${lower}.lua`)) return true;
  return false;
}

/** Formatea bytes a cadena legible (KB o MB) */
function formatearTamano(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Escanea recursivamente carpetas de SavedVariables dentro de WTF.
 * Estructuras soportadas:
 *   - WTF/Account/<CUENTA>/SavedVariables/
 *   - WTF/Account/<CUENTA>/<REINO>/<PERSONAJE>/SavedVariables/
 *   - WTF/SavedVariables/
 */
function recolectarFicherosSavedVariables(wtfDir) {
  const ficheros = [];
  if (!wtfDir || !fs.existsSync(wtfDir)) return ficheros;

  function explorar(dir, partesRelativas) {
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const ent of entradas) {
      const rutaCompleta = path.join(dir, ent.name);
      const partesActuales = [...partesRelativas, ent.name];

      if (ent.isDirectory()) {
        explorar(rutaCompleta, partesActuales);
        continue;
      }

      if (!ent.isFile()) continue;

      // Verificamos si estamos dentro de una carpeta llamada 'SavedVariables'
      const idxSaved = partesActuales.findIndex(p => p.toLowerCase() === 'savedvariables');
      if (idxSaved === -1) continue;

      const match = ent.name.match(REGEX_SAVED_VARIABLES);
      if (!match) continue;

      const nombreBase = match[1];
      if (esVariableDeSistema(nombreBase)) continue;

      let stat;
      try {
        stat = fs.statSync(rutaCompleta);
      } catch (_) {
        continue;
      }

      // Determinar ámbito (global de cuenta o por personaje)
      let scope = 'global';
      let cuenta = '';
      let reino = '';
      let personaje = '';

      // Ejemplo: Account / KORZOR / SavedVariables / Addon.lua
      // Ejemplo: Account / KORZOR / Pyrewood Village / Korcito / SavedVariables / Addon.lua
      const idxAccount = partesActuales.findIndex(p => p.toLowerCase() === 'account');
      if (idxAccount !== -1 && partesActuales.length > idxAccount + 1) {
        cuenta = partesActuales[idxAccount + 1];
        if (idxSaved > idxAccount + 2) {
          reino = partesActuales[idxAccount + 2] || '';
          personaje = partesActuales[idxAccount + 3] || '';
          scope = 'character';
        } else {
          scope = 'account';
        }
      }

      ficheros.push({
        nombreArchivo: ent.name,
        nombreBase,
        rutaRelativa: path.relative(wtfDir, rutaCompleta).replace(/\\/g, '/'),
        tamano: stat.size,
        fechaModificacion: stat.mtimeMs,
        fechaTexto: stat.mtime.toLocaleDateString('es-ES'),
        scope,
        cuenta,
        reino,
        personaje
      });
    }
  }

  explorar(wtfDir, []);
  return ficheros;
}

/**
 * Escanea WTF y clasifica todos los datos guardados cruzándolos con los addons instalados.
 */
function scanWtf(wtfDir, addonsDir, gameId = 'forever') {
  if (!wtfDir || !fs.existsSync(wtfDir)) {
    return {
      exists: false,
      gameId,
      totals: {
        totalBytes: 0,
        totalSizeText: '0 KB',
        orphanedBytes: 0,
        orphanedSizeText: '0 KB',
        activeBytes: 0,
        activeSizeText: '0 KB',
        disabledBytes: 0,
        disabledSizeText: '0 KB',
        totalFiles: 0,
        orphanedFiles: 0
      },
      orphans: [],
      disabled: [],
      active: []
    };
  }

  // 1. Obtener addons en disco
  const addonsInstalados = scanner.scanAddons(addonsDir, gameId);
  const regItems = Object.values(registry.getGameRegistry(gameId) || {});

  // Mapa de búsqueda rápida: identificador (lowercase) -> entidad de addon principal
  const mapaAddonsPorNombre = new Map();

  for (const addon of addonsInstalados) {
    const entidad = {
      groupKey: addon.actualName,
      folderName: addon.folderName,
      actualName: addon.actualName,
      title: addon.title || addon.actualName,
      version: addon.version || '',
      enabled: addon.enabled,
      icon: addon.icon || '',
      savedVariables: addon.savedVariables || []
    };

    // Si este addon forma parte de un pack registrado en el registro, asociarlo a la suite principal
    const regParent = regItems.find(r =>
      Array.isArray(r.folders) &&
      r.folders.some(f => f.toLowerCase() === addon.actualName.toLowerCase())
    );

    if (regParent) {
      entidad.groupKey = regParent.name || addon.actualName;
      entidad.title = regParent.name || addon.title;
      entidad.isSuite = true;
    }

    mapaAddonsPorNombre.set(addon.actualName.toLowerCase(), entidad);
    mapaAddonsPorNombre.set(addon.folderName.toLowerCase().replace(/\.disabled$/, ''), entidad);

    // Registramos todas las SavedVariables explícitas de su .toc
    for (const sv of addon.savedVariables) {
      if (sv) mapaAddonsPorNombre.set(sv.toLowerCase(), entidad);
    }
  }

  // Enriquecer con carpetas registradas en installedRegistry
  for (const reg of regItems) {
    if (Array.isArray(reg.folders)) {
      const mainEntity = {
        groupKey: reg.name || reg.folders[0],
        folderName: reg.folders[0],
        actualName: reg.name || reg.folders[0],
        title: reg.name || reg.folders[0],
        version: reg.version || '',
        enabled: true,
        icon: '',
        isSuite: reg.folders.length > 1,
        savedVariables: []
      };
      for (const f of reg.folders) {
        const baseF = f.toLowerCase().replace(/\.disabled$/, '');
        if (!mapaAddonsPorNombre.has(baseF)) {
          mapaAddonsPorNombre.set(baseF, mainEntity);
        } else {
          // Si ya existía, asegurarse de que apunte al groupKey del paquete
          const existente = mapaAddonsPorNombre.get(baseF);
          existente.groupKey = reg.name || existente.groupKey;
          existente.title = reg.name || existente.title;
          existente.isSuite = reg.folders.length > 1;
        }
      }
    }
  }

  // 2. Recolectar ficheros SavedVariables en WTF
  const todosLosFicheros = recolectarFicherosSavedVariables(wtfDir);

  // 3. Agrupar por addon o huérfano
  const gruposHuerfanos = new Map(); // nombreBase -> objeto grupo
  const gruposInstalados = new Map(); // groupKey -> objeto grupo

  for (const f of todosLosFicheros) {
    const lowerBase = f.nombreBase.toLowerCase();
    const addonAsociado = mapaAddonsPorNombre.get(lowerBase);

    if (addonAsociado) {
      // Pertenece a un addon instalado (activo o deshabilitado)
      const key = addonAsociado.groupKey || addonAsociado.actualName;
      if (!gruposInstalados.has(key)) {
        gruposInstalados.set(key, {
          key,
          name: addonAsociado.title,
          folderName: addonAsociado.folderName,
          enabled: addonAsociado.enabled,
          icon: addonAsociado.icon,
          version: addonAsociado.version,
          isSuite: !!addonAsociado.isSuite,
          totalBytes: 0,
          totalFiles: 0,
          ultimaModificacion: 0,
          cuentas: new Set(),
          personajes: new Set(),
          ficheros: []
        });
      }
      const g = gruposInstalados.get(key);
      g.totalBytes += f.tamano;
      g.totalFiles += 1;
      if (f.fechaModificacion > g.ultimaModificacion) g.ultimaModificacion = f.fechaModificacion;
      if (f.cuenta) g.cuentas.add(f.cuenta);
      if (f.personaje) g.personajes.add(`${f.personaje} (${f.reino || f.cuenta})`);
      g.ficheros.push(f);
    } else {
      // Huérfano: no existe ningún addon instalado con este nombre ni en sus .toc
      const key = f.nombreBase;
      if (!gruposHuerfanos.has(key)) {
        gruposHuerfanos.set(key, {
          key,
          name: f.nombreBase,
          totalBytes: 0,
          totalFiles: 0,
          ultimaModificacion: 0,
          cuentas: new Set(),
          personajes: new Set(),
          ficheros: []
        });
      }
      const g = gruposHuerfanos.get(key);
      g.totalBytes += f.tamano;
      g.totalFiles += 1;
      if (f.fechaModificacion > g.ultimaModificacion) g.ultimaModificacion = f.fechaModificacion;
      if (f.cuenta) g.cuentas.add(f.cuenta);
      if (f.personaje) g.personajes.add(`${f.personaje} (${f.reino || f.cuenta})`);
      g.ficheros.push(f);
    }
  }

  // 4. Transformar mapas a listas ordenadas por tamaño descendente
  const formatearGrupo = (g) => ({
    key: g.key,
    name: g.name,
    folderName: g.folderName || g.name,
    enabled: g.enabled !== undefined ? g.enabled : false,
    icon: g.icon || '',
    version: g.version || '',
    isSuite: !!g.isSuite,
    totalBytes: g.totalBytes,
    sizeText: formatearTamano(g.totalBytes),
    totalFiles: g.totalFiles,
    lastModified: g.ultimaModificacion ? new Date(g.ultimaModificacion).toLocaleDateString('es-ES') : '-',
    accountsCount: g.cuentas.size,
    accountsList: [...g.cuentas],
    charactersCount: g.personajes.size,
    charactersList: [...g.personajes],
    files: g.ficheros
  });

  const orphans = [...gruposHuerfanos.values()]
    .map(formatearGrupo)
    .sort((a, b) => b.totalBytes - a.totalBytes);

  const active = [];
  const disabled = [];

  for (const g of gruposInstalados.values()) {
    const item = formatearGrupo(g);
    if (g.enabled) {
      active.push(item);
    } else {
      disabled.push(item);
    }
  }

  active.sort((a, b) => b.totalBytes - a.totalBytes);
  disabled.sort((a, b) => b.totalBytes - a.totalBytes);

  // Totales
  const orphanedBytes = orphans.reduce((sum, o) => sum + o.totalBytes, 0);
  const activeBytes = active.reduce((sum, a) => sum + a.totalBytes, 0);
  const disabledBytes = disabled.reduce((sum, d) => sum + d.totalBytes, 0);
  const totalBytes = orphanedBytes + activeBytes + disabledBytes;
  const orphanedFiles = orphans.reduce((sum, o) => sum + o.totalFiles, 0);
  const totalFiles = todosLosFicheros.length;

  return {
    exists: true,
    gameId,
    totals: {
      totalBytes,
      totalSizeText: formatearTamano(totalBytes),
      orphanedBytes,
      orphanedSizeText: formatearTamano(orphanedBytes),
      activeBytes,
      activeSizeText: formatearTamano(activeBytes),
      disabledBytes,
      disabledSizeText: formatearTamano(disabledBytes),
      totalFiles,
      orphanedFiles
    },
    orphans,
    disabled,
    active
  };
}

/**
 * Limpieza segura de datos huérfanos seleccionados.
 *
 * @param {string} wtfDir Ruta a la carpeta WTF
 * @param {string} addonsDir Ruta a la carpeta Interface/AddOns
 * @param {string} gameId Identificador del juego (ej: 'forever', 'classic')
 * @param {object} options { targetNames: string[], allOrphans: boolean, createBackup: boolean }
 */
function cleanWtf(wtfDir, addonsDir, gameId = 'forever', options = {}) {
  if (!wtfDir || !fs.existsSync(wtfDir)) {
    throw new Error('La carpeta WTF no existe o no está configurada.');
  }

  // 1. Escaneo preliminar para verificar estado actual en disco
  const scanResult = scanWtf(wtfDir, addonsDir, gameId);
  const availableOrphans = new Map(scanResult.orphans.map(o => [o.key.toLowerCase(), o]));

  const namesToClean = new Set();
  if (options.allOrphans) {
    for (const o of scanResult.orphans) namesToClean.add(o.key.toLowerCase());
  } else if (Array.isArray(options.targetNames)) {
    for (const name of options.targetNames) {
      if (typeof name === 'string' && name.trim()) {
        namesToClean.add(name.trim().toLowerCase());
      }
    }
  }

  if (namesToClean.size === 0) {
    return {
      success: true,
      deletedBytes: 0,
      deletedSizeText: '0 KB',
      deletedFilesCount: 0,
      deletedOrphansCount: 0,
      backup: null
    };
  }

  // 2. Comprobación de seguridad: verificar que NINGÚN nombre pertenezca a addons activos o deshabilitados
  const nombresInstalados = new Set([
    ...scanResult.active.map(a => a.folderName.toLowerCase().replace(/\.disabled$/, '')),
    ...scanResult.active.map(a => a.key.toLowerCase()),
    ...scanResult.disabled.map(d => d.folderName.toLowerCase().replace(/\.disabled$/, '')),
    ...scanResult.disabled.map(d => d.key.toLowerCase())
  ]);

  const targetGroups = [];
  for (const lowerName of namesToClean) {
    if (nombresInstalados.has(lowerName)) {
      // ¡Seguridad!: Addon instalado o deshabilitado detectado, se descarta para proteger sus datos
      continue;
    }
    const group = availableOrphans.get(lowerName);
    if (group) {
      targetGroups.push(group);
    }
  }

  if (targetGroups.length === 0) {
    return {
      success: true,
      deletedBytes: 0,
      deletedSizeText: '0 KB',
      deletedFilesCount: 0,
      deletedOrphansCount: 0,
      backup: null
    };
  }

  // 3. Crear copia de seguridad automática de protección previa
  let backupInfo = null;
  const shouldBackup = options.createBackup !== false;
  if (shouldBackup) {
    backupInfo = backup.createBackup(wtfDir, gameId, 'prelimpieza');
  }

  // 4. Proceder al borrado de los ficheros de los huérfanos confirmados
  let deletedBytes = 0;
  let deletedFilesCount = 0;
  const deletedOrphans = [];

  for (const group of targetGroups) {
    let groupDeletedBytes = 0;
    let groupFilesDeleted = 0;

    for (const file of group.files) {
      const fullPath = path.join(wtfDir, file.rutaRelativa);

      // Verificaciones estrictas de contención y extensión
      if (!nombresSeguros.estaDentroDe(wtfDir, fullPath)) continue;
      if (!REGEX_SAVED_VARIABLES.test(fullPath)) continue;

      try {
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          fs.unlinkSync(fullPath);
          groupDeletedBytes += stat.size;
          groupFilesDeleted += 1;
        }
      } catch (err) {
        // En caso de fichero bloqueado por WoW en ejecución, se continúa con los demás
      }
    }

    if (groupFilesDeleted > 0) {
      deletedBytes += groupDeletedBytes;
      deletedFilesCount += groupFilesDeleted;
      deletedOrphans.push(group.name);
    }
  }

  return {
    success: true,
    deletedBytes,
    deletedSizeText: formatearTamano(deletedBytes),
    deletedFilesCount,
    deletedOrphansCount: deletedOrphans.length,
    deletedOrphans,
    backup: backupInfo
  };
}

/**
 * Borra a fondo y con total seguridad todos los ficheros y carpetas de SavedVariables
 * asociados a un addon al desinstalarlo.
 *
 * Cubre:
 * - Nombre de carpeta del addon, nombre base (sin .disabled) y todos los módulos del paquete.
 * - Todas las SavedVariables y SavedVariablesPerCharacter declaradas en TODOS los .toc del paquete.
 * - Variaciones de archivo: .lua, .lua.bak, .bak, .lua.old, .old, .lua.tmp, .tmp.
 * - Subcarpetas creadas por el addon dentro de SavedVariables.
 * - Todos los niveles de WTF: Account/<CUENTA>/SavedVariables, Account/<CUENTA>/<REINO>/<PJ>/SavedVariables y WTF/SavedVariables.
 *
 * Seguridad estricta:
 * - Protege cualquier fichero/carpeta de sistema de WoW (Config.wtf, Blizzard_*, etc.).
 * - Protege ficheros asociados a cualquier OTRO addon que siga instalado en Interface/AddOns.
 */
function borrarSavedVariablesDeAddon(wtfDir, addonsDir, folderName, gameId = 'forever', nombresManuales = []) {
  if (!wtfDir || !fs.existsSync(wtfDir)) return [];

  // 1. Identificar carpetas del pack del addon
  const carpetasPack = new Set();
  const baseLimpio = String(folderName || '').replace(/\.disabled$/i, '').trim().toLowerCase();
  if (baseLimpio) carpetasPack.add(baseLimpio);

  if (addonsDir && fs.existsSync(addonsDir)) {
    try {
      const infoPack = scanner.carpetasDelAddon(addonsDir, folderName, gameId);
      if (infoPack.base) carpetasPack.add(String(infoPack.base).toLowerCase());
      for (const n of infoPack.nombres || []) {
        const c = String(n).replace(/\.disabled$/i, '').trim().toLowerCase();
        if (c) carpetasPack.add(c);
      }
      for (const e of infoPack.existentes || []) {
        const c = String(e).replace(/\.disabled$/i, '').trim().toLowerCase();
        if (c) carpetasPack.add(c);
      }
    } catch (_) {}
  }

  // Si está registrado en installedRegistry con múltiples carpetas
  try {
    const regItems = Object.values(registry.getGameRegistry(gameId) || {});
    const regEntry = regItems.find(r =>
      (r.name && r.name.toLowerCase() === baseLimpio) ||
      (Array.isArray(r.folders) && r.folders.some(f => carpetasPack.has(String(f).toLowerCase().replace(/\.disabled$/, ''))))
    );
    if (regEntry && Array.isArray(regEntry.folders)) {
      for (const f of regEntry.folders) {
        const c = String(f).toLowerCase().replace(/\.disabled$/, '').trim();
        if (c) carpetasPack.add(c);
      }
    }
  } catch (_) {}

  // 2. Construir lista de nombres candidatos
  const candidatos = new Set([...carpetasPack]);
  for (const n of nombresManuales || []) {
    const c = String(n).trim().toLowerCase();
    if (c) candidatos.add(c);
  }

  // Leer todos los .toc de las carpetas del pack para extraer SavedVariables declaradas
  if (addonsDir && fs.existsSync(addonsDir)) {
    for (const f of carpetasPack) {
      for (const sufijo of ['', '.disabled']) {
        const dirCarpeta = path.join(addonsDir, f + sufijo);
        if (!fs.existsSync(dirCarpeta)) continue;
        try {
          const archivos = fs.readdirSync(dirCarpeta);
          for (const arch of archivos) {
            if (arch.toLowerCase().endsWith('.toc')) {
              const meta = scanner.parseTocFile(path.join(dirCarpeta, arch));
              if (meta && Array.isArray(meta.savedVariables)) {
                for (const sv of meta.savedVariables) {
                  if (sv) candidatos.add(String(sv).trim().toLowerCase());
                }
              }
            }
          }
        } catch (_) {}
      }
    }
  }

  // 3. Construir lista de nombres PROTEGIDOS (addons que siguen instalados en Interface/AddOns)
  const protegidos = new Set();
  if (addonsDir && fs.existsSync(addonsDir)) {
    try {
      const entradasAddons = fs.readdirSync(addonsDir, { withFileTypes: true });
      for (const ent of entradasAddons) {
        if (!ent.isDirectory()) continue;
        const nombreCarpeta = ent.name.toLowerCase().replace(/\.disabled$/, '');
        if (carpetasPack.has(nombreCarpeta)) continue; // Pertenece al addon que se borra

        protegidos.add(nombreCarpeta);

        // Extraer también las SavedVariables de ese otro addon para jamás borrarlas
        const rutaOtro = path.join(addonsDir, ent.name);
        try {
          const tocs = fs.readdirSync(rutaOtro).filter(f => f.toLowerCase().endsWith('.toc'));
          for (const t of tocs) {
            const meta = scanner.parseTocFile(path.join(rutaOtro, t));
            if (meta && Array.isArray(meta.savedVariables)) {
              for (const sv of meta.savedVariables) {
                if (sv) protegidos.add(String(sv).trim().toLowerCase());
              }
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  // 4. Explorar WTF y encontrar ficheros y carpetas coincidentes
  const ficherosABorrar = [];
  const carpetasABorrar = [];

  function explorarWtf(dir, partesRelativas) {
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    const idxSaved = partesRelativas.findIndex(p => p.toLowerCase() === 'savedvariables');
    const dentroDeSaved = idxSaved !== -1;

    for (const ent of entradas) {
      const rutaCompleta = path.join(dir, ent.name);
      const partesActuales = [...partesRelativas, ent.name];

      if (ent.isDirectory()) {
        if (dentroDeSaved) {
          const lowerDirName = ent.name.toLowerCase();
          const esDelAddon = candidatos.has(lowerDirName) ||
            [...carpetasPack].some(c => c.length >= 3 && (lowerDirName.startsWith(c + '_') || lowerDirName.startsWith(c + '-')));

          if (esDelAddon && !protegidos.has(lowerDirName) && !esVariableDeSistema(lowerDirName)) {
            explorarWtf(rutaCompleta, partesActuales);
            carpetasABorrar.push(rutaCompleta);
            continue;
          }
        }
        explorarWtf(rutaCompleta, partesActuales);
        continue;
      }

      if (!ent.isFile()) continue;
      if (!dentroDeSaved) continue;

      const m = ent.name.match(REGEX_SAVED_VARIABLES);
      if (!m) continue;

      const nombreBase = m[1].toLowerCase();
      if (esVariableDeSistema(nombreBase)) continue;
      if (protegidos.has(nombreBase)) continue;

      const coincideExacto = candidatos.has(nombreBase);
      const coincidePrefijo = [...carpetasPack].some(c =>
        c.length >= 3 && (nombreBase.startsWith(c + '_') || nombreBase.startsWith(c + '-'))
      );

      if (coincideExacto || coincidePrefijo) {
        ficherosABorrar.push(rutaCompleta);
      }
    }
  }

  explorarWtf(wtfDir, []);

  // 5. Borrado efectivo
  const borrados = [];

  for (const rutaFichero of ficherosABorrar) {
    if (!nombresSeguros.estaDentroDe(wtfDir, rutaFichero)) continue;
    try {
      fs.unlinkSync(rutaFichero);
      borrados.push(path.relative(wtfDir, rutaFichero).replace(/\\/g, '/'));
    } catch (_) {}
  }

  for (const rutaDir of carpetasABorrar) {
    if (!nombresSeguros.estaDentroDe(wtfDir, rutaDir)) continue;
    try {
      fs.rmSync(rutaDir, { recursive: true, force: true });
      borrados.push(path.relative(wtfDir, rutaDir).replace(/\\/g, '/'));
    } catch (_) {}
  }

  return borrados;
}

module.exports = {
  scanWtf,
  cleanWtf,
  borrarSavedVariablesDeAddon,
  formatearTamano,
  esVariableDeSistema
};
