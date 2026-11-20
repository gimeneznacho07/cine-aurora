# Plan técnico

## Arquitectura

```
 Navegador (frontend/)                Backend (Node.js)                    Base de datos
 ┌──────────────────┐   HTTP/JSON   ┌──────────────────────────┐        ┌────────────┐
 │ HTML + CSS + JS  │ ────────────► │ http/  (rutas, CORS,     │        │  SQLite    │
 │ hash-router, sin │               │         auth, estáticos) │        │ node:sqlite│
 │ framework        │ ◄──────────── │ servicios/ (casos de uso)│ ─────► │ + índice   │
 └──────────────────┘               │ reglas.js  (reglas puras)│        │ único RN1  │
                                    │ db.js      (esquema)     │        └────────────┘
                                    └──────────────────────────┘
```

Capas, de afuera hacia adentro: **http** (traduce HTTP ↔ llamadas, no tiene reglas) → **servicios**
(casos de uso, transacciones, validaciones) → **reglas** (funciones puras, sin base de datos ni reloj) → **db**.

El backend también sirve la carpeta `frontend/`, por lo que se puede publicar todo junto en un único servicio;
o bien el frontend puede ir en un hosting estático aparte (ver *Despliegue*).

## Base de datos y justificación

**SQLite** mediante el módulo integrado `node:sqlite` (Node ≥ 22.9):

- Soporta **transacciones** (`BEGIN IMMEDIATE`) y un **índice único parcial** que impone RN1 en la propia base:
  `UNIQUE (funcion_id, butaca) WHERE estado <> 'cancelada'`. Aun si hubiera un bug en el código, la base se
  niega a vender dos veces la misma butaca.
- Cero dependencias: se corre con `npm start`, sin instalar nada ni levantar otro servidor.
- Contra: en hosting gratuito el disco puede ser efímero. Mitigación: la cartelera se **siembra al arrancar** si la base
  está vacía, y `db.js` es el único archivo que habría que cambiar para migrar a PostgreSQL (Neon). Ver pregunta abierta #2.

## Modelo de datos

| Tabla | Campos principales |
|-------|--------------------|
| `usuarios` | id, nombre, email (único), pass_hash, fecha_nac, rol (`cliente`/`admin`) |
| `salas` | id, nombre, filas, columnas |
| `peliculas` | id, titulo, sinopsis, genero, duracion_min, clasificacion, color_a, color_b, activa |
| `funciones` | id, pelicula_id → peliculas, sala_id → salas, inicio_ms, formato, precio_base, estado (`programada`/`cancelada`) |
| `holds` (reservas temporales) | id, usuario_id, funcion_id, butacas (JSON), expira_ms |
| `compras` | id, usuario_id, funcion_id, total, tarjeta_ultimos4, creada_ms |
| `entradas` | id, compra_id, funcion_id, butaca, tipo, precio, codigo (único), estado (`valida`/`usada`/`cancelada`), reembolso, usada_ms, cancelada_ms |

Las fechas se guardan como milisegundos UTC. Argentina no tiene horario de verano (UTC−3 fijo), y los cálculos
de "día de la función" usan la zona `America/Argentina/Buenos_Aires`.

## API

Errores: `{ "error": { "codigo": "...", "mensaje": "..." } }`. Autenticación: `Authorization: Bearer <token>`.

| Método y ruta | Acceso | Descripción | HU |
|---------------|--------|-------------|----|
| `GET /api/salud` | público | Chequeo de estado | — |
| `POST /api/auth/registro` | público | Crea cuenta y devuelve token | HU4 |
| `POST /api/auth/login` | público | Inicia sesión | HU5 |
| `GET /api/yo` | cliente | Datos del usuario logueado | HU5 |
| `GET /api/peliculas` | público | Cartelera | HU1 |
| `GET /api/peliculas/:id` | público | Detalle de película | HU2 |
| `GET /api/funciones?peliculaId=&fecha=` | público | Funciones futuras con disponibilidad | HU2 |
| `GET /api/funciones/:id` | público (con token marca "mías") | Mapa de butacas y precios | HU3 |
| `POST /api/funciones/:id/reserva` | cliente | Reserva temporal de butacas | HU6 |
| `GET /api/reserva` | cliente | Reserva activa del usuario | HU6 |
| `DELETE /api/reserva` | cliente | Libera la reserva activa | HU6 |
| `POST /api/compras` | cliente | Paga la reserva y emite entradas | HU7 |
| `GET /api/mis-entradas` | cliente | Entradas del usuario | HU8 |
| `POST /api/entradas/:id/cancelar` | cliente | Cancela una entrada | HU9 |
| `GET /api/admin/peliculas` | admin | Todas las películas | HU10 |
| `POST /api/admin/peliculas` | admin | Crea película | HU10 |
| `DELETE /api/admin/peliculas/:id` | admin | Da de baja película | HU15 |
| `GET /api/admin/salas` | admin | Salas | HU11 |
| `POST /api/admin/funciones` | admin | Programa función | HU11 |
| `POST /api/admin/funciones/:id/cancelar` | admin | Cancela función | HU12 |
| `POST /api/admin/validar` | admin | Valida entrada en puerta | HU13 |
| `GET /api/admin/reporte` | admin | Ocupación y recaudación | HU14 |

## Dónde vive cada regla

| Regla | Lógica pura (`reglas.js`) | Caso de uso / otro |
|-------|---------------------------|--------------------|
| RN1 | `parsearButaca` | `db.js` (índice único), `servicios/reservas.js`, `servicios/compras.js` |
| RN2, RN4 | `CONFIG.RESERVA_MS` | `servicios/reservas.js` |
| RN3 | `CONFIG.MAX_ENTRADAS` | `servicios/reservas.js` |
| RN5, RN6, RN7 | `calcularPrecio`, `esPremium` | `servicios/compras.js` (máx. 2 reducidas) |
| RN8 | `ventaAbierta` | `servicios/reservas.js`, `servicios/compras.js` |
| RN9 | `edadEn`, `edadMinima` | `servicios/reservas.js`, `servicios/compras.js` |
| RN10 | `calcularReembolso` | `servicios/compras.js` |
| RN11 | `haySolapamiento` | `servicios/admin.js` |
| RN12 | — | `servicios/admin.js` |
| RN13 | `ventanaValidacion` | `servicios/admin.js` |
| RN14 | `luhnValido`, `vencimientoVigente` | `servicios/compras.js` |
| RN15 | — | `servicios/usuarios.js`, `auth.js`, `http/app.js` (roles) |
| RN16 | — | `servicios/admin.js` |

## Decisiones técnicas

- **Reloj inyectable** (`ahora()`): permite probar vencimientos y límites de horas sin esperar.
- **Reserva = tabla `holds`** con vencimiento; se limpian los vencidos al consultar. No hace falta un proceso de fondo.
- **Atomicidad**: reservar y comprar corren en `BEGIN IMMEDIATE`; si algo falla, se revierte todo (incluida la reserva anterior, RN4).
- **Contraseñas**: `scrypt` con sal aleatoria. **Sesión**: token firmado con HMAC-SHA256 (`TOKEN_SECRET`), vence en 12 h.
- **CORS**: si existe `FRONTEND_URL`, el backend acepta pedidos solo de ese origen.
- **Secretos** solo por variables de entorno: `TOKEN_SECRET`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `FRONTEND_URL`, `DB_PATH`.
- Sin frameworks: el frontend usa un helper `h()` que crea nodos DOM sin `innerHTML`.

## Despliegue

| Parte | Local | Internet (sugerido) |
|-------|-------|---------------------|
| Todo junto (backend + frontend estático) | `http://localhost:3000` | Render (Web Service, Node 22) |
| Frontend solo (opcional) | `frontend/` | Netlify, con `config.js` apuntando a la URL del backend |
| Base de datos | archivo `backend/data/cine.db` | Disco persistente de Render, o migración a PostgreSQL (Neon) |

Variables en Render: `TOKEN_SECRET`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `DB_PATH`, y `FRONTEND_URL` si el frontend va aparte.

## Preguntas para el analista

1. ¿Se prefiere persistencia real desde el día 1 (PostgreSQL) aunque complique el arranque? *(Provisorio: SQLite.)*
2. ¿La edad se verifica al comprar o al día de la función? *(Provisorio: al momento de reservar/comprar.)*
