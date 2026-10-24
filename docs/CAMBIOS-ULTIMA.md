# Cambios de la ultima version (los lee scripts/publish-korforge-release.js)
# Formato: una linea por cambio empezando por '- '. La primera se usa como descripcion corta en la web.
# Las lineas que empiezan por '#' se ignoran, salvo '# Titulo: ...', que fija el titulo de la tarjeta.

# Titulo: KoRForge v1.3.15 - La actualización espera a que la instalación acabe de verdad

- La tarjeta de actualizar ya no se cierra antes de tiempo: se queda hasta que el instalador ha terminado de verdad y solo entonces se cierra; después se abre la app.
- Se acabaron el parpadeo y las dos ventanas de la app: el instalador silencioso ya no la abre por su cuenta, la abre el actualizador una sola vez cuando la instalación está confirmada.
- Sin tiempos fijos: se espera al proceso del instalador y a que la versión instalada sea la nueva, así funciona igual en un PC rápido que en uno lento.
