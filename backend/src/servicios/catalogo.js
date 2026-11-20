'use strict';
const { ErrorNegocio } = require('../errores');
const { calcularPrecio, esPremium, fechaIsoValida, inicioDiaAR, HORA, CONFIG } = require('../reglas');

/** Cartelera, funciones y mapa de butacas (HU1, HU2, HU3). Solo lectura. */
module.exports = function catalogo({ db, ahora, c }) {
  const letra = (i) => String.fromCharCode(65 + i);

  function mapPelicula(r) {
    return {
      id: r.id, titulo: r.titulo, sinopsis: r.sinopsis, genero: r.genero, duracionMin: r.duracion_min,
      clasificacion: r.clasificacion, colorA: r.color_a, colorB: r.color_b, activa: !!r.activa,
      proximaFuncionMs: r.proxima ?? null,
    };
  }

  /** HU1 / RN16: películas activas con al menos una función futura programada. */
  function listarPeliculas() {
    return db.prepare(`
      SELECT p.*, (SELECT MIN(f.inicio_ms) FROM funciones f
                   WHERE f.pelicula_id = p.id AND f.estado = 'programada' AND f.inicio_ms > ?) AS proxima
      FROM peliculas p
      WHERE p.activa = 1 AND proxima IS NOT NULL
      ORDER BY proxima, p.titulo`).all(ahora()).map(mapPelicula);
  }

  function obtenerPelicula(id) {
    const r = db.prepare(`
      SELECT p.*, (SELECT MIN(f.inicio_ms) FROM funciones f
                   WHERE f.pelicula_id = p.id AND f.estado = 'programada' AND f.inicio_ms > ?) AS proxima
      FROM peliculas p WHERE p.id = ? AND p.activa = 1`).get(ahora(), id);
    if (!r) throw new ErrorNegocio('PELICULA_NO_ENCONTRADA', 'La película no existe.', 404);
    return mapPelicula(r);
  }

  function disponibles(f) {
    return f.capacidad - c.butacasOcupadas(f.id).size - c.butacasReservadas(f.id).size;
  }

  /** HU2: funciones futuras programadas, ordenadas, opcionalmente de una película y/o de un día (AR). */
  function listarFunciones({ peliculaId, fecha } = {}) {
    const condiciones = ["f.estado = 'programada'", 'p.activa = 1', 'f.inicio_ms > ?'];
    const params = [ahora()];
    if (peliculaId !== undefined && peliculaId !== null && peliculaId !== '') {
      condiciones.push('f.pelicula_id = ?');
      params.push(Number(peliculaId));
    }
    if (fecha) {
      if (!fechaIsoValida(fecha)) throw new ErrorNegocio('FECHA_INVALIDA', 'La fecha debe tener formato AAAA-MM-DD.');
      const [a, m, d] = fecha.split('-').map(Number);
      const desde = inicioDiaAR(a, m, d);
      condiciones.push('f.inicio_ms >= ? AND f.inicio_ms < ?');
      params.push(desde, desde + 24 * HORA);
    }
    const filas = db.prepare(`${c.SELECT_FUNCION} WHERE ${condiciones.join(' AND ')} ORDER BY f.inicio_ms, f.id`).all(...params);
    return filas.map((r) => {
      const f = c.mapFuncion(r);
      return {
        ...f,
        disponibles: disponibles(f),
        precioDesde: calcularPrecio({ precioBase: f.precioBase, premium: false, tipo: 'general', inicioMs: f.inicioMs }),
      };
    });
  }

  /** HU3: mapa de butacas con su estado. `usuario` (opcional) permite marcar "mia" a las reservadas por él. */
  function detalleFuncion(id, usuario) {
    const f = c.obtenerFuncion(id);
    const ocupadas = c.butacasOcupadas(id);
    const reservadas = c.butacasReservadas(id);
    const butacas = {};
    for (let i = 0; i < f.filas; i++) {
      for (let col = 1; col <= f.columnas; col++) {
        const b = `${letra(i)}${col}`;
        if (ocupadas.has(b)) butacas[b] = 'ocupada';
        else if (reservadas.has(b)) butacas[b] = usuario && reservadas.get(b) === usuario.id ? 'mia' : 'reservada';
        else butacas[b] = 'libre';
      }
    }
    const precio = (premium, tipo) => calcularPrecio({ precioBase: f.precioBase, premium, tipo, inicioMs: f.inicioMs });
    const filasLetras = Array.from({ length: f.filas }, (_, i) => letra(i));
    return {
      funcion: f,
      filas: filasLetras,
      columnas: f.columnas,
      filasPremium: filasLetras.filter((l) => esPremium(`${l}1`, f.filas, f.columnas)),
      butacas,
      precios: {
        general: precio(false, 'general'),
        premium: precio(true, 'general'),
        reducida: precio(false, 'reducida'),
        reducidaPremium: precio(true, 'reducida'),
      },
      disponibles: f.capacidad - ocupadas.size - reservadas.size,
      reservaMs: CONFIG.RESERVA_MS,
    };
  }

  return { listarPeliculas, obtenerPelicula, listarFunciones, detalleFuncion };
};
