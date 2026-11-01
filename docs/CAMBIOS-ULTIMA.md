# Titulo: 1.5.17 - Filtrado inteligente de versiones en updates y diseño limpio de tarjetas

- **Descarte inteligente de actualizaciones incompatibles**: Verificación de compatibilidad mediante inspección de metadatos y archivos `.toc` del zip antes de extraer. Si una actualización corresponde a otra versión de cliente (ej. Classic Era o Retail en WoW Forever), el aviso de update se descarta automáticamente para evitar romper la instalación y no molestar al usuario.
- **Unificación y eliminación de redundancias en tarjetas de addons**: Se eliminó el botón duplicado de actualización que pisaba la etiqueta de la carpeta instalada, dejando un único botón «Update» visible y perfectamente posicionado en la fila superior de metadatos.
- **Mejora en la selección de archivos candidatos**: Priorización estricta por versión de juego (Forever / Classic Era / Progression / Retail) tanto en descargas directas como en comprobación de actualizaciones masivas.
