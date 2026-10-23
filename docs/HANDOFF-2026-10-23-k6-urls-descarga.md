# 2026-10-23 — KoRForge 1.2.25: descargas de addons con allowlist de URLs (K6)

Ficha de continuidad. Cierra **K6** de la auditoría del 22-10-2026 (SSRF en las descargas de addons).

## El fallo

`modules/installer.js` descargaba cualquier URL que llegara al API local (`/api/install-url` e
`/api/install-file` con `url`/`downloadUrl` del cliente) sin validar esquema, host ni redirecciones.
Con eso se podía pedir a la app que descargara desde `127.0.0.1`/la intranet (SSRF) y el contenido
acababa extraído en `Interface/AddOns`.

## Qué se cambió (`modules/installer.js`)

- **Allowlist de hosts**: solo `https:` desde `github.com`, `www.github.com`, `api.github.com`,
  `codeload.github.com`, `raw.githubusercontent.com`, `objects.githubusercontent.com`,
  `release-assets.githubusercontent.com`, `github-releases.githubusercontent.com` y cualquier
  `*.forgecdn.net` (CurseForge). URLs con usuario/contraseña embebidos también se rechazan.
- **DNS público** (`validarUrlDescarga`): resuelve el host y exige que **todas** sus direcciones sean
  públicas (nada de `10.x`, `127.x`, `169.254.x`, `172.16-31.x`, `192.168.x`, `::1`, `fc00::/7`,
  `fe80::/10`).
- **Redirecciones validadas una a una** (`descargarConValidacion`): `redirect: 'manual'`, cada salto
  pasa otra vez por la allowlist + DNS, máximo 5 saltos. Así los redirects legítimos de GitHub
  (`github.com` → `objects.githubusercontent.com`/`codeload`) siguen funcionando.
- `installFromUrl` valida también la URL de entrada (segunda barrera, por si se llama desde otro sitio).
- Exporta `esUrlDeDescargaPermitida`, `validarUrlDescarga` y `esIpNoPublica` (para la sonda).

## server.js

- `POST /api/install-url` y `POST /api/install-file`: validan la URL antes de tocar nada y responden
  **400 `err_bad_url`** si no pasa. Clave i18n nueva × 5 idiomas (`err_bad_url`); 498 claves por idioma.

## Verificación

- Sonda `scripts/verificar-seguridad-api.js`: **48/48** con 14 comprobaciones K6: hosts permitidos
  (forgecdn/github), `http` rechazado, `127.0.0.1`/`localhost`/`file:` rechazados, host ajeno y sufijo
  falso rechazados, IPs privadas detectadas (v4 y v6), rutas 400 `err_bad_url`, y **DNS público de
  github.com** aceptado.
- **Instalación legítima real**: `installer.installFromUrl('https://github.com/Questie/Questie/releases/latest')`
  descargó (con los redirects de GitHub) y extrajo `Questie` + `QuestieDB` en un directorio temporal;
  después se borró. La allowlist no rompe el flujo normal.
- `npm run i18n:check`: 5 idiomas, 498 claves, sin textos fijos.

## Publicación

Misma secuencia: `proteger-build` → `electron-builder --win nsis zip dir` → `proteger-build
--restaurar` → `npm run release:github-api` → `node scripts/publish-korforge-release.js --no-build` →
tarjeta estática de la web → deploy de Centolos → JSON del registro al NAS a mano y binarios viejos
apartados.

## Pendiente (siguiente tanda)

- **K7** (`webviewTag`/preload/F12), **K8** (XSS de la descripción de CurseForge + CSP), **K9**
  (zip-bomb en perfiles), **K10** (API key de CurseForge de fallback), **K11** (puerto fijo/handshake),
  **K12/K15** y la deuda **K-D1–D11**.
- Nota: la app del dueño sigue en 1.2.22; el botón la llevará directo a la última (1.2.25) cuando la
  actualice él.
