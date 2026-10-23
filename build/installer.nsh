; Instalador NSIS de KoRForge (electron-builder)
;
; La tarjeta de carga NO la pinta el instalador: la pinta un proceso aparte (script con una ventana
; WinForms que lanza la app, ver modules/updater.js) porque la instalacion dura ~8 s y la ventana del
; instalador no sirve para eso. Aqui solo se deja la red de seguridad: si algo fallara y el
; instalador termina sin que la app vuelva, la reabre. Sin argumentos a proposito: la tarjeta de
; "instalando al arrancar" solo debe salir como respaldo (marca en disco), no siempre.
;
; --- LA IMAGEN DE MARCA MIENTRAS INSTALA (dueno, 23-10-2026) ---------------------------------
; *"esta imagen debe salir en el instalador mientras instala"*. Las paginas del instalador de
; electron-builder no tienen hueco para una imagen grande (solo la cabecera de 150x57 y el lateral de
; 164x314 de la bienvenida), asi que la imagen se pinta igual que la tarjeta de las actualizaciones:
; una ventana aparte (build/instalando.ps1, WinForms) con el arte de la marca, reborde dorado y una
; barra que se mueve, lanzada OCULTA tras wscript para que no parpadee ninguna consola.
;
; Cuando se abre: en la pagina de instalacion (MUI_PAGE_CUSTOMFUNCTION_SHOW del instfiles), o sea
; justo cuando empiezan a copiarse los archivos. Solo en modo con ventana (una actualizacion
; automatica va con /S y ya trae su propia tarjeta) y nunca en el desinstalador.
; Cuando se cierra: al terminar `customInstall` se deja una marca en %TEMP% y la tarjeta se cierra
; sola; si el instalador muriera antes, tambien se cierra al desaparecer su proceso.

!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW kfTarjetaInstalando

  Function kfTarjetaInstalando
    ${If} ${Silent}
      Return
    ${EndIf}
    InitPluginsDir
    ; Los dos recursos viajan DENTRO del instalador y se sueltan en $PLUGINSDIR al empezar.
    File /oname=$PLUGINSDIR\kf-instalando.ps1 "${BUILD_RESOURCES_DIR}\instalando.ps1"
    File /oname=$PLUGINSDIR\kf-instalando.png "${BUILD_RESOURCES_DIR}\instalando.png"
    Delete "$TEMP\korforge_instalador_listo"
    ; El PID y el texto van por entorno: asi la tarjeta sabe cuando cerrarse y el texto sale ya
    ; traducido por el propio instalador ($(installing)).
    System::Call 'kernel32::GetCurrentProcessId() i .r0'
    System::Call 'kernel32::SetEnvironmentVariable(t "KORFORGE_INSTALADOR_PID", t "$0")'
    System::Call 'kernel32::SetEnvironmentVariable(t "KORFORGE_INSTALANDO_TEXTO", t "$(installing)")'
    FileOpen $1 "$PLUGINSDIR\kf-oculto.vbs" w
    FileWrite $1 'CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$PLUGINSDIR\kf-instalando.ps1""", 0, False'
    FileClose $1
    Exec 'wscript.exe "$PLUGINSDIR\kf-oculto.vbs"'
  FunctionEnd
!macroend

!macro customInstall
  ; La tarjeta se aparta en cuanto los archivos estan dentro (para que se vea la pagina final).
  ${IfNot} ${Silent}
    FileOpen $1 "$TEMP\korforge_instalador_listo" w
    FileWrite $1 'listo'
    FileClose $1
  ${EndIf}
  IfSilent app_launch
  Goto done
  app_launch:
    Exec '"$INSTDIR\KoRForge.exe"'
  done:
!macroend
