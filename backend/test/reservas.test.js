'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MIN, ar, crearEntorno, datosUsuario, esError, nuevaSala, nuevaPelicula, nuevaFuncion, escenarioBasico, ocuparButaca,
} = require('./helpers');

/** Entorno con una función y dos clientes (Ana y Beto). */
function conDosClientes(opciones) {
  const e = crearEntorno();
  const esc = escenarioBasico(e.db, opciones);
  const ana = e.s.registrar(datosUsuario()).usuario;
  const beto = e.s.registrar(datosUsuario({ nombre: 'Beto Gómez', email: 'beto@test.com' })).usuario;
  const fila = (u) => e.db.prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id); // los servicios reciben la fila completa
  return { ...e, ...esc, ana: fila(ana), beto: fila(beto) };
}

test('HU6/RN2: reservar deja las butacas a mi nombre por 5 minutos', () => {
  const { s, reloj, ana, funcionId } = conDosClientes();
  const r = s.reservar(ana, funcionId, ['C3', 'C4']);
  assert.deepEqual(r.butacas, ['C3', 'C4']);
  assert.equal(r.expiraMs, reloj.t + 5 * MIN);
  assert.equal(r.funcionId, funcionId);
  assert.equal(s.detalleFuncion(funcionId, ana).butacas.C3, 'mia');
  assert.equal(s.detalleFuncion(funcionId).butacas.C3, 'reservada');
});

test('HU6/RN5: la reserva informa el precio de cada butaca (general y reducida; premium +25 %)', () => {
  const { s, ana, funcionId } = conDosClientes({ precioBase: 8000 });
  const r = s.reservar(ana, funcionId, ['A1', 'G1']);
  assert.deepEqual(r.precios.A1, { general: 8000, reducida: 5600 });
  assert.deepEqual(r.precios.G1, { general: 10000, reducida: 7000 });
});

test('HU6/RN1/RN2: otra persona no puede reservar butacas que ya están reservadas', () => {
  const { s, ana, beto, funcionId } = conDosClientes();
  s.reservar(ana, funcionId, ['C3', 'C4']);
  assert.throws(() => s.reservar(beto, funcionId, ['C4', 'C5']), esError('BUTACA_NO_DISPONIBLE', 409));
  assert.equal(s.detalleFuncion(funcionId).butacas.C5, 'libre', 'no se reservó ninguna del pedido fallido');
  assert.doesNotThrow(() => s.reservar(beto, funcionId, ['C5', 'C6']));
});

test('HU6/RN1: no se pueden reservar butacas ya vendidas', () => {
  const { s, db, ana, beto, funcionId } = conDosClientes();
  ocuparButaca(db, funcionId, 'D1', beto.id);
  assert.throws(() => s.reservar(ana, funcionId, ['D1']), esError('BUTACA_NO_DISPONIBLE', 409));
});

test('HU6/RN2: la reserva vence a los 5 minutos justos y entonces otra persona puede tomar las butacas', () => {
  const { s, reloj, ana, beto, funcionId } = conDosClientes();
  s.reservar(ana, funcionId, ['C3']);
  reloj.t += 5 * MIN - 1;
  assert.throws(() => s.reservar(beto, funcionId, ['C3']), esError('BUTACA_NO_DISPONIBLE', 409));
  reloj.t += 1;
  assert.doesNotThrow(() => s.reservar(beto, funcionId, ['C3']));
  assert.equal(s.obtenerReservaActual(ana), null, 'la reserva vencida de Ana ya no existe');
});

test('HU6/RN3: entre 1 y 6 butacas, sin repetidas y existentes', () => {
  const { s, ana, funcionId } = conDosClientes();
  assert.throws(() => s.reservar(ana, funcionId, []), esError('BUTACAS_REQUERIDAS', 400));
  assert.throws(() => s.reservar(ana, funcionId, 'A1'), esError('BUTACAS_REQUERIDAS', 400));
  assert.throws(() => s.reservar(ana, funcionId, ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']), esError('MAXIMO_ENTRADAS', 422));
  assert.throws(() => s.reservar(ana, funcionId, ['A1', 'A1']), esError('BUTACAS_REPETIDAS', 400));
  assert.throws(() => s.reservar(ana, funcionId, ['Z99']), esError('BUTACA_INVALIDA', 400));
  assert.throws(() => s.reservar(ana, funcionId, ['A11']), esError('BUTACA_INVALIDA', 400));
  assert.throws(() => s.reservar(ana, funcionId, [42]), esError('BUTACA_INVALIDA', 400));
  assert.equal(s.reservar(ana, funcionId, ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']).butacas.length, 6, 'exactamente 6 se permite');
});

test('HU6/RN4: una sola reserva activa por usuario: reservar otra función libera la anterior', () => {
  const { s, db, ana, funcionId, salaId, peliculaId } = conDosClientes();
  const otra = nuevaFuncion(db, { peliculaId, salaId, inicioMs: ar(2026, 11, 22, 21) });
  s.reservar(ana, funcionId, ['A1', 'A2']);
  s.reservar(ana, otra, ['B1']);
  assert.equal(s.detalleFuncion(funcionId).butacas.A1, 'libre');
  assert.equal(s.obtenerReservaActual(ana).funcionId, otra);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM holds').get().n, 1);
});

test('HU6/RN4: reservar de nuevo en la misma función reemplaza la selección anterior', () => {
  const { s, ana, funcionId } = conDosClientes();
  s.reservar(ana, funcionId, ['A1', 'A2']);
  s.reservar(ana, funcionId, ['A2', 'A3']); // A2 ya era mía: no hay conflicto con mi propia reserva
  assert.deepEqual(s.obtenerReservaActual(ana).butacas, ['A2', 'A3']);
  assert.equal(s.detalleFuncion(funcionId).butacas.A1, 'libre');
});

test('HU6/RN4: si la nueva reserva falla, se conserva la anterior', () => {
  const { s, ana, beto, funcionId } = conDosClientes();
  s.reservar(ana, funcionId, ['A1']);
  s.reservar(beto, funcionId, ['B1']);
  assert.throws(() => s.reservar(ana, funcionId, ['B1']), esError('BUTACA_NO_DISPONIBLE', 409));
  assert.deepEqual(s.obtenerReservaActual(ana).butacas, ['A1']);
});

test('HU6/RN8: la venta cierra 15 minutos antes (a 15 min exactos todavía se puede)', () => {
  const { s, reloj, ana, funcionId, inicioMs } = conDosClientes();
  reloj.t = inicioMs - 15 * MIN;
  assert.doesNotThrow(() => s.reservar(ana, funcionId, ['A1']));
  reloj.t = inicioMs - 15 * MIN + 1;
  assert.throws(() => s.reservar(ana, funcionId, ['A2']), esError('VENTA_CERRADA', 409));
  reloj.t = inicioMs + MIN;
  assert.throws(() => s.reservar(ana, funcionId, ['A2']), esError('VENTA_CERRADA', 409));
});

test('HU6: no se puede reservar en una función cancelada ni inexistente', () => {
  const { s, db, ana, salaId, peliculaId } = conDosClientes();
  const cancelada = nuevaFuncion(db, { peliculaId, salaId, inicioMs: ar(2026, 11, 23, 21), estado: 'cancelada' });
  assert.throws(() => s.reservar(ana, cancelada, ['A1']), esError('FUNCION_CANCELADA', 409));
  assert.throws(() => s.reservar(ana, 9999, ['A1']), esError('FUNCION_NO_ENCONTRADA', 404));
});

test('HU6/RN9: un menor no puede reservar para una película +18, pero sí para ATP', () => {
  const e = crearEntorno();
  const { funcionId: f18 } = escenarioBasico(e.db, { clasificacion: '+18' });
  const sala2 = nuevaSala(e.db, 'Sala 2');
  const atp = nuevaPelicula(e.db, { clasificacion: 'ATP' });
  const fAtp = nuevaFuncion(e.db, { peliculaId: atp, salaId: sala2, inicioMs: ar(2026, 11, 20, 21) });
  // Hoy es 19/11/2026: nació el 20/11/2008 -> tiene 17 años y cumple 18 mañana.
  const u17 = e.db.prepare('SELECT * FROM usuarios WHERE id = ?').get(
    e.s.registrar(datosUsuario({ email: 'menor@test.com', fechaNacimiento: '2008-11-20' })).usuario.id);
  assert.throws(() => e.s.reservar(u17, f18, ['A1']), esError('EDAD_INSUFICIENTE', 403));
  assert.doesNotThrow(() => e.s.reservar(u17, fAtp, ['A1']));
});

test('HU6/RN9: el día que cumple 18 ya puede reservar +18', () => {
  const e = crearEntorno();
  const { funcionId } = escenarioBasico(e.db, { clasificacion: '+18' });
  const u18 = e.db.prepare('SELECT * FROM usuarios WHERE id = ?').get(
    e.s.registrar(datosUsuario({ email: 'justo@test.com', fechaNacimiento: '2008-11-19' })).usuario.id);
  assert.doesNotThrow(() => e.s.reservar(u18, funcionId, ['A1']));
});

test('HU6: liberarReserva deja las butacas libres; obtenerReservaActual devuelve null si no hay', () => {
  const { s, ana, funcionId } = conDosClientes();
  assert.equal(s.obtenerReservaActual(ana), null);
  s.reservar(ana, funcionId, ['A1', 'A2']);
  assert.equal(s.obtenerReservaActual(ana).butacas.length, 2);
  s.liberarReserva(ana);
  assert.equal(s.obtenerReservaActual(ana), null);
  assert.equal(s.detalleFuncion(funcionId).butacas.A1, 'libre');
  assert.doesNotThrow(() => s.liberarReserva(ana), 'liberar sin reserva no falla');
});
