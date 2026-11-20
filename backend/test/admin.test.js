'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MIN, HORA, ar, crearEntorno, datosUsuario, esError, nuevaSala, nuevaPelicula, nuevaFuncion } = require('./helpers');

const TARJETA = { numero: '4111111111111111', titular: 'ANA PEREZ', vencimiento: '12/27', cvv: '123' };
const iso = (ms) => new Date(ms).toISOString();

function entorno() {
  const e = crearEntorno();
  const salaId = nuevaSala(e.db, 'Sala 1');
  const otraSalaId = nuevaSala(e.db, 'Sala 2');
  const fila = (u) => e.db.prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id);
  const ana = fila(e.s.registrar(datosUsuario()).usuario);
  const beto = fila(e.s.registrar(datosUsuario({ nombre: 'Beto Gómez', email: 'beto@test.com' })).usuario);
  return { ...e, salaId, otraSalaId, ana, beto };
}

// ---------- HU10: películas ----------

test('HU10: el admin carga una película válida', () => {
  const { s } = entorno();
  const p = s.crearPelicula({ titulo: ' Mi Película ', sinopsis: 'Algo', genero: 'Drama', duracionMin: 95, clasificacion: '+13' });
  assert.equal(p.titulo, 'Mi Película');
  assert.equal(p.duracionMin, 95);
  assert.equal(p.activa, true);
  assert.match(p.colorA, /^#[0-9a-f]{6}$/i);
});

test('HU10: se validan título, duración (30–300) y clasificación', () => {
  const { s } = entorno();
  const base = { titulo: 'X', duracionMin: 100, clasificacion: 'ATP' };
  assert.throws(() => s.crearPelicula({ ...base, titulo: '  ' }), esError('TITULO_INVALIDO', 400));
  assert.throws(() => s.crearPelicula({ ...base, duracionMin: 29 }), esError('DURACION_INVALIDA', 400));
  assert.throws(() => s.crearPelicula({ ...base, duracionMin: 301 }), esError('DURACION_INVALIDA', 400));
  assert.throws(() => s.crearPelicula({ ...base, duracionMin: '100' }), esError('DURACION_INVALIDA', 400));
  assert.doesNotThrow(() => s.crearPelicula({ ...base, duracionMin: 30 }));
  assert.doesNotThrow(() => s.crearPelicula({ ...base, duracionMin: 300 }));
  assert.throws(() => s.crearPelicula({ ...base, clasificacion: '+21' }), esError('CLASIFICACION_INVALIDA', 400));
  assert.throws(() => s.crearPelicula({ ...base, colorA: 'rojo' }), esError('COLOR_INVALIDO', 400));
});

test('HU10: la lista del admin incluye también las películas dadas de baja', () => {
  const { db, s } = entorno();
  nuevaPelicula(db, { titulo: 'Baja', activa: 0 });
  nuevaPelicula(db, { titulo: 'Activa' });
  assert.deepEqual(s.listarPeliculasAdmin().map((p) => p.titulo).sort(), ['Activa', 'Baja']);
  assert.equal(s.listarSalas().length, 2);
  assert.equal(s.listarSalas()[0].capacidad, 80);
});

// ---------- HU11: funciones ----------

test('HU11: el admin programa una función', () => {
  const { db, s, salaId } = entorno();
  const peliculaId = nuevaPelicula(db);
  const f = s.crearFuncion({ peliculaId, salaId, inicio: iso(ar(2026, 11, 21, 21)), formato: '3D', precioBase: 11000 });
  assert.equal(f.formato, '3D');
  assert.equal(f.precioBase, 11000);
  assert.equal(f.inicioMs, ar(2026, 11, 21, 21));
  assert.equal(f.estado, 'programada');
  assert.equal(s.listarFunciones({ peliculaId }).length, 1);
});

test('HU11/RN11: no se superponen funciones en la misma sala (duración + 15 min de limpieza)', () => {
  const { db, s, salaId, otraSalaId } = entorno();
  const peliculaId = nuevaPelicula(db, { duracionMin: 120 });
  const corta = nuevaPelicula(db, { titulo: 'Corta', duracionMin: 90 });
  const crear = (peli, sala, h, m) => s.crearFuncion({ peliculaId: peli, salaId: sala, inicio: iso(ar(2026, 11, 21, h, m)), formato: '2D', precioBase: 8000 });
  crear(peliculaId, salaId, 15, 0); // ocupa 15:00 a 17:15
  assert.throws(() => crear(corta, salaId, 16, 0), esError('SOLAPAMIENTO', 409));
  assert.throws(() => crear(corta, salaId, 17, 14), esError('SOLAPAMIENTO', 409));
  assert.doesNotThrow(() => crear(corta, salaId, 17, 15), 'justo al terminar la limpieza');
  // la nueva (17:15 + 90 + 15 = 19:00) bloquea hasta las 19:00
  assert.throws(() => crear(peliculaId, salaId, 18, 59), esError('SOLAPAMIENTO', 409));
  assert.doesNotThrow(() => crear(peliculaId, salaId, 19, 0));
  // otra sala no tiene problema
  assert.doesNotThrow(() => crear(peliculaId, otraSalaId, 15, 0));
});

test('HU11/RN11: antes de otra función tiene que alcanzar el tiempo propio de la película + limpieza', () => {
  const { db, s, salaId } = entorno();
  const larga = nuevaPelicula(db, { duracionMin: 120 });
  nuevaFuncion(db, { peliculaId: larga, salaId, inicioMs: ar(2026, 11, 21, 15) });
  const crear = (h, m) => s.crearFuncion({ peliculaId: larga, salaId, inicio: iso(ar(2026, 11, 21, h, m)), formato: '2D', precioBase: 8000 });
  assert.throws(() => crear(13, 0), esError('SOLAPAMIENTO', 409), '13:00 + 120 + 15 = 15:15 pisa a las 15:00');
  assert.doesNotThrow(() => crear(12, 45), '12:45 + 120 + 15 = 15:00 justo');
});

test('HU11/RN11: una función cancelada no bloquea la sala', () => {
  const { db, s, salaId } = entorno();
  const p = nuevaPelicula(db);
  nuevaFuncion(db, { peliculaId: p, salaId, inicioMs: ar(2026, 11, 21, 15), estado: 'cancelada' });
  assert.doesNotThrow(() => s.crearFuncion({ peliculaId: p, salaId, inicio: iso(ar(2026, 11, 21, 15)), formato: '2D', precioBase: 8000 }));
});

test('HU11: se validan película, sala, fecha, formato y precio', () => {
  const { db, s, salaId } = entorno();
  const peliculaId = nuevaPelicula(db);
  const ok = { peliculaId, salaId, inicio: iso(ar(2026, 11, 21, 21)), formato: '2D', precioBase: 8000 };
  assert.throws(() => s.crearFuncion({ ...ok, peliculaId: 999 }), esError('PELICULA_NO_ENCONTRADA', 404));
  assert.throws(() => s.crearFuncion({ ...ok, peliculaId: nuevaPelicula(db, { activa: 0 }) }), esError('PELICULA_NO_ENCONTRADA', 404));
  assert.throws(() => s.crearFuncion({ ...ok, salaId: 999 }), esError('SALA_NO_ENCONTRADA', 404));
  assert.throws(() => s.crearFuncion({ ...ok, inicio: 'mañana' }), esError('FECHA_INVALIDA', 400));
  assert.throws(() => s.crearFuncion({ ...ok, inicio: '2026-11-21T21:00:00' }), esError('FECHA_INVALIDA', 400), 'sin zona horaria es ambigua');
  assert.throws(() => s.crearFuncion({ ...ok, inicio: iso(ar(2026, 11, 18, 21)) }), esError('FECHA_INVALIDA', 400), 'en el pasado');
  assert.throws(() => s.crearFuncion({ ...ok, formato: 'IMAX' }), esError('FORMATO_INVALIDO', 400));
  assert.throws(() => s.crearFuncion({ ...ok, precioBase: 0 }), esError('PRECIO_INVALIDO', 400));
  assert.throws(() => s.crearFuncion({ ...ok, precioBase: 8000.5 }), esError('PRECIO_INVALIDO', 400));
});

// ---------- HU12: cancelar función ----------

function funcionConVentas() {
  const e = entorno();
  const peliculaId = nuevaPelicula(e.db);
  const funcionId = nuevaFuncion(e.db, { peliculaId, salaId: e.salaId, inicioMs: ar(2026, 11, 20, 21), precioBase: 8000 });
  e.s.reservar(e.ana, funcionId, ['A1', 'G1']);
  const compraAna = e.s.comprar(e.ana, { tipos: { G1: 'reducida' }, tarjeta: TARJETA }); // 8000 + 7000
  e.s.reservar(e.beto, funcionId, ['B1']);
  const compraBeto = e.s.comprar(e.beto, { tarjeta: TARJETA }); // 8000
  return { ...e, peliculaId, funcionId, compraAna, compraBeto };
}

test('HU12/RN12: cancelar una función anula todas las entradas con reembolso del 100 %', () => {
  const { s, ana, beto, funcionId } = funcionConVentas();
  const r = s.cancelarFuncion(funcionId);
  assert.deepEqual(r, { funcionId, entradasAnuladas: 3, montoReembolsado: 23000 });
  for (const e of [...s.misEntradas(ana), ...s.misEntradas(beto)]) {
    assert.equal(e.estado, 'cancelada');
    assert.equal(e.reembolso, e.precio, 'reembolso del 100 % del precio pagado');
    assert.equal(e.cancelacion, null);
  }
  assert.equal(s.listarFunciones({}).length, 0, 'deja de aparecer en la cartelera');
});

test('HU12/RN12: se liberan las reservas pendientes y no se pisa el reembolso de entradas ya canceladas', () => {
  const { s, db, ana, beto, funcionId, reloj } = funcionConVentas();
  const caro = db.prepare('SELECT id FROM entradas WHERE butaca = ?').get('G1').id;
  reloj.t = ar(2026, 11, 19, 16); // 29 h antes: cancela G1 con 100 % (7000)
  s.cancelarEntrada(ana, caro);
  s.reservar(beto, funcionId, ['C5']); // reserva pendiente
  const r = s.cancelarFuncion(funcionId);
  assert.equal(r.entradasAnuladas, 2, 'solo las 2 que seguían válidas (A1 y B1)');
  assert.equal(r.montoReembolsado, 16000);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM holds').get().n, 0);
  assert.equal(db.prepare('SELECT reembolso FROM entradas WHERE id = ?').get(caro).reembolso, 7000);
});

test('HU12/RN12: el admin puede cancelar hasta el último minuto antes del inicio', () => {
  const { s, reloj, funcionId } = funcionConVentas();
  reloj.t = ar(2026, 11, 20, 21) - MIN;
  assert.equal(s.cancelarFuncion(funcionId).entradasAnuladas, 3);
});

test('HU12: no se cancela una función que ya empezó, ya cancelada o inexistente', () => {
  const { s, db, otraSalaId, reloj } = funcionConVentas();
  const p = nuevaPelicula(db, { titulo: 'Otra' });
  const empezada = nuevaFuncion(db, { peliculaId: p, salaId: otraSalaId, inicioMs: ar(2026, 11, 20, 18) });
  reloj.t = ar(2026, 11, 20, 18);
  assert.throws(() => s.cancelarFuncion(empezada), esError('FUNCION_YA_COMENZO', 422));
  reloj.t = ar(2026, 11, 19, 15);
  const futura = nuevaFuncion(db, { peliculaId: p, salaId: otraSalaId, inicioMs: ar(2026, 11, 22, 18) });
  s.cancelarFuncion(futura);
  assert.throws(() => s.cancelarFuncion(futura), esError('FUNCION_CANCELADA', 409));
  assert.throws(() => s.cancelarFuncion(9999), esError('FUNCION_NO_ENCONTRADA', 404));
});

// ---------- HU15: dar de baja una película ----------

test('HU15/RN16: sin ventas futuras se da de baja y se cancelan sus funciones futuras', () => {
  const { db, s, salaId } = entorno();
  const peliculaId = nuevaPelicula(db);
  const f = nuevaFuncion(db, { peliculaId, salaId, inicioMs: ar(2026, 11, 21, 21) });
  s.desactivarPelicula(peliculaId);
  assert.equal(db.prepare('SELECT activa FROM peliculas WHERE id = ?').get(peliculaId).activa, 0);
  assert.equal(db.prepare('SELECT estado FROM funciones WHERE id = ?').get(f).estado, 'cancelada');
  assert.equal(s.listarPeliculas().length, 0);
});

test('HU15/RN16: con entradas vendidas para una función futura no se puede dar de baja', () => {
  const { s, db, peliculaId } = funcionConVentas();
  assert.throws(() => s.desactivarPelicula(peliculaId), esError('PELICULA_CON_VENTAS', 409));
  assert.equal(db.prepare('SELECT activa FROM peliculas WHERE id = ?').get(peliculaId).activa, 1);
});

test('HU15/RN16: si las entradas vendidas ya se cancelaron, sí se puede dar de baja', () => {
  const { s, funcionId, peliculaId } = funcionConVentas();
  s.cancelarFuncion(funcionId);
  assert.doesNotThrow(() => s.desactivarPelicula(peliculaId));
});

test('HU15/RN16: las ventas de funciones pasadas no impiden la baja', () => {
  const { s, reloj, peliculaId } = funcionConVentas();
  reloj.t = ar(2026, 11, 21, 12); // la función ya pasó
  assert.doesNotThrow(() => s.desactivarPelicula(peliculaId));
});

test('HU15: dar de baja una película inexistente da 404', () => {
  const { s } = entorno();
  assert.throws(() => s.desactivarPelicula(999), esError('PELICULA_NO_ENCONTRADA', 404));
});
