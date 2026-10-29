const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

let currentDownload = {
  status: 'idle', // 'idle' | 'downloading' | 'completed' | 'error'
  percent: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  speedMb: '0.0',
  error: null,
  filePath: null,
  version: null
};

function getDownloadProgress() {
  return currentDownload;
}

/* K12 (auditoría 22-10-2026): el token de `gh` se pide UNA vez y se cachea media hora; antes se
 * ejecutaba `gh auth token` en cada descarga. */
let tokenGhCache = { valor: null, hasta: 0 };

function getGitHubToken() {
  const ahora = Date.now();
  if (tokenGhCache.valor !== null && ahora < tokenGhCache.hasta) return tokenGhCache.valor;

  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null;
  if (!token) {
    try {
      const { execSync } = require('child_process');
      token = execSync('gh auth token', { stdio: 'pipe', encoding: 'utf-8' }).trim() || null;
    } catch (_) { token = null; }
  }
  tokenGhCache = { valor: token, hasta: ahora + 30 * 60 * 1000 };
  return token;
}

/* K5 (auditoría 22-10-2026): el instalador se descarga SIEMPRE del release oficial de ESA versión,
 * con el nombre canónico, y su SHA-256 se compara con el SHA256SUMS.txt publicado en el mismo
 * release antes de aplicarlo. La URL, la versión y el nombre de fichero que manda el cliente no se
 * usan tal cual: se reconstruyen aquí. */
const GITHUB_RELEASES_URL = 'https://github.com/korzor/KoRForge/releases/download';
const VERSION_VALIDA = /^\d+\.\d+\.\d+$/;

/* --- Marca de "actualización en curso" (23-10-2026) ----------------------
   La tarjeta de carga tiene que salir cuando la app vuelve a arrancar. No se puede fiar al
   argumento con el que el instalador relance la app (en las pruebas reales no llegaba), así que
   antes de lanzar el instalador se deja este fichero y la app que arranque después lo lee.
   main.js puede fijar global.rutaMarcaActualizacion con la carpeta de usuario real de Electron. */
function rutaDeMarcaActualizacion() {
  if (global.rutaMarcaActualizacion) return global.rutaMarcaActualizacion;
  const base = process.env.APPDATA || path.join(os.homedir(), '.config');
  return path.join(base, 'KoRForge', 'actualizando.json');
}

/** Escribe la marca: {version, cuando}. Devuelve true si pudo. */
function marcarActualizacionEnCurso(version) {
  try {
    const ruta = rutaDeMarcaActualizacion();
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.writeFileSync(ruta, JSON.stringify({
      version: String(version || ''),
      cuando: Date.now()
    }, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.warn('[KoRForge Updater] No se pudo dejar la marca de actualización:', err.message);
    return false;
  }
}

/** Lee y consume la marca. Devuelve {version, cuando} solo si es reciente (15 min). */
function leerMarcaActualizacion() {
  try {
    const ruta = rutaDeMarcaActualizacion();
    if (!fs.existsSync(ruta)) return null;
    /* Sin BOM: si la escribe otra herramienta (PowerShell), JSON.parse la rechaza. */
    const texto = fs.readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '');
    const datos = JSON.parse(texto);
    fs.unlinkSync(ruta);
    const edad = Date.now() - Number(datos && datos.cuando ? datos.cuando : 0);
    if (!(edad >= 0 && edad < 15 * 60 * 1000)) return null;
    return datos;
  } catch (err) {
    console.warn('[KoRForge Updater] Marca de actualización ilegible:', err.message);
    return null;
  }
}

function esVersionValida(version) {
  return typeof version === 'string' && VERSION_VALIDA.test(version.trim());
}

/** Plataforma de la actualización: 'linux' (AppImage) o 'win32' (instalador NSIS). */
function plataformaActual() {
  return process.platform === 'linux' ? 'linux' : 'win32';
}

/** Nombre canónico del binario de ESTA versión en el release según la plataforma.
 *  23-10-2026 (dueño): nombres más amigables. Antes eran `KoRForge-Setup-<v>.exe` y
 *  `KoRForge-<v>-linux-x86_64.AppImage`; ahora `KoRForge-<v>-Windows.exe` y `KoRForge-<v>-Linux.AppImage`.
 *  Ojo: en la web y en la release se leen como «KoRForge 1.2.43 · Windows» / «· Linux», con espacios,
 *  pero el FICHERO va con guiones (un espacio en una URL acaba en %20 y complica todo). */
function nombreDelAsset(version, plataforma = plataformaActual()) {
  return plataforma === 'linux'
    ? `KoRForge-${version}-Linux.AppImage`
    : `KoRForge-${version}-Windows.exe`;
}

/** Nombres antiguos del binario (para poder actualizar desde versiones anteriores al cambio). */
function nombresDeAssetAntiguos(version, plataforma = plataformaActual()) {
  return plataforma === 'linux'
    ? [`KoRForge-${version}-linux-x86_64.AppImage`]
    : [`KoRForge-Setup-${version}.exe`];
}

function urlInstaladorOficial(version, plataforma = plataformaActual()) {
  return `${GITHUB_RELEASES_URL}/v${version}/${nombreDelAsset(version, plataforma)}`;
}

/** URL del binario mirando los assets REALES del release: primero el nombre nuevo, luego los
 *  antiguos y, si no aparece ninguno, cualquier asset que sea el binario de esa versión. Así el
 *  cambio de nombres (o un futuro renombrado) no deja a nadie sin actualización. */
function urlDelAssetEnRelease(release, version, plataforma = plataformaActual()) {
  const assets = Array.isArray(release && release.assets) ? release.assets : [];
  const nombres = [nombreDelAsset(version, plataforma), ...nombresDeAssetAntiguos(version, plataforma)];
  for (const nombre of nombres) {
    const encontrado = assets.find((a) => a && a.name === nombre);
    if (encontrado && encontrado.browser_download_url) return encontrado.browser_download_url;
  }
  const extension = plataforma === 'linux' ? /\.AppImage$/i : /\.exe$/i;
  const suelto = assets.find((a) => a && extension.test(a.name || '')
    && String(a.name).includes(version) && !/SHA256SUMS/i.test(a.name || ''));
  if (suelto && suelto.browser_download_url) return suelto.browser_download_url;
  return urlInstaladorOficial(version, plataforma);
}

function urlSha256Sums(version) {
  return `${GITHUB_RELEASES_URL}/v${version}/SHA256SUMS.txt`;
}

/** URL de asset de la API de GitHub (modo con token): solo del repo del proyecto. */
function esUrlDeAssetPermitida(url) {
  return /^https:\/\/api\.github\.com\/repos\/korzor\/KoRForge\/releases\/assets\/\d+$/.test(String(url || ''));
}

/** La URL de descarga aceptada: un binario (.exe / .AppImage) de la release oficial de ESA versión,
 *  con cualquier nombre (asi el renombrado de ficheros no bloquea la actualizacion), o un asset de
 *  la API de GitHub. Sigue sin valer cualquier URL de fuera: repo y version van fijados. */
function esUrlDeInstalador(url, version) {
  if (!esVersionValida(version)) return false;
  const recibida = String(url || '');
  const decodificada = (() => { try { return decodeURI(recibida); } catch (_) { return recibida; } })();
  const base = `${GITHUB_RELEASES_URL}/v${version.trim()}/`;
  for (const candidata of [recibida, decodificada]) {
    if (!candidata.startsWith(base)) continue;
    const nombre = candidata.slice(base.length);
    if (/^[^/\\?#]+\.(exe|AppImage)$/i.test(nombre)) return true;
  }
  return esUrlDeAssetPermitida(recibida);
}

/** ¿El fichero vive directamente en el directorio temporal (sin escaparse)? */
function estaEnTemporal(ruta) {
  return path.resolve(path.dirname(ruta)) === path.resolve(os.tmpdir());
}

/** SHA-256 de un archivo, leyéndolo por trozos. */
async function sha256DeArchivo(ruta) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const lector = fs.createReadStream(ruta);
    lector.on('data', (trozo) => hash.update(trozo));
    lector.on('error', reject);
    lector.on('end', () => resolve(hash.digest('hex')));
  });
}

/** SHA-256 del instalador oficial según el SHA256SUMS.txt del release de esa versión. */
async function sha256OficialDe(version) {
  const res = await fetch(urlSha256Sums(version), {
    headers: { 'User-Agent': 'KoRForge-InAppUpdater/1.0 (Windows NT 10.0; Win64; x64)' }
  });
  if (!res.ok) {
    throw new Error(`No se pudo leer SHA256SUMS.txt del release v${version} (HTTP ${res.status}): actualización cancelada.`);
  }
  const texto = await res.text();
  const nombre = nombreDelAsset(version);
  for (const linea of texto.split(/\r?\n/)) {
    const partes = linea.trim().split(/\s+/);
    if (partes.length === 2 && partes[1] === nombre && /^[0-9a-f]{64}$/i.test(partes[0])) {
      return partes[0].toLowerCase();
    }
  }
  throw new Error(`SHA256SUMS.txt del release v${version} no incluye ${nombre}: actualización cancelada.`);
}

async function startUpdateDownload(downloadUrl, version) {
  if (currentDownload.status === 'downloading') {
    return { status: 'already_running', progress: currentDownload };
  }

  const versionLimpia = String(version || '').trim();
  if (!esVersionValida(versionLimpia)) {
    throw new Error('Versión de actualización no válida.');
  }
  if (!esUrlDeInstalador(downloadUrl, versionLimpia)) {
    throw new Error('URL de actualización no válida: debe ser la del release oficial de KoRForge.');
  }

  /* Nombre canónico y fichero dentro del temporal (K5b: ni la versión ni el nombre del cliente
     deciden dónde se escribe el instalador). */
  const fileName = nombreDelAsset(versionLimpia);
  const targetPath = path.join(os.tmpdir(), fileName);
  if (!estaEnTemporal(targetPath)) {
    throw new Error('Ruta de descarga fuera del directorio temporal.');
  }

  /* K-D8: la descarga se puede cancelar desde la ventana (AbortController). */
  const abortController = new AbortController();

  currentDownload = {
    status: 'downloading',
    percent: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speedMb: '0.0',
    error: null,
    filePath: targetPath,
    version: versionLimpia,
    sha256: null,
    abortController
  };

  try {
    let fetchUrl = downloadUrl;
    const headers = {
      'User-Agent': 'KoRForge-InAppUpdater/1.0 (Windows NT 10.0; Win64; x64)'
    };
    if (downloadUrl.includes('api.github.com')) {
      headers['Accept'] = 'application/octet-stream';
      const token = getGitHubToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    let res = await fetch(fetchUrl, {
      headers,
      redirect: 'manual',
      signal: abortController.signal
    });

    // If GitHub returns 302 Found, redirect to asset storage (S3) without Authorization header to avoid auth errors
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const redirectUrl = res.headers.get('location');
      res = await fetch(redirectUrl, {
        headers: {
          'User-Agent': 'KoRForge-InAppUpdater/1.0 (Windows NT 10.0; Win64; x64)'
        },
        redirect: 'follow',
        signal: abortController.signal
      });
    }

    if (!res.ok) {
      throw new Error(`Error HTTP ${res.status}: ${res.statusText}`);
    }

    const total = parseInt(res.headers.get('content-length') || '0', 10);
    currentDownload.totalBytes = total;

    const fileStream = fs.createWriteStream(targetPath, { highWaterMark: 1024 * 1024 });
    const reader = res.body.getReader();
    let received = 0;
    let lastTime = Date.now();
    let lastBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = Buffer.from(value);
      fileStream.write(chunk);
      received += chunk.length;
      currentDownload.downloadedBytes = received;

      if (total > 0) {
        currentDownload.percent = Math.min(100, Math.round((received / total) * 100));
      }

      const now = Date.now();
      const intervalSec = (now - lastTime) / 1000;
      if (intervalSec >= 0.7) {
        const instantSpeed = (received - lastBytes) / (1024 * 1024) / intervalSec;
        currentDownload.speedMb = instantSpeed.toFixed(1);
        lastTime = now;
        lastBytes = received;
      }
    }

    await new Promise((resolve, reject) => {
      fileStream.end();
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    currentDownload.status = 'completed';
    currentDownload.percent = 100;

    /* K5: el fichero descargado tiene que ser EXACTAMENTE el publicado en el release. */
    const esperado = await sha256OficialDe(versionLimpia);
    const obtenido = await sha256DeArchivo(targetPath);
    if (obtenido !== esperado) {
      currentDownload.status = 'error';
      currentDownload.error = 'El SHA-256 del instalador no coincide con el publicado en el release: actualización cancelada.';
      try { fs.rmSync(targetPath, { force: true }); } catch (_) {}
      throw new Error(currentDownload.error);
    }
    currentDownload.sha256 = esperado;

    return { success: true, filePath: targetPath, sha256: esperado };
  } catch (err) {
    if (err && err.name === 'AbortError') {
      /* K-D8: cancelada por el usuario: sin error y sin fichero a medias. */
      currentDownload.status = 'cancelled';
      currentDownload.error = null;
      try { fs.rmSync(targetPath, { force: true }); } catch (_) {}
      return { status: 'cancelled' };
    }
    currentDownload.status = 'error';
    currentDownload.error = err.message;
    console.error('[KoRForge Updater] Error descargando actualización:', err.message);
    throw err;
  }
}

/** K-D8: cancela la descarga en curso (botón «Cancelar» del modal de actualización). */
function cancelUpdateDownload() {
  if (!currentDownload || currentDownload.status !== 'downloading') {
    return { status: currentDownload ? currentDownload.status : 'idle' };
  }
  try { if (currentDownload.abortController) currentDownload.abortController.abort(); } catch (_) {}
  if (currentDownload.filePath) {
    try { fs.rmSync(currentDownload.filePath, { force: true }); } catch (_) {}
  }
  currentDownload = {
    status: 'cancelled', percent: 0, downloadedBytes: 0, totalBytes: 0,
    speedMb: '0.0', error: null, filePath: null, version: null, sha256: null, abortController: null
  };
  return { status: 'cancelled' };
}

// Textos de la tarjeta de carga que se pinta mientras se aplica la actualización.
// Es interfaz nativa (el proceso que instala no puede leer i18n.js), así que vive aquí,
// en todos los idiomas, igual que TRAY_TEXTS (docs/REGLAS-IDIOMAS.md). El idioma lo manda
// la ventana al pedir el reinicio. {version} lo rellena buildApplyScript.
const SPLASH_TEXTS = {
  en: { instalando: 'Updating KoRForge to {version}...', abriendo: 'Opening KoRForge...' },
  es: { instalando: 'Actualizando KoRForge a la {version}...', abriendo: 'Abriendo KoRForge...' },
  gl: { instalando: 'Actualizando KoRForge á {version}...', abriendo: 'Abrindo KoRForge...' },
  fr: { instalando: 'Mise à jour de KoRForge vers {version}...', abriendo: 'Ouverture de KoRForge...' },
  it: { instalando: 'Aggiornamento di KoRForge alla {version}...', abriendo: 'Apertura di KoRForge...' },
  ru: { instalando: 'Обновление KoRForge до {version}...', abriendo: 'Открытие KoRForge...' },
  zh: { instalando: '正在将 KoRForge 更新到 {version}...', abriendo: '正在打开 KoRForge...' },
  ko: { instalando: 'KoRForge를 {version} 버전으로 업데이트하는 중...', abriendo: 'KoRForge를 여는 중...' },
  ja: { instalando: 'KoRForge を {version} に更新しています...', abriendo: 'KoRForge を開いています...' }
};

function textosSplash(lang) {
  return SPLASH_TEXTS[String(lang || '').toLowerCase()] || SPLASH_TEXTS.en;
}

// Generador del runner que aplica la actualización.
// OJO: se ejecuta el proceso tal como está en el .ps1; no debe abrir consolas ni pings.
// Si se toca, comprobarlo con la sonda de ventanas (scripts/verificar-actualizador-silencioso.js).
// Deja rastro en %TEMP%\korforge_apply_update.log para poder diagnosticar una actualización.
//
// TIEMPOS (20-10-2026): antes había 2 s de margen + 3 s fijos tras instalar + 8 s a ciegas
// esperando a que la app arrancase: ~13 s tirados de los ~28 s que tardaba el ciclo. Ahora
// solo se espera lo que de verdad hace falta: se comprueba la versión instalada en
// resources/app/package.json (señal real de que el instalador ha acabado) y se sondea el
// proceso de la app cada 200 ms. El instalador en silencio sigue siendo lo más lento (~13 s).
//
// FIN DEL UPDATE = CUANDO TERMINA EL INSTALADOR, NO UN RELOJ (24-10-2026). Dueño: *«entra el update
// y a medio camino entra la ventana de la app por detrás… se cierra de nuevo y luego vuelve a
// abrir… solo quiero que se cierre la ventana de update cuando termine el update de verdad, y
// después que se abra la app»*. El fallo: el paso 3 buscaba el proceso del instalador por NOMBRE
// (`KoRForge-Setup*`), nombre que dejó de existir cuando los binarios pasaron a llamarse
// `KoRForge-<version>-Windows.exe`; al no encontrarlo nunca, el bucle caía en un tope de 10 s y
// daba la instalación por buena con el instalador aún escribiendo. Ahora se espera al PROCESO que
// lanzamos (`-PassThru`/`HasExited`) y a la versión instalada; la tarjeta se cierra justo entonces
// y la app se abre después, una sola vez (el instalador ya no la abre por su cuenta).
//
// SPLASH (20-10-2026, dueño): entre cerrar la app y que la nueva arranque pasan ~10 s con el
// escritorio vacío. El runner pinta lo primero una tarjeta con el logo (el mismo splash.png)
// y avisa a la app con un fichero bandera para que solo entonces se cierre: así el logo está
// en pantalla todo el rato y no hay hueco. La tarjeta se cierra cuando la app nueva ya pinta.
function buildApplyScript(installerPath, appExePath, targetVersion, opciones = {}) {
  const psQuote = (p) => `'${String(p).replace(/'/g, "''")}'`;
  const versionEsperada = String(targetVersion || '').replace(/^v/i, '');
  const textos = textosSplash(opciones.lang);
  // La versión a la que se actualiza se ve en la tarjeta: {version} en todos los idiomas
  const textoInstalando = textos.instalando.split('{version}').join(versionEsperada || '');
  const splashPng = opciones.splashPng || '';
  const flagFile = opciones.flagFile || path.join(os.tmpdir(), 'korforge_splash_listo');
  // Área física de la pantalla donde está la app: la tarjeta sale ahí, no en el monitor principal
  const pantalla = opciones.pantalla || null;
  const num = (v) => (Number.isFinite(v) ? String(Math.round(v)) : '$null');
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '',
    '# Registro: si una actualización falla, en %TEMP%\\korforge_apply_update.log queda el porqué',
    "$logFile = Join-Path $env:TEMP 'korforge_apply_update.log'",
    'function Log([string]$texto) {',
    "  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'",
    "  Add-Content -LiteralPath $logFile -Value \"[$stamp] $texto\" -Encoding UTF8",
    '}',
    'Log \'--- Aplicando actualización ---\'',
    '',
    `$installer = ${psQuote(installerPath)}`,
    `$appExe = ${psQuote(appExePath)}`,
    `$targetVersion = ${psQuote(versionEsperada)}`,
    `$splashOrigen = ${psQuote(splashPng)}`,
    `$flagSplash = ${psQuote(flagFile)}`,
    `$textoInstalando = ${psQuote(textoInstalando)}`,
    `$textoAbriendo = ${psQuote(textos.abriendo)}`,
    `$pantallaX = ${num(pantalla && pantalla.x)}`,
    `$pantallaY = ${num(pantalla && pantalla.y)}`,
    `$pantallaAncho = ${num(pantalla && pantalla.width)}`,
    `$pantallaAlto = ${num(pantalla && pantalla.height)}`,
    `$escalaElectron = ${Number.isFinite(pantalla && pantalla.escala) && pantalla.escala > 0 ? String(pantalla.escala) : '$null'}`,
    "$pkgRuta = Join-Path (Split-Path -Parent $appExe) 'resources\\app.asar.unpacked\\package.json'",
    "if (-not (Test-Path -LiteralPath $pkgRuta)) { $pkgRuta = Join-Path (Split-Path -Parent $appExe) 'resources\\app\\package.json' }",
    'function VersionInstalada {',
    '  try {',
    '    $v = (Get-Content -LiteralPath $pkgRuta -Raw | ConvertFrom-Json).version',
    '    if ($v) { return [string]$v }',
    '  } catch {}',
    "  return ''",
    '}',
    '',
    '# --- Tarjeta de carga: lo primero que se pinta ---------------------------',
    '# Se usa WinForms porque este proceso no es Electron. Se bombea la cola de mensajes',
    '# (DoEvents) en todas las esperas para que la ventana no se quede en blanco ni "colgada".',
    '#',
    '# DPI (21-10-2026, dueño: "tiene que salir en el centro en cualquier monitor, resolucion y',
    '# escala"): NO se hacen cuentas de DPI. PowerShell es DPI-unaware y Windows le da un',
    '# escritorio virtualizado (2560x1440 al 125% lo ve como 2048x1152), y eso no se puede',
    '# cambiar porque la awareness viene fijada en el manifiesto de powershell.exe. Por eso se',
    '# pregunta a Windows, en su mismo espacio de coordenadas, que monitor tiene delante la ventana',
    '# de KoRForge (Rect-VentanaApp + Screen.FromRectangle) y se centra ahi. La tarjeta es otra',
    '# ventana del mismo proceso, asi que Windows la pinta con la misma transformacion.',
    '# NO volver a mezclar pixeles fisicos de Electron con coordenadas de este proceso:',
    '$script:formSplash = $null',
    '$script:barraSplash = $null',
    '$script:timerSplash = $null',
    '$script:lblSplash = $null',
    '',
    '# Rectangulo de la ventana de KoRForge, tal y como lo ve ESTE proceso (mismo espacio de',
    '# coordenadas que usara la tarjeta, con lo que el DPI y la escala dan igual).',
    '# Devuelve un System.Drawing.Rectangle o $null si la app ya no tiene ventana visible.',
    'function Rect-VentanaApp {',
    '  try {',
    '    Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class KorforgeVentana {',
    '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }',
    '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);',
    '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
    '  public static int[] Medir(IntPtr h) {',
    '    if (h == IntPtr.Zero || !IsWindowVisible(h)) return null;',
    '    RECT r;',
    '    if (!GetWindowRect(h, out r)) return null;',
    '    return new int[] { r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top };',
    '  }',
    '}',
    '"@',
    '    $proc = Get-Process -Name KoRForge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1',
    '    if (-not $proc) { return $null }',
    '    $medidas = [KorforgeVentana]::Medir($proc.MainWindowHandle)',
    '    if (-not $medidas) { return $null }',
    '    if ($medidas[2] -le 0 -or $medidas[3] -le 0) { return $null }',
    '    return New-Object System.Drawing.Rectangle($medidas[0], $medidas[1], $medidas[2], $medidas[3])',
    '  } catch { return $null }',
    '}',
    'function Pulso { try { [System.Windows.Forms.Application]::DoEvents() } catch {} }',
    '',
    '# Detector de "la app ya pinto su ventana": se usa al reabrir KoRForge para quitar la tarjeta',
    '# justo cuando la app empieza a mostrarse (su splash), medio segundo antes de estar lista.',
    '# OJO: no vale Get-Process MainWindowHandle, porque el splash de la app no sale en la barra',
    '# de tareas (WS_EX_TOOLWINDOW) y .NET lo ignora como ventana principal.',
    'function Cargar-DetectorVentanas {',
    '  try {',
    '    Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class KorforgeVentanas {',
    '  delegate bool EnumProc(IntPtr h, IntPtr p);',
    '  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);',
    '  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);',
    '  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
    '  public static bool TieneVentana(uint[] pids) {',
    '    bool visto = false;',
    '    EnumWindows(delegate(IntPtr h, IntPtr p) {',
    '      if (!IsWindowVisible(h)) return true;',
    '      uint pid; GetWindowThreadProcessId(h, out pid);',
    '      if (Array.IndexOf(pids, pid) >= 0) { visto = true; return false; }',
    '      return true;',
    '    }, IntPtr.Zero);',
    '    return visto;',
    '  }',
    '}',
    '"@',
    '    return $true',
    '  } catch { return $false }',
    '}',
    '',
    'function Esperar([int]$ms) {',
    '  $fin = (Get-Date).AddMilliseconds($ms)',
    '  while ((Get-Date) -lt $fin) {',
    '    Pulso',
    '    Start-Sleep -Milliseconds 40',
    '  }',
    '}',
    '',
    'function global:Camino-Redondeado([int]$w, [int]$h, [int]$r) {',
    '  $camino = New-Object System.Drawing.Drawing2D.GraphicsPath',
    '  $diam = $r * 2',
    '  if ($diam -lt 4) { $diam = 4 }',
    '  $x2 = $w - $diam - 1',
    '  $y2 = $h - $diam - 1',
    '  $camino.AddArc(0, 0, $diam, $diam, 180, 90)',
    '  $camino.AddArc($x2, 0, $diam, $diam, 270, 90)',
    '  $camino.AddArc($x2, $y2, $diam, $diam, 0, 90)',
    '  $camino.AddArc(0, $y2, $diam, $diam, 90, 90)',
    '  $camino.CloseFigure()',
    '  return $camino',
    '}',
    '$script:escalaVisual = 1.0',
    'function global:T([double]$valor) { return [int][math]::Round($valor * $script:escalaVisual) }',
    '',
    'function Abrir-Splash {',
    '  try {',
    '    # La copia se hace ANTES de instalar: el instalador sobrescribe la carpeta de la app',
    '    $copia = Join-Path $env:TEMP \'korforge_splash.png\'',
    '    if (Test-Path -LiteralPath $splashOrigen) { Copy-Item -LiteralPath $splashOrigen -Destination $copia -Force }',
    '    Add-Type -AssemblyName System.Windows.Forms',
    '    Add-Type -AssemblyName System.Drawing',
    '    # MONITOR Y CENTRADO (21-10-2026, tercera vuelta: "tiene que salir en el centro en cualquier',
    '    # monitor, resolucion y porcentaje de escala"):',
    '    #',
    '    # El problema de fondo: este proceso es DPI-UNWARE, asi que Windows le da un escritorio',
    '    # virtualizado (un 2560x1440 al 125% lo ve como 2048x1152) y cualquier cuenta hecha con',
    '    # coordenadas fisicas de Electron se descuadra. Y no se puede arreglar: PowerShell ya trae',
    '    # la awareness fijada en su manifiesto, asi que SetProcessDpiAwarenessContext no hace nada.',
    '    #',
    '    # Solucion: no se hace ninguna cuenta de DPI. Se le pregunta a Windows, EN SU MISMO ESPACIO',
    '    # de coordenadas, que monitor y que tamano tiene, y se centra ahi. Como la tarjeta es otra',
    '    # ventana del mismo proceso, Windows la pinta con la misma transformacion y el centro',
    '    # coincide exacto en cualquier pantalla y a cualquier escala.',
    '    $rectApp = Rect-VentanaApp',
    '    $pantalla = $null',
    '    if ($rectApp) { $pantalla = [System.Windows.Forms.Screen]::FromRectangle($rectApp) }',
    '    if (-not $pantalla) { $pantalla = [System.Windows.Forms.Screen]::PrimaryScreen }',
    '    $area = $pantalla.Bounds',
    '    $bx = $area.X',
    '    $by = $area.Y',
    '    $bw = $area.Width',
    '    $bh = $area.Height',
    '    # TAMAÑO SEGUN LA PANTALLA: 560x372 es la referencia en 1920x1080; en un 4K crece hasta el',
    '    # doble y en un portatil pequeno baja al 75%. Se mira ancho y alto y se coge el menor.',
    '    $factor = $bw / 1920.0',
    '    if ($factor -lt 0.75) { $factor = 0.75 }',
    '    if ($factor -gt 2.2) { $factor = 2.2 }',
    '    $factorAlto = $bh / 1080.0',
    '    if ($factorAlto -lt 0.75) { $factorAlto = 0.75 }',
    '    if ($factorAlto -gt 2.2) { $factorAlto = 2.2 }',
    '    if ($factorAlto -lt $factor) { $factor = $factorAlto }',
    '    $script:escalaVisual = $factor',
    '    $ancho = T 560',
    '    $alto = T 372',
    '    $margen = [math]::Max(8, (T 18))',
    '    $form = New-Object System.Windows.Forms.Form',
    "    $form.FormBorderStyle = 'None'",
    "    $form.StartPosition = 'Manual'",
    '    $form.Location = New-Object System.Drawing.Point([int][math]::Round($bx + (($bw - $ancho) / 2)), [int][math]::Round($by + (($bh - $alto) / 2)))',
    '    $form.TopMost = $true',
    '    $form.ShowInTaskbar = $false',
    "    $form.Text = 'KoRForge'",
    '    $form.BackColor = [System.Drawing.Color]::FromArgb(11, 16, 24)',
    '    $form.ClientSize = New-Object System.Drawing.Size($ancho, $alto)',
    '    # ESQUINAS Y REBORDE (dueno, 23-10-2026: "los bordes de la ventana de update estan mal',
    '    # redondeados, mal recortados, pon un reborde bueno dorado tambien").',
    '    #',
    '    # POR QUE SE VEIA MAL: el recorte de la ventana (Region) lo hace Windows por pixeles enteros,',
    '    # asi que las esquinas salian a escalones, y encima no habia ningun borde que las rematara.',
    '    # Ahora el radio se calcula UNA vez y el MISMO camino se usa para recortar y para pintar:',
    '    # relleno oscuro + reborde dorado en degradado (con suavizado) + una linea fina por dentro.',
    '    # La Region va 1 px por fuera del dorado, de modo que el corte duro queda escondido detras',
    '    # del borde y lo que se ve es una esquina limpia con filo dorado.',
    '    $script:radio = [math]::Max(10, (T 16))',
    '    $script:oro1 = [System.Drawing.Color]::FromArgb(245, 158, 11)',
    '    $script:oro2 = [System.Drawing.Color]::FromArgb(251, 191, 36)',
    '    $form.Region = New-Object System.Drawing.Region((Camino-Redondeado $ancho $alto ($script:radio + 1)))',
    '    $form.Add_Paint({',
    '      param($emisor, $ev)',
    '      try {',
    '        $g = $ev.Graphics',
    '        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias',
    '        $w = $emisor.ClientSize.Width',
    '        $h = $emisor.ClientSize.Height',
    '        $camino = Camino-Redondeado $w $h ($script:radio + 1)',
    '        $brocha = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(11, 16, 24))',
    '        $g.FillPath($brocha, $camino)',
    '        $brocha.Dispose()',
    '        $caja = New-Object System.Drawing.Rectangle(0, 0, $w, $h)',
    '        $degradado = New-Object System.Drawing.Drawing2D.LinearGradientBrush($caja, $script:oro1, $script:oro2, 45.0)',
    '        $pluma = New-Object System.Drawing.Pen($degradado, [math]::Max(2.0, (T 2)))',
    '        $pluma.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset',
    '        $g.DrawPath($pluma, $camino)',
    '        $pluma.Dispose()',
    '        $degradado.Dispose()',
    '        $camino.Dispose()',
    '        # Linea interior fina: remata el reborde y disimula del todo el recorte de las esquinas.',
    '        $interior = Camino-Redondeado ($w - 8) ($h - 8) ([math]::Max(4, ($script:radio - 3)))',
    '        $matriz = New-Object System.Drawing.Drawing2D.Matrix',
    '        $matriz.Translate(4, 4)',
    '        $interior.Transform($matriz)',
    '        $plumaFina = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 245, 158, 11), 1.0)',
    '        $g.DrawPath($plumaFina, $interior)',
    '        $plumaFina.Dispose()',
    '        $interior.Dispose()',
    '        $matriz.Dispose()',
    '      } catch {}',
    '    })',
    '    if (Test-Path -LiteralPath $copia) {',
    '      $pic = New-Object System.Windows.Forms.PictureBox',
    '      $pic.SizeMode = \'StretchImage\'',
    '      # Mismo color que el relleno de la tarjeta: el PNG trae margenes transparentes y sin esto',
    '      # se verian como un rectangulo pegado dentro del reborde.',
    '      $pic.BackColor = [System.Drawing.Color]::FromArgb(11, 16, 24)',
    '      # SEPARADO DEL REBORDE (dueno, 23-10-2026): el logo iba de borde a borde y tapaba el dorado',
    '      # de los lados. Ahora deja 20 px por cada lado y el arte entra ENTERO sin deformarse',
    '      # (`Zoom` = cabe dentro de la caja manteniendo la proporcion; el PNG tiene 1200x630).',
    '      $pic.SizeMode = \'Zoom\'',
    '      $pic.Location = New-Object System.Drawing.Point((T 20), (T 14))',
    '      $pic.Size = New-Object System.Drawing.Size((T 520), (T 272))',
    '      # El arte se reescala con interpolacion buena y con su proporcion (cabe entero, sin recortes)',
    '      try {',
    '        $origenLogo = [System.Drawing.Image]::FromFile($copia)',
    '        $logo = New-Object System.Drawing.Bitmap($pic.Width, $pic.Height)',
    '        $g = [System.Drawing.Graphics]::FromImage($logo)',
    '        $g.Clear([System.Drawing.Color]::FromArgb(11, 16, 24))',
    '        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic',
    '        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality',
    '        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality',
    '        $escalaArte = [math]::Min($pic.Width / $origenLogo.Width, $pic.Height / $origenLogo.Height)',
    '        $anchoArte = [int][math]::Round($origenLogo.Width * $escalaArte)',
    '        $altoArte = [int][math]::Round($origenLogo.Height * $escalaArte)',
    '        $g.DrawImage($origenLogo, [int](($pic.Width - $anchoArte) / 2), [int](($pic.Height - $altoArte) / 2), $anchoArte, $altoArte)',
    '        $g.Dispose()',
    '        $origenLogo.Dispose()',
    '        $pic.Image = $logo',
    '      } catch { $pic.Image = [System.Drawing.Image]::FromFile($copia) }',
    '      $form.Controls.Add($pic)',
    '    }',
    '    $lbl = New-Object System.Windows.Forms.Label',
    '    $lbl.AutoSize = $false',
    '    $lbl.TextAlign = \'MiddleCenter\'',
    '    # EL TEXTO NO PUEDE TOCAR LOS LADOS (dueno, 24-10-2026: *"ambos lados de la tarjeta salen',
    '    # rotos, sin borde"*): con el ancho entero, su fondo tapaba el reborde dorado a esa altura.',
    '    # Ahora deja 12 px por cada lado y lleva el mismo color que el relleno.',
    '    $lbl.Location = New-Object System.Drawing.Point((T 12), (T 306))',
    '    $lbl.Size = New-Object System.Drawing.Size(($ancho - (T 24)), [math]::Max(16, (T 24)))',
    '    $lbl.BackColor = [System.Drawing.Color]::FromArgb(11, 16, 24)',
    "    $lbl.Font = New-Object System.Drawing.Font('Segoe UI', [math]::Max(7, (9 * $e)), [System.Drawing.FontStyle]::Bold)",
    '    $lbl.ForeColor = [System.Drawing.Color]::FromArgb(241, 245, 249)',
    '    $lbl.Text = $textoInstalando',
    '    $form.Controls.Add($lbl)',
    '    # Barra de progreso animada (misma idea que la del splash de la app)',
    '    $altoBarra = [math]::Max(2, (T 3))',
    '    $fondo = New-Object System.Windows.Forms.Panel',
    '    $fondo.Location = New-Object System.Drawing.Point([int][math]::Round(($ancho - (T 200)) / 2), (T 340))',
    '    $fondo.Size = New-Object System.Drawing.Size((T 200), $altoBarra)',
    '    $fondo.BackColor = [System.Drawing.Color]::FromArgb(42, 52, 68)',
    '    $form.Controls.Add($fondo)',
    '    $barra = New-Object System.Windows.Forms.Panel',
    '    $barra.Size = New-Object System.Drawing.Size((T 84), $altoBarra)',
    '    $script:posInicio = -(T 84)',
    '    $script:posFin = (T 200)',
    '    $script:posPaso = [math]::Max(1, (T 6))',
    '    $script:posBarra = $script:posInicio',
    '    $barra.Location = New-Object System.Drawing.Point($script:posInicio, 0)',
    '    $barra.BackColor = [System.Drawing.Color]::FromArgb(245, 158, 11)',
    '    $fondo.Controls.Add($barra)',
    '    $script:barraSplash = $barra',
    '    $script:lblSplash = $lbl',
    '    $timer = New-Object System.Windows.Forms.Timer',
    '    $timer.Interval = 16',
    '    $timer.Add_Tick({',
    '      $script:posBarra = $script:posBarra + $script:posPaso',
    '      if ($script:posBarra -gt $script:posFin) { $script:posBarra = $script:posInicio }',
    '      if ($script:barraSplash) { $script:barraSplash.Left = $script:posBarra }',
    '    })',
    '    $timer.Start()',
    '    $script:timerSplash = $timer',
    '    $form.Show()',
    '    Pulso',
    '    Pulso',
    '    Pulso',
    '    $script:formSplash = $form',
    '    Log ("Tarjeta: pantalla=" + $area.X + "," + $area.Y + " " + $area.Width + "x" + $area.Height + " electron=" + $pantallaX + "," + $pantallaY + " " + $pantallaAncho + "x" + $pantallaAlto + " escala=" + $escalaElectron + " factor=" + [math]::Round($factor, 3) + " -> " + $form.Location.X + "," + $form.Location.Y + " " + $form.Width + "x" + $form.Height)',
    '    return $true',
    '  } catch {',
    "    Log ('Splash: no se pudo abrir: ' + $_.Exception.Message)",
    '    return $false',
    '  }',
    '}',
    '',
    'function Cerrar-Splash {',
    '  try { if ($script:timerSplash) { $script:timerSplash.Stop() } } catch {}',
    '  try { if ($script:formSplash -and -not $script:formSplash.IsDisposed) { $script:formSplash.Close(); $script:formSplash.Dispose() } } catch {}',
    '  $script:formSplash = $null',
    '  $script:timerSplash = $null',
    '}',
    '',
    '# 0. Tarjeta de carga primero, y avisar a la app de que ya está en pantalla',
    "Log 'Paso 0: abriendo la tarjeta de carga'",
    '$splashAbierto = Abrir-Splash',
    'if ($splashAbierto) { Set-Content -LiteralPath $flagSplash -Value \'listo\' -Encoding ASCII }',
    'Log ("Paso 0: tarjeta " + $(if ($splashAbierto) { \'abierta\' } else { \'no disponible\' }))',
    '',
    'try {',
    '',
    '# 1. Margen mínimo: solo para que la respuesta HTTP que disparó esto llegue a salir',
    "#    (la app espera su bandera y se cierra sola; aquí queda la red de seguridad)",
    "  Log 'Paso 1: margen inicial'",
    '  Esperar 300',
    '',
    '# 2. Cerrar KoRForge y esperar a que sus procesos desaparezcan de verdad',
    "  Log 'Paso 2: cerrando KoRForge'",
    "  # K15: solo procesos de ESTA instalación (mismo ejecutable), nunca cualquier KoRForge/electron del usuario",
    '  # ICONOS FANTASMA (dueno, 24-10-2026): matar el proceso a la fuerza (`Stop-Process -Force`) deja',
    '  # su icono de la bandeja pegado en la barra de Windows hasta que pasas el ratón por encima. Se le',
    '  # pide que se cierre ÉL (`--cerrar`, que pasa por su will-quit) y solo se mata lo que no se vaya.',
    '  if (Test-Path -LiteralPath $appExe) {',
    '    try { Start-Process -FilePath $appExe -ArgumentList \'--cerrar\' -Wait -WindowStyle Hidden | Out-Null } catch {}',
    '  }',
    "  Get-Process -Name 'KoRForge' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $appExe } | ForEach-Object { try { [void]$_.CloseMainWindow() } catch {} }",
    '  $limiteEducado = (Get-Date).AddSeconds(5)',
    '  while ((@(Get-Process -Name KoRForge -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $appExe })).Count -gt 0 -and (Get-Date) -lt $limiteEducado) {',
    '    Esperar 150',
    '  }',
    '  $quedan = @(Get-Process -Name KoRForge -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $appExe })',
    '  if ($quedan.Count -gt 0) {',
    '    Log ("Paso 2: " + $quedan.Count + " proceso(s) no se cerraron solos: se matan")',
    "    $quedan | Stop-Process -Force -ErrorAction SilentlyContinue",
    '  }',
    '  $limite = (Get-Date).AddSeconds(10)',
    '  while ((@(Get-Process -Name KoRForge -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $appExe })).Count -gt 0 -and (Get-Date) -lt $limite) {',
    '    Esperar 150',
    '  }',
    "  Log 'Paso 2: KoRForge cerrado'",
    '',
    '# 3. Instalar en silencio (NSIS /S) y esperar a que el instalador TERMINE DE VERDAD.',
    '#',
    '#    Lo que estaba mal (dueño, 24-10-2026): aquí se buscaba el proceso del instalador por NOMBRE',
    '#    (`KoRForge-Setup*`), y ese nombre dejó de existir cuando los binarios pasaron a llamarse',
    '#    `KoRForge-<version>-Windows.exe`. Nunca se encontraba, así que el bucle caía en un tope de 10 s',
    '#    y daba la instalación por terminada con el instalador AÚN escribiendo: la tarjeta se cerraba',
    '#    antes de tiempo, la app se lanzaba a medias y, al acabar de verdad, el instalador la abría otra',
    '#    vez (dos instancias y una cerrando a la otra: el parpadeo que se veía).',
    '#',
    '#    Ahora se espera al PROCESO que lanzamos (`-PassThru` + `HasExited`) y a la señal real de que',
    '#    ha acabado: el package.json instalado ya dice la versión nueva. Sin tiempos medidos: tarda lo',
    '#    que tarde cada PC.',
    '  Log "Paso 3: instalando $installer"',
    '  $versionAntes = VersionInstalada',
    '  # El instalador silencioso NO reabre la app: la abre este script, UNA vez y después de instalar.',
    "  $env:KORFORGE_SIN_ABRIR = '1'",
    '  $procesoInstalador = $null',
    '  $inicio = Get-Date',
    "  try { $procesoInstalador = Start-Process -FilePath $installer -ArgumentList '/S' -WindowStyle Hidden -PassThru } catch { Log ('Paso 3: no se pudo lanzar el instalador: ' + $_.Exception.Message) }",
    '  Remove-Item Env:\\KORFORGE_SIN_ABRIR -ErrorAction SilentlyContinue',
    '  $limite = $inicio.AddMinutes(5)',
    '  $terminado = $false',
    '  while ((Get-Date) -lt $limite) {',
    '    try { $terminado = $procesoInstalador.HasExited } catch { $terminado = $true }',
    '    if ($terminado) { break }',
    '    Pulso',
    '    Start-Sleep -Milliseconds 120',
    '  }',
    '  # Señal real de final: la versión instalada ya es la nueva (no se fía del reloj).',
    '  $verInstalada = VersionInstalada',
    '  $confirmado = $false',
    '  $limiteVersion = (Get-Date).AddSeconds(8)',
    '  while ((Get-Date) -lt $limiteVersion) {',
    '    $verInstalada = VersionInstalada',
    '    if ($verInstalada -and $targetVersion -and ($verInstalada -eq $targetVersion)) { $confirmado = $true; break }',
    '    if ($verInstalada -and $versionAntes -and ($verInstalada -ne $versionAntes)) { $confirmado = $true; break }',
    '    Pulso',
    '    Start-Sleep -Milliseconds 200',
    '  }',
    '  $segundosInstalacion = [math]::Round(((Get-Date) - $inicio).TotalSeconds, 1)',
    '  Log ("Paso 3: instalación terminada en " + $segundosInstalacion + " s (instalador cerrado: " + $terminado + ", versión confirmada: " + $confirmado + "). Versión instalada: " + $verInstalada)',
    '',
    '# 4. La tarjeta se cierra EN CUANTO el update ha terminado; DESPUÉS se abre la app.',
    '#    $reabrirApp = $false desactiva el paso entero (lo usa la sonda de ventanas).',
    '  $reabrirApp = $true',
    '  if (-not $reabrirApp) {',
    "    Log 'Paso 4: reapertura desactivada (sonda); la tarjeta se queda hasta el final'",
    '  } else {',
    "    Log 'Paso 4: cerrando la tarjeta y abriendo KoRForge'",
    '    Cerrar-Splash',
    '    if (Test-Path -LiteralPath $appExe) { Start-Process -FilePath $appExe | Out-Null }',
    '    else { Start-Process -FilePath $installer | Out-Null }',
    '    # Red de seguridad: si la app no arranca, se reintenta UNA vez (ya sin tarjeta).',
    '    $limite = (Get-Date).AddSeconds(20)',
    '    $arrancada = $false',
    '    $ventanaVista = $false',
    '    $hayDetector = Cargar-DetectorVentanas',
    '    $inicioArranque = Get-Date',
    '    while ((Get-Date) -lt $limite) {',
    '      Pulso',
    '      Start-Sleep -Milliseconds 120',
    "      $pids = @(Get-Process -Name KoRForge -ErrorAction SilentlyContinue | ForEach-Object { [uint32]$_.Id })",
    '      if ($pids.Count -gt 0) { $arrancada = $true }',
    '      if ($hayDetector -and $pids.Count -gt 0) { try { if ([KorforgeVentanas]::TieneVentana($pids)) { $ventanaVista = $true; break } } catch {} }',
    '      # Si arranca minimizada en la bandeja no habrá ventana: no bloquear aquí.',
    '      if ($arrancada -and ((Get-Date) - $inicioArranque).TotalSeconds -gt 15) { break }',
    '    }',
    '    if (-not $arrancada) {',
    "      Log 'Paso 4: la app no arrancó; reintentando una vez'",
    '      if (Test-Path -LiteralPath $appExe) { Start-Process -FilePath $appExe | Out-Null }',
    '      Start-Sleep -Milliseconds 800',
    '    }',
    '    Log ("Paso 4: app en ejecución: " + ((@(Get-Process -Name KoRForge -ErrorAction SilentlyContinue)).Count -gt 0) + " ventana propia: " + $ventanaVista)',
    '  }',
    '',
    '} finally {',
    '  # La tarjeta no puede quedarse nunca en pantalla si algo falla',
    '  Cerrar-Splash',
    "  Log 'Tarjeta de carga cerrada'",
    '  Remove-Item -LiteralPath $flagSplash -Force -ErrorAction SilentlyContinue',
    '  Remove-Item -LiteralPath (Join-Path $env:TEMP \'korforge_splash.png\') -Force -ErrorAction SilentlyContinue',
    '}',
    '',
    '# 5. Limpiar el script temporal',
    'Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue',
    ''
  ].join('\n');
}

/** F3 (Linux): aplica la actualización sustituyendo el AppImage en su sitio y relanzándolo. */
function aplicarActualizacionLinux(installerPath) {
  /* Marca para que la app relanzada enseñe la tarjeta de carga al arrancar. */
  marcarActualizacionEnCurso(currentDownload.version);
  /* El runtime del AppImage expone su ruta en $APPIMAGE; si se ejecuta el AppRun extraído,
     se usa process.execPath. El reemplazo es un rename en el mismo directorio (el inode viejo
     sigue bloqueado por el proceso actual mientras arranca el nuevo). */
  const destino = process.env.APPIMAGE || process.execPath;
  const nuevo = `${destino}.new`;
  fs.copyFileSync(installerPath, nuevo);
  fs.chmodSync(nuevo, 0o755);
  fs.renameSync(nuevo, destino);

  /* 23-10-2026 (prueba real en Linux): lanzar el AppImage nuevo de inmediato NO sirve. La app usa
     app.requestSingleInstanceLock(), y el proceso viejo todavía lo tiene mientras se cierra: la
     instancia nueva no lo consigue, se cierra sola y el usuario ve que "la app desaparece".
     Solución: un lanzador detached que espera a que ESTE proceso muera y entonces hace exec del
     AppImage. Determinista, sin depender de tiempos. */
  const rutaSegura = `'${String(destino).replace(/'/g, `'\\''`)}'`;
  /* --actualizado: la app relanzada enseña la tarjeta de "actualización completada" un momento. */
  const comando = `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done; exec ${rutaSegura} --actualizado`;
  const hijo = spawn('/bin/sh', ['-c', comando], { detached: true, stdio: 'ignore' });
  hijo.unref();
}

function applyUpdateAndRestart(electronApp = null, lang = 'en') {
  if (currentDownload.status !== 'completed' || !currentDownload.filePath || !fs.existsSync(currentDownload.filePath)) {
    throw new Error('No hay ninguna actualización descargada lista para aplicar.');
  }

  let installerPath = currentDownload.filePath;
  const esLinux = process.platform === 'linux';
  let esBinarioValido = esLinux
    ? installerPath.endsWith('.AppImage')
    : installerPath.toLowerCase().endsWith('.exe');

  // Si no tiene extensión .exe (p.ej. id numérico de asset de GitHub), comprobar y convertir a .exe
  if (!esLinux && !esBinarioValido && fs.existsSync(installerPath)) {
    try {
      const fixedPath = path.join(path.dirname(installerPath), nombreDelAsset(currentDownload.version || 'update', 'win32'));
      fs.copyFileSync(installerPath, fixedPath);
      installerPath = fixedPath;
      currentDownload.filePath = fixedPath;
      esBinarioValido = true;
    } catch (e) {
      console.warn('[KoRForge Updater] Error al asegurar extensión .exe:', e.message);
    }
  }

  if (!esBinarioValido || !fs.existsSync(installerPath)) {
    throw new Error(`Instalador no válido o inexistente: ${path.basename(installerPath)}`);
  }

  /* K5: el fichero tiene que seguir siendo el que se verificó al descargar, y estar en el temporal. */
  if (!estaEnTemporal(installerPath)) {
    throw new Error('El instalador no está en el directorio temporal: no se aplica.');
  }
  if (currentDownload.sha256) {
    const ahora = crypto.createHash('sha256').update(fs.readFileSync(installerPath)).digest('hex');
    if (ahora !== currentDownload.sha256) {
      throw new Error('El instalador ha cambiado o está dañado: vuelve a descargar la actualización.');
    }
  }

  /* F3 (Linux, 23-10-2026): no hay PowerShell ni NSIS: se sustituye el AppImage y se relanza. */
  if (esLinux) {
    aplicarActualizacionLinux(installerPath);
    setTimeout(() => {
      try {
        if (global.quitAndApplyUpdate) global.quitAndApplyUpdate();
        else if (electronApp && typeof electronApp.exit === 'function') electronApp.exit(0);
      } catch (_) { /* si no puede cerrarse, la nueva ventana ya está abierta */ }
    }, 600);
    return { success: true, message: 'Actualización aplicada. Reabriendo KoRForge...' };
  }

  // Detect installed executable path
  let appExePath = process.execPath;
  const standardInstalledExe = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'KoRForge', 'KoRForge.exe');
  if (fs.existsSync(standardInstalledExe)) {
    appExePath = standardInstalledExe;
  }

  /* 23-10-2026 (dueño): «tarda más el proceso de instalación que la app en sí». La instalación son
     ~8 s y la app arranca en medio segundo, así que una tarjeta pintada por la propia app (antes o
     después) no cubre lo que importa. La pinta un PROCESO APARTE: el script de PowerShell con ventana
     WinForms que ya existía (buildApplyScript), lanzado con wscript.exe para que no salga ninguna
     consola. Ese proceso aguanta el cierre de la app, ejecuta el instalador en silencio, reabre la app
     y cierra la tarjeta cuando la app pinta su ventana. */
  const cerrarApp = () => {
    try {
      if (global.quitAndApplyUpdate) {
        global.quitAndApplyUpdate();
      } else if (electronApp && typeof electronApp.exit === 'function') {
        electronApp.exit(0);
      } else {
        process.exit(0);
      }
    } catch (_) {
      process.exit(0);
    }
  };

  const lanzarTarjetaEInstalador = () => {
    try {
      const pantalla = typeof global.rectPantallaFisica === 'function' ? global.rectPantallaFisica() : null;
      /* LA IMAGEN DE LA TARJETA (dueno, 23-10-2026: *"yo te hablaba del updater"*): la ventana que
         sale mientras se aplica la actualizacion lleva el arte de la marca
         (`public/actualizando.png`, el mismo de la ficha del repo), no el yunque del splash.
         OJO, ESTO ERA EL FALLO DEL LOGO: ese PNG vive DENTRO de app.asar y PowerShell (que es quien
         copia la imagen) no sabe leer un asar, asi que la tarjeta salia sin dibujo. Node sí puede, así
         que la copia a %TEMP% se hace aquí y al script se le pasa la copia. (dueno, 24-10-2026:
         *"el updater sigue sin tener el logo"*). */
      const arteAsar = path.join(__dirname, '..', 'public', 'actualizando.png');
      let splashPng = arteAsar;
      try {
        const arteTemp = path.join(os.tmpdir(), 'korforge_actualizando.png');
        fs.copyFileSync(arteAsar, arteTemp);
        splashPng = arteTemp;
      } catch (err) {
        console.warn('[KoRForge Updater] No se pudo preparar la imagen de la tarjeta:', err.message);
      }
      const ps1 = path.join(os.tmpdir(), 'korforge_apply_update.ps1');
      /* El .ps1 se escribe con BOM: sin él, PowerShell 5.1 lee el archivo como ANSI y los textos con
         tilde salen rotos en la tarjeta ("Mise Ã  jour..."). Visto por el dueño el 24-10-2026:
         *"salen letras mal escritas"*. */
      const textoPs1 = '\uFEFF' + buildApplyScript(installerPath, appExePath, currentDownload.version, { lang, splashPng, pantalla });
      fs.writeFileSync(ps1, textoPs1, 'utf8');

      /* wscript con estilo de ventana 0: el script corre oculto y no aparece ninguna consola. */
      const vbs = path.join(os.tmpdir(), 'korforge_apply_update.vbs');
      const comando = `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${ps1}"`;
      fs.writeFileSync(vbs, `CreateObject("WScript.Shell").Run "${comando.replace(/"/g, '""')}", 0, False\r\n`, 'utf8');

      const hijo = spawn('wscript.exe', [vbs], { detached: true, stdio: 'ignore', windowsHide: true });
      hijo.unref();
      return true;
    } catch (err) {
      console.warn('[KoRForge Updater] No se pudo lanzar la tarjeta de carga:', err.message);
      return false;
    }
  };

  if (lanzarTarjetaEInstalador()) {
    /* El script mata la app y lanza el instalador; se le da un segundo para que pinte la tarjeta. */
    setTimeout(cerrarApp, 1200);
  } else {
    /* Respaldo: instalador directo y marca en disco para que la app enseñe la tarjeta al arrancar. */
    marcarActualizacionEnCurso(currentDownload.version);
    try {
      const hijo = spawn(installerPath, ['/S'], { detached: true, stdio: 'ignore', windowsHide: true, shell: true });
      hijo.unref();
    } catch (err) {
      console.warn('[KoRForge Updater] No se pudo lanzar el instalador:', err.message);
    }
    setTimeout(cerrarApp, 700);
  }

  return { success: true, message: 'Instalador lanzado. Reiniciando KoRForge...' };
}

module.exports = {
  getDownloadProgress,
  startUpdateDownload,
  cancelUpdateDownload,
  applyUpdateAndRestart,
  buildApplyScript,
  getGitHubToken,
  esVersionValida,
  nombreDelAsset,
  nombresDeAssetAntiguos,
  urlDelAssetEnRelease,
  urlInstaladorOficial,
  urlSha256Sums,
  esUrlDeInstalador,
  marcarActualizacionEnCurso,
  leerMarcaActualizacion,
  rutaDeMarcaActualizacion
};
