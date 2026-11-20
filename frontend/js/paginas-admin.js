'use strict';
/* Panel de administración: películas, funciones, validación en puerta y reporte (HU10–HU15). */
(function () {
  const { h, fmtHora, fmtDiaCorto, mayus, fmtPrecio, aviso, confirmar, insignia } = UI;

  const mensajeError = (e) => aviso(e.message, 'error');

  /** Convierte el valor de <input type="datetime-local"> (hora de Argentina) a ISO con zona, como exige la API. */
  const aIsoArgentina = (valor) => `${valor}:00-03:00`;

  // ---- Películas (HU10, HU15) ----
  async function tabPeliculas() {
    const raiz = h('div', { class: 'dos-paneles' });
    const lista = h('div', { class: 'tabla-caja' });

    async function cargar() {
      const { peliculas } = await Api.get('/api/admin/peliculas');
      lista.replaceChildren(h('table', {},
        h('thead', {}, h('tr', {}, ['Película', 'Clasif.', 'Duración', 'Funciones futuras', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, peliculas.map((p) => h('tr', {},
          h('td', {}, p.titulo, p.activa ? null : h('span', { class: 'suave' }, ' (dada de baja)')),
          h('td', {}, insignia(p.clasificacion)),
          h('td', {}, `${p.duracionMin} min`),
          h('td', { class: 'num' }, p.funcionesFuturas),
          h('td', {}, p.activa ? h('button', { class: 'btn btn-fantasma btn-chico', type: 'button', onclick: async () => {
            const ok = await confirmar('¿Dar de baja la película?', `"${p.titulo}" deja de mostrarse y se cancelan sus funciones futuras. Si ya vendió entradas, el sistema no lo permite.`, 'Dar de baja');
            if (!ok) return;
            try { const r = await Api.del(`/api/admin/peliculas/${p.id}`); aviso(`Película dada de baja. Funciones canceladas: ${r.funcionesCanceladas}.`); await cargar(); } catch (e) { mensajeError(e); }
          } }, 'Dar de baja') : null))))));
    }

    const error = h('p', { class: 'error-form', role: 'alert', hidden: true });
    const form = h('form', { class: 'formulario', novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault(); error.hidden = true;
      const d = Object.fromEntries(new FormData(form));
      try {
        await Api.post('/api/admin/peliculas', {
          titulo: d.titulo, sinopsis: d.sinopsis, genero: d.genero, duracionMin: Number(d.duracionMin),
          clasificacion: d.clasificacion, colorA: d.colorA, colorB: d.colorB,
        });
        aviso('Película cargada. Ya podés programar funciones.');
        form.reset(); await cargar();
      } catch (e) { error.textContent = e.message; error.hidden = false; }
    } },
      h('h2', {}, 'Cargar película'),
      h('label', {}, 'Título', h('input', { name: 'titulo', required: true, maxlength: 80 })),
      h('label', {}, 'Género', h('input', { name: 'genero', maxlength: 40 })),
      h('label', {}, 'Sinopsis', h('textarea', { name: 'sinopsis', rows: 3, maxlength: 500 })),
      h('div', { class: 'dos-col' },
        h('label', {}, 'Duración (min)', h('input', { name: 'duracionMin', type: 'number', min: 30, max: 300, required: true, value: 100 })),
        h('label', {}, 'Clasificación', h('select', { name: 'clasificacion' }, ['ATP', '+13', '+16', '+18'].map((c) => h('option', { value: c }, c))))),
      h('div', { class: 'dos-col' },
        h('label', {}, 'Color del afiche (arriba)', h('input', { name: 'colorA', type: 'color', value: '#3b2f5c' })),
        h('label', {}, 'Color del afiche (abajo)', h('input', { name: 'colorB', type: 'color', value: '#c8553d' }))),
      error, h('button', { class: 'btn btn-aurora', type: 'submit' }, 'Cargar película'));
    raiz.append(form, lista);
    await cargar();
    return raiz;
  }

  // ---- Funciones (HU11, HU12) ----
  async function tabFunciones() {
    const [{ peliculas }, { salas }] = await Promise.all([Api.get('/api/admin/peliculas'), Api.get('/api/admin/salas')]);
    const activas = peliculas.filter((p) => p.activa);
    const raiz = h('div', { class: 'dos-paneles' });
    const lista = h('div', { class: 'tabla-caja' });

    async function cargar() {
      const { funciones } = await Api.get('/api/funciones');
      lista.replaceChildren(h('h2', {}, 'Próximas funciones'), funciones.length
        ? h('table', {},
          h('thead', {}, h('tr', {}, ['Película', 'Día y hora', 'Sala', 'Precio base', 'Libres', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, funciones.map((f) => h('tr', {},
            h('td', {}, f.titulo),
            h('td', {}, `${mayus(fmtDiaCorto(f.inicioMs))} ${fmtHora(f.inicioMs)}`),
            h('td', {}, `${f.sala} · ${f.formato}`),
            h('td', { class: 'num' }, fmtPrecio(f.precioBase)),
            h('td', { class: 'num' }, `${f.disponibles}/${f.capacidad}`),
            h('td', {}, h('button', { class: 'btn btn-fantasma btn-chico', type: 'button', onclick: async () => {
              const ok = await confirmar('¿Cancelar la función?', `${f.titulo}, ${mayus(fmtDiaCorto(f.inicioMs))} ${fmtHora(f.inicioMs)}. Las entradas vendidas se anulan con reembolso del 100 %.`, 'Cancelar función');
              if (!ok) return;
              try { const r = await Api.post(`/api/admin/funciones/${f.id}/cancelar`); aviso(`Función cancelada. Entradas anuladas: ${r.entradasAnuladas} (${fmtPrecio(r.montoReembolsado)} reembolsados).`); await cargar(); } catch (e) { mensajeError(e); }
            } }, 'Cancelar'))))))
        : h('p', { class: 'vacio' }, 'No hay funciones futuras. Programá la primera con el formulario.'));
    }

    const error = h('p', { class: 'error-form', role: 'alert', hidden: true });
    const form = h('form', { class: 'formulario', novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault(); error.hidden = true;
      const d = Object.fromEntries(new FormData(form));
      try {
        await Api.post('/api/admin/funciones', {
          peliculaId: Number(d.peliculaId), salaId: Number(d.salaId), inicio: aIsoArgentina(d.inicio),
          formato: d.formato, precioBase: Number(d.precioBase),
        });
        aviso('Función programada.'); await cargar();
      } catch (e) { error.textContent = e.message; error.hidden = false; }
    } },
      h('h2', {}, 'Programar función'),
      activas.length ? null : h('p', { class: 'nota' }, 'Primero cargá una película.'),
      h('label', {}, 'Película', h('select', { name: 'peliculaId', required: true }, activas.map((p) => h('option', { value: p.id }, p.titulo)))),
      h('label', {}, 'Sala', h('select', { name: 'salaId', required: true }, salas.map((s) => h('option', { value: s.id }, `${s.nombre} (${s.capacidad} butacas)`)))),
      h('label', {}, 'Día y hora de inicio', h('input', { name: 'inicio', type: 'datetime-local', required: true }), h('span', { class: 'ayuda' }, 'Hora de Argentina. No puede superponerse con otra función de la sala (se suman 15 min de limpieza).')),
      h('div', { class: 'dos-col' },
        h('label', {}, 'Formato', h('select', { name: 'formato' }, h('option', {}, '2D'), h('option', {}, '3D'))),
        h('label', {}, 'Precio base ($)', h('input', { name: 'precioBase', type: 'number', min: 1, required: true, value: 8500 }))),
      error, h('button', { class: 'btn btn-aurora', type: 'submit', disabled: !activas.length }, 'Programar función'));
    raiz.append(form, lista);
    await cargar();
    return raiz;
  }

  // ---- Validar en la puerta (HU13) ----
  function tabValidar() {
    const salida = h('div', { 'aria-live': 'polite' });
    const form = h('form', { class: 'formulario', novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault();
      const codigo = new FormData(form).get('codigo');
      try {
        const { entrada: e } = await Api.post('/api/admin/validar', { codigo });
        salida.replaceChildren(h('div', { class: 'resultado-ok' },
          h('strong', {}, 'Entrada válida: puede pasar.'),
          h('p', { style: { margin: '6px 0 0' } }, `${e.pelicula} · ${e.sala} (${e.formato}) · ${mayus(fmtDiaCorto(e.inicioMs))} ${fmtHora(e.inicioMs)} · Butaca ${e.butaca}`)));
        form.reset();
      } catch (err) {
        salida.replaceChildren(h('p', { class: 'error-form', role: 'alert' }, `No puede pasar. ${err.message}`));
      }
      form.querySelector('input').focus();
    } },
      h('h2', {}, 'Validar entrada'),
      h('label', {}, 'Código de la entrada', h('input', { name: 'codigo', required: true, placeholder: 'CA-1A2B3C4D', autocomplete: 'off', autocapitalize: 'characters' })),
      h('button', { class: 'btn btn-aurora', type: 'submit' }, 'Validar'), salida);
    return form;
  }

  // ---- Reporte (HU14) ----
  async function tabReporte() {
    const { funciones, totales } = await Api.get('/api/admin/reporte');
    const estadoTxt = { programada: '', cancelada: ' (cancelada)' };
    return h('div', {},
      h('div', { class: 'cifras' },
        h('div', { class: 'cifra' }, h('strong', {}, totales.entradasVendidas), 'entradas vendidas'),
        h('div', { class: 'cifra' }, h('strong', {}, fmtPrecio(totales.recaudacionNeta)), 'recaudación neta'),
        h('div', { class: 'cifra' }, h('strong', {}, fmtPrecio(totales.reembolsado)), 'reembolsado')),
      funciones.length ? h('div', { class: 'tabla-caja' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Función', 'Sala', 'Vendidas', 'Usadas', 'Canceladas', 'Ocupación', 'Recaudación neta'].map((t, i) => h('th', { class: i >= 2 && i !== 5 ? 'num' : '' }, t)))),
        h('tbody', {}, funciones.map((f) => h('tr', {},
          h('td', {}, `${f.titulo}${estadoTxt[f.estado] ?? ''} · ${mayus(fmtDiaCorto(f.inicioMs))} ${fmtHora(f.inicioMs)}`),
          h('td', {}, `${f.sala} · ${f.formato}`),
          h('td', { class: 'num' }, `${f.vendidas}/${f.capacidad}`), h('td', { class: 'num' }, f.usadas), h('td', { class: 'num' }, f.canceladas),
          h('td', {}, h('div', { class: 'barra-ocup', role: 'img', 'aria-label': `${f.ocupacion} % de ocupación` }, h('i', { style: { width: `${Math.min(100, f.ocupacion)}%` } })), `${f.ocupacion} %`),
          h('td', { class: 'num' }, fmtPrecio(f.recaudacionNeta)))))))
        : h('p', { class: 'vacio' }, 'Todavía no hay funciones para reportar.'));
  }

  async function panel() {
    const tabs = [['peliculas', 'Películas', tabPeliculas], ['funciones', 'Funciones', tabFunciones], ['validar', 'Validar entrada', tabValidar], ['reporte', 'Reporte', tabReporte]];
    const contenido = h('div', {});
    const barra = h('div', { class: 'pestanas', role: 'tablist' });
    async function ir(clave) {
      for (const b of barra.children) b.setAttribute('aria-selected', String(b.dataset.clave === clave));
      contenido.replaceChildren(h('p', { class: 'suave' }, 'Cargando…'));
      try { contenido.replaceChildren(await tabs.find((t) => t[0] === clave)[2]()); } catch (e) { contenido.replaceChildren(h('p', { class: 'error-form' }, e.message)); }
    }
    tabs.forEach(([clave, texto]) => barra.append(h('button', { type: 'button', role: 'tab', 'data-clave': clave, 'aria-selected': 'false', onclick: () => ir(clave) }, texto)));
    const raiz = h('section', {}, h('h1', {}, 'Administración'), barra, contenido);
    ir('reporte');
    return raiz;
  }

  window.PaginasAdmin = { panel };
})();
