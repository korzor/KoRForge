# Titulo: Reintento de descargas fallidas y resiliencia de red

- **Reintento de fallidos en lote**: nuevo botón en la actualización masiva para reintentar de golpe todos los addons que hayan fallado por problemas de red o timeout.
- **Reintento individual por fila**: cada addon fallido cuenta con su propio botón de reintento directo en su fila del modal.
- **Resiliencia de descargas**: el gestor de descargas reintenta automáticamente hasta 3 veces ante microcortes de red o caídas de conexión con los servidores de CurseForge o GitHub.
- **Mensajes de error legibles**: se muestra una descripción clara del motivo del fallo y el detalle técnico al pasar el ratón.
