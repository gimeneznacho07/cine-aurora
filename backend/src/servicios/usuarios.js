'use strict';
const { ErrorNegocio } = require('../errores');
const { esViolacionUnica } = require('../db');
const { CONFIG, fechaIsoValida, edadEn } = require('../reglas');
const { hashPassword, verificarPassword, HASH_DE_RELLENO, firmarToken, leerToken } = require('../auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Cuentas, sesión y roles (RN15). */
module.exports = function usuarios({ db, ahora, secreto }) {
  // email -> { n: intentos fallidos, hasta: instante hasta el que está bloqueado }
  const intentos = new Map();

  const publico = (u) => ({
    id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, fechaNacimiento: u.fecha_nac,
  });

  const emitirToken = (u) =>
    firmarToken({ uid: u.id, exp: ahora() + CONFIG.SESION_MS }, secreto);

  const normalizarEmail = (e) => String(e ?? '').trim().toLowerCase();

  function registrar({ nombre, email, password, fechaNacimiento } = {}) {
    const nom = String(nombre ?? '').trim();
    if (nom.length < 2 || nom.length > 60) throw new ErrorNegocio('NOMBRE_INVALIDO', 'El nombre debe tener entre 2 y 60 caracteres.');
    const mail = normalizarEmail(email);
    if (!EMAIL_RE.test(mail) || mail.length > 120) throw new ErrorNegocio('EMAIL_INVALIDO', 'El email no es válido.');
    if (typeof password !== 'string' || password.length < CONFIG.PASSWORD_MIN) {
      throw new ErrorNegocio('PASSWORD_CORTA', `La contraseña debe tener al menos ${CONFIG.PASSWORD_MIN} caracteres.`);
    }
    if (!fechaIsoValida(fechaNacimiento)) {
      throw new ErrorNegocio('FECHA_NACIMIENTO_INVALIDA', 'La fecha de nacimiento no es válida (formato AAAA-MM-DD).');
    }
    const edad = edadEn(fechaNacimiento, ahora());
    if (edad < 0 || edad > 120) throw new ErrorNegocio('FECHA_NACIMIENTO_INVALIDA', 'La fecha de nacimiento no es válida.');

    let id;
    try {
      id = db.prepare('INSERT INTO usuarios (nombre, email, pass_hash, fecha_nac) VALUES (?, ?, ?, ?)')
        .run(nom, mail, hashPassword(password), fechaNacimiento).lastInsertRowid;
    } catch (e) {
      if (esViolacionUnica(e)) throw new ErrorNegocio('EMAIL_EXISTENTE', 'Ya existe una cuenta con ese email.', 409);
      throw e;
    }
    const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    return { token: emitirToken(u), usuario: publico(u) };
  }

  function iniciarSesion({ email, password } = {}) {
    const mail = normalizarEmail(email);
    const t = ahora();
    const estado = intentos.get(mail);
    if (estado?.hasta > t) {
      const minutos = Math.ceil((estado.hasta - t) / 60000);
      throw new ErrorNegocio('CUENTA_BLOQUEADA', `Demasiados intentos fallidos. Probá de nuevo en ${minutos} min.`, 429);
    }
    if (estado && estado.hasta > 0 && estado.hasta <= t) intentos.delete(mail); // el bloqueo ya terminó

    const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(mail);
    const ok = verificarPassword(String(password ?? ''), u ? u.pass_hash : HASH_DE_RELLENO) && !!u;
    if (!ok) {
      const actual = intentos.get(mail) ?? { n: 0, hasta: 0 };
      actual.n += 1;
      if (actual.n >= CONFIG.LOGIN_MAX_INTENTOS) { actual.n = 0; actual.hasta = t + CONFIG.LOGIN_BLOQUEO_MS; }
      intentos.set(mail, actual);
      throw new ErrorNegocio('CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.', 401);
    }
    intentos.delete(mail);
    return { token: emitirToken(u), usuario: publico(u) };
  }

  /** Devuelve el usuario completo (fila de la base) dueño del token, o lanza 401. */
  function usuarioDesdeToken(token) {
    const payload = leerToken(token, secreto, ahora());
    const u = payload && db.prepare('SELECT * FROM usuarios WHERE id = ?').get(payload.uid);
    if (!u) throw new ErrorNegocio('NO_AUTENTICADO', 'Tenés que iniciar sesión.', 401);
    return u;
  }

  function exigirAdmin(usuario) {
    if (usuario?.rol !== 'admin') throw new ErrorNegocio('PROHIBIDO', 'Esta acción es solo para administradores.', 403);
  }

  /** Crea el administrador inicial si no existe. Devuelve true si lo creó. */
  function asegurarAdmin({ email, password } = {}) {
    const mail = normalizarEmail(email);
    if (!mail || typeof password !== 'string' || password.length < CONFIG.PASSWORD_MIN) return false;
    if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(mail)) return false;
    db.prepare("INSERT INTO usuarios (nombre, email, pass_hash, fecha_nac, rol) VALUES ('Administración', ?, ?, '1990-01-01', 'admin')")
      .run(mail, hashPassword(password));
    return true;
  }

  return { registrar, iniciarSesion, usuarioDesdeToken, exigirAdmin, asegurarAdmin, publicoDe: publico };
};
