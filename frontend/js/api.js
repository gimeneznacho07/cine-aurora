'use strict';
/* Cliente de la API: agrega el token, normaliza errores y guarda la sesión. */
(function () {
  const CLAVE = 'cine-aurora-sesion';
  const base = (window.CINE_API_URL || '').replace(/\/$/, '');

  const Sesion = {
    leer() { try { return JSON.parse(localStorage.getItem(CLAVE)); } catch { return null; } },
    guardar(s) { try { localStorage.setItem(CLAVE, JSON.stringify(s)); } catch { /* sin almacenamiento: la sesión dura lo que la página */ Sesion._mem = s; } },
    borrar() { try { localStorage.removeItem(CLAVE); } catch { /* nada */ } Sesion._mem = null; },
    _mem: null,
    actual() { return this.leer() || this._mem; },
  };

  class ErrorApi extends Error {
    constructor(status, codigo, mensaje) { super(mensaje); this.status = status; this.codigo = codigo; }
  }

  async function llamar(metodo, ruta, cuerpo) {
    const s = Sesion.actual();
    let r;
    try {
      r = await fetch(base + ruta, {
        method: metodo,
        headers: { ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      });
    } catch {
      throw new ErrorApi(0, 'SIN_CONEXION', 'No pudimos conectarnos con el servidor. Revisá tu internet y probá de nuevo. Si el servidor estaba inactivo, puede tardar hasta 30 segundos en despertar.');
    }
    let datos = null;
    try { datos = await r.json(); } catch { /* sin cuerpo */ }
    if (!r.ok) {
      if (r.status === 401 && s) { Sesion.borrar(); window.dispatchEvent(new Event('sesion-cambiada')); }
      throw new ErrorApi(r.status, datos?.error?.codigo ?? 'ERROR', datos?.error?.mensaje ?? 'Ocurrió un error inesperado.');
    }
    return datos;
  }

  window.Api = {
    ErrorApi, Sesion,
    get: (r) => llamar('GET', r),
    post: (r, c = {}) => llamar('POST', r, c),
    del: (r) => llamar('DELETE', r),
  };
})();
