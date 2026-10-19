# KoRForge - Documento de Traspaso y Estado (v1.0.2)

**Fecha:** 19 de Octubre de 2026  
**Versión oficial activa:** `v1.0.2`  
**Repositorio GitHub:** `https://github.com/korzor/KoRForge` (Privado)  
**Portal Web:** `https://updates.example.invalid/#korforge`  
**Servidor de producción (NAS):** ``  

---

## 1. Resumen de Novedades y Cambios (v1.0.1 ➔ v1.0.2)

### 🎨 Interfaz Visual y Diseño
- **Esquinas 100% Transparentes:** Eliminados los bordes y esquinas grises exteriores de la ventana en Windows mediante `backgroundMaterial: 'none'`, `thickFrame: false` en `main.js` y `background: transparent !important;` en `public/style.css`.
- **Iconos Temáticos de Warcraft en Sidebar:**
  - **Favoritos:** Estrella Alianza/Horda (`public/icon-favorites.png`).
  - **Addons Instalados:** Cofre de botín con tick verde (`public/icon-installed.png`).
  - **Bóveda WTF:** Relicario acorazado con engranajes dorados (`public/icon-wtf-vault.png`).
  - Calibrados a `26px`, sin artefactos de fondo y con sombra suave.
- **Botón de Actualización Integrado en el Menú Lateral:**
  - Situado en `.sidebar-footer` justo encima de *Settings*.
  - Mismo formato y estilo que los `.nav-item`.
  - Color verde esmeralda con halo pulsante animado.
  - Texto adaptativo `"Actualizar a"` con badge de versión, con crecimiento fluido en altura (`flex-wrap: wrap`) si no cabe en una línea.
  - Soporte i18n completo en los 5 idiomas.
- **Modal de Actualización Rediseñado:**
  - Ancho de 580px y caja de notas de 230px con scroll.
  - Conversión de markdown a listas HTML limpias con viñetas temáticas (`✦`).

### ⚙️ Auto-Actualizador In-App Robusto
- **Soporte para Assets de GitHub con ID Numérico:**
  - En repositorios privados, la API de GitHub devuelve URLs como `/releases/assets/656423017`.
  - Se corrigió `modules/updater.js` para forzar siempre el nombre `KoRForge-Setup-${version}.exe`, evitando el error `Formato no ejecutable directo: [ID]`.
  - Fallback automático que verifica cabeceras PE (`MZ`) y añade extensión `.exe` si faltase.
- **Reinicio Desacoplado y Automático:**
  - Generación de script batch temporal (`korforge_apply_update.bat`).
  - Cierre forzoso de instancias bloqueadas con `taskkill`.
  - Ejecución silenciosa del instalador NSIS (`/S`).
  - Relanzamiento automático de `KoRForge.exe` una vez completada la instalación.
- **Fallback Automático a `updates.example.invalid`:**
  - Si la API de GitHub falla, no está autenticada o da error de cuota, el endpoint `/api/app-updates/check` consulta automáticamente el repositorio web público de Updates (`https://updates.example.invalid/api/wow/korforge/releases`).

### 🛡️ Ciclo de Vida y Eliminación de Instancias Zombi
- **Auto-purga al Arrancar:**
  - Al iniciar `KoRForge.exe`, el proceso principal ejecuta automáticamente `taskkill /F /FI "PID ne [mi_PID]" /IM KoRForge.exe /T` para eliminar cualquier instancia previa o colgada que impida el arranque.
  - Limpieza automática de archivos residuales de bloqueo (`SingletonLock`, `SingletonCookie`, `SingletonSocket`) en `%APPDATA%\KoRForge`.
- **Cierre Real al Pulsar la `✕`:**
  - `closeToTray` desactivado por defecto (`false`), eliminando el comportamiento anterior donde la ventana se ocultaba dejando 4 procesos en segundo plano.
  - En `will-quit` se ejecuta `process.exit(0)` tras destruir bandejas y ventanas, garantizando que el proceso termina al 100% sin dejar rastro en el Administrador de tareas.

---

## 2. Arquitectura y Repositorios

### Repositorio Principal: `KoRForge`
- **Ruta local:** `c:\Users\usuario\Downloads\WoW4Ever`
- **Rama:** `main` (limpia y sincronizada con GitHub).
- **Archivos clave:**
  - `main.js`: Proceso principal de Electron (ventana frameless, IPC, ciclo de vida, locks).
  - `server.js`: Servidor local Express en `http://127.0.0.1:3847` (CurseForge API, scanner, instalador, actualizador).
  - `modules/updater.js`: Lógica de descarga in-app, validación de ejecutables y script de reinicio.
  - `modules/scanner.js`: Detección de cliente 1.60.1 / Interface 16001 y addons instalados.
  - `scripts/release-github.js`: Pipeline de compilación y subida a GitHub Releases mediante `gh release`.

### Repositorio Web: `Updates`
- **Ruta local:** `C:\Users\usuario\updates`
- **Rama:** `master`
- **Archivos de KoRForge en Updates:**
  - `data/korforge-releases.json`: Registro JSON de versiones activas y enlaces.
  - `public/wow/index.html`: Sección estática del repositorio de KoRForge y tarjetas desplegables.
  - `public/wow/releases/`: Binarios `.exe` y `.zip` descargables.
  - `scripts/deploy-to-nas.ps1`: Script de sincronización con el contenedor Docker en el NAS.

---

## 3. Procedimiento para Lanzar Nuevas Versiones

Cuando toque publicar una versión posterior (ej. `v1.0.3`):

1. **Bump de Versión en KoRForge:**
   - En `package.json`: cambiar `"version": "1.0.3"`.
   - En `scripts/release-github.js`: actualizar la lista de cambios concretos en `notesContent`.

2. **Compilar y Publicar en GitHub:**
   ```powershell
   cd c:\Users\usuario\Downloads\WoW4Ever
   git add .
   git commit -m "chore(release): bump version to 1.0.3"
   git push origin main
   npm run release
   ```

3. **Publicar en updates.example.invalid y Desplegar al NAS:**
   - Copiar los binarios generados en `release/` a `C:\Users\usuario\updates\public\wow\releases\`:
     - `KoRForge-Setup-1.0.3.exe`
     - `KoRForge-1.0.3-win.zip`
     - `KoRForge-v1.0.3-win-x64.zip` (copia del mismo zip).
   - Actualizar `C:\Users\usuario\updates\data\korforge-releases.json` añadiendo la entrada de la nueva versión con `esUltima: true` y marcando la anterior como `false`.
   - Actualizar `public/wow/index.html` en Updates.
   - Desplegar al NAS:
     ```powershell
     cd C:\Users\usuario\updates
     powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-to-nas.ps1 -SaltarTests
     ```

---

## 4. Estado de Verificación

- [x] Binarios compilados y probados en Windows 10/11.
- [x] GitHub Releases `v1.0.2` publicado y assets adjuntos.
- [x] Endpoint `https://updates.example.invalid/api/wow/korforge/releases` responde 200 OK con v1.0.2.
- [x] Descargas en vivo verificadas por HTTP (Instalador y Portable).
- [x] Proceso de arranque limpio probado eliminando instancias zombi.
- [x] Repositorios Git limpios y sincronizados.
