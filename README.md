# Cine Aurora

Web para **comprar entradas de cine eligiendo la butaca**. Incluye cartelera, mapa de butacas con reserva temporal,
pago simulado, entradas con código, cancelaciones con reembolso y un panel de administración (películas, funciones,
validación en puerta y reporte de ventas).

> **Enlace público de la aplicación:** `https://cine-aurora.onrender.com/#/ — ver [`docs/despliegue.md`](docs/despliegue.md).

## Qué tiene de especial (reglas de negocio)

No es un ABM: tiene 16 reglas de negocio numeradas (RN1–RN16) en [`docs/spec.md`](docs/spec.md). Algunas:

- Una butaca **nunca se vende dos veces** (lo garantiza un índice único en la base, no solo el código).
- Las butacas elegidas se **reservan 5 minutos**; después vuelven a estar libres.
- Precio según butaca premium (+25 %), entrada reducida (−30 %, máx. 2) y **miércoles** (−20 %, no se acumula).
- Cierre de venta 15 min antes, **clasificación por edad**, cancelación con reembolso **100 % / 50 % / no permitida**.
- Una sala no puede tener **dos funciones superpuestas** (se suman 15 min de limpieza).
- Código único por entrada, validable **una sola vez** y solo en una ventana horaria.

## Cómo correrlo en tu computadora

Requisitos: **Node.js 22.9 o superior**. No hay dependencias que instalar.


Al arrancar, el servidor crea el administrador inicial y carga una cartelera de demostración (6 películas ficticias,
3 salas, funciones para los próximos 7 días).

## Estructura

```
backend/src/reglas.js      reglas puras de negocio (precios, edad, reembolsos, solapamientos…)
backend/src/servicios/     casos de uso (usuarios, catálogo, reservas, compras, admin)
backend/src/db.js          esquema SQLite e índice único de butacas
backend/src/http/app.js    API REST, roles, CORS y archivos estáticos
backend/test/              132 tests (node --test)
frontend/                  HTML + CSS + JavaScript sin framework
docs/                      idea, decisiones, glosario, preguntas abiertas, spec, plan, tareas, informe, despliegue
AGENTS.md  .cursor/rules/  reglamento del proyecto y reglas de cada agente
```

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [`docs/idea.md`](docs/idea.md) | Qué pidió el cliente, pasado en limpio |
| [`docs/decisiones.md`](docs/decisiones.md) | Cada decisión con su pregunta y respuesta |
| [`docs/glosario.md`](docs/glosario.md) | Vocabulario del negocio |
| [`docs/preguntas-abiertas.md`](docs/preguntas-abiertas.md) | Dudas para próximas versiones |
| [`docs/spec.md`](docs/spec.md) | **Reglas (RN) e historias de usuario (HU)** |
| [`AGENTS.md`](AGENTS.md) | Reglamento y agentes |
| [`docs/plan.md`](docs/plan.md) | Arquitectura, base de datos, API |
| [`docs/tasks.md`](docs/tasks.md) | 15 tareas, todas hechas |
| [`docs/informe.md`](docs/informe.md) | Informe de pruebas, plan y orden de las tareas |
| [`docs/despliegue.md`](docs/despliegue.md) | Cómo publicarlo en internet |

## Usuarios de prueba
- **Cliente:** registrá una cuenta desde la web.
- **Tarjetas de prueba:** `4111 1111 1111 1111` (aprobada) y `4000 0000 0000 0002` (rechazada). Vencimiento futuro y CVV de 3 dígitos.
