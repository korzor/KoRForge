# Cambios de la última versión (los lee `scripts/publish-korforge-release.js`)
# Formato: una línea por cambio empezando por "- ". La primera se usa como descripción corta en la web.
# Las líneas que empiezan por "#" se ignoran, salvo "# Titulo: ...", que fija el título de la tarjeta.

# Titulo: Seguridad del API local y estabilidad general

- El API local de la app exige ahora un token de sesión que la ventana recibe al cargarse.
- Se rechazan las peticiones que no vienen de la propia app (host, origen y tipo de petición).
- Los nombres de carpetas de addons y de copias de seguridad se validan antes de tocar el disco.
- Los mensajes de error de la interfaz vuelven a traducirse en los cinco idiomas.
