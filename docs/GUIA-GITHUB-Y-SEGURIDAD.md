# Guía de Seguridad y Publicación en GitHub - KoRForge

Esta guía garantiza que puedas subir **KoRForge** a GitHub con **total tranquilidad y sin ningún riesgo de filtrar datos privados, contraseñas, rutas locales o carpetas personales**.

---

## 1. Auditoría de Seguridad Realizada

Hemos auditado todo el proyecto archivo por archivo antes de cualquier publicación:

| Elemento | Estado de Seguridad | Protección Aplicada |
|---|---|---|
| **Contraseñas / Secretos** | **0 contraseñas en el código** | Ningún archivo contiene contraseñas de WoW, del NAS ni de cuentas personales. |
| **Bóveda WTF (`backups/`)** | **100% Protegido** | Puede contener SavedVariables de addons con nombres de cuentas o macros. **Está en `.gitignore` y jamás se subirá.** |
| **Rutas locales (`config.json`)** | **100% Protegido** | Contiene las rutas de tus carpetas locales. Está en `.gitignore`. Se ha creado **`config.example.json`** neutral para los usuarios que clonen el repo. |
| **Binarios pesados (`release/`)** | **100% Protegido** | Los ejecutables (`.exe`, `.zip`) pesan >100 MB (GitHub los rechaza por límite de tamaño). Están en `.gitignore`. |
| **API Key de CurseForge** | **Neutralizada** | Se usa la clave pública de cliente para proyectos comunitarios de WoW y ahora además lee `process.env.CF_API_KEY` opcionalmente. |
| **Archivos temporales y logs** | **100% Protegido** | `cache/`, `*.log` y `node_modules/` están excluidos. |

---

## 2. ⚠️ La Trampa Local a Evitar (El `.git` de tu usuario)

En tu equipo, en la carpeta raíz de usuario, vigila que no exista un `.git` viejo que rastree todo tu disco:
- **NUNCA ejecutes comandos de git desde la raíz de usuario**.
- El repositorio de KoRForge se inicializa **exclusivamente dentro de la carpeta del proyecto** (`WoW4Ever` o `KoRForge`).
- De este modo, git solo "ve" la carpeta de KoRForge y nada de tu Escritorio, Documentos o sistema.

---

## 3. Pasos para Subir KoRForge a GitHub de Forma Segura

Cuando decidas subirlo, estos son los pasos exactos:

### Paso 1: Crear el repositorio en GitHub
1. Entra a [github.com](https://github.com) y pulsa en **New repository**.
2. Nombre: `KoRForge` (o el que prefieras).
3. Visibilidad: Puedes elegir **Private** (solo tú y quien invites) o **Public** (código abierto).
4. **IMPORTANTE:** Déjalo completamente vacío: **NO** marques "Add a README file", **NO** marques `.gitignore` ni licencia (ya los tenemos creados y perfectos aquí).
5. Pulsa **Create repository**.

### Paso 2: Inicializar y verificar en tu PC
Abre PowerShell y ejecuta:

```powershell
cd /ruta/hacia/KoRForge
git init -b main
git status
```

**Verificación visual:**
Comprueba que en la lista de archivos en verde/rojo:
- ✅ Solo aparecen archivos de código (`server.js`, `main.js`, `modules/`, `public/`, etc.).
- ❌ **NO** aparece `release/`, **NO** aparece `backups/`, **NO** aparece `node_modules/`, **NO** aparece `config.json`.

### Paso 3: Subir a GitHub
Una vez verificado:

```powershell
git add .
git commit -m "KoRForge v1.1.0 - Standalone WoW Addon Manager"
git remote add origin https://github.com/TU_USUARIO/KoRForge.git
git push -u origin main
```

*(Sustituyendo `TU_USUARIO` por tu nombre de usuario de GitHub)*.

---

## 4. Ubicación del proyecto
Los scripts son 100% dinámicos y no dependen de rutas fijas; puedes mover la carpeta del proyecto a cualquier ubicación sin que nada se rompa.
