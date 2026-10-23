# KoRForge en Linux (AppImage)

Estado: port terminado en codigo desde 1.2.37. El AppImage se publica junto al .exe y el .zip en
cada release de GitHub.

## Que cambia respecto a Windows

- Iconos: la ventana y la bandeja usan `korforge.png` (el `.ico` no vale en Linux).
- Abrir carpeta: `xdg-open` en vez de `explorer.exe`.
- Arranque automatico: se escribe `~/.config/autostart/korforge.desktop`. En un AppImage la ruta
  que se guarda es la de `process.env.APPIMAGE`, no la del binario extraido en /tmp.
- Actualizador: no hay NSIS ni PowerShell. Se descarga el AppImage nuevo, se comprueba el SHA-256,
  se copia al lado del actual (mismo directorio, que si es escribible), `chmod 755`, `rename` encima
  del que se esta ejecutando y se relanza en segundo plano.
- Si el AppImage esta en un sitio sin permiso de escritura (por ejemplo /opt sin root), la app
  avisa y no aplica la actualizacion.

## Como se compila (obligatorio en Linux/WSL)

electron-builder no puede generar AppImage desde Windows: falla con
`EPERM: operation not permitted, symlink`. Hay que compilar dentro de Linux (usamos WSL2 Ubuntu).

```bash
# Node portable (sin sudo), una sola vez
mkdir -p ~/.local && cd ~/.local
curl -fsSL https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz | tar -xJ
export PATH="$HOME/.local/node-v22.23.4-linux-x64/bin:$PATH"

# Copia del proyecto y compilacion
PROY="$HOME/korforge"; mkdir -p "$PROY"
rsync -a --delete --exclude node_modules --exclude release --exclude .git \
  --exclude .build-src-backup --exclude data --exclude backups --exclude cache \
  "/mnt/c/Users/KoRZoR/Downloads/WoW4Ever/" "$PROY/"
cd "$PROY" && npm ci --no-audit --no-fund && npx electron-builder --linux AppImage
# -> release/KoRForge-<version>-linux-x86_64.AppImage  (unos 130 MB)
```

En Windows basta con lanzar el script de siempre desde PowerShell:

```powershell
wsl -d Ubuntu -- bash /mnt/c/Users/KoRZoR/AppData/Local/Temp/wsl-build.sh
```

## Publicacion en el release

1. Copiar el AppImage a `C:\Users\KoRZoR\Downloads\WoW4Ever\release\`.
2. `node scripts/sha256-release.js` (ya incluye el AppImage en `SHA256SUMS.txt`).
3. `node scripts/subir-release-github.js` (sube .exe, .zip, .AppImage y SHA256SUMS).
4. `node scripts/publish-korforge-release.js --no-build` (copia el AppImage a `data/` y lo anade al
   registro web como `tipo: 'appimage'`, arquitectura `Linux x86_64`).

El actualizador de Linux busca el asset `KoRForge-<version>-linux-x86_64.AppImage` y verifica su
SHA-256 contra `SHA256SUMS.txt` igual que el .exe en Windows.

## Pruebas hechas

- Arranque del AppImage en WSL2 con `--ozone-platform=headless` y comprobacion de `/api/session`
  (401 sin token, 200 con token) por CDP.
- Actualizacion real contra GitHub: publicar dos versiones seguidas y ver que la app descarga,
  verifica, sustituye y relanza.

## Pendiente conocido

- No hay firma de codigo en Linux (igual que en Windows, que tampoco esta firmado).
- El aviso de "primer arranque" de AppImage (marcar como ejecutable) lo resuelve el propio dueño
  con `chmod +x` o desde las propiedades del archivo en su escritorio.
