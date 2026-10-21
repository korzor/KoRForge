# Cambios de la última versión (los lee `scripts/publish-korforge-release.js`)
# Formato: una línea por cambio empezando por "- ". La primera se usa como descripción corta en la web.
# Las líneas que empiezan por "#" se ignoran, salvo "# Titulo: ...", que fija el título de la tarjeta.

# Titulo: Aviso cuando el cliente activo no tiene carpeta

- Si el cliente activo no tiene carpeta de juego, sale un aviso arriba en todas las pestañas con un botón para saltar al cliente que sí la tiene.
- La ruta que se enseña es siempre la del cliente en uso: ya no puede aparecer la de otro cliente distinto.
- Los Ajustes muestran «No configurado» cuando toca, sin heredar la ruta de otro cliente.
