'use strict';
/* Pantallas del cliente: mapa de butacas, reserva con cuenta regresiva, pago y mis entradas (HU3, HU6–HU9). */
(function () {
  const { h, fmtHora, fmtDia, fmtDiaCorto, mayus, fmtPrecio, afiche, insignia, aviso, confirmar } = UI;
  const MAX_ENTRADAS = 6;
  const MAX_REDUCIDAS = 2;

  const mmss = (ms) => {
    const t = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  };
  const etiquetaFuncion = (f) => `${f.titulo} · ${mayus(fmtDia(f.inicioMs))}, ${fmtHora(f.inicioMs)} · ${f.sala} (${f.formato})`;

  async function funcion(id) {
    const logueado = !!Api.Sesion.actual();
    const [detalle, resActual] = await Promise.all([
      Api.get(`/api/funciones/${id}`),
      logueado ? Api.get('/api/reserva').catch(() => ({ reserva: null })) : Promise.resolve({ reserva: null }),
    ]);
    const f = detalle.funcion;
    const raiz = h('section', {});
    let reserva = resActual.reserva && resActual.reserva.funcionId === f.id ? resActual.reserva : null;
    const otraReserva = resActual.reserva && resActual.reserva.funcionId !== f.id ? resActual.reserva : null;
    const elegidas = new Set();
    let mapa = detalle.butacas;

    async function recargar() {
      const d = await Api.get(`/api/funciones/${id}`);
      mapa = d.butacas;
      const r = logueado ? (await Api.get('/api/reserva')).reserva : null;
      reserva = r && r.funcionId === f.id ? r : null;
      elegidas.clear();
      dibujar();
    }

    function butaca(codigo) {
      const estado = mapa[codigo];
      const premium = detalle.filasPremium.includes(codigo[0]);
      const sel = elegidas.has(codigo);
      const clases = ['butaca', premium ? 'premium' : '', sel ? 'elegida' : '', estado === 'libre' ? '' : estado].filter(Boolean).join(' ');
      const nombre = `Butaca ${codigo}${premium ? ' premium' : ''}, ${sel ? 'elegida' : estado}`;
      return h('button', {
        class: clases, type: 'button', 'aria-label': nombre, 'aria-pressed': estado === 'libre' ? String(sel) : false, title: nombre,
        disabled: estado === 'ocupada' || estado === 'reservada' || estado === 'mia' || !!reserva,
        onclick: () => {
          if (sel) elegidas.delete(codigo);
          else if (elegidas.size >= MAX_ENTRADAS) { aviso(`Podés elegir hasta ${MAX_ENTRADAS} butacas por compra.`, 'error'); return; }
          else elegidas.add(codigo);
          dibujar();
        },
      }, codigo.slice(1));
    }

    function mapaButacas() {
      return h('div', { class: 'sala' },
        h('div', { class: 'pantalla' }), h('p', { class: 'pantalla-texto' }, 'Pantalla'),
        h('div', { class: 'mapa', role: 'group', 'aria-label': 'Mapa de butacas' },
          detalle.filas.map((letra) => h('div', { class: 'fila-mapa' },
            h('span', { class: 'letra', 'aria-hidden': 'true' }, letra),
            Array.from({ length: detalle.columnas }, (_, i) => butaca(`${letra}${i + 1}`))))),
        h('div', { class: 'leyenda' },
          h('span', {}, h('i', { class: 'butaca', 'aria-hidden': 'true' }), 'Libre'),
          h('span', {}, h('i', { class: 'butaca elegida', 'aria-hidden': 'true' }), 'Elegida'),
          h('span', {}, h('i', { class: 'butaca reservada', 'aria-hidden': 'true' }), 'Reservada por otra persona'),
          h('span', {}, h('i', { class: 'butaca ocupada', 'aria-hidden': 'true' }), 'Ocupada'),
          h('span', {}, h('i', { class: 'butaca premium', 'aria-hidden': 'true' }), `Premium (fila ${detalle.filasPremium.join(' y ')}, ${fmtPrecio(detalle.precios.premium)})`)));
    }

    // ---- Panel 1: elegir butacas ----
    function panelElegir() {
      const lista = [...elegidas].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
      const precioDe = (b) => (detalle.filasPremium.includes(b[0]) ? detalle.precios.premium : detalle.precios.general);
      const total = lista.reduce((t, b) => t + precioDe(b), 0);
      const sesion = Api.Sesion.actual();
      const boton = h('button', { class: 'btn btn-aurora', type: 'button', disabled: !lista.length || !f.ventaAbierta, onclick: async () => {
        if (!sesion) { location.hash = `#/login?volver=${encodeURIComponent('#/funcion/' + id)}`; return; }
        boton.disabled = true;
        try {
          await Api.post(`/api/funciones/${id}/reserva`, { butacas: lista });
          aviso('Butacas reservadas por 5 minutos.');
        } catch (e) { aviso(e.message, 'error'); }
        try { await recargar(); } catch (e) { aviso(e.message, 'error'); }
      } }, sesion ? 'Reservar butacas' : 'Iniciá sesión para reservar');
      return h('aside', { class: 'panel', 'aria-label': 'Tu selección' },
        h('h2', {}, 'Tu selección'),
        !f.ventaAbierta ? h('p', { class: 'nota' }, 'La venta online de esta función está cerrada.') : null,
        otraReserva ? h('p', { class: 'nota' }, 'Ya tenés butacas reservadas en otra función. Si reservás acá, esa reserva se libera.') : null,
        lista.length
          ? h('ul', { class: 'lista-sel' }, lista.map((b) => h('li', {}, h('span', {}, `Butaca ${b}`), h('span', {}, fmtPrecio(precioDe(b))))))
          : h('p', { class: 'suave' }, `Tocá las butacas libres que quieras (hasta ${MAX_ENTRADAS}).`),
        lista.length ? h('div', { class: 'total' }, h('span', {}, 'Total'), h('span', {}, fmtPrecio(total))) : null,
        lista.length ? h('p', { class: 'ayuda' }, 'El precio final puede bajar con entrada reducida o con el descuento de los miércoles.') : null,
        boton);
    }

    // ---- Panel 2: pagar la reserva ----
    function panelPago() {
      const tipos = {};
      const cuenta = h('div', { class: 'cuenta', role: 'timer', 'aria-label': 'Tiempo restante de la reserva' });
      const total = h('span', {});
      const error = h('p', { class: 'error-form', role: 'alert', hidden: true });
      const selects = {};
      const botonPagar = h('button', { class: 'btn btn-aurora', type: 'submit' }, 'Pagar');

      const recalcular = () => {
        let t = 0;
        let reducidas = 0;
        for (const b of reserva.butacas) {
          const tipo = selects[b].value;
          if (tipo === 'reducida') reducidas += 1;
          t += reserva.precios[b][tipo];
          tipos[b] = tipo;
        }
        total.textContent = fmtPrecio(t);
        error.hidden = reducidas <= MAX_REDUCIDAS;
        if (reducidas > MAX_REDUCIDAS) error.textContent = `Podés llevar hasta ${MAX_REDUCIDAS} entradas reducidas por compra.`;
        botonPagar.disabled = reducidas > MAX_REDUCIDAS;
      };

      const filas = reserva.butacas.map((b) => {
        selects[b] = h('select', { 'aria-label': `Tipo de entrada para la butaca ${b}`, onchange: recalcular },
          h('option', { value: 'general' }, 'General'), h('option', { value: 'reducida' }, 'Reducida (−30 %)'));
        return h('li', {}, h('span', {}, `Butaca ${b}`), selects[b]);
      });

      const campo = (rotulo, nombre, extra) => h('label', {}, rotulo, h('input', { name: nombre, required: true, ...extra }));
      const form = h('form', { class: 'formulario', novalidate: true, style: { maxWidth: 'none' },
        onsubmit: async (ev) => {
          ev.preventDefault();
          error.hidden = true;
          botonPagar.disabled = true;
          const d = Object.fromEntries(new FormData(form));
          try {
            await Api.post('/api/compras', { tipos, tarjeta: { numero: d.numero, titular: d.titular, vencimiento: d.vencimiento, cvv: d.cvv } });
            aviso('¡Compra realizada! Tus entradas ya están en "Mis entradas".');
            location.hash = '#/mis-entradas';
          } catch (e) {
            error.textContent = e.message;
            error.hidden = false;
            if (e.codigo === 'RESERVA_VENCIDA' || e.codigo === 'RESERVA_NO_ENCONTRADA') { try { await recargar(); } catch { /* ya se avisó */ } return; }
            botonPagar.disabled = false;
          }
        } },
        h('ul', { class: 'lista-sel' }, filas),
        h('div', { class: 'total' }, h('span', {}, 'Total a pagar'), total),
        campo('Número de tarjeta', 'numero', { inputmode: 'numeric', autocomplete: 'cc-number', placeholder: '4111 1111 1111 1111' }),
        campo('Titular', 'titular', { autocomplete: 'cc-name', placeholder: 'ANA PEREZ' }),
        h('div', { class: 'dos-col' },
          campo('Vencimiento', 'vencimiento', { autocomplete: 'cc-exp', placeholder: 'MM/AA', maxlength: 5 }),
          campo('CVV', 'cvv', { inputmode: 'numeric', autocomplete: 'cc-csc', maxlength: 4, placeholder: '123' })),
        h('p', { class: 'ayuda' }, 'Pago simulado. Para probar: 4111 1111 1111 1111. La tarjeta 4000 0000 0000 0002 simula un rechazo.'),
        error, botonPagar);

      // Cuenta regresiva: cuando llega a cero se libera la reserva y se recarga el mapa (RN2)
      const tic = () => {
        const falta = reserva.expiraMs - Date.now();
        cuenta.textContent = mmss(falta);
        cuenta.classList.toggle('urgente', falta < 60000);
        if (falta <= 0) {
          clearInterval(reloj);
          aviso('Se terminó el tiempo de tu reserva. Elegí tus butacas de nuevo.', 'error');
          recargar().catch((e) => aviso(e.message, 'error'));
        }
      };
      const reloj = setInterval(tic, 1000);
      window.alSalir(() => clearInterval(reloj));
      tic();
      recalcular();

      return h('aside', { class: 'panel', 'aria-label': 'Pago' },
        h('h2', {}, 'Tus butacas están reservadas'),
        cuenta, h('p', { class: 'ayuda' }, 'Completá el pago antes de que se acabe el tiempo.'),
        form,
        h('button', { class: 'btn btn-fantasma btn-chico', type: 'button', style: { marginTop: '12px' }, onclick: async () => {
          await Api.del('/api/reserva'); aviso('Liberaste tus butacas.'); await recargar();
        } }, 'Liberar butacas'));
    }

    function dibujar() {
      raiz.replaceChildren(
        h('p', {}, h('a', { href: `#/pelicula/${f.peliculaId}` }, '← Funciones de la película')),
        h('div', { class: 'meta', style: { marginBottom: '6px' } }, insignia(f.clasificacion), h('span', {}, `${f.sala} · ${f.formato}`)),
        h('h1', {}, f.titulo),
        h('p', { class: 'suave' }, `${mayus(fmtDia(f.inicioMs))}, ${fmtHora(f.inicioMs)} h`),
        h('div', { class: 'mapa-y-panel' }, mapaButacas(), reserva ? panelPago() : panelElegir()));
    }
    dibujar();
    return raiz;
  }

  // ---- Mis entradas ----
  async function misEntradas() {
    const { entradas } = await Api.get('/api/mis-entradas');
    const raiz = h('section', {}, h('h1', {}, 'Mis entradas'));
    if (!entradas.length) {
      raiz.append(h('div', { class: 'vacio' }, h('p', { style: { margin: '0 auto 12px' } }, 'Todavía no compraste entradas.'), h('a', { class: 'btn btn-aurora', href: '#/' }, 'Ver la cartelera')));
      return raiz;
    }
    const tipoTxt = { general: 'General', reducida: 'Reducida' };
    const estadoTxt = { valida: 'Válida', usada: 'Usada', cancelada: 'Cancelada' };

    const tarjeta = (e) => {
      const fn = e.funcion;
      const inactiva = e.estado !== 'valida';
      const c = e.cancelacion;
      let accion = null;
      if (e.estado === 'valida' && c) {
        accion = c.permitido
          ? h('button', { class: 'btn btn-fantasma btn-chico', type: 'button', onclick: async () => {
              const ok = await confirmar('¿Cancelar esta entrada?', `Butaca ${e.butaca} de ${fn.titulo}. Se te reembolsa el ${c.porcentaje} % (${fmtPrecio(c.monto)}) y la butaca queda libre.`, 'Cancelar entrada');
              if (!ok) return;
              try {
                const r = await Api.post(`/api/entradas/${e.id}/cancelar`);
                aviso(`Entrada cancelada. Reembolso: ${fmtPrecio(r.reembolso)}.`);
                location.reload();
              } catch (err) { aviso(err.message, 'error'); }
            } }, `Cancelar (reembolso ${c.porcentaje} %)`)
          : h('p', { class: 'ayuda', style: { margin: 0 } }, 'Ya no se puede cancelar: faltan menos de 2 horas.');
      }
      return h('article', { class: `entrada${inactiva ? ' inactiva' : ''}`, style: { '--a': fn.colorA, '--b': fn.colorB } },
        h('div', { class: 'entrada-cuerpo' },
          h('h3', {}, fn.titulo),
          h('span', {}, `${mayus(fmtDiaCorto(fn.inicioMs))} · ${fmtHora(fn.inicioMs)} h`),
          h('span', { class: 'suave' }, `${fn.sala} · ${fn.formato} · ${tipoTxt[e.tipo] ?? e.tipo} · ${fmtPrecio(e.precio)}`),
          h('span', {}, h('span', { class: 'codigo' }, e.codigo)),
          h('span', { class: `estado estado-${e.estado}` }, fn.estado === 'cancelada' && e.estado !== 'cancelada' ? 'Función cancelada' : estadoTxt[e.estado],
            e.estado === 'cancelada' ? ` · reembolso ${fmtPrecio(e.reembolso)}` : ''),
          accion),
        h('div', { class: 'entrada-talon' }, h('span', { class: 'ayuda' }, 'Butaca'), h('span', { class: 'butaca-grande' }, e.butaca)));
    };

    const vigentes = entradas.filter((e) => e.estado === 'valida');
    const otras = entradas.filter((e) => e.estado !== 'valida');
    if (vigentes.length) raiz.append(h('div', { class: 'entradas' }, vigentes.map(tarjeta)));
    if (otras.length) raiz.append(h('h2', { style: { marginTop: '36px' } }, 'Usadas y canceladas'), h('div', { class: 'entradas' }, otras.map(tarjeta)));
    raiz.append(h('p', { class: 'ayuda', style: { marginTop: '24px' } }, 'Mostrá el código en la puerta del cine. Se acepta desde 60 minutos antes de la función y una sola vez.'));
    return raiz;
  }

  window.PaginasCliente = { funcion, misEntradas };
})();
