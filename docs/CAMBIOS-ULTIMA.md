# Cambios de la última versión (los lee `scripts/publish-korforge-release.js`)
# Formato: una línea por cambio empezando por "- ". La primera se usa como descripción corta en la web.
# Las líneas que empiezan por "#" se ignoran, salvo "# Titulo: ...", que fija el título de la tarjeta.

# Titulo: El logo del actualizador se quita antes de que la app arranque

- El logo de la actualización desaparece medio segundo antes de que la app termine de iniciar: en cuanto KoRForge pinta su primera ventana.
- Ya no se queda tapando la app nueva medio segundo de más: el relevo lo coge el splash de la propia app.
- Se mantiene lo de la 1.1.10: la tarjeta va centrada en el medio de la pantalla y se adapta a cualquier tamaño y escalado.
- Si la app arranca minimizada en la bandeja, la tarjeta se quita igual y no se queda colgada.

