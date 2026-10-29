# Titulo: 1.4.14 - Modularización de UI y compilación Linux AppImage

- Modularización y desacoplamiento de arquitectura UI: el subsistema de noticias y foros se desacopla a `public/noticias-ui.js` y la lógica de ordenación de listas a `public/orden-listas-ui.js`, mejorando rendimiento y mantenibilidad.
- Soporte oficial y compilación multiplataforma para Linux: generación del paquete autónomo AppImage (`KoRForge-1.4.14-Linux.AppImage`) con toolset FUSE interno compatible con Ubuntu 26.04+ sin dependencias externas.
- Integración automatizada del pipeline de empaquetado seguro para Windows (`.exe`) y Linux (`.AppImage`) con verificación de integridad SHA-256.
