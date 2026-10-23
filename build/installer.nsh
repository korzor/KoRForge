; Instalador NSIS de KoRForge (electron-builder)
;
; --- TODA LA INSTALACION PASA POR LA VENTANA DE KoRForge (dueno, 24-10-2026) -------------------
; *"el instalador no te permite elegir ruta de instalacion... me parece mal"* y *"ya que tenemos la
; ventana hecha del progreso, no podriamos hacer que todo el proceso transcurriese en esa misma
; ventana?"*. Las dos cosas van juntas: el asistente de electron-builder se salta la pagina de la
; carpeta justo cuando es una ACTUALIZACION (`skipPageIfUpdated`), asi que la ruta no se puede
; cambiar; y sus paginas no tienen hueco para el arte de la marca.
;
; Ahora manda la ventana propia (build/instalando.ps1): ensena el arte de KoRForge con su reborde
; dorado, deja elegir la carpeta, instala y avisa al terminar, con los botones "Abrir KoRForge" y
; "Cerrar". Aqui solo se hace el relevo:
;
;   1. Este proceso suelta la ventana y sus imagenes en %TEMP%\korforge-instalador (NO en
;      $PLUGINSDIR, que se borra al salir) y la lanza oculta tras wscript, sin consola.
;   2. Si wscript la ha lanzado, este proceso se aparta (`Quit`).
;   3. La ventana, cuando el usuario pulsa "Instalar", ejecuta ESTE MISMO instalador en silencio con
;      la carpeta elegida: `KoRForge-x.y.z-Windows.exe /S /D=<ruta>`. El trabajo de verdad (archivos,
;      accesos directos, desinstalador y registro) lo sigue haciendo NSIS: aqui no se reimplementa
;      nada. El `/D=` de NSIS no admite comillas y tiene que ir al final, y asi se pasa.
;   4. Con `KORFORGE_SIN_ABRIR` puesta, el instalador silencioso NO reabre la app: la abre el boton de
;      la ventana. Sin esa variable (actualizacion automatica) se comporta como siempre.
;
; SI LA VENTANA NO ARRANCA, el instalador sigue con el asistente de siempre: el usuario nunca se
; queda sin poder instalar.

!macro customInit
  ${IfNot} ${Silent}
    CreateDirectory "$TEMP\korforge-instalador"
    SetOutPath "$TEMP\korforge-instalador"
    ; OJO CON EL NOMBRE: `instalando.ps1` busca `kf-instalando.png` a su lado. Si aquí se suelta con
    ; el nombre del repositorio (`instalando.png`), la ventana abre sin imagen: queda el hueco y nada
    ; dentro (dueno, 24-10-2026: *"no sale el logo... esta el hueco pero no hay imagen"*).
    File "${BUILD_RESOURCES_DIR}\instalando.ps1"
    File /oname=kf-instalando.png "${BUILD_RESOURCES_DIR}\instalando.png"
    SetOutPath "$TEMP"
    ; Lo que la ventana necesita saber: con que ejecutable instala, donde esta (o deberia estar)
    ; KoRForge hoy y en que idioma hablar.
    System::Call 'kernel32::SetEnvironmentVariable(t "KORFORGE_INSTALADOR_EXE", t "$EXEPATH")'
    System::Call 'kernel32::SetEnvironmentVariable(t "KORFORGE_INSTDIR", t "$INSTDIR")'
    System::Call 'kernel32::SetEnvironmentVariable(t "KF_IDIOMA", t "$LANGUAGE")'
    FileOpen $1 "$TEMP\korforge-instalador\lanzar.vbs" w
    FileWrite $1 'CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$TEMP\korforge-instalador\instalando.ps1""", 0, False'
    FileClose $1
    nsExec::Exec 'wscript.exe "$TEMP\korforge-instalador\lanzar.vbs"'
    Pop $0
    ${If} $0 == 0
      ; La ventana ya esta en pantalla: este proceso no pinta nada mas.
      Quit
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  ; Marca para la tarjeta de la actualizacion automatica (modules/updater.js), que se cierra al
  ; verla: la ventana del instalador no la necesita, se guia por el proceso del instalador.
  ${IfNot} ${Silent}
    FileOpen $1 "$TEMP\korforge_instalador_listo" w
    FileWrite $1 'listo'
    FileClose $1
  ${EndIf}
  IfSilent app_launch
  Goto done
  app_launch:
    ; Instalacion silenciosa: la lanza la actualizacion automatica (que quiere la app de vuelta) o
    ; la ventana del instalador (que la abre con su boton). En el segundo caso no se toca nada.
    ClearErrors
    ReadEnvStr $2 "KORFORGE_SIN_ABRIR"
    ${If} $2 != ""
      Goto done
    ${EndIf}
    Exec '"$INSTDIR\KoRForge.exe"'
  done:
!macroend
