# Cambios de la última versión (los lee `scripts/publish-korforge-release.js`)
# Formato: una línea por cambio empezando por "- ". La primera se usa como descripción corta en la web.
# Las líneas que empiezan por "#" se ignoran, salvo "# Titulo: ...", que fija el título de la tarjeta.

# Titulo: Descargas de addons solo desde CurseForge y GitHub

- Las descargas de addons solo salen hacia CurseForge y GitHub, siempre por https.
- Cada redireccion de la descarga se vuelve a validar antes de seguirla.
- Las direcciones locales o de la intranet se rechazan antes de descargar nada.
