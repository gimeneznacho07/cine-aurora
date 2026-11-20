'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MIN, HORA, crearEntorno, datosUsuario, esError } = require('./helpers');

test('HU4/RN15: registro correcto devuelve token y usuario sin datos sensibles', () => {
  const { s } = crearEntorno();
  const r = s.registrar(datosUsuario());
  assert.ok(r.token);
  assert.equal(r.usuario.email, 'ana@test.com');
  assert.equal(r.usuario.rol, 'cliente');
  assert.equal(r.usuario.pass_hash, undefined);
  assert.equal(r.usuario.passHash, undefined);
});

test('RN15: la contraseña se guarda con hash scrypt, nunca en texto', () => {
  const { s, db } = crearEntorno();
  s.registrar(datosUsuario({ password: 'MiClaveSecreta1' }));
  const fila = db.prepare('SELECT pass_hash FROM usuarios').get();
  assert.match(fila.pass_hash, /^scrypt\$/);
  assert.ok(!fila.pass_hash.includes('MiClaveSecreta1'));
});

test('RN15: el email es único sin distinguir mayúsculas ni espacios', () => {
  const { s } = crearEntorno();
  s.registrar(datosUsuario());
  assert.throws(() => s.registrar(datosUsuario({ email: '  ANA@test.com ' })), esError('EMAIL_EXISTENTE', 409));
});

test('RN15: contraseña de menos de 8 caracteres se rechaza; de exactamente 8 se acepta', () => {
  const { s } = crearEntorno();
  assert.throws(() => s.registrar(datosUsuario({ password: '1234567' })), esError('PASSWORD_CORTA', 400));
  assert.doesNotThrow(() => s.registrar(datosUsuario({ password: '12345678' })));
});

test('HU4: se validan nombre, email y fecha de nacimiento', () => {
  const { s } = crearEntorno();
  assert.throws(() => s.registrar(datosUsuario({ nombre: ' ' })), esError('NOMBRE_INVALIDO', 400));
  assert.throws(() => s.registrar(datosUsuario({ email: 'no-es-un-email' })), esError('EMAIL_INVALIDO', 400));
  assert.throws(() => s.registrar(datosUsuario({ fechaNacimiento: '1995-02-30' })), esError('FECHA_NACIMIENTO_INVALIDA', 400));
  assert.throws(() => s.registrar(datosUsuario({ fechaNacimiento: '2030-01-01' })), esError('FECHA_NACIMIENTO_INVALIDA', 400));
  assert.throws(() => s.registrar(datosUsuario({ fechaNacimiento: '1890-01-01' })), esError('FECHA_NACIMIENTO_INVALIDA', 400));
  assert.throws(() => s.registrar({}), esError('NOMBRE_INVALIDO', 400));
});

test('HU5: login correcto devuelve token que identifica al usuario', () => {
  const { s } = crearEntorno();
  s.registrar(datosUsuario());
  const r = s.iniciarSesion({ email: 'ANA@test.com', password: 'clave1234' });
  assert.equal(s.usuarioDesdeToken(r.token).email, 'ana@test.com');
});

test('HU5: contraseña o email incorrectos dan el mismo error (no revela si el email existe)', () => {
  const { s } = crearEntorno();
  s.registrar(datosUsuario());
  let e1, e2;
  try { s.iniciarSesion({ email: 'ana@test.com', password: 'mal' }); } catch (e) { e1 = e; }
  try { s.iniciarSesion({ email: 'nadie@test.com', password: 'mal' }); } catch (e) { e2 = e; }
  assert.equal(e1.codigo, 'CREDENCIALES_INVALIDAS');
  assert.equal(e1.status, 401);
  assert.equal(e2.codigo, 'CREDENCIALES_INVALIDAS');
  assert.equal(e1.message, e2.message);
});

test('RN15: tras 5 intentos fallidos la cuenta se bloquea 5 minutos, incluso con la clave correcta', () => {
  const { s, reloj } = crearEntorno();
  s.registrar(datosUsuario());
  for (let i = 0; i < 5; i++) {
    assert.throws(() => s.iniciarSesion({ email: 'ana@test.com', password: 'mal' }), esError('CREDENCIALES_INVALIDAS', 401));
  }
  assert.throws(() => s.iniciarSesion({ email: 'ana@test.com', password: 'clave1234' }), esError('CUENTA_BLOQUEADA', 429));
  reloj.t += 5 * MIN - 1;
  assert.throws(() => s.iniciarSesion({ email: 'ana@test.com', password: 'clave1234' }), esError('CUENTA_BLOQUEADA', 429));
  reloj.t += 1; // pasaron exactamente 5 minutos
  assert.ok(s.iniciarSesion({ email: 'ana@test.com', password: 'clave1234' }).token);
});

test('RN15: 4 fallos y un acierto reinician el contador', () => {
  const { s } = crearEntorno();
  s.registrar(datosUsuario());
  for (let i = 0; i < 4; i++) assert.throws(() => s.iniciarSesion({ email: 'ana@test.com', password: 'mal' }));
  s.iniciarSesion({ email: 'ana@test.com', password: 'clave1234' });
  for (let i = 0; i < 4; i++) assert.throws(() => s.iniciarSesion({ email: 'ana@test.com', password: 'mal' }), esError('CREDENCIALES_INVALIDAS'));
  assert.ok(s.iniciarSesion({ email: 'ana@test.com', password: 'clave1234' }).token);
});

test('sesión: el token manipulado, vencido o ausente no sirve', () => {
  const { s, reloj } = crearEntorno();
  const { token } = s.registrar(datosUsuario());
  assert.throws(() => s.usuarioDesdeToken(undefined), esError('NO_AUTENTICADO', 401));
  assert.throws(() => s.usuarioDesdeToken('basura'), esError('NO_AUTENTICADO', 401));
  const [cuerpo, firma] = token.split('.');
  const adulterado = Buffer.from(JSON.stringify({ uid: 1, exp: Date.now() + 1e12, rol: 'admin' })).toString('base64url');
  assert.throws(() => s.usuarioDesdeToken(`${adulterado}.${firma}`), esError('NO_AUTENTICADO', 401));
  assert.ok(cuerpo);
  reloj.t += 12 * HORA + 1;
  assert.throws(() => s.usuarioDesdeToken(token), esError('NO_AUTENTICADO', 401));
});

test('RN15: solo el administrador pasa exigirAdmin', () => {
  const { s } = crearEntorno();
  const cliente = s.registrar(datosUsuario()).usuario;
  assert.throws(() => s.exigirAdmin(cliente), esError('PROHIBIDO', 403));
  s.asegurarAdmin({ email: 'admin@cine.test', password: 'adminclave1' });
  const admin = s.iniciarSesion({ email: 'admin@cine.test', password: 'adminclave1' }).usuario;
  assert.equal(admin.rol, 'admin');
  assert.doesNotThrow(() => s.exigirAdmin(admin));
});

test('asegurarAdmin es idempotente y no crea nada si faltan datos', () => {
  const { s, db } = crearEntorno();
  s.asegurarAdmin({ email: 'admin@cine.test', password: 'adminclave1' });
  s.asegurarAdmin({ email: 'admin@cine.test', password: 'adminclave1' });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM usuarios WHERE rol='admin'").get().n, 1);
  assert.equal(s.asegurarAdmin({}), false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM usuarios').get().n, 1);
});
