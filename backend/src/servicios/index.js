'use strict';
const comun = require('./comun');
const usuarios = require('./usuarios');
const catalogo = require('./catalogo');
const reservas = require('./reservas');
const compras = require('./compras');
const admin = require('./admin');

/** Compone todos los casos de uso con las mismas dependencias (base de datos, reloj y secreto). */
function crearServicios({ db, ahora = Date.now, secreto }) {
  if (!secreto) throw new Error('Falta el secreto para firmar sesiones (TOKEN_SECRET).');
  const ctx = { db, ahora, secreto };
  ctx.c = comun(ctx);
  return {
    ...usuarios(ctx),
    ...catalogo(ctx),
    ...reservas(ctx),
    ...compras(ctx),
    ...admin(ctx),
  };
}

module.exports = { crearServicios };
