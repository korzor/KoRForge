# 2026-10-23 — KoRForge 1.2.26: ventana y descargas cerradas (K7–K12, K15)

Ficha de continuidad. Continúa la tanda K1–K6 (`HANDOFF-2026-10-23-seguridad-k1-k4.md`,
`HANDOFF-2026-10-23-k5-updater-hash.md`, `HANDOFF-2026-10-23-k6-urls-descarga.md`) y cierra el resto
de la auditoría del 22-10-2026 salvo la deuda de UI (K-D1–D11).

## K7 · ventana (crítica de la ventana)

- `main.js`: `setWindowOpenHandler` deniega ventanas nuevas y abre los enlaces `http(s)` en el
  navegador del sistema; `will-navigate` solo deja navegar a `127.0.0.1`/`localhost` (lo externo se
  abre fuera); `will-attach-webview` fuerza `nodeIntegration:false`, `contextIsolation:true`,
  `sandbox:true` y quita el `preload` al webview del navegador interno.
- `public/app.js`: el `<webview>` ya no lleva `allowpopups`.
- F12 (consola de desarrollo) queda solo en la versión de trabajo (`!app.isPackaged`).

## K8 · XSS de CurseForge + CSP

- `public/app.js`: `sanitizarHtmlCurseforge()` — whitelist de etiquetas y atributos, sin
  `script/style/iframe/on*/style`, `href/src` solo https o rutas relativas, `a` con
  `rel="noopener"`. Se aplica a TODAS las asignaciones de `detailHtmlBody.innerHTML`
  (original, traducida, re-render). Se expone como `window.KORForgeSanitize` (para la sonda).
- `public/index.html`: meta **CSP** (`default-src 'self'; script-src 'self'; style-src 'self'
  'unsafe-inline' + fonts.googleapis; font-src fonts.gstatic; img-src 'self' https: data: blob:;
  connect-src 'self'; frame-src https:`). Los fallbacks `onerror` inline de las imágenes se sustituyen
  por un listener global de `error`; la hoja de fuentes que esperaba a `onload` la activa el JS.

## K9 · zip-bomb en perfiles

- `modules/profiles.js`: `gunzipSync(..., { maxOutputLength: 512 * 1024 })`, tope de 2 MB al código
  pegado y tope de 500 addons por pack.

## K10 · API key de CurseForge fuera del código

- `modules/curseforge.js`: la clave ya NO está en el fuente. Se toma de
  `modules/_cfkey.generated.js` (lo inyecta el build), de `CF_API_KEY` o de `cf-key.local.txt`
  (solo desarrollo). `.gitignore` excluye ambos ficheros; `scripts/proteger-build.js` inyecta la
  clave al empaquetar y la borra al restaurar.

## K11 · puerto efímero (sin «reutiliza servidor activo»)

- `server.js`: `listen(0)` (puerto libre) y `esperarPuerto` (promesa) exportados; los checks de
  Host/Origin usan el puerto REAL. `main.js` carga la UI con `await backend.esperarPuerto` + token.
  Ya no hay puerto fijo 3847 ni riesgo de cargar la UI de otro proceso.

## K12 · token de `gh` cacheado

- `modules/updater.js`: `getGitHubToken` cachea el resultado media hora (antes ejecutaba
  `gh auth token` en cada descarga).

## K15 · autostart y kills propios

- `server.js` `setAutoStart`: el acceso directo apunta a `process.execPath` (antes a
  `Launch-KoRForge.vbs`, que no se empaqueta y lanzaba un electron inexistente).
- `main.js`: el arranque cierra solo instancias de ESTA instalación (wmic por
  `ExecutablePath` + PID distinto; fallback taskkill).
- `modules/updater.js`: el runner de actualización mata solo procesos cuyo `$_.Path -eq $appExe`
  (antes `Get-Process KoRForge,electron | Stop-Process`, todos los del usuario).

## Verificación

- Sonda `scripts/verificar-seguridad-api.js`: **53/53** (K1–K6 + K9 bomba rechazada, K10 sin clave en
  el fuente, K12 cacheado <20 ms, K15 sin wscript/vbs y sin kills globales).
- App real (**dev y binario empaquetado**, por CDP): puerto efímero (59123/59262, no 3847), token en
  la URL, CSP presente y **bloquea scripts inline**, saneador quita `<script>`/`onerror`/`javascript:`
  y conserva HTML legítimo, UI y `/api/config` OK, y **búsqueda de CurseForge con la clave inyectada**
  devuelve resultados.
- `npm run i18n:check`: 5 idiomas, 498 claves. Sin guiones largos.

## Publicación

Misma secuencia: `proteger-build` (inyecta la clave CF) → `electron-builder --win nsis zip dir` →
`proteger-build --restaurar` → `npm run release:github-api` → `publish-korforge-release.js --no-build`
→ tarjeta estática → deploy de Centolos → JSON al NAS a mano y binarios viejos apartados.

- Release **v1.2.26** (instalador 112,2 MB `8dd0671f…`, ZIP 152,2 MB `fa0764ec…`), web solo 1.2.26,
  build `20261023-132805`. La app del PC sigue en 1.2.22: la actualiza el dueño con el botón (la
  lleva directo a la 1.2.26).

## Pendiente

- **K-D1–D11** (deuda de UI/UX: responsive, foco, modales, toasts, contraste, estilos inline…) y
  **K11** del todo (handshake) ya cubierto por el puerto efímero.
- La app del PC: actualizar con el botón (no se ha hecho aquí a propósito).
