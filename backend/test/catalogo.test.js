'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MIN, ar, crearEntorno, datosUsuario, esError, nuevaSala, nuevaPelicula, nuevaFuncion, escenarioBasico,
} = require('./helpers');
const { haySolapamiento } = require('../src/reglas');
const { sembrarDemo } = require('../src/seed');

// ---------- HU1: cartelera ----------

test('HU1/RN16: la cartelera muestra solo películas activas con funciones futuras programadas', () => {
  const { db, s } = crearEntorno();
  const salaId = nuevaSala(db);
  const conFuncion = nuevaPelicula(db, { titulo: 'Con función' });
  nuevaPelicula(db, { titulo: 'Sin funciones' });
  const pasada = nuevaPelicula(db, { titulo: 'Solo función pasada' });
  const cancelada = nuevaPelicula(db, { titulo: 'Solo función cancelada' });
  const inactiva = nuevaPelicula(db, { titulo: 'Inactiva', activa: 0 });
  nuevaFuncion(db, { peliculaId: conFuncion, salaId, inicioMs: ar(2026, 11, 20, 21) });
  nuevaFuncion(db, { peliculaId: pasada, salaId, inicioMs: ar(2026, 11, 18, 21) });
  nuevaFuncion(db, { peliculaId: cancelada, salaId, inicioMs: ar(2026, 11, 22, 21), estado: 'cancelada' });
  nuevaFuncion(db, { peliculaId: inactiva, salaId, inicioMs: ar(2026, 11, 23, 21) });

  const titulos = s.listarPeliculas().map((p) => p.titulo);
  assert.deepEqual(titulos, ['Con función']);
});

test('HU1: cada película trae título, género, duración, clasificación y próxima función', () => {
  const { db, s } = crearEntorno();
  const { peliculaId, inicioMs } = escenarioBasico(db, { clasificacion: '+13', duracionMin: 128 });
  const [p] = s.listarPeliculas();
  assert.equal(p.id, peliculaId);
  assert.equal(p.duracionMin, 128);
  assert.equal(p.clasificacion, '+13');
  assert.equal(p.proximaFuncionMs, inicioMs);
});

test('HU2: obtenerPelicula devuelve la película activa y 404 si no existe o está de baja', () => {
  const { db, s } = crearEntorno();
  const { peliculaId } = escenarioBasico(db);
  assert.equal(s.obtenerPelicula(peliculaId).titulo, 'La Última Frontera');
  assert.throws(() => s.obtenerPelicula(999), esError('PELICULA_NO_ENCONTRADA', 404));
  const baja = nuevaPelicula(db, { activa: 0 });
  assert.throws(() => s.obtenerPelicula(baja), esError('PELICULA_NO_ENCONTRADA', 404));
});

// ---------- HU2: funciones ----------

test('HU2: las funciones se listan ordenadas, con disponibilidad y precio, sin pasadas ni canceladas', () => {
  const { db, s } = crearEntorno();
  const salaId = nuevaSala(db);
  const peliculaId = nuevaPelicula(db);
  const tarde = nuevaFuncion(db, { peliculaId, salaId, inicioMs: ar(2026, 11, 21, 21), precioBase: 9000 });
  const temprano = nuevaFuncion(db, { peliculaId, salaId, inicioMs: ar(2026, 11, 20, 15), precioBase: 8000 });
  nuevaFuncion(db, { peliculaId, salaId, inicioMs: ar(2026, 11, 18, 15) }); // pasada
  nuevaFuncion(db, { peliculaId, salaId, inicioMs: ar(2026, 11, 22, 15), estado: 'cancelada' });

  const fs = s.listarFunciones({ peliculaId });
  assert.deepEqual(fs.map((f) => f.id), [temprano, tarde]);
  assert.equal(fs[0].disponibles, 80);
  assert.equal(fs[0].capacidad, 80);
  assert.equal(fs[0].precioDesde, 8000);
  assert.equal(fs[0].ventaAbierta, true);
  assert.equal(fs[0].sala, 'Sala 1');
});

test('HU2: se puede filtrar por día (hora de Argentina)', () => {
  const { db, s } = crearEntorno();
  const salaId = nuevaSala(db);
  const peliculaId = nuevaPelicula(db);
  const viernes = nuevaFuncion(db, { peliculaId, salaId, inicioMs: ar(2026, 11, 20, 23, 30) }); // 23:30 AR (ya es sábado en UTC)
  nuevaFuncion(db, { peliculaId, salaId, inicioMs: ar(2026, 11, 21, 0, 30) });                 // 00:30 AR del sábado
  assert.deepEqual(s.listarFunciones({ fecha: '2026-11-20' }).map((f) => f.id), [viernes]);
  assert.equal(s.listarFunciones({ fecha: '2026-11-21' }).length, 1);
  assert.throws(() => s.listarFunciones({ fecha: '20/11/2026' }), esError('FECHA_INVALIDA', 400));
});

test('HU2/RN8: una función a menos de 15 min figura con la venta cerrada', () => {
  const { db, s, reloj } = crearEntorno();
  const { funcionId, inicioMs } = escenarioBasico(db);
  reloj.t = inicioMs - 14 * MIN;
  assert.equal(s.listarFunciones({}).find((f) => f.id === funcionId).ventaAbierta, false);
  reloj.t = inicioMs - 15 * MIN;
  assert.equal(s.listarFunciones({}).find((f) => f.id === funcionId).ventaAbierta, true);
});

test('HU2/RN7: el precio "desde" refleja el descuento de los miércoles', () => {
  const { db, s } = crearEntorno();
  const salaId = nuevaSala(db);
  const peliculaId = nuevaPelicula(db);
  nuevaFuncion(db, { peliculaId, salaId, inicioMs: ar(2026, 11, 25, 20), precioBase: 8000 }); // miércoles
  assert.equal(s.listarFunciones({})[0].precioDesde, 6400);
});

// ---------- HU3: mapa de butacas ----------

test('HU3: el mapa de una sala 8x10 tiene 80 butacas, libres al principio', () => {
  const { db, s } = crearEntorno();
  const { funcionId } = escenarioBasico(db);
  const d = s.detalleFuncion(funcionId);
  assert.equal(Object.keys(d.butacas).length, 80);
  assert.equal(d.butacas.A1, 'libre');
  assert.equal(d.butacas.H10, 'libre');
  assert.deepEqual(d.filas, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  assert.equal(d.columnas, 10);
});

test('HU3/RN5: las 2 últimas filas figuran como premium y el detalle trae los 4 precios', () => {
  const { db, s } = crearEntorno();
  const { funcionId } = escenarioBasico(db, { precioBase: 8000 });
  const d = s.detalleFuncion(funcionId);
  assert.deepEqual(d.filasPremium, ['G', 'H']);
  assert.deepEqual(d.precios, { general: 8000, premium: 10000, reducida: 5600, reducidaPremium: 7000 });
});

test('HU3/RN1/RN2: el mapa distingue ocupadas, reservadas por otros y las mías', () => {
  const { db, s, reloj } = crearEntorno();
  const { funcionId } = escenarioBasico(db);
  const ana = s.registrar(datosUsuario()).usuario;
  const beto = s.registrar(datosUsuario({ nombre: 'Beto', email: 'beto@test.com' })).usuario;
  db.prepare("INSERT INTO compras (usuario_id, funcion_id, total, tarjeta_ultimos4, creada_ms) VALUES (?, ?, 8000, '1111', 1)").run(beto.id, funcionId);
  db.prepare("INSERT INTO entradas (compra_id, funcion_id, butaca, tipo, precio, codigo) VALUES (1, ?, 'B2', 'general', 8000, 'CA-AAAAAAAA')").run(funcionId);
  db.prepare('INSERT INTO holds (usuario_id, funcion_id, butacas, expira_ms) VALUES (?, ?, ?, ?)').run(beto.id, funcionId, JSON.stringify(['C3']), reloj.t + 5 * MIN);
  db.prepare('INSERT INTO holds (usuario_id, funcion_id, butacas, expira_ms) VALUES (?, ?, ?, ?)').run(ana.id, funcionId, JSON.stringify(['D4']), reloj.t + 5 * MIN);

  const visitante = s.detalleFuncion(funcionId);
  assert.equal(visitante.butacas.B2, 'ocupada');
  assert.equal(visitante.butacas.C3, 'reservada');
  assert.equal(visitante.butacas.D4, 'reservada');
  assert.equal(visitante.disponibles, 77);

  const comoAna = s.detalleFuncion(funcionId, ana);
  assert.equal(comoAna.butacas.D4, 'mia');
  assert.equal(comoAna.butacas.C3, 'reservada');
});

test('HU3/RN2: una reserva vencida ya no bloquea la butaca', () => {
  const { db, s, reloj } = crearEntorno();
  const { funcionId } = escenarioBasico(db);
  const ana = s.registrar(datosUsuario()).usuario;
  db.prepare('INSERT INTO holds (usuario_id, funcion_id, butacas, expira_ms) VALUES (?, ?, ?, ?)').run(ana.id, funcionId, JSON.stringify(['D4']), reloj.t + 5 * MIN);
  assert.equal(s.detalleFuncion(funcionId).butacas.D4, 'reservada');
  reloj.t += 5 * MIN; // vence exactamente a los 5 minutos
  assert.equal(s.detalleFuncion(funcionId).butacas.D4, 'libre');
});

test('HU3: una función inexistente da 404', () => {
  const { s } = crearEntorno();
  assert.throws(() => s.detalleFuncion(12345), esError('FUNCION_NO_ENCONTRADA', 404));
});

// ---------- Datos de demostración ----------

test('siembra: crea 3 salas (80/80/48 butacas), películas y funciones futuras sin superposición', () => {
  const { db, reloj } = crearEntorno();
  sembrarDemo({ db, ahora: () => reloj.t });
  const salas = db.prepare('SELECT nombre, filas * columnas AS cap FROM salas ORDER BY id').all();
  assert.deepEqual(salas.map((x) => x.cap), [80, 80, 48]);
  assert.ok(db.prepare('SELECT COUNT(*) n FROM peliculas').get().n >= 6);

  const fns = db.prepare(
    'SELECT f.sala_id, f.inicio_ms AS inicioMs, p.duracion_min AS duracionMin FROM funciones f JOIN peliculas p ON p.id = f.pelicula_id',
  ).all();
  assert.ok(fns.length > 30);
  assert.ok(fns.every((f) => f.inicioMs > reloj.t), 'todas son futuras');
  for (const f of fns) {
    const otras = fns.filter((o) => o !== f && o.sala_id === f.sala_id);
    assert.equal(haySolapamiento(otras, f), false);
  }
});

test('siembra: es idempotente (correrla de nuevo no duplica nada)', () => {
  const { db, reloj } = crearEntorno();
  sembrarDemo({ db, ahora: () => reloj.t });
  const antes = db.prepare('SELECT COUNT(*) n FROM funciones').get().n;
  sembrarDemo({ db, ahora: () => reloj.t });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM funciones').get().n, antes);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM salas').get().n, 3);
});
