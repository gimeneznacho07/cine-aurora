'use strict';
/* Pantallas públicas: cartelera, detalle de película, registro e inicio de sesión (HU1, HU2, HU4, HU5). */
(function () {
  const { h, fmtHora, fmtDia, claveDia, mayus, fmtPrecio, duracion, afiche, insignia, aviso } = UI;

  async function cartelera() {
    const { peliculas } = await Api.get('/api/peliculas');
    const raiz = h('section', {},
      h('div', { class: 'hero' },
        h('h1', {}, 'Cartelera'),
        h('p', {}, 'Elegí una película, mirá los horarios y reservá tu butaca. Las entradas se compran hasta 15 minutos antes de cada función.')));
    if (!peliculas.length) {
      raiz.append(h('p', { class: 'vacio' }, 'Hoy no hay películas con funciones programadas. Volvé más tarde.'));
      return raiz;
    }
    raiz.append(h('div', { class: 'grilla' }, peliculas.map((p) =>
      h('a', { class: 'tarjeta-peli', href: `#/pelicula/${p.id}` },
        afiche(p),
        h('h3', {}, p.titulo),
        h('div', { class: 'meta' }, insignia(p.clasificacion), h('span', {}, `${p.genero} · ${duracion(p.duracionMin)}`))))));
    return raiz;
  }

  async function pelicula(id) {
    const [{ pelicula: p }, { funciones }] = await Promise.all([
      Api.get(`/api/peliculas/${id}`), Api.get(`/api/funciones?peliculaId=${id}`),
    ]);
    const porDia = new Map();
    for (const f of funciones) {
      const k = claveDia(f.inicioMs);
      if (!porDia.has(k)) porDia.set(k, []);
      porDia.get(k).push(f);
    }
    const dias = [...porDia.values()].map((lista) =>
      h('div', { class: 'dia' },
        h('h3', {}, mayus(fmtDia(lista[0].inicioMs))),
        h('div', { class: 'horarios' }, lista.map((f) => {
          const agotada = f.disponibles === 0;
          const cerrada = !f.ventaAbierta;
          const detalle = [
            h('strong', {}, fmtHora(f.inicioMs)),
            h('small', {}, `${f.sala} · ${f.formato}`),
            h('small', {}, cerrada ? 'Venta cerrada' : agotada ? 'Agotada' : `${f.disponibles} butacas · desde ${fmtPrecio(f.precioDesde)}`),
          ];
          return cerrada || agotada
            ? h('div', { class: 'horario cerrado', 'aria-label': `${fmtHora(f.inicioMs)}, no disponible` }, detalle)
            : h('a', { class: 'horario', href: `#/funcion/${f.id}` }, detalle);
        }))));
    return h('section', {},
      h('div', { class: 'detalle' },
        afiche(p, true),
        h('div', {},
          h('h1', {}, p.titulo),
          h('div', { class: 'meta' }, insignia(p.clasificacion), h('span', {}, `${p.genero} · ${duracion(p.duracionMin)}`)),
          h('p', { style: { marginTop: '16px' } }, p.sinopsis || 'Sin sinopsis.'))),
      h('h2', {}, 'Funciones'),
      dias.length ? dias : h('p', { class: 'vacio' }, 'Esta película no tiene funciones programadas.'));
  }

  /** Formulario genérico de cuenta: muestra el error del servidor dentro del formulario. */
  function formularioCuenta({ titulo, campos, textoBoton, alEnviar, pie }) {
    const error = h('p', { class: 'error-form', role: 'alert', hidden: true });
    const boton = h('button', { class: 'btn btn-aurora', type: 'submit' }, textoBoton);
    const form = h('form', { class: 'formulario', novalidate: true,
      onsubmit: async (ev) => {
        ev.preventDefault();
        error.hidden = true;
        boton.disabled = true;
        try {
          const datos = Object.fromEntries(new FormData(form));
          await alEnviar(datos);
        } catch (e) {
          error.textContent = e.message;
          error.hidden = false;
        } finally { boton.disabled = false; }
      } }, campos, error, boton);
    return h('section', {}, h('h1', {}, titulo), form, h('p', { style: { marginTop: '18px' } }, pie));
  }

  const siguiente = () => new URLSearchParams(location.hash.split('?')[1] || '').get('volver') || '#/';

  function entrar(respuesta) {
    Api.Sesion.guardar({ token: respuesta.token, usuario: respuesta.usuario });
    window.dispatchEvent(new Event('sesion-cambiada'));
    aviso(`Hola, ${respuesta.usuario.nombre.split(' ')[0]}.`);
    location.hash = siguiente();
  }

  const campo = (rotulo, nombre, tipo = 'text', extra = {}, ayuda) =>
    h('label', {}, rotulo, h('input', { name: nombre, type: tipo, required: true, ...extra }), ayuda && h('span', { class: 'ayuda' }, ayuda));

  function login() {
    return formularioCuenta({
      titulo: 'Iniciar sesión',
      campos: [campo('Email', 'email', 'email', { autocomplete: 'email' }), campo('Contraseña', 'password', 'password', { autocomplete: 'current-password' })],
      textoBoton: 'Entrar',
      alEnviar: async (d) => entrar(await Api.post('/api/auth/login', d)),
      pie: ['¿No tenés cuenta? ', h('a', { href: `#/registro?volver=${encodeURIComponent(siguiente())}` }, 'Registrate')],
    });
  }

  function registro() {
    return formularioCuenta({
      titulo: 'Crear cuenta',
      campos: [
        campo('Nombre y apellido', 'nombre', 'text', { autocomplete: 'name', maxlength: 60 }),
        campo('Email', 'email', 'email', { autocomplete: 'email' }),
        campo('Contraseña', 'password', 'password', { autocomplete: 'new-password', minlength: 8 }, 'Mínimo 8 caracteres.'),
        campo('Fecha de nacimiento', 'fechaNacimiento', 'date', { autocomplete: 'bday' }, 'La usamos para controlar la clasificación de edad de las películas.'),
      ],
      textoBoton: 'Crear cuenta',
      alEnviar: async (d) => entrar(await Api.post('/api/auth/registro', d)),
      pie: ['¿Ya tenés cuenta? ', h('a', { href: `#/login?volver=${encodeURIComponent(siguiente())}` }, 'Iniciá sesión')],
    });
  }

  window.PaginasPublicas = { cartelera, pelicula, login, registro };
})();
