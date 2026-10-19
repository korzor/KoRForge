const path = require('path');

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

  const jsonStr = JSON.stringify(profile);
  const base64Code = 'KORP-' + Buffer.from(jsonStr, 'utf-8').toString('base64');

  return {
    profile,
    json: JSON.stringify(profile, null, 2),
    code: base64Code
  };
}

function parseProfile(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    throw new Error('Código o datos de perfil vacíos.');
  }

  let text = rawInput.trim();
  if (text.startsWith('KORP-')) {
    const rawB64 = text.slice(5).trim();
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
