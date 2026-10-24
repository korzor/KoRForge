# Cambios de la ultima version (los lee scripts/publish-korforge-release.js)
# Formato: una linea por cambio empezando por '- '. La primera se usa como descripcion corta en la web.
# Las lineas que empiezan por '#' se ignoran, salvo '# Titulo: ...', que fija el titulo de la tarjeta.

# Titulo: KoRForge v1.3.18 - Botón de compartir: el repositorio del autor, no la página de CurseForge

- Botón de compartir en cada addon: copia el nombre y el enlace del repositorio del autor (GitHub, GitLab...), nunca la página de CurseForge.
- Está en los tres sitios donde se ve un addon: la tarjeta del catálogo, la ficha y Mis addons, con el mismo tamaño que la estrella de favoritos.
- Menú de tres acciones: copiar nombre y enlace, copiar solo el enlace del repositorio y abrirlo en el navegador de la app.
- Si el addon no declara repositorio (7 de los 50 más populares) no se inventa ninguna URL: ofrece Buscar en GitHub y copiar nombre y versión.
- El enlace se toma del campo que rellena el autor en CurseForge; si falta, de su enlace de incidencias o de la wiki cuando apuntan a GitHub o GitLab.
- Aviso «Copiado al portapapeles» al copiar, y el menú sigue pegado a su botón si la lista se mueve (no se cierra solo).
