# Titulo: Corrección de dependencias internas de Blizzard (Blizzard_*)

- **Módulos nativos de Blizzard ignorados en dependencias**: se reconocen y filtran automáticamente los componentes internos de World of Warcraft (`Blizzard_*`, como `Blizzard_MapCanvas`), evitando falsas alertas de dependencias ausentes.
- **Identificación limpia en addons**: addons como GuildMap y similares se muestran directamente como compatibles y listos para usar sin requerir descargas externas inexistentes.
