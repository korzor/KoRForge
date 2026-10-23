# Cambios de la última versión (los lee `scripts/publish-korforge-release.js`)
# Formato: una línea por cambio empezando por "- ". La primera se usa como descripción corta en la web.
# Las líneas que empiezan por "#" se ignoran, salvo "# Titulo: ...", que fija el título de la tarjeta.

# Titulo: Actualizador con verificacion SHA-256 y ajustes en el menu

- El actualizador comprueba el SHA-256 del instalador contra el publicado en el release antes de aplicarlo.
- La actualizacion usa siempre el release oficial y rechaza versiones o URLs de descarga manipuladas.
- El boton de Ajustes queda por encima del boton de version en el menu lateral.
