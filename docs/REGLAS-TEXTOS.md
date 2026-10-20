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

> Ojo: `wow.js` y `routes/wow.js` de Centolos sí tienen `/[\u2014\u2013]/g` en un `replace`: es código que
> **limpia** guiones largos que llegan de los foros, no un texto a mostrar. Eso se queda.
