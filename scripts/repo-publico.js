'use strict';

/**
 * Deja el repositorio PUBLICO (korzor/KoRForge) como punto de descarga, sin codigo.
 *
 * POR QUE EXISTE (decidido por el dueño el 23-10-2026):
 *   «no quiero que muestres el sourcecode, para que, para que lo copien?»
 *   El repo publico solo lleva README.md, LICENSE y docs/CAMBIOS-ULTIMA.md. El desarrollo vive en el
 *   repo PRIVADO korzor/KoRForge-src (remoto `src`) y en este PC.
 *
 * QUE HACE:
 *   1. Construye un commit NUEVO y unico (sin padres) con esos tres ficheros, sacados del arbol de
 *      trabajo actual. Asi el historial publico es siempre de un solo commit: no queda rastro de
 *      versiones anteriores aunque se publique 100 veces.
 *   2. Fuerza la rama main del publico a ese commit.
 *   3. Mueve el tag de la version (vX.Y.Z del package.json) a ese mismo commit y borra del publico
 *      cualquier otro tag (un tag viejo mantendria vivo su commit y con el el historial).
 *
 * ORDEN DE USO (docs internos: REGLAS-VERSIONES):
 *   node scripts/repo-publico.js          <- primero esto
 *   node scripts/subir-release-github.js  <- despues los binarios a la release
 *   node scripts/publish-korforge-release.js --no-build
 *
 * Si GitHub se queja al crear la release porque el tag ya existe, es correcto: el tag se crea aqui.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const REPO_PUBLICO = 'origin';
const version = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).version;
const tagVersion = `v${version}`;

/* Lo unico que se publica: presentacion, aviso legal para IAs, licencia, nota de la version y el
   banner que pinta el README (sin el, GitHub enseña el enlace roto). Nada de codigo. */
const FICHEROS = ['README.md', 'AGENTS.md', 'LICENSE', 'docs/CAMBIOS-ULTIMA.md', 'korforge-banner.png'];

/** Ejecuta git y devuelve la salida sin espacios sobrantes. */
function git(args, opciones = {}) {
  return execSync(`git ${args}`, { cwd: raiz, encoding: 'utf8', ...opciones }).trim();
}

/* 0. Avisos previos ------------------------------------------------------- */
const sucio = git('status --porcelain');
if (sucio) {
  console.warn('[repo-publico] AVISO: hay cambios sin commitear; se publicara lo que hay en disco:');
  console.warn(sucio.split('\n').map((l) => '  ' + l).join('\n'));
}
for (const f of FICHEROS) {
  if (!fs.existsSync(path.join(raiz, f))) {
    console.error(`[repo-publico] FALTA ${f}: no se puede construir el repo publico.`);
    process.exit(1);
  }
}

/* 1. Arbol con solo esos ficheros (indice temporal, no se toca el del trabajo) */
const indice = path.join(process.env.TEMP || '/tmp', `indice-publico-${Date.now()}`);
process.env.GIT_INDEX_FILE = indice;
try {
  git('read-tree --empty');
  for (const f of FICHEROS) {
    /* hash-object -w del FICHERO EN DISCO (no de HEAD): asi se publica lo que hay ahora mismo, aunque
       aun no se haya commiteado. Antes se leia HEAD y el README nuevo no llegaba al publico. */
    const blob = git(`hash-object -w -- "${f}"`);
    git(`update-index --add --cacheinfo 100644,${blob},${f}`);
  }
  const arbol = git('write-tree');

  /* 2. Commit nuevo sin padres: el historial publico, siempre de uno */
  const mensaje = [
    'KoRForge - repositorio de descargas',
    '',
    'Aqui solo estan la presentacion, la licencia y la nota de la ultima version.',
    'Los binarios oficiales (Windows y Linux) se publican en Releases.',
    'El desarrollo no se publica.',
    '',
    `Version: ${version}`,
  ].join('\n');
  const commit = (() => {
    /* El mensaje va por fichero (-F): con -m y JSON.stringify los \n quedan literales. */
    const mensajeFichero = path.join(process.env.TEMP || '/tmp', `mensaje-publico-${Date.now()}.txt`);
    fs.writeFileSync(mensajeFichero, mensaje, 'utf8');
    try {
      return git(`commit-tree ${arbol} -F "${mensajeFichero}"`);
    } finally {
      try { fs.unlinkSync(mensajeFichero); } catch (_) {}
    }
  })();

  git(`update-ref refs/heads/publico ${commit}`);
  git(`tag -f ${tagVersion} ${commit}`);
  console.log(`[repo-publico] commit ${commit.slice(0, 7)} con: ${FICHEROS.join(', ')}`);

  /* 3. Publicar: rama y tag a la fuerza */
  const salidaPush = execSync(`git push --force ${REPO_PUBLICO} publico:main`, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  console.log('[repo-publico] main publicada:', salidaPush.trim().split('\n').pop());

  try {
    execSync(`git push --force ${REPO_PUBLICO} ${tagVersion}`, { cwd: raiz, stdio: 'ignore' });
    console.log(`[repo-publico] tag ${tagVersion} movido al commit nuevo`);
  } catch (e) {
    console.warn(`[repo-publico] AVISO moviendo el tag ${tagVersion}: ${e.message}`);
  }

  /* 4. Tags viejos fuera del publico: cada uno mantendria vivo su historial */
  let tagsPublicos = [];
  try {
    tagsPublicos = JSON.parse(execSync(`gh api "repos/korzor/KoRForge/tags?per_page=100"`, { cwd: raiz, encoding: 'utf8' }))
      .map((t) => t.name);
  } catch (e) {
    console.warn('[repo-publico] AVISO: no pude listar los tags del publico:', e.message);
  }
  const sobran = tagsPublicos.filter((t) => t !== tagVersion);
  for (const t of sobran) {
    try {
      execSync(`git push ${REPO_PUBLICO} ":refs/tags/${t}"`, { cwd: raiz, stdio: 'ignore' });
      console.log(`[repo-publico] tag viejo borrado: ${t}`);
    } catch (e) {
      console.warn(`[repo-publico] no pude borrar el tag ${t}: ${e.message}`);
    }
  }

  console.log('[repo-publico] Hecho. Recuerda: el fuente se sube con `git push` (va al remoto src, privado).');
} finally {
  delete process.env.GIT_INDEX_FILE;
  try { fs.unlinkSync(path.join(indice)); } catch (_) {}
  try { fs.unlinkSync(indice + '.lock'); } catch (_) {}
}
