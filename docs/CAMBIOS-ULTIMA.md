# Cambios de la última versión (los lee `scripts/publish-korforge-release.js`)
# Formato: una línea por cambio empezando por "- ". La primera se usa como descripción corta en la web.
# Las líneas que empiezan por "#" se ignoran, salvo "# Titulo: ...", que fija el título de la tarjeta.

# Titulo: Ventana adaptable, esqueleto de carga y cancelar descarga

- La ventana se adapta desde 1024 px de ancho (antes 1120) y la barra se compacta en pantallas pequeñas.
- Tipografía mínima de 0,8rem y colores unificados en variables.
- La ficha del addon enseña un esqueleto mientras carga.
- Si el catalogo falla se puede reintentar sin recargar la app.
- La descarga de la actualizacion se puede cancelar y enseña el SHA-256 verificado antes de reiniciar.
- Los estados vacios de Favoritos, Instalados y Boveda usan el icono de su pestana (sin emoji).
