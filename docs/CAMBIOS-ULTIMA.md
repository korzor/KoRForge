# Titulo: 1.5.15 - Filtro estricto para Classic Era y autodetección Battle.net

- Filtro estricto para Classic Era: consulta a CurseForge acotada a gameVersionTypeId=67408 y descarte automático de versiones de progresión (MoP / Cata) para que Classic Era siempre descargue sus addons correspondientes (1.15.x).
- Autodetección Battle.net: lectura del archivo .build.info para detectar de forma automática las carpetas instaladas (_classic_era_, _forever_, _retail_) y resolución de rutas seleccionadas.
