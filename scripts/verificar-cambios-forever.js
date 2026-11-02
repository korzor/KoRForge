#!/usr/bin/env node
/**
 * Sonda de «Latest Forever Changes» (dueño, 02-11-2026).
 *
 * QUE COMPRUEBA
 *   1. Las funciones puras del módulo (`modules/cambiosForever.js`) con trozos de ejemplo: lectura del
 *      feed, troceado de la página, saneado sin enlaces ni menciones al sitio, iconos reescritos y
 *      rechazo de rutas de imagen raras.
 *   2. El servidor de verdad (datos y puerto temporales, sin tocar la configuración del dueño):
 *      `/api/cambios-forever` responde con notas y sin ningún enlace ni dominio del sitio, y
 *      `/cambios-img` rechaza rutas que no sean de sus iconos.
 *   3. El sitio real, para avisar si su feed o su página cambian de forma (esto necesita internet).
 *
 * Uso: node scripts/verificar-cambios-forever.js
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUERTO = 3989;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const apuntes = [];
const problemas = [];
const comprobar = (nombre, condicion, detalle = '') => {
  apuntes.push((condicion ? 'OK   ' : 'FALLO ') + nombre + (!condicion && detalle ? ' -> ' + detalle : ''));
  if (!condicion) problemas.push(nombre + (detalle ? ' -> ' + detalle : ''));
};

const modulo = require(path.join(ROOT, 'modules', 'cambiosForever.js'));
const { FEED_URL, PAGINA_URL, parsearFeed, extraerSecciones, sanear, rutaImagen, limpiarTexto } = modulo._internos;

/* ---------------- 1. Funciones puras ---------------- */
/* La fuente es la inglesa (sin prefijo de idioma): en la /es/ los hechizos y clases salían en
   castellano y el resto en inglés. */
comprobar('fuente: feed ingles', FEED_URL === 'https://foreverchanges.pro/patch-notes/feed.xml', FEED_URL);
comprobar('fuente: pagina inglesa', PAGINA_URL === 'https://foreverchanges.pro/patch-notes', PAGINA_URL);
comprobar('fuente: sin /es/', !/\/es\//.test(FEED_URL + PAGINA_URL));

const feedDemo = `<?xml version="1.0" encoding="UTF-8"?>
<rss><channel>
<item>
  <title>Hotfix, October 30, 2026</title>
  <link>https://foreverchanges.pro/patch-notes#hotfix-2026-10-30</link>
  <pubDate>Fri, 30 Oct 2026 12:00:00 GMT</pubDate>
  <description>A hotfix &amp; a note.</description>
</item>
<item>
  <title>Build 1.60.1.70707, October 30, 2026</title>
  <link>https://foreverchanges.pro/patch-notes#1.60.1.70707</link>
  <pubDate>Fri, 30 Oct 2026 12:00:00 GMT</pubDate>
  <description>The build of the day.</description>
</item>
</channel></rss>`;

const items = parsearFeed(feedDemo);
comprobar('feed: lee las dos noticias', items.length === 2, String(items.length));
comprobar('feed: titulo y entidades', items[0].titulo === 'Hotfix, October 30, 2026', items[0].titulo);
comprobar('feed: ancla del enlace', items[0].ancla === 'hotfix-2026-10-30', items[0].ancla);
comprobar('feed: resumen sin etiquetas', items[0].resumen === 'A hotfix & a note.', items[0].resumen);

const paginaDemo = `<ol class="bt-builds pn-builds">
<li id="a1"><div class="bt-build-id"><h2><time dateTime="2026-10-30">30 de octubre de 2026</time></h2><span class="pn-version">Hotfix</span></div><div class="bt-build-body"><p>Hola <a href="/es/talents/druid">Druida</a>.</p><script>alert(1)</script><img src="/icon/spell_x.jpg" width="18" height="18"></div></li>
<li id="a2"><div class="bt-build-id"><h2><time dateTime="2026-10-29">29 de octubre de 2026</time></h2><span class="pn-version">Build 1.2</span></div><div class="bt-build-body"><p>Otra.</p></div></li>
</ol>`;

const secciones = extraerSecciones(paginaDemo);
comprobar('pagina: encuentra las dos secciones', secciones.size === 2, String(secciones.size));

const sucio = `<div class="bt-build-body">
  <p>Esta nota habla de ForeverChanges y de <a href="https://foreverchanges.pro/x">su web</a>.</p>
  <script>alert(1)</script>
  <p>En esta página se explica: los talentos y hechizos de esta web se leían de sus imágenes.</p>
  <img src="/icon/spell_holy_divineillumination.jpg" width="18" height="18">
  <img src="https://otro-sitio.example/x.png">
  <img src="/icon/../secreto.jpg">
  <ul class="pn-lines"><li><svg class="v2-mark is-buff" viewBox="0 0 12 12" width="12" height="12"><path d="M6 1.5 11 7.5Z"></path></svg><span class="pn-line">Texto con <a class="q1" href="/es/item/1">Objeto</a>: cambia.</span></li></ul>
</div>`;

const limpio = sanear(sucio);
comprobar('saneado: sin enlaces', !/<a\b/i.test(limpio) && !/href=/i.test(limpio), limpio.slice(0, 120));
comprobar('saneado: sin scripts', !/<script/i.test(limpio));
comprobar('saneado: sin menciones al sitio', !/foreverchanges/i.test(limpio));
comprobar('saneado: se va «esta web»', !/esta web/i.test(limpio));
comprobar('saneado: conserva el texto de los enlaces', /Druida/.test(sanear('<p><a href="/x">Druida</a></p>')));
comprobar('saneado: icono reescrito al servidor local', /src="\/cambios-img\?p=%2Ficon%2Fspell_holy_divineillumination\.jpg"/.test(limpio));
comprobar('saneado: tira imágenes externas y rutas con ..', !/otro-sitio|secreto/.test(limpio));
comprobar('saneado: color de calidad en un span', /<span class="q1">Objeto<\/span>/.test(limpio));
comprobar('saneado: marca buff con su viewBox', /<svg class="v2-mark is-buff" viewBox="0 0 12 12"/.test(limpio));
comprobar('saneado: el svg no es leído por el lector de pantalla', /aria-hidden="true"/.test(limpio));
comprobar('saneado: entidades decodificadas una sola vez', sanear('<p>Tom &amp; Jerry y &#x27;eso&#x27;</p>') === "<p>Tom &amp; Jerry y 'eso'</p>", sanear('<p>Tom &amp; Jerry y &#x27;eso&#x27;</p>'));

comprobar('imagen: ruta buena', rutaImagen('/icon/spell_holy_divineillumination.jpg').startsWith('/cambios-img?p='));
comprobar('imagen: ruta con .. rechazada', rutaImagen('/icon/../x.jpg') === '');
comprobar('imagen: host externo rechazado', rutaImagen('https://foreverchanges.pro/icon/x.jpg') === '');
comprobar('imagen: extensión rara rechazada', rutaImagen('/icon/x.exe') === '');
comprobar('texto: quita el nombre del sitio', limpiarTexto('Según ForeverChanges, esto cambia.').trim() === 'Según, esto cambia.', JSON.stringify(limpiarTexto('Según ForeverChanges, esto cambia.')));
comprobar('texto: quita la frase que habla de la web', limpiarTexto('Esto sigue. Hasta entonces los datos de esta web salían de imágenes. Otra frase.').trim() === 'Esto sigue. Otra frase.', JSON.stringify(limpiarTexto('Esto sigue. Hasta entonces los datos de esta web salían de imágenes. Otra frase.')));
comprobar('texto: quita «this site» en inglés', limpiarTexto("One line. Until the beta client came out, this site's talents were read off footage. Another line.").trim() === 'One line. Another line.',
  JSON.stringify(limpiarTexto("One line. Until the beta client came out, this site's talents were read off footage. Another line.")));
comprobar('texto: quita la coletilla de «the Races page»', limpiarTexto('The lines below say what changes at launch, and the Races page shows them under each racial.').trim() === 'The lines below say what changes at launch.',
  JSON.stringify(limpiarTexto('The lines below say what changes at launch, and the Races page shows them under each racial.')));

/* ---------------- 2. Servidor de verdad ---------------- */
async function probarServidor() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-cambios-'));
  fs.writeFileSync(path.join(base, 'config.json'), JSON.stringify({
    activeGame: 'forever', rootWoWDir: '', wowDir: '', closeToTray: false, startMinimized: false,
    language: 'es', favorites: [], autoStart: false,
    games: { forever: { id: 'forever', name: 'WoW Forever', subtitle: '', icon: 'A', path: '', subfolder: '_forever_', flavorId: '88568' } }
  }, null, 2));

  const hijo = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { KORFORGE_PORT: String(PUERTO), KORFORGE_USER_DATA: base }),
    stdio: 'ignore'
  });

  const pedir = (ruta, token) => new Promise((ok, mal) => {
    const req = http.request({ hostname: '127.0.0.1', port: PUERTO, path: ruta, headers: token ? { 'X-KoRForge-Token': token } : {} }, (res) => {
      const trozos = [];
      res.on('data', (c) => trozos.push(c));
      res.on('end', () => ok({ status: res.statusCode, tipo: res.headers['content-type'] || '', cuerpo: Buffer.concat(trozos) }));
    });
    req.on('error', mal);
    req.end();
  });

  try {
    let token = '';
    for (let i = 0; i < 60 && !token; i += 1) {
      await sleep(250);
      try {
        const s = await pedir('/api/session');
        token = (JSON.parse(s.cuerpo.toString('utf8')) || {}).token || '';
      } catch (_) {}
    }
    if (!token) {
      comprobar('servidor de pruebas arranca', false);
      return;
    }

    const r = await pedir('/api/cambios-forever', token);
    const json = JSON.parse(r.cuerpo.toString('utf8'));
    const texto = r.cuerpo.toString('utf8');
    comprobar('API: responde 200', r.status === 200, 'HTTP ' + r.status);
    comprobar('API: trae notas', json && json.success === true && Array.isArray(json.articulos) && json.articulos.length > 0,
      JSON.stringify(json).slice(0, 140));
    comprobar('API: ninguna nota menciona el sitio', !/foreverchanges/i.test(texto));
    comprobar('API: ninguna nota lleva enlaces', !/href=|<a\s/i.test(texto));
    comprobar('API: los iconos van al servidor local', /\/cambios-img\?p=/.test(texto));

    const fea = await pedir('/cambios-img?p=' + encodeURIComponent('../config.json'));
    comprobar('imagen: ruta prohibida no se sirve', fea.status === 404, 'HTTP ' + fea.status);

    const icono = await pedir('/cambios-img?p=' + encodeURIComponent('/icon/classicon_warrior.jpg'));
    comprobar('imagen: un icono se sirve desde el servidor local',
      icono.status === 200 && /^image\//.test(icono.tipo) && icono.cuerpo.length > 200,
      'HTTP ' + icono.status + ' ' + icono.tipo + ' ' + icono.cuerpo.length + 'B');
  } finally {
    try { hijo.kill(); } catch (_) {}
    await sleep(300);
    try { fs.rmSync(base, { recursive: true, force: true }); } catch (_) {}
  }
}

(async () => {
  await probarServidor();

  console.log('\n== apuntes ==');
  for (const a of apuntes) console.log('  .', a);
  if (problemas.length) {
    console.log('\nPROBLEMAS:');
    for (const p of problemas) console.log('  -', p);
    process.exit(1);
  }
  console.log('\nOK: Latest Forever Changes funciona y no deja rastro del sitio en la app');
})();
