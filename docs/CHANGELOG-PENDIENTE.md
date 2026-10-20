# KoRForge - Registro de Mejoras y Cambios Acumulados (Próxima Versión)

Este documento centraliza las **mejoras de calado** (nuevas funcionalidades, motores, optimizaciones y arquitectura) implementadas en KoRForge para la próxima versión oficial (**v1.1.0**).
*Nota: Los retoques estéticos menores o ajustes de padding no se registran aquí.*

---

## Estado Actual: Preparando v1.1.0

### 🚀 1. Sistema de Auto-Actualización In-App Silencioso
- **Motor de descarga integrado:** La app comprueba silenciosamente nuevas versiones en GitHub Releases y descarga el paquete directamente dentro de la aplicación.
- **Barra de progreso en tiempo real:** Visualización de porcentaje, velocidad y MB transferidos sin salir de la ventana.
- **Reinicio y reemplazo automático:** Al completar la descarga, KoRForge ejecuta el actualizador en modo silencioso y reinicia la app en 2 segundos de forma transparente.

### ⚡ 2. El Botón Mágico: Actualización Masiva de Addons ("Bulk Update")
- **Detección inteligente de versiones:** Registro local de metadatos de addons instalados y verificación con las últimas entregas de CurseForge.
- **Barra de estado de actualizaciones:** Indicador destacado en la pestaña de Addons con el número de addons desactualizados disponibles.
- **Actualizar todo en 1 clic:** Proceso por lotes que descarga, limpia e instala todas las versiones nuevas en paralelo/secuencial con resumen de resultados.

### 🛡️ 3. Detección de Incompatibilidad y Addons Obsoletos
- **Auditor de cabeceras `## Interface`:** Validación en tiempo real del número de interfaz de cada addon frente al cliente activo:
  - *WoW Forever:* Cliente 1.60.1 (`16001`, `11200` y compatibles).
  - *WoW Retail:* The War Within 11.x (`110000+`).
  - *WoW Classic Era:* Vanilla 1.15.x (`11500+`).
  - *WoW Classic Prog:* Cataclysm / MoP (`40400+`, `50500+`).
- **Insignias de estado visuales:** Etiquetas claras en cada tarjeta (`✓ Compatible`, `⚠️ Versión obsoleta`, `❌ Incompatible con este cliente`).
- **Filtro rápido:** Pestaña de filtrado en Addons para localizar al instante addons con alertas de compatibilidad.

### 🧩 4. Gestor Inteligente de Dependencias Requeridas
- **Distinción de dependencias embebidas vs requeridas:** Filtra dependencias según la API de CurseForge (`relationType === 3` requerida externa vs `relationType === 1` ya incluida en el zip del addon).
- **Auto-instalación de librerías faltantes:** Si un addon exige dependencias no embebidas (ej. `Ace3`, `LibSharedMedia`), KoRForge las detecta e instala automáticamente.
- **Escáner de dependencias rotas en `.toc`:** Detección de `## Dependencies` / `## RequiredDeps` en addons locales avisando si falta alguna carpeta en `Interface/AddOns`.

### 📦 5. Exportar e Importar Perfiles de Addons (Compartir con la Guild)
- **Generador de códigos de pack:** Exporta tu lista completa de addons en un código compacto compartible por Discord, WhatsApp o archivo `.korprofile`.
- **Importador asistido:** Analiza cualquier código pegado, compara contra tu carpeta actual, muestra cuántos ya tienes y cuáles te faltan, y los instala todos con un solo clic.

---

## Historial de Versiones Publicadas
- **v1.0.10 (20-10-2026):** actualización de comprobación: se aplica con el runner blindado de la 1.0.9 (sin ventanas, espera real al instalador, reintento de reapertura y registro en `%TEMP%`).
- **v1.0.9 (20-10-2026):** botón de versión permanente en el menú lateral (se enciende al haber versión nueva) y actualizador blindado: registro en `%TEMP%`, espera real a que el instalador acabe y reintento de reapertura.
- **v1.0.8 (20-10-2026):** actualización de comprobación del actualizador silencioso: al pasar desde la 1.0.7 ya no se abre ninguna ventana ni se hacen pings (la ventana que se veía al venir de la 1.0.6 la abría el actualizador antiguo).
- **v1.0.7 (20-10-2026):** el actualizador ya no abre una ventana de consola ni usa `ping` como espera: cierre, instalación silenciosa y reapertura sin ventanas.
- **v1.0.6 (20-10-2026):** las tarjetas de Favoritos (y las del Explorador cuando hay pocos resultados) ya no se estiran a lo alto: la rejilla conserva la altura natural de cada tarjeta.
- **v1.0.5 (20-10-2026):** La ficha de addon ocupa todo el ancho de la ventana y es flexible (antes, 1.080 px centrados). El HTML de la descripción (imágenes, tablas, vídeos, código, citas) se respeta y nunca desborda.
- **v1.0.4 (20-10-2026):** La ficha de addon abre siempre desde arriba y cada pestaña (Descripción, Versiones, Galería) empieza por el principio, con la barra de acciones fija arriba.
- **v1.0.3 (20-10-2026):** Arreglado el scroll de la ficha de addon (no se podía desplazar ni tenía barra lateral; la barra de acciones queda fija arriba).
- **v1.0.2 (19-10-2026):** Actualizador in-app por GitHub Releases, reinicio desacoplado y reparaciones de interfaz (esquinas transparentes, iconos del menú lateral).
- **v1.0.0 (18-10-2026):** Lanzamiento oficial inicial. Instalador NSIS, versión portable, selector multiversión, catálogo CurseForge con traductor y galería, Bóveda WTF y ventana sin marcos con arrastre nativo.
  - *Aviso:* las builds **v1.0.0 y v1.0.1 se retiraron el 20-10-2026** (empaquetaban un `config.json` personal). De la 1.0.0 solo queda el `README` y el changelog como historia; la primera build limpia publicada es la **1.0.2**.
