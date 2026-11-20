# Preguntas abiertas

Dudas sin responder para una próxima versión, de **mayor a menor impacto**. Ninguna bloquea la v1:
para cada una se dejó una decisión provisoria.

| # | Pregunta | Regla que afecta | Impacto | Decisión provisoria (v1) |
|---|----------|------------------|---------|--------------------------|
| 1 | ¿Qué pasarela de pago real se va a usar (Mercado Pago, etc.) y cómo se devuelve el dinero? | RN10, RN12, RN14 | Alto | Pago simulado; el reembolso solo se registra en el sistema. |
| 2 | ¿Dónde se aloja la base de datos en producción? En planes gratuitos el disco de SQLite se borra al reiniciar. | RN1 | Alto | SQLite con volumen persistente si el hosting lo permite; si no, se re-siembra la cartelera al arrancar. Migrar a PostgreSQL (Neon) cambia solo `db.js`. |
| 3 | ¿Hay que acreditar la condición de entrada reducida en la puerta? | RN6 | Medio | Se limita a 2 por compra y se controla en puerta. |
| 4 | ¿Se envían emails con la confirmación y recordatorios? | RN13 | Medio | No en v1; el cliente ve sus entradas en la web. |
| 5 | ¿Hay butacas para personas con movilidad reducida que deban reservarse aparte? | RN1 | Medio | No distinguidas en v1. |
| 6 | ¿Se agregan combos de pochoclos a la compra? | RN5 | Bajo | Fuera de alcance. |
| 7 | ¿Se necesita un QR escaneable en vez de ingresar el código a mano? | RN13 | Bajo | El código se tipea o se lee en voz alta. |
