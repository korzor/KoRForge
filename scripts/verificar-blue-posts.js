#!/usr/bin/env node
/**
 * Sonda de los «Blue posts» de WoW Forever (dueño, 02-11-2026).
 *
 * QUE COMPRUEBA
 *   1. Las funciones puras de `modules/bluePostsForever.js` con trozos de ejemplo: la búsqueda va a
 *      la categoría y al grupo correctos, el saneado no deja ni un enlace ni una imagen de fuera, las
 *      tablas se conservan y el onebox de YouTube se convierte en un botón de vídeo válido.
 *   2. El servidor de verdad (datos y puerto temporales, sin tocar la configuración del dueño):
 *      `/api/blue-posts` trae la lista sin enlaces ni dominios, `/api/blue-posts/<id>` trae el cuerpo
 *      y rechaza ids que no son números. Sin token, 401.
 *   3. El foro real, para avisar si Blizzard cambia la forma de la búsqueda o de un post.
 *
 * Uso: node scripts/verificar-blue-posts.js
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUERTO = 3991;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const apuntes = [];
const problemas = [];
const comprobar = (nombre, condicion, detalle = '') => {
  apuntes.push((condicion ? 'OK   ' : 'FALLO ') + nombre + (!condicion && detalle ? ' -> ' + detalle : ''));
  if (!condicion) problemas.push(nombre + (detalle ? ' -> ' + detalle : ''));
};

const modulo = require(path.join(ROOT, 'modules', 'bluePostsForever.js'));
const { BASE, BUSQUEDA, sanear, bloqueDeVideo, rutaImagenForo } = modulo._internos;

/* ---------------- 1. Funciones puras ---------------- */
comprobar('fuente: foro oficial de Blizzard', BASE === 'https://us.forums.blizzard.com/en/wow', BASE);
comprobar('fuente: solo la categoría de WoW: Forever', /#wow-forever/.test(BUSQUEDA), BUSQUEDA);
comprobar('fuente: solo el grupo de Community Managers', /group:community-manager/.test(BUSQUEDA), BUSQUEDA);

const sucio = `<p>Hola <a href="https://us.forums.blizzard.com/en/wow/t/1">enlace</a> y <strong>negrita</strong>.</p>
<div class="lightbox-wrapper"><a class="lightbox" href="https://cdn.example/foto.jpeg"><img src="https://cdn.example/foto.jpeg" alt="image"></a></div>
<blockquote><p>Cita.</p></blockquote>
<table><thead><tr><th>Dungeon</th><th>Level</th></tr></thead><tbody><tr><td>Dalaran</td><td>28</td></tr></tbody></table>
<script>alert(1)</script>`;

const limpio = sanear(sucio);
comprobar('saneado: sin enlaces', !/<a\b/i.test(limpio) && !/href=/i.test(limpio), limpio.slice(0, 120));
comprobar('saneado: conserva el texto del enlace', /enlace/.test(limpio));
comprobar('saneado: sin scripts', !/<script/i.test(limpio));
comprobar('saneado: sin imágenes de fuera', !/<img\b/i.test(limpio) && !/cdn\.example/.test(limpio));
comprobar('saneado: conserva la cita', /<blockquote>/.test(limpio));
comprobar('saneado: conserva la tabla', /<table>[\s\S]*<th>Dungeon<\/th>[\s\S]*<td>Dalaran<\/td>/.test(limpio));

const onebox = `<div class="youtube-onebox lazy-video-container" data-video-id="BVyhnixdPQg" data-video-title="Charla &amp; podcast"><a href="https://www.youtube.com/watch?v=BVyhnixdPQg"><img src="https://img.youtube.com/vi/BVyhnixdPQg/hq.jpg"></a></div>`;
const conVideo = sanear(onebox);
comprobar('vídeo: el onebox se vuelve un botón', /class="bp-video-play" data-video-id="BVyhnixdPQg"/.test(conVideo), conVideo.slice(0, 140));
comprobar('vídeo: el título va escapado', /Charla &amp; podcast/.test(conVideo), conVideo);
comprobar('vídeo: la miniatura va por el proxy local', /class="bp-video-poster" src="\/foro-img\?p=%2Fvi%2FBVyhnixdPQg%2Fhq\.jpg"/.test(conVideo), conVideo.slice(0, 220));
comprobar('vídeo: no queda ni un enlace de YouTube', !/href=|youtube\.com/.test(conVideo));
comprobar('vídeo: sin id no hay botón', bloqueDeVideo('<div class="youtube-onebox"></div>') === '');

const conFoto = sanear('<p>Foto:</p><img src="https://d2ertrwg9e34np.cloudfront.net/original/1X/abc.jpeg" width="800" height="381"><img src="https://cdn.example/fuera.png"><p>Emoji <img class="emoji" src="/images/emoji/twitter/smile.png" width="20" height="20"></p>');
comprobar('foto: se sirve por el proxy local', /<img class="bp-img" src="\/foro-img\?p=%2Foriginal%2F1X%2Fabc\.jpeg"/.test(conFoto), conFoto.slice(0, 200));
comprobar('foto: un host que no es del foro se tira', !/cdn\.example/.test(conFoto));
comprobar('emoji: se queda pequeño y en línea', /<img class="emoji" src="\/foro-img\?p=%2Fimages%2Femoji%2Ftwitter%2Fsmile\.png"/.test(conFoto));

comprobar('imagen: URL del CDN del foro permitida', rutaImagenForo('https://d2ertrwg9e34np.cloudfront.net/original/1X/x.jpeg') === '/foro-img?p=%2Foriginal%2F1X%2Fx.jpeg');
comprobar('imagen: host ajeno rechazado', rutaImagenForo('https://evil.example/original/x.jpeg') === '');
comprobar('imagen: ruta con .. rechazada', rutaImagenForo('/original/../x.jpeg') === '');
comprobar('imagen: sin extensión de imagen rechazada', rutaImagenForo('/original/1X/abc') === '');
comprobar('imagen: prefijo que no toca rechazado', rutaImagenForo('/etc/passwd.png') === '');

/* ---------------- 2. Servidor de verdad ---------------- */
async function probarServidor() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-blue-'));
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
      res.on('end', () => ok({ status: res.statusCode, cuerpo: Buffer.concat(trozos) }));
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

    const sinToken = await pedir('/api/blue-posts');
    comprobar('API: sin token no se entra', sinToken.status === 401, 'HTTP ' + sinToken.status);

    const r = await pedir('/api/blue-posts', token);
    const texto = r.cuerpo.toString('utf8');
    const json = JSON.parse(texto);
    comprobar('API: responde 200', r.status === 200, 'HTTP ' + r.status);
    comprobar('API: trae blue posts', json && json.success === true && Array.isArray(json.articulos) && json.articulos.length > 0,
      texto.slice(0, 140));
    comprobar('API: sin enlaces ni dominios en la lista', !/href=|<a\s/i.test(texto) && !/https?:\/\//i.test(texto), texto.slice(0, 140));
    comprobar('API: no se cuela el dominio del foro', !/forums\.blizzard\.com/i.test(texto));
    comprobar('API: cada post trae autor y fecha', (json.articulos || []).every((a) => a.autor && a.fecha && a.titulo));

    const primero = json.articulos[0];
    const cuerpo = await pedir('/api/blue-posts/' + primero.id, token);
    const textoCuerpo = cuerpo.cuerpo.toString('utf8');
    comprobar('API: el cuerpo responde 200', cuerpo.status === 200, 'HTTP ' + cuerpo.status);
    comprobar('API: el cuerpo no lleva enlaces ni direcciones sueltas', !/href=|<a\s|https?:\/\//i.test(textoCuerpo), textoCuerpo.slice(0, 140));
    comprobar('API: todas las imágenes van al proxy local',
      !/src="(?!\/foro-img\?)/.test(textoCuerpo),
      (textoCuerpo.match(/<img[^>]*>/g) || []).slice(0, 2).join(' '));

    const malo = await pedir('/api/blue-posts/no-es-un-numero', token);
    comprobar('API: id que no es número se rechaza', malo.status === 404, 'HTTP ' + malo.status);
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
  console.log('\nOK: los blue posts de WoW Forever se leen sin enlaces ni imágenes de fuera');
})();
