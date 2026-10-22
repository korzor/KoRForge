# Cambios de la última versión (los lee `scripts/publish-korforge-release.js`)
# Formato: una línea por cambio empezando por "- ". La primera se usa como descripción corta en la web.
# Las líneas que empiezan por "#" se ignoran, salvo "# Titulo: ...", que fija el título de la tarjeta.

# Titulo: Desinstalar se lo lleva todo y pregunta antes

- Al desinstalar se borran todas las carpetas que trajo el addon (Questie y QuestieDB, los módulos de EllesmereUI), no solo la que pulsabas.
- Si otro addon depende de alguna de esas carpetas, sale un aviso con la lista antes de seguir, por si quieres cancelar.
- Antes de desinstalar pregunta si quieres borrar también los datos guardados (SavedVariables); si dices que no, tu configuración se queda para cuando lo reinstales.
