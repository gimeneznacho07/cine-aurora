# AGENTS.md — Reglamento de la obra

Vale para todos los agentes (y para las personas) que trabajan en este proyecto.

## Qué es el proyecto

**Cine Aurora**: web para comprar entradas de cine eligiendo butaca. Backend con API REST, frontend web,
panel de administración. Pago simulado.

## Dónde está cada cosa y cuál es la fuente de verdad

| Documento | Para qué | Prioridad |
|-----------|----------|-----------|
| `docs/spec.md` | Reglas de negocio (RN) e historias de usuario (HU). **Fuente de verdad.** | 1 |
| `docs/decisiones.md` | Por qué se decidió cada cosa. | 2 |
| `docs/glosario.md` | Significado de cada término. Se usa **ese** vocabulario en el código. | 2 |
| `docs/plan.md` | Arquitectura, modelo de datos, API, dónde vive cada regla. | 3 |
| `docs/tasks.md` | Tareas, su orden y su estado. | 3 |
| `docs/preguntas-abiertas.md` | Dudas pendientes y decisiones provisorias. | 4 |

Si el código contradice la spec, **gana la spec**. Si la spec está incompleta, se agrega a
`preguntas-abiertas.md` y se consulta; **no se inventa**.

## Stack

- Node.js 22 (sin dependencias externas) y SQLite integrado (`node:sqlite`).
- Frontend: HTML + CSS + JavaScript sin framework, servido por el mismo backend o por un hosting estático.
- Tests: `node --test` (runner nativo).

## Reglas generales

1. **Un commit por tarea** de `docs/tasks.md`, con el mensaje `T07: compra y pago simulado`.
2. **Los secretos nunca van al repositorio.** Van en `.env` (está en `.gitignore`) y, en la nube, como
   variables de entorno. Hay un `.env.example` sin valores reales.
3. **Cada regla de negocio vive en un solo lugar** (ver tabla en `docs/plan.md`) y tiene al menos un test que
   nombra su número (`RN7`).
4. **Los tests se escriben antes que la implementación y el desarrollador no los modifica** para hacerlos pasar.
   Si un test está mal, se discute con el tester y el analista.
5. Vocabulario del glosario, en español, tanto en código como en mensajes de error.
6. Los mensajes de error de la API tienen la forma `{ "error": { "codigo", "mensaje" } }`.
7. Nada de datos sensibles en logs (contraseñas, números de tarjeta).

## Agentes

Reglas detalladas en `.cursor/rules/`.

| Agente | Responsabilidad |
|--------|-----------------|
| Analista | Mantiene idea, decisiones, glosario, preguntas abiertas y spec. |
| Arquitecto | Mantiene `plan.md` y `tasks.md`; decide estructura y orden de tareas. |
| Desarrollador backend | API, reglas de negocio, base de datos. |
| Desarrollador frontend | Pantallas, consumo de la API, accesibilidad. |
| Tester | Escribe los tests de cada tarea antes de la implementación. |
| Revisor | Revisa contra la spec y aprueba antes del commit. |

## Ciclo de trabajo de cada tarea (rojo → verde → refactor)

1. **Tester**: escribe los tests de la tarea (deben fallar: *rojo*).
2. **Desarrollador**: implementa lo mínimo para que pasen (*verde*), sin tocar los tests.
3. **Desarrollador**: refactoriza con los tests en verde.
4. **Revisor**: verifica reglas (RN/HU), secretos, nombres y que **toda** la suite pase.
5. Recién ahí: **commit** y marcar la tarea como hecha en `docs/tasks.md`.
