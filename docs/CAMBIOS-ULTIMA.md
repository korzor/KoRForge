# Cambios de la ultima version (los lee scripts/publish-korforge-release.js)
# Formato: una linea por cambio empezando por '- '. La primera se usa como descripcion corta en la web.
# Las lineas que empiezan por '#' se ignoran, salvo '# Titulo: ...', que fija el titulo de la tarjeta.

# Titulo: KoRForge v1.4.4 - Arreglado el arrastre (la ventana crecía) y el botón «Necesito café!»

- Al arrastrar la ventana desde la barra superior ya no se agranda: se mueve con el tamaño fijo. El fallo venía del redondeo de pantalla al 125 %, que se comía un píxel en cada movimiento.
- El botón de apoyo se llama ya «Necesito café!», más corto que «Invítame a un café».
