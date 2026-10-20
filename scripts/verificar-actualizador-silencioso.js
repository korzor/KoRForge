// Sonda: comprueba que el runner de actualización pinta la tarjeta de carga (y solo eso:
// ninguna consola), que sale centrada en la pantalla que se le pasa, que se cierra sola y que
// deja limpios el script y la bandera. Usa el mismo script y las mismas banderas de spawn que
// modules/updater.js, con un "instalador" inocuo (whoami) para no tocar la instalación real.
//
// OJO al detectar la ventana: NO vale Get-Process MainWindowTitle, porque la tarjeta se crea
// sin botón en la barra de tareas (WS_EX_TOOLWINDOW) y .NET la descarta como "ventana
// principal" (MainWindowHandle = 0 aunque esté pintada). Por eso se enumeran las ventanas
// visibles con EnumWindows desde un vigilante aparte.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { buildApplyScript } = require('../modules/updater.js');

const inocuo = 'C:\\Windows\\System32\\whoami.exe';
const flagFile = path.join(os.tmpdir(), 'korforge_splash_listo');
const splashPng = path.join(__dirname, '..', 'public', 'splash.png');
const psFile = path.join(os.tmpdir(), 'korforge_apply_update.ps1');
const salidaVentanas = path.join(os.tmpdir(), 'korforge_sonda_ventanas.txt');
const pidVigilante = path.join(os.tmpdir(), 'korforge_sonda_ventanas.pid');

// Pantalla de mentira: la tarjeta tiene que quedar centrada dentro de este rectángulo,
// que es lo que en producción se calcula con la pantalla donde está la app.
const pantalla = { x: 40, y: 30, width: 1000, height: 760 };
const ANCHO_CARTA = 560;
const ALTO_CARTA = 372;
const esperadoX = pantalla.x + Math.round((pantalla.width - ANCHO_CARTA) / 2);
const esperadoY = pantalla.y + Math.round((pantalla.height - ALTO_CARTA) / 2);

try { fs.unlinkSync(flagFile); } catch (_) {}
// El vigilante de una corrida anterior puede tener el fichero abierto: se trunca con reintentos
for (let intento = 0; intento < 20; intento++) {
  try { fs.writeFileSync(salidaVentanas, ''); break; } catch (_) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250); }
}
try { fs.unlinkSync(pidVigilante); } catch (_) {}

// --- Vigilante de ventanas (EnumWindows, incluye ventanas sin botón en la barra) ---
const vigilante = path.join(os.tmpdir(), 'korforge_sonda_ventanas.ps1');
fs.writeFileSync(vigilante, `$ErrorActionPreference = 'SilentlyContinue'
Set-Content -LiteralPath '${pidVigilante}' -Value $PID -Encoding ASCII
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class SondaVentanas {
  delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public static List<string> Lista() {
    var r = new List<string>();
    EnumWindows(delegate(IntPtr h, IntPtr p) {
      if (!IsWindowVisible(h)) return true;
      int n = GetWindowTextLength(h);
      if (n == 0) return true;
      var sb = new StringBuilder(n + 1);
      GetWindowText(h, sb, sb.Capacity);
      uint pid; GetWindowThreadProcessId(h, out pid);
      RECT rect; GetWindowRect(h, out rect);
      r.Add(sb.ToString() + " :: " + pid + " :: " + rect.Left + "," + rect.Top + "," + (rect.Right - rect.Left) + "," + (rect.Bottom - rect.Top));
      return true;
    }, IntPtr.Zero);
    return r;
  }
}
"@
$fin = (Get-Date).AddSeconds(25)
while ((Get-Date) -lt $fin) {
  [SondaVentanas]::Lista() | ForEach-Object { Add-Content -LiteralPath '${salidaVentanas}' -Value $_ -Encoding UTF8 }
  Start-Sleep -Milliseconds 300
}
`, 'utf-8');

const watcher = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', vigilante], {
  detached: true, stdio: 'ignore', windowsHide: true, shell: true
});
watcher.unref();

let script = buildApplyScript(inocuo, inocuo, '9.9.9', { lang: 'es', splashPng, flagFile, pantalla });

// Paso 4 desactivado: en la prueba el "app" sería otro whoami y abriría su propia consola.
// (El runner ya trae el interruptor $reabrirApp para esto.)
script = script.replace('$reabrirApp = $true', '$reabrirApp = $false');

// Con BOM, igual que modules/updater.js: el .ps1 lleva acentos y PowerShell 5.1 sin BOM los rompe.
fs.writeFileSync(psFile, '\ufeff' + script, 'utf-8');
console.log('[sonda] script escrito en', psFile);
console.log('[sonda] vigilante de ventanas lanzado (PID', watcher.pid + ')');

// Mismo lanzamiento que en modules/updater.js.
// OJO: `shell: true` es obligatorio. El spawn directo de powershell.exe en este entorno deja
// un proceso que sale al instante sin ejecutar el script (por eso la sonda daba
// "script temporal eliminado: false" aunque el flujo real funcionara).
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
console.log('[sonda] runner lanzado (PID', child.pid + '), esperando a que termine...');

// Esperar al runner (25 s: con el exe inocuo espera 10 s a que "aparezca" el instalador).
const fin = Date.now() + 26000;
let banderaVista = false;
while (Date.now() < fin) {
  if (!banderaVista && fs.existsSync(flagFile)) banderaVista = true;
  if (banderaVista && !fs.existsSync(psFile)) break;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
}
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);

const lineas = fs.existsSync(salidaVentanas)
  ? [...new Set(fs.readFileSync(salidaVentanas, 'utf-8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean))]
  : [];
const titulos = lineas.map((l) => l.split(' :: ')[0]);

const tarjeta = lineas.find((l) => /^KoRForge ::/.test(l));
const tarjetaVista = Boolean(tarjeta);
let geometriaOk = false;
let detalle = 'sin datos';
if (tarjeta) {
  const [, , rect] = tarjeta.split(' :: ');
  const [x, y, w, h] = rect.split(',').map(Number);
  detalle = `x=${x} y=${y} w=${w} h=${h} (esperado x=${esperadoX} y=${esperadoY} w=${ANCHO_CARTA} h=${ALTO_CARTA})`;
  geometriaOk = Math.abs(x - esperadoX) <= 2 && Math.abs(y - esperadoY) <= 2 && Math.abs(w - ANCHO_CARTA) <= 2 && Math.abs(h - ALTO_CARTA) <= 2;
}

const consolas = lineas.filter((t) => /^(Windows PowerShell|PowerShell|Administrador:|C:\\\\WINDOWS\\\\system32)/i.test(t));
const limpiado = !fs.existsSync(psFile);
const banderaLimpiada = !fs.existsSync(flagFile);

console.log('[sonda] ventanas con título vistas durante la prueba:');
for (const t of lineas) console.log('   -', t);
console.log('[sonda] tarjeta de carga vista:', tarjetaVista);
console.log('[sonda] posición de la tarjeta:', detalle);
console.log('[sonda] tarjeta centrada en su pantalla:', geometriaOk);
console.log('[sonda] bandera del splash creada:', banderaVista);
console.log('[sonda] consolas abiertas:', consolas.length ? consolas.join(' | ') : 'ninguna');
console.log('[sonda] script temporal eliminado al terminar:', limpiado);
console.log('[sonda] bandera eliminada al terminar:', banderaLimpiada);
console.log('[sonda] aviso: el runner mata los KoRForge/electron abiertos (es parte del flujo real)');

const ok = tarjetaVista && geometriaOk && banderaVista && banderaLimpiada && consolas.length === 0 && limpiado;
console.log(ok ? '[sonda] OK: tarjeta con logo, centrada en su pantalla, sin consolas y limpia al terminar' : '[sonda] FALLO');

// Parar el vigilante antes de borrar sus ficheros (si no, Windows los deja bloqueados)
try {
  const pid = Number(fs.readFileSync(pidVigilante, 'utf-8').trim());
  if (pid) { process.kill(pid, 'SIGKILL'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); }
} catch (_) {}
for (const f of [salidaVentanas, pidVigilante, vigilante]) {
  for (let intento = 0; intento < 10; intento++) {
    try { fs.unlinkSync(f); break; } catch (_) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200); }
  }
}
process.exit(ok ? 0 : 1);
