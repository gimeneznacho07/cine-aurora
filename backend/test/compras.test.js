'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MIN, ar, crearEntorno, datosUsuario, esError, nuevaSala, nuevaPelicula, nuevaFuncion, escenarioBasico, ocuparButaca,
} = require('./helpers');

const TARJETA_OK = { numero: '4111 1111 1111 1111', titular: 'ANA PEREZ', vencimiento: '12/27', cvv: '123' };

function entorno(opciones) {
  const e = crearEntorno();
  const esc = escenarioBasico(e.db, opciones);
  const fila = (u) => e.db.prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id);
  const ana = fila(e.s.registrar(datosUsuario()).usuario);
  const beto = fila(e.s.registrar(datosUsuario({ nombre: 'Beto Gómez', email: 'beto@test.com' })).usuario);
  return { ...e, ...esc, ana, beto };
}

test('HU7/RN5/RN6: la compra emite entradas con el total según butaca y tipo', () => {
  const { s, ana, funcionId } = entorno({ precioBase: 8000 });
  s.reservar(ana, funcionId, ['A1', 'G1']);
  const r = s.comprar(ana, { tipos: { A1: 'general', G1: 'reducida' }, tarjeta: TARJETA_OK });
  assert.equal(r.total, 8000 + 7000);
  assert.equal(r.tarjetaUltimos4, '1111');
  assert.deepEqual(r.entradas.map((e) => [e.butaca, e.tipo, e.precio, e.estado]), [
    ['A1', 'general', 8000, 'valida'],
    ['G1', 'reducida', 7000, 'valida'],
  ]);
});

test('HU7: el tipo por defecto es general', () => {
  const { s, ana, funcionId } = entorno({ precioBase: 8000 });
  s.reservar(ana, funcionId, ['A1']);
  const r = s.comprar(ana, { tarjeta: TARJETA_OK });
  assert.equal(r.entradas[0].tipo, 'general');
});

test('HU7/RN13: cada entrada tiene un código único CA-XXXXXXXX', () => {
  const { s, ana, beto, funcionId } = entorno();
  s.reservar(ana, funcionId, ['A1', 'A2', 'A3']);
  const a = s.comprar(ana, { tarjeta: TARJETA_OK });
  s.reservar(beto, funcionId, ['B1', 'B2', 'B3']);
  const b = s.comprar(beto, { tarjeta: TARJETA_OK });
  const codigos = [...a.entradas, ...b.entradas].map((e) => e.codigo);
  for (const c of codigos) assert.match(c, /^CA-[0-9A-F]{8}$/);
  assert.equal(new Set(codigos).size, 6);
});

test('HU7: después de pagar la reserva se consume y las butacas quedan ocupadas', () => {
  const { s, ana, beto, funcionId } = entorno();
  s.reservar(ana, funcionId, ['C3']);
  s.comprar(ana, { tarjeta: TARJETA_OK });
  assert.equal(s.obtenerReservaActual(ana), null);
  assert.equal(s.detalleFuncion(funcionId).butacas.C3, 'ocupada');
  assert.throws(() => s.reservar(beto, funcionId, ['C3']), esError('BUTACA_NO_DISPONIBLE', 409));
});

test('RN7: el miércoles hay 20 % para todos y no se acumula con la reducida', () => {
  const e = crearEntorno();
  const salaId = nuevaSala(e.db);
  const peliculaId = nuevaPelicula(e.db);
  const funcionId = nuevaFuncion(e.db, { peliculaId, salaId, inicioMs: ar(2026, 11, 25, 20), precioBase: 8000 }); // miércoles
  const ana = e.db.prepare('SELECT * FROM usuarios WHERE id = ?').get(e.s.registrar(datosUsuario()).usuario.id);
  e.s.reservar(ana, funcionId, ['A1', 'A2']);
  const r = e.s.comprar(ana, { tipos: { A2: 'reducida' }, tarjeta: TARJETA_OK });
  assert.deepEqual(r.entradas.map((x) => x.precio), [6400, 5600]);
});

test('HU7/RN6: máximo 2 entradas reducidas por compra', () => {
  const { s, ana, funcionId } = entorno();
  s.reservar(ana, funcionId, ['A1', 'A2', 'A3']);
  const tres = { A1: 'reducida', A2: 'reducida', A3: 'reducida' };
  assert.throws(() => s.comprar(ana, { tipos: tres, tarjeta: TARJETA_OK }), esError('MAXIMO_REDUCIDAS', 422));
  assert.ok(s.obtenerReservaActual(ana), 'la reserva se conserva');
  const dos = { A1: 'reducida', A2: 'reducida' };
  assert.equal(s.comprar(ana, { tipos: dos, tarjeta: TARJETA_OK }).entradas.length, 3);
});

test('HU7: tipos de entrada inválidos o de butacas que no están en la reserva se rechazan', () => {
  const { s, ana, funcionId } = entorno();
  s.reservar(ana, funcionId, ['A1']);
  assert.throws(() => s.comprar(ana, { tipos: { A1: 'vip' }, tarjeta: TARJETA_OK }), esError('TIPO_INVALIDO', 400));
  assert.throws(() => s.comprar(ana, { tipos: { Z9: 'general' }, tarjeta: TARJETA_OK }), esError('TIPO_INVALIDO', 400));
  assert.throws(() => s.comprar(ana, { tipos: 'reducida', tarjeta: TARJETA_OK }), esError('TIPO_INVALIDO', 400));
});

test('HU7: sin reserva no se puede comprar', () => {
  const { s, ana } = entorno();
  assert.throws(() => s.comprar(ana, { tarjeta: TARJETA_OK }), esError('RESERVA_NO_ENCONTRADA', 404));
});

test('HU7/RN2: si la reserva venció, no se puede pagar (a 5 min justos ya venció)', () => {
  const { s, reloj, ana, funcionId } = entorno();
  s.reservar(ana, funcionId, ['A1']);
  reloj.t += 5 * MIN;
  assert.throws(() => s.comprar(ana, { tarjeta: TARJETA_OK }), esError('RESERVA_VENCIDA', 410));
  assert.equal(s.detalleFuncion(funcionId).butacas.A1, 'libre');
});

test('HU7/RN2: un instante antes del vencimiento todavía se puede pagar', () => {
  const { s, reloj, ana, funcionId } = entorno();
  s.reservar(ana, funcionId, ['A1']);
  reloj.t += 5 * MIN - 1;
  assert.equal(s.comprar(ana, { tarjeta: TARJETA_OK }).entradas.length, 1);
});

test('HU7/RN14: tarjeta inválida (Luhn, vencida, CVV o titular) se rechaza y la reserva se conserva', () => {
  const { s, ana, funcionId } = entorno();
  s.reservar(ana, funcionId, ['A1']);
  const mal = (o) => ({ ...TARJETA_OK, ...o });
  assert.throws(() => s.comprar(ana, { tarjeta: mal({ numero: '4111111111111112' }) }), esError('TARJETA_INVALIDA', 400));
  assert.throws(() => s.comprar(ana, { tarjeta: mal({ vencimiento: '10/26' }) }), esError('TARJETA_INVALIDA', 400));
  assert.throws(() => s.comprar(ana, { tarjeta: mal({ cvv: '12' }) }), esError('TARJETA_INVALIDA', 400));
  assert.throws(() => s.comprar(ana, { tarjeta: mal({ titular: '' }) }), esError('TARJETA_INVALIDA', 400));
  assert.throws(() => s.comprar(ana, {}), esError('TARJETA_INVALIDA', 400));
  assert.ok(s.obtenerReservaActual(ana), 'sigue reservado');
});

test('HU7/RN14: la tarjeta de rechazo da 402, no genera entradas y se puede reintentar con otra', () => {
  const { s, db, ana, funcionId } = entorno();
  s.reservar(ana, funcionId, ['A1']);
  assert.throws(() => s.comprar(ana, { tarjeta: { ...TARJETA_OK, numero: '4000 0000 0000 0002' } }), esError('PAGO_RECHAZADO', 402));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM entradas').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM compras').get().n, 0);
  assert.ok(s.obtenerReservaActual(ana), 'el pago rechazado no libera la reserva');
  assert.equal(s.comprar(ana, { tarjeta: TARJETA_OK }).entradas.length, 1);
});

test('RN14: solo se guardan los últimos 4 dígitos; el número completo no queda en ninguna tabla', () => {
  const { s, db, ana, funcionId } = entorno();
  s.reservar(ana, funcionId, ['A1']);
  s.comprar(ana, { tarjeta: TARJETA_OK });
  const volcado = JSON.stringify({
    compras: db.prepare('SELECT * FROM compras').all(),
    entradas: db.prepare('SELECT * FROM entradas').all(),
    holds: db.prepare('SELECT * FROM holds').all(),
    usuarios: db.prepare('SELECT * FROM usuarios').all(),
  });
  assert.ok(!volcado.includes('4111111111111111'));
  assert.ok(!volcado.includes('4111 1111 1111 1111'));
  assert.equal(db.prepare('SELECT tarjeta_ultimos4 FROM compras').get().tarjeta_ultimos4, '1111');
  assert.ok(!volcado.includes('ANA PEREZ'), 'tampoco el titular de la tarjeta');
});

test('HU7/RN8: si la venta cerró mientras tenía la reserva, no se puede pagar', () => {
  const { s, reloj, ana, funcionId, inicioMs } = entorno();
  reloj.t = inicioMs - 18 * MIN;
  s.reservar(ana, funcionId, ['A1']);
  reloj.t = inicioMs - 14 * MIN; // la reserva (5 min) sigue vigente pero la venta ya cerró
  assert.throws(() => s.comprar(ana, { tarjeta: TARJETA_OK }), esError('VENTA_CERRADA', 409));
});

test('RN1: aunque falle algo antes, la base impide vender una butaca ya vendida (la compra se revierte entera)', () => {
  const { s, db, ana, beto, funcionId } = entorno();
  s.reservar(ana, funcionId, ['A1', 'A2']);
  ocuparButaca(db, funcionId, 'A2', beto.id); // simula una venta "colada" que se saltó la reserva
  const antes = db.prepare('SELECT COUNT(*) n FROM entradas').get().n;
  assert.throws(() => s.comprar(ana, { tarjeta: TARJETA_OK }), esError('BUTACA_NO_DISPONIBLE', 409));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM entradas').get().n, antes, 'A1 no quedó vendida a medias');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM compras WHERE usuario_id = ?').get(ana.id).n, 0);
});

// ---------- HU8: mis entradas ----------

test('HU8: mis entradas muestra función, butaca, tipo, precio, código y estado', () => {
  const { s, ana, funcionId, inicioMs } = entorno({ precioBase: 8000 });
  s.reservar(ana, funcionId, ['A1', 'A2']);
  const compra = s.comprar(ana, { tipos: { A2: 'reducida' }, tarjeta: TARJETA_OK });
  const lista = s.misEntradas(ana);
  assert.equal(lista.length, 2);
  const e = lista.find((x) => x.butaca === 'A2');
  assert.equal(e.codigo, compra.entradas[1].codigo);
  assert.equal(e.tipo, 'reducida');
  assert.equal(e.precio, 5600);
  assert.equal(e.estado, 'valida');
  assert.equal(e.funcion.titulo, 'La Última Frontera');
  assert.equal(e.funcion.sala, 'Sala 1');
  assert.equal(e.funcion.inicioMs, inicioMs);
  assert.equal(e.cancelacion.permitido, true);
});

test('HU8: cada usuario ve solo sus propias entradas', () => {
  const { s, ana, beto, funcionId } = entorno();
  s.reservar(ana, funcionId, ['A1']);
  s.comprar(ana, { tarjeta: TARJETA_OK });
  assert.equal(s.misEntradas(ana).length, 1);
  assert.equal(s.misEntradas(beto).length, 0);
});
