'use strict';

/**
 * Nombres seguros para rutas que llegan del cliente (auditoría 22-10-2026, K2 y K4).
 *
 * El API local recibe `folderName` (addons) y `fileName` (backups) desde el renderer. Con
 * `path.join(dir, nombre)` un `..\..\algo` o un `/etc/...` se escapa del directorio previsto:
 * `fs.rmSync` borraba carpetas arbitrarias y `AdmZip.extractAllTo` podía escribir fuera. Aquí se
 * decide si un nombre es UN SEGMENTO de ruta (una sola carpeta o un fichero .zip) y si una ruta
 * resuelta sigue dentro de su base.
 */

const path = require('path');

/** ¿Es un nombre de una sola carpeta que Windows acepta (sin separadores ni apuntes a padres)? */
function esNombreDeCarpetaValido(nombre) {
  if (typeof nombre !== 'string' || nombre.length === 0 || nombre.length > 200) return false;
  if (nombre === '.' || nombre === '..') return false;
  if (/[\\/:*?"<>|\x00-\x1f]/.test(nombre)) return false;
  if (path.basename(nombre) !== nombre) return false;
  return true;
}

/** ¿Es un nombre de backup válido: una sola carpeta/fichero con extensión .zip? */
function esNombreDeBackupValido(nombre) {
  return esNombreDeCarpetaValido(nombre) && /^[^.].*\.zip$/i.test(nombre);
}

/** ¿La ruta `destino`, resuelta, queda dentro de `base` (o es ella misma)? */
function estaDentroDe(base, destino) {
  const raiz = path.resolve(base) + path.sep;
  const ruta = path.resolve(destino);
  return ruta === path.resolve(base) || ruta.startsWith(raiz);
}

module.exports = { esNombreDeCarpetaValido, esNombreDeBackupValido, estaDentroDe };
