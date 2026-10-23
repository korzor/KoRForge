# Tarjeta "Instalando KoRForge" del instalador de Windows.
#
# POR QUE EXISTE (dueno, 23-10-2026): *"esta imagen debe salir en el instalador mientras instala"*.
# El instalador de electron-builder solo tiene la barra de progreso y una cabecera de 150x57; la
# imagen de marca no cabe en ninguna de sus paginas. Asi que la pinta este proceso aparte, igual que
# la tarjeta de las actualizaciones (modules/updater.js): una ventana sin bordes del sistema, con
# esquinas redondeadas de verdad, reborde dorado y una barra que se mueve, encima del instalador.
#
# QUIEN LA LANZA: el propio instalador (build/installer.nsh), al entrar en la pagina de instalacion,
# con `wscript` para que no parpadee ninguna consola. Le pasa por entorno:
#   KORFORGE_INSTALADOR_PID   el proceso del instalador (para centrarla encima y saber cuando acaba)
#   KORFORGE_INSTALANDO_TEXTO el texto ya traducido ($(installing) del instalador)
# Y la cierra el instalador al terminar de copiar, dejando %TEMP%\korforge_instalador_listo.
#
# OJO CON LOS ACENTOS: este archivo lo escribe el instalador y lo ejecuta PowerShell 5.1, que sin BOM
# lee el texto como ANSI. Por eso aqui no se usan tildes (los textos que ve el usuario llegan por
# variable de entorno, que si es Unicode).

$ErrorActionPreference = 'SilentlyContinue'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class KorforgeInstalador {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public static int[] Medir(IntPtr h) {
    if (h == IntPtr.Zero || !IsWindowVisible(h)) return null;
    RECT r;
    if (!GetWindowRect(h, out r)) return null;
    return new int[] { r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top };
  }
}
"@

$pidInstalador = 0
[void][int]::TryParse([string]$env:KORFORGE_INSTALADOR_PID, [ref]$pidInstalador)
$texto = [string]$env:KORFORGE_INSTALANDO_TEXTO
if (-not $texto) { $texto = 'Instalando KoRForge...' }
$flagListo = Join-Path $env:TEMP 'korforge_instalador_listo'

# Pantalla donde esta el instalador (o la principal). Se centra ahi, sin cuentas de DPI: este
# proceso y el instalador los ve Windows en el mismo espacio de coordenadas.
$pantalla = $null
if ($pidInstalador -gt 0) {
  $proc = Get-Process -Id $pidInstalador -ErrorAction SilentlyContinue
  if ($proc) {
    $m = [KorforgeInstalador]::Medir($proc.MainWindowHandle)
    if ($m -and $m[2] -gt 0 -and $m[3] -gt 0) {
      $pantalla = [System.Windows.Forms.Screen]::FromRectangle((New-Object System.Drawing.Rectangle($m[0], $m[1], $m[2], $m[3])))
    }
  }
}
if (-not $pantalla) { $pantalla = [System.Windows.Forms.Screen]::PrimaryScreen }
$area = $pantalla.Bounds

# Escala por pantalla: 640x452 es la referencia en 1920x1080.
$factor = $area.Width / 1920.0
if ($factor -lt 0.75) { $factor = 0.75 }
if ($factor -gt 2.0) { $factor = 2.0 }
$factorAlto = $area.Height / 1080.0
if ($factorAlto -lt 0.75) { $factorAlto = 0.75 }
if ($factorAlto -gt 2.0) { $factorAlto = 2.0 }
if ($factorAlto -lt $factor) { $factor = $factorAlto }
$e = $factor
function T([double]$valor) { return [int][math]::Round($valor * $e) }

$ancho = T 640
$alto = T 452
$radio = [math]::Max(12, (T 16))
$oro1 = [System.Drawing.Color]::FromArgb(245, 158, 11)
$oro2 = [System.Drawing.Color]::FromArgb(251, 191, 36)
$fondoColor = [System.Drawing.Color]::FromArgb(11, 16, 24)

# Camino de rectangulo redondeado con el MISMO radio en las cuatro esquinas. Se usa dos veces: para
# recortar la ventana (Region) y para pintar el relleno y el reborde, y asi no queda ni un pico.
function Camino-Redondeado([int]$w, [int]$h, [int]$r) {
  $camino = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diam = $r * 2
  if ($diam -lt 2) { $diam = 2 }
  $x2 = $w - $diam - 1
  $y2 = $h - $diam - 1
  $camino.AddArc(0, 0, $diam, $diam, 180, 90)
  $camino.AddArc($x2, 0, $diam, $diam, 270, 90)
  $camino.AddArc($x2, $y2, $diam, $diam, 0, 90)
  $camino.AddArc(0, $y2, $diam, $diam, 90, 90)
  $camino.CloseFigure()
  return $camino
}

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.StartPosition = 'Manual'
$form.ClientSize = New-Object System.Drawing.Size($ancho, $alto)
$form.BackColor = $fondoColor
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.Text = 'KoRForge'
$form.Location = New-Object System.Drawing.Point(
  [int][math]::Round($area.X + (($area.Width - $ancho) / 2)),
  [int][math]::Round($area.Y + (($area.Height - $alto) / 2)))

# Region 1 px mas grande que el dibujo: el borde del recorte queda por fuera del reborde dorado y
# no le corta el suavizado.
$region = New-Object System.Drawing.Region((Camino-Redondeado $ancho $alto ($radio + 1)))
$form.Region = $region

# Pintado de la tarjeta: relleno oscuro, reborde dorado en degradado y una linea interior fina.
$form.Add_Paint({
  param($emisor, $ev)
  $g = $ev.Graphics
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $w = $emisor.ClientSize.Width
  $h = $emisor.ClientSize.Height
  $camino = Camino-Redondeado $w $h ($radio + 1)
  $brocha = New-Object System.Drawing.SolidBrush($fondoColor)
  $g.FillPath($brocha, $camino)
  $brocha.Dispose()
  $rectBorde = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $degradado = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rectBorde, $oro1, $oro2, 45.0)
  $pluma = New-Object System.Drawing.Pen($degradado, [math]::Max(2.0, (T 2)))
  $pluma.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset
  $g.DrawPath($pluma, $camino)
  $pluma.Dispose()
  $degradado.Dispose()
  $camino.Dispose()
  # Linea interior fina: remata el reborde y disimula del todo el recorte de las esquinas.
  $interior = Camino-Redondeado ($w - 8) ($h - 8) ($radio - 3)
  $matriz = New-Object System.Drawing.Drawing2D.Matrix
  $matriz.Translate(4, 4)
  $interior.Transform($matriz)
  $plumaFina = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 245, 158, 11), 1.0)
  $g.DrawPath($plumaFina, $interior)
  $plumaFina.Dispose()
  $interior.Dispose()
  $matriz.Dispose()
})

# El arte de la marca, encajado sin deformar (la imagen tiene fondo transparente: se ve el de la
# tarjeta por detras) y separado del reborde.
$rutaImagen = Join-Path $PSScriptRoot 'kf-instalando.png'
if (Test-Path -LiteralPath $rutaImagen) {
  $cajaAncho = $ancho - (T 48)
  $cajaAlto = $alto - (T 132)
  $pic = New-Object System.Windows.Forms.PictureBox
  $pic.SizeMode = 'Zoom'
  $pic.BackColor = [System.Drawing.Color]::Transparent
  $pic.Location = New-Object System.Drawing.Point([int][math]::Round(($ancho - $cajaAncho) / 2), (T 22))
  $pic.Size = New-Object System.Drawing.Size($cajaAncho, $cajaAlto)
  $origen = [System.Drawing.Image]::FromFile($rutaImagen)
  $lienzo = New-Object System.Drawing.Bitmap($cajaAncho, $cajaAlto)
  $g = [System.Drawing.Graphics]::FromImage($lienzo)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $escala = [math]::Min($cajaAncho / $origen.Width, $cajaAlto / $origen.Height)
  $dw = [int][math]::Round($origen.Width * $escala)
  $dh = [int][math]::Round($origen.Height * $escala)
  $g.DrawImage($origen, [int](($cajaAncho - $dw) / 2), [int](($cajaAlto - $dh) / 2), $dw, $dh)
  $g.Dispose()
  $origen.Dispose()
  $pic.Image = $lienzo
  $form.Controls.Add($pic)
}

$lbl = New-Object System.Windows.Forms.Label
$lbl.AutoSize = $false
$lbl.TextAlign = 'MiddleCenter'
$lbl.BackColor = [System.Drawing.Color]::Transparent
$lbl.Location = New-Object System.Drawing.Point(0, ($alto - (T 92)))
$lbl.Size = New-Object System.Drawing.Size($ancho, (T 34))
$lbl.Font = New-Object System.Drawing.Font('Segoe UI', [math]::Max(9.0, (11 * $e)), [System.Drawing.FontStyle]::Bold)
$lbl.ForeColor = [System.Drawing.Color]::FromArgb(241, 245, 249)
$lbl.Text = $texto
$form.Controls.Add($lbl)

# Barra que se mueve: la duracion real la sabe el instalador, aqui solo se acompania.
$altoBarra = [math]::Max(3, (T 4))
$anchoBarra = $ancho - (T 200)
$carril = New-Object System.Windows.Forms.Panel
$carril.Location = New-Object System.Drawing.Point([int][math]::Round(($ancho - $anchoBarra) / 2), ($alto - (T 52)))
$carril.Size = New-Object System.Drawing.Size($anchoBarra, $altoBarra)
$carril.BackColor = [System.Drawing.Color]::FromArgb(42, 52, 68)
$form.Controls.Add($carril)
$barra = New-Object System.Windows.Forms.Panel
$anchoTroz = [math]::Max(40, (T 110))
$barra.Size = New-Object System.Drawing.Size($anchoTroz, $altoBarra)
$barra.BackColor = $oro1
$carril.Controls.Add($barra)
$script:pos = -$anchoTroz
$script:paso = [math]::Max(2, (T 7))
$script:carrilAncho = $anchoBarra
$script:barra = $barra

$script:ticks = 0
$script:form = $form
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 16
$timer.Add_Tick({
  $script:pos = $script:pos + $script:paso
  if ($script:pos -gt $script:carrilAncho) { $script:pos = -$script:barra.Width }
  $script:barra.Left = $script:pos
  $script:ticks = $script:ticks + 1
  # Cada ~250 ms: se comprueba si el instalador ha terminado (marca) o si ya no existe.
  if (($script:ticks % 16) -eq 0) {
    $listo = $false
    if (Test-Path -LiteralPath $flagListo) { $listo = $true }
    if (-not $listo -and $script:pidInstalador -gt 0 -and -not (Get-Process -Id $script:pidInstalador -ErrorAction SilentlyContinue)) { $listo = $true }
    if ($listo) {
      $script:timer.Stop()
      $script:form.Close()
    }
  }
})
$script:pidInstalador = $pidInstalador
$script:timer = $timer
$timer.Start()

[void]$form.Show()
[System.Windows.Forms.Application]::Run($form)
