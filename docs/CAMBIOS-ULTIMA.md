# Titulo: 1.5.19 - Retirada del botón «Play» (lanzamiento de juego)

- **Retirada del botón Play**: Se elimina el botón «Play» de la barra superior y su endpoint asociado. En sistemas Linux los clientes de WoW suelen ejecutarse mediante Steam/Proton, Heroic o lanzadores dedicados de Battle.net, por lo que el intento de ejecución directa desde el gestor provocaba fallos de Wine (`xdg-open`). Para evitar confusiones, comportamientos inesperados e inconsistencias multiplataforma, la app se enfoca puramente en la gestión, actualización y sincronización de addons.
