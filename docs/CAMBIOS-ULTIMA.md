# Titulo: Restauración inteligente de submódulos al habilitar el addon padre

- **Rehabilitación inteligente**: al volver a activar un addon principal (como Baganator), el gestor reactiva automáticamente solo aquellos submódulos y dependencias vinculadas (como Syndicator) que estaban activos en el momento en que se desactivó el padre.
- **Respeto a submódulos desactivados**: si un módulo hijo ya había sido desactivado individualmente por el usuario con anterioridad, se preserva en estado desactivado y no se fuerza su activación.
- **Desactivación en cascada**: al apagar un addon matriz, sus módulos dependientes activos se desactivan de forma conjunta para evitar dependencias huérfanas en el cliente del juego.
