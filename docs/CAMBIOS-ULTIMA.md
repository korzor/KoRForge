# Titulo: 1.4.13 - Corrección de codificación en ventana del instalador (UTF-8 BOM)

- Corrección de codificación de caracteres en la tarjeta del instalador (`build/instalando.ps1`). Se fuerza UTF-8 con BOM para que PowerShell 5.1 interprete tildes, puntos suspensivos y acentos correctamente en todos los idiomas sin caracteres extraños.
- Regeneración de instalador oficial Windows.
