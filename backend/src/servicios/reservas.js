'use strict';
const { ErrorNegocio } = require('../errores');
const { transaccion } = require('../db');
const { CONFIG, parsearButaca, esPremium, calcularPrecio } = require('../reglas');

/** Reserva temporal de butacas (HU6: RN1–RN4, RN8, RN9). */
module.exports = function reservas({ db, ahora, c }) {
  function validarButacas(f, butacas) {
    if (!Array.isArray(butacas) || butacas.length === 0) {
      throw new ErrorNegocio('BUTACAS_REQUERIDAS', 'Elegí al menos una butaca.');
    }
    if (butacas.length > CONFIG.MAX_ENTRADAS) {
      throw new ErrorNegocio('MAXIMO_ENTRADAS', `Podés elegir hasta ${CONFIG.MAX_ENTRADAS} butacas por compra.`, 422);
    }
    for (const b of butacas) {
      if (!parsearButaca(b, f.filas, f.columnas)) throw new ErrorNegocio('BUTACA_INVALIDA', `La butaca ${String(b)} no existe en esta sala.`);
    }
    if (new Set(butacas).size !== butacas.length) throw new ErrorNegocio('BUTACAS_REPETIDAS', 'Hay butacas repetidas en el pedido.');
  }

  function armarReserva(h, f) {
    const butacas = JSON.parse(h.butacas);
    const precios = {};
    for (const b of butacas) {
      const premium = esPremium(b, f.filas, f.columnas);
      precios[b] = {
        general: calcularPrecio({ precioBase: f.precioBase, premium, tipo: 'general', inicioMs: f.inicioMs }),
        reducida: calcularPrecio({ precioBase: f.precioBase, premium, tipo: 'reducida', inicioMs: f.inicioMs }),
      };
    }
    return { id: h.id, funcionId: h.funcion_id, butacas, expiraMs: h.expira_ms, precios, funcion: f };
  }

  /** Reserva las butacas por 5 minutos. Todo o nada; si falla, se conserva la reserva anterior. */
  function reservar(usuario, funcionId, butacas) {
    const f = c.obtenerFuncion(Number(funcionId));
    c.exigirVentaAbierta(f);
    validarButacas(f, butacas);
    c.exigirEdad(usuario, f);

    return transaccion(db, () => {
      c.limpiarReservasVencidas();
      db.prepare('DELETE FROM holds WHERE usuario_id = ?').run(usuario.id); // RN4
      const ocupadas = c.butacasOcupadas(f.id);
      const reservadas = c.butacasReservadas(f.id);
      const tomadas = butacas.filter((b) => ocupadas.has(b) || reservadas.has(b));
      if (tomadas.length) {
        throw new ErrorNegocio('BUTACA_NO_DISPONIBLE', `Ya no están disponibles: ${tomadas.join(', ')}.`, 409);
      }
      const expira = ahora() + CONFIG.RESERVA_MS;
      const id = db.prepare('INSERT INTO holds (usuario_id, funcion_id, butacas, expira_ms) VALUES (?, ?, ?, ?)')
        .run(usuario.id, f.id, JSON.stringify(butacas), expira).lastInsertRowid;
      return armarReserva({ id, funcion_id: f.id, butacas: JSON.stringify(butacas), expira_ms: expira }, f);
    });
  }

  /** Reserva vigente del usuario o null. */
  function obtenerReservaActual(usuario) {
    c.limpiarReservasVencidas();
    const h = db.prepare('SELECT * FROM holds WHERE usuario_id = ?').get(usuario.id);
    return h ? armarReserva(h, c.obtenerFuncion(h.funcion_id)) : null;
  }

  function liberarReserva(usuario) {
    db.prepare('DELETE FROM holds WHERE usuario_id = ?').run(usuario.id);
  }

  return { reservar, obtenerReservaActual, liberarReserva };
};
