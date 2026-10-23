# 2026-10-23 — KoRForge 1.2.28: ventana adaptable, esqueleto de carga y cancelar descarga (K-D1, K-D7, K-D8, K-D9)

Ficha de continuidad. Segunda tanda de la deuda de UI. Cierra la auditoría del 22-10-2026 salvo la
deuda menor restante. Incluye un pedido del dueño: los estados vacíos de Favoritos, Instalados y
Bóveda usan el icono de su pestaña en vez de emoji.

## Qué se cambió

- **K-D1 · responsive**: `@media` a 1366/1200/1024 px (barra superior más compacta, grid del catálogo
  con mínimos de 330/300/280 px, padding del contenido) y la ventana baja de `minWidth 1120` a
  **980** (`minHeight 640`). Medido por CDP a **1024, 1120, 1280 y 1440**: sin desborde horizontal
  (`app-shell.scrollWidth <= innerWidth`, topbar sin scroll).
- **K-D9 · tokens y tipografía**: los 9 grupos de hex que ya tenían variable pasan a `var(--…)`; los
  hex repetidos restantes (`#fff`, `#fbbf24`, `#000`, `#e2e8f0`, `#cbd5e1`, `#34d399`) se convierten
  en variables `--c-…` dentro de `:root`; y las **44** apariciones de `font-size: 0.7x rem` suben a
  `0.8rem` (mínimo legible).
- **K-D7 · estados de carga**: la ficha del addon enseña un **esqueleto** (`.skeleton-sheet` con
  shimmer) mientras llega la descripción; si el catálogo falla aparece un botón **Reintentar**
  (`data-retry-catalog` + delegación, sin `onclick` inline) que repite la búsqueda sin recargar.
- **K-D8 · actualizador**: la descarga se puede **cancelar** (AbortController en `updater.js`,
  `POST /api/app-updates/cancel`, botón `btnCancelUpdateDownload` que aparece solo mientras descarga)
  y al completarse el modal enseña **«SHA-256 verificado: …»** antes de ofrecer el reinicio.
- **Iconos de los estados vacíos** (pedido del dueño): Favoritos → `icon-favorites.png`, Instalados →
  `icon-installed.png`, Bóveda → `icon-wtf-vault.png` (sin el emoji ⭐/🛡️/💾), vía
  `.empty-state .empty-icon-img`.
- Claves i18n nuevas ×5: `upd_btn_cancel_download`, `upd_cancelled`, `upd_complete_sha`,
  `catalog_retry`. **505** claves por idioma.

## Verificación

- CDP sobre la app real: **13/13** (sin desborde a cuatro anchuras; CSS del skeleton; la ficha enseña
  el skeleton y después la descripción; `/api/app-updates/cancel` responde; botón cancelar oculto al
  abrir; `upd_complete_sha` interpola).
- Iconos de estados vacíos: comprobado por pestaña (favoritos/instalados/bóveda) que el vacío usa su
  PNG y no emoji.
- `i18n:check`: 5 idiomas, 505 claves. Sin guiones largos.

## Publicación

Release **v1.2.28** en GitHub (instalador 112,2 MB `cf6e1747…`, ZIP 152,2 MB), web con solo la
1.2.28 en el NAS, registro a mano y tarjeta v1.2.28. Build web `20261023-135333`. Commits:
`99921d7` (K-D), `2118dd1` (release), `c1ee848` (nota de iconos) y el de los iconos.

## Pendiente

- Deuda menor de la auditoría (K-C1 de textos/idiomas ya cubierto por `i18n:check`) y la app del PC
  sigue en 1.2.22: se actualiza con el botón (lleva a la última, 1.2.28).
