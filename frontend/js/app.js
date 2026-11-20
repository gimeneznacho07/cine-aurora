'use strict';
/* Router por hash y barra de navegación. */
(function () {
  const { h, aviso } = UI;
  const principal = document.getElementById('principal');
  const nav = document.getElementById('nav');

  // Cada ruta: patrón, si exige sesión ('usuario' | 'admin' | null) y la función que arma la pantalla.
  const rutas = [
    [/^\/$/, null, () => PaginasPublicas.cartelera()],
    [/^\/pelicula\/(\d+)$/, null, (id) => PaginasPublicas.pelicula(id)],
    [/^\/funcion\/(\d+)$/, null, (id) => PaginasCliente.funcion(id)],
    [/^\/login$/, null, () => PaginasPublicas.login()],
    [/^\/registro$/, null, () => PaginasPublicas.registro()],
    [/^\/mis-entradas$/, 'usuario', () => PaginasCliente.misEntradas()],
    [/^\/admin$/, 'admin', () => PaginasAdmin.panel()],
  ];

  let limpiezas = [];
  /** Las pantallas registran acá lo que hay que detener al salir (por ejemplo, temporizadores). */
  window.alSalir = (fn) => limpiezas.push(fn);

  function dibujarNav() {
    const s = Api.Sesion.actual();
    const actual = location.hash.split('?')[0] || '#/';
    const enlace = (href, texto) => h('a', { href, 'aria-current': actual === href ? 'page' : false }, texto);
    nav.replaceChildren(
      enlace('#/', 'Cartelera'),
      ...(s ? [
        enlace('#/mis-entradas', 'Mis entradas'),
        ...(s.usuario.rol === 'admin' ? [enlace('#/admin', 'Administración')] : []),
        h('button', { type: 'button', onclick: () => { Api.Sesion.borrar(); dibujarNav(); aviso('Cerraste la sesión.'); location.hash = '#/'; } }, `Salir (${s.usuario.nombre.split(' ')[0]})`),
      ] : [enlace('#/login', 'Iniciar sesión'), enlace('#/registro', 'Crear cuenta')]));
  }

  let version = 0;
  async function mostrar() {
    const miVersion = ++version;
    limpiezas.forEach((f) => f());
    limpiezas = [];
    const ruta = (location.hash.slice(1) || '/').split('?')[0];
    dibujarNav();
    for (const [patron, acceso, armar] of rutas) {
      const m = patron.exec(ruta);
      if (!m) continue;
      const s = Api.Sesion.actual();
      if (acceso && !s) { location.hash = `#/login?volver=${encodeURIComponent('#' + ruta)}`; return; }
      if (acceso === 'admin' && s.usuario.rol !== 'admin') {
        principal.replaceChildren(h('p', { class: 'error-form' }, 'Esta sección es solo para administradores.'));
        return;
      }
      principal.replaceChildren(h('p', { class: 'suave' }, 'Cargando…'));
      try {
        const pantalla = await armar(...m.slice(1));
        if (miVersion !== version) return; // el usuario cambió de pantalla mientras cargaba
        principal.replaceChildren(pantalla);
        window.scrollTo(0, 0);
        principal.focus({ preventScroll: true });
      } catch (e) {
        if (miVersion !== version) return;
        principal.replaceChildren(h('section', {},
          h('h1', {}, e.status === 404 ? 'No encontramos eso' : 'No pudimos cargar la pantalla'),
          h('p', { class: 'error-form' }, e.message),
          h('p', {}, h('a', { class: 'btn', href: '#/' }, 'Volver a la cartelera'))));
      }
      return;
    }
    principal.replaceChildren(h('section', {}, h('h1', {}, 'Página no encontrada'), h('a', { class: 'btn', href: '#/' }, 'Ir a la cartelera')));
  }

  window.addEventListener('hashchange', mostrar);
  window.addEventListener('sesion-cambiada', dibujarNav);
  mostrar();
})();
