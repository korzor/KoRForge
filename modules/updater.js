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
function buildApplyScript(installerPath, appExePath) {
  const psQuote = (p) => `'${String(p).replace(/'/g, "''")}'`;
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '',
    '# Registro: si una actualización falla, en %TEMP%\\korforge_apply_update.log queda el porqué',
    "$logFile = Join-Path $env:TEMP 'korforge_apply_update.log'",
    'function Log([string]$texto) {',
    "  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'",
    "  Add-Content -LiteralPath $logFile -Value \"[$stamp] $texto\" -Encoding UTF8",
    '}',
    "Log '--- Aplicando actualización ---'",
    '',
    `$installer = ${psQuote(installerPath)}`,
    `$appExe = ${psQuote(appExePath)}`,
    '',
    '# 1. Margen para que la petición HTTP que disparó esto acabe de salir',
    "Log 'Paso 1: margen inicial'",
    'Start-Sleep -Seconds 2',
    '',
    '# 2. Cerrar KoRForge y esperar a que sus procesos desaparezcan de verdad',
    "Log 'Paso 2: cerrando KoRForge'",
    "Get-Process -Name 'KoRForge','electron' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue",
    '$limite = (Get-Date).AddSeconds(20)',
    'do { Start-Sleep -Milliseconds 400 } while ((@(Get-Process -Name KoRForge,electron -ErrorAction SilentlyContinue)).Count -gt 0 -and (Get-Date) -lt $limite)',
    "Log 'Paso 2: KoRForge cerrado'",
    '',
    '# 3. Instalar en silencio (NSIS /S). El proceso del instalador puede seguir vivo mientras',
    '#    termina de escribir: se espera a que no quede ninguno antes de reabrir la app.',
    "Log \"Paso 3: instalando $installer\"",
    "Start-Process -FilePath $installer -ArgumentList '/S' -WindowStyle Hidden | Out-Null",
    '$limite = (Get-Date).AddMinutes(3)',
    'do {',
    '  Start-Sleep -Milliseconds 500',
    "  $setup = @(Get-Process -Name 'KoRForge-Setup*' -ErrorAction SilentlyContinue)",
    '} while ($setup.Count -gt 0 -and (Get-Date) -lt $limite)',
    'Start-Sleep -Seconds 3',
    "$verInstalada = ''",
    'try {',
    "  $pkgRuta = Join-Path (Split-Path -Parent $appExe) 'resources\\app\\package.json'",
    "  $verInstalada = (Get-Content -LiteralPath $pkgRuta -Raw | ConvertFrom-Json).version",
    '} catch {}',
    'Log "Paso 3: instalación terminada. Versión instalada: $verInstalada"',
    '',
    '# 4. Reabrir KoRForge. Si la app se cierra en los primeros segundos (el instalador a veces',
    '#    cierra instancias al acabar), se vuelve a abrir una vez.',
    'function Abrir-App {',
    '  if (Test-Path -LiteralPath $appExe) { Start-Process -FilePath $appExe | Out-Null }',
    '  else { Start-Process -FilePath $installer | Out-Null }',
    '}',
    "Log 'Paso 4: reabriendo KoRForge'",
    'Abrir-App',
    'Start-Sleep -Seconds 8',
    'if ((@(Get-Process -Name KoRForge -ErrorAction SilentlyContinue)).Count -eq 0) {',
    "  Log 'Paso 4: la app no siguió viva a los 8 s; reintentando abrirla'",
    '  Start-Sleep -Seconds 3',
    '  Abrir-App',
    '  Start-Sleep -Seconds 6',
    '}',
    "Log \"Paso 4: app en ejecución: $((@(Get-Process -Name KoRForge -ErrorAction SilentlyContinue)).Count -gt 0)\"",
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
  fs.writeFileSync(runnerScript, buildApplyScript(installerPath, appExePath), 'utf-8');

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

  // Cerrar la aplicación principal limpiamente
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
  }, 400);

  return { success: true, message: 'Actualizador lanzado. Cerrando KoRForge...' };
}

module.exports = {
  getDownloadProgress,
  startUpdateDownload,
  applyUpdateAndRestart,
  buildApplyScript,
  getGitHubToken
};
