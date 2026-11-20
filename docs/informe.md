# Informe del proyecto: pruebas, plan y orden de las tareas

## 1. Resumen

Cine Aurora se construyó con la metodología de las clases: idea → decisiones → glosario → preguntas abiertas → spec
(RN y HU) → agentes → plan → tareas, y luego **un commit por tarea** con el ciclo rojo → verde → refactor.
Resultado: 15 tareas hechas (15 commits), **132 tests automáticos que pasan** y flujos de punta a punta probados en un
navegador real.

## 2. Plan

El plan técnico completo (arquitectura, justificación de SQLite, modelo de datos, API, dónde vive cada regla y
despliegue) está en [`plan.md`](plan.md). En una línea: capas **http → servicios → reglas puras → db**, con reloj
inyectable para poder probar vencimientos y límites de horas sin esperar.

## 3. Por qué las tareas van en este orden

Criterio (de la clase 8): *la parte más difícil y la que más dependencias tiene va primero.*

| Orden | Tarea | Por qué en este lugar |
|-------|-------|-----------------------|
| 1 | T01 Estructura | Sin runner de tests no se puede trabajar en rojo → verde. |
| 2 | T02 Reglas puras | **Todo depende de ellas** (precio, edad, reembolso, solapamiento). Al ser funciones puras se prueban a fondo en los casos borde (24 h exactas, 2 h exactas, 15 min) sin base de datos. |
| 3 | T03 Base de datos | La regla más crítica (RN1, nunca vender dos veces) se asegura **en la base** con un índice único parcial, antes de escribir cualquier servicio que la use. |
| 4 | T04 Cuentas | Reservar y comprar exigen usuario; además define el rol admin. |
| 5 | T05 Cartelera y mapa | Solo lectura y base de los casos de uso que siguen; trae la siembra de datos de demo. |
| 6 | T06 Reserva temporal | **Lo más difícil del negocio** (concurrencia, vencimiento, una reserva por usuario). Va apenas hay cuentas y mapa. |
| 7 | T07 Compra y pago | Necesita una reserva vigente (T06). |
| 8 | T08 Cancelación | Necesita entradas vendidas (T07). |
| 9 | T09 Administración | Programar funciones sin solapamiento; cancelar función reutiliza lo de T07/T08. |
| 10 | T10 Puerta y reporte | Necesita entradas y funciones. |
| 11 | T11 API HTTP | Con todos los casos de uso listos, la capa HTTP solo traduce; así no contiene reglas. |
| 12–14 | T12–T14 Frontend | Recién cuando la API está probada; primero lo público, después el flujo de compra, y al final el panel. |
| 15 | T15 Documentación | Cierra el proyecto con los resultados reales. |

## 4. Pruebas automáticas (`npm test`)

Runner nativo `node --test`, base SQLite en memoria y reloj falso. Última ejecución: **132 tests, 132 pasan, 0 fallan** (~7 s).

| Archivo | Tests | Qué prueba |
|---------|------:|-----------|
| `reglas.test.js` | 18 | Precios, descuentos, edad, cierre de venta, reembolsos, solapamientos, Luhn. Casos límite exactos. |
| `db.test.js` | 7 | El esquema; la base **rechaza** una butaca duplicada (RN1). |
| `usuarios.test.js` | 12 | Registro, login, bloqueo a los 5 intentos, tokens, roles (HU4, HU5). |
| `catalogo.test.js` | 14 | Cartelera, funciones por día, mapa de butacas (HU1–HU3). |
| `reservas.test.js` | 14 | Reserva, vencimiento a los 5 min, una por usuario, edad, cierre de venta (HU6). |
| `compras.test.js` | 17 | Compra, cálculo de precios, tarjeta inválida/rechazada conserva la reserva (HU7, HU8). |
| `cancelaciones.test.js` | 9 | Reembolso 100 % / 50 % / no permitido, butaca liberada (HU9). |
| `admin.test.js` | 17 | Películas, funciones sin solapamiento, cancelar función, baja de película (HU10–12, HU15). |
| `puerta.test.js` | 13 | Validación una sola vez, ventana horaria, reporte (HU13, HU14). |
| `api.test.js` | 11 | HTTP de punta a punta: flujo completo, **dos clientes piden la misma butaca a la vez (201 y 409)**, 401/403 por rol, CORS, errores uniformes, archivos estáticos y *path traversal*. |

Todas las reglas RN1–RN16 y las historias HU1–HU15 aparecen nombradas en al menos un test.

## 5. Pruebas manuales en el navegador

Se ejecutaron con un navegador automatizado (Chromium) contra el servidor real:

| Flujo | Resultado |
|-------|-----------|
| Registro → elegir 3 butacas → reservar → ver cuenta regresiva de 5:00 | OK |
| Pagar con la tarjeta `4000 0000 0000 0002` | Muestra "El banco rechazó el pago" y **conserva la reserva** (RN14) |
| Pagar con `4111 1111 1111 1111` (1 reducida + 2 generales, butaca premium) | 3 entradas con código; total correcto |
| Mis entradas → cancelar con menos de 24 h | Reembolso del 50 %; la entrada pasa a *cancelada* |
| Admin: ver reporte | Vendidas, reembolsado y recaudación neta coinciden con las compras hechas |
| Admin: cargar película y programar función | OK; una segunda función superpuesta es rechazada con mensaje claro (RN11) |
| Admin: validar un código inexistente | Mensaje "No existe ninguna entrada con ese código" |
| Celular (390 px) | El mapa de 10 columnas entra completo, sin scroll horizontal |

### Pruebas de endpoints (equivalente a la colección de Postman)

Con el servidor corriendo, `GET /api/salud`, `GET /api/peliculas`, `POST /api/auth/registro`, etc. se pueden importar
en Postman con la tabla de la API de [`plan.md`](plan.md). Los casos están cubiertos por `api.test.js`.

## 6. Incidencias encontradas durante la construcción

1. **`api.test.js` (2 correcciones al escribir T11).** El test de administración adelantaba el reloj ~29 h y el token de
   admin (dura 12 h, RN15) vencía; ahora el admin vuelve a iniciar sesión y el test además verifica que el token
   vencido da 401. Además intentaba cancelar una función "que ya comenzó" con el reloj *antes* del inicio; se movió el
   reloj a después del inicio. En ambos casos el código cumplía la spec y el error estaba en el escenario del test.
2. **Frontend:** los afiches no tomaban sus colores (las variables CSS no se aplicaban con `Object.assign`) y el hover
   pisaba el color de la butaca elegida. Corregidos y verificados con capturas.

## 7. Limitaciones conocidas

- El pago es simulado (decisión del cliente, pregunta abierta #1).
- SQLite en planes gratuitos con disco efímero: la base puede reiniciarse y se re-siembra la cartelera (pregunta abierta #2; ver `despliegue.md`).
- Los **tests del frontend** son manuales (no hay tests automáticos de interfaz).
- La aplicación **todavía no está publicada**: el enlace del README debe completarse tras seguir `despliegue.md`.
