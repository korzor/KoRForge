# Cambios de la última versión (los lee `scripts/publish-korforge-release.js`)
# Formato: una línea por cambio empezando por "- ". La primera se usa como descripción corta en la web.
# Las líneas que empiezan por "#" se ignoran, salvo "# Titulo: ...", que fija el título de la tarjeta.

# Titulo: El aviso de «ruta del juego» dice qué juego falta

- Si un cliente no tiene ruta configurada, el aviso dice cuál es y cuáles sí tienen ruta, en vez de un mensaje genérico.
- Si el cliente está dentro de la carpeta raíz configurada, se usa su carpeta sin tener que rellenar la ruta del juego a mano.
- Los Ajustes enseñan la ruta que se está usando de verdad, también cuando sale de la carpeta raíz.
