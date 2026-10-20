#!/usr/bin/env node
/**
 * Verifica EN VIVO la ficha de addon de KoRForge (scroll, anchura flexible y HTML respetado).
 *
 * Uso:
 *   1) Arranca la app con depuración remota:
 *        node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
 *      (o el KoRForge.exe instalado con el mismo argumento)
 *   2) Ejecuta:
 *        node scripts/verificar-ficha-addon.mjs [--port 9333]
 *
 * Comprueba, contra el DOM real:
 *   - la ficha tiene scroll propio (overflow-y:auto, barra visible y se llega al fondo);
 *   - la ficha ocupa el ancho del panel y se adapta a 1000/1120/1280/1600/1920;
 *   - la descripción (HTML de CurseForge), la lista de versiones y la galería no desbordan;
 *   - la barra de acciones sigue siendo sticky.
 *
 * Sale con código 1 si algo falla, para poder usarlo en pruebas.
 */

const port = (() => {
  const i = process.argv.indexOf('--port');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : '9333';
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!res.ok) throw new Error(`CDP no responde en :${port} (HTTP ${res.status})`);
  return res.json();
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        resolve(msg);
      }
    };
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = () => rej(new Error('No se pudo abrir la WebSocket de CDP'));
    });
    return new Cdp(ws);
  }

  send(method, params = {}) {
    return new Promise((resolve) => {
      const mid = ++this.id;
      this.pending.set(mid, { resolve });
      this.ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }

  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.text || JSON.stringify(r.result.exceptionDetails));
    }
    return r.result?.result?.value;
  }

  close() {
    this.ws.close();
  }
}

// Abre la ficha del primer addon del catálogo si no está ya abierta
async function asegurarFichaAbierta(cdp) {
  const yaAbierta = await cdp.evaluate(
    `getComputedStyle(document.getElementById('cfDetailView')).display !== 'none'`
  );
  if (yaAbierta) return;

  // Volver a la pestaña del catálogo (la app puede estar en Favoritos, etc.)
  await cdp.evaluate(`(() => { document.querySelector('.nav-item[data-tab="search"]')?.click(); return true; })()`);
  await sleep(400);

  for (let intento = 0; intento < 2; intento++) {
    for (let i = 0; i < 20; i++) {
      const cards = await cdp.evaluate(`document.querySelectorAll('#cfResultsGrid .cf-card').length`);
      if (cards > 0) break;
      await sleep(500);
    }

    const click = await cdp.evaluate(`(() => {
      const card = document.querySelector('#cfResultsGrid .cf-card');
      if (!card) return false;
      card.click();
      return true;
    })()`);
    if (!click) throw new Error('El catálogo no tiene tarjetas (¿no cargó la API de CurseForge?)');

    // Esperar a que la ficha se muestre (la carga de datos es asíncrona)
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      const visible = await cdp.evaluate(
        `getComputedStyle(document.getElementById('cfDetailView')).display !== 'none'`
      );
      if (visible) {
        await sleep(3000); // dejar cargar la descripción
        return;
      }
    }
  }
  throw new Error('La tarjeta no abrió la ficha de addon');
}

async function medirScroll(cdp) {
  return cdp.evaluate(`(() => {
    const dv = document.getElementById('cfDetailView');
    const cs = getComputedStyle(dv);
    const max = dv.scrollHeight - dv.clientHeight;
    dv.scrollTop = 400;
    const seMueve = dv.scrollTop > 0;
    dv.scrollTop = max;
    const llegaAlFondo = Math.abs(dv.scrollTop - max) <= 2;
    dv.scrollTop = 0;
    return {
      overflowY: cs.overflowY,
      scrollHeight: dv.scrollHeight,
      clientHeight: dv.clientHeight,
      hayScroll: dv.scrollHeight > dv.clientHeight + 1,
      barraVisible: dv.offsetWidth - dv.clientWidth > 0,
      seMueve,
      llegaAlFondo
    };
  })()`);
}

async function medirAncho(cdp, ancho) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: ancho,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await sleep(600);
  return cdp.evaluate(`(async () => {
    const dv = document.getElementById('cfDetailView');
    const pane = document.getElementById('pane-search');
    const bar = document.querySelector('.detail-nav-bar');
    const desborda = (el) => (el ? el.scrollWidth > el.clientWidth + 2 : false);
    const esperar = (ms) => new Promise(r => setTimeout(r, ms));
    const abrirPestana = async (id) => {
      document.querySelector('.detail-tab-btn[data-detail-tab="' + id + '"]')?.click();
      await esperar(120);
    };

    // Descripción (el HTML de CurseForge)
    await abrirPestana('desc');
    const desc = document.getElementById('detailHtmlBody');
    const descDesborda = desborda(desc);

    // Versiones y Archivos
    await abrirPestana('files');
    const files = document.getElementById('detailFilesList');
    const versionesDesbordan = desborda(files) ||
      Array.from(files.children).some(el => el.getBoundingClientRect().right > files.getBoundingClientRect().right + 2);

    // Galería
    await abrirPestana('gallery');
    const gallery = document.getElementById('detailGalleryGrid');
    const galeriaDesborda = desborda(gallery);

    // Dejar la descripción abierta (como estaba)
    await abrirPestana('desc');

    return {
      ventana: window.innerWidth,
      pane: pane ? pane.clientWidth : 0,
      ficha: dv.clientWidth,
      ocupaElPanel: pane ? dv.clientWidth >= pane.clientWidth - 20 : false,
      descDesborda,
      versionesDesbordan,
      galeriaDesborda,
      quedaFijaLaBarra: bar ? getComputedStyle(bar).position === 'sticky' : false
    };
  })()`);
}

function fallo(problemas, texto) {
  problemas.push(texto);
  console.error(`  \u2717 ${texto}`);
}

async function main() {
  const limites = [1000, 1120, 1280, 1600, 1920];
  const targets = await listTargets();
  const target = targets.find((t) => (t.url || '').startsWith('http://127.0.0.1:3847')) || targets[0];
  if (!target) throw new Error('No hay ninguna ventana de KoRForge que inspeccionar');

  console.log(`[verificar-ficha] ventana: ${target.url}`);
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  const problemas = [];
  try {
    await cdp.send('Runtime.enable');
    await asegurarFichaAbierta(cdp);

    console.log('[verificar-ficha] scroll de la ficha');
    const scroll = await medirScroll(cdp);
    console.log(`  scrollHeight ${scroll.scrollHeight} / clientHeight ${scroll.clientHeight} · barra ${scroll.barraVisible ? 'visible' : 'AUSENTE'}`);
    if (scroll.overflowY !== 'auto') fallo(problemas, `overflow-y de la ficha es "${scroll.overflowY}" (debería ser auto)`);
    if (!scroll.hayScroll) fallo(problemas, 'la ficha no tiene contenido con scroll (scrollHeight <= clientHeight)');
    if (!scroll.seMueve) fallo(problemas, 'scrollTop no se mueve');
    if (!scroll.llegaAlFondo) fallo(problemas, 'no se llega al final de la ficha');
    if (!scroll.barraVisible) fallo(problemas, 'la barra de scroll no ocupa ancho (¿oculta?)');

    console.log('[verificar-ficha] anchura flexible');
    for (const ancho of limites) {
      const m = await medirAncho(cdp, ancho);
      console.log(`  ventana ${m.ventana} · ficha ${m.ficha} de ${m.pane} · barra fija: ${m.quedaFijaLaBarra ? 'sí' : 'NO'}`);
      if (!m.ocupaElPanel) fallo(problemas, `a ${ancho}px la ficha (${m.ficha}) no ocupa el panel (${m.pane})`);
      if (m.descDesborda) fallo(problemas, `a ${ancho}px la descripción desborda a lo ancho`);
      if (m.versionesDesbordan) fallo(problemas, `a ${ancho}px la lista de versiones desborda`);
      if (m.galeriaDesborda) fallo(problemas, `a ${ancho}px la galería desborda`);
      if (!m.quedaFijaLaBarra) fallo(problemas, `a ${ancho}px la barra de acciones ya no es sticky`);
    }

    // Favoritos: las tarjetas no deben estirarse a lo alto cuando hay pocas
    console.log('[verificar-ficha] tarjetas de Favoritos');
    await cdp.evaluate(`(() => { document.querySelector('.nav-item[data-tab="favorites"]')?.click(); return true; })()`);
    await sleep(2000);
    const fav = await cdp.evaluate(`(() => {
      const grid = document.getElementById('favoritesTabGrid');
      if (!grid) return { sinGrid: true };
      const cards = Array.from(grid.querySelectorAll('.cf-card'));
      const cs = getComputedStyle(grid);
      const filas = cs.gridTemplateRows.split(' ').map(v => parseFloat(v)).filter(n => !Number.isNaN(n));
      return {
        tarjetas: cards.length,
        alignContent: cs.alignContent,
        alturas: cards.map(c => Math.round(c.getBoundingClientRect().height)),
        filaMasAlta: filas.length ? Math.max(...filas) : 0
      };
    })()`);
    if (fav.sinGrid) {
      console.log('  (no hay rejilla de favoritos en esta ventana)');
    } else if (fav.tarjetas === 0) {
      console.log('  sin favoritos guardados: nada que medir');
    } else {
      const maxTarjeta = Math.max(...fav.alturas);
      console.log(`  ${fav.tarjetas} tarjeta(s) · alta máx ${maxTarjeta} px · fila máx ${Math.round(fav.filaMasAlta)} px · align-content: ${fav.alignContent}`);
      if (fav.alignContent !== 'start') fallo(problemas, `las filas de Favoritos se pueden estirar (align-content: ${fav.alignContent})`);
      if (maxTarjeta > 320) fallo(problemas, `una tarjeta de Favoritos mide ${maxTarjeta} px (se está estirando)`);
    }
  } finally {
    try {
      await cdp.send('Emulation.clearDeviceMetricsOverride');
    } catch (_) {}
    cdp.close();
  }

  if (problemas.length > 0) {
    console.error(`\n[verificar-ficha] FALLO: ${problemas.length} problema(s)`);
    process.exitCode = 1;
  } else {
    console.log('\n[verificar-ficha] OK: scroll, anchura flexible y HTML respetado.');
  }
}

main().catch((err) => {
  console.error('[verificar-ficha] ERROR:', err.message);
  process.exitCode = 1;
});
