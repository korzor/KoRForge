# ⚔️ KoRForge - World of Warcraft Addon Manager

<div align="center">
  <img src="korforge-banner.png" alt="KoRForge Logo" width="320" />
  <p><strong>Gestor de Addons para World of Warcraft rápido, ultraligero y libre de publicidad.</strong></p>
  <p>
    <a href="https://github.com/korzor/KoRForge/releases/latest"><img src="https://img.shields.io/github/v/release/korzor/KoRForge?color=f59e0b&label=Versi%C3%B3n" alt="Versión"></a>
    <img src="https://img.shields.io/badge/Plataforma-Windows%20x64-blue.svg" alt="Plataforma">
    <img src="https://img.shields.io/badge/Electron-Desktop-green.svg" alt="Electron">
    <img src="https://img.shields.io/badge/Sin%20Publicidad-100%25%20Limpio-success.svg" alt="Limpio">
    <img src="https://img.shields.io/badge/Licencia-ISC-lightgrey.svg" alt="Licencia">
  </p>
</div>

---

## 📖 ¿Qué es KoRForge?

**KoRForge** es un gestor de addons standalone para **World of Warcraft**, diseñado como una alternativa moderna, elegante y extremadamente rápida frente a aplicaciones pesadas y comerciales como CurseForge/Overwolf.

KoRForge se conecta directamente con el catálogo público de CurseForge sin necesidad de software intermediario, sin banners de publicidad invasiva, sin rastreadores y sin procesos en segundo plano que consuman la memoria RAM de tu equipo mientras juegas.

---

## ✨ Características Principales

### 🛡️ 1. Cero Bloatware y Privacidad Total
- **Sin publicidad ni banners de vídeo.**
- **Sin telemetría ni recopilación de datos personales.**
- Huella de memoria mínima y arranque casi instantáneo.

### 🎮 2. Soporte Multicliente Nativo
Cambia entre tus diferentes versiones de WoW en tiempo real con un solo clic en la barra superior:
- **WoW Forever:** Cliente 1.60.1 / Núcleo Vanilla.
- **WoW Retail:** The War Within (11.x).
- **WoW Classic Era:** Vanilla (1.15.x).
- **WoW Classic Progression:** Cataclysm / Mists of Pandaria / Titan.

Cada cliente mantiene su propio catálogo de addons instalados, rutas y copias de seguridad de forma totalmente aislada.

### 🔍 3. Catálogo CurseForge Integrado
- Búsqueda en tiempo real de decenas de miles de addons.
- Filtros avanzados por categorías, ordenación por popularidad, fecha de actualización o descargas.
- Ficha detallada con capturas de pantalla, descripción completa y selector de versiones de archivo.
- **Traductor integrado:** Lee las descripciones en tu idioma nativo con un clic.

### ⚡ 4. Actualización Masiva en 1 Clic ("Bulk Update")
- Registro local inteligente que detecta qué addons tienen una versión más reciente disponible en CurseForge.
- Botón destacado para actualizar todos tus addons de golpe sin tener que ir uno a uno.

### 🧩 5. Gestor Inteligente de Dependencias
- Detecta automáticamente si un addon requiere librerías externas (como *Ace3* o *LibSharedMedia*).
- Distingue entre librerías ya embebidas en el paquete y dependencias necesarias, instalándolas automáticamente para evitar errores Lua en el juego.

### 🛡️ 6. Auditor de Compatibilidad de Interfaz
- Analiza la cabecera `## Interface` de los archivos `.toc` de tus addons locales.
- Alerta visualmente con insignias de estado:
  - `✓ Compatible`: Diseñado exactamente para la versión de tu cliente.
  - `⚠️ Versión obsoleta`: Funcional pero con versión de interfaz antigua.
  - `❌ Incompatible`: Diseñado para otra expansión diferente.

### 📦 7. Perfiles de Addons (Compartir con la Guild)
- **Exportar Pack:** Genera un código compacto (`KORP-...`) con todos tus addons instalados para compartir con tus compañeros de hermandad por Discord o WhatsApp.
- **Importador asistido:** Pega cualquier código para comparar contra tus addons actuales y descargar en bloque los que te falten.

### 💾 8. Bóveda WTF (Copias de Seguridad)
- Realiza copias de seguridad completas de tus carpetas `WTF/SavedVariables` y macros.
- Restaura cualquier punto anterior con 1 clic ante corrupciones de datos o fallos de addons.

### 🚀 9. Auto-Actualizador In-App Silencioso
- Notificaciones automáticas de nuevas versiones oficiales desde **GitHub Releases**.
- Descarga en segundo plano con barra de progreso y reinicio transparente de la aplicación.

### 🌐 10. Internacionalización (i18n)
- Interfaz disponible en **Español**, **English**, **Galego**, **Français** e **Italiano**.
- Cambio dinámico de idioma sin reiniciar la app.

---

## 📥 Descarga e Instalación

Puedes descargar la última versión oficial desde la sección de [Releases en GitHub](https://github.com/korzor/KoRForge/releases/latest):

1. **Instalador Oficial (`KoRForge-Setup-x.x.x.exe`) [Recomendado]:**
   - Instalación asistida para Windows (64 bits).
   - Crea accesos directos en el Escritorio y Menú Inicio.
   - Desinstalador automático desde Configuración de Windows.

2. **Versión Portable (`KoRForge-vx.x.x-win-x64.zip`):**
   - Descomprime el archivo `.zip` en la carpeta que prefieras.
   - Ejecuta `KoRForge.exe` directamente sin necesidad de instalar.

---

## 🛠️ Desarrollo y Compilación Local

Si deseas contribuir o compilar KoRForge por tu cuenta:

### Requisitos Previos
- [Node.js](https://nodejs.org/) v18.0.0 o superior.
- Git.
- Windows 10 u 11 (64 bits).

### Instalación de Dependencias
```bash
# Clonar el repositorio
git clone https://github.com/korzor/KoRForge.git
cd KoRForge

# Instalar módulos de Node
npm install
```

### Ejecutar en Desarrollo
```bash
# Iniciar la aplicación de escritorio (Electron + Servidor local)
npm start

# O iniciar únicamente el backend Express para depuración web (localhost:3847)
npm run server
```

### Compilar Ejecutables de Producción
```bash
# Compilar ejecutable descomprimido (release/win-unpacked/KoRForge.exe)
npm run compile

# Generar instalador oficial NSIS (.exe)
npm run package:installer

# Generar archivo comprimido portable (.zip)
npm run package:zip

# Generar ambos paquetes de lanzamiento
npm run package:release
```

---

## 🔒 Privacidad y Seguridad

KoRForge está construido con una arquitectura transparente y de código abierto:
- **Sin rastreo:** No almacena cuentas, contraseñas ni perfiles personales en servidores externos.
- **Configuración local:** Todas las rutas locales y configuraciones se guardan exclusivamente en tu propio equipo (`%APPDATA%/KoRForge/config.json`).
- **Llamadas seguras:** Las comunicaciones se realizan exclusivamente contra la API oficial de CurseForge y la API de GitHub Releases vía HTTPS.

---

## 📄 Licencia

Este proyecto está distribuido bajo la licencia [ISC](LICENSE).
World of Warcraft y Blizzard Entertainment son marcas comerciales o marcas registradas de Blizzard Entertainment, Inc. KoRForge no está afiliado ni respaldado por Blizzard Entertainment ni CurseForge.
