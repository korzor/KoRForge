# Cambios de la ultima version (los lee scripts/publish-korforge-release.js)
# Formato: una linea por cambio empezando por '- '. La primera se usa como descripcion corta en la web.
# Las lineas que empiezan por '#' se ignoran, salvo '# Titulo: ...', que fija el titulo de la tarjeta.

# Titulo: KoRForge v1.3.19 - Eliminar la asociación de un cliente y verlo en gris arriba

- Botón Eliminar asociación en cada cliente de Ajustes, debajo de Guardar y Abrir: KoRForge olvida la carpeta de ese cliente y deja de ofrecerlo.
- El cliente quitado sale en gris en la barra de arriba y ya no se puede elegir; en el disco no se borra nada.
- Si quitas el cliente que estabas usando y queda otro con carpeta, la app se pasa a ese sola y te lo dice.
- Para recuperarlo basta con guardar su ruta otra vez (o pasar la autodetección): vuelve a la barra como si nada.
- Pregunta antes de quitarlo, y la tarjeta se queda con el aviso «Sin asociación» para que se vea que fue a propósito.
