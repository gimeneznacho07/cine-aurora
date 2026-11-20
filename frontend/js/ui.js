'use strict';
/* Utilidades de interfaz: crear nodos sin innerHTML (evita XSS), formatos y avisos. */
(function () {
  /** h('div', { class: 'x', onclick: fn }, 'texto', otroNodo) */
  function h(tag, attrs, ...hijos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const [p, val] of Object.entries(v)) { if (p.startsWith('--')) el.style.setProperty(p, val); else el.style[p] = val; } }
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const poner = (x) => {
      if (Array.isArray(x)) x.forEach(poner);
      else if (x === null || x === undefined || x === false) return;
      else el.append(x instanceof Node ? x : document.createTextNode(String(x)));
    };
    hijos.forEach(poner);
    return el;
  }

  const TZ = 'America/Argentina/Buenos_Aires';
  const fmtPrecio = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
  const fmtHora = (ms) => new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(ms);
  const fmtDia = (ms) => new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(ms);
  const fmtDiaCorto = (ms) => new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }).format(ms);
  const claveDia = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(ms); // AAAA-MM-DD
  const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const duracion = (min) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;

  function aviso(texto, tipo = 'ok') {
    const caja = document.getElementById('avisos');
    const el = h('div', { class: `aviso aviso-${tipo}` }, texto);
    caja.append(el);
    setTimeout(() => el.remove(), tipo === 'error' ? 7000 : 4000);
  }

  /** Diálogo de confirmación accesible. Devuelve una promesa con true/false. */
  function confirmar(titulo, detalle, textoOk = 'Confirmar') {
    return new Promise((resolver) => {
      const d = h('dialog', { class: 'dialogo' },
        h('h2', {}, titulo), h('p', {}, detalle),
        h('div', { class: 'fila-botones' },
          h('button', { class: 'btn btn-fantasma', type: 'button', onclick: () => d.close('no') }, 'Volver'),
          h('button', { class: 'btn btn-peligro', type: 'button', onclick: () => d.close('si') }, textoOk)));
      d.addEventListener('close', () => { resolver(d.returnValue === 'si'); d.remove(); });
      document.body.append(d);
      d.showModal();
    });
  }

  /** Afiche generado con los dos colores de la película (no hay imágenes con derechos de autor). */
  function afiche(p, grande = false) {
    return h('div', { class: `afiche${grande ? ' afiche-grande' : ''}`, style: { '--a': p.colorA, '--b': p.colorB }, role: 'img', 'aria-label': `Afiche de ${p.titulo}` },
      h('span', { class: 'afiche-titulo' }, p.titulo));
  }

  const insignia = (clasif) => h('span', { class: `insignia clasif-${clasif.replace('+', 'mas')}`, title: `Clasificación ${clasif}` }, clasif);

  window.UI = { h, fmtPrecio, fmtHora, fmtDia, fmtDiaCorto, claveDia, mayus, duracion, aviso, confirmar, afiche, insignia, TZ };
})();
