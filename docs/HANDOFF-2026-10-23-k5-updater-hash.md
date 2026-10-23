# 2026-10-23 — KoRForge 1.2.24: el actualizador verifica el SHA-256 (K5) y el menú lateral cambia de orden

Ficha de continuidad. Cierra **K5** de la auditoría del 22-10-2026 (el punto más grave que quedaba
en el binario) y recoge el cambio de orden del menú lateral pedido por el dueño.

## K5 · el actualizador no verificaba nada

Lo que había (auditoría 22-10): (a) el `.exe` descargado se aplicaba **sin comprobar hash ni firma**;
(b) el nombre del fichero salía de `version` del cliente (`version='..\..\AppData\Roaming\…'`
escribía fuera de `%TEMP%`); (c) la `downloadUrl` era libre; (d) luego se ejecutaba
`Start-Process $installer /S` en silencio.

## Qué se cambió

- **`modules/updater.js`**
  - Helpers nuevos: `esVersionValida` (`^\d+\.\d+\.\d+$`), `urlInstaladorOficial`, `urlSha256Sums`,
    `esUrlDeAssetPermitida` (solo `api.github.com/repos/korzor/KoRForge/releases/assets/<id>`),
    `esUrlDeInstalador`, `estaEnTemporal` (contención en `os.tmpdir()`), `sha256DeArchivo` (por trozos)
    y `sha256OficialDe` (lee el `SHA256SUMS.txt` del release y saca el hash del instalador).
  - `startUpdateDownload`: la versión se valida, la URL debe ser la canónica del release **de esa
    versión** (o un asset del repo), el fichero siempre se llama `KoRForge-Setup-<versión>.exe` dentro
    de `%TEMP%`, y **después de descargar se compara su SHA-256 con el publicado**; si no coincide, se
    borra el fichero y la descarga queda en `error`.
  - `applyUpdateAndRestart`: exige que el fichero siga en el temporal y **re-verifica el SHA-256**
    antes de lanzar el instalador.
- **`server.js`**
  - `checkGitHubRelease`: solo ofrece versiones `x.y.z` y construye la `downloadUrl` desde el release
    oficial (`.../releases/download/v<x.y.z>/KoRForge-Setup-<x.y.z>.exe`); ya no se usa la URL del
    primer asset que aparezca.
  - `POST /api/app-updates/download`: valida versión (`err_invalid_version`) y URL
    (`err_invalid_url`) antes de arrancar la descarga.
- **`public/i18n.js`**: 2 claves nuevas × 5 idiomas (`err_invalid_version`, `err_invalid_url`).
  Total **497** claves por idioma.
- **`scripts/verificar-seguridad-api.js`**: la sonda crece con 10 comprobaciones de K5 (versión,
  URL canónica/ajena/de otra versión, asset ajeno, rutas 400, y el contrato real del release:
  `SHA256SUMS.txt` del release de la versión actual coincide con el binario de `release/`).

## Verificación

- Sonda: **34/34 en verde**, incluido `K5 el release publica SHA256SUMS del instalador` y
  `K5 SHA-256 del release = binario local`.
- **Descarga real** del instalador oficial con `updater.startUpdateDownload` (sin aplicar):
  completada y verificada, SHA-256 `cd121318…` (el mismo del release); fichero temporal borrado.
- **Chequeo por CDP** contra la app (código nuevo): `/api/app-updates/check` devuelve
  `remoteVersion 1.2.23` y la URL canónica
  `https://github.com/korzor/KoRForge/releases/download/v1.2.23/KoRForge-Setup-1.2.23.exe`; un POST de
  descarga con URL ajena responde **400**.
- `npm run i18n:check`: 5 idiomas, 497 claves, sin textos fijos.

## Menú lateral (pedido del dueño)

- `public/index.html`: en el pie del menú lateral, **Ajustes** va ahora encima y el **botón de
  versión** (cohete + `v1.2.x`) debajo (antes al revés). `app.js` trabaja por `id`, así que no hace
  falta tocar nada más. Verificado en la app real por CDP: `[settings → btnAppUpdate]`, ambos
  visibles.

## Publicación

Misma secuencia que la 1.2.23: `proteger-build` → `electron-builder --win nsis zip dir` →
`proteger-build --restaurar` → `npm run release:github-api` (release por API REST) →
`node scripts/publish-korforge-release.js --no-build` → tarjeta estática de la web → deploy de
Centolos → JSON del registro al NAS a mano y binarios viejos apartados.

## Pendiente (siguiente tanda)

- **K6** (allowlist de URLs de `install-url`/`install-file`), **K7** (`webviewTag`/preload/F12),
  **K8** (XSS de la descripción de CurseForge + CSP), **K9** (zip-bomb en perfiles), **K10** (API key
  de CurseForge de fallback), **K11** (puerto fijo/handshake), **K12/K15** y la deuda **K-D1–D11**.
- Nota: el actualizador de la 1.2.24 ya verifica el hash; la app del dueño (1.2.22) se actualizará
  con el botón como siempre (su actualizador es el de la 1.2.22, que no comprobaba hash, pero el
  binario que instala sí está publicado en el release oficial).
