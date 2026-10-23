# Cambios de la última versión (los lee `scripts/publish-korforge-release.js`)
# Formato: una línea por cambio empezando por "- ". La primera se usa como descripción corta en la web.
# Las líneas que empiezan por "#" se ignoran, salvo "# Titulo: ...", que fija el título de la tarjeta.

# Titulo: Cierre de la auditoría: topes, versión y registro

- Los paquetes de addons tienen tope de tamaño (descarga y descomprimido) para evitar bombas.
- La versión que anuncia la app es la real.
- Los errores internos ya no muestran rutas del sistema; el detalle queda en el registro.
- El registro de addons se escribe de forma atómica.
