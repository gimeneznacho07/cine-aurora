'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  fecha_nac TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'cliente' CHECK (rol IN ('cliente','admin'))
);

CREATE TABLE IF NOT EXISTS salas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  filas INTEGER NOT NULL CHECK (filas BETWEEN 1 AND 26),
  columnas INTEGER NOT NULL CHECK (columnas BETWEEN 1 AND 99)
);

CREATE TABLE IF NOT EXISTS peliculas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  sinopsis TEXT NOT NULL DEFAULT '',
  genero TEXT NOT NULL DEFAULT '',
  duracion_min INTEGER NOT NULL CHECK (duracion_min BETWEEN 30 AND 300),
  clasificacion TEXT NOT NULL CHECK (clasificacion IN ('ATP','+13','+16','+18')),
  color_a TEXT NOT NULL DEFAULT '#3b2f5c',
  color_b TEXT NOT NULL DEFAULT '#c8553d',
  activa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS funciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pelicula_id INTEGER NOT NULL REFERENCES peliculas(id),
  sala_id INTEGER NOT NULL REFERENCES salas(id),
  inicio_ms INTEGER NOT NULL,
  formato TEXT NOT NULL CHECK (formato IN ('2D','3D')),
  precio_base INTEGER NOT NULL CHECK (precio_base > 0),
  estado TEXT NOT NULL DEFAULT 'programada' CHECK (estado IN ('programada','cancelada'))
);
CREATE INDEX IF NOT EXISTS idx_funciones_inicio ON funciones(inicio_ms);
CREATE INDEX IF NOT EXISTS idx_funciones_pelicula ON funciones(pelicula_id);

-- Reservas temporales (RN2). Una por usuario (RN4).
CREATE TABLE IF NOT EXISTS holds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  funcion_id INTEGER NOT NULL REFERENCES funciones(id),
  butacas TEXT NOT NULL,
  expira_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_holds_funcion ON holds(funcion_id);
CREATE INDEX IF NOT EXISTS idx_holds_usuario ON holds(usuario_id);

CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  funcion_id INTEGER NOT NULL REFERENCES funciones(id),
  total INTEGER NOT NULL,
  tarjeta_ultimos4 TEXT NOT NULL,
  creada_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS entradas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id),
  funcion_id INTEGER NOT NULL REFERENCES funciones(id),
  butaca TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('general','reducida')),
  precio INTEGER NOT NULL,
  codigo TEXT NOT NULL UNIQUE,
  estado TEXT NOT NULL DEFAULT 'valida' CHECK (estado IN ('valida','usada','cancelada')),
  reembolso INTEGER NOT NULL DEFAULT 0,
  usada_ms INTEGER,
  cancelada_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_entradas_funcion ON entradas(funcion_id);

-- RN1: a lo sumo UNA entrada no cancelada por (función, butaca). La base lo garantiza aunque el código falle.
CREATE UNIQUE INDEX IF NOT EXISTS idx_butaca_unica
  ON entradas(funcion_id, butaca) WHERE estado <> 'cancelada';
`;

/** Abre (y crea si hace falta) la base. `ruta` puede ser ':memory:' para tests. */
function abrirDb(ruta) {
  if (ruta !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(ruta)), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA foreign_keys = ON;');
  if (ruta !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(ESQUEMA);
  return db;
}

/** Ejecuta `fn` dentro de una transacción: si lanza, se revierte todo. No se puede anidar. */
function transaccion(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** ¿El error es una violación de UNIQUE de SQLite? */
function esViolacionUnica(e) {
  return typeof e?.message === 'string' && e.message.includes('UNIQUE constraint failed');
}

module.exports = { abrirDb, transaccion, esViolacionUnica };
