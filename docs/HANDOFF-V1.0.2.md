# KoRForge - Estado y Proceso de Publicación (v1.0.2)

**Versión oficial activa:** `v1.0.2`
**Repositorio:** `https://github.com/korzor/KoRForge`
**Licencia:** ISC

---

## 1. Resumen de novedades (v1.0.1 → v1.0.2)

### Interfaz y diseño
- **Esquinas 100% transparentes:** eliminados los bordes y esquinas grises exteriores de la ventana en Windows mediante `backgroundMaterial: 'none'` y `thickFrame: false` en `main.js`, y `background: transparent !important;` en `public/style.css`.
- **Iconos temáticos de Warcraft en la barra lateral:**
  - **Favoritos:** estrella Alianza/Horda (`public/icon-favorites.png`).
  - **Addons instalados:** cofre de botín con tick verde (`public/icon-installed.png`).
  - **Bóveda WTF:** relicario acorazado con engranajes dorados (`public/icon-wtf-vault.png`).
  - Calibrados a `26px`, sin artefactos de fondo y con sombra suave.
- **Botón de actualización en la barra lateral:** situado en `.sidebar-footer` encima de *Settings*, con el mismo formato que los `.nav-item`, color verde esmeralda, halo pulsante, texto adaptativo `"Actualizar a"` con badge de versión y i18n en los 5 idiomas.
- **Modal de actualización rediseñado:** 580px de ancho, caja de notas de 230px con scroll y conversión de markdown a listas HTML con viñetas (`✦`).

### Actualizador in-app
- **Descarga de assets por el canal API de GitHub** (URL `/releases/assets/<id>`), forzando siempre el nombre `KoRForge-Setup-<versión>.exe` y añadiendo la extensión si faltase tras verificar la cabecera PE (`MZ`).
- **Reinicio desacoplado:** script batch temporal (`korforge_apply_update.bat`), cierre de instancias bloqueadas con `taskkill`, ejecución silenciosa del instalador NSIS (`/S`) y relanzamiento de `KoRForge.exe`.
- **Canal único de actualización:** GitHub Releases. No hay mirror ni endpoint alternativo de versiones.

### Ciclo de vida
- **Purga al arrancar:** el proceso principal elimina instancias previas (`taskkill /F /FI "PID ne <pid>" /IM KoRForge.exe /T`) y limpia los ficheros de bloqueo (`SingletonLock`, `SingletonCookie`, `SingletonSocket`) en `%APPDATA%/KoRForge`.
- **Cierre real con `✕`:** `closeToTray` desactivado por defecto y `process.exit(0)` en `will-quit` tras destruir bandejas y ventanas.

---

## 2. Arquitectura

| Fichero | Función |
|---|---|
| `main.js` | Proceso principal de Electron: ventana frameless, IPC, ciclo de vida, locks, auto-purga. |
| `server.js` | Servidor local Express en `http://127.0.0.1:3847`: catálogo CurseForge, escáner, instalador, actualizador. |
| `preload.js` | Puente seguro entre la interfaz y el proceso principal. |
| `modules/updater.js` | Descarga in-app, validación del ejecutable y aplicación del reinicio. |
| `modules/scanner.js` | Detección del cliente e inventario de addons (`## Interface`, versiones, dependencias). |
| `modules/curseforge.js` | Cliente de la API pública de CurseForge y resolución de dependencias. |
| `modules/installer.js` | Instalación y desinstalación de addons en `Interface/AddOns`. |
| `modules/profiles.js` | Exportación e importación de perfiles de addons (`KORP-...`). |
| `modules/backup.js` | Copias de seguridad y restauración de la bóveda WTF. |
| `modules/installedRegistry.js` | Registro local de addons instalados y metadatos de versión. |
| `modules/translator.js` | Traducción de descripciones del catálogo. |
| `scripts/release-github.js` | Compilación y publicación del release en GitHub mediante `gh release`. |
| `scripts/generate-icons.js` | Generación de iconos de la aplicación. |

---

## 3. Procedimiento para lanzar una versión

1. **Subir versión en `package.json`** (por ejemplo `1.0.3`) y anotar los cambios en `notesContent` de `scripts/release-github.js`.
2. **Commit y push:**
   ```bash
   git add .
   git commit -m "chore(release): bump version to 1.0.3"
   git push origin main
   ```
3. **Compilar y publicar en GitHub Releases:**
   ```bash
   npm run release
   ```
   Genera `KoRForge-Setup-<versión>.exe` y el portable `.zip` y los adjunta al release.
4. **Comprobar el canal de actualización:** `https://api.github.com/repos/korzor/KoRForge/releases/latest` debe devolver la versión nueva; cualquier instalación anterior la detecta automáticamente.

---

## 4. Estado de verificación (v1.0.2)

- [x] Binarios compilados y probados en Windows 10/11.
- [x] Release `v1.0.2` publicado en GitHub con instalador y portable adjuntos.
- [x] Actualizador in-app consultando exclusivamente GitHub Releases.
- [x] Arranque limpio probado eliminando instancias zombi.
- [x] Repositorio sin rutas locales, IPs privadas ni credenciales.
