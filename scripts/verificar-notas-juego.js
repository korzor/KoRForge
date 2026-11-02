#!/usr/bin/env node
/**
 * Sonda de «notas por juego» (dueño, 02-11-2026).
 *
 * QUE COMPRUEBA
 *   1. Las piezas puras de `modules/notasJuego.js`: fechas en UTC, reparto por rama (Retail / Classic
 *      Era / Classic Prog), conversión de listas anidadas al marcado de las notas del Forever y la
 *      elección de flecha (mejora / nerfeo / rombo ámbar).
 *   2. El servidor: `/api/notas/retail` responde con notas, un juego inventado da 404 y `/juego-img`
 *      sirve un icono de clase y rechaza rutas que no son suyas.
 *
 * Uso: node scripts/verificar-notas-juego.js
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUERTO = 3992;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const apuntes = [];
const problemas = [];
const comprobar = (nombre, condicion, detalle = '') => {
  apuntes.push((condicion ? 'OK   ' : 'FALLO ') + nombre + (!condicion && detalle ? ' -> ' + detalle : ''));
  if (!condicion) problemas.push(nombre + (detalle ? ' -> ' + detalle : ''));
};

const modulo = require(path.join(ROOT, 'modules', 'notasJuego.js'));
const { fechaDeTexto, marcaDeCambio, ramaDe, nombreClase, parsearLista, pintarItems, repartirPorJuego, trocear, tarjetasDeArticulo, aplanarClases } = modulo._internos;

/* ---------------- 1. Piezas puras ---------------- */
comprobar('fecha: octubre 30 en UTC (sin restar un día)', fechaDeTexto('October 30, 2026') === '2026-10-30T00:00:00.000Z', fechaDeTexto('October 30, 2026'));
comprobar('fecha: texto que no es fecha', fechaDeTexto('Housing') === '');

comprobar('flecha: «increased» es mejora', marcaDeCambio('Damage increased by 5%.') === 'isBuff');
comprobar('flecha: «reduced» es nerfeo', marcaDeCambio('Healing reduced by 10%.') === 'isNerf');
comprobar('flecha: sin verbo claro es rombo', marcaDeCambio('The tooltip now says something else.') === 'isChange');
comprobar('flecha: si sube y baja, rombo', marcaDeCambio('Damage increased by 5% but healing reduced by 5%.') === 'isChange');

comprobar('rama: WoW Classic Era', ramaDe('WoW Classic Era') === 'classicEra');
comprobar('rama: Mists of Pandaria Classic', ramaDe('Mists of Pandaria Classic') === 'classicProg');
comprobar('rama: una sección normal no es rama', ramaDe('Classes') === '');

comprobar('clase: Death Knight', nombreClase('Death Knight') === 'deathknight');
comprobar('clase: una sección no es clase', nombreClase('Player versus Player') === '');

const lista = pintarItems(parsearLista('<ul><li><strong>Druid</strong><ul><li><strong>Feral</strong><ul><li>All damage done increased by 5%.</li></ul></li></ul></li></ul>'));
comprobar('lista: la clase se pliega', /<details class="bt-note-class"/.test(lista) && /classicon_druid\.jpg/.test(lista), lista.slice(0, 160));
comprobar('lista: la especialización sale como subtítulo', /<h4 class="pn-spec">Feral<\/h4>/.test(lista));
comprobar('lista: la flecha de mejora sale verde', /class="v2-mark is-buff"/.test(lista));
comprobar('lista: el cambio va en su línea', /<span class="pn-line">All damage done increased by 5%\.<\/span>/.test(lista));

/* Blizzard anida clases dentro de clases en su HTML: aquí se sacan al mismo nivel. */
const anidada = parsearLista('<ul><li><strong>Death Knight</strong><ul><li><strong>Shaman</strong><ul><li>X.</li></ul></li></ul></li></ul>');
const plana = aplanarClases(anidada);
comprobar('clases: una clase dentro de otra se saca al mismo nivel',
  plana.length === 2 && /Shaman/.test(plana[1].etiqueta), JSON.stringify(plana.map((x) => x.etiqueta)));

const cuerpoDemo = `
<p>Here you'll find a list of hotfixes that address various issues related to World of Warcraft.</p>
<p><strong><span style="color: #daa520;">October 30, 2026</span></strong></p>
<p><strong>Classes</strong></p>
<ul><li><strong>Mage</strong><ul><li><strong>Fire</strong><ul><li>Fireball damage increased by 8%.</li></ul></li></ul></li></ul>
<p><strong>WoW Classic Era</strong></p>
<p><strong>Classes</strong></p>
<ul><li><strong>Warrior</strong><ul><li><strong>Arms</strong><ul><li>Mortal Strike damage reduced by 5%.</li></ul></li></ul></li></ul>`;
const bloques = trocear(cuerpoDemo.split('<p><strong><span')[0]);
const reparto = repartirPorJuego(trocear('<p><strong>Classes</strong></p><ul><li><strong>Mage</strong></li></ul>'));
comprobar('reparto: sin cabecera de rama va a Retail', reparto.retail.length > 0 && reparto.classicEra.length === 0);

const tarjetasRetail = tarjetasDeArticulo({ id: '1', titulo: 'Hotfixes: October 30, 2026', fecha: '2026-10-31T00:00:00.000Z' }, cuerpoDemo, 'retail');
const tarjetasEra = tarjetasDeArticulo({ id: '1', titulo: 'Hotfixes: October 30, 2026', fecha: '2026-10-31T00:00:00.000Z' }, cuerpoDemo, 'classicEra');
comprobar('artículo: Retail se queda con su parte', tarjetasRetail.length === 1 && /Fireball/.test(tarjetasRetail[0].cuerpo), String(tarjetasRetail.length));
comprobar('artículo: Classic Era se queda con la suya', tarjetasEra.length === 1 && /Mortal Strike/.test(tarjetasEra[0].cuerpo), String(tarjetasEra.length));
comprobar('artículo: Retail no se cuela en Classic Era', tarjetasEra.length === 0 || !/Fireball/.test(tarjetasEra[0].cuerpo));
comprobar('artículo: la fecha manda en el título', /October 30, 2026/.test(tarjetasRetail[0].titulo), tarjetasRetail[0].titulo);

/* ---------------- 2. Servidor de verdad ---------------- */
async function probarServidor() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-notas-'));
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

    const r = await pedir('/api/notas/retail', token);
    const json = JSON.parse(r.cuerpo.toString('utf8'));
    comprobar('API: Retail responde 200', r.status === 200, 'HTTP ' + r.status);
    comprobar('API: Retail trae notas', json.success === true && Array.isArray(json.articulos) && json.articulos.length > 0,
      r.cuerpo.toString('utf8').slice(0, 140));
    comprobar('API: las notas llevan flechas', /v2-mark/.test(r.cuerpo.toString('utf8')));
    comprobar('API: las notas no llevan enlaces', !/href=|<a\s/i.test(r.cuerpo.toString('utf8')));

    const malo = await pedir('/api/notas/inexistente', token);
    comprobar('API: juego desconocido da 404', malo.status === 404, 'HTTP ' + malo.status);

    const icono = await pedir('/juego-img?p=' + encodeURIComponent('/us/icons/56/classicon_warrior.jpg'));
    comprobar('icono: uno de clase se sirve', icono.status === 200 && /^image\//.test(icono.tipo), 'HTTP ' + icono.status + ' ' + icono.tipo);
    const feo = await pedir('/juego-img?p=' + encodeURIComponent('/etc/passwd.png'));
    comprobar('icono: ruta que no toca, 404', feo.status === 404, 'HTTP ' + feo.status);
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
  console.log('\nOK: cada juego tiene sus notas, con clases, flechas y rombo ámbar');
})();
