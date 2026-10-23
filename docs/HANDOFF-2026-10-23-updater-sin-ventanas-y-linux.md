# Ficha 23-10-2026 (tarde) — Actualizador sin ventanas y Linux (AppImage)

Versión final: **1.2.37**. Sucesoras de trabajo: 1.2.33 a 1.2.36 (pruebas).

## 1. El botón de actualizar ya no abre ventanas

**Problema del dueño**: al actualizar desde la app salía una ventana de PowerShell (o un parpadeo) y
luego había que reiniciar a mano.

**Lo que se probó y NO funcionó** (las tres primeras quedan documentadas para no repetirlas):

1. PowerShell con `-WindowStyle Hidden` (lo que había): funciona, pero parpadea porque `powershell.exe`
   es DPI-unaware y Windows le da su propia consola.
2. `--updated` para que el propio instalador relance: NSIS no lo relanzaba.
3. Un relanzador `cmd /c ping ... & start ""` desde `node`: el `spawn` de cmd no arrancaba nada de
   forma fiable (0 procesos en todas las variantes, incluso sin `detached`).

**Lo que sí funciona (1.2.37)**:

- `modules/updater.js` → `spawn(installerPath, ['/S'], { detached: true, stdio: 'ignore', windowsHide: true, shell: true })`
  y `setTimeout(cerrarApp, 700)`. Ningún PowerShell, ninguna consola.
- `build/installer.nsh` (nuevo, y **versionado**: `.gitignore` tiene `build/*` + `!build/installer.nsh`)
  añade `customInstall` con `IfSilent` → `Exec "$INSTDIR\KoRForge.exe"`. El instalador relanza la app
  **solo** en instalación silenciosa; si el dueño instala a mano sigue saliendo la casilla
  «Ejecutar KoRForge» de siempre (`runAfterFinish: true`).

**Verificación (definitiva, 23-10-2026 15:30)**: app 1.2.37 instalada, CDP en el puerto 9335,
`POST /api/app-updates/apply` → la app se cierra, el instalador instala y **la app vuelve a arrancar
con ventana en 1,7 s**, versión 1.2.37 intacta. Sobre los `powershell.exe` que aparecen durante el
apply: un vigilante de procesos (`%TEMP%\vigilar-ps.ps1`) demostró que los lanza el **propio NSIS**
(`KoRForge-Setup-1.2.37.exe` y `old-uninstaller.exe`) con `nsExec::Exec` (ocultos, sin ventana), para
comprobar si la app está corriendo. No los lanza KoRForge.

## 2. Linux: AppImage que se actualiza solo contra GitHub

Código (desde 1.2.37, ya en `main`):

- `nombreDelAsset(version, plataforma)` elige `KoRForge-<v>-linux-x86_64.AppImage` en Linux.
- `aplicarActualizacionLinux`: copia el AppImage descargado a `<destino>.new`, `chmod 755`, `rename`
  encima del que está en marcha (`process.env.APPIMAGE`) y `spawn(destino, [], { detached: true })`.
- `server.js`: `xdg-open` para abrir carpetas y autostart por `~/.config/autostart/korforge.desktop`
  (guardando `$APPIMAGE`, no el binario extraído en /tmp).
- `main.js`: icono de ventana y bandeja `korforge.png` en Linux.
- `scripts/sha256-release.js` y `scripts/publish-korforge-release.js` incluyen el AppImage
  (hash en `SHA256SUMS.txt`, entrada `tipo: 'appimage'` en el registro web).

**Compilación**: solo desde Linux/WSL (`npx electron-builder --linux AppImage` desde Windows falla con
`EPERM: symlink`). Script de trabajo: `%TEMP%\wsl-build.sh` (`proteger-build` → electron-builder
linux → `--restaurar`). **Importante**: hay que ejecutar `proteger-build.js` también en Linux, o la
build sale sin la clave de CurseForge (pasó en el primer intento y el buscador daba 403).

**Verificación en WSL2 (sin sudo)**, ver `docs/LINUX.md` para el detalle del entorno:

- Se desempaquetaron las libs que le faltan a WSL (`apt-get download` + `dpkg -x` en `~/kf-libs`) y se
  levantó un Xvfb :99 propio (paquete `xvfb` de universe + `proot` para el `/usr/bin/xkbcomp`).
- La app arranca, sirve `/api/config` (401 sin token, 200 con `x-korforge-token`) y **busca en
  CurseForge de verdad** (Details! Damage Meter, etc.).
- **Actualización real**: `/api/app-updates/download` del asset de la release + `/apply` → el AppImage
  se sustituye a sí mismo (hash 351999d1…), queda con fecha nueva y **la app vuelve a arrancar y
  responde** en un puerto nuevo. OK.

## 3. Publicación

- GitHub `v1.2.37`: `KoRForge-Setup-1.2.37.exe`, `KoRForge-1.2.37-win.zip`,
  `KoRForge-1.2.37-linux-x86_64.AppImage` y `SHA256SUMS.txt`.
- Web (`wow.centolos.org`): registro con las tres descargas (AppImage incluido), tarjeta estática en
  1.2.37 con botón «Descargar Linux» y `wow.js?v=45` para pintar el pingüino.
- Binarios 1.2.32 movidos a `data/obsoletos-korforge-<sello>` en el NAS.

## 4. Pendiente / siguiente

- El dueño actualiza su app con el botón (la instalada ya es 1.2.37 por las pruebas).
- `desktopName` sin declarar: electron-builder avisa de que la asociación ventana↔lanzador en Linux
  puede no salir. Cosmético, se puede añadir `"desktopName": "korforge"` y `linux.syncDesktopName`.
- Prueba en una máquina Linux real (no WSL) con FUSE: es lo único que falta del camino oficial.
