const CF_API_KEY = process.env.CF_API_KEY || '$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm';
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

function extractLatestVersion(latestFiles) {
  if (!latestFiles || !Array.isArray(latestFiles) || latestFiles.length === 0) return '';
  // Prefer release files (releaseType === 1), otherwise newest file
  const releaseFiles = latestFiles.filter(f => f.releaseType === 1);
  const target = releaseFiles.length > 0 
    ? releaseFiles[releaseFiles.length - 1] 
    : latestFiles[latestFiles.length - 1];
  
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
  pageSize = 30
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
      version: extractLatestVersion(mod.latestFiles),
      latestFiles: mod.latestFiles || []
    }));
  } catch (err) {
    console.error('[CurseForge] Error al buscar addons:', err.message);
    throw err;
  }
}

async function getModDetails(modId) {
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
      version: extractLatestVersion(mod.latestFiles),
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

function isFileCompatibleWithGame(file, gameId = 'forever') {
  if (!file || !Array.isArray(file.gameVersions) || file.gameVersions.length === 0) {
    return false;
  }
  const vers = file.gameVersions.map(v => String(v).toLowerCase());

  const hasAny = (prefixes) => vers.some(v => prefixes.some(p => v.includes(p) || v.startsWith(p)));
  const isOnlyRetail = vers.every(v => v.startsWith('11.') || v.startsWith('12.') || v.includes('retail') || v.includes('within'));
  const isOnlyClassic = vers.every(v => v.startsWith('1.12') || v.startsWith('1.14') || v.startsWith('1.15') || v.includes('classic'));

  if (gameId === 'forever') {
    // Forever 1.60.1 / Classic 1.12
    const isForeverOrClassic = hasAny(['1.60', '1.12', '1.15', '1.14', 'classic']);
    return isForeverOrClassic && !isOnlyRetail;
  }

  if (gameId === 'retail') {
    // The War Within 11.x / 12.x
    const isRetail = hasAny(['11.', '12.', 'retail', 'the war within']);
    return isRetail && !isOnlyClassic;
  }

  if (gameId === 'classic_era') {
    // Classic Era / Vanilla 1.15 / 1.12
    const isEra = hasAny(['1.15', '1.14', '1.12', 'classic era', 'vanilla']);
    const isProgOrRetail = hasAny(['11.', '12.', '4.4', '5.5', 'cataclysm', 'mists', 'pandaria']);
    return isEra && !isProgOrRetail;
  }

  if (gameId === 'classic') {
    // Classic Progression (Cataclysm 4.4 / MoP 5.5 / WotLK 3.4)
    const isProg = hasAny(['4.4', '5.5', '5.0', '3.4', 'cataclysm', 'mists', 'pandaria', 'progression']);
    return isProg && !isOnlyRetail;
  }

  return false;
}

/**
 * ¿El fichero está etiquetado para Retail (11.x / 12.x)?
 *
 * Los autores suelen etiquetar el MISMO fichero con Retail y con Classic (o suben el de Retail con
 * etiquetas de más). Pasó el 21-10-2026: en el cliente de MoP se instaló «TipTac Reborn» con un .toc
 * `Interface: 120100` (Retail) y el addon salía como incompatible aunque el juego lo cargara.
 */
function tieneEtiquetaRetail(file) {
  const vers = Array.isArray(file && file.gameVersions)
    ? file.gameVersions.map(v => String(v).toLowerCase())
    : [];
  return vers.some(v => v.startsWith('11.') || v.startsWith('12.') || v.includes('retail') || v.includes('within'));
}

async function getLatestFile(modId, gameId = 'forever') {
  try {
    /* Se miran VARIAS tandas de ficheros, no solo los más nuevos.
       Motivo (dueño, 21-10-2026): RareScanner en MoP Classic daba «no compatible file» y el addon
       sí tiene 45 ficheros de la rama 5.5.x; el problema era que los 25 más recientes son de Retail
       y de Forever. Un cliente puede tener su último fichero varias tandas más atrás, así que se baja
       por páginas de 50 (las más nuevas primero) hasta encontrar alguno compatible. Tope de 5 tandas
       para no encadenar peticiones: 250 ficheros de histórico. */
    const TAMANO_TANDA = 50;
    const MAX_TANDAS = 5;
    let compatibleFiles = [];

    for (let tanda = 0; tanda < MAX_TANDAS; tanda += 1) {
      const pagina = await getModFiles(modId, TAMANO_TANDA, tanda * TAMANO_TANDA);
      if (!Array.isArray(pagina) || pagina.length === 0) break;
      const compatibles = pagina.filter(f => isFileCompatibleWithGame(f, gameId));
      if (compatibles.length > 0) {
        compatibleFiles = compatibles;
        break;
      }
      if (pagina.length < TAMANO_TANDA) break; // se acabaron los ficheros
    }

    if (compatibleFiles.length === 0) {
      return null;
    }

    /* En los clientes Classic, si hay ficheros SIN etiqueta de Retail, esos mandan: son los que
       llevan el `Interface` del cliente. Si todos la llevan, se usa lo que haya (mejor eso que nada). */
    const esClienteClassic = gameId === 'classic' || gameId === 'classic_era';
    const sinRetail = compatibleFiles.filter(f => !tieneEtiquetaRetail(f));
    const candidatos = (esClienteClassic && sinRetail.length > 0) ? sinRetail : compatibleFiles;

    const validFile = candidatos.find(f => f.downloadUrl && f.releaseType === 1) || 
                      candidatos.find(f => f.downloadUrl) || 
                      candidatos[0];
    
    if (validFile && !validFile.downloadUrl) {
      const urlRes = await fetch(`${BASE_URL}/mods/${modId}/files/${validFile.id}/download-url`, {
        headers: { 'x-api-key': CF_API_KEY }
      });
      if (urlRes.ok) {
        const urlData = await urlRes.json();
        validFile.downloadUrl = urlData.data;
      }
    }

    return validFile;
  } catch (err) {
    console.error(`[CurseForge] Error obteniendo archivo para mod ${modId} en ${gameId}:`, err.message);
    return null;
  }
}

module.exports = {
  searchAddons,
  getModDetails,
  getModDescription,
  getModFiles,
  getLatestFile,
  filterRequiredDependencies,
  isFileCompatibleWithGame
};
