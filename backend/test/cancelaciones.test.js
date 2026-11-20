'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MIN, HORA, crearEntorno, datosUsuario, esError, escenarioBasico } = require('./helpers');

const TARJETA = { numero: '4111111111111111', titular: 'ANA PEREZ', vencimiento: '12/27', cvv: '123' };

/** Ana compra A1 y A2 (8000 cada una) para la función del viernes 21:00. */
function entorno() {
  const e = crearEntorno();
  const esc = escenarioBasico(e.db, { precioBase: 8000 });
  const fila = (u) => e.db.prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id);
  const ana = fila(e.s.registrar(datosUsuario()).usuario);
  const beto = fila(e.s.registrar(datosUsuario({ nombre: 'Beto Gómez', email: 'beto@test.com' })).usuario);
  e.s.reservar(ana, esc.funcionId, ['A1', 'A2']);
  const compra = e.s.comprar(ana, { tarjeta: TARJETA });
  return { ...e, ...esc, ana, beto, a1: compra.entradas[0], a2: compra.entradas[1] };
}

test('HU9/RN10: con 24 h o más se reembolsa el 100 % (24 h exactas incluidas)', () => {
  const { s, reloj, ana, a1, a2, inicioMs } = entorno();
  reloj.t = inicioMs - 30 * HORA;
  assert.deepEqual(s.cancelarEntrada(ana, a1.id), { id: a1.id, estado: 'cancelada', porcentaje: 100, reembolso: 8000 });
  reloj.t = inicioMs - 24 * HORA;
  assert.equal(s.cancelarEntrada(ana, a2.id).reembolso, 8000);
});

test('HU9/RN10: con menos de 24 h y hasta 2 h se reembolsa el 50 %', () => {
  const { s, reloj, ana, a1, a2, inicioMs } = entorno();
  reloj.t = inicioMs - 24 * HORA + 1;
  assert.deepEqual(s.cancelarEntrada(ana, a1.id), { id: a1.id, estado: 'cancelada', porcentaje: 50, reembolso: 4000 });
  reloj.t = inicioMs - 2 * HORA; // exactamente 2 h: todavía se puede
  assert.equal(s.cancelarEntrada(ana, a2.id).porcentaje, 50);
});

test('HU9/RN10: con menos de 2 h no se puede cancelar y la entrada sigue válida', () => {
  const { s, reloj, ana, a1, inicioMs } = entorno();
  reloj.t = inicioMs - 2 * HORA + 1;
  assert.throws(() => s.cancelarEntrada(ana, a1.id), esError('FUERA_DE_PLAZO', 422));
  assert.equal(s.misEntradas(ana).find((e) => e.id === a1.id).estado, 'valida');
  reloj.t = inicioMs + 10 * MIN; // ya empezó
  assert.throws(() => s.cancelarEntrada(ana, a1.id), esError('FUERA_DE_PLAZO', 422));
});

test('HU9/RN1/RN10: la butaca cancelada vuelve a estar libre y otra persona la puede reservar y comprar', () => {
  const { s, ana, beto, a1, funcionId } = entorno();
  assert.equal(s.detalleFuncion(funcionId).butacas.A1, 'ocupada');
  s.cancelarEntrada(ana, a1.id);
  assert.equal(s.detalleFuncion(funcionId).butacas.A1, 'libre');
  s.reservar(beto, funcionId, ['A1']);
  const compra = s.comprar(beto, { tarjeta: TARJETA });
  assert.equal(compra.entradas[0].butaca, 'A1');
});

test('HU9: se cancela una entrada por vez; las demás de la compra siguen válidas', () => {
  const { s, ana, a1 } = entorno();
  s.cancelarEntrada(ana, a1.id);
  const estados = Object.fromEntries(s.misEntradas(ana).map((e) => [e.butaca, e.estado]));
  assert.deepEqual(estados, { A1: 'cancelada', A2: 'valida' });
});

test('HU9: no se puede cancelar dos veces la misma entrada', () => {
  const { s, ana, a1 } = entorno();
  s.cancelarEntrada(ana, a1.id);
  assert.throws(() => s.cancelarEntrada(ana, a1.id), esError('ENTRADA_NO_VALIDA', 409));
});

test('HU9: no se puede cancelar una entrada ya usada en la puerta', () => {
  const { s, db, ana, a1 } = entorno();
  db.prepare("UPDATE entradas SET estado = 'usada', usada_ms = 1 WHERE id = ?").run(a1.id);
  assert.throws(() => s.cancelarEntrada(ana, a1.id), esError('ENTRADA_NO_VALIDA', 409));
});

test('HU9: nadie puede cancelar entradas de otra persona (ni saber que existen)', () => {
  const { s, beto, a1 } = entorno();
  assert.throws(() => s.cancelarEntrada(beto, a1.id), esError('ENTRADA_NO_ENCONTRADA', 404));
  assert.throws(() => s.cancelarEntrada(beto, 99999), esError('ENTRADA_NO_ENCONTRADA', 404));
  assert.equal(s.misEntradas(beto).length, 0);
});

test('HU8/HU9: mis entradas muestra la cancelada con su reembolso y ya no ofrece cancelarla', () => {
  const { s, reloj, ana, a1, a2, inicioMs } = entorno();
  reloj.t = inicioMs - 10 * HORA;
  s.cancelarEntrada(ana, a1.id);
  const lista = s.misEntradas(ana);
  const cancelada = lista.find((e) => e.id === a1.id);
  assert.equal(cancelada.estado, 'cancelada');
  assert.equal(cancelada.reembolso, 4000);
  assert.equal(cancelada.cancelacion, null);
  const valida = lista.find((e) => e.id === a2.id);
  assert.deepEqual(valida.cancelacion, { permitido: true, porcentaje: 50, monto: 4000 });
});
