'use strict';

/**
 * Cuenta de KoRForge: la app no arranca «de serie», pregunta a la web por esta cuenta
 * (dueño, 22/23-10-2026: «la app va a llamar a la web y preguntarle si ese usuario está
 * registrado; si lo está, podrá usar la app; si no, se bloquea»; y «nada de login y pass,
 * solo google oauth»).
 *
 * La web es centolos.org (la misma cuenta que en la web y en la porra). ÚNICA entrada: Google:
 *
 *   - Google:     POST /api/korforge/start → state; se abre el navegador en
 *                 centolos.org/korforge-login?state=…; el usuario entra en la web con Google y
 *                 confirma; la app sondea GET /api/korforge/pending?state=…
 *   - validación: GET /api/korforge/session (Bearer token) → { ok, permitido, user }
 *
 * El token se guarda en userData/sesion.json (cifrado con DPAPI si el sistema lo permite).
 * Solo se permite el uso de la app si la web dice que la cuenta está en la whitelist.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WEB_URL = (process.env.KORFORGE_WEB_URL || 'https://centolos.org').replace(/\/+$/, '');
const USER_DATA_DIR = process.env.KORFORGE_USER_DATA || path.join(process.env.APPDATA || '', 'KoRForge');
const SESION_FILE = path.join(USER_DATA_DIR, 'sesion.json');
const TIMEOUT_MS = 8000;

let cifrado = null;
try {
  const { safeStorage } = require('electron');
  if (safeStorage && safeStorage.isEncryptionAvailable && safeStorage.isEncryptionAvailable()) {
    cifrado = safeStorage;
  }
} catch (_) { /* sin Electron (p. ej. `node server.js` de pruebas): token en claro */ }

/** Estado vivo de la sesión (lo lee el servidor interno y la ventana). */
let estado = { token: '', usuario: null, permitido: false, validado: 0 };
/** Estado pendiente del login con Google (un intento a la vez). */
let google = { state: '', creado: 0 };
let redOk = true;

function asegurarCarpeta() {
  try { fs.mkdirSync(USER_DATA_DIR, { recursive: true }); } catch (_) {}
}

/** fetch con tiempo máximo, para no colgar la app si la web no responde. */
async function pedir(url, opciones = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opciones,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'KoRForge-App/1.0 (Windows NT 10.0; Win64; x64)',
        ...(opciones.headers || {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

/** Un fallo de red no revoca la sesión (la web podría estar caída); un 401 sí. */
async function leerJsonSeguro(res) {
  try { return await res.json(); } catch (_) { return null; }
}

async function leerSesionGuardada() {
  try {
    if (!fs.existsSync(SESION_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(SESION_FILE, 'utf-8'));
    let token = '';
    if (raw && raw.cifrado) {
      if (!cifrado) return null; /* cifrado y sin DPAPI: no se puede leer */
      token = cifrado.decryptString(Buffer.from(String(raw.dato || ''), 'base64'));
    } else {
      token = String(raw && raw.token || '');
    }
    if (!token) return null;
    return { token, usuario: (raw && raw.usuario) || null };
  } catch (_) {
    return null;
  }
}

function guardarSesionEnDisco() {
  asegurarCarpeta();
  try {
    if (!estado.token) {
      if (fs.existsSync(SESION_FILE)) fs.unlinkSync(SESION_FILE);
      return;
    }
    let raw;
    if (cifrado) {
      raw = { cifrado: true, dato: cifrado.encryptString(estado.token).toString('base64'), usuario: estado.usuario };
    } else {
      raw = { cifrado: false, token: estado.token, usuario: estado.usuario };
    }
    fs.writeFileSync(SESION_FILE, JSON.stringify(raw, null, 2), 'utf8');
  } catch (_) { /* si no se puede guardar, la sesión dura lo que dure la app */ }
}

/**
 * Arranque: carga la sesión guardada y la valida contra la web.
 * Devuelve { logeado, permitido, usuario } además de `redOk` (false si la web no respondió).
 */
async function iniciar() {
  const guardada = await leerSesionGuardada();
  if (!guardada) return { ...estado, logeado: false, redOk: false };

  estado.token = guardada.token;
  estado.usuario = guardada.usuario;
  estado.permitido = false; /* hasta que la web lo confirme */

  const res = await validarConWeb(guardada.token);
  if (res === 'revocado') {
    estado = { token: '', usuario: null, permitido: false, validado: 0 };
    guardarSesionEnDisco();
    return { ...estado, logeado: false, redOk: true };
  }
  if (res === 'sin-red') {
    /* Sin conexión: se permite arrancar con la sesión de antes (sin llamadas a la web no hay
       forma de saber si le han quitado el permiso; la próxima validación lo comprobará). */
    estado.permitido = true;
    estado.validado = Date.now();
    redOk = false;
    return { ...estado, logeado: !!estado.token, redOk: false };
  }
  /* valida: res trae { ok, permitido, user } */
  redOk = true;
  estado.permitido = !!res.permitido;
  estado.usuario = (res.user && { name: res.user.name }) || estado.usuario;
  estado.validado = Date.now();
  if (!estado.permitido) {
    /* Mejor dejarlo fuera con mensaje claro que dentro a medias. El token se conserva por si
       el dueño le añade a la lista y no tiene que volver a escribir la contraseña. */
    guardarSesionEnDisco();
    return { ...estado, logeado: !!estado.token, redOk: true };
  }
  guardarSesionEnDisco();
  return { ...estado, logeado: !!estado.token, redOk: true };
}

async function validarConWeb(token) {
  try {
    const res = await pedir(`${WEB_URL}/api/korforge/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 || res.status === 403) return 'revocado';
    if (!res.ok) return 'sin-red';
    const data = await leerJsonSeguro(res);
    if (!data || !data.ok) return 'sin-red';
    return data;
  } catch (_) {
    return 'sin-red';
  }
}

/** Inicia el login con Google: devuelve el state y la URL que se abre en el navegador. */
async function iniciarGoogle() {
  try {
    const res = await pedir(`${WEB_URL}/api/korforge/start`, { method: 'POST' });
    const data = await leerJsonSeguro(res);
    if (!res.ok || !data || !data.ok || !data.state) {
      return { ok: false, error: 'No se pudo iniciar el login con Google. Inténtalo de nuevo.' };
    }
    redOk = true;
    google = { state: data.state, creado: Date.now() };
    return { ok: true, state: data.state, url: `${WEB_URL}/korforge-login?state=${encodeURIComponent(data.state)}` };
  } catch (_) {
    redOk = false;
    return { ok: false, error: 'No se pudo conectar con centolos.org. Comprueba tu conexión.' };
  }
}

/** Sondeo del login con Google. Devuelve { ok, ready, permitido, usuario, error }. */
async function sondearGoogle(state) {
  const s = String(state || google.state || '');
  if (!s) return { ok: false, ready: false, error: 'Vuelve a empezar el login con Google.' };
  try {
    const res = await pedir(`${WEB_URL}/api/korforge/pending?state=${encodeURIComponent(s)}`);
    const data = await leerJsonSeguro(res);
    if (!res.ok || !data || !data.ok) return { ok: false, ready: false };
    redOk = true;
    if (!data.ready) return { ok: true, ready: false };
    estado.token = String(data.token || '');
    estado.permitido = !!data.permitido;
    estado.usuario = (data.user && { name: data.user.name }) || estado.usuario || null;
    estado.validado = Date.now();
    guardarSesionEnDisco();
    google = { state: '', creado: 0 };
    if (estado.token && !estado.usuario) {
      /* La web no manda el nombre en /pending: se pide con /session */
      const r = await validarConWeb(estado.token);
      if (r && r.user) estado.usuario = { name: r.user.name };
    }
    return { ok: true, ready: true, permitido: estado.permitido, usuario: estado.usuario };
  } catch (_) {
    redOk = false;
    return { ok: false, ready: false };
  }
}

/** Revalida la sesión con la web. Devuelve { revocado } si hay que volver a bloquear. */
async function validar() {
  if (!estado.token) return { revocado: false, redOk: false };
  const r = await validarConWeb(estado.token);
  if (r === 'sin-red') { redOk = false; return { revocado: false, redOk: false }; }
  redOk = true;
  if (r === 'revocado') {
    estado.token = '';
    estado.usuario = null;
    estado.permitido = false;
    guardarSesionEnDisco();
    return { revocado: true, redOk: true };
  }
  estado.permitido = !!r.permitido;
  if (r.user) estado.usuario = { name: r.user.name };
  estado.validado = Date.now();
  if (!estado.permitido) {
    /* Ya no está en la whitelist: bloqueo inmediato. */
    return { revocado: true, redOk: true };
  }
  return { revocado: false, redOk: true, usuario: estado.usuario };
}

/** ¿Está la app autorizada para funcionar? (lo pregunta el servidor interno). */
function autorizado() {
  return !!(estado.token && estado.permitido);
}

/** El token para las llamadas a la web (descargas y actualizaciones). */
function token() {
  return estado.token;
}

function estadoActual() {
  return { logeado: !!estado.token, permitido: !!estado.permitido, usuario: estado.usuario, redOk };
}

async function salir() {
  estado = { token: '', usuario: null, permitido: false, validado: 0 };
  google = { state: '', creado: 0 };
  guardarSesionEnDisco();
  return { ok: true };
}

module.exports = {
  WEB_URL,
  iniciar,
  iniciarGoogle,
  sondearGoogle,
  validar,
  autorizado,
  token,
  estadoActual,
  salir,
};
