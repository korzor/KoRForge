# Cambios de la última versión (los lee `scripts/publish-korforge-release.js`)
# Formato: una línea por cambio empezando por "- ". La primera se usa como descripción corta en la web.
# Las líneas que empiezan por "#" se ignoran, salvo "# Titulo: ...", que fija el título de la tarjeta.

# Titulo: Ventana y descargas cerradas, y estabilidad general

- La ventana solo navega a la propia app; los enlaces externos se abren en el navegador y las paginas internas no llevan preload ni Node.
- La descripcion de los addons se sanea antes de mostrarse y la app aplica una politica CSP.
- La actualizacion y los codigos de pack ya no pueden quedarse sin memoria (limites anti bomba).
- La app escucha en un puerto libre y solo cierra sus propias instancias.
- La consola de desarrollo queda reservada a la version de trabajo.
