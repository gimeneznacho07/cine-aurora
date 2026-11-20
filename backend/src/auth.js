'use strict';
const crypto = require('node:crypto');

/** Hash de contraseña con scrypt y sal aleatoria: "scrypt$<sal>$<hash>". */
function hashPassword(password) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, sal, 64);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

function verificarPassword(password, almacenado) {
  const [algoritmo, salHex, hashHex] = String(almacenado).split('$');
  if (algoritmo !== 'scrypt' || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const hash = crypto.scryptSync(password, Buffer.from(salHex, 'hex'), esperado.length);
  return crypto.timingSafeEqual(hash, esperado);
}

/** Hash de relleno para que "email inexistente" tarde lo mismo que "clave incorrecta". */
const HASH_DE_RELLENO = hashPassword(crypto.randomBytes(8).toString('hex'));

/** Token firmado: "<payload base64url>.<firma HMAC-SHA256>". */
function firmarToken(payload, secreto) {
  const cuerpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const firma = crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

/** Devuelve el payload si la firma es válida y no venció; si no, null. */
function leerToken(token, secreto, ahoraMs) {
  if (typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [cuerpo, firma] = partes;
  const esperada = crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp <= ahoraMs) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { hashPassword, verificarPassword, HASH_DE_RELLENO, firmarToken, leerToken };
