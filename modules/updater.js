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

  // Generate automated runner batch script in temp dir
  const runnerScript = path.join(os.tmpdir(), 'korforge_apply_update.bat');
  const batContent = `@echo off
chcp 65001 >nul
title KoRForge Updater

echo ==============================================
echo [KoRForge] Aplicando actualizacion v${currentDownload.version || ''}...
echo ==============================================

:: 1. Esperar un instante para que el servidor responda a la petición HTTP
ping 127.0.0.1 -n 2 >nul

:: 2. Matar por la fuerza todos los procesos previos de KoRForge y Electron
taskkill /F /IM KoRForge.exe /T >nul 2>&1
taskkill /F /IM electron.exe /T >nul 2>&1

:: 3. Esperar que Windows libere los archivos
ping 127.0.0.1 -n 3 >nul

:: 4. Ejecutar el instalador oficial silenciosamente y esperar a que finalice
echo Instalando version oficial actualizada...
start /wait "" "${installerPath}" /S

:: 5. Margen de espera para que la instalación y registro terminen
ping 127.0.0.1 -n 4 >nul

:: 6. Volver a arrancar KoRForge actualizado
echo Abriendo KoRForge actualizado...
if exist "${appExePath}" (
  start "" "${appExePath}"
) else (
  start "" "${installerPath}"
)

:: 7. Limpiar el script temporal y salir
(goto) 2>nul & del "%~f0"
exit
`;

  fs.writeFileSync(runnerScript, batContent, 'utf-8');

  // Launch detached batch file completely independent of parent process
  const child = spawn('cmd.exe', ['/c', runnerScript], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
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
  getGitHubToken
};
