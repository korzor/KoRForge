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

// Quitamos el paso 4 (reabrir la app) porque en la prueba el "app" sería otro whoami
// y abriría su propia consola: lo que se mide aquí es la cadena del actualizador.
script = script.replace(
  /if \(Test-Path -LiteralPath \$appExe\).*\n/,
  '# (prueba: sin reapertura de la app)\n'
);

const psFile = path.join(os.tmpdir(), 'korforge_apply_update.ps1');
fs.writeFileSync(psFile, script, 'utf-8');
console.log('[sonda] script escrito en', psFile);

const child = spawn('powershell.exe', [
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy', 'Bypass',
  '-WindowStyle', 'Hidden',
  '-File', psFile
], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true
});
child.unref();
console.log('[sonda] runner lanzado (PID', child.pid + '), vigilando ventanas...');

// Vigilar procesos con ventana visible durante la vida del runner
const fin = Date.now() + 12000;
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
