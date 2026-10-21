# Cambios de la última versión (los lee `scripts/publish-korforge-release.js`)
# Formato: una línea por cambio empezando por "- ". La primera se usa como descripción corta en la web.
# Las líneas que empiezan por "#" se ignoran, salvo "# Titulo: ...", que fija el título de la tarjeta.

# Titulo: RareScanner y los addons con varios .toc

- Al instalar se busca el último fichero compatible mirando hasta 250 del historial: RareScanner sí tenía versión de MoP, pero no estaba entre los 25 más nuevos.
- En los addons que traen un .toc por cliente (TipTac y compañía) se lee el de tu cliente, así dejan de salir como «Otra versión».
