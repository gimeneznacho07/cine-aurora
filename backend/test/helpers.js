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

// ---- Datos de prueba insertados directo en la base (para no depender de servicios que se construyen después) ----

function nuevaSala(db, nombre = 'Sala 1', filas = 8, columnas = 10) {
  return Number(db.prepare('INSERT INTO salas (nombre, filas, columnas) VALUES (?, ?, ?)').run(nombre, filas, columnas).lastInsertRowid);
}

function nuevaPelicula(db, o = {}) {
  const p = { titulo: 'La Última Frontera', genero: 'Ciencia ficción', duracionMin: 120, clasificacion: 'ATP', activa: 1, ...o };
  return Number(db.prepare(
    'INSERT INTO peliculas (titulo, sinopsis, genero, duracion_min, clasificacion, activa) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(p.titulo, 'Sinopsis de prueba', p.genero, p.duracionMin, p.clasificacion, p.activa).lastInsertRowid);
}

function nuevaFuncion(db, { peliculaId, salaId, inicioMs, precioBase = 8000, formato = '2D', estado = 'programada' }) {
  return Number(db.prepare(
    'INSERT INTO funciones (pelicula_id, sala_id, inicio_ms, formato, precio_base, estado) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(peliculaId, salaId, inicioMs, formato, precioBase, estado).lastInsertRowid);
}

/** Sala + película + una función el viernes 20/11/2026 a las 21:00 (AR). Devuelve los ids. */
function escenarioBasico(db, { clasificacion = 'ATP', duracionMin = 120, inicioMs = ar(2026, 11, 20, 21, 0), precioBase = 8000, filas = 8, columnas = 10 } = {}) {
  const salaId = nuevaSala(db, 'Sala 1', filas, columnas);
  const peliculaId = nuevaPelicula(db, { clasificacion, duracionMin });
  const funcionId = nuevaFuncion(db, { peliculaId, salaId, inicioMs, precioBase });
  return { salaId, peliculaId, funcionId, inicioMs };
}

let contadorCodigos = 0;
/** Deja una butaca vendida (entrada válida) directamente en la base. */
function ocuparButaca(db, funcionId, butaca, usuarioId) {
  const compraId = Number(db.prepare(
    "INSERT INTO compras (usuario_id, funcion_id, total, tarjeta_ultimos4, creada_ms) VALUES (?, ?, 8000, '1111', 1)",
  ).run(usuarioId, funcionId).lastInsertRowid);
  contadorCodigos += 1;
  db.prepare("INSERT INTO entradas (compra_id, funcion_id, butaca, tipo, precio, codigo) VALUES (?, ?, ?, 'general', 8000, ?)")
    .run(compraId, funcionId, butaca, `CA-T${String(contadorCodigos).padStart(7, '0')}`);
}

/** Predicado para assert.throws: error de negocio con ese código (y opcionalmente ese status). */
const esError = (codigo, status) => (e) => {
  assert.equal(e.codigo, codigo, `se esperaba el error ${codigo} pero fue ${e.codigo ?? e.message}`);
  if (status !== undefined) assert.equal(e.status, status);
  return true;
};

module.exports = {
  MIN, HORA, ar, AHORA, crearEntorno, datosUsuario, esError, inicioDiaAR,
  nuevaSala, nuevaPelicula, nuevaFuncion, escenarioBasico, ocuparButaca,
};
