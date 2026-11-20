'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/reglas');

const MIN = 60 * 1000;
const HORA = 60 * MIN;

// Fechas de referencia (hora de Argentina = UTC-3, sin horario de verano)
const ar = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h + 3, mi);
const MIERCOLES = ar(2026, 11, 25, 20, 0); // miércoles 25/11/2026 20:00
const VIERNES = ar(2026, 11, 20, 21, 0);   // viernes 20/11/2026 21:00

test('RN1: parsearButaca valida fila y columna dentro de la sala', () => {
  assert.deepEqual(R.parsearButaca('A1', 8, 10), { fila: 0, columna: 1 });
  assert.deepEqual(R.parsearButaca('H10', 8, 10), { fila: 7, columna: 10 });
  assert.equal(R.parsearButaca('I1', 8, 10), null, 'fila fuera de la sala');
  assert.equal(R.parsearButaca('A11', 8, 10), null, 'columna fuera de la sala');
  assert.equal(R.parsearButaca('A0', 8, 10), null);
  assert.equal(R.parsearButaca('a1', 8, 10), null, 'solo mayúsculas');
  assert.equal(R.parsearButaca('', 8, 10), null);
  assert.equal(R.parsearButaca(null, 8, 10), null);
  assert.equal(R.parsearButaca('A1; DROP TABLE', 8, 10), null);
});

test('RN5: las 2 últimas filas son premium', () => {
  assert.equal(R.esPremium('F10', 8, 10), false);
  assert.equal(R.esPremium('G1', 8, 10), true);
  assert.equal(R.esPremium('H10', 8, 10), true);
  assert.equal(R.esPremium('D3', 6, 8), false, 'sala de 6 filas: D no es premium');
  assert.equal(R.esPremium('E3', 6, 8), true, 'sala de 6 filas: E y F son premium');
  assert.equal(R.esPremium('F3', 6, 8), true);
});

test('RN5: butaca premium suma 25 %', () => {
  assert.equal(R.calcularPrecio({ precioBase: 8000, premium: false, tipo: 'general', inicioMs: VIERNES }), 8000);
  assert.equal(R.calcularPrecio({ precioBase: 8000, premium: true, tipo: 'general', inicioMs: VIERNES }), 10000);
});

test('RN6: entrada reducida tiene 30 % de descuento', () => {
  assert.equal(R.calcularPrecio({ precioBase: 8000, premium: false, tipo: 'reducida', inicioMs: VIERNES }), 5600);
  assert.equal(R.calcularPrecio({ precioBase: 8000, premium: true, tipo: 'reducida', inicioMs: VIERNES }), 7000);
});

test('RN7: miércoles tiene 20 % de descuento', () => {
  assert.equal(R.calcularPrecio({ precioBase: 8000, premium: false, tipo: 'general', inicioMs: MIERCOLES }), 6400);
});

test('RN7: los descuentos no se acumulan, se aplica el mayor (reducida 30 % > miércoles 20 %)', () => {
  assert.equal(R.calcularPrecio({ precioBase: 8000, premium: false, tipo: 'reducida', inicioMs: MIERCOLES }), 5600);
});

test('RN7: el precio se redondea al peso entero', () => {
  // 8333 * 0.8 = 6666.4 -> 6666
  assert.equal(R.calcularPrecio({ precioBase: 8333, premium: false, tipo: 'general', inicioMs: MIERCOLES }), 6666);
  // 8333 * 0.7 = 5833.1 -> 5833
  assert.equal(Number.isInteger(R.calcularPrecio({ precioBase: 8333, premium: true, tipo: 'reducida', inicioMs: MIERCOLES })), true);
});

test('RN7: el día es el de la función en hora de Argentina, no el UTC', () => {
  // Miércoles 25/11 a las 22:00 AR = jueves 26/11 01:00 UTC. Sigue siendo miércoles en Argentina.
  const tarde = ar(2026, 11, 25, 22, 0);
  assert.equal(R.partesAR(tarde).diaSemana, 'Wed');
  assert.equal(R.calcularPrecio({ precioBase: 10000, premium: false, tipo: 'general', inicioMs: tarde }), 8000);
  // Jueves 26/11 a las 00:30 AR = jueves.
  assert.equal(R.partesAR(ar(2026, 11, 26, 0, 30)).diaSemana, 'Thu');
});

test('RN8: la venta cierra 15 minutos antes del inicio (límite inclusivo)', () => {
  const inicio = VIERNES;
  assert.equal(R.ventaAbierta(inicio, inicio - 16 * MIN), true);
  assert.equal(R.ventaAbierta(inicio, inicio - 15 * MIN), true, 'exactamente 15 min antes todavía se vende');
  assert.equal(R.ventaAbierta(inicio, inicio - 15 * MIN + 1), false);
  assert.equal(R.ventaAbierta(inicio, inicio + MIN), false);
});

test('RN9: edad mínima por clasificación', () => {
  assert.equal(R.edadMinima('ATP'), 0);
  assert.equal(R.edadMinima('+13'), 13);
  assert.equal(R.edadMinima('+16'), 16);
  assert.equal(R.edadMinima('+18'), 18);
  assert.throws(() => R.edadMinima('+21'));
});

test('RN9: la edad se calcula con la fecha de nacimiento (el día del cumpleaños ya cuenta)', () => {
  const hoy = ar(2026, 11, 19, 12, 0);
  assert.equal(R.edadEn('2008-11-19', hoy), 18, 'cumple 18 hoy');
  assert.equal(R.edadEn('2008-11-20', hoy), 17, 'cumple 18 mañana');
  assert.equal(R.edadEn('2000-01-01', hoy), 26);
});

test('RN10: reembolso 100 % con 24 h o más, 50 % entre 2 h y 24 h, nada con menos de 2 h', () => {
  const inicio = VIERNES;
  const r = (antes) => R.calcularReembolso({ montoPagado: 8000, inicioMs: inicio, ahoraMs: inicio - antes });
  assert.deepEqual(r(48 * HORA), { permitido: true, porcentaje: 100, monto: 8000 });
  assert.deepEqual(r(24 * HORA), { permitido: true, porcentaje: 100, monto: 8000 }, 'exactamente 24 h = 100 %');
  assert.equal(r(24 * HORA - 1).porcentaje, 50, 'un instante menos de 24 h = 50 %');
  assert.deepEqual(r(10 * HORA), { permitido: true, porcentaje: 50, monto: 4000 });
  assert.deepEqual(r(2 * HORA), { permitido: true, porcentaje: 50, monto: 4000 }, 'exactamente 2 h = 50 %');
  assert.equal(r(2 * HORA - 1).permitido, false, 'menos de 2 h no se puede');
  assert.equal(r(2 * HORA - 1).monto, 0);
  assert.equal(r(-HORA).permitido, false, 'la función ya empezó');
});

test('RN10: el 50 % se redondea al peso entero', () => {
  const r = R.calcularReembolso({ montoPagado: 5001, inicioMs: VIERNES, ahoraMs: VIERNES - 5 * HORA });
  assert.equal(Number.isInteger(r.monto), true);
});

test('RN11: una función ocupa la sala duración + 15 min de limpieza', () => {
  const existente = { inicioMs: ar(2026, 11, 20, 15, 0), duracionMin: 120 }; // 15:00–17:00 (+15) => libre desde 17:15
  const nueva = (h, m, dur = 100) => ({ inicioMs: ar(2026, 11, 20, h, m), duracionMin: dur });
  assert.equal(R.haySolapamiento([existente], nueva(16, 0)), true, 'empieza en medio');
  assert.equal(R.haySolapamiento([existente], nueva(17, 0)), true, 'empieza durante la limpieza');
  assert.equal(R.haySolapamiento([existente], nueva(17, 15)), false, 'empieza justo cuando termina la limpieza');
  assert.equal(R.haySolapamiento([existente], nueva(17, 14)), true);
  assert.equal(R.haySolapamiento([existente], nueva(13, 0, 120)), true, 'termina (+limpieza) después de que empieza la otra');
  assert.equal(R.haySolapamiento([existente], nueva(13, 0, 105)), false, '13:00 + 105 + 15 = 15:00 justo');
  assert.equal(R.haySolapamiento([], nueva(16, 0)), false);
});

test('RN13: ventana de validación desde 60 min antes hasta el fin de la función', () => {
  const inicio = VIERNES;
  const v = R.ventanaValidacion(inicio, 120);
  assert.equal(v.desdeMs, inicio - 60 * MIN);
  assert.equal(v.hastaMs, inicio + 120 * MIN);
});

test('RN3: cantidad de entradas entre 1 y 6', () => {
  assert.equal(R.cantidadValida(0), false);
  assert.equal(R.cantidadValida(1), true);
  assert.equal(R.cantidadValida(6), true);
  assert.equal(R.cantidadValida(7), false);
});

test('RN14: validación Luhn del número de tarjeta', () => {
  assert.equal(R.luhnValido('4111111111111111'), true);
  assert.equal(R.luhnValido('4111 1111 1111 1111'), true, 'acepta espacios');
  assert.equal(R.luhnValido('4111111111111112'), false);
  assert.equal(R.luhnValido('4000000000000002'), true, 'la tarjeta de rechazo es válida en formato');
  assert.equal(R.luhnValido('1234'), false, 'muy corto');
  assert.equal(R.luhnValido('abcd efgh ijkl mnop'), false);
});

test('RN14: vencimiento MM/AA vigente hasta fin del mes', () => {
  const hoy = ar(2026, 11, 19, 12, 0);
  assert.equal(R.vencimientoVigente('11/26', hoy), true, 'vence este mes: todavía vale');
  assert.equal(R.vencimientoVigente('10/26', hoy), false);
  assert.equal(R.vencimientoVigente('01/27', hoy), true);
  assert.equal(R.vencimientoVigente('13/27', hoy), false, 'mes inválido');
  assert.equal(R.vencimientoVigente('1127', hoy), false, 'formato inválido');
});
