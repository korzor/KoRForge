# Reglas de textos de la interfaz (KoRForge)

**Decisión del dueño, 20-10-2026.**

## Prohibidos los guiones largos

- **Nada de guiones largos** (`—`, U+2014) ni **medios** (`–`, U+2013) en ningún texto que vea el
  usuario: botones, títulos, tooltips («popups» al pasar el ratón), avisos, modales, notas de versión,
  página web.
- Para separar ideas se usa el punto medio `·` o la coma; para rangos, un guion normal `-`.
- Ejemplo real del fallo: el tooltip del botón de versión decía
  `KoRForge v1.0.11 — última versión…` y pasó a `KoRForge v1.0.11 · última versión…`.

## Cómo comprobarlo antes de publicar

Desde la raíz del repo, esto no debe devolver nada en los textos de la interfaz
(`public/`, `modules/`, `server.js` y las notas de `scripts/release-github.js`):

```bash
node -e "
const fs = require('fs'), path = require('path');
const re = /[\u2014\u2013]/;
const ficheros = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|release|cache/.test(p)) walk(p); }
    else if (/\.(js|html|json|md)$/.test(e.name)) ficheros.push(p);
  }
})('public');
for (const f of ['server.js', 'scripts/release-github.js']) ficheros.push(f);
for (const f of ficheros) {
  const t = fs.readFileSync(f, 'utf8');
  if (re.test(t)) console.log('GUION LARGO en', f);
}
"
```

> Ojo: la web de noticias (`wow.js` y `routes/wow.js`) sí tiene `/[\u2014\u2013]/g` en un `replace`:
> es código que **limpia** guiones largos que llegan de los foros, no un texto a mostrar. Eso se queda.

## Avisos: toast, no cartel (dueño, 21-10-2026)

- **Nada de avisos en grande en la pantalla principal.** Un cartel sobre la lista de addons tapa lo
  que el usuario ha venido a ver. Los avisos de estado van en un **toast** discreto.
- **Un aviso, una vez.** Si la condición sigue igual, no se repite en cada cambio de pestaña: se
  recuerda lo ya avisado (en `app.js`, `avisarFaltaDeCarpeta()` con su guarda `avisoRutaDada`).
- **No se propone cambiar a otro cliente.** El aviso dice qué cliente no tiene carpeta y dónde se
  cambia (Ajustes o los logos de la barra de arriba); elegir otro cliente es cosa del usuario.
  Fallo real: el cartel de la 1.2.4 ofrecía «Cambiar a WoW Forever» porque cogía el primer cliente de
  la lista con carpeta, que no tenía nada que ver.
- El cambio de cliente se hace con los **cuatro logos de la barra superior** (son botones, no adornos).
- **No se pinta interfaz que no se haya pedido.** Si algo parece necesario (un texto nuevo, un
  aviso), se propone y se espera el sí. Ejemplo real: el 21-10-2026 se añadió por iniciativa propia
  un texto a la derecha del selector de clientes; el dueño no lo había pedido y se tuvo que quitar.

## El README no lleva la sección de compilación (dueño, 23-10-2026)

- **Prohibido volver a añadir** al README la sección «Compilar desde el código (uso personal)» /
  «Build from source (personal use)», con sus comandos `git clone`/`npm install`/`npm start` ni el
  párrafo de «compilar o ejecutar está permitido…». Se quitó de los dos idiomas por orden del dueño
  del 23-10-2026 y **no se vuelve a meter** en un README, en la web ni en las notas de una release.
- El README se queda con: qué es, características, descarga e instalación, apoyo al proyecto,
  privacidad y licencia.

