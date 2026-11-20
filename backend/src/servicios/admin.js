'use strict';
const { ErrorNegocio } = require('../errores');
const { transaccion } = require('../db');
const { CONFIG, haySolapamiento, ventanaValidacion, HORA } = require('../reglas');

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Operaciones del personal del cine: películas, funciones, puerta y reporte (HU10–HU15). */
module.exports = function admin({ db, ahora, c }) {
  const mapPelicula = (r) => ({
    id: r.id, titulo: r.titulo, sinopsis: r.sinopsis, genero: r.genero, duracionMin: r.duracion_min,
    clasificacion: r.clasificacion, colorA: r.color_a, colorB: r.color_b, activa: !!r.activa,
    funcionesFuturas: r.futuras ?? 0,
  });

  /** HU10 */
  function crearPelicula(d = {}) {
    const titulo = String(d.titulo ?? '').trim();
    if (titulo.length < 1 || titulo.length > 80) throw new ErrorNegocio('TITULO_INVALIDO', 'El título es obligatorio (hasta 80 caracteres).');
    const sinopsis = String(d.sinopsis ?? '').trim();
    if (sinopsis.length > 500) throw new ErrorNegocio('SINOPSIS_INVALIDA', 'La sinopsis admite hasta 500 caracteres.');
    const genero = String(d.genero ?? '').trim();
    if (genero.length > 40) throw new ErrorNegocio('GENERO_INVALIDO', 'El género admite hasta 40 caracteres.');
    if (!Number.isInteger(d.duracionMin) || d.duracionMin < 30 || d.duracionMin > 300) {
      throw new ErrorNegocio('DURACION_INVALIDA', 'La duración debe ser un número entero de minutos entre 30 y 300.');
    }
    if (!(d.clasificacion in CONFIG.CLASIFICACIONES)) {
      throw new ErrorNegocio('CLASIFICACION_INVALIDA', `La clasificación debe ser una de: ${Object.keys(CONFIG.CLASIFICACIONES).join(', ')}.`);
    }
    const colorA = d.colorA ?? '#3b2f5c';
    const colorB = d.colorB ?? '#c8553d';
    if (!COLOR_RE.test(colorA) || !COLOR_RE.test(colorB)) throw new ErrorNegocio('COLOR_INVALIDO', 'Los colores deben tener formato #RRGGBB.');

    const id = db.prepare(
      'INSERT INTO peliculas (titulo, sinopsis, genero, duracion_min, clasificacion, color_a, color_b) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(titulo, sinopsis, genero, d.duracionMin, d.clasificacion, colorA, colorB).lastInsertRowid;
    return mapPelicula(db.prepare('SELECT * FROM peliculas WHERE id = ?').get(id));
  }

  function listarPeliculasAdmin() {
    return db.prepare(`
      SELECT p.*, (SELECT COUNT(*) FROM funciones f WHERE f.pelicula_id = p.id AND f.estado = 'programada' AND f.inicio_ms > ?) AS futuras
      FROM peliculas p ORDER BY p.activa DESC, p.titulo`).all(ahora()).map(mapPelicula);
  }

  function listarSalas() {
    return db.prepare('SELECT * FROM salas ORDER BY id').all()
      .map((s) => ({ id: s.id, nombre: s.nombre, filas: s.filas, columnas: s.columnas, capacidad: s.filas * s.columnas }));
  }

  /** HU11 / RN11 */
  function crearFuncion({ peliculaId, salaId, inicio, formato, precioBase } = {}) {
    const pelicula = db.prepare('SELECT * FROM peliculas WHERE id = ? AND activa = 1').get(Number(peliculaId));
    if (!pelicula) throw new ErrorNegocio('PELICULA_NO_ENCONTRADA', 'La película no existe o está dada de baja.', 404);
    const sala = db.prepare('SELECT * FROM salas WHERE id = ?').get(Number(salaId));
    if (!sala) throw new ErrorNegocio('SALA_NO_ENCONTRADA', 'La sala no existe.', 404);

    // La fecha tiene que traer zona horaria (Z o +hh:mm), si no depende de la hora del servidor.
    const inicioMs = typeof inicio === 'number' ? inicio
      : (typeof inicio === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(inicio) ? Date.parse(inicio) : NaN);
    if (!Number.isFinite(inicioMs)) throw new ErrorNegocio('FECHA_INVALIDA', 'La fecha y hora de inicio no son válidas (usá formato ISO con zona horaria).');
    if (inicioMs <= ahora()) throw new ErrorNegocio('FECHA_INVALIDA', 'La función tiene que ser en el futuro.');
    if (!CONFIG.FORMATOS.includes(formato)) throw new ErrorNegocio('FORMATO_INVALIDO', `El formato debe ser uno de: ${CONFIG.FORMATOS.join(', ')}.`);
    if (!Number.isInteger(precioBase) || precioBase < 1000 || precioBase > 100000) {
      throw new ErrorNegocio('PRECIO_INVALIDO', 'El precio base debe ser un número entero de pesos entre 1000 y 100000.');
    }

    return transaccion(db, () => {
      const existentes = db.prepare(`
        SELECT f.inicio_ms AS inicioMs, p.duracion_min AS duracionMin
        FROM funciones f JOIN peliculas p ON p.id = f.pelicula_id
        WHERE f.sala_id = ? AND f.estado = 'programada' AND f.inicio_ms BETWEEN ? AND ?`)
        .all(sala.id, inicioMs - 12 * HORA, inicioMs + 12 * HORA);
      if (haySolapamiento(existentes, { inicioMs, duracionMin: pelicula.duracion_min })) {
        throw new ErrorNegocio('SOLAPAMIENTO', `La función se superpone con otra de ${sala.nombre} (cada función ocupa la sala su duración + 15 min de limpieza).`, 409);
      }
      const id = db.prepare('INSERT INTO funciones (pelicula_id, sala_id, inicio_ms, formato, precio_base) VALUES (?, ?, ?, ?, ?)')
        .run(pelicula.id, sala.id, inicioMs, formato, precioBase).lastInsertRowid;
      return c.obtenerFuncion(Number(id));
    });
  }

  /** HU12 / RN12: anula todas las entradas válidas con reembolso del 100 % y libera las reservas. */
  function cancelarFuncion(funcionId) {
    const f = c.obtenerFuncion(Number(funcionId));
    if (f.estado === 'cancelada') throw new ErrorNegocio('FUNCION_CANCELADA', 'La función ya estaba cancelada.', 409);
    if (f.inicioMs <= ahora()) throw new ErrorNegocio('FUNCION_YA_COMENZO', 'La función ya comenzó: no se puede cancelar.', 422);

    return transaccion(db, () => {
      const validas = db.prepare("SELECT id, precio FROM entradas WHERE funcion_id = ? AND estado = 'valida'").all(f.id);
      const anular = db.prepare("UPDATE entradas SET estado = 'cancelada', reembolso = ?, cancelada_ms = ? WHERE id = ?");
      let monto = 0;
      for (const e of validas) { anular.run(e.precio, ahora(), e.id); monto += e.precio; }
      db.prepare("UPDATE funciones SET estado = 'cancelada' WHERE id = ?").run(f.id);
      db.prepare('DELETE FROM holds WHERE funcion_id = ?').run(f.id);
      return { funcionId: f.id, entradasAnuladas: validas.length, montoReembolsado: monto };
    });
  }

  /** HU15 / RN16 */
  function desactivarPelicula(peliculaId) {
    const p = db.prepare('SELECT * FROM peliculas WHERE id = ?').get(Number(peliculaId));
    if (!p) throw new ErrorNegocio('PELICULA_NO_ENCONTRADA', 'La película no existe.', 404);
    const ventas = db.prepare(`
      SELECT COUNT(*) AS n FROM entradas e JOIN funciones f ON f.id = e.funcion_id
      WHERE f.pelicula_id = ? AND f.estado = 'programada' AND f.inicio_ms > ? AND e.estado <> 'cancelada'`).get(p.id, ahora()).n;
    if (ventas > 0) {
      throw new ErrorNegocio('PELICULA_CON_VENTAS', 'No se puede dar de baja: tiene entradas vendidas para funciones futuras. Cancelá esas funciones primero.', 409);
    }
    return transaccion(db, () => {
      const futuras = db.prepare("SELECT id FROM funciones WHERE pelicula_id = ? AND estado = 'programada' AND inicio_ms > ?").all(p.id, ahora());
      for (const f of futuras) {
        db.prepare("UPDATE funciones SET estado = 'cancelada' WHERE id = ?").run(f.id);
        db.prepare('DELETE FROM holds WHERE funcion_id = ?').run(f.id);
      }
      db.prepare('UPDATE peliculas SET activa = 0 WHERE id = ?').run(p.id);
      return { id: p.id, activa: false, funcionesCanceladas: futuras.length };
    });
  }

  /** HU13 / RN13: el personal valida el código en la puerta. La entrada pasa a "usada". */
  function validarEntrada(codigo) {
    const cod = String(codigo ?? '').trim().toUpperCase();
    const e = cod && db.prepare('SELECT * FROM entradas WHERE codigo = ?').get(cod);
    if (!e) throw new ErrorNegocio('ENTRADA_NO_ENCONTRADA', 'No existe ninguna entrada con ese código.', 404);
    const f = c.obtenerFuncion(e.funcion_id);

    if (e.estado === 'cancelada' || f.estado === 'cancelada') {
      throw new ErrorNegocio('ENTRADA_ANULADA', 'La entrada fue cancelada: no es válida.', 410);
    }
    if (e.estado === 'usada') {
      throw new ErrorNegocio('YA_USADA', 'Esta entrada ya fue usada. No puede ingresar de nuevo.', 409);
    }
    const { desdeMs, hastaMs } = ventanaValidacion(f.inicioMs, f.duracionMin);
    if (ahora() < desdeMs || ahora() > hastaMs) {
      throw new ErrorNegocio('FUERA_DE_HORARIO', 'La entrada es de otro horario: se acepta desde 60 minutos antes del inicio hasta que termina la función.', 422);
    }
    db.prepare("UPDATE entradas SET estado = 'usada', usada_ms = ? WHERE id = ? AND estado = 'valida'").run(ahora(), e.id);
    return {
      id: e.id, codigo: e.codigo, estado: 'usada', butaca: e.butaca, tipo: e.tipo,
      pelicula: f.titulo, sala: f.sala, inicioMs: f.inicioMs, formato: f.formato,
    };
  }

  /** HU14: ocupación y recaudación neta (ventas menos reembolsos) por función. */
  function reporte() {
    const filas = db.prepare(`
      SELECT f.id, f.inicio_ms, f.estado, f.formato, p.titulo, s.nombre AS sala, s.filas * s.columnas AS capacidad,
        COALESCE(SUM(CASE WHEN e.estado IN ('valida','usada') THEN 1 ELSE 0 END), 0) AS vendidas,
        COALESCE(SUM(CASE WHEN e.estado = 'usada' THEN 1 ELSE 0 END), 0) AS usadas,
        COALESCE(SUM(CASE WHEN e.estado = 'cancelada' THEN 1 ELSE 0 END), 0) AS canceladas,
        COALESCE(SUM(e.precio - e.reembolso), 0) AS neta,
        COALESCE(SUM(e.reembolso), 0) AS reembolsado
      FROM funciones f
      JOIN peliculas p ON p.id = f.pelicula_id
      JOIN salas s ON s.id = f.sala_id
      LEFT JOIN entradas e ON e.funcion_id = f.id
      GROUP BY f.id
      ORDER BY f.inicio_ms DESC`).all();

    const funciones = filas.map((r) => ({
      funcionId: r.id, titulo: r.titulo, sala: r.sala, formato: r.formato, inicioMs: r.inicio_ms, estado: r.estado,
      capacidad: r.capacidad, vendidas: r.vendidas, usadas: r.usadas, canceladas: r.canceladas,
      ocupacion: Math.round((r.vendidas / r.capacidad) * 10000) / 100,
      recaudacionNeta: r.neta, reembolsado: r.reembolsado,
    }));
    const totales = funciones.reduce((t, f) => ({
      entradasVendidas: t.entradasVendidas + f.vendidas,
      recaudacionNeta: t.recaudacionNeta + f.recaudacionNeta,
      reembolsado: t.reembolsado + f.reembolsado,
    }), { entradasVendidas: 0, recaudacionNeta: 0, reembolsado: 0 });
    return { funciones, totales };
  }

  return {
    crearPelicula, listarPeliculasAdmin, listarSalas, crearFuncion, cancelarFuncion, desactivarPelicula,
    validarEntrada, reporte,
  };
};
