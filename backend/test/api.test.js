'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { crearApp } = require('../src/http/app');
const { ar, AHORA, MIN, HORA, escenarioBasico, nuevaSala, nuevaPelicula, nuevaFuncion } = require('./helpers');

const TARJETA = { numero: '4111 1111 1111 1111', titular: 'ANA PEREZ', vencimiento: '12/27', cvv: '123' };

/** Levanta la app real en un puerto libre, con base en memoria y reloj falso. */
async function iniciar(opciones = {}) {
  const reloj = { t: AHORA };
  const app = crearApp({
    ruta: ':memory:', ahora: () => reloj.t, secreto: 'secreto-de-test',
    adminInicial: { email: 'admin@cine.test', password: 'adminclave1' }, ...opciones,
  });
  await new Promise((ok) => app.servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${app.servidor.address().port}`;
  const llamar = async (metodo, ruta, { token, body, headers = {} } = {}) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* no es JSON */ }
    return { status: r.status, json, texto, headers: r.headers };
  };
  const cerrar = () => new Promise((ok) => { app.servidor.closeAllConnections(); app.servidor.close(ok); });
  return { ...app, reloj, base, llamar, cerrar };
}

async function registrar(api, email = 'ana@test.com', nombre = 'Ana Pérez') {
  const r = await api.llamar('POST', '/api/auth/registro', { body: { nombre, email, password: 'clave1234', fechaNacimiento: '1995-05-10' } });
  assert.equal(r.status, 201);
  return r.json.token;
}

async function adminToken(api) {
  const r = await api.llamar('POST', '/api/auth/login', { body: { email: 'admin@cine.test', password: 'adminclave1' } });
  assert.equal(r.status, 200);
  return r.json.token;
}

test('salud: responde ok', async () => {
  const api = await iniciar();
  try {
    const r = await api.llamar('GET', '/api/salud');
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
  } finally { await api.cerrar(); }
});

test('RN15: registro, login y /yo; sin token o con token inválido da 401', async () => {
  const api = await iniciar();
  try {
    const token = await registrar(api);
    const yo = await api.llamar('GET', '/api/yo', { token });
    assert.equal(yo.json.usuario.email, 'ana@test.com');
    assert.equal(yo.json.usuario.pass_hash, undefined);
    assert.equal((await api.llamar('GET', '/api/yo')).status, 401);
    assert.equal((await api.llamar('GET', '/api/yo', { token: 'basura' })).status, 401);
    const dup = await api.llamar('POST', '/api/auth/registro', { body: { nombre: 'Ana', email: 'ana@test.com', password: 'clave1234', fechaNacimiento: '1995-05-10' } });
    assert.equal(dup.status, 409);
    assert.equal(dup.json.error.codigo, 'EMAIL_EXISTENTE');
    const mal = await api.llamar('POST', '/api/auth/login', { body: { email: 'ana@test.com', password: 'incorrecta' } });
    assert.equal(mal.status, 401);
    assert.equal(mal.json.error.codigo, 'CREDENCIALES_INVALIDAS');
  } finally { await api.cerrar(); }
});

test('flujo completo del cliente: cartelera → butacas → reserva → compra → mis entradas → cancelar', async () => {
  const api = await iniciar();
  try {
    const { funcionId, peliculaId } = escenarioBasico(api.db, { precioBase: 8000 });
    const token = await registrar(api);

    const cartelera = await api.llamar('GET', '/api/peliculas');
    assert.equal(cartelera.json.peliculas.length, 1);
    assert.equal((await api.llamar('GET', `/api/peliculas/${peliculaId}`)).json.pelicula.id, peliculaId);
    const fs = await api.llamar('GET', `/api/funciones?peliculaId=${peliculaId}`);
    assert.equal(fs.json.funciones[0].disponibles, 80);
    const mapa = await api.llamar('GET', `/api/funciones/${funcionId}`);
    assert.equal(Object.keys(mapa.json.butacas).length, 80);

    const res = await api.llamar('POST', `/api/funciones/${funcionId}/reserva`, { token, body: { butacas: ['A1', 'G1'] } });
    assert.equal(res.status, 201);
    assert.equal(res.json.reserva.butacas.length, 2);
    assert.equal((await api.llamar('GET', '/api/reserva', { token })).json.reserva.id, res.json.reserva.id);
    assert.equal((await api.llamar('GET', `/api/funciones/${funcionId}`, { token })).json.butacas.A1, 'mia');

    const compra = await api.llamar('POST', '/api/compras', { token, body: { tipos: { G1: 'reducida' }, tarjeta: TARJETA } });
    assert.equal(compra.status, 201);
    assert.equal(compra.json.total, 15000);
    assert.equal(JSON.stringify(compra.json).includes('4111'), false, 'la respuesta no devuelve el número de tarjeta');
    assert.equal((await api.llamar('GET', '/api/reserva', { token })).json.reserva, null);

    const mis = await api.llamar('GET', '/api/mis-entradas', { token });
    assert.equal(mis.json.entradas.length, 2);
    const id = mis.json.entradas[0].id;
    const cancelacion = await api.llamar('POST', `/api/entradas/${id}/cancelar`, { token });
    assert.equal(cancelacion.status, 200);
    assert.equal(cancelacion.json.reembolso, 8000);
    assert.equal((await api.llamar('POST', `/api/entradas/${id}/cancelar`, { token })).status, 409);
  } finally { await api.cerrar(); }
});

test('HU6/RN1: dos clientes piden la misma butaca a la vez: uno obtiene 201 y el otro 409', async () => {
  const api = await iniciar();
  try {
    const { funcionId } = escenarioBasico(api.db);
    const t1 = await registrar(api, 'ana@test.com', 'Ana');
    const t2 = await registrar(api, 'beto@test.com', 'Beto');
    const [r1, r2] = await Promise.all([
      api.llamar('POST', `/api/funciones/${funcionId}/reserva`, { token: t1, body: { butacas: ['E5'] } }),
      api.llamar('POST', `/api/funciones/${funcionId}/reserva`, { token: t2, body: { butacas: ['E5'] } }),
    ]);
    assert.deepEqual([r1.status, r2.status].sort(), [201, 409]);
    const perdedor = [r1, r2].find((r) => r.status === 409);
    assert.equal(perdedor.json.error.codigo, 'BUTACA_NO_DISPONIBLE');
  } finally { await api.cerrar(); }
});

test('HU6: reservar y comprar exigen sesión', async () => {
  const api = await iniciar();
  try {
    const { funcionId } = escenarioBasico(api.db);
    assert.equal((await api.llamar('POST', `/api/funciones/${funcionId}/reserva`, { body: { butacas: ['A1'] } })).status, 401);
    assert.equal((await api.llamar('POST', '/api/compras', { body: { tarjeta: TARJETA } })).status, 401);
    assert.equal((await api.llamar('GET', '/api/mis-entradas')).status, 401);
  } finally { await api.cerrar(); }
});

test('RN15: las rutas de administración devuelven 401 sin sesión y 403 a un cliente', async () => {
  const api = await iniciar();
  try {
    const cliente = await registrar(api);
    const rutas = [
      ['GET', '/api/admin/peliculas'], ['POST', '/api/admin/peliculas'], ['DELETE', '/api/admin/peliculas/1'],
      ['GET', '/api/admin/salas'], ['POST', '/api/admin/funciones'], ['POST', '/api/admin/funciones/1/cancelar'],
      ['POST', '/api/admin/validar'], ['GET', '/api/admin/reporte'],
    ];
    for (const [m, r] of rutas) {
      assert.equal((await api.llamar(m, r, { body: m === 'POST' ? {} : undefined })).status, 401, `${m} ${r} sin sesión`);
      assert.equal((await api.llamar(m, r, { token: cliente, body: m === 'POST' ? {} : undefined })).status, 403, `${m} ${r} como cliente`);
    }
  } finally { await api.cerrar(); }
});

test('administración de punta a punta: película, función, solapamiento, venta, validación y reporte', async () => {
  const api = await iniciar();
  try {
    const admin = await adminToken(api);
    const sala = nuevaSala(api.db, 'Sala 1');
    const pel = await api.llamar('POST', '/api/admin/peliculas', { token: admin, body: { titulo: 'Estreno', duracionMin: 120, clasificacion: '+13', genero: 'Drama' } });
    assert.equal(pel.status, 201);
    const peliculaId = pel.json.pelicula.id;
    const nueva = (h, m) => api.llamar('POST', '/api/admin/funciones', {
      token: admin, body: { peliculaId, salaId: sala, inicio: new Date(ar(2026, 11, 20, h, m)).toISOString(), formato: '2D', precioBase: 8000 },
    });
    const f = await nueva(21, 0);
    assert.equal(f.status, 201);
    const choque = await nueva(22, 0);
    assert.equal(choque.status, 409);
    assert.equal(choque.json.error.codigo, 'SOLAPAMIENTO');

    const cliente = await registrar(api);
    const funcionId = f.json.funcion.id;
    await api.llamar('POST', `/api/funciones/${funcionId}/reserva`, { token: cliente, body: { butacas: ['C3'] } });
    const compra = await api.llamar('POST', '/api/compras', { token: cliente, body: { tarjeta: TARJETA } });
    const codigo = compra.json.entradas[0].codigo;

    api.reloj.t = ar(2026, 11, 20, 20, 30);
    const admin2 = await adminToken(api); // el reloj saltó ~29 h: la sesión anterior (12 h, RN15) ya venció
    assert.equal((await api.llamar('GET', '/api/yo', { token: admin })).status, 401, 'RN15: el token vencido no sirve');
    const ok = await api.llamar('POST', '/api/admin/validar', { token: admin2, body: { codigo } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.entrada.estado, 'usada');
    assert.equal((await api.llamar('POST', '/api/admin/validar', { token: admin2, body: { codigo } })).status, 409);

    const rep = await api.llamar('GET', '/api/admin/reporte', { token: admin2 });
    assert.equal(rep.json.totales.entradasVendidas, 1);
    assert.equal(rep.json.totales.recaudacionNeta, 8000);

    api.reloj.t = ar(2026, 11, 20, 21, 30); // la función de las 21:00 ya comenzó
    assert.equal((await api.llamar('POST', `/api/admin/funciones/${funcionId}/cancelar`, { token: admin2 })).status, 422, 'ya comenzó');
    assert.equal((await api.llamar('DELETE', `/api/admin/peliculas/${peliculaId}`, { token: admin2 })).status, 200, 'la función ya pasó: se puede dar de baja');
  } finally { await api.cerrar(); }
});

test('la app crea el administrador inicial a partir de la configuración', async () => {
  const api = await iniciar();
  try {
    const admin = await adminToken(api);
    assert.equal((await api.llamar('GET', '/api/yo', { token: admin })).json.usuario.rol, 'admin');
  } finally { await api.cerrar(); }
});

test('errores: JSON inválido 400, cuerpo enorme 413, ruta inexistente 404, método no permitido 405', async () => {
  const api = await iniciar();
  try {
    const json = await api.llamar('POST', '/api/auth/login', { body: '{no es json' });
    assert.equal(json.status, 400);
    assert.equal(json.json.error.codigo, 'JSON_INVALIDO');
    const grande = await api.llamar('POST', '/api/auth/login', { body: JSON.stringify({ email: 'x'.repeat(200_000) }) });
    assert.equal(grande.status, 413);
    const no = await api.llamar('GET', '/api/no-existe');
    assert.equal(no.status, 404);
    assert.equal(no.json.error.codigo, 'RUTA_NO_ENCONTRADA');
    const metodo = await api.llamar('DELETE', '/api/peliculas');
    assert.equal(metodo.status, 405);
    const id = await api.llamar('GET', '/api/funciones/abc');
    assert.equal(id.status, 400);
    assert.equal(id.json.error.codigo, 'ID_INVALIDO');
    assert.equal(no.json.error.mensaje.includes('at '), false, 'nunca se filtra un stack trace');
  } finally { await api.cerrar(); }
});

test('CORS: con FRONTEND_URL solo se acepta ese origen; sin configurar no se agregan cabeceras', async () => {
  const con = await iniciar({ frontendUrl: 'https://mi-cine.netlify.app' });
  try {
    const bien = await con.llamar('GET', '/api/salud', { headers: { origin: 'https://mi-cine.netlify.app' } });
    assert.equal(bien.headers.get('access-control-allow-origin'), 'https://mi-cine.netlify.app');
    const mal = await con.llamar('GET', '/api/salud', { headers: { origin: 'https://sitio-malicioso.com' } });
    assert.equal(mal.headers.get('access-control-allow-origin'), null);
    const pre = await con.llamar('OPTIONS', '/api/compras', { headers: { origin: 'https://mi-cine.netlify.app', 'access-control-request-method': 'POST' } });
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get('access-control-allow-headers'), /authorization/i);
    const preMal = await con.llamar('OPTIONS', '/api/compras', { headers: { origin: 'https://sitio-malicioso.com' } });
    assert.equal(preMal.headers.get('access-control-allow-origin'), null);
  } finally { await con.cerrar(); }

  const sin = await iniciar();
  try {
    const r = await sin.llamar('GET', '/api/salud', { headers: { origin: 'https://cualquiera.com' } });
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  } finally { await sin.cerrar(); }
});

test('estáticos: sirve el frontend y no deja salir de su carpeta', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cine-front-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<h1>Cine Aurora</h1>');
  fs.writeFileSync(path.join(dir, 'app.js'), 'console.log(1)');
  const api = await iniciar({ frontendDir: dir });
  try {
    const raiz = await api.llamar('GET', '/');
    assert.equal(raiz.status, 200);
    assert.match(raiz.headers.get('content-type'), /text\/html/);
    assert.match(raiz.texto, /Cine Aurora/);
    const js = await api.llamar('GET', '/app.js');
    assert.match(js.headers.get('content-type'), /javascript/);
    assert.equal(raiz.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await api.llamar('GET', '/no-esta.js')).status, 404);

    // Intento de path traversal con una petición cruda (fetch normalizaría la ruta)
    const estado = await new Promise((ok, fallo) => {
      const req = http.request({ host: '127.0.0.1', port: api.servidor.address().port, path: '/..%2f..%2fpackage.json', method: 'GET' }, (res) => { res.resume(); ok(res.statusCode); });
      req.on('error', fallo); req.end();
    });
    assert.ok([400, 403, 404].includes(estado), `traversal devolvió ${estado}`);
  } finally { await api.cerrar(); fs.rmSync(dir, { recursive: true, force: true }); }
});
