const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('[KoRForge Build] 🔨 Iniciando compilación de ejecutable nativo...');

const projectDir = __dirname;
const releaseDir = path.join(projectDir, 'release', 'win-unpacked');
const exePath = path.join(releaseDir, 'KoRForge.exe');
const desktopDir = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop');
const desktopLnk = path.join(desktopDir, 'KoRForge.lnk');
const testLnk = path.join(desktopDir, 'KoRForge (Prueba Auto-Update).lnk');
const testReleaseDir = path.join(projectDir, 'release', 'test-update-unpacked');
const testExePath = path.join(testReleaseDir, 'KoRForge.exe');

// 1. Cerrar cualquier instancia previa de KoRForge.exe o electron para liberar bloqueos de archivo
try {
  execSync('taskkill /F /IM KoRForge.exe /T 2>nul || exit 0', { shell: 'cmd.exe', stdio: 'ignore' });
  execSync('taskkill /F /IM electron.exe /T 2>nul || exit 0', { shell: 'cmd.exe', stdio: 'ignore' });
} catch (_) {}

// 2. Ejecutar electron-builder para generar directorio unpacked con KoRForge.exe
console.log('[KoRForge Build] Empaquetando aplicación con electron-builder...');
execSync('npx electron-builder --win dir', { cwd: projectDir, stdio: 'inherit' });

if (!fs.existsSync(exePath)) {
  console.error(`[KoRForge Build] ❌ Error: no se encontró el ejecutable en ${exePath}`);
  process.exit(1);
}

console.log(`[KoRForge Build] ✔ Ejecutable generado con éxito: ${exePath}`);

// 3. Crear / Actualizar accesos directos en el Escritorio con el icono oficial
console.log('[KoRForge Build] 🔗 Actualizando accesos directos en el Escritorio con icono oficial...');
const icoPath = path.join(projectDir, 'korforge-official.ico');
try { fs.copyFileSync(path.join(projectDir, 'korforge.ico'), icoPath); } catch (_) {}

const psScript = `
$WshShell = New-Object -ComObject WScript.Shell;
$ico = '${icoPath.replace(/'/g, "''")}';

# Acceso principal v1.0.0
$sc = $WshShell.CreateShortcut('${desktopLnk.replace(/'/g, "''")}');
$sc.TargetPath = '${exePath.replace(/'/g, "''")}';
$sc.WorkingDirectory = '${releaseDir.replace(/'/g, "''")}';
$sc.IconLocation = "$ico,0";
$sc.Description = 'KoRForge - WoW Forever Addon Forge';
$sc.Save();

# Acceso de prueba v0.9.5 si existe la carpeta
if (Test-Path '${testExePath.replace(/'/g, "''")}') {
  $scTest = $WshShell.CreateShortcut('${testLnk.replace(/'/g, "''")}');
  $scTest.TargetPath = '${testExePath.replace(/'/g, "''")}';
  $scTest.WorkingDirectory = '${testReleaseDir.replace(/'/g, "''")}';
  $scTest.IconLocation = "$ico,0";
  $scTest.Description = 'KoRForge (Prueba Auto-Update v0.9.5)';
  $scTest.Save();
}

# Refrescar caché de iconos de Windows Shell
Add-Type -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);' -Name NativeMethods -Namespace Win32;
[Win32.NativeMethods]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero);
ie4uinit.exe -show;
`;

try {
  execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '`"')}"`, { stdio: 'inherit' });
  console.log(`[KoRForge Build] ✔ Accesos directos e icono oficial actualizados en el Escritorio.`);
} catch (err) {
  console.error('[KoRForge Build] ⚠️ No se pudo actualizar el acceso directo:', err.message);
}

console.log('[KoRForge Build] 🚀 ¡Listo! Doble clic en tu Escritorio para abrir KoRForge.exe.');
