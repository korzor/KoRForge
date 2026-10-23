# CIERRE DE LA AUDITORÍA DE KORFORGE (22-10-2026) — 23-10-2026

Estado: **todas las tareas pendientes de la auditoría del 22-10-2026 están cerradas**, repartidas en
unas versiones que se publicaron en GitHub **y** en la web. Lo único que NO se toca por decisión
propia es la deuda arquitectónica **K-C1** (refactor de `app.js` en módulos), que no es de seguridad
y queda documentada como mantenimiento futuro.

## Tabla de cierre

| Punto | Severidad | Estado | Versión |
|---|---|---|---|
| **K1** API local sin auth (DNS-rebinding) | Crítica | ✅ token de sesión + Host/Origin/Sec-Fetch-Site | 1.2.23 |
| **K2** traversal en addons (`folderName`) | Crítica | ✅ `nombresSeguros` + contención | 1.2.23 |
| **K3** `exec` en `open-folder` | Crítica | ✅ `execFile` con argumentos | 1.2.23 |
| **K4** traversal en backups (`fileName`) | Alta | ✅ `nombresSeguros` + contención | 1.2.23 |
| **K5** actualizador sin hash ni versión validada | Alta | ✅ SHA-256 contra `SHA256SUMS.txt`, URL/versión fijas, fichero solo en `%TEMP%`, re-verificación antes de aplicar | 1.2.24 |
| **K6** SSRF en `install-url`/`install-file` | Alta | ✅ allowlist https (CurseForge/GitHub) + DNS público + redirecciones revalidadas | 1.2.25 |
| **K7** `webviewTag`/preload/F12 | Alta | ✅ sin popups, `will-navigate` solo a la app, webview seguro, F12 solo en dev | 1.2.26 |
| **K8** XSS de CurseForge + CSP | Alta | ✅ saneador de HTML + CSP + sin `onerror` inline | 1.2.26 |
| **K9** zip-bomb en perfiles | Media | ✅ `maxOutputLength` + tope de 2 MB y 500 addons | 1.2.26 |
| **K10** API key de CurseForge en el código | Media | ✅ fuera del fuente; inyectada al build desde `cf-key.local.txt` (gitignored) | 1.2.26 |
| **K11** puerto fijo / «reutiliza servidor» | Media | ✅ puerto efímero + `esperarPuerto` | 1.2.26 |
| **K12** `gh auth token` en cada descarga | Baja | ✅ cacheado 30 min | 1.2.26 |
| **K13** `config.json` con rutas personales | Baja | ✅ ya en `.gitignore` y no se empaqueta (no aplica al binario) | — |
| **K14** zip-bomb en `installer.js` | Baja | ✅ tope de descarga (300 MB) y descomprimido (400 MB) | 1.2.29 |
| **K15** autostart `.vbs` y kills globales | Baja | ✅ autostart al exe real; kill solo a la propia instalación | 1.2.26 |
| **K-C1** refactor de `app.js` (6 subsistemas en un closure) | deuda | ⚠️ **aceptada** (deuda de mantenimiento, documentada) | — |
| **K-C2** `err_err_…` en los mensajes de error | defecto | ✅ | 1.2.23 |
| **K-C3** versión `1.0.0` hardcodeada en `/api/config` | defecto | ✅ usa `package.json` | 1.2.29 |
| **K-C4** `err.message` al cliente en 500 | defecto | ✅ respuesta genérica `err_internal`; detalle al log | 1.2.29 |
| **K-C8** registro de addons no atómico | defecto | ✅ tmp + rename + cola | 1.2.29 |
| **K-D1** responsive | UI | ✅ `@media` 1366/1200/1024 y ventana desde 980 px | 1.2.28 |
| **K-D2** foco visible | UI | ✅ `:focus-visible` dorado, sin `outline:none` | 1.2.27 |
| **K-D3** modales | UI | ✅ role/aria-modal, foco, Esc y retorno | 1.2.27 |
| **K-D4** toasts | UI | ✅ `textContent` + `aria-live` | 1.2.27 |
| **K-D5** formularios | UI | ✅ `aria-label` traducible | 1.2.27 |
| **K-D6** cabecera y jerarquía | UI | ✅ logo `<button>`, pills con `aria-label`, un `h1` por vista | 1.2.27 |
| **K-D7** estados de carga | UI | ✅ esqueleto en la ficha + reintento del catálogo | 1.2.28 |
| **K-D8** actualizador | UI | ✅ cancelar descarga + «SHA-256 verificado» visible | 1.2.28 |
| **K-D9** tokens de color y tipografía | UI | ✅ variables y mínimo 0.8rem | 1.2.28 |
| **K-D10** textos | UI | ✅ emojis como decoración y todos los botones con `aria-label` | 1.2.27/1.2.28 |
| **K-D11** estilos inline | UI | ✅ estáticos a clases (quedan solo `display`/`width` dinámicos del JS) | 1.2.27 |

## Verificación acumulada

- `scripts/verificar-seguridad-api.js`: **57 comprobaciones en verde** (K1–K6, K9, K10, K12, K15,
  K-C3/K-C4/K-C8 y K14 incluidos).
- Por CDP sobre la app real y binarios empaquetados: token en URL, CSP bloqueando scripts inline,
  saneador, puerto efímero, dialogs con Esc/retorno de foco, toasts accesibles, responsive sin
  desborde a 1024/1120/1280/1440, esqueleto de la ficha y iconos de los estados vacíos.
- Instalación real (Questie desde GitHub) para validar la allowlist sin romper el flujo normal.
- `i18n:check` en verde en cada release (506 claves × 5 idiomas en la 1.2.29); sin guiones largos.

## Qué queda del proyecto

- **Deuda arquitectónica K-C1** (partir `app.js` en módulos): futuro, no bloquea nada.
- Decisiones del dueño fuera del código: imagen social del repo en GitHub, historial de git con
  menciones antiguas a la web (reescribir o no) y la marca OEPM.
- Las versiones 1.2.23 → 1.2.29 están en GitHub Releases (5 últimas) y la web sirve **solo la 1.2.29**.
