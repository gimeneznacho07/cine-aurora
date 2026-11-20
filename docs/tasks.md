# Tareas

Ordenadas por dependencias. **Lo más difícil y lo que más dependencias tiene va primero**: las reglas puras
(todo el sistema depende de ellas), después la base de datos y la reserva de butacas (el corazón del negocio, RN1/RN2),
y recién después la compra, el panel y las pantallas. Un commit por tarea.

Estados: `[ ]` pendiente · `[x]` hecha.

| N° | Estado | Título | Agente | Qué hacer | Cubre | Depende de | Terminado cuando |
|----|--------|--------|--------|-----------|-------|------------|------------------|
| T01 | [x] | Estructura del proyecto | Arquitecto | `package.json`, `.gitignore`, `.env.example`, carpetas, runner de tests | — | docs | `npm test` corre (aunque no haya tests) |
| T02 | [x] | Reglas puras de negocio | Backend | `reglas.js`: precios, descuentos, edad, cierre de venta, reembolso, solapamiento, Luhn | RN3, RN5–RN11, RN13, RN14 | T01 | Tests de límites pasan |
| T03 | [x] | Base de datos y esquema | Backend | `db.js`: tablas, índice único parcial, transacciones; `errores.js` | RN1 | T01 | Test: la base rechaza butaca duplicada |
| T04 | [x] | Cuentas y sesión | Backend | Registro, login, hash, token, bloqueo por intentos, roles | RN15 · HU4, HU5 | T02, T03 | Tests de HU4/HU5 pasan |
| T05 | [ ] | Cartelera, funciones y mapa de butacas | Backend | Servicios de lectura y siembra de datos de demo | RN1, RN2, RN5, RN16 · HU1–HU3 | T03 | Tests de HU1–HU3 pasan |
| T06 | [ ] | Reserva temporal de butacas | Backend | Reservar, vencer, liberar; una reserva por usuario | RN1–RN4, RN8, RN9 · HU6 | T04, T05 | Tests de HU6 pasan |
| T07 | [ ] | Compra y pago simulado | Backend | Comprar, precios, códigos, tarjeta | RN5–RN7, RN13, RN14 · HU7, HU8 | T06 | Tests de HU7/HU8 pasan |
| T08 | [ ] | Cancelación de entradas | Backend | Cancelar con reembolso 100/50/0 % | RN10 · HU9 | T07 | Tests de HU9 pasan |
| T09 | [ ] | Administración: películas y funciones | Backend | Alta de películas, funciones sin solapamiento, cancelar función, baja de película | RN11, RN12, RN16 · HU10–HU12, HU15 | T07, T08 | Tests de HU10–HU12, HU15 pasan |
| T10 | [ ] | Validación en puerta y reporte | Backend | Validar código, reporte de ocupación y recaudación | RN13 · HU13, HU14 | T09 | Tests de HU13/HU14 pasan |
| T11 | [ ] | API HTTP, CORS y estáticos | Backend | Rutas, roles, errores uniformes, CORS, servidor | todas | T04–T10 | Tests HTTP de punta a punta pasan |
| T12 | [ ] | Frontend base: cartelera, película, cuentas | Frontend | Router, helpers, estilos, login/registro | HU1, HU2, HU4, HU5 | T11 | Se navega y se ingresa desde el navegador |
| T13 | [ ] | Frontend: butacas, pago y mis entradas | Frontend | Mapa, reserva con cuenta regresiva, pago, entradas, cancelar | HU3, HU6–HU9 | T12 | Se compra y se cancela de punta a punta |
| T14 | [ ] | Frontend: panel de administración | Frontend | Películas, funciones, validar, reporte | HU10–HU15 | T12 | Un admin puede hacer todo desde la web |
| T15 | [ ] | README, informe y despliegue | Arquitecto | README con enlace público, informe de pruebas, guía de despliegue | — | T14 | Documentación completa |
