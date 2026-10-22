# Cambios de la última versión (los lee `scripts/publish-korforge-release.js`)
# Formato: una línea por cambio empezando por "- ". La primera se usa como descripción corta en la web.
# Las líneas que empiezan por "#" se ignoran, salvo "# Titulo: ...", que fija el título de la tarjeta.

# Titulo: Desinstalar se lleva el addon entero

- Al desinstalar un addon se borran todas sus carpetas (Questie y QuestieDB, o los 23 modulos de EllesmereUI); antes solo se borraba la que pulsabas y el addon seguia como instalado.
- Favoritos y la ficha ya no confunden addons parecidos: QuestieDB no cuenta como Questie ni Bagnon_Bank como Bagnon.
- Al comparar nombres da igual el guion, el guion bajo, las mayusculas o las tildes: Leatrix_Plus y Leatrix Plus son el mismo addon.
