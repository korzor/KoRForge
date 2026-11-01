# Titulo: Gestión por lote de addons, rediseño de actualización y arrastre en Linux

- **Interruptor de activar/desactivar todos los addons**: En la barra de herramientas de la pestaña de instalados, se incorpora un interruptor dinámico («Disable all» / «Enable all») que permite conmutar en bloque el estado de todos los addons con ventana de confirmación previa.
- **Desinstalación total con confirmación de seguridad**: Se añade el botón «Uninstall all» para vaciar por completo la colección de addons del cliente de WoW seleccionado, protegido por un modal interactivo que exige escribir «por favor» para desbloquear la confirmación.
- **Botón de actualización integrado y sobrio**: Se traslada el botón de actualización a la fila inferior de la tarjeta, ocupando el lugar de la etiqueta redundante de la carpeta. Se sustituye el rayo por un SVG rotatorio estilizado y se refina su aspecto con acabados ámbar y alineación uniforme.
- **Soporte de arrastre de ventana en Linux**: Se activa la región de arrastre nativa (`-webkit-app-region: drag`) en Linux para permitir mover la ventana sin marco en compositores Wayland y gestores X11.
- **Ajustes de inicio agnósticos del sistema**: Se actualiza el texto de arranque automático a «Launch on Startup» («Arrancar con el sistema») en los 9 idiomas.
