/**
 * Notas de release de KoRForge, en un solo sitio.
 *
 * Antes estaban escritas a mano dentro de scripts/release-github.js y se quedaron congeladas:
 * la 1.1.6, la 1.1.7 y siguientes se publicaron en GitHub con el texto de la 1.1.5 (boton de
 * Buy Me a Coffee). Ahora las dos vias (GitHub y web) leen lo mismo: docs/CAMBIOS-ULTIMA.md.
 *
 * Formato de docs/CAMBIOS-ULTIMA.md:
 *   - opcional: "# Titulo: ..." para el titulo de la tarjeta y de la release
 *   - una linea por cambio, empezando por "- "
 *   - el resto de lineas que empiezan por "#" se ignoran
 */

const fs = require('fs');
const path = require('path');

const proyecto = path.resolve(__dirname, '..');
const cambiosPath = path.join(proyecto, 'docs', 'CAMBIOS-ULTIMA.md');

/** Lee el package.json del proyecto y devuelve su version. */
function versionActual(dir = proyecto) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
  return pkg.version || '1.0.0';
}

/**
 * Devuelve { version, titulo, cambios } leyendo docs/CAMBIOS-ULTIMA.md.
 * `titulo` es el titulo completo de la release, siempre con la version delante.
 */
function leerCambios(dir = proyecto) {
  const version = versionActual(dir);
  const ruta = path.join(dir, 'docs', 'CAMBIOS-ULTIMA.md');
  let titulo = `KoRForge v${version}`;
  let cambios = ['Nueva version de KoRForge'];

  if (!fs.existsSync(ruta)) {
    console.warn('  AVISO: no existe docs/CAMBIOS-ULTIMA.md; se usara texto generico.');
    return { version, titulo, cambios };
  }

  const lineas = fs.readFileSync(ruta, 'utf8').split(/\r?\n/);

  const tituloLinea = lineas.find((l) => /^#+\s*t[ií]tulo\s*:/i.test(l.trim()));
  if (tituloLinea) {
    const texto = tituloLinea.replace(/^#+\s*t[ií]tulo\s*:/i, '').trim();
    if (texto) titulo = texto.includes('KoRForge') ? texto : `KoRForge v${version} - ${texto}`;
  }

  cambios = lineas
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean);

  if (!cambios.length) {
    console.warn('  AVISO: docs/CAMBIOS-ULTIMA.md no tiene ninguna linea de cambio utilizable.');
    cambios = ['Nueva version de KoRForge'];
  }

  return { version, titulo, cambios };
}

/**
 * Cuerpo markdown de la release de GitHub.
 * Incluye los hashes: quedan con fecha en la release, que es la prueba de integridad y autoria.
 */
function notasGithub({ version, titulo, cambios, entradas, archivos }) {
  const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

  const listaCambios = cambios.map((c) => `- ${c}`).join('\n');

  const listaArchivos = (archivos || [])
    .map((a) => `- \`${a.nombre}\` (${mb(a.bytes)})${a.detalle ? ` - ${a.detalle}` : ''}`)
    .join('\n');

  const bloquesHash = (entradas || [])
    .map((e) => `${e.sha256}  ${e.archivo}`)
    .join('\n');

  return [
    `## ${titulo}`,
    '',
    '### Cambios y novedades',
    '',
    listaCambios,
    '',
    '### Archivos disponibles',
    '',
    listaArchivos,
    '- `SHA256SUMS.txt` - hashes de los binarios',
    '',
    '### Integridad (SHA-256)',
    '',
    '```',
    bloquesHash,
    '```',
    '',
    'Para comprobarlo en Windows:',
    '',
    '```powershell',
    `Get-FileHash .\\${(archivos && archivos[0] && archivos[0].nombre) || 'KoRForge-Setup-' + version + '.exe'} -Algorithm SHA256`,
    '```',
    '',
    'El hash tiene que coincidir con el de arriba. Si no coincide, el archivo no es el oficial.',
    '',
  ].join('\n');
}

module.exports = { leerCambios, versionActual, notasGithub };
