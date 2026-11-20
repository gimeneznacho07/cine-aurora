# Decisiones

Cada decisión con su **pregunta** y su **respuesta**, ordenadas por tema.
Como no hay un cliente real, hicimos de cliente pensando cuál sería la mejor solución para el negocio.

## Butacas y salas

**P: ¿Cómo son las salas?**
R: Hay 3 salas. Las salas 1 y 2 tienen 8 filas (A–H) × 10 columnas = 80 butacas. La sala 3 ("Sala Premium")
tiene 6 filas × 8 columnas = 48 butacas. Cada butaca se nombra con fila + número (ej. `C7`). → RN1

**P: ¿Qué es una butaca premium?**
R: Las **2 últimas filas** de cada sala (mejor ángulo, reclinables). Cuestan 25 % más. → RN5

**P: ¿Se puede vender dos veces la misma butaca si es de funciones distintas?**
R: Sí, la unicidad es por **función + butaca**. → RN1

## Reservas

**P: ¿Qué pasa entre que el cliente elige las butacas y paga?**
R: Se **reservan 5 minutos**. En ese tiempo nadie más puede tomarlas. Si no paga, se liberan solas. → RN2

**P: ¿Cuántas entradas puede comprar una persona de una vez?**
R: Mínimo 1, máximo **6**. → RN3

**P: ¿Puede tener reservas en varias funciones a la vez?**
R: No. Solo **una reserva activa por usuario**; si reserva otra cosa, la anterior se libera
(evita que una persona bloquee media sala en varias funciones). → RN4

## Precios

**P: ¿Cómo se calcula el precio?**
R: Cada función tiene un precio base (según formato 2D/3D). Las butacas premium suman 25 %. → RN5

**P: ¿Hay descuentos?**
R: Entrada **reducida** (jubilados/menores de 12): 30 % menos, máximo 2 por compra. Los **miércoles**: 20 % menos
para todos. → RN6, RN7

**P: ¿Los descuentos se acumulan?**
R: **No.** Se aplica el mayor de los dos (el cliente de un cine chico no puede regalar hasta 50 %). El precio
se redondea al peso entero. → RN7

**P: ¿Qué día se considera "miércoles"?**
R: El día en que **se proyecta la función**, en hora de Argentina (no el día de compra). → RN7

## Venta y edad

**P: ¿Hasta cuándo se venden entradas online?**
R: Hasta **15 minutos antes** del inicio; después solo en boletería. → RN8

**P: ¿Se controla la edad?**
R: Sí. Clasificaciones: ATP, +13, +16, +18. Se calcula con la fecha de nacimiento del registro. Un menor no
puede reservar ni comprar. → RN9

## Cancelaciones

**P: ¿Se puede cancelar?**
R: Sí, **entrada por entrada**: con 24 h o más de anticipación se devuelve el 100 %; entre 24 h y 2 h, el 50 %;
con menos de 2 h no se puede cancelar. La butaca vuelve a quedar libre. → RN10

**P: ¿Y si cancela el cine la función?**
R: Se anulan todas las entradas con reembolso del 100 % automático. Solo si la función no empezó. → RN12

## Programación

**P: ¿Pueden pisarse dos funciones en la misma sala?**
R: No. Una función ocupa la sala durante **duración de la película + 15 min de limpieza**. → RN11

**P: ¿Se puede dar de baja una película?**
R: Solo si no tiene entradas vendidas para funciones futuras; si no, se da de baja y se cancelan sus funciones
futuras vacías. → RN16

## Puerta y pago

**P: ¿Cómo se valida en la puerta?**
R: Cada entrada tiene un **código único** (`CA-XXXXXXXX`). El personal lo ingresa en el panel. Se acepta desde
**60 min antes** hasta que termina la función, y **una sola vez**. → RN13

**P: ¿Cómo se paga?**
R: En esta versión el pago es **simulado**: se valida número (Luhn), vencimiento y CVV. Solo se guardan los
**últimos 4 dígitos**, nunca el número completo. La tarjeta `4000 0000 0000 0002` simula un rechazo.
Un pago rechazado **no** pierde la reserva. → RN14

## Cuentas

**P: ¿Qué se pide para registrarse?**
R: Nombre, email (único), contraseña de 8+ caracteres y fecha de nacimiento. La contraseña se guarda con hash
(scrypt). Tras 5 intentos fallidos de login, se bloquea 5 minutos. → RN15

## Técnicas

**P: ¿Qué stack?** R: Node.js 22 (sin librerías externas) + SQLite integrado (`node:sqlite`) + frontend HTML/CSS/JS
sin framework. La docente aclaró que no se evalúa una tecnología en particular.

**P: ¿Por qué SQLite y no PostgreSQL?** R: Permite transacciones y un índice único parcial que garantiza RN1 a nivel de
base de datos, y se corre sin instalar nada. Contra: en hosting gratuito el disco es efímero (ver `preguntas-abiertas.md`).
