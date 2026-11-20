# Spec — Cine Aurora

Documento central. Todo lo que el código hace sale de acá; si algo no está acá, no se construye.

## Objetivo

Permitir comprar entradas de cine online eligiendo butaca, sin que se pueda vender dos veces el mismo
asiento, y darle al personal las herramientas para programar, controlar el ingreso y medir ventas.

## Usuarios y roles

| Rol | Puede |
|-----|-------|
| Visitante | Ver cartelera, funciones y mapa de butacas. Registrarse e iniciar sesión. |
| Cliente | Todo lo del visitante + reservar, comprar, ver y cancelar sus entradas. |
| Administrador | Todo lo del cliente + gestionar películas y funciones, validar entradas, ver reportes. |

## Alcance

Ver `idea.md`. Pago simulado, sin emails, sin QR gráfico.

## Reglas de negocio

| N° | Regla |
|----|-------|
| **RN1** | Una butaca de una función **no puede venderse dos veces**: existe a lo sumo una entrada no cancelada por (función, butaca). Salas 1 y 2: 8 filas (A–H) × 10 columnas = 80 butacas. Sala 3: 6 × 8 = 48. |
| **RN2** | Al elegir butacas se **reservan 5 minutos** a nombre del usuario. En ese tiempo ningún otro puede reservarlas ni comprarlas. Al vencer vuelven a estar libres. |
| **RN3** | Una reserva/compra tiene entre **1 y 6** butacas, sin repetidas y existentes en la sala. |
| **RN4** | Cada usuario tiene **una sola reserva activa**. Reservar otra cosa libera la anterior. |
| **RN5** | El precio de una entrada es el precio base de la función. Las butacas **premium** (las 2 últimas filas de la sala) suman **25 %**. |
| **RN6** | La entrada **reducida** tiene **30 %** de descuento. Máximo **2 reducidas** por compra. |
| **RN7** | Las funciones de **miércoles** (día de la función, hora de Argentina) tienen **20 %** de descuento. **No se acumula** con la reducida: se aplica el **mayor** descuento. El precio se redondea al peso entero. |
| **RN8** | La venta online cierra **15 minutos antes** del inicio de la función. |
| **RN9** | Cada película tiene clasificación **ATP (0), +13, +16, +18**. Si la edad del usuario (según su fecha de nacimiento) es menor, **no puede reservar ni comprar**. |
| **RN10** | El cliente puede cancelar **una entrada**: con **24 h o más** de anticipación se reembolsa el **100 %**; con menos de 24 h y hasta **2 h**, el **50 %**; con menos de 2 h **no se puede**. La butaca vuelve a quedar libre. Solo entradas válidas. |
| **RN11** | Dos funciones de la misma sala **no pueden superponerse**. Una función ocupa la sala **duración + 15 min** de limpieza. |
| **RN12** | Si el administrador **cancela una función** (que no empezó), todas sus entradas válidas se anulan con **reembolso del 100 %** y se liberan las reservas. |
| **RN13** | Cada entrada tiene un **código único** `CA-XXXXXXXX`. En la puerta, el administrador la valida: solo se acepta **desde 60 min antes del inicio hasta que termina la función**, y **una única vez**. Las canceladas no valen. |
| **RN14** | El **pago es simulado**: número válido (Luhn, 12–19 dígitos), vencimiento MM/AA no vencido y CVV de 3–4 dígitos. Solo se guardan los **últimos 4 dígitos**. La tarjeta `4000000000000002` simula rechazo. Un pago rechazado **no** libera la reserva. |
| **RN15** | Registro con email **único** y contraseña de **8+ caracteres** (guardada con hash). Tras **5 intentos fallidos** de login, la cuenta se bloquea **5 minutos**. Las acciones de gestión son solo para el rol administrador. |
| **RN16** | Una película **no puede darse de baja** si tiene funciones futuras con entradas vendidas. Si no las tiene, se da de baja y se cancelan sus funciones futuras. |

## Historias de usuario

**HU1 — Ver la cartelera.** *Como visitante quiero ver las películas en cartel para elegir qué ver.*
- Dado que hay películas con funciones futuras, cuando entro a la página principal, entonces veo solo esas
  películas con título, género, duración y clasificación. (RN16)
- Dado que una película no tiene funciones futuras, cuando entro a la cartelera, entonces no aparece.

**HU2 — Ver las funciones de una película.** *Como visitante quiero ver días, horarios, formato y sala.*
- Dado que elijo una película, cuando abro su detalle, entonces veo sus funciones futuras agrupadas por día,
  con disponibilidad y precio desde. (RN5, RN7)
- Dado que una función está agotada o cerró la venta, cuando la veo, entonces aparece no disponible. (RN8)

**HU3 — Ver el mapa de butacas.** *Como visitante quiero ver qué butacas están libres.*
- Dado que abro una función, cuando se carga el mapa, entonces cada butaca figura *libre*, *ocupada* o
  *reservada*, y las premium se distinguen. (RN1, RN2, RN5)

**HU4 — Registrarme.** *Como visitante quiero crear una cuenta.*
- Dado un email no usado y una contraseña de 8+ caracteres, cuando me registro, entonces quedo logueado. (RN15)
- Dado un email ya registrado o contraseña corta, cuando me registro, entonces recibo un error claro. (RN15)

**HU5 — Iniciar sesión.** *Como cliente quiero entrar a mi cuenta.*
- Dado credenciales correctas, cuando inicio sesión, entonces accedo. (RN15)
- Dado 5 intentos fallidos, cuando intento un sexto, entonces la cuenta está bloqueada 5 minutos. (RN15)

**HU6 — Reservar butacas.** *Como cliente quiero elegir butacas y que me las guarden mientras pago.*
- Dado butacas libres, cuando las reservo, entonces quedan a mi nombre por 5 minutos. (RN2)
- Dado que otra persona las reservó, cuando intento reservarlas, entonces recibo un error de butaca no disponible. (RN1, RN2)
- Dado que pasaron 5 minutos, cuando otra persona las reserva, entonces puede hacerlo. (RN2)
- Dado más de 6 butacas, cuando reservo, entonces recibo error. (RN3)
- Dado que ya tenía una reserva, cuando hago otra, entonces la anterior se libera. (RN4)
- Dado que soy menor para la clasificación, cuando reservo, entonces recibo error. (RN9)
- Dado que faltan menos de 15 min para la función, cuando reservo, entonces recibo error. (RN8)

**HU7 — Comprar entradas.** *Como cliente quiero pagar y recibir mis entradas.*
- Dado una reserva vigente y una tarjeta válida, cuando pago, entonces obtengo entradas con código y el total
  correcto según tipo, butaca y día. (RN5, RN6, RN7, RN13, RN14)
- Dado una tarjeta inválida o rechazada, cuando pago, entonces recibo el error y **conservo** la reserva. (RN14)
- Dado más de 2 entradas reducidas, cuando pago, entonces recibo error. (RN6)
- Dado que la reserva venció, cuando pago, entonces recibo error de reserva vencida. (RN2)

**HU8 — Ver mis entradas.** *Como cliente quiero ver mis entradas y su código.*
- Dado que compré, cuando entro a "Mis entradas", entonces veo función, butaca, tipo, precio, código y estado. (RN13)

**HU9 — Cancelar una entrada.** *Como cliente quiero cancelar si no puedo ir.*
- Dado una entrada válida con 24 h o más, cuando cancelo, entonces se reembolsa el 100 %. (RN10)
- Dado entre 2 h y 24 h, cuando cancelo, entonces se reembolsa el 50 %. (RN10)
- Dado menos de 2 h, cuando cancelo, entonces no puedo. (RN10)
- Dado que cancelé, cuando otro usuario mira la función, entonces la butaca está libre. (RN1, RN10)

**HU10 — Cargar una película (admin).**
- Dado título, duración (30–300 min) y clasificación válida, cuando la cargo, entonces queda disponible para programar. (RN9)

**HU11 — Programar una función (admin).**
- Dado película, sala, fecha futura, formato y precio, cuando la creo, entonces se crea si no se superpone con otra
  de la misma sala. (RN11)
- Dado una superposición (incluye los 15 min de limpieza), cuando la creo, entonces recibo error. (RN11)

**HU12 — Cancelar una función (admin).**
- Dado una función con entradas vendidas, cuando la cancelo, entonces todas se anulan con reembolso del 100 %. (RN12)
- Dado una función que ya empezó, cuando intento cancelarla, entonces recibo error. (RN12)

**HU13 — Validar una entrada en la puerta (admin).**
- Dado una entrada válida dentro de la ventana horaria, cuando la valido, entonces pasa a *usada*. (RN13)
- Dado una entrada ya usada, cancelada o fuera de horario, cuando la valido, entonces se rechaza con el motivo. (RN13)

**HU14 — Ver el reporte (admin).**
- Dado funciones con ventas, cuando abro el reporte, entonces veo por función las entradas vendidas, ocupación y
  recaudación neta (ventas menos reembolsos). (RN10, RN12)

**HU15 — Dar de baja una película (admin).**
- Dado una película sin ventas futuras, cuando la doy de baja, entonces deja de aparecer. (RN16)
- Dado una con entradas vendidas para funciones futuras, cuando intento darla de baja, entonces recibo error. (RN16)

## Casos borde

- Exactamente 24 h antes → 100 %; exactamente 2 h antes → 50 %; exactamente 15 min antes → todavía se vende.
- Dos funciones de la misma sala que "se tocan" justo en el límite (fin + limpieza = inicio de la otra) **no** se superponen.
- Reservar las mismas butacas que ya tengo reservadas yo (volver a la pantalla) funciona.
- Una reserva fallida no pierde la reserva anterior del usuario.
- Un usuario no puede ver ni cancelar entradas de otro.
- Si falla el pago, las butacas siguen reservadas hasta que venza el tiempo.

## Pendientes

Ninguno. Las mejoras futuras están en `preguntas-abiertas.md`.
