; Instalador NSIS de KoRForge (electron-builder)
; - En una instalación SILENCIOSA (el actualizador de la app), tras instalar se abre la app sola.
; - En una instalación manual (asistente), no hace nada: el usuario tiene la casilla "Ejecutar".
!macro customInstall
  IfSilent app_launch
  Goto done
  app_launch:
    Exec "$INSTDIR\KoRForge.exe"
  done:
!macroend
