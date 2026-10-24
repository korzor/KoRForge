# Cambios de la ultima version (los lee scripts/publish-korforge-release.js)
# Formato: una linea por cambio empezando por '- '. La primera se usa como descripcion corta en la web.
# Las lineas que empiezan por '#' se ignoran, salvo '# Titulo: ...', que fija el titulo de la tarjeta.

# Titulo: KoRForge v1.3.20 - La ventana de actualización enseña siempre las novedades de la última versión

- Al abrir la ventana de actualización se pregunta a GitHub otra vez: ves los cambios de la última versión publicada, no los que había cuando arrancaste la app.
- Si en ese momento no hay conexión, la ventana mantiene las novedades que ya conocía en vez de quedarse en blanco.
- La página de la release en GitHub lleva ahora los cambios y la lista de archivos en el cuerpo; antes iba vacía y GitHub enseñaba el README del repositorio en su lugar.
- Todo sale de la misma nota de versión que anuncia la web de KoRForge, así que las dos cuentan siempre lo mismo.
