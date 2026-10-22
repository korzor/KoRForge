const fs = require('fs');
const path = require('path');
const registry = require('./installedRegistry');

// Cleans WoW formatting codes, color codes (|cff... and |r), texture tags (|T...|t) and signature/donation links
function cleanWoWFormatting(str, isNotes = false) {
  if (!str) return '';
  let cleaned = str;

  // If notes, cut off author signatures, donation and texture spam appended at the end
  if (isNotes) {
    cleaned = cleaned.replace(/\|n\s*(?:\|c[0-9a-fA-F]{8})?\s*(?:By\s+|Author:|Patreon:|Donate:|http|paypal|bit\.ly|discord|twitter|github|patreon\.com).*$/i, '');
  }

  // Strip WoW colors: |cffRRGGBB and |r
  cleaned = cleaned.replace(/\|c[0-9a-fA-F]{8}/gi, '').replace(/\|r/gi, '');

  // Strip WoW textures: |Tpath:size...|t
  cleaned = cleaned.replace(/\|T[^|]*\|t/gi, '');

  // Strip WoW atlases: |Apath:size...|a
  cleaned = cleaned.replace(/\|A[^|]*\|a/gi, '');

  // Strip WoW hyperlinks: |Hlink|hText|h
  cleaned = cleaned.replace(/\|H[^|]*\|h([^|]*)\|h/gi, '$1');

  // Strip any residual dangling texture tags or paths
  cleaned = cleaned.replace(/\|T[^\s|]+/gi, '');

  // Strip web URLs from notes if any remained
  if (isNotes) {
    cleaned = cleaned.replace(/(?:https?:\/\/)?(?:www\.)?(?:patreon\.com|paypal\.me|bit\.ly|discord\.gg|discord\.me)[^\s]*/gi, '');
  }

  // Convert |n to space
  cleaned = cleaned.replace(/\|n/gi, ' ');

  // Normalize whitespace
  return cleaned.replace(/\s+/g, ' ').trim();
}

function parseTocFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const meta = {
      title: '',
      version: '',
      author: 'Desconocido',
      notes: '',
      interface: '',
      dependencies: '',
      optionalDeps: '',
      icon: '',
      group: '',
      partOf: '',
      savedVariables: []
    };

    for (const line of lines) {
      const match = line.match(/^##\s*([^:]+):\s*(.*)$/);
      if (match) {
        const key = match[1].trim().toLowerCase();
        const rawVal = match[2].trim();
        if (key === 'title') meta.title = cleanWoWFormatting(rawVal);
        else if (key === 'version') meta.version = cleanWoWFormatting(rawVal);
        else if (key === 'author') meta.author = cleanWoWFormatting(rawVal);
        else if (key === 'notes' || key === 'notes-es') meta.notes = cleanWoWFormatting(rawVal, true);
        else if (key === 'interface') meta.interface = cleanWoWFormatting(rawVal);
        else if (key === 'dependencies' || key === 'requireddeps') meta.dependencies = cleanWoWFormatting(rawVal);
        else if (key === 'optionaldeps') meta.optionalDeps = cleanWoWFormatting(rawVal);
        else if (key === 'icontexture') meta.icon = rawVal;
        else if (key === 'group') meta.group = cleanWoWFormatting(rawVal);
        else if (key === 'x-part-of') meta.partOf = cleanWoWFormatting(rawVal);
        // Nombres de los datos guardados: sirven para preguntar si borrarlos al desinstalar.
        else if (key === 'savedvariables' || key === 'savedvariablespercharacter') {
          for (const nombre of rawVal.split(/[\s,]+/)) {
            if (nombre && !meta.savedVariables.includes(nombre)) meta.savedVariables.push(nombre);
          }
        }
      }
    }

    return meta;
  } catch (err) {
    return null;
  }
}

// Audit interface number against active game client flavor.
// Devuelve un CÓDIGO (no texto): el cliente traduce con I18N (compat_<code>_badge/_label).
function auditCompatibility(rawInterface, gameId = 'forever') {
  if (!rawInterface || !rawInterface.trim()) {
    return {
      status: 'unknown',
      code: 'missing_header',
      interfaces: []
    };
  }

  const parts = rawInterface.split(/[\s,]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
  if (parts.length === 0) {
    return {
      status: 'unknown',
      code: 'unknown_value',
      interfaces: [rawInterface]
    };
  }

  const hasNum = (min, max) => parts.some(n => n >= min && n <= max);

  if (gameId === 'forever') {
    // Forever is 1.60.1 (interface 16001). Also supports classic 1.12 (11200)
    if (parts.includes(16001) || hasNum(16000, 16099) || parts.includes(11200)) {
      return { status: 'compatible', code: 'forever_ok', interfaces: parts };
    }
    // If it only has retail versions (110000+ or 120000+)
    if (hasNum(110000, 129999) && !hasNum(10000, 19999) && !hasNum(100000, 109999)) {
      return { status: 'incompatible', code: 'forever_retail', interfaces: parts };
    }
    // If it's classic era (115xx) or classic prog (404xx / 505xx)
    if (hasNum(11400, 11599) || hasNum(40000, 50999)) {
      return { status: 'warning', code: 'forever_classic', interfaces: parts };
    }
    return { status: 'warning', code: 'forever_mismatch', interfaces: parts };
  }

  if (gameId === 'retail') {
    if (hasNum(110000, 129999)) {
      return { status: 'compatible', code: 'retail_ok', interfaces: parts };
    }
    return { status: 'incompatible', code: 'retail_mismatch', interfaces: parts };
  }

  if (gameId === 'classic_era') {
    if (hasNum(11400, 11599) || parts.includes(11200)) {
      return { status: 'compatible', code: 'era_ok', interfaces: parts };
    }
    if (hasNum(110000, 129999)) {
      return { status: 'incompatible', code: 'era_retail', interfaces: parts };
    }
    return { status: 'warning', code: 'era_mismatch', interfaces: parts };
  }

  if (gameId === 'classic') {
    if (hasNum(30400, 50599)) {
      return { status: 'compatible', code: 'prog_ok', interfaces: parts };
    }
    if (hasNum(110000, 129999)) {
      return { status: 'incompatible', code: 'prog_retail', interfaces: parts };
    }
    return { status: 'warning', code: 'prog_mismatch', interfaces: parts };
  }

  return { status: 'compatible', code: 'generic_ok', interfaces: parts };
}

// Parses and audits required dependencies
function auditDependencies(rawDeps, allInstalledFolderNames) {
  if (!rawDeps || !rawDeps.trim()) {
    return { required: [], missing: [], isMissingAny: false };
  }

  const normalizedInstalled = new Set(
    allInstalledFolderNames.map(f => f.toLowerCase().replace(/\.disabled$/, ''))
  );

  const required = rawDeps
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const missing = [];
  for (const dep of required) {
    if (!normalizedInstalled.has(dep.toLowerCase())) {
      missing.push(dep);
    }
  }

  return {
    required,
    missing,
    isMissingAny: missing.length > 0
  };
}

function scanAddons(addonsDir, gameId = 'forever') {
  if (!fs.existsSync(addonsDir)) {
    return [];
  }

  const entries = fs.readdirSync(addonsDir, { withFileTypes: true });
  const allFolderNames = entries.filter(e => e.isDirectory()).map(e => e.name);
  const rawAddons = [];
  const groupVersions = {};
  const nameVersions = {};

  // Pass 1: Parse all directories and collect known versions
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const folderName = entry.name;
    const isSpecialFolder = folderName.startsWith('.') || folderName === '__MACOSX';
    if (isSpecialFolder) continue;

    const isExplicitlyDisabled = folderName.endsWith('.disabled');
    const actualAddonName = isExplicitlyDisabled ? folderName.replace(/\.disabled$/, '') : folderName;
    const folderPath = path.join(addonsDir, folderName);

    /* Buscar el .toc que corresponde AL CLIENTE ACTIVO.
       Muchos addons multi-cliente (TipTac Reborn, por ejemplo) traen varios .toc dentro de la misma
       carpeta: TipTac.toc es el de Retail y TipTac_Mists.toc el de MoP. Antes se cogía el que se
       llamaba igual que la carpeta o el primero por orden alfabético, así que un addon que funciona
       en el juego salía como «Otra versión» porque se leía el .toc de Retail (dueño, 21-10-2026). */
    let tocMeta = null;
    try {
      const archivosToc = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.toc'));
      const candidatos = [];
      for (const archivo of archivosToc) {
        const meta = parseTocFile(path.join(folderPath, archivo));
        if (meta) candidatos.push({ archivo, meta });
      }
      if (candidatos.length > 0) {
        const esDelCliente = (c) => auditCompatibility(c.meta.interface || '', gameId).status === 'compatible';
        const nombreCarpeta = `${actualAddonName.toLowerCase()}.toc`;
        const elegido = candidatos.find(c => esDelCliente(c) && c.archivo.toLowerCase() === nombreCarpeta)
          || candidatos.find(esDelCliente)
          || candidatos.find(c => c.archivo.toLowerCase() === nombreCarpeta)
          || candidatos[0];
        tocMeta = elegido.meta;
      }
    } catch (_) {}

    const rawInterface = tocMeta?.interface || '';
    const compatibility = auditCompatibility(rawInterface, gameId);
    const depsAudit = auditDependencies(tocMeta?.dependencies || '', allFolderNames);
    const regInfo = registry.findByFolder(gameId, actualAddonName);

    const explicitVer = regInfo?.version || tocMeta?.version || '';
    if (explicitVer && explicitVer !== 'N/A') {
      nameVersions[actualAddonName.toLowerCase()] = explicitVer;
      if (tocMeta?.group) {
        groupVersions[tocMeta.group.toLowerCase()] = explicitVer;
      }
    }

    rawAddons.push({
      folderName,
      actualName: actualAddonName,
      title: tocMeta?.title || actualAddonName,
      rawVersion: explicitVer,
      author: tocMeta?.author || 'Desconocido',
      notes: tocMeta?.notes || 'Addon instalado en World of Warcraft.',
      interface: rawInterface,
      compatibility,
      dependencies: depsAudit.required,
      missingDependencies: depsAudit.missing,
      hasMissingDeps: depsAudit.isMissingAny,
      optionalDeps: (tocMeta?.optionalDeps || '').split(/[\s,]+/).filter(Boolean),
      savedVariables: tocMeta?.savedVariables || [],
      icon: tocMeta?.icon || '',
      enabled: !isExplicitlyDisabled,
      path: folderPath,
      group: tocMeta?.group || '',
      partOf: tocMeta?.partOf || '',
      modId: regInfo?.modId || null,
      fileId: regInfo?.fileId || null,
      installedAt: regInfo?.installedAt || null
    });
  }

  // Pass 2: Inherit versions for suite submodules, groups and dependencies
  const addons = rawAddons.map(addon => {
    let finalVersion = addon.rawVersion;

    if (!finalVersion || finalVersion === 'N/A') {
      // 1. Inherit from same Group (e.g. Group: BagBrother)
      if (addon.group && groupVersions[addon.group.toLowerCase()]) {
        finalVersion = groupVersions[addon.group.toLowerCase()];
      }
      // 2. Inherit from PartOf (e.g. X-Part-Of: Bagnon)
      else if (addon.partOf && nameVersions[addon.partOf.toLowerCase()]) {
        finalVersion = nameVersions[addon.partOf.toLowerCase()];
      }
      // 3. Inherit from direct dependencies (e.g. Bagnon_Bank -> Bagnon)
      else if (addon.dependencies && addon.dependencies.length > 0) {
        const depWithVer = addon.dependencies.find(d => nameVersions[d.toLowerCase()]);
        if (depWithVer) {
          finalVersion = nameVersions[depWithVer.toLowerCase()];
        }
      }
      // 4. Inherit from parent addon that requires this addon (e.g. Bagnon requires BagBrother)
      else {
        const parentAddon = rawAddons.find(a => 
          a.dependencies && 
          a.dependencies.some(d => d.toLowerCase() === addon.actualName.toLowerCase()) && 
          nameVersions[a.actualName.toLowerCase()]
        );
        if (parentAddon) {
          finalVersion = nameVersions[parentAddon.actualName.toLowerCase()];
        }
      }
    }

    return {
      folderName: addon.folderName,
      actualName: addon.actualName,
      title: addon.title,
      version: finalVersion || 'N/A',
      author: addon.author,
      notes: addon.notes,
      interface: addon.interface,
      compatibility: addon.compatibility,
      dependencies: addon.dependencies,
      missingDependencies: addon.missingDependencies,
      hasMissingDeps: addon.hasMissingDeps,
      optionalDeps: addon.optionalDeps,
      savedVariables: addon.savedVariables,
      icon: addon.icon,
      enabled: addon.enabled,
      path: addon.path,
      modId: addon.modId,
      fileId: addon.fileId,
      installedAt: addon.installedAt
    };
  });

  return addons;
}

function toggleAddon(addonsDir, folderName) {
  const currentPath = path.join(addonsDir, folderName);
  if (!fs.existsSync(currentPath)) {
    throw new Error(`La carpeta del addon ${folderName} no existe.`);
  }

  const isCurrentlyDisabled = folderName.endsWith('.disabled');
  const targetName = isCurrentlyDisabled ? folderName.replace(/\.disabled$/, '') : `${folderName}.disabled`;
  const targetPath = path.join(addonsDir, targetName);

  fs.renameSync(currentPath, targetPath);
  return {
    oldName: folderName,
    newName: targetName,
    enabled: isCurrentlyDisabled
  };
}

/**
 * Resuelve qué carpetas forman el addon que se quiere desinstalar.
 * Un addon puede ocupar varias carpetas (Questie, QuestieDB; o los 23 modulos de EllesmereUI).
 * Si lo instalo la app, el registro sabe cuales son; si no, es la carpeta pulsada y ya.
 */
function carpetasDelAddon(addonsDir, folderName, gameId = 'forever') {
  const base = String(folderName || '').replace(/\.disabled$/i, '');
  const entry = registry.findByFolder(gameId, base);
  const nombres = (entry && Array.isArray(entry.folders) && entry.folders.length > 0)
    ? entry.folders.slice()
    : [base];

  const existentes = [];
  for (const nombre of nombres) {
    // La carpeta puede estar deshabilitada: en disco el nombre lleva .disabled.
    for (const candidato of [nombre, `${nombre}.disabled`]) {
      if (fs.existsSync(path.join(addonsDir, candidato))) existentes.push(candidato);
    }
  }

  return { base, nombres, existentes };
}

/**
 * Lo que se llevaría por delante desinstalar este addon, para preguntar antes de tocar disco:
 * las carpetas que se borran, los otros addons que las usan (dependencias cruzadas) y los
 * nombres de los datos guardados (SavedVariables) que el usuario puede querer borrar también.
 */
function describeUninstall(addonsDir, scannedAddons, folderName, gameId = 'forever') {
  const { base, nombres, existentes } = carpetasDelAddon(addonsDir, folderName, gameId);

  const dentroDelPack = new Set(nombres.map(n => String(n).toLowerCase()));
  const nombresDelPack = new Set(existentes.map(n => String(n).toLowerCase().replace(/\.disabled$/, '')));

  const dependents = [];
  const savedVariables = [];

  for (const addon of scannedAddons || []) {
    const carpeta = String(addon.actualName || addon.folderName || '').toLowerCase();

    if (dentroDelPack.has(carpeta)) {
      for (const nombre of addon.savedVariables || []) {
        if (!savedVariables.includes(nombre)) savedVariables.push(nombre);
      }
      continue;
    }

    // Dependencias cruzadas: otros addons que piden alguna de las carpetas que se van a borrar.
    const necesita = [...(addon.dependencies || []), ...(addon.optionalDeps || [])]
      .filter(d => nombresDelPack.has(String(d).toLowerCase().replace(/\.disabled$/, '')));
    if (necesita.length > 0) {
      dependents.push({
        folderName: addon.folderName,
        title: addon.title,
        requires: [...new Set(necesita)]
      });
    }
  }

  return { folderName, base, folders: existentes, dependents, savedVariables };
}

function deleteAddon(addonsDir, folderName, gameId = 'forever') {
  /* Antes se borraba solo la carpeta pulsada, asi que quedaba el resto del pack en disco y el
     addon seguia contando como instalado en Favoritos (dueño, 21-10-2026). */
  const { base, nombres, existentes } = carpetasDelAddon(addonsDir, folderName, gameId);

  if (existentes.length === 0) {
    throw new Error(`La carpeta ${folderName} no existe.`);
  }

  for (const candidato of existentes) {
    fs.rmSync(path.join(addonsDir, candidato), { recursive: true, force: true });
  }

  for (const nombre of new Set([...nombres, base])) {
    registry.removeByFolderName(gameId, nombre);
  }

  return { deleted: true, folderName, folders: existentes };
}

module.exports = {
  scanAddons,
  toggleAddon,
  deleteAddon,
  describeUninstall,
  auditCompatibility,
  auditDependencies
};
