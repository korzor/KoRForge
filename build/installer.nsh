; Instalador NSIS de KoRForge (electron-builder)
; - En una instalación SILENCIOSA (el actualizador de la app), tras instalar se abre la app sola,
;   con --actualizado: asi la tarjeta de arranque dice que se ha actualizado (dueño, 23-10-2026).
; - En una instalación manual (asistente), no hace nada: el usuario tiene la casilla "Ejecutar".
!macro customInstall
  IfSilent app_launch
  Goto done
  app_launch:
    Exec '"$INSTDIR\KoRForge.exe" --actualizado'
  done:
!macroend
