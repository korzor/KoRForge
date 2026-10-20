# Reglas de idiomas de KoRForge

**Decisión del dueño, 20-10-2026.** La app está en **cinco idiomas** (inglés por defecto, español,
gallego, francés e italiano) y **todo** lo que ve el usuario cambia al cambiar de idioma.

## 1. Todo el texto vive en `public/i18n.js`

- **Nada de texto fijo** en `public/index.html` ni en `public/app.js`: ni botones, ni títulos, ni
  tooltips (`title`), ni placeholders, ni avisos (toasts), ni confirmaciones, ni textos de las
  tarjetas, ni notas de versión, ni mensajes de estado.
- En el HTML se marca con atributos; en el JS se pide con `T('clave', { variables })`.
- El escáner (`modules/scanner.js`) y el servidor (`server.js`) **no mandan frases**: mandan un
  **código** (`compat_forever_ok`, `err_no_compatible_wow_path`…) y el cliente lo traduce.

| Dónde | Cómo |
|---|---|
| Texto normal | `data-i18n="clave"` |
| Texto con `<code>` o etiquetas | `data-i18n-html="clave"` |
| Tooltip (`title`) | `data-i18n-title="clave"` |
| Placeholder | `data-i18n-placeholder="clave"` |
| `alt` de una imagen | `data-i18n-alt="clave"` |
| `<title>` de la ventana | `data-i18n-doctitle="clave"` |
| Texto que pinta `app.js` al arrancar | `data-i18n-skip` (lo rellena el JS con `T()`) |
| En `public/app.js` | `T('clave', { name: valor })` |

## 2. Al añadir una clave, se añade en LOS CINCO idiomas

No hay traducción perezosa ni caída al inglés a escondidas: si falta una clave, el verificador
falla y la release se cancela. Las variables `{nombre}` deben ser idénticas en los cinco idiomas.

## 3. Comprobarlo antes de publicar

```bash
npm run i18n:check           # o: node scripts/verificar-i18n.js
npm run i18n:check:verbose   # además enseña lo que está correcto
```

Comprueba que:

1. los cinco idiomas tienen exactamente las mismas claves;
2. toda clave usada en el HTML existe;
3. toda clave pedida en `app.js` con `T('…')` existe;
4. no queda texto visible fijo en el HTML (ni `title`, ni `placeholder`, ni `alt` sueltos);
5. no se cuela texto fijo en los puntos donde `app.js` pinta interfaz (`showToast`, `confirm`,
   `alert`, `textContent`, `title`, `placeholder`) ni letras acentuadas en literales;
6. no hay guiones largos (`—`) ni medios (`–`) en textos de interfaz (ver `REGLAS-TEXTOS.md`).

**Está enganchado al release:** `node scripts/release-github.js` ejecuta el verificador antes de
empaquetar y **aborta** si algo falla. No se puede publicar media traducción.

## 4. Cambiar de idioma repinta todo

`I18N.setLanguage()` traduce el HTML estático y lanza el evento `korforge:languageChanged`;
`app.js` escucha ese evento y vuelve a pintar todo lo dinámico (listas, tarjetas, ficha abierta,
modales, barra de dirección y botón de versión). Si añades una pantalla nueva, **añade su repintado
en `refrescarTextosDinamicos()`**.

## 5. Fechas y números también cambian

Nada de `toLocaleDateString('es-ES')` a mano: se usa `I18N.fmtDate`, `I18N.fmtDateTime`,
`I18N.fmtNumber` o `I18N.relativeDate` (`hace 3h`, `3h ago`, `il y a 3 h`…).

## 6. Interfaz nativa (fuera de `i18n.js`)

Dos sitios los pinta otro proceso y no pueden leer `public/i18n.js`, así que sus textos viven en
objetos del propio código, **en los cinco idiomas**:

| Qué | Dónde |
|---|---|
| Menú de la bandeja del sistema | `TRAY_TEXTS` en `main.js` |
| Tarjeta de carga del actualizador | `SPLASH_TEXTS` en `modules/updater.js` |

El verificador (`checkNativos`) comprueba que ninguno se queda sin idioma, sin clave o con guion
largo. Si añades un texto nativo nuevo, añádelo también ahí.

## 7. Lo que no se traduce (a propósito)

- **Nombres de idioma** del selector: se muestran en su propio idioma (`Español`, `Français`…).
- **Marcas y nombres propios**: KoRForge, WoW Forever, The War Within, nombres de addons.
- **Trazas de desarrollo** de `console.*`: no son interfaz.
