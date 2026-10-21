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
- **Hashes (21-10-2026):** cada release publica `SHA256SUMS.txt` junto a los binarios y cada
  descarga del registro lleva su campo `sha256`. En GitHub, el mismo hash va en el cuerpo de la
  release y como asset. Es integridad y prueba de autoría (`docs/PROTECCION-DERECHOS.md`).
- Los cambios del registro se escriben en `docs/CAMBIOS-ULTIMA.md`: una línea por cambio empezando
  por `- ` (la primera es la descripción corta) y, si se quiere título propio, una línea
  `# Titulo: ...`. Las demás líneas que empiezan por `#` se ignoran (corregido el 20-10-2026: antes
  las cabeceras se colaban como si fueran cambios).
- **Las notas de GitHub salen del mismo fichero** (`scripts/notas-release.js`). Hasta el 21-10-2026
  estaban escritas a mano en `release-github.js` y se quedaron congeladas: la 1.1.6 y la 1.1.7 se
  publicaron en GitHub con el texto de la 1.1.5. No volver a escribirlas a mano.
- **La tarjeta estática no la toca el script:** hay que actualizar a mano
  `centolos/public/wow/index.html` (versión, fecha, descripción, lista y enlaces) porque es lo que
  se ve antes de que el JS cargue el registro.

## 2. GitHub conserva las 5 últimas releases

- `korzor/KoRForge` (GitHub Releases) mantiene **las 5 releases más recientes**. El historial de
  versiones anterior se descarta.
- Al publicar una nueva (con `npm run release`), si ya hay 5, borrar la más antigua:

```bash
gh release delete v<version-vieja> --yes --cleanup-tag
```

- `--cleanup-tag` borra también el tag de git, para no dejar tags huérfanos.
- Es el canal del actualizador in-app: la app consulta `releases/latest` y descarga desde ahí.

## 3. «Subir a GitHub» significa TODO: release Y web

**Decisión del dueño, 20-10-2026.** Cuando el dueño dice *«sube esta versión a GitHub»*, no quiere
solo la release de GitHub: quiere **las dos cosas publicadas a la vez**:

1. La release en `korzor/KoRForge` (instalador + ZIP, notas, etiqueta `v<versión>`).
2. La versión nueva en `wow.centolos.org`: binarios en `public/wow/releases/`, el registro
   `data/korforge-releases.json` con **una sola entrada** y la tarjeta estática de
   `public/wow/index.html` actualizada.

**No hay que preguntarlo cada vez.** Si falta la parte de la web, la publicación está a medias:
la página seguiría anunciando la versión anterior aunque GitHub ya tenga la nueva.

Orden correcto (comprobado el 20-10-2026):

```bash
# 1. Bump de versión y notas (en este repo)
npm version <x.y.z> --no-git-tag-version
#    ...y actualizar el bloque de notas de scripts/release-github.js
# 2. Build + release en GitHub
node scripts/release-github.js
# 3. Commit del bump y mover la etiqueta al commit correcto
git commit -am "chore(release): <x.y.z> ..." && git push
git tag -f v<x.y.z> && git push --force origin v<x.y.z>
# 4. Web (binarios + registro + tarjeta estática) y deploy
node scripts/publish-korforge-release.js   # o a mano, ver más abajo
```

**Cuidado:** `publish-korforge-release.js` estaba pensado para correr **dentro de este repo**
(`projectDir = ..` respecto a `scripts/`). La copia que vive en `centolos/scripts/` NO vale tal cual:
allí `projectDir` sería `centolos` y construiría el proyecto equivocado. Además elegía el ZIP con
`allZips[0]`, que puede ser el de una versión vieja; ya está corregido en este repo.

## Por qué

El dueño no quiere que la web parezca un archivo de versiones (y así no se acumulan binarios de
más de 100 MB), mientras que en GitHub se conserva un histórico corto por si alguien necesita
volver atrás unos días.
