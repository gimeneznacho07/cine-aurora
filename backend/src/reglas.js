'use strict';
/**
 * Reglas de negocio PURAS (sin base de datos ni reloj propio).
 * Acá viven todos los números de la spec (docs/spec.md). El resto del código los importa de acá.
 */

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const ZONA = 'America/Argentina/Buenos_Aires';

const CONFIG = Object.freeze({
  RESERVA_MS: 5 * MIN,                 // RN2
  MAX_ENTRADAS: 6,                     // RN3
  MAX_REDUCIDAS: 2,                    // RN6
  FILAS_PREMIUM: 2,                    // RN5
  RECARGO_PREMIUM: 0.25,               // RN5
  DESCUENTO_REDUCIDA: 0.30,            // RN6
  DESCUENTO_MIERCOLES: 0.20,           // RN7
  CIERRE_VENTA_MS: 15 * MIN,           // RN8
  CANCELACION_MINIMA_MS: 2 * HORA,     // RN10
  CANCELACION_TOTAL_MS: 24 * HORA,     // RN10
  REEMBOLSO_PARCIAL: 0.5,              // RN10
  LIMPIEZA_MS: 15 * MIN,               // RN11
  VALIDACION_ANTICIPO_MS: 60 * MIN,    // RN13
  PASSWORD_MIN: 8,                     // RN15
  LOGIN_MAX_INTENTOS: 5,               // RN15
  LOGIN_BLOQUEO_MS: 5 * MIN,           // RN15
  SESION_MS: 12 * HORA,
  TIPOS_ENTRADA: ['general', 'reducida'],
  FORMATOS: ['2D', '3D'],
  CLASIFICACIONES: { ATP: 0, '+13': 13, '+16': 16, '+18': 18 }, // RN9
  TARJETA_RECHAZADA: '4000000000000002', // RN14 (solo para el simulador)
});

// ---------- Fechas en hora de Argentina (UTC-3 fijo, sin horario de verano) ----------

const formateadorFecha = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
});

/** Año, mes, día y día de la semana ('Mon'..'Sun') de un instante, en hora de Argentina. */
function partesAR(ms) {
  const o = {};
  for (const p of formateadorFecha.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { anio: Number(o.year), mes: Number(o.month), dia: Number(o.day), diaSemana: o.weekday };
}

/** Instante (ms UTC) en que empieza un día calendario argentino (00:00 AR). */
function inicioDiaAR(anio, mes, dia) {
  return Date.UTC(anio, mes - 1, dia, 3, 0, 0);
}

function fechaIsoValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

// ---------- Butacas (RN1, RN3, RN5) ----------

/** 'C7' -> { fila: 2, columna: 7 } si existe en una sala de filas × columnas; si no, null. */
function parsearButaca(id, filas, columnas) {
  if (typeof id !== 'string') return null;
  const m = /^([A-Z])([1-9]\d?)$/.exec(id);
  if (!m) return null;
  const fila = m[1].charCodeAt(0) - 65;
  const columna = Number(m[2]);
  if (fila >= filas || columna > columnas) return null;
  return { fila, columna };
}

function esPremium(id, filas, columnas) {
  const p = parsearButaca(id, filas, columnas);
  return p !== null && p.fila >= filas - CONFIG.FILAS_PREMIUM;
}

function cantidadValida(n) {
  return Number.isInteger(n) && n >= 1 && n <= CONFIG.MAX_ENTRADAS;
}

// ---------- Precios (RN5, RN6, RN7) ----------

function calcularPrecio({ precioBase, premium, tipo, inicioMs }) {
  const bruto = precioBase * (premium ? 1 + CONFIG.RECARGO_PREMIUM : 1);
  const descReducida = tipo === 'reducida' ? CONFIG.DESCUENTO_REDUCIDA : 0;
  const descMiercoles = partesAR(inicioMs).diaSemana === 'Wed' ? CONFIG.DESCUENTO_MIERCOLES : 0;
  const descuento = Math.max(descReducida, descMiercoles); // RN7: no se acumulan
  return Math.round(bruto * (1 - descuento));
}

// ---------- Venta, edad y cancelación (RN8, RN9, RN10) ----------

function ventaAbierta(inicioMs, ahoraMs) {
  return ahoraMs <= inicioMs - CONFIG.CIERRE_VENTA_MS;
}

function edadMinima(clasificacion) {
  if (!(clasificacion in CONFIG.CLASIFICACIONES)) throw new Error(`Clasificación desconocida: ${clasificacion}`);
  return CONFIG.CLASIFICACIONES[clasificacion];
}

/** Edad cumplida en años a la fecha `ahoraMs` (hora AR). `fechaNac` = 'YYYY-MM-DD'. */
function edadEn(fechaNac, ahoraMs) {
  const [a, m, d] = fechaNac.split('-').map(Number);
  const hoy = partesAR(ahoraMs);
  let edad = hoy.anio - a;
  if (hoy.mes < m || (hoy.mes === m && hoy.dia < d)) edad -= 1;
  return edad;
}

function calcularReembolso({ montoPagado, inicioMs, ahoraMs }) {
  const falta = inicioMs - ahoraMs;
  if (falta < CONFIG.CANCELACION_MINIMA_MS) {
    return { permitido: false, porcentaje: 0, monto: 0 };
  }
  if (falta >= CONFIG.CANCELACION_TOTAL_MS) {
    return { permitido: true, porcentaje: 100, monto: montoPagado };
  }
  return { permitido: true, porcentaje: 50, monto: Math.round(montoPagado * CONFIG.REEMBOLSO_PARCIAL) };
}

// ---------- Programación y puerta (RN11, RN13) ----------

function rangoOcupacion({ inicioMs, duracionMin }) {
  return { desde: inicioMs, hasta: inicioMs + duracionMin * MIN + CONFIG.LIMPIEZA_MS };
}

/** ¿La función `nueva` pisa a alguna de `existentes` (misma sala)? Dos rangos que solo se tocan en el borde no se pisan. */
function haySolapamiento(existentes, nueva) {
  const b = rangoOcupacion(nueva);
  return existentes.some((e) => {
    const a = rangoOcupacion(e);
    return a.desde < b.hasta && b.desde < a.hasta;
  });
}

function ventanaValidacion(inicioMs, duracionMin) {
  return { desdeMs: inicioMs - CONFIG.VALIDACION_ANTICIPO_MS, hastaMs: inicioMs + duracionMin * MIN };
}

// ---------- Pago simulado (RN14) ----------

function luhnValido(numero) {
  const limpio = String(numero).replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(limpio)) return false;
  let suma = 0;
  let doble = false;
  for (let i = limpio.length - 1; i >= 0; i--) {
    let d = Number(limpio[i]);
    if (doble) { d *= 2; if (d > 9) d -= 9; }
    suma += d;
    doble = !doble;
  }
  return suma % 10 === 0;
}

/** 'MM/AA' vigente hasta el último día del mes indicado. */
function vencimientoVigente(texto, ahoraMs) {
  const m = /^(\d{2})\/(\d{2})$/.exec(String(texto));
  if (!m) return false;
  const mes = Number(m[1]);
  const anio = 2000 + Number(m[2]);
  if (mes < 1 || mes > 12) return false;
  const hoy = partesAR(ahoraMs);
  return anio > hoy.anio || (anio === hoy.anio && mes >= hoy.mes);
}

module.exports = {
  MIN, HORA, ZONA, CONFIG,
  partesAR, inicioDiaAR, fechaIsoValida,
  parsearButaca, esPremium, cantidadValida,
  calcularPrecio, ventaAbierta, edadMinima, edadEn, calcularReembolso,
  rangoOcupacion, haySolapamiento, ventanaValidacion,
  luhnValido, vencimientoVigente,
};
