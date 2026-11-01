/* K10 (auditoría 22-10-2026): la clave de CurseForge NO vive en el código fuente. Se toma, por
 * orden: (1) modules/_cfkey.generated.js, que el build escribe desde cf-key.local.txt o CF_API_KEY
 * (ninguno de los dos se versiona); (2) la variable de entorno; (3) cf-key.local.txt, solo para
 * desarrollo. Si falta, el buscador avisa y las peticiones a CurseForge fallan con 403. */
const fs = require('fs');
const path = require('path');
let CF_API_KEY = '';
try { CF_API_KEY = require('./_cfkey.generated'); } catch (_) { /* sin clave inyectada por el build */ }
if (!CF_API_KEY) {
  try { CF_API_KEY = fs.readFileSync(path.join(__dirname, '..', 'cf-key.local.txt'), 'utf8').trim(); } catch (_) { /* desarrollo sin fichero local */ }
}
CF_API_KEY = String(CF_API_KEY || process.env.CF_API_KEY || '').trim();
if (!CF_API_KEY) {
  console.warn('[KoRForge] Sin clave de CurseForge: crea cf-key.local.txt en la raiz (no se versiona) para buscar addons.');
}
const GAME_VERSION_TYPE_IDS = {
  forever: 88568,
  retail: 517,
  classic_era: 67408,
  classic: [79434, 77522, 73713, 81212]
};

const BASE_URL = process.env.CF_BASE_URL || 'https://api.curseforge.com/v1';

function extractSourceUrl(links) {
  if (!links) return '';
  if (links.sourceUrl && typeof links.sourceUrl === 'string' && links.sourceUrl.trim()) {
    return links.sourceUrl.trim();
  }
  // Fallback: if issuesUrl is a github or gitlab URL, extract base repo URL
  if (links.issuesUrl && typeof links.issuesUrl === 'string') {
    const match = links.issuesUrl.match(/^(https?:\/\/(?:github\.com|gitlab\.com)\/[^\/]+\/[^\/]+)/i);
    if (match) return match[1];
  }
  return '';
}

function extractLatestVersion(latestFiles, gameId = null) {
  if (!latestFiles || !Array.isArray(latestFiles) || latestFiles.length === 0) return '';
  let candidates = latestFiles;
  if (gameId) {
    const scored = latestFiles
      .map(f => ({ file: f, score: getFileScore(f, gameId) }))
      .filter(x => x.score > 0);
    if (scored.length > 0) {
      scored.sort((a, b) => b.score - a.score || (b.file.id || 0) - (a.file.id || 0));
      candidates = scored.map(x => x.file);
    }
  }

  const releaseFiles = candidates.filter(f => f.releaseType === 1);
  const target = releaseFiles.length > 0 ? releaseFiles[0] : candidates[0];
  if (!target) return '';
  let ver = target.displayName || target.fileName || '';
  ver = ver.replace(/\.zip$/i, '').trim();
  return ver;
}

async function searchAddons({
  query = '',
  gameVersionTypeId = null,
  categoryId = null,
  sortField = '2', // 2 = Popularity, 1 = Featured, 3 = Last Updated, 4 = Name, 6 = Total Downloads
  sortOrder = 'desc',
  pageSize = 30,
  gameId = null
} = {}) {
  try {
    const url = new URL(`${BASE_URL}/mods/search`);
    url.searchParams.set('gameId', '1'); // World of Warcraft

    if (query && query.trim()) {
      url.searchParams.set('searchFilter', query.trim());
    }

    if (gameVersionTypeId) {
      if (Array.isArray(gameVersionTypeId)) {
        gameVersionTypeId.forEach(id => url.searchParams.append('gameVersionTypeId', id.toString()));
      } else {
        url.searchParams.set('gameVersionTypeId', gameVersionTypeId.toString());
      }
    }

    if (categoryId) {
      if (Array.isArray(categoryId)) {
        categoryId.forEach(id => url.searchParams.append('categoryId', id.toString()));
      } else {
        url.searchParams.set('categoryId', categoryId.toString());
      }
    }

    url.searchParams.set('pageSize', pageSize.toString());
    url.searchParams.set('sortField', sortField.toString());
    url.searchParams.set('sortOrder', sortOrder);

    const res = await fetch(url.toString(), {
      headers: {
        'x-api-key': CF_API_KEY,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error(`CurseForge API responded with ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    return (data.data || []).map(mod => ({
      id: mod.id,
      name: mod.name,
      slug: mod.slug,
      summary: mod.summary || 'Sin descripción disponible.',
      downloadCount: mod.downloadCount || 0,
      iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url || '',
      author: mod.authors?.[0]?.name || 'Desconocido',
      sourceUrl: extractSourceUrl(mod.links),
      issuesUrl: mod.links?.issuesUrl || '',
      wikiUrl: mod.links?.wikiUrl || '',
      websiteUrl: mod.links?.websiteUrl || `https://www.curseforge.com/wow/addons/${mod.slug}`,
      categories: (mod.categories || []).map(c => ({ id: c.id, name: c.name })),
      dateModified: mod.dateModified,
      version: extractLatestVersion(mod.latestFiles, gameId),
      latestFiles: mod.latestFiles || []
    }));
  } catch (err) {
    console.error('[CurseForge] Error al buscar addons:', err.message);
    throw err;
  }
}

async function getModDetails(modId, gameId = null) {
  try {
    const url = `${BASE_URL}/mods/${modId}`;
    const res = await fetch(url, {
      headers: {
        'x-api-key': CF_API_KEY,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error(`Error obteniendo detalles del mod ${modId}: ${res.status}`);
    }

    const data = await res.json();
    const mod = data.data;

    return {
      id: mod.id,
      name: mod.name,
      slug: mod.slug,
      summary: mod.summary || '',
      downloadCount: mod.downloadCount || 0,
      iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url || '',
      author: mod.authors?.[0]?.name || 'Desconocido',
      authors: (mod.authors || []).map(a => a.name),
      version: extractLatestVersion(mod.latestFiles, gameId),
      websiteUrl: mod.links?.websiteUrl || `https://www.curseforge.com/wow/addons/${mod.slug}`,
      sourceUrl: extractSourceUrl(mod.links),
      issuesUrl: mod.links?.issuesUrl || '',
      wikiUrl: mod.links?.wikiUrl || '',
      categories: (mod.categories || []).map(c => ({ id: c.id, name: c.name, iconUrl: c.iconUrl })),
      dateCreated: mod.dateCreated,
      dateModified: mod.dateModified,
      dateReleased: mod.dateReleased,
      screenshots: (mod.screenshots || []).map(s => ({
        id: s.id,
        title: s.title || '',
        description: s.description || '',
        thumbnailUrl: s.thumbnailUrl,
        url: s.url
      }))
    };
  } catch (err) {
    console.error(`[CurseForge] Error en getModDetails (${modId}):`, err.message);
    throw err;
  }
}

async function getModDescription(modId) {
  try {
    const url = `${BASE_URL}/mods/${modId}/description`;
    const res = await fetch(url, {
      headers: {
        'x-api-key': CF_API_KEY,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error(`Error obteniendo descripción del mod ${modId}: ${res.status}`);
    }

    const data = await res.json();
    return data.data || '<p>No hay descripción detallada disponible.</p>';
  } catch (err) {
    console.error(`[CurseForge] Error en getModDescription (${modId}):`, err.message);
    return '<p>Error al cargar la descripción.</p>';
  }
}

async function getModFiles(modId, pageSize = 20, index = 0) {
  try {
    const url = `${BASE_URL}/mods/${modId}/files?pageSize=${pageSize}&index=${index}`;
    const res = await fetch(url, {
      headers: {
        'x-api-key': CF_API_KEY,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error(`CurseForge API error fetching files: ${res.status}`);
    }

    const data = await res.json();
    const files = data.data || [];

    return files.map(f => {
      // releaseType: 1 = Release, 2 = Beta, 3 = Alpha
      const typeLabel = f.releaseType === 1 ? 'Release' : f.releaseType === 2 ? 'Beta' : 'Alpha';
      return {
        id: f.id,
        displayName: f.displayName,
        fileName: f.fileName,
        fileDate: f.fileDate,
        fileLength: (f.fileLength / (1024 * 1024)).toFixed(2) + ' MB',
        releaseType: f.releaseType,
        releaseTypeLabel: typeLabel,
        downloadCount: f.downloadCount || 0,
        downloadUrl: f.downloadUrl,
        gameVersions: f.gameVersions || [],
        dependencies: f.dependencies || [],
        requiredDependencies: (f.dependencies || [])
          .filter(d => d.relationType === 3)
          .map(d => ({ modId: d.modId, relationType: d.relationType }))
      };
    });
  } catch (err) {
    console.error(`[CurseForge] Error en getModFiles (${modId}):`, err.message);
    throw err;
  }
}

function filterRequiredDependencies(dependencies = []) {
  if (!Array.isArray(dependencies)) return [];
  return dependencies.filter(d => d.relationType === 3);
}

function getFileScore(file, gameId = 'forever') {
  if (!file) return 0;
  const vers = Array.isArray(file.gameVersions) ? file.gameVersions.map(v => String(v).toLowerCase()) : [];
  const nameStr = ((file.fileName || '') + ' ' + (file.displayName || '')).toLowerCase();

  const hasVer = (arr) => vers.some(v => arr.some(p => v === p || v.startsWith(p) || v.includes(p)));
  const hasText = (arr) => arr.some(p => nameStr.includes(p));

  const isForever = hasVer(['1.60', 'forever']) || hasText(['forever', '1.60']);
  const isVanilla112 = hasVer(['1.12']) || hasText(['1.12']);
  const isEra = hasVer(['1.15', '1.14', '1.13', 'classic era']) || hasText(['classicera', 'classic-era', 'classic_era', 'era.zip', 'era-']);
  const isProgression = hasVer(['5.5', '5.0', '4.4', '3.4', '2.5', 'cataclysm', 'mists', 'pandaria', 'wrath', 'wotlk', 'tbc', 'burning crusade', 'progression']) ||
                        hasText(['mop', 'pandaria', 'cata', 'cataclysm', 'wotlk', 'wrath', 'tbc', 'burningcrusade', 'anniversary']);
  const isRetail = hasVer(['11.', '12.', '10.', 'retail', 'the war within', 'midnight']) ||
                   hasText(['retail', 'tww', 'thewarwithin', 'midnight']);

  if (gameId === 'forever') {
    if (isForever) return 100;
    if (isEra || isProgression || isRetail) return 0; // Incompatibles: no mezclar con Classic Era/Progression/Retail
    if (isVanilla112) return 80;
    if (hasVer(['classic'])) return 20;
    return 10;
  }

  if (gameId === 'classic_era') {
    if (isEra) return 100;
    if (isProgression || isRetail || (isForever && !isEra)) return 0;
    if (isVanilla112) return 60;
    if (hasVer(['classic'])) return 20;
    return 10;
  }

  if (gameId === 'classic') {
    if (isProgression) return 100;
    if (isRetail || (isForever && !isProgression) || (isEra && !isProgression)) return 0;
    if (hasVer(['progression'])) return 50;
    return 0;
  }

  if (gameId === 'retail') {
    if (isRetail) return 100;
    if ((isForever || isEra || isProgression || isVanilla112) && !isRetail) return 0;
    return 10;
  }

  return 0;
}

function isFileCompatibleWithGame(file, gameId = 'forever') {
  return getFileScore(file, gameId) > 0;
}

async function getCandidateFiles(modId, gameId = 'forever') {
  try {
    const TAMANO_TANDA = 50;
    const MAX_TANDAS = 5;
    let allCandidates = [];

    for (let tanda = 0; tanda < MAX_TANDAS; tanda += 1) {
      const pagina = await getModFiles(modId, TAMANO_TANDA, tanda * TAMANO_TANDA);
      if (!Array.isArray(pagina) || pagina.length === 0) break;

      const scored = pagina
        .map(f => ({ file: f, score: getFileScore(f, gameId) }))
        .filter(item => item.score > 0);

      allCandidates.push(...scored);

      if (allCandidates.some(c => c.score >= 80)) {
        break;
      }

      if (pagina.length < TAMANO_TANDA) break;
    }

    if (allCandidates.length === 0) {
      return [];
    }

    allCandidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aRel = a.file.releaseType === 1 ? 1 : 0;
      const bRel = b.file.releaseType === 1 ? 1 : 0;
      if (bRel !== aRel) return bRel - aRel;
      return (b.file.id || 0) - (a.file.id || 0);
    });

    return allCandidates.map(c => c.file);
  } catch (err) {
    console.error(`[CurseForge] Error obteniendo candidatos para mod ${modId} en ${gameId}:`, err.message);
    return [];
  }
}

async function getLatestFile(modId, gameId = 'forever') {
  const candidates = await getCandidateFiles(modId, gameId);
  if (!candidates || candidates.length === 0) return null;
  const best = candidates[0];
  if (best && !best.downloadUrl) {
    best.downloadUrl = await getFileDownloadUrl(modId, best.id);
  }
  return best;
}

async function getFileDownloadUrl(modId, fileId) {
  try {
    const urlRes = await fetch(`${BASE_URL}/mods/${modId}/files/${fileId}/download-url`, {
      headers: {
        'x-api-key': CF_API_KEY,
        'Accept': 'application/json'
      }
    });
    if (!urlRes.ok) return null;
    const urlData = await urlRes.json();
    return urlData.data || null;
  } catch (err) {
    console.error(`[CurseForge] Error resolviendo downloadUrl (${modId}, ${fileId}):`, err.message);
    return null;
  }
}

module.exports = {
  searchAddons,
  getCandidateFiles,
  getFileScore,
  getModDetails,
  getModDescription,
  getModFiles,
  getLatestFile,
  getFileDownloadUrl,
  filterRequiredDependencies,
  isFileCompatibleWithGame
};
