const path = require('path');
const zlib = require('zlib');

/* Codigos de pack: "KORP2-..." (compacto, gzip + base64url) y "KORP-..." (formato viejo,
   base64 de un JSON completo). Los dos se leen; solo se escribe el compacto, porque el viejo
   ocupaba ~10.000 caracteres con 39 addons y no cabia en un mensaje de Discord (limite 2.000).
   El compacto guarda por addon [nombre, modId, version]: el resto (titulo con colores, fileId,
   interfaz) no lo usa el importar. */
const CODE_PREFIX = 'KORP2-';
const LEGACY_PREFIX = 'KORP-';

const toBase64Url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromBase64Url(str) {
  const limpio = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(limpio, 'base64');
}

/** Nombre de carpeta del addon, saneado para que quepa en el codigo y no traiga basura. */
function nombreDeCarpeta(a) {
  const bruto = String((a && (a.actualName || a.folderName || a.name)) || '').trim();
  return bruto.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120);
}

function addonCompacto(a) {
  return [
    nombreDeCarpeta(a),
    Number(a && a.modId) || 0,
    String((a && a.version) || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 40)
  ];
}

function exportProfile(scannedAddons, gameId = 'forever', gameName = 'WoW Forever', customTitle = '') {
  const addonsData = (scannedAddons || [])
    .filter(a => a.enabled) // Only enabled addons by default
    .map(a => ({
      name: a.actualName || a.folderName,
      title: a.title || a.actualName,
      version: a.version || '1.0.0',
      modId: a.modId || null,
      fileId: a.fileId || null,
      folderName: a.folderName,
      interface: a.interface || ''
    }));

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;

  const profile = {
    korforgeProfile: true,
    version: '1.0',
    createdAt: dateStr,
    gameId,
    gameName,
    title: customTitle.trim() || `Pack de Addons (${gameName})`,
    addonsCount: addonsData.length,
    addons: addonsData
  };

  // Solo lo que el importar necesita: una terna por addon.
  const compacto = {
    v: 2,
    g: gameId,
    t: profile.title,
    a: addonsData.map(addonCompacto)
  };
  const jsonStr = JSON.stringify(compacto);
  const code = CODE_PREFIX + toBase64Url(zlib.gzipSync(Buffer.from(jsonStr, 'utf-8'), { level: 9 }));

  return {
    profile,
    json: JSON.stringify(profile, null, 2),
    code
  };
}

/** Convierte el JSON compacto en el perfil completo que ya espera el resto de la app. */
function perfilDesdeCompacto(compacto) {
  if (!compacto || typeof compacto !== 'object' || compacto.v !== 2 || !Array.isArray(compacto.a)) {
    throw new Error('Formato de código inválido o dañado. Asegúrate de copiar el código completo.');
  }
  /* K9 (auditoría 22-10-2026): un pack no puede declarar miles de addons (ni un código enorme). */
  if (compacto.a.length > 500) {
    throw new Error('El pack de addons declara demasiados addons (tope: 500).');
  }

  const addons = compacto.a
    .map((t) => {
      const nombre = String((t && t[0]) || '').trim();
      return {
        name: nombre,
        title: nombre,
        version: String((t && t[2]) || ''),
        modId: Number(t && t[1]) > 0 ? Number(t[1]) : null,
        fileId: null,
        folderName: nombre,
        interface: ''
      };
    })
    .filter((a) => a.name);

  return {
    korforgeProfile: true,
    version: '2.0',
    createdAt: '',
    gameId: compacto.g || 'forever',
    gameName: '', // la rellena el servidor con el nombre del juego activo
    title: String(compacto.t || '').trim(),
    addonsCount: addons.length,
    addons
  };
}

function parseProfile(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    throw new Error('Código o datos de perfil vacíos.');
  }

  let text = rawInput.trim();

  /* K9 (auditoría 22-10-2026): tope de tamaño del código pegado (2 MB) antes de descomprimir nada. */
  if (text.length > 2 * 1024 * 1024) {
    throw new Error('Código de perfil demasiado grande (tope: 2 MB).');
  }

  if (text.startsWith(CODE_PREFIX)) {
    let jsonStr;
    try {
      /* `maxOutputLength`: un gzip malicioso (bomba) no puede inflarse a varios GB en memoria. */
      jsonStr = zlib.gunzipSync(fromBase64Url(text.slice(CODE_PREFIX.length).trim()), { maxOutputLength: 512 * 1024 }).toString('utf-8');
    } catch (_) {
      throw new Error('Formato de código inválido o dañado. Asegúrate de copiar el código completo.');
    }
    let compacto;
    try {
      compacto = JSON.parse(jsonStr);
    } catch (err) {
      throw new Error('Formato de código inválido o dañado. Asegúrate de copiar el código completo.');
    }
    return perfilDesdeCompacto(compacto);
  }

  // Formato viejo (anterior a la 1.2.14): base64 de un JSON completo.
  if (text.startsWith(LEGACY_PREFIX)) {
    const rawB64 = text.slice(LEGACY_PREFIX.length).trim();
    text = Buffer.from(rawB64, 'base64').toString('utf-8');
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error('Formato de código inválido o dañado. Asegúrate de copiar el código completo.');
  }

  if (!data.korforgeProfile || !Array.isArray(data.addons)) {
    throw new Error('El archivo o código no es un perfil válido de KoRForge.');
  }

  return data;
}

function analyzeProfile(profile, currentAddons) {
  const currentFolders = new Set(
    (currentAddons || []).map(a => (a.actualName || a.folderName || '').toLowerCase())
  );
  const currentModIds = new Set(
    (currentAddons || []).map(a => a.modId).filter(Boolean).map(String)
  );

  const alreadyInstalled = [];
  const missing = [];

  for (const item of profile.addons || []) {
    const folderLower = (item.folderName || item.name || '').toLowerCase();
    const isInstalled = currentFolders.has(folderLower) || (item.modId && currentModIds.has(String(item.modId)));

    const enriched = {
      ...item,
      canInstall: !!item.modId
    };

    if (isInstalled) {
      alreadyInstalled.push(enriched);
    } else {
      missing.push(enriched);
    }
  }

  return {
    title: profile.title,
    gameName: profile.gameName,
    gameId: profile.gameId,
    createdAt: profile.createdAt,
    totalCount: (profile.addons || []).length,
    alreadyInstalledCount: alreadyInstalled.length,
    missingCount: missing.length,
    alreadyInstalled,
    missing
  };
}

module.exports = {
  exportProfile,
  parseProfile,
  analyzeProfile
};
