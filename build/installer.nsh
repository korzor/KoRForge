; Instalador NSIS de KoRForge (electron-builder)
;
; La tarjeta de carga NO la pinta el instalador: la pinta un proceso aparte (script con una ventana
; WinForms que lanza la app, ver modules/updater.js) porque la instalacion dura ~8 s y la ventana del
; instalador no sirve para eso. Aqui solo se deja la red de seguridad: si algo fallara y el
; instalador termina sin que la app vuelva, la reabre. Sin argumentos a proposito: la tarjeta de
; "instalando al arrancar" solo debe salir como respaldo (marca en disco), no siempre.

!macro customInstall
  IfSilent app_launch
  Goto done
  app_launch:
    Exec '"$INSTDIR\KoRForge.exe"'
  done:
!macroend

