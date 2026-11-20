'use strict';
const { ErrorNegocio } = require('../errores');
const { MIN, ventaAbierta } = require('../reglas');

const SELECT_FUNCION = `
  SELECT f.id, f.pelicula_id, f.sala_id, f.inicio_ms, f.formato, f.precio_base, f.estado,
         p.titulo, p.duracion_min, p.clasificacion, p.genero, p.color_a, p.color_b, p.activa,
         s.nombre AS sala, s.filas, s.columnas
  FROM funciones f
  JOIN peliculas p ON p.id = f.pelicula_id
  JOIN salas s ON s.id = f.sala_id`;

/** Consultas y conversiones que comparten varios casos de uso. */
module.exports = function comun({ db, ahora }) {
  function mapFuncion(r) {
    return {
      id: r.id,
      peliculaId: r.pelicula_id,
      titulo: r.titulo,
      genero: r.genero,
      clasificacion: r.clasificacion,
      duracionMin: r.duracion_min,
      colorA: r.color_a,
      colorB: r.color_b,
      salaId: r.sala_id,
      sala: r.sala,
      filas: r.filas,
      columnas: r.columnas,
      capacidad: r.filas * r.columnas,
      formato: r.formato,
      precioBase: r.precio_base,
      inicioMs: r.inicio_ms,
      finMs: r.inicio_ms + r.duracion_min * MIN,
      estado: r.estado,
      ventaAbierta: r.estado === 'programada' && ventaAbierta(r.inicio_ms, ahora()),
    };
  }

  function obtenerFuncion(id) {
    const r = db.prepare(`${SELECT_FUNCION} WHERE f.id = ?`).get(id);
    if (!r) throw new ErrorNegocio('FUNCION_NO_ENCONTRADA', 'La función no existe.', 404);
    return mapFuncion(r);
  }

  function limpiarReservasVencidas() {
    db.prepare('DELETE FROM holds WHERE expira_ms <= ?').run(ahora());
  }

  /** Butacas con entrada no cancelada (RN1). */
  function butacasOcupadas(funcionId) {
    return new Set(
      db.prepare("SELECT butaca FROM entradas WHERE funcion_id = ? AND estado <> 'cancelada'").all(funcionId).map((r) => r.butaca),
    );
  }

  /** Butacas con reserva vigente (RN2): Map butaca -> id del usuario que la tiene. */
  function butacasReservadas(funcionId) {
    const mapa = new Map();
    const filas = db.prepare('SELECT usuario_id, butacas FROM holds WHERE funcion_id = ? AND expira_ms > ?').all(funcionId, ahora());
    for (const h of filas) for (const b of JSON.parse(h.butacas)) mapa.set(b, h.usuario_id);
    return mapa;
  }

  return { SELECT_FUNCION, mapFuncion, obtenerFuncion, limpiarReservasVencidas, butacasOcupadas, butacasReservadas };
};
