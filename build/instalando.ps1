# Ventana del instalador de KoRForge: TODO el proceso pasa aqui.
#
# POR QUE EXISTE (dueno, 24-10-2026): *"el instalador no te permite elegir ruta de instalacion...
# me parece mal"* y *"ya que tenemos la ventana hecha del progreso, no podriamos hacer que todo el
# proceso transcurriese en esa misma ventana?"*.
#
# El asistente de electron-builder no servia: al ser una ACTUALIZACION (`skipPageIfUpdated`) se salta
# la pagina donde se elige la carpeta, asi que la ruta no se puede cambiar. Ahora el instalador NSIS
# arranca, suelta estos archivos en %TEMP%\korforge-instalador y se aparta (`Quit`); esta ventana
# ensena el arte de la marca, deja elegir carpeta, instala y avisa al terminar.
#
# COMO INSTALA: no reimplementa nada. Lanza el instalador de verdad en modo silencioso con la carpeta
# elegida (`KoRForge-x.y.z-Windows.exe /S /D=<ruta>`): NSIS sigue haciendo todo (archivos, accesos
# directos, desinstalador y registro). Aqui solo se pinta y se espera. El `/D=` va SIN comillas y al
# final, que es como lo exige NSIS aunque la ruta lleve espacios.
#
# Recibe del instalador por entorno: KORFORGE_INSTALADOR_EXE (el .exe), KORFORGE_INSTDIR (carpeta
# actual o por defecto) y KF_IDIOMA (LCID, para los textos). Si algo falla, se cae al instalador
# silencioso con la carpeta por defecto: el usuario tiene que acabar con KoRForge instalado.
#
# OJO CON LOS ACENTOS: este archivo lo ejecuta PowerShell 5.1 y los textos que ve el usuario salen
# del diccionario de abajo, no de este codigo (que va sin tildes a proposito).

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

# --- Textos (idioma del instalador; si no se reconoce, ingles) ---------------------------------
$idiomas = @{
  'es' = @{ donde='Se instalará en:'; cambiar='Cambiar…'; cancelar='Cancelar'; instalar='Instalar KoRForge'; instalando='Instalando KoRForge…'; listo='KoRForge está instalado.'; abrir='Abrir KoRForge'; cerrar='Cerrar'; error='No se pudo instalar KoRForge.'; carpeta='Elige la carpeta donde instalar KoRForge' }
  'en' = @{ donde='Install to:'; cambiar='Change…'; cancelar='Cancel'; instalar='Install KoRForge'; instalando='Installing KoRForge…'; listo='KoRForge is installed.'; abrir='Open KoRForge'; cerrar='Close'; error='KoRForge could not be installed.'; carpeta='Choose the folder to install KoRForge into' }
  'de' = @{ donde='Installieren nach:'; cambiar='Ändern…'; cancelar='Abbrechen'; instalar='KoRForge installieren'; instalando='KoRForge wird installiert…'; listo='KoRForge ist installiert.'; abrir='KoRForge öffnen'; cerrar='Schließen'; error='KoRForge konnte nicht installiert werden.'; carpeta='Ordner für die Installation von KoRForge wählen' }
  'fr' = @{ donde='Installer dans :'; cambiar='Modifier…'; cancelar='Annuler'; instalar='Installer KoRForge'; instalando='Installation de KoRForge…'; listo='KoRForge est installé.'; abrir='Ouvrir KoRForge'; cerrar='Fermer'; error="KoRForge n'a pas pu être installé."; carpeta="Choisir le dossier d'installation de KoRForge" }
  'it' = @{ donde='Installa in:'; cambiar='Cambia…'; cancelar='Annulla'; instalar='Installa KoRForge'; instalando='Installazione di KoRForge…'; listo='KoRForge è installato.'; abrir='Apri KoRForge'; cerrar='Chiudi'; error='Impossibile installare KoRForge.'; carpeta='Scegli la cartella in cui installare KoRForge' }
  'pt' = @{ donde='Instalar em:'; cambiar='Alterar…'; cancelar='Cancelar'; instalar='Instalar KoRForge'; instalando='A instalar o KoRForge…'; listo='O KoRForge está instalado.'; abrir='Abrir KoRForge'; cerrar='Fechar'; error='Não foi possível instalar o KoRForge.'; carpeta='Escolhe a pasta onde instalar o KoRForge' }
}
$codigo = 'en'
$lcid = 0
[void][int]::TryParse([string]$env:KF_IDIOMA, [ref]$lcid)
if ($lcid -gt 0) {
  switch ($lcid -band 0xFF) {
    0x0A { $codigo = 'es' }
    0x07 { $codigo = 'de' }
    0x0C { $codigo = 'fr' }
    0x10 { $codigo = 'it' }
    0x16 { $codigo = 'pt' }
    0x09 { $codigo = 'en' }
  }
}
$t = $idiomas[$codigo]
if (-not $t) { $t = $idiomas['en'] }

# --- Datos que manda el instalador --------------------------------------------------------------
$script:instaladorExe = [string]$env:KORFORGE_INSTALADOR_EXE
$script:rutaInicial = [string]$env:KORFORGE_INSTDIR
if (-not $script:rutaInicial) { $script:rutaInicial = Join-Path $env:LOCALAPPDATA 'Programs\KoRForge' }
$script:rutaFinal = $script:rutaInicial
$script:proceso = $null
$artePng = $null
foreach ($nombreArte in 'kf-instalando.png', 'instalando.png') {
  $rutaArte = Join-Path $PSScriptRoot $nombreArte
  if (Test-Path -LiteralPath $rutaArte) { $artePng = $rutaArte; break }
}

# --- Geometria (referencia 660x480 en 1920x1080) ------------------------------------------------
$pantalla = $null
try { $pantalla = [System.Windows.Forms.Screen]::PrimaryScreen } catch {}
$area = $pantalla.Bounds
$factor = $area.Width / 1920.0
if ($factor -lt 0.75) { $factor = 0.75 }
if ($factor -gt 2.0) { $factor = 2.0 }
$factorAlto = $area.Height / 1080.0
if ($factorAlto -lt 0.75) { $factorAlto = 0.75 }
if ($factorAlto -gt 2.0) { $factorAlto = 2.0 }
if ($factorAlto -lt $factor) { $factor = $factorAlto }
$e = $factor
function T([double]$valor) { return [int][math]::Round($valor * $e) }

$ancho = T 660
$alto = T 480
$radio = [math]::Max(12, (T 16))
$oro1 = [System.Drawing.Color]::FromArgb(245, 158, 11)
$oro2 = [System.Drawing.Color]::FromArgb(251, 191, 36)
$fondoColor = [System.Drawing.Color]::FromArgb(11, 16, 24)
$panelColor = [System.Drawing.Color]::FromArgb(16, 23, 34)
$textoColor = [System.Drawing.Color]::FromArgb(226, 232, 240)
$tenueColor = [System.Drawing.Color]::FromArgb(148, 163, 184)

function global:Camino-Redondeado([int]$w, [int]$h, [int]$r) {
  $camino = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diam = $r * 2
  if ($diam -lt 4) { $diam = 4 }
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
$form.ShowInTaskbar = $true
$form.Text = 'KoRForge'
$form.Location = New-Object System.Drawing.Point(
  [int][math]::Round($area.X + (($area.Width - $ancho) / 2)),
  [int][math]::Round($area.Y + (($area.Height - $alto) / 2)))
$form.Region = New-Object System.Drawing.Region((Camino-Redondeado $ancho $alto ($radio + 1)))

$form.Add_Paint({
  param($emisor, $ev)
  try {
  $g = $ev.Graphics
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $w = $emisor.ClientSize.Width
  $h = $emisor.ClientSize.Height
  $camino = Camino-Redondeado $w $h ($radio + 1)
  $brocha = New-Object System.Drawing.SolidBrush($fondoColor)
  $g.FillPath($brocha, $camino)
  $brocha.Dispose()
  $degradado = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Rectangle(0, 0, $w, $h)), $oro1, $oro2, 45.0)
  $pluma = New-Object System.Drawing.Pen($degradado, [math]::Max(2.0, (T 2)))
  $pluma.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset
  $g.DrawPath($pluma, $camino)
  $pluma.Dispose()
  $degradado.Dispose()
  $camino.Dispose()
  $interior = Camino-Redondeado ($w - 8) ($h - 8) ([math]::Max(4, ($radio - 3)))
  $matriz = New-Object System.Drawing.Drawing2D.Matrix
  $matriz.Translate(4, 4)
  $interior.Transform($matriz)
  $plumaFina = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 245, 158, 11), 1.0)
  $g.DrawPath($plumaFina, $interior)
  $plumaFina.Dispose()
  $interior.Dispose()
  $matriz.Dispose()
  } catch {}
})

# --- Arte de la marca, arriba y entero ---------------------------------------------------------
if (Test-Path -LiteralPath $artePng) {
  try {
    $cajaAncho = T 620
    $cajaAlto = T 325
    $pic = New-Object System.Windows.Forms.PictureBox
    $pic.SizeMode = 'Zoom'
    $pic.BackColor = [System.Drawing.Color]::Transparent
    $pic.Location = New-Object System.Drawing.Point((T 20), (T 16))
    $pic.Size = New-Object System.Drawing.Size($cajaAncho, $cajaAlto)
    $origen = [System.Drawing.Image]::FromFile($artePng)
    $lienzo = New-Object System.Drawing.Bitmap($cajaAncho, $cajaAlto)
    $g = [System.Drawing.Graphics]::FromImage($lienzo)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $escala = [math]::Min($cajaAncho / $origen.Width, $cajaAlto / $origen.Height)
    $dw = [int][math]::Round($origen.Width * $escala)
    $dh = [int][math]::Round($origen.Height * $escala)
    $g.DrawImage($origen, [int](($cajaAncho - $dw) / 2), [int](($cajaAlto - $dh) / 2), $dw, $dh)
    $g.Dispose()
    $origen.Dispose()
    $pic.Image = $lienzo
    $form.Controls.Add($pic)
  } catch { }
}

# --- Botones y paneles -------------------------------------------------------------------------
function Nuevo-Boton([string]$texto, [int]$x, [int]$y, [int]$w, [int]$h, [bool]$primario) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $texto
  $b.Location = New-Object System.Drawing.Point($x, $y)
  $b.Size = New-Object System.Drawing.Size($w, $h)
  $b.FlatStyle = 'Flat'
  $b.FlatAppearance.BorderSize = 1
  $b.FlatAppearance.BorderColor = $oro1
  $b.Font = New-Object System.Drawing.Font('Segoe UI', [math]::Max(8.5, (9.5 * $e)), [System.Drawing.FontStyle]::Bold)
  if ($primario) {
    $b.BackColor = $oro1
    $b.ForeColor = [System.Drawing.Color]::FromArgb(16, 23, 32)
    $b.FlatAppearance.MouseOverBackColor = $oro2
  } else {
    $b.BackColor = $panelColor
    $b.ForeColor = $textoColor
    $b.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
  }
  $b.Cursor = [System.Windows.Forms.Cursors]::Hand
  return $b
}

$cajaPanel = New-Object System.Drawing.Point((T 20), (T 352))
$cajaTam = New-Object System.Drawing.Size((T 620), (T 112))

# --- Estado 1: elegir carpeta ------------------------------------------------------------------
$panelElegir = New-Object System.Windows.Forms.Panel
$panelElegir.Location = $cajaPanel
$panelElegir.Size = $cajaTam
$panelElegir.BackColor = $fondoColor
$form.Controls.Add($panelElegir)

$lblDonde = New-Object System.Windows.Forms.Label
$lblDonde.AutoSize = $false
$lblDonde.Location = New-Object System.Drawing.Point(0, 0)
$lblDonde.Size = New-Object System.Drawing.Size((T 620), (T 22))
$lblDonde.Font = New-Object System.Drawing.Font('Segoe UI', [math]::Max(8, (9 * $e)))
$lblDonde.ForeColor = $tenueColor
$lblDonde.Text = $t.donde
$panelElegir.Controls.Add($lblDonde)

$txtRuta = New-Object System.Windows.Forms.TextBox
$txtRuta.Location = New-Object System.Drawing.Point(0, (T 24))
$txtRuta.Size = New-Object System.Drawing.Size((T 476), (T 30))
$txtRuta.Font = New-Object System.Drawing.Font('Segoe UI', [math]::Max(8, (9.5 * $e)))
$txtRuta.BackColor = [System.Drawing.Color]::FromArgb(15, 22, 32)
$txtRuta.ForeColor = $textoColor
$txtRuta.BorderStyle = 'FixedSingle'
$txtRuta.Text = $script:rutaInicial
$panelElegir.Controls.Add($txtRuta)

$btnCambiar = Nuevo-Boton $t.cambiar (T 486) (T 24) (T 134) (T 30) $false
$panelElegir.Controls.Add($btnCambiar)

$btnCancelar = Nuevo-Boton $t.cancelar (T 300) (T 68) (T 120) (T 38) $false
$panelElegir.Controls.Add($btnCancelar)

$btnInstalar = Nuevo-Boton $t.instalar (T 430) (T 68) (T 190) (T 38) $true
$panelElegir.Controls.Add($btnInstalar)

# --- Estado 2: instalando ----------------------------------------------------------------------
$panelProgreso = New-Object System.Windows.Forms.Panel
$panelProgreso.Location = $cajaPanel
$panelProgreso.Size = $cajaTam
$panelProgreso.BackColor = $fondoColor
$panelProgreso.Visible = $false
$form.Controls.Add($panelProgreso)

$lblEstado = New-Object System.Windows.Forms.Label
$lblEstado.AutoSize = $false
$lblEstado.TextAlign = 'MiddleCenter'
$lblEstado.Location = New-Object System.Drawing.Point(0, (T 18))
$lblEstado.Size = New-Object System.Drawing.Size((T 620), (T 30))
$lblEstado.Font = New-Object System.Drawing.Font('Segoe UI', [math]::Max(8.5, (10 * $e)), [System.Drawing.FontStyle]::Bold)
$lblEstado.ForeColor = $textoColor
$lblEstado.Text = $t.instalando
$panelProgreso.Controls.Add($lblEstado)

$altoBarra = [math]::Max(3, (T 4))
$carril = New-Object System.Windows.Forms.Panel
$carril.Location = New-Object System.Drawing.Point((T 110), (T 76))
$carril.Size = New-Object System.Drawing.Size((T 400), $altoBarra)
$carril.BackColor = [System.Drawing.Color]::FromArgb(42, 52, 68)
$panelProgreso.Controls.Add($carril)

$barra = New-Object System.Windows.Forms.Panel
$anchoTroz = [math]::Max(40, (T 110))
$barra.Size = New-Object System.Drawing.Size($anchoTroz, $altoBarra)
$barra.BackColor = $oro1
$barra.Location = New-Object System.Drawing.Point((-$anchoTroz), 0)
$carril.Controls.Add($barra)

# --- Estado 3: listo ---------------------------------------------------------------------------
$panelListo = New-Object System.Windows.Forms.Panel
$panelListo.Location = $cajaPanel
$panelListo.Size = $cajaTam
$panelListo.BackColor = $fondoColor
$panelListo.Visible = $false
$form.Controls.Add($panelListo)

$lblListo = New-Object System.Windows.Forms.Label
$lblListo.AutoSize = $false
$lblListo.TextAlign = 'MiddleCenter'
$lblListo.Location = New-Object System.Drawing.Point(0, (T 16))
$lblListo.Size = New-Object System.Drawing.Size((T 620), (T 30))
$lblListo.Font = New-Object System.Drawing.Font('Segoe UI', [math]::Max(8.5, (10 * $e)), [System.Drawing.FontStyle]::Bold)
$lblListo.ForeColor = $textoColor
$lblListo.Text = $t.listo
$panelListo.Controls.Add($lblListo)

$btnCerrar = Nuevo-Boton $t.cerrar (T 300) (T 56) (T 120) (T 38) $false
$panelListo.Controls.Add($btnCerrar)

$btnAbrir = Nuevo-Boton $t.abrir (T 430) (T 56) (T 190) (T 38) $true
$panelListo.Controls.Add($btnAbrir)

# --- Cambio de estado (el panel de fallo se crea mas abajo; Ver-Solo se define al final) --------
$script:panelElegir = $panelElegir
$script:panelProgreso = $panelProgreso
$script:panelListo = $panelListo

# --- Acciones ----------------------------------------------------------------------------------
$btnCambiar.Add_Click({
  $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
  $dlg.Description = $script:textos.carpeta
  $dlg.ShowNewFolderButton = $true
  $dlg.SelectedPath = $script:txtRuta.Text
  try {
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK -and $dlg.SelectedPath) {
      $script:txtRuta.Text = $dlg.SelectedPath
    }
  } finally {
    $dlg.Dispose()
  }
})

$btnCancelar.Add_Click({ $script:form.Close() })
$btnCerrar.Add_Click({ $script:form.Close() })

$btnAbrir.Add_Click({
  try {
    $exe = Join-Path $script:rutaFinal 'KoRForge.exe'
    if (Test-Path -LiteralPath $exe) { Start-Process -FilePath $exe | Out-Null }
  } catch { }
  $script:form.Close()
})

$btnInstalar.Add_Click({
  $ruta = $script:txtRuta.Text.Trim()
  if (-not $ruta) { $ruta = $script:rutaInicial }
  $script:rutaFinal = $ruta
  $script:lblEstado.Text = $script:textos.instalando
  Ver-Solo 'progreso'
  if (-not $script:instaladorExe -or -not (Test-Path -LiteralPath $script:instaladorExe)) {
    $script:lblEstado.Text = $script:textos.error
    return
  }
  # Si KoRForge esta abierto se le pide que se cierre EL (`--cerrar`): cerrarlo a la fuerza deja su
  # icono de la bandeja pegado en la barra de Windows hasta que pasas el raton (dueno, 24-10-2026:
  # *"se generan unos cuantos iconos fantasmas"*).
  try {
    $vivas = @(Get-Process -Name KoRForge -ErrorAction SilentlyContinue)
    if ($vivas.Count -gt 0) {
      $exeApp = $vivas[0].Path
      if ($exeApp -and (Test-Path -LiteralPath $exeApp)) {
        # La primera instancia cierra la que hay en marcha; las demas son lanzamientos que se van solos.
        try { Start-Process -FilePath $exeApp -ArgumentList '--cerrar' -Wait -WindowStyle Hidden | Out-Null } catch { }
      }
      foreach ($otro in $vivas) { try { [void]$otro.CloseMainWindow() } catch { } }
      $limiteCierre = (Get-Date).AddSeconds(5)
      while ((Get-Date) -lt $limiteCierre -and @(Get-Process -Name KoRForge -ErrorAction SilentlyContinue).Count -gt 0) {
        Start-Sleep -Milliseconds 150
      }
      Get-Process -Name KoRForge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }
  } catch { }
  try {
    # La app la abre esta ventana (boton "Abrir"), no el instalador silencioso.
    $env:KORFORGE_SIN_ABRIR = '1'
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $script:instaladorExe
    # `/D=` SIN comillas y al FINAL: asi lo exige NSIS aunque la ruta lleve espacios.
    $psi.Arguments = "/S /D=$ruta"
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.WindowStyle = 'Hidden'
    $psi.WorkingDirectory = (Split-Path -Parent $script:instaladorExe)
    $script:proceso = [System.Diagnostics.Process]::Start($psi)
  } catch {
    $script:lblEstado.Text = $script:textos.error
  }
})
$script:textos = $t
$script:txtRuta = $txtRuta
$script:form = $form
$script:barra = $barra
$script:lblEstado = $lblEstado

# --- Timers: barra animada y vigilancia del instalador silencioso -------------------------------
$script:pos = -$anchoTroz
$script:paso = [math]::Max(2, (T 7))
$script:ticks = 0
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 20
$timer.Add_Tick({
  $script:ticks = $script:ticks + 1
  if ($script:panelProgreso.Visible) {
    $script:pos = $script:pos + $script:paso
    if ($script:pos -gt (T 400)) { $script:pos = -$script:barra.Width }
    $script:barra.Left = $script:pos
  }
  if (($script:ticks % 8) -eq 0 -and $script:proceso) {
    if ($script:proceso.HasExited) {
      $script:proceso = $null
      $instalado = Test-Path -LiteralPath (Join-Path $script:rutaFinal 'KoRForge.exe')
      if ($script:panelProgreso.Visible) {
        if ($instalado) { Ver-Solo 'listo' } else { Ver-Solo 'fallo' }
      }
    }
  }
})
$script:timer = $timer
$timer.Start()

# --- Fallo: un panel con el aviso y "Cerrar" ---------------------------------------------------
$panelFallo = New-Object System.Windows.Forms.Panel
$panelFallo.Location = $cajaPanel
$panelFallo.Size = $cajaTam
$panelFallo.BackColor = $fondoColor
$panelFallo.Visible = $false
$form.Controls.Add($panelFallo)
$lblFallo = New-Object System.Windows.Forms.Label
$lblFallo.AutoSize = $false
$lblFallo.TextAlign = 'MiddleCenter'
$lblFallo.Location = New-Object System.Drawing.Point(0, (T 16))
$lblFallo.Size = New-Object System.Drawing.Size((T 620), (T 30))
$lblFallo.Font = New-Object System.Drawing.Font('Segoe UI', [math]::Max(8.5, (10 * $e)), [System.Drawing.FontStyle]::Bold)
$lblFallo.ForeColor = [System.Drawing.Color]::FromArgb(248, 113, 113)
$lblFallo.Text = $t.error
$panelFallo.Controls.Add($lblFallo)
$btnFallo = Nuevo-Boton $t.cerrar (T 430) (T 56) (T 190) (T 38) $false
$btnFallo.Add_Click({ $script:form.Close() })
$panelFallo.Controls.Add($btnFallo)
$script:panelFallo = $panelFallo

# Ver-Solo tiene que conocer tambien el panel de fallo: se define UNA vez, aqui, y los botones de
# arriba lo resuelven en el momento del clic.
function Ver-Solo([string]$cual) {
  $script:panelElegir.Visible = ($cual -eq 'elegir')
  $script:panelProgreso.Visible = ($cual -eq 'progreso')
  $script:panelListo.Visible = ($cual -eq 'listo')
  $script:panelFallo.Visible = ($cual -eq 'fallo')
}

[void]$form.Show()
[System.Windows.Forms.Application]::Run($form)