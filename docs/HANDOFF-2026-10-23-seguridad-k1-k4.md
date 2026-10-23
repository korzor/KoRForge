# 2026-10-23 — KoRForge 1.2.23: perímetro del API local y nombres seguros (K1–K4)

Ficha de continuidad. Cierra los cuatro puntos críticos/altos de la auditoría del 22-10-2026
(`Documents\DeepSeek Harness\AUDITORIA-KORFORGE-2026-10-22.md`):

- **K1 · Crítica.** El API local (`127.0.0.1:3847`) no tenía autenticación ni validaba
  `Host`/`Origin`/`Sec-Fetch-Site`: con DNS-rebinding, cualquier web abierta en el navegador podía
  llamar a `/api/*`.
- **K2 · Crítica.** `DELETE /api/addons/:folderName` y `toggleAddon` hacían `path.join` con el nombre
  del cliente y `fs.rmSync`/`renameSync`: un `..%2F..` borraba cualquier carpeta.
- **K3 · Crítica.** `open-folder` ejecutaba `exec(\`explorer.exe "${nombre}"\`)`: inyección de
  comandos (`x" & powershell -c ... & "`).
- **K4 · Alta.** Los backups (`restore`/`delete`) usaban `fileName` del cliente en `path.join`:
  un `.zip` de fuera de `backups/<juego>` se podía borrar o extraer encima de otro directorio.

## Qué se cambió

- **`server.js`**
  - Token de sesión (`crypto.randomBytes(24)`, se genera en cada arranque) y `GET /api/session`
    (solo desde el propio host, `Cache-Control: no-store`). Todo `/api/*` pasa por un middleware que
    exige: `Host` = `127.0.0.1:<puerto>`/`localhost:<puerto>`/`[::1]:<puerto>`, `Origin` (si viene) del
    propio servidor, `Sec-Fetch-Site` en `same-origin`/`none` y el token (`X-KoRForge-Token` o
    `?token=`).
  - Cabecera `X-Content-Type-Options: nosniff` en todo el servidor.
  - Validación de `folderName`/`fileName` en las rutas (400 `err_invalid_name`) y `execFile`
    (argumentos, sin shell) en `open-folder`.
  - `module.exports = { PORT, SESSION_TOKEN }` para que la ventana conozca ambos.
- **`modules/nombresSeguros.js`** (nuevo): `esNombreDeCarpetaValido` (un solo segmento, sin
  `\ / : * ? " < > |` ni caracteres de control, sin `.`/`..`), `esNombreDeBackupValido` (`.zip`) y
  `estaDentroDe(base, ruta)` (contención real con `path.resolve`).
- **`modules/scanner.js`**: `toggleAddon` y `deleteAddon` validan el nombre y la contención antes de
  tocar disco (también los nombres que vienen del registro de instalaciones).
- **`modules/backup.js`**: `restoreBackup` y `deleteBackup` validan el nombre y la contención.
- **`main.js`**: la ventana carga `http://127.0.0.1:<puerto>/?token=<token>` (puerto real y token del
  backend; antes 3847 fijo).
- **`public/app.js`**: al arrancar lee el token de la URL (una vez: la SPA puede cambiar la URL
  después) y envuelve `window.fetch` para añadir `X-KoRForge-Token` a toda petición a `/api`.
  De paso, **K-C2**: `mensajeDeError` ya no pide `T('err_' + code)` (los códigos ya llevan `err_`, de
  ahí los `err_err_...` que salían crudos): ahora usa el código tal cual si empieza por `err_`.
- **`public/i18n.js`**: 4 claves nuevas × 5 idiomas (`err_invalid_name`, `err_bad_host`,
  `err_bad_origin`, `err_bad_token`). Total: 495 claves por idioma.

## Cómo se verificó

- **`scripts/verificar-seguridad-api.js`** (nuevo, `node scripts/verificar-seguridad-api.js`):
  arranca `server.js` en un puerto y un `KORFORGE_USER_DATA` **temporales** (no toca la app ni la
  config real) y comprueba por HTTP: módulo de nombres (9 casos), token de sesión, host/origen
  ajenos (403), `Sec-Fetch-Site: cross-site` (403), sin token / token falso (401), con token y por
  query (200), traversal en addons y backups (400 `err_invalid_name`), comillas en `open-folder`
  (400) y backup que no es `.zip` (400). **24/24 en verde.**
- **Punta a punta con la app real** (`npx electron . --remote-debugging-port=9333` + CDP): la URL de
  la ventana lleva `token=`, `window.__KORFORGE_TOKEN__` existe, la UI pinta el menú,
  `/api/config` y `/api/ping` responden 200 desde la página, un token falso da 401 y
  `I18N.t('err_invalid_name')` devuelve texto.
- `npm run i18n:check`: **5 idiomas, 495 claves, sin textos fijos**. Regla de guiones largos: limpia.

## Publicación (regla «sube a GitHub» = release **y** web)

Flujo del 23-10-2026, repetible: `proteger-build` → `electron-builder --win nsis zip dir` →
`proteger-build --restaurar` → binarios en `release/` → release v1.2.23 en GitHub (API REST, porque
`gh release upload` se atasca con varios assets) con instalador + ZIP + `SHA256SUMS.txt` → web con
`node scripts/publish-korforge-release.js --no-build` → tarjeta estática de la web + registro al NAS
(`deploy-to-nas.ps1` excluye `data/`).

## Pendiente (siguiente tanda de la auditoría)

- **K5** (actualizador: URL fija del release, regex de versión, verificar SHA-256), **K6** (allowlist
  de URLs de descarga: SSRF), **K7** (`webviewTag`/preload/F12), **K8** (XSS de la descripción de
  CurseForge + CSP), **K9** (zip-bomb en perfiles), **K10** (API key de CurseForge de fallback),
  **K11** (puerto fijo y «reutiliza servidor activo» sin handshake), **K12/K15** y la deuda
  **K-D1–D11**. Nota: con K1 cerrado, el API local ya no es alcanzable desde una web ajena.

## Trampas

- El token viaja en la URL de la ventana; **no** se registra en logs (main.js no lo pinta; `boot.log`
  solo anota la URL de `Listening`, sin token).
- `server.js` se `require`-a desde `main.js`: si se carga dos veces por el mismo proceso, el segundo
  require devuelve el módulo cacheado (mismo token y puerto).
- Las sondas de la carpeta `scripts/` (verificar-ui-interfaz, verificar-ficha-addon) siguen valiendo:
  trabajan sobre CDP con la app real, que ya carga con token.
