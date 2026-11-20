'use strict';
const usuarios = require('./usuarios');

/** Compone todos los casos de uso con las mismas dependencias (base de datos, reloj y secreto). */
function crearServicios({ db, ahora = Date.now, secreto }) {
  if (!secreto) throw new Error('Falta el secreto para firmar sesiones (TOKEN_SECRET).');
  const ctx = { db, ahora, secreto };
  return {
    ...usuarios(ctx),
  };
}

module.exports = { crearServicios };
