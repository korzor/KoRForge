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
function buildApplyScript(installerPath, appExePath) {
  const psQuote = (p) => `'${String(p).replace(/'/g, "''")}'`;
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '',
    '# 1. Margen para que la petición HTTP que disparó esto acabe de salir',
    'Start-Sleep -Seconds 2',
    '',
    '# 2. Cerrar KoRForge para poder reemplazar sus archivos',
    "Get-Process -Name 'KoRForge','electron' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue",
    'Start-Sleep -Seconds 2',
    '',
    '# 3. Instalar la versión nueva en silencio (NSIS /S) y esperar a que termine',
    `$installer = ${psQuote(installerPath)}`,
    `$appExe = ${psQuote(appExePath)}`,
    "Start-Process -FilePath $installer -ArgumentList '/S' -Wait -WindowStyle Hidden",
    'Start-Sleep -Seconds 2',
    '',
    '# 4. Reabrir KoRForge actualizado',
    'if (Test-Path -LiteralPath $appExe) { Start-Process -FilePath $appExe } else { Start-Process -FilePath $installer }',
    '',
    '# 5. Limpiar el script temporal',
    'Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue'
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

  // Lanzado oculto y desacoplado: no se abre ninguna ventana
  const child = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-WindowStyle', 'Hidden',
    '-File', runnerScript
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
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
