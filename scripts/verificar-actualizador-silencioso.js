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

// Pantalla de mentira: la tarjeta tiene que quedar centrada dentro de este rectángulo y con
// el tamaño que toque según la pantalla (560x372 de referencia en 1920x1080, con topes).
// Se prueba con un 4K que es el caso extremo contrario al monitor del dueño.
const pantalla = { x: 0, y: 0, width: 3840, height: 2160, escala: 1 };
const factorEsperado = Math.min(Math.max(pantalla.width / 1920, 0.75), 2.2, Math.min(Math.max(pantalla.height / 1080, 0.75), 2.2));
const ANCHO_CARTA = Math.round(560 * factorEsperado);
const ALTO_CARTA = Math.round(372 * factorEsperado);
const esperadoX = Math.round(pantalla.x + (pantalla.width - ANCHO_CARTA) / 2);
const esperadoY = Math.round(pantalla.y + (pantalla.height - ALTO_CARTA) / 2);

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

const tarjetaVista = lineas.some((l) => /^KoRForge ::/.test(l));

// La geometria se comprueba con la linea que escribe el propio runner en el log: es la que
// manda de verdad (el vigilante de ventanas vive en otro espacio de coordenadas por el DPI).
const logFile = path.join(os.tmpdir(), 'korforge_apply_update.log');
let geometriaOk = false;
let detalle = 'sin datos';
try {
  const log = fs.readFileSync(logFile, 'utf-8');
  const lineasLog = log.split(/\r?\n/).filter((l) => l.includes('Tarjeta: pantalla fisica='));
  const ultima = lineasLog[lineasLog.length - 1] || '';
  const m = ultima.match(/fisica=(-?\d+),(-?\d+) (\d+)x(\d+) escala sistema=([\d.]+) factor=([\d.]+) -> (-?\d+),(-?\d+) (\d+)x(\d+)/);
  if (m) {
    const [, fx, fy, fw, fh, escala, factor, lx, ly, lw, lh] = m.map(Number);
    const centroX = lx + lw / 2;
    const centroY = ly + lh / 2;
    const objetivoX = fx / escala + fw / escala / 2;
    const objetivoY = fy / escala + fh / escala / 2;
    geometriaOk =
      Math.abs(lw - ANCHO_CARTA) <= 1 && Math.abs(lh - ALTO_CARTA) <= 1 &&
      Math.abs(factor - factorEsperado) <= 0.01 &&
      Math.abs(centroX - objetivoX) <= 1 && Math.abs(centroY - objetivoY) <= 1;
    detalle = `fisica=${fx},${fy} ${fw}x${fh} escala=${escala} factor=${factor} -> logica=${lx},${ly} ${lw}x${lh} ` +
      `(esperado ${ANCHO_CARTA}x${ALTO_CARTA} en ${esperadoX},${esperadoY}; centro ${centroX.toFixed(1)},${centroY.toFixed(1)} vs ${objetivoX.toFixed(1)},${objetivoY.toFixed(1)})`;
  }
} catch (_) {}

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
