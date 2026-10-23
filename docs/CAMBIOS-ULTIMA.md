# Cambios de la ultima version (los lee scripts/publish-korforge-release.js)
# Formato: una linea por cambio empezando por '- '. La primera se usa como descripcion corta en la web.
# Las lineas que empiezan por '#' se ignoran, salvo '# Titulo: ...', que fija el titulo de la tarjeta.

# Titulo: KoRForge v1.3.10 - El instalador en una ventana (con el logo) y adios a los iconos fantasma

- El instalador ya enseña el arte de KoRForge en su ventana: antes quedaba el hueco vacio porque la imagen se soltaba con otro nombre.
- Toda la instalacion pasa en esa ventana, con la carpeta a elegir, la barra, y los botones para abrir KoRForge o cerrar.
- Se acabaron los iconos fantasma en la barra de Windows: KoRForge se cierra ordenadamente (avisa a la instancia que hay en marcha) en vez de matarla a la fuerza.
- La ventana de actualizar y el propio arranque usan el mismo cierre ordenado, y las tildes ya salen bien en todos los idiomas.
