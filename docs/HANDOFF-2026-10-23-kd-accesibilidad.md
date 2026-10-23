# 2026-10-23 — KoRForge 1.2.27: accesibilidad de teclado, focos y avisos (K-D2, K-D3, K-D4, K-D5, K-D6, K-D11)

Ficha de continuidad. Primera tanda de la deuda de UI (**K-D1–D11**). Queda para la 1.2.28 el
**responsive (K-D1)**, los **tokens de color/tipografía (K-D9)** y los **estados de carga /
cancelación de descarga (K-D7/K-D8)**.

## Qué se cambió

- **K-D2 · foco visible**: regla global `:focus-visible` con anillo dorado (`--accent-gold`) y se
  quitaron los **5** `outline: none` de `style.css` que lo anulaban (busca­dores, inputs y selects).
- **K-D5 · formularios**: `data-i18n-aria-label` (nuevo soporte en `i18n.js`) y `aria-label` en
  `searchInput`, `favSearchInput`, `cfSearchInput`, `rootWoWPath`, `installUrlInput` y los tres
  switches de Ajustes. 3 claves nuevas × 5 idiomas (`aria_search`, `aria_install_url`,
  `aria_game_path`); 501 claves por idioma.
- **K-D6 · cabecera**: el logo pasa de `div` a **`<button>`** con `aria-label` (y CSS de botón
  reset + `-webkit-app-region` para que siga arrastrando la ventana); los pills de juego llevan
  `aria-label`; solo queda un `h1` por vista (las otras tres pasan a `h2` con la misma clase).
- **K-D3 · modales**: los cuatro modales (actualización, exportar, importar y masiva) llevan
  `role="dialog" aria-modal="true" aria-labelledby` y usan un helper común en `app.js`
  (`abrirModalDialogo`/`cerrarModalDialogo`): foco al abrir, **Esc para cerrar** y devolución del
  foco al elemento anterior. `askConfirm` ya tenía Esc/Enter; se le añadió el retorno del foco.
- **K-D4 · toasts**: `showToast` construye con `textContent` (icono incluido, sin `innerHTML`) y el
  contenedor lleva `role="status" aria-live="polite" aria-atomic="true"`.
- **K-D11 · estilos inline**: los estilos estáticos de `index.html` (select de idioma, about-val,
  exportar/importar, botón del pack, barra masiva) pasan a clases en `style.css`
  (`.settings-select`, `.about-val-green`, `.modal-field/-label/-input/-textarea`,
  `.modal-dialog-wide`, `.btn-full`, `.import-analysis/-summary/-list`, `.bulk-results`,
  `.import-progress`, `.update-progress-wrap--mb`). Quedan inline solo los `display`/`width` que
  cambia el JS (los modales, barras y botones de progreso).

## Verificación (CDP sobre la app real, 17/17)

- El logo es `<button>` y tiene `aria-label`; pills con `aria-label`.
- **Tab mueve el foco y se ve el anillo** (outline distinto de `none`).
- Inputs de búsqueda y switches con `aria-label`.
- Los cuatro modales exponen `role="dialog"`; el de actualización **se abre, el foco entra**, **Esc
  lo cierra y el foco vuelve** al botón.
- Toasts: contenedor con `role="status"`/`aria-live="polite"` y el texto pintado sin HTML crudo.
- `i18n:check`: 5 idiomas, 501 claves. Sin guiones largos.

## Publicación

Release **v1.2.27** en GitHub (instalador 112,2 MB `ad256e07…`, ZIP 152,2 MB), web con solo la
1.2.27 en el NAS, registro a mano y tarjeta v1.2.27. Build web `20261023-134214`. Commits:
`11e0c09` (accesibilidad) y `81e2287` (release).

## Pendiente (segunda tanda)

- **K-D1** responsive con `@media` (1366/1280/1120) bajando el `minWidth` de la ventana.
- **K-D9** tokens de color (46 hex → variables sin cambiar colores) y mínimo tipográfico 0.8rem.
- **K-D7/K-D8** skeleton en la ficha, **cancelar descarga** y verificación SHA-256 visible en el modal
  de actualización.
- La app del PC sigue en 1.2.22: el dueño la actualiza con el botón (lleva a la última).
