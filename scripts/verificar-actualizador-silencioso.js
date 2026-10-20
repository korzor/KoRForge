// Sonda: comprueba que el runner de actualización NO abre ventanas.
// Usa el mismo script y las mismas banderas de spawn que modules/updater.js,
// con un "instalador" inocuo (whoami) para no tocar la instalación real.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { buildApplyScript } = require('../modules/updater.js');

const inocuo = 'C:\\Windows\\System32\\whoami.exe';
let script = buildApplyScript(inocuo, inocuo);

// Paso 4 desactivado: en la prueba el "app" sería otro whoami y abriría su propia consola.
// (El runner ya trae el interruptor $reabrirApp para esto.)
script = script.replace('$reabrirApp = $true', '$reabrirApp = $false');

const psFile = path.join(os.tmpdir(), 'korforge_apply_update.ps1');
fs.writeFileSync(psFile, script, 'utf-8');
console.log('[sonda] script escrito en', psFile);

// OJO: `shell: true` es obligatorio, igual que en modules/updater.js. El spawn directo de
// powershell.exe en este entorno deja un proceso que sale al instante sin ejecutar el script
// (por eso la sonda daba "script temporal eliminado: false" aunque el flujo real funcionara).
const child = spawn('powershell.exe', [
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy', 'Bypass',
  '-WindowStyle', 'Hidden',
  '-File', psFile
], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
  shell: true
});
child.unref();
console.log('[sonda] runner lanzado (PID', child.pid + '), vigilando ventanas...');

// Vigilar procesos con ventana visible durante la vida del runner
// 25 s: con un instalador real el runner tarda ~10-14 s (espera a que el proceso del instalador
// aparezca y desaparezca); con el exe inocuo espera 10 s a que "aparezca" antes de rendirse.
const fin = Date.now() + 25000;
const vistas = new Set();
const { execFileSync } = require('child_process');
while (Date.now() < fin) {
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      "Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { $_.ProcessName + ' :: ' + $_.MainWindowTitle }"
    ], { encoding: 'utf-8', windowsHide: true, timeout: 5000 });
    out.split(/\r?\n/).filter(Boolean).forEach(l => vistas.add(l.trim()));
  } catch (_) {}
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
}

console.log('[sonda] ventanas visibles vistas durante la prueba:');
for (const v of vistas) console.log('   -', v);

// Comprobar que el script terminó y se limpió solo
const limpiado = !fs.existsSync(psFile);
console.log('[sonda] script temporal eliminado al terminar:', limpiado);
console.log('[sonda] aviso: el runner mata los KoRForge/electron abiertos (es parte del flujo real)');
process.exit(limpiado ? 0 : 1);
