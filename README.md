# <img src="korforge-k.png" alt="⚔️" width="30" height="30" /> KoRForge - World of Warcraft Addon Manager

**Idioma / Language:** [English](#english) · [Español](#espanol)

<div align="center">
  <img src="korforge-banner.png" alt="KoRForge Logo" width="320" />
  <p><strong>Fast, tiny, ad-free addon manager for World of Warcraft.<br>Gestor de addons para World of Warcraft rápido, ultraligero y sin publicidad.</strong></p>
  <p>
    <a href="https://github.com/korzor/KoRForge/releases/latest"><img src="https://img.shields.io/github/v/release/korzor/KoRForge?color=f59e0b&label=version" alt="Version"></a>
    <img src="https://img.shields.io/badge/Platform-Windows%20x64-blue.svg" alt="Platform">
    <img src="https://img.shields.io/badge/Electron-Desktop-green.svg" alt="Electron">
    <img src="https://img.shields.io/badge/No%20Ads-100%25%20Clean-success.svg" alt="No ads">
    <img src="https://img.shields.io/badge/License-Proprietary-lightgrey.svg" alt="License">
  </p>
</div>

---

<a id="english"></a>

## English

### What is KoRForge?
KoRForge is a **standalone** addon manager for World of Warcraft: a modern, fast alternative to heavy commercial clients. It talks straight to the public CurseForge catalog, with **no ads, no telemetry, no overlay and no background bloat** eating your RAM while you play. Available for Windows x64.

### Features
- **Zero bloatware:** no banners, no trackers, no data collection. Tiny memory footprint and near-instant startup.
- **Multi-client support:** switch between your WoW versions in one click, each with its own addon list, paths and backups:
  - **WoW Forever** (1.60.1 / Vanilla core)
  - **WoW Retail** (The War Within, 11.x)
  - **WoW Classic Era** (1.15.x)
  - **WoW Classic Progression** (Cataclysm / Mists of Pandaria / Titan)
- **CurseForge catalog built in:** real-time search, category and sorting filters, full addon page with screenshots and version picker, plus a one-click description translator.
- **One-click bulk update:** local registry spots every addon with a newer version available and updates them all at once.
- **Smart dependencies:** detects external libraries (Ace3, LibSharedMedia and friends) and installs the ones that are really needed, avoiding Lua errors.
- **Interface auditor:** reads each local `.toc` header and flags addons as compatible, outdated or incompatible at a glance.
- **Addon profiles:** export your setup as a compact `KORP-...` code to share with your guild; import any code to compare and batch-download what you are missing.
- **WTF vault:** full backups of `WTF/SavedVariables` and macros, restored in one click.
- **Silent in-app updater:** notified from GitHub Releases, downloads in the background and restarts itself showing the KoRForge logo while it installs.
- **Five languages:** English, Español, Galego, Français, Italiano. Everything switches instantly, including tooltips, filters and the tray menu.
- **Recognizes what you already have:** it reads your `Interface\AddOns` folder, so addons installed by hand or by another tool show up as installed.

### Download & Install
Latest official build: [GitHub Releases](https://github.com/korzor/KoRForge/releases/latest) · [web mirror](https://centolos.org/wow/)

1. **Official installer** (`KoRForge-Setup-x.x.x.exe`), recommended: assisted install on Windows 64-bit, desktop and Start Menu shortcuts, clean uninstall from Windows Settings.
2. **Portable** (`KoRForge-vx.x.x-win-x64.zip`): unzip anywhere and run `KoRForge.exe`. No installation needed.

**Requirements:** Windows 10 or 11 (64-bit) and World of Warcraft installed locally.

### Privacy
- No accounts, no passwords and no personal profiles are sent anywhere.
- All paths and settings stay on your PC (`%APPDATA%\KoRForge\config.json`).
- Network traffic only goes to the official CurseForge API and the GitHub Releases API, over HTTPS.

### Build from source (personal use)
Node.js 18+ and Git:

```bash
git clone https://github.com/korzor/KoRForge.git
cd KoRForge
npm install
npm start                 # app (Electron + local server)
npm run package:release   # NSIS installer + portable zip in release/
npm run i18n:check        # language guard used before every release
```

Compiling or running the code for yourself is allowed. Modifying it, distributing modified copies or publishing your own build is **not**: see the license below.

### License and Terms of Use

This software is the exclusive property of **KoRZoR**.

Free download and use as an end-user application is granted. Selling, redistributing unofficial copies, modifying the code or creating derivative forks is strictly forbidden. See the [LICENSE](LICENSE) file for details.

World of Warcraft and Blizzard Entertainment are trademarks or registered trademarks of Blizzard Entertainment, Inc. KoRForge is not affiliated with, endorsed by or sponsored by Blizzard Entertainment or CurseForge.

---

<a id="espanol"></a>

## Español

### ¿Qué es KoRForge?
KoRForge es un gestor de addons **standalone** para World of Warcraft: una alternativa moderna y muy rápida a los clientes comerciales pesados. Se conecta directamente al catálogo público de CurseForge, **sin publicidad, sin telemetría, sin overlays y sin procesos en segundo plano** comiéndose tu RAM mientras juegas. Para Windows x64.

### Características
- **Cero bloatware:** sin banners, sin rastreadores, sin recogida de datos. Huella de memoria mínima y arranque casi instantáneo.
- **Soporte multicliente:** cambia entre tus versiones de WoW con un clic, cada una con sus addons, rutas y copias aisladas:
  - **WoW Forever** (1.60.1 / núcleo Vanilla)
  - **WoW Retail** (The War Within, 11.x)
  - **WoW Classic Era** (1.15.x)
  - **WoW Classic Progression** (Cataclysm / Mists of Pandaria / Titan)
- **Catálogo CurseForge integrado:** búsqueda en tiempo real, filtros por categoría y orden, ficha completa con capturas y selector de versión, y traductor de descripciones con un clic.
- **Actualización masiva en 1 clic:** detecta qué addons tienen versión nueva y los actualiza todos de golpe.
- **Dependencias inteligentes:** detecta librerías externas (Ace3, LibSharedMedia y compañía) e instala solo las que hacen falta, evitando errores Lua.
- **Auditor de interfaz:** lee la cabecera `.toc` de cada addon local y marca si es compatible, está obsoleto o es incompatible.
- **Perfiles de addons:** exporta tu setup como un código compacto `KORP-...` para compartirlo con la hermandad e importa cualquier código para comparar y bajar lo que te falta.
- **Bóveda WTF:** copias completas de `WTF/SavedVariables` y macros, restaurables en 1 clic.
- **Auto-actualizador silencioso:** avisa desde GitHub Releases, descarga en segundo plano y se reinicia mostrando el logo de KoRForge mientras instala.
- **Cinco idiomas:** Español, English, Galego, Français, Italiano. Todo cambia al instante, incluidos tooltips, filtros y el menú de la bandeja.
- **Reconoce lo que ya tienes:** lee tu carpeta `Interface\AddOns`, así que los addons instalados a mano o con otra herramienta aparecen como instalados.

### Descarga e instalación
Última versión oficial: [Releases de GitHub](https://github.com/korzor/KoRForge/releases/latest) · [espejo web](https://centolos.org/wow/)

1. **Instalador oficial** (`KoRForge-Setup-x.x.x.exe`), recomendado: instalación asistida en Windows 64 bits, accesos en Escritorio y Menú Inicio, desinstalación limpia desde Configuración de Windows.
2. **Portable** (`KoRForge-vx.x.x-win-x64.zip`): descomprime donde quieras y ejecuta `KoRForge.exe`. Sin instalar nada.

**Requisitos:** Windows 10 u 11 (64 bits) y World of Warcraft instalado en el equipo.

### Privacidad
- No se envían cuentas, contraseñas ni perfiles personales a ningún sitio.
- Todas las rutas y la configuración se quedan en tu equipo (`%APPDATA%\KoRForge\config.json`).
- El tráfico de red va solo a la API oficial de CurseForge y a la API de GitHub Releases, por HTTPS.

### Compilar desde el código (uso personal)
Node.js 18+ y Git:

```bash
git clone https://github.com/korzor/KoRForge.git
cd KoRForge
npm install
npm start                 # app (Electron + servidor local)
npm run package:release   # instalador NSIS + zip portable en release/
npm run i18n:check        # verificador de idiomas que corre en cada release
```

Compilar o ejecutar el código para ti está permitido. Modificarlo, distribuir copias modificadas o publicar tu propia compilación **no**: mira la licencia de abajo.

## Licencia y Términos de Uso

Este software es propiedad exclusiva de **KoRZoR**. 

Se autoriza su descarga y uso gratuito como aplicación final. Queda estrictamente prohibida la venta, redistribución de copias no oficiales, modificación del código o creación de forks derivados. Consulta el archivo [LICENSE](LICENSE) para más detalles.

