# Cambios de la ultima version (los lee scripts/publish-korforge-release.js)
# Formato: una linea por cambio empezando por '- '. La primera se usa como descripcion corta en la web.
# Las lineas que empiezan por '#' se ignoran, salvo '# Titulo: ...', que fija el titulo de la tarjeta.

# Titulo: KoRForge v1.4.5 - Los errores de la app quedan apuntados en el registro

- Si algo falla dentro de la ventana, ahora queda escrito en boot.log (con el fichero y la linea) en vez de quedarse sin rastro: así se puede arreglar de verdad.
- El arranque de la página ya no puede sacar errores sueltos por un descuido: se recogen todos.
