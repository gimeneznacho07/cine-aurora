'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirDb, transaccion } = require('../src/db');

function baseConFuncion() {
  const db = abrirDb(':memory:');
  db.prepare("INSERT INTO usuarios (nombre,email,pass_hash,fecha_nac) VALUES ('Ana','ana@test.com','x','2000-01-01')").run();
  db.prepare("INSERT INTO salas (nombre,filas,columnas) VALUES ('Sala 1',8,10)").run();
  db.prepare("INSERT INTO peliculas (titulo,sinopsis,genero,duracion_min,clasificacion,color_a,color_b) VALUES ('P','s','g',100,'ATP','#000','#fff')").run();
  db.prepare("INSERT INTO funciones (pelicula_id,sala_id,inicio_ms,formato,precio_base) VALUES (1,1,1000,'2D',8000)").run();
  db.prepare('INSERT INTO compras (usuario_id,funcion_id,total,tarjeta_ultimos4,creada_ms) VALUES (1,1,8000,\'1111\',1)').run();
  return db;
}
const insertarEntrada = (db, butaca, codigo, estado = 'valida') =>
  db.prepare('INSERT INTO entradas (compra_id,funcion_id,butaca,tipo,precio,codigo,estado) VALUES (1,1,?,\'general\',8000,?,?)').run(butaca, codigo, estado);

test('RN1: la base rechaza vender dos veces la misma butaca de una función', () => {
  const db = baseConFuncion();
  insertarEntrada(db, 'A1', 'CA-00000001');
  assert.throws(() => insertarEntrada(db, 'A1', 'CA-00000002'), /UNIQUE/);
});

test('RN1: una butaca cancelada puede volver a venderse', () => {
  const db = baseConFuncion();
  insertarEntrada(db, 'A1', 'CA-00000001', 'cancelada');
  assert.doesNotThrow(() => insertarEntrada(db, 'A1', 'CA-00000002'));
});

test('RN1: la misma butaca en otra función no es conflicto', () => {
  const db = baseConFuncion();
  db.prepare("INSERT INTO funciones (pelicula_id,sala_id,inicio_ms,formato,precio_base) VALUES (1,1,99999999,'2D',8000)").run();
  insertarEntrada(db, 'A1', 'CA-00000001');
  assert.doesNotThrow(() =>
    db.prepare("INSERT INTO entradas (compra_id,funcion_id,butaca,tipo,precio,codigo) VALUES (1,2,'A1','general',8000,'CA-00000009')").run());
});

test('RN13: el código de entrada es único', () => {
  const db = baseConFuncion();
  insertarEntrada(db, 'A1', 'CA-00000001');
  assert.throws(() => insertarEntrada(db, 'A2', 'CA-00000001'), /UNIQUE/);
});

test('transaccion: si algo falla se revierte todo', () => {
  const db = baseConFuncion();
  assert.throws(() => transaccion(db, () => {
    insertarEntrada(db, 'B1', 'CA-00000003');
    throw new Error('falla a mitad de camino');
  }), /falla a mitad/);
  const n = db.prepare('SELECT COUNT(*) AS n FROM entradas').get().n;
  assert.equal(n, 0);
});

test('transaccion: si todo sale bien se confirma y devuelve el resultado', () => {
  const db = baseConFuncion();
  const r = transaccion(db, () => { insertarEntrada(db, 'B1', 'CA-00000003'); return 'listo'; });
  assert.equal(r, 'listo');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entradas').get().n, 1);
});

test('el esquema valida estados y tipos permitidos', () => {
  const db = baseConFuncion();
  assert.throws(() => insertarEntrada(db, 'C1', 'CA-00000004', 'inventado'));
});
