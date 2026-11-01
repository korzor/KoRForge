# Titulo: 1.5.18 - Corrección del filtro de ordenación «Update available first»

- **Corrección de ordenación por actualizaciones**: Se conectó el estado de actualizaciones disponibles (`availableAddonUpdates`) con el subsistema de ordenación de listas (`orden-listas-ui.js`). La opción de ordenar «Update available first» (Con actualización primero) ahora coloca de forma inmediata y prioritaria todos los addons con versiones nuevas disponibles al principio de la lista.
- **Búsqueda automática al seleccionar el filtro**: Si el usuario selecciona el orden por actualizaciones y aún no se había realizado la comprobación de actualizaciones en la sesión actual, la app realiza automáticamente una comprobación silenciosa en segundo plano para presentar los resultados ordenados.
