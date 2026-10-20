const fs = require('fs');
const path = require('path');
const os = require('os');
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

// Generador del runner que aplica la actualización.
// OJO: se ejecuta el proceso tal como está en el .ps1; debe ser silencioso (sin ventanas ni pings).
// Si se toca, comprobarlo con la sonda de ventanas (el .ps1 se ejecuta con windowsHide).
// Deja rastro en %TEMP%\korforge_apply_update.log para poder diagnosticar una actualización.
//
// TIEMPOS (20-10-2026): antes había 2 s de margen + 3 s fijos tras instalar + 8 s a ciegas
// esperando a que la app arrancase: ~13 s tirados de los ~28 s que tardaba el ciclo. Ahora
// solo se espera lo que de verdad hace falta: se comprueba la versión instalada en
// resources/app/package.json (señal real de que el instalador ha acabado) y se sondea el
// proceso de la app cada 200 ms. El instalador en silencio sigue siendo lo más lento (~13 s).
function buildApplyScript(installerPath, appExePath, targetVersion) {
  const psQuote = (p) => `'${String(p).replace(/'/g, "''")}'`;
  const versionEsperada = String(targetVersion || '').replace(/^v/i, '');
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
    "$pkgRuta = Join-Path (Split-Path -Parent $appExe) 'resources\\app\\package.json'",
    "function VersionInstalada {",
    '  try {',
    '    $v = (Get-Content -LiteralPath $pkgRuta -Raw | ConvertFrom-Json).version',
    '    if ($v) { return [string]$v }',
    '  } catch {}',
    "  return ''",
    '}',
    '',
    '# 1. Margen mínimo: solo para que la respuesta HTTP que disparó esto llegue a salir',
    "Log 'Paso 1: margen inicial'",
    'Start-Sleep -Milliseconds 300',
    '',
    '# 2. Cerrar KoRForge y esperar a que sus procesos desaparezcan de verdad',
    "Log 'Paso 2: cerrando KoRForge'",
    "Get-Process -Name 'KoRForge','electron' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue",
    '$limite = (Get-Date).AddSeconds(10)',
    'while ((@(Get-Process -Name KoRForge,electron -ErrorAction SilentlyContinue)).Count -gt 0 -and (Get-Date) -lt $limite) {',
    '  Start-Sleep -Milliseconds 150',
    '}',
    "Log 'Paso 2: KoRForge cerrado'",
    '',
    '# 3. Instalar en silencio (NSIS /S). Solo se da por terminado cuando el proceso del instalador',
    '#    HA APARECIDO y ya NO está (si solo se mira la versión, con la misma versión ya instalada',
    '#    se daría por buena en el primer sondeo mientras el instalador aún escribe).',
    "Log \"Paso 3: instalando $installer\"",
    '$versionAntes = VersionInstalada',
    "Start-Process -FilePath $installer -ArgumentList '/S' -WindowStyle Hidden | Out-Null",
    '$inicio = Get-Date',
    '$limite = $inicio.AddMinutes(3)',
    '$vistoSetup = $false',
    '$instalacionLista = $false',
    'while ((Get-Date) -lt $limite) {',
    '  Start-Sleep -Milliseconds 200',
    "  $setup = @(Get-Process -Name 'KoRForge-Setup*' -ErrorAction SilentlyContinue)",
    '  if ($setup.Count -gt 0) { $vistoSetup = $true; continue }',
    '  if (-not $vistoSetup) {',
    '    # Si el instalador no llega a aparecer (sonda con un ejecutable inocuo), no esperar 3 minutos',
    '    if (((Get-Date) - $inicio).TotalSeconds -gt 10) { break }',
    '    continue',
    '  }',
    '  $ahora = VersionInstalada',
    '  if (($ahora -and $targetVersion -and $ahora -eq $targetVersion) -or ($ahora -and $versionAntes -and $ahora -ne $versionAntes)) {',
    '    $instalacionLista = $true',
    '    break',
    '  }',
    '  Start-Sleep -Milliseconds 1500',
    '  break',
    '}',
    '$verInstalada = VersionInstalada',
    "$resultado = 'ok'; if (-not $instalacionLista) { $resultado = 'sin confirmar' }",
    'Log "Paso 3: instalación terminada ($resultado). Versión instalada: $verInstalada"',
    '',
    '# 4. Reabrir KoRForge y comprobar que el proceso vive (sondeo, no esperas a ciegas)',
    '#    $reabrirApp = $false desactiva TODO el paso 4 (lo usa la sonda de ventanas).',
    '$reabrirApp = $true',
    'function Abrir-App {',
    '  if (Test-Path -LiteralPath $appExe) { Start-Process -FilePath $appExe | Out-Null }',
    '  else { Start-Process -FilePath $installer | Out-Null }',
    '}',
    'if (-not $reabrirApp) {',
    "  Log 'Paso 4: reapertura desactivada (sonda)'",
    '} else {',
    "  Log 'Paso 4: reabriendo KoRForge'",
    '  Abrir-App',
    '  $limite = (Get-Date).AddSeconds(15)',
    '  $arrancada = $false',
    '  while ((Get-Date) -lt $limite) {',
    '    Start-Sleep -Milliseconds 200',
    '    if ((@(Get-Process -Name KoRForge -ErrorAction SilentlyContinue)).Count -gt 0) { $arrancada = $true; break }',
    '  }',
    '  if (-not $arrancada) {',
    "    Log 'Paso 4: la app no arrancó; reintentando una vez'",
    '    Start-Sleep -Seconds 2',
    '    Abrir-App',
    '    Start-Sleep -Seconds 4',
    '  }',
    "  Log \"Paso 4: app en ejecución: $((@(Get-Process -Name KoRForge -ErrorAction SilentlyContinue)).Count -gt 0)\"",
    '}',
    '',
    '# 5. Limpiar el script temporal',
    'Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue',
    ''
  ].join('\n');
}

function applyUpdateAndRestart(electronApp = null) {
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

  // Runner OCULTO (PowerShell): espera, cierra KoRForge, instala en silencio y reabre.
  // Se lanza con windowsHide + -WindowStyle Hidden: ni consola ni pings (antes era un .bat
  // con ping 127.0.0.1 como temporizador y una ventana de cmd a la vista).
  const runnerScript = path.join(os.tmpdir(), 'korforge_apply_update.ps1');
  fs.writeFileSync(runnerScript, buildApplyScript(installerPath, appExePath, currentDownload.version), 'utf-8');

  // Lanzado oculto y desacoplado: no se abre ninguna ventana.
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

  // Cerrar la aplicación principal limpiamente (150 ms: justo lo que tarda en salir la respuesta)
  setTimeout(() => {
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
  }, 150);

  return { success: true, message: 'Actualizador lanzado. Cerrando KoRForge...' };
}

module.exports = {
  getDownloadProgress,
  startUpdateDownload,
  applyUpdateAndRestart,
  buildApplyScript,
  getGitHubToken
};
