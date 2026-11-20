'use strict';
const crypto = require('node:crypto');
const { ErrorNegocio } = require('../errores');
const { transaccion, esViolacionUnica } = require('../db');
const {
  CONFIG, esPremium, calcularPrecio, luhnValido, vencimientoVigente, calcularReembolso,
} = require('../reglas');

/** Compra, pago simulado y entradas del cliente (HU7, HU8, HU9: RN5–RN7, RN10, RN13, RN14). */
module.exports = function compras({ db, ahora, c }) {
  /** RN14: valida la tarjeta y simula el cobro. Devuelve solo los últimos 4 dígitos. */
  function procesarPago(tarjeta) {
    const invalida = (m) => new ErrorNegocio('TARJETA_INVALIDA', m);
    if (!tarjeta || typeof tarjeta !== 'object') throw invalida('Completá los datos de la tarjeta.');
    const numero = String(tarjeta.numero ?? '').replace(/[\s-]/g, '');
    if (!luhnValido(numero)) throw invalida('El número de tarjeta no es válido.');
    if (String(tarjeta.titular ?? '').trim().length < 3) throw invalida('Falta el nombre del titular.');
    if (!vencimientoVigente(tarjeta.vencimiento, ahora())) throw invalida('La tarjeta está vencida o la fecha es inválida (usá MM/AA).');
    if (!/^\d{3,4}$/.test(String(tarjeta.cvv ?? ''))) throw invalida('El código de seguridad debe tener 3 o 4 dígitos.');
    if (numero === CONFIG.TARJETA_RECHAZADA) {
      throw new ErrorNegocio('PAGO_RECHAZADO', 'El banco rechazó el pago (simulación). Probá con otra tarjeta.', 402);
    }
    return numero.slice(-4);
  }

  function codigoNuevo() {
    for (;;) {
      const codigo = `CA-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      if (!db.prepare('SELECT 1 FROM entradas WHERE codigo = ?').get(codigo)) return codigo;
    }
  }

  /** Paga la reserva vigente del usuario y emite las entradas. */
  function comprar(usuario, { tipos = {}, tarjeta } = {}) {
    // No se limpian reservas vencidas antes: hay que distinguir "no hay reserva" de "venció".
    const h = db.prepare('SELECT * FROM holds WHERE usuario_id = ?').get(usuario.id);
    if (!h) throw new ErrorNegocio('RESERVA_NO_ENCONTRADA', 'No tenés butacas reservadas. Elegí tus butacas de nuevo.', 404);
    if (h.expira_ms <= ahora()) {
      db.prepare('DELETE FROM holds WHERE id = ?').run(h.id);
      throw new ErrorNegocio('RESERVA_VENCIDA', 'Tu reserva venció (dura 5 minutos). Elegí tus butacas de nuevo.', 410);
    }
    const f = c.obtenerFuncion(h.funcion_id);
    c.exigirVentaAbierta(f);
    c.exigirEdad(usuario, f);

    const butacas = JSON.parse(h.butacas);
    if (typeof tipos !== 'object' || tipos === null || Array.isArray(tipos)) {
      throw new ErrorNegocio('TIPO_INVALIDO', 'Los tipos de entrada no son válidos.');
    }
    for (const b of Object.keys(tipos)) {
      if (!butacas.includes(b)) throw new ErrorNegocio('TIPO_INVALIDO', `La butaca ${b} no está en tu reserva.`);
    }
    const items = butacas.map((butaca) => {
      const tipo = tipos[butaca] ?? 'general';
      if (!CONFIG.TIPOS_ENTRADA.includes(tipo)) throw new ErrorNegocio('TIPO_INVALIDO', `Tipo de entrada inválido: ${String(tipo)}.`);
      const precio = calcularPrecio({
        precioBase: f.precioBase, premium: esPremium(butaca, f.filas, f.columnas), tipo, inicioMs: f.inicioMs,
      });
      return { butaca, tipo, precio };
    });
    if (items.filter((i) => i.tipo === 'reducida').length > CONFIG.MAX_REDUCIDAS) {
      throw new ErrorNegocio('MAXIMO_REDUCIDAS', `Podés comprar hasta ${CONFIG.MAX_REDUCIDAS} entradas reducidas por compra.`, 422);
    }

    const ultimos4 = procesarPago(tarjeta); // si falla, la reserva se conserva (RN14)
    const total = items.reduce((suma, i) => suma + i.precio, 0);

    return transaccion(db, () => {
      const compraId = Number(db.prepare(
        'INSERT INTO compras (usuario_id, funcion_id, total, tarjeta_ultimos4, creada_ms) VALUES (?, ?, ?, ?, ?)',
      ).run(usuario.id, f.id, total, ultimos4, ahora()).lastInsertRowid);

      const insertar = db.prepare('INSERT INTO entradas (compra_id, funcion_id, butaca, tipo, precio, codigo) VALUES (?, ?, ?, ?, ?, ?)');
      const entradas = items.map((i) => {
        const codigo = codigoNuevo();
        let id;
        try {
          id = Number(insertar.run(compraId, f.id, i.butaca, i.tipo, i.precio, codigo).lastInsertRowid);
        } catch (e) {
          if (esViolacionUnica(e)) throw new ErrorNegocio('BUTACA_NO_DISPONIBLE', `La butaca ${i.butaca} ya fue vendida.`, 409); // RN1
          throw e;
        }
        return { id, codigo, butaca: i.butaca, tipo: i.tipo, precio: i.precio, estado: 'valida' };
      });
      db.prepare('DELETE FROM holds WHERE id = ?').run(h.id);
      return { compraId, total, tarjetaUltimos4: ultimos4, entradas, funcion: f };
    });
  }

  /** HU8: entradas del usuario con los datos de su función y lo que pasaría si las cancelara. */
  function misEntradas(usuario) {
    const filas = db.prepare(`
      SELECT e.*, c.creada_ms
      FROM entradas e JOIN compras c ON c.id = e.compra_id
      WHERE c.usuario_id = ?`).all(usuario.id);
    const funciones = new Map();
    const lista = filas.map((e) => {
      if (!funciones.has(e.funcion_id)) funciones.set(e.funcion_id, c.obtenerFuncion(e.funcion_id));
      const f = funciones.get(e.funcion_id);
      const cancelable = e.estado === 'valida' && f.estado === 'programada';
      return {
        id: e.id,
        compraId: e.compra_id,
        codigo: e.codigo,
        butaca: e.butaca,
        tipo: e.tipo,
        precio: e.precio,
        estado: e.estado,
        reembolso: e.reembolso,
        funcion: {
          id: f.id, titulo: f.titulo, sala: f.sala, formato: f.formato, clasificacion: f.clasificacion,
          inicioMs: f.inicioMs, finMs: f.finMs, estado: f.estado, colorA: f.colorA, colorB: f.colorB,
        },
        cancelacion: cancelable ? calcularReembolso({ montoPagado: e.precio, inicioMs: f.inicioMs, ahoraMs: ahora() }) : null,
      };
    });
    return lista.sort((a, b) => a.funcion.inicioMs - b.funcion.inicioMs || a.butaca.localeCompare(b.butaca, 'es', { numeric: true }));
  }

  /** HU9 / RN10: cancela UNA entrada con reembolso según la anticipación. La butaca queda libre (RN1). */
  function cancelarEntrada(usuario, entradaId) {
    const e = db.prepare(`
      SELECT e.*, c.usuario_id FROM entradas e JOIN compras c ON c.id = e.compra_id WHERE e.id = ?`).get(Number(entradaId));
    if (!e || e.usuario_id !== usuario.id) throw new ErrorNegocio('ENTRADA_NO_ENCONTRADA', 'La entrada no existe.', 404);
    if (e.estado !== 'valida') {
      const motivo = e.estado === 'usada' ? 'ya fue usada en la puerta' : 'ya está cancelada';
      throw new ErrorNegocio('ENTRADA_NO_VALIDA', `No se puede cancelar: la entrada ${motivo}.`, 409);
    }
    const f = c.obtenerFuncion(e.funcion_id);
    const r = calcularReembolso({ montoPagado: e.precio, inicioMs: f.inicioMs, ahoraMs: ahora() });
    if (!r.permitido) {
      throw new ErrorNegocio('FUERA_DE_PLAZO', 'Ya no se puede cancelar: faltan menos de 2 horas para la función.', 422);
    }
    db.prepare("UPDATE entradas SET estado = 'cancelada', reembolso = ?, cancelada_ms = ? WHERE id = ? AND estado = 'valida'")
      .run(r.monto, ahora(), e.id);
    return { id: e.id, estado: 'cancelada', porcentaje: r.porcentaje, reembolso: r.monto };
  }

  return { comprar, misEntradas, cancelarEntrada };
};
