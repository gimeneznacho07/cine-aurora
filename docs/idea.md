# Idea — Cine Aurora: compra de entradas de cine online

> Documento "pasado en limpio" después de hacerle todas las preguntas al cliente (ver `decisiones.md`).
> Fuente de verdad de las reglas: `spec.md`.

## El cliente

Dueña de **Cine Aurora**, un cine independiente de 3 salas. Hoy vende entradas solo en la boletería
y por WhatsApp. Pierde ventas, y los fines de semana se arman filas y confusiones con las butacas.

## Lo que pidió

Una página web donde la gente pueda **ver la cartelera, elegir su butaca en el mapa de la sala y
comprar sus entradas**, sin llamar ni hacer fila. Y un panel para que el personal del cine cargue la
programación, controle las entradas en la puerta y vea cuánto se vendió.

## Los problemas que quiere resolver

1. Que **nunca se venda dos veces la misma butaca** para la misma función.
2. Que alguien no pueda **dejar butacas "tomadas" para siempre** sin pagar (la reserva dura pocos minutos).
3. Que se pueda **cancelar** una entrada con reglas claras de devolución.
4. Que en la puerta se pueda **validar la entrada** y que no se use dos veces.
5. Que no se pasen películas **superpuestas** en la misma sala.
6. Que un menor no pueda comprar entradas para una película que no corresponde a su edad.

## Usuarios

- **Cliente**: se registra, mira la cartelera, reserva butacas, paga, ve y cancela sus entradas.
- **Administrador (personal del cine)**: carga películas, programa y cancela funciones, valida entradas
  en la puerta y consulta el reporte de ocupación y recaudación.

## Alcance

**Incluye:** cartelera, funciones, mapa de butacas por sala, reserva temporal, compra con pago
**simulado**, entradas con código, cancelación con reembolso, panel de administración, validación en
puerta, reporte.

**No incluye (decidido con el cliente para esta primera versión):** cobro real con pasarela de pago,
envío de emails, venta de snacks/combos, QR gráfico, múltiples cines, aplicación móvil nativa.
