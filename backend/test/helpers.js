'use strict';
const assert = require('node:assert/strict');
const { abrirDb } = require('../src/db');
const { crearServicios } = require('../src/servicios');
const { inicioDiaAR } = require('../src/reglas');

const MIN = 60 * 1000;
const HORA = 60 * MIN;

/** Instante en hora de Argentina (UTC-3). */
const ar = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h + 3, mi);

/** "Ahora" de los tests: jueves 19/11/2026 15:00 (hora de Argentina). */
const AHORA = ar(2026, 11, 19, 15, 0);

/** Entorno aislado: base en memoria + reloj falso + servicios. */
function crearEntorno() {
  const db = abrirDb(':memory:');
  const reloj = { t: AHORA };
  const s = crearServicios({ db, ahora: () => reloj.t, secreto: 'secreto-de-test' });
  return { db, reloj, s };
}

const datosUsuario = (o = {}) => ({
  nombre: 'Ana Pérez', email: 'ana@test.com', password: 'clave1234', fechaNacimiento: '1995-05-10', ...o,
});

/** Predicado para assert.throws: error de negocio con ese código (y opcionalmente ese status). */
const esError = (codigo, status) => (e) => {
  assert.equal(e.codigo, codigo, `se esperaba el error ${codigo} pero fue ${e.codigo ?? e.message}`);
  if (status !== undefined) assert.equal(e.status, status);
  return true;
};

module.exports = { MIN, HORA, ar, AHORA, crearEntorno, datosUsuario, esError, inicioDiaAR };
