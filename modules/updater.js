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

function getGitHubToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const { execSync } = require('child_process');
    const token = execSync('gh auth token', { stdio: 'pipe', encoding: 'utf-8' }).trim();
    if (token) return token;
  } catch (_) {}
  return null;
}

async function startUpdateDownload(downloadUrl, version) {
  if (currentDownload.status === 'downloading') {
    return { status: 'already_running', progress: currentDownload };
  }

  // Si la URL es un endpoint de API (ej. /releases/assets/656295835), forzar nombre KoRForge-Setup-[ver].exe
  let fileName = `KoRForge-Setup-${version || 'update'}.exe`;
  const urlBase = path.basename(downloadUrl.split('?')[0]);
  if (urlBase && urlBase.toLowerCase().endsWith('.exe')) {
    fileName = urlBase;
  }
  const targetPath = path.join(os.tmpdir(), fileName);

  currentDownload = {
    status: 'downloading',
    percent: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speedMb: '0.0',
    error: null,
    filePath: targetPath,
    version: version || 'nueva'
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
      redirect: 'manual'
    });

    // If GitHub returns 302 Found, redirect to asset storage (S3) without Authorization header to avoid auth errors
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const redirectUrl = res.headers.get('location');
      res = await fetch(redirectUrl, {
        headers: {
          'User-Agent': 'KoRForge-InAppUpdater/1.0 (Windows NT 10.0; Win64; x64)'
        },
        redirect: 'follow'
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
    return { success: true, filePath: targetPath };
  } catch (err) {
    currentDownload.status = 'error';
    currentDownload.error = err.message;
    console.error('[KoRForge Updater] Error descargando actualización:', err.message);
    throw err;
  }
}

// Textos de la tarjeta de carga que se pinta mientras se aplica la actualización.
// Es interfaz nativa (el proceso que instala no puede leer i18n.js), así que vive aquí,
// en los cinco idiomas, igual que TRAY_TEXTS (docs/REGLAS-IDIOMAS.md). El idioma lo manda
// la ventana al pedir el reinicio. {version} lo rellena buildApplyScript.
const SPLASH_TEXTS = {
  en: { instalando: 'Updating KoRForge to {version}...', abriendo: 'Opening KoRForge...' },
  es: { instalando: 'Actualizando KoRForge a la {version}...', abriendo: 'Abriendo KoRForge...' },
  gl: { instalando: 'Actualizando KoRForge á {version}...', abriendo: 'Abrindo KoRForge...' },
  fr: { instalando: 'Mise à jour de KoRForge vers {version}...', abriendo: 'Ouverture de KoRForge...' },
  it: { instalando: 'Aggiornamento di KoRForge alla {version}...', abriendo: 'Apertura di KoRForge...' }
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
// SPLASH (20-10-2026, dueño): entre cerrar la app y que la nueva arranque pasan ~10 s con el
// escritorio vacío. El runner pinta lo primero una tarjeta con el logo (el mismo splash.png)
// y avisa a la app con un fichero bandera para que solo entonces se cierre: así el logo está
// en pantalla todo el rato y no hay hueco. La tarjeta se cierra cuando la app nueva ya pinta.
function buildApplyScript(installerPath, appExePath, targetVersion, opciones = {}) {
  const psQuote = (p) => `'${String(p).replace(/'/g, "''")}'`;
  const versionEsperada = String(targetVersion || '').replace(/^v/i, '');
  const textos = textosSplash(opciones.lang);
  // La versión a la que se actualiza se ve en la tarjeta: {version} en los cinco idiomas
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
    "$pkgRuta = Join-Path (Split-Path -Parent $appExe) 'resources\\app\\package.json'",
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
    '    $e = $factor',
    '    function T([double]$valor) { return [int][math]::Round($valor * $e) }',
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
    '    # Esquinas redondeadas: la tarjeta no tiene que verse como un rectangulo pegado',
    '    $diam = $margen * 2',
    '    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath',
    '    $gp.AddArc(0, 0, $diam, $diam, 180, 90)',
    '    $gp.AddArc($ancho - $diam, 0, $diam, $diam, 270, 90)',
    '    $gp.AddArc($ancho - $diam, $alto - $diam, $diam, $diam, 0, 90)',
    '    $gp.AddArc(0, $alto - $diam, $diam, $diam, 90, 90)',
    '    $gp.CloseFigure()',
    '    $form.Region = New-Object System.Drawing.Region($gp)',
    '    if (Test-Path -LiteralPath $copia) {',
    '      $pic = New-Object System.Windows.Forms.PictureBox',
    '      $pic.SizeMode = \'StretchImage\'',
    '      $pic.Location = New-Object System.Drawing.Point(0, (T 20))',
    '      $pic.Size = New-Object System.Drawing.Size((T 560), (T 280))',
    '      # El logo se reescala con interpolacion buena para que no salga a cuadros en pantallas grandes',
    '      try {',
    '        $origenLogo = [System.Drawing.Image]::FromFile($copia)',
    '        $logo = New-Object System.Drawing.Bitmap($pic.Width, $pic.Height)',
    '        $g = [System.Drawing.Graphics]::FromImage($logo)',
    '        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic',
    '        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality',
    '        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality',
    '        $g.DrawImage($origenLogo, 0, 0, $pic.Width, $pic.Height)',
    '        $g.Dispose()',
    '        $origenLogo.Dispose()',
    '        $pic.Image = $logo',
    '      } catch { $pic.Image = [System.Drawing.Image]::FromFile($copia) }',
    '      $form.Controls.Add($pic)',
    '    }',
    '    $lbl = New-Object System.Windows.Forms.Label',
    '    $lbl.AutoSize = $false',
    '    $lbl.TextAlign = \'MiddleCenter\'',
    '    $lbl.Location = New-Object System.Drawing.Point(0, (T 306))',
    '    $lbl.Size = New-Object System.Drawing.Size($ancho, [math]::Max(16, (T 24)))',
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
    "  Get-Process -Name 'KoRForge','electron' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue",
    '  $limite = (Get-Date).AddSeconds(10)',
    '  while ((@(Get-Process -Name KoRForge,electron -ErrorAction SilentlyContinue)).Count -gt 0 -and (Get-Date) -lt $limite) {',
    '    Esperar 150',
    '  }',
    "  Log 'Paso 2: KoRForge cerrado'",
    '',
    '# 3. Instalar en silencio (NSIS /S). Solo se da por terminado cuando el proceso del instalador',
    '#    HA APARECIDO y ya NO está (si solo se mira la versión, con la misma versión ya instalada',
    '#    se daría por buena en el primer sondeo mientras el instalador aún escribe).',
    '  Log "Paso 3: instalando $installer"',
    '  $versionAntes = VersionInstalada',
    "  Start-Process -FilePath $installer -ArgumentList '/S' -WindowStyle Hidden | Out-Null",
    '  $inicio = Get-Date',
    '  $limite = $inicio.AddMinutes(3)',
    '  $vistoSetup = $false',
    '  $instalacionLista = $false',
    '  while ((Get-Date) -lt $limite) {',
    '    Esperar 200',
    "    $setup = @(Get-Process -Name 'KoRForge-Setup*' -ErrorAction SilentlyContinue)",
    '    if ($setup.Count -gt 0) { $vistoSetup = $true; continue }',
    '    if (-not $vistoSetup) {',
    '      # Si el instalador no llega a aparecer (sonda con un ejecutable inocuo), no esperar 3 minutos',
    '      if (((Get-Date) - $inicio).TotalSeconds -gt 10) { break }',
    '      continue',
    '    }',
    '    $ahora = VersionInstalada',
    '    if (($ahora -and $targetVersion -and $ahora -eq $targetVersion) -or ($ahora -and $versionAntes -and $ahora -ne $versionAntes)) {',
    '      $instalacionLista = $true',
    '      break',
    '    }',
    '    Esperar 1500',
    '    break',
    '  }',
    '  $verInstalada = VersionInstalada',
    "  $resultado = 'ok'; if (-not $instalacionLista) { $resultado = 'sin confirmar' }",
    '  Log "Paso 3: instalación terminada ($resultado). Versión instalada: $verInstalada"',
    '',
    '# 4. Reabrir KoRForge y comprobar que el proceso vive (sondeo, no esperas a ciegas)',
    '#    $reabrirApp = $false desactiva TODO el paso 4 (lo usa la sonda de ventanas).',
    '  $reabrirApp = $true',
    '  if ($script:lblSplash) { $script:lblSplash.Text = $textoAbriendo }',
    '  if (-not $reabrirApp) {',
    "    Log 'Paso 4: reapertura desactivada (sonda)'",
    '  } else {',
    "    Log 'Paso 4: reabriendo KoRForge'",
    '    if (Test-Path -LiteralPath $appExe) { Start-Process -FilePath $appExe | Out-Null }',
    '    else { Start-Process -FilePath $installer | Out-Null }',
    '    $limite = (Get-Date).AddSeconds(15)',
    '    $arrancada = $false',
    '    $ventanaVista = $false',
    '    $hayDetector = Cargar-DetectorVentanas',
    '    $inicioArranque = Get-Date',
    '    while ((Get-Date) -lt $limite) {',
    '      Esperar 100',
    "      $pids = @(Get-Process -Name KoRForge -ErrorAction SilentlyContinue | ForEach-Object { [uint32]$_.Id })",
    '      if ($pids.Count -gt 0) { $arrancada = $true }',
    '      if ($hayDetector -and $pids.Count -gt 0 -and [KorforgeVentanas]::TieneVentana($pids)) { $ventanaVista = $true; break }',
    '      # Si la app arranca minimizada en la bandeja no habrá ventana: no tener la tarjeta colgada',
    '      if ($arrancada -and ((Get-Date) - $inicioArranque).TotalSeconds -gt 5) { break }',
    '    }',
    '    if (-not $arrancada) {',
    "      Log 'Paso 4: la app no arrancó; reintentando una vez'",
    '      Esperar 2000',
    '      if (Test-Path -LiteralPath $appExe) { Start-Process -FilePath $appExe | Out-Null }',
    '      Esperar 4000',
    '    }',
    "    Log \"Paso 4: app en ejecución: $((@(Get-Process -Name KoRForge -ErrorAction SilentlyContinue)).Count -gt 0) ventana propia: $ventanaVista\"",
    '    # El logo de la tarjeta se quita EN CUANTO la app pinta su primera ventana (su splash):',
    '    # así desaparece antes de que la app termine de iniciar y el relevo lo coge el splash de la app.',
    '    if ($ventanaVista) { Esperar 120 }',
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

function applyUpdateAndRestart(electronApp = null, lang = 'en') {
  if (currentDownload.status !== 'completed' || !currentDownload.filePath || !fs.existsSync(currentDownload.filePath)) {
    throw new Error('No hay ninguna actualización descargada lista para aplicar.');
  }

  let installerPath = currentDownload.filePath;
  let isExe = installerPath.toLowerCase().endsWith('.exe');

  // Si no tiene extensión .exe (p.ej. id numérico de asset de GitHub), comprobar y convertir a .exe
  if (!isExe && fs.existsSync(installerPath)) {
    try {
      const fixedPath = path.join(path.dirname(installerPath), `KoRForge-Setup-${currentDownload.version || 'update'}.exe`);
      fs.copyFileSync(installerPath, fixedPath);
      installerPath = fixedPath;
      currentDownload.filePath = fixedPath;
      isExe = true;
    } catch (e) {
      console.warn('[KoRForge Updater] Error al asegurar extensión .exe:', e.message);
    }
  }

  if (!isExe || !fs.existsSync(installerPath)) {
    throw new Error(`Instalador no válido o inexistente: ${path.basename(installerPath)}`);
  }

  // Detect installed executable path
  let appExePath = process.execPath;
  const standardInstalledExe = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'KoRForge', 'KoRForge.exe');
  if (fs.existsSync(standardInstalledExe)) {
    appExePath = standardInstalledExe;
  }

  // Runner OCULTO (PowerShell): pinta la tarjeta de carga, cierra KoRForge, instala en silencio y reabre.
  // Se lanza con windowsHide + -WindowStyle Hidden: ni consola ni pings (antes era un .bat
  // con ping 127.0.0.1 como temporizador y una ventana de cmd a la vista).
  const runnerScript = path.join(os.tmpdir(), 'korforge_apply_update.ps1');

  // Splash de la tarjeta: el mismo PNG de la app (en la instalación vive en resources/app/public).
  const rutaPublica = path.join(path.dirname(appExePath), 'resources', 'app', 'public', 'splash.png');
  const splashPng = fs.existsSync(rutaPublica)
    ? rutaPublica
    : path.join(__dirname, '..', 'public', 'splash.png');

  // Bandera: el runner la escribe cuando la tarjeta ya está en pantalla. La app NO se cierra
  // hasta verla (o hasta el límite), para que no haya ni un instante de escritorio vacío.
  const flagFile = path.join(os.tmpdir(), 'korforge_splash_listo');
  try { fs.unlinkSync(flagFile); } catch (_) {}

  const pantalla = typeof global.rectPantallaFisica === 'function' ? global.rectPantallaFisica() : null;

  const script = buildApplyScript(installerPath, appExePath, currentDownload.version, {
    lang,
    splashPng,
    flagFile,
    pantalla
  });

  // Con BOM: el .ps1 lleva acentos (fr/it) y PowerShell 5.1 sin BOM los leería como ANSI.
  fs.writeFileSync(runnerScript, '\ufeff' + script, 'utf-8');

  // Lanzado oculto y desacoplado: no se abre ninguna consola.
  // OJO (fallo de la 1.0.8/1.0.9/1.0.10): el spawn DIRECTO de powershell.exe desde la app
  // empaquetada deja un proceso que sale al instante con código 0 y no ejecuta el script
  // (verificado con sondas: proceso creado, exit=0, sin log ni instalación). A través de
  // `shell: true` (cmd /c) sí se ejecuta. No quitar el shell.
  const child = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-WindowStyle', 'Hidden',
    '-File', runnerScript
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: true
  });
  child.unref();

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

  // La respuesta HTTP sale ya; el cierre espera a que la tarjeta esté pintada (bandera).
  // Límite de 4 s por si el runner no llega a pintarla (entonces se cierra como antes).
  const inicio = Date.now();
  const vigilante = setInterval(() => {
    let lista = false;
    try { lista = fs.existsSync(flagFile); } catch (_) {}
    const agotado = Date.now() - inicio > 4000;
    if (lista || agotado) {
      clearInterval(vigilante);
      setTimeout(cerrarApp, lista ? 120 : 0);
    }
  }, 80);

  return { success: true, message: 'Actualizador lanzado. Cerrando KoRForge...' };
}

module.exports = {
  getDownloadProgress,
  startUpdateDownload,
  applyUpdateAndRestart,
  buildApplyScript,
  getGitHubToken
};
