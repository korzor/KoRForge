# Reglas de versiones de KoRForge

**Decisión del dueño, 20-10-2026.** Son dos normas fijas:

## 1. La web enseña SOLO la última versión

- `wow.centolos.org` (pestaña **KoRForge**) muestra **una sola tarjeta**: la última versión
  publicada. Nada de histórico.
- En `public/wow/releases/` (PC y NAS) solo están los binarios de esa última versión
  (`KoRForge-Setup-<versión>.exe` y `KoRForge-v<versión>-win-x64.zip`). Los de versiones
  anteriores se **borran** al publicar (el historial completo vive en GitHub Releases).
- El registro es `data/korforge-releases.json` con **una única entrada** (`esUltima: true`).
- **Ojo con el deploy:** `deploy-to-nas.ps1` excluye `data/`, así que ese JSON se copia **a mano**
  al NAS (`\\NAS\docker\centolos\data\korforge-releases.json`).
- `centolos/scripts/publish-korforge-release.js` aplica todo esto solo: copia los binarios, deja el
  JSON con la última versión y borra los binarios viejos de la web.

## 2. GitHub conserva las 5 últimas releases

- `korzor/KoRForge` (GitHub Releases) mantiene **las 5 releases más recientes**. El historial de
  versiones anterior se descarta.
- Al publicar una nueva (con `npm run release`), si ya hay 5, borrar la más antigua:

```bash
gh release delete v<version-vieja> --yes --cleanup-tag
```

- `--cleanup-tag` borra también el tag de git, para no dejar tags huérfanos.
- Es el canal del actualizador in-app: la app consulta `releases/latest` y descarga desde ahí.

## Por qué

El dueño no quiere que la web parezca un archivo de versiones (y así no se acumulan binarios de
más de 100 MB), mientras que en GitHub se conserva un histórico corto por si alguien necesita
volver atrás unos días.
