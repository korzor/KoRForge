# 2026-10-28 · KoRForge 1.4.13: Recuperación de entorno, UTF-8 BOM y Release Maestro

## Qué se hizo en esta sesión

1. **Recuperación íntegra tras reinstalación de Windows**:
   - Reinstalación de Git 2.47 y Node.js 22 LTS en el sistema.
   - Rescate del código fuente desde `korzor/KoRForge-src` (GitHub privado) con sus 222 commits y tags intactos.
   - Fusión limpia y definitiva en **`P:\KoRForge`** (eliminando cualquier resto temporal en `C:\dev`).
   - Clave CurseForge rescatada y guardada en `P:\KoRForge\cf-key.local.txt`.

2. **Resolución de problemas detectados (Puntos 2 y 3)**:
   - **Pipeline Maestro (`scripts/release-maestro.js`)**: automatización de los 10 pasos de release con comprobación de i18n, minificación con `proteger-build`, inyección/limpieza de clave CF, compilación, SHA-256, publicación en GitHub y sincronización web/NAS.
   - **Checklist pre-lanzamiento (`docs/CHECKLIST-SMOKE.md`)**: protocolo de verificación visual y funcional para prevenir regresiones.

3. **Corrección de acentos en el instalador (1.4.13)**:
   - `build/instalando.ps1` se guardó explícitamente en **UTF-8 con BOM** (`EF BB BF`).
   - PowerShell 5.1 ya no lee el script en ANSI: tildes («Se instalará en:», «está instalado.»), puntos suspensivos («Cambiar…») y caracteres especiales de todos los idiomas salen limpios.

4. **Publicación v1.4.13**:
   - Compilado instalador protegido: `release/KoRForge-1.4.13-Windows.exe` (114.2 MB).
   - Release en GitHub `korzor/KoRForge` creada con hash verificado.
   - Historial de releases en GitHub en el límite exacto de la regla: 5 releases activas (`1.4.13`, `1.4.12`, `1.4.11`, `1.4.10`, `1.4.8`).
   - Despliegue en la web de Centolos y en el NAS (`korforge-releases.json` e instalador sincronizados).

## Estado actual
- Rama: `main` en `src` limpia y al día.
- Directorio de trabajo: `P:\KoRForge`.
