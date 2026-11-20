'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MIN, HORA, ar, crearEntorno, datosUsuario, esError, escenarioBasico } = require('./helpers');

const TARJETA = { numero: '4111111111111111', titular: 'ANA PEREZ', vencimiento: '12/27', cvv: '123' };

/** Función del viernes 20/11/2026 21:00 (película de 120 min => la ventana de ingreso es 20:00–23:00). */
function entorno() {
  const e = crearEntorno();
  const esc = escenarioBasico(e.db, { precioBase: 8000, duracionMin: 120 });
  const fila = (u) => e.db.prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id);
  const ana = fila(e.s.registrar(datosUsuario()).usuario);
  e.s.reservar(ana, esc.funcionId, ['A1', 'G1', 'B1']);
  const compra = e.s.comprar(ana, { tipos: { G1: 'reducida' }, tarjeta: TARJETA }); // 8000 + 7000 + 8000
  const [a1, g1, b1] = compra.entradas;
  return { ...e, ...esc, ana, a1, g1, b1 };
}

// ---------- HU13: validación en la puerta ----------

test('HU13/RN13: una entrada válida dentro de la ventana horaria pasa a usada', () => {
  const { s, db, reloj, a1, inicioMs } = entorno();
  reloj.t = inicioMs - 10 * MIN;
  const r = s.validarEntrada(a1.codigo);
  assert.equal(r.estado, 'usada');
  assert.equal(r.butaca, 'A1');
  assert.equal(r.tipo, 'general');
  assert.equal(r.pelicula, 'La Última Frontera');
  assert.equal(r.sala, 'Sala 1');
  assert.equal(db.prepare('SELECT estado, usada_ms FROM entradas WHERE id = ?').get(a1.id).usada_ms, reloj.t);
});

test('HU13/RN13: el código se acepta sin importar mayúsculas ni espacios', () => {
  const { s, reloj, a1, inicioMs } = entorno();
  reloj.t = inicioMs;
  assert.equal(s.validarEntrada(`  ${a1.codigo.toLowerCase()} `).estado, 'usada');
});

test('HU13/RN13: una entrada se puede usar una sola vez', () => {
  const { s, reloj, a1, inicioMs } = entorno();
  reloj.t = inicioMs;
  s.validarEntrada(a1.codigo);
  assert.throws(() => s.validarEntrada(a1.codigo), esError('YA_USADA', 409));
});

test('HU13/RN13: se acepta desde 60 min antes (límite inclusivo) y no antes', () => {
  const { s, db, reloj, a1, inicioMs } = entorno();
  reloj.t = inicioMs - 60 * MIN - 1;
  assert.throws(() => s.validarEntrada(a1.codigo), esError('FUERA_DE_HORARIO', 422));
  assert.equal(db.prepare('SELECT estado FROM entradas WHERE id = ?').get(a1.id).estado, 'valida', 'rechazada = no se marca como usada');
  reloj.t = inicioMs - 60 * MIN;
  assert.equal(s.validarEntrada(a1.codigo).estado, 'usada');
});

test('HU13/RN13: se acepta hasta que termina la función (inicio + duración, inclusivo) y no después', () => {
  const { s, reloj, a1, g1, inicioMs } = entorno();
  reloj.t = inicioMs + 120 * MIN;
  assert.equal(s.validarEntrada(a1.codigo).estado, 'usada');
  reloj.t = inicioMs + 120 * MIN + 1;
  assert.throws(() => s.validarEntrada(g1.codigo), esError('FUERA_DE_HORARIO', 422));
});

test('HU13/RN13: las entradas canceladas no valen', () => {
  const { s, reloj, ana, a1, inicioMs } = entorno();
  reloj.t = inicioMs - 30 * HORA;
  s.cancelarEntrada(ana, a1.id);
  reloj.t = inicioMs;
  assert.throws(() => s.validarEntrada(a1.codigo), esError('ENTRADA_ANULADA', 410));
});

test('HU13/RN12/RN13: las entradas de una función cancelada tampoco valen', () => {
  const { s, reloj, g1, funcionId, inicioMs } = entorno();
  s.cancelarFuncion(funcionId);
  reloj.t = inicioMs;
  assert.throws(() => s.validarEntrada(g1.codigo), esError('ENTRADA_ANULADA', 410));
});

test('HU13: un código inexistente o vacío se rechaza', () => {
  const { s } = entorno();
  assert.throws(() => s.validarEntrada('CA-NOEXISTE'), esError('ENTRADA_NO_ENCONTRADA', 404));
  assert.throws(() => s.validarEntrada(''), esError('ENTRADA_NO_ENCONTRADA', 404));
  assert.throws(() => s.validarEntrada(undefined), esError('ENTRADA_NO_ENCONTRADA', 404));
});

// ---------- HU14: reporte ----------

test('HU14: el reporte muestra por función entradas vendidas, ocupación y recaudación', () => {
  const { s, funcionId } = entorno();
  const { funciones, totales } = s.reporte();
  const f = funciones.find((x) => x.funcionId === funcionId);
  assert.equal(f.titulo, 'La Última Frontera');
  assert.equal(f.sala, 'Sala 1');
  assert.equal(f.capacidad, 80);
  assert.equal(f.vendidas, 3);
  assert.equal(f.ocupacion, 3.75);
  assert.equal(f.recaudacionNeta, 23000);
  assert.deepEqual(totales, { entradasVendidas: 3, recaudacionNeta: 23000, reembolsado: 0 });
});

test('HU14/RN10: la recaudación neta descuenta lo reembolsado (100 % y 50 %)', () => {
  const { s, reloj, ana, g1, a1, funcionId, inicioMs } = entorno();
  reloj.t = inicioMs - 30 * HORA;
  s.cancelarEntrada(ana, g1.id); // 100 %: devuelve 7000
  reloj.t = inicioMs - 10 * HORA;
  s.cancelarEntrada(ana, a1.id); // 50 %: devuelve 4000, el cine se queda con 4000
  const f = s.reporte().funciones.find((x) => x.funcionId === funcionId);
  assert.equal(f.vendidas, 1);
  assert.equal(f.canceladas, 2);
  assert.equal(f.reembolsado, 11000);
  assert.equal(f.recaudacionNeta, 8000 + 4000, 'B1 completa + la mitad retenida de A1');
});

test('HU14/RN12: una función cancelada no deja recaudación', () => {
  const { s, funcionId } = entorno();
  s.cancelarFuncion(funcionId);
  const f = s.reporte().funciones.find((x) => x.funcionId === funcionId);
  assert.equal(f.estado, 'cancelada');
  assert.equal(f.recaudacionNeta, 0);
  assert.equal(f.vendidas, 0);
  assert.equal(f.reembolsado, 23000);
});

test('HU14: las entradas usadas cuentan como vendidas y se informan aparte', () => {
  const { s, reloj, a1, funcionId, inicioMs } = entorno();
  reloj.t = inicioMs;
  s.validarEntrada(a1.codigo);
  const f = s.reporte().funciones.find((x) => x.funcionId === funcionId);
  assert.equal(f.vendidas, 3);
  assert.equal(f.usadas, 1);
});

test('HU14: una función sin ventas figura con ceros', () => {
  const { s, db, salaId, peliculaId } = entorno();
  const vacia = Number(db.prepare("INSERT INTO funciones (pelicula_id, sala_id, inicio_ms, formato, precio_base) VALUES (?, ?, ?, '2D', 8000)")
    .run(peliculaId, salaId, ar(2026, 11, 25, 15)).lastInsertRowid);
  const f = s.reporte().funciones.find((x) => x.funcionId === vacia);
  assert.deepEqual([f.vendidas, f.ocupacion, f.recaudacionNeta], [0, 0, 0]);
});
