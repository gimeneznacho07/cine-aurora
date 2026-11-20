'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { ErrorNegocio } = require('../errores');
const { abrirDb } = require('../db');
const { crearServicios } = require('../servicios');
const { sembrarDemo } = require('../seed');

const MAX_CUERPO = 100 * 1024; // 100 KB: de sobra para cualquier pedido de esta API

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Arma la aplicación completa (base de datos, servicios y servidor HTTP) sin ponerla a escuchar.
 * Todo lo que cambia entre entornos entra por parámetro: así los tests usan base en memoria y reloj falso.
 */
function crearApp({
  ruta = ':memory:', ahora = Date.now, secreto, adminInicial, frontendUrl, frontendDir, sembrar = false,
} = {}) {
  const db = abrirDb(ruta);
  const s = crearServicios({ db, ahora, secreto });
  if (adminInicial) s.asegurarAdmin(adminInicial);
  if (sembrar) sembrarDemo({ db, ahora });

  // ---- Rutas: [método, patrón, acceso, manejador] ----
  const U = 'usuario';
  const A = 'admin';
  const P = 'publico';
  const rutas = [
    ['GET', '/api/salud', P, () => ({ ok: true })],
    ['POST', '/api/auth/registro', P, ({ body }) => [201, s.registrar(body)]],
    ['POST', '/api/auth/login', P, ({ body }) => s.iniciarSesion(body)],
    ['GET', '/api/yo', U, ({ usuario }) => ({ usuario: s.publicoDe(usuario) })],

    ['GET', '/api/peliculas', P, () => ({ peliculas: s.listarPeliculas() })],
    ['GET', '/api/peliculas/:id', P, ({ params }) => ({ pelicula: s.obtenerPelicula(params.id) })],
    ['GET', '/api/funciones', P, ({ query }) => ({ funciones: s.listarFunciones({ peliculaId: query.get('peliculaId') ?? undefined, fecha: query.get('fecha') ?? undefined }) })],
    ['GET', '/api/funciones/:id', P, ({ params, usuario }) => s.detalleFuncion(params.id, usuario)],

    ['POST', '/api/funciones/:id/reserva', U, ({ params, usuario, body }) => [201, { reserva: s.reservar(usuario, params.id, body?.butacas) }]],
    ['GET', '/api/reserva', U, ({ usuario }) => ({ reserva: s.obtenerReservaActual(usuario) })],
    ['DELETE', '/api/reserva', U, ({ usuario }) => { s.liberarReserva(usuario); return { ok: true }; }],

    ['POST', '/api/compras', U, ({ usuario, body }) => [201, s.comprar(usuario, body ?? {})]],
    ['GET', '/api/mis-entradas', U, ({ usuario }) => ({ entradas: s.misEntradas(usuario) })],
    ['POST', '/api/entradas/:id/cancelar', U, ({ usuario, params }) => s.cancelarEntrada(usuario, params.id)],

    ['GET', '/api/admin/peliculas', A, () => ({ peliculas: s.listarPeliculasAdmin() })],
    ['POST', '/api/admin/peliculas', A, ({ body }) => [201, { pelicula: s.crearPelicula(body) }]],
    ['DELETE', '/api/admin/peliculas/:id', A, ({ params }) => s.desactivarPelicula(params.id)],
    ['GET', '/api/admin/salas', A, () => ({ salas: s.listarSalas() })],
    ['POST', '/api/admin/funciones', A, ({ body }) => [201, { funcion: s.crearFuncion(body) }]],
    ['POST', '/api/admin/funciones/:id/cancelar', A, ({ params }) => s.cancelarFuncion(params.id)],
    ['POST', '/api/admin/validar', A, ({ body }) => ({ entrada: s.validarEntrada(body?.codigo) })],
    ['GET', '/api/admin/reporte', A, () => s.reporte()],
  ].map(([metodo, patron, acceso, manejador]) => ({
    metodo, acceso, manejador, partes: patron.split('/').filter(Boolean),
  }));

  /** Busca la ruta que coincide. Devuelve { ruta, params } o { otrosMetodos: true } si la URL existe con otro método. */
  function buscarRuta(metodo, pathname) {
    const segmentos = pathname.split('/').filter(Boolean);
    let otrosMetodos = false;
    for (const r of rutas) {
      if (r.partes.length !== segmentos.length) continue;
      const params = {};
      const coincide = r.partes.every((p, i) => {
        if (p.startsWith(':')) { params[p.slice(1)] = segmentos[i]; return true; }
        return p === segmentos[i];
      });
      if (!coincide) continue;
      if (r.metodo === metodo) return { ruta: r, params };
      otrosMetodos = true;
    }
    return { otrosMetodos };
  }

  // ---- Utilidades HTTP ----
  const cabecerasBase = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };

  function responderJson(res, status, datos, extra = {}) {
    const cuerpo = JSON.stringify(datos);
    res.writeHead(status, {
      ...cabecerasBase, ...extra,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(cuerpo),
    });
    res.end(cuerpo);
  }

  const responderError = (res, status, codigo, mensaje, extra) =>
    responderJson(res, status, { error: { codigo, mensaje } }, extra);

  function leerCuerpo(req) {
    return new Promise((resolver, rechazar) => {
      const trozos = [];
      let largo = 0;
      let excedido = false;
      req.on('data', (t) => {
        if (excedido) return;
        largo += t.length;
        if (largo > MAX_CUERPO) { excedido = true; trozos.length = 0; return; } // se sigue leyendo (y descartando) para poder responder
        trozos.push(t);
      });
      req.on('end', () => {
        if (excedido) return rechazar(new ErrorNegocio('CUERPO_MUY_GRANDE', 'El pedido es demasiado grande.', 413));
        if (!trozos.length) return resolver(undefined);
        try { resolver(JSON.parse(Buffer.concat(trozos).toString('utf8'))); } catch {
          rechazar(new ErrorNegocio('JSON_INVALIDO', 'El cuerpo del pedido no es un JSON válido.', 400));
        }
      });
      req.on('error', rechazar);
    });
  }

  /** CORS: solo se acepta el origen configurado en FRONTEND_URL (RN de despliegue, consigna 5.8). */
  function cabecerasCors(req) {
    const origen = req.headers.origin;
    if (!frontendUrl || !origen || origen !== frontendUrl.replace(/\/$/, '')) return {};
    return {
      'access-control-allow-origin': origen,
      'access-control-allow-headers': 'Authorization, Content-Type',
      'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
      'access-control-max-age': '600',
      vary: 'Origin',
    };
  }

  function tokenDe(req) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    return m ? m[1] : null;
  }

  // ---- Archivos estáticos (frontend) ----
  function servirEstatico(req, res, pathname) {
    if (!frontendDir || (req.method !== 'GET' && req.method !== 'HEAD')) {
      return responderError(res, 404, 'RUTA_NO_ENCONTRADA', 'La ruta no existe.');
    }
    let relativa;
    try { relativa = decodeURIComponent(pathname); } catch {
      return responderError(res, 400, 'RUTA_INVALIDA', 'La ruta no es válida.');
    }
    if (relativa.includes('\0')) return responderError(res, 400, 'RUTA_INVALIDA', 'La ruta no es válida.');
    if (relativa.endsWith('/')) relativa += 'index.html';
    const raiz = path.resolve(frontendDir);
    const archivo = path.resolve(raiz, `.${relativa.startsWith('/') ? '' : '/'}${relativa}`);
    if (archivo !== raiz && !archivo.startsWith(raiz + path.sep)) {
      return responderError(res, 403, 'PROHIBIDO', 'Acceso denegado.');
    }
    fs.stat(archivo, (err, st) => {
      if (err || !st.isFile()) return responderError(res, 404, 'RUTA_NO_ENCONTRADA', 'La ruta no existe.');
      res.writeHead(200, {
        ...cabecerasBase,
        'content-type': TIPOS[path.extname(archivo).toLowerCase()] ?? 'application/octet-stream',
        'content-length': st.size,
        'cache-control': 'no-cache',
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(archivo).pipe(res);
    });
  }

  // ---- Servidor ----
  const servidor = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const cors = cabecerasCors(req);

      if (!url.pathname.startsWith('/api/')) return servirEstatico(req, res, url.pathname);

      if (req.method === 'OPTIONS') {
        res.writeHead(204, { ...cabecerasBase, ...cors });
        return res.end();
      }

      const { ruta: r, params, otrosMetodos } = buscarRuta(req.method, url.pathname);
      if (!r) {
        return otrosMetodos
          ? responderError(res, 405, 'METODO_NO_PERMITIDO', 'Ese método no está permitido en esta ruta.', cors)
          : responderError(res, 404, 'RUTA_NO_ENCONTRADA', 'La ruta no existe.', cors);
      }

      // Los ids de la URL tienen que ser enteros positivos
      for (const [k, v] of Object.entries(params)) {
        if (!/^\d{1,12}$/.test(v)) throw new ErrorNegocio('ID_INVALIDO', `El identificador "${k}" no es válido.`, 400);
        params[k] = Number(v);
      }

      // Autenticación y roles (RN15): primero la sesión, después el rol, y recién entonces se lee el cuerpo
      let usuario = null;
      const token = tokenDe(req);
      if (r.acceso === 'publico') {
        if (token) { try { usuario = s.usuarioDesdeToken(token); } catch { /* token inválido en ruta pública: se ignora */ } }
      } else {
        usuario = s.usuarioDesdeToken(token);
        if (r.acceso === 'admin') s.exigirAdmin(usuario);
      }

      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await leerCuerpo(req) : undefined;
      const resultado = await r.manejador({ params, query: url.searchParams, body, usuario });
      const [status, datos] = Array.isArray(resultado) ? resultado : [200, resultado];
      return responderJson(res, status, datos, cors);
    } catch (e) {
      if (e instanceof ErrorNegocio) {
        return responderError(res, e.status, e.codigo, e.message, cabecerasCors(req));
      }
      console.error('Error inesperado:', e.name, e.message); // sin cuerpo del pedido: puede tener datos sensibles
      if (res.headersSent) return res.end();
      return responderError(res, 500, 'ERROR_INTERNO', 'Ocurrió un error inesperado. Probá de nuevo.', cabecerasCors(req));
    }
  });

  return { servidor, db, servicios: s };
}

module.exports = { crearApp };
