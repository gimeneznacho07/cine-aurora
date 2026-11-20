# Despliegue en internet

La consigna pide backend publicado y la app accesible desde internet. Hay dos formas; la **A es la más simple**.

## A. Todo en un solo servicio (recomendado): Render

El backend ya sirve la carpeta `frontend/`, así que un único *Web Service* alcanza (y no hace falta CORS).

1. Subí el proyecto a un repositorio de GitHub (ver "Subir a GitHub" abajo).
2. En [render.com](https://render.com) → **New → Web Service** → elegí el repositorio.
3. Configuración:
   - **Runtime:** Node (versión 22; si hace falta, agregá la variable `NODE_VERSION=22`).
   - **Build command:** *(vacío o `echo ok`)* — no hay dependencias.
   - **Start command:** `npm start`
4. **Environment** (variables de entorno, nunca en el código):

   | Variable | Valor |
   |----------|-------|
   | `TOKEN_SECRET` | una cadena larga y aleatoria |
   | `INITIAL_ADMIN_EMAIL` | tu email de administrador |
   | `INITIAL_ADMIN_PASSWORD` | contraseña de 8+ caracteres |
   | `DB_PATH` | `/var/data/cine.db` si agregás un disco persistente; si no, dejá el valor por defecto |

5. Cuando termine, abrí la URL que da Render, probá el flujo y **pegá esa URL en el README** (línea "Enlace público").

**Plan gratuito:** Render "duerme" el servicio si no se usa y el primer pedido puede tardar ~30 s. El disco es efímero:
al reiniciarse se pierden usuarios y compras, pero la cartelera se vuelve a sembrar sola. Para conservar los datos
agregá un *Disk* (plan pago) montado en `/var/data` o migrá a PostgreSQL (pregunta abierta #2: solo cambia `db.js`).

## B. Frontend en Netlify y backend en Render (como en las clases)

1. Desplegá el backend en Render como en A y agregá la variable `FRONTEND_URL` con la URL de Netlify (sin barra final):
   así el backend acepta pedidos **solo** de ese origen (CORS).
2. En `frontend/config.js` poné `window.CINE_API_URL = 'https://TU-BACKEND.onrender.com';`
3. En Netlify: **Add new site → Import from Git**, *publish directory* `frontend`, sin build command.

## Subir a GitHub

```bash
git remote add origin https://github.com/TU_USUARIO/cine-aurora.git
git branch -M main
git push -u origin main
```

El `.gitignore` ya excluye `.env` y la base local. Verificá con `git status` que `.env` no aparece antes de subir.
Después pegá el enlace del repositorio en el espacio de entrega del Módulo 5.

## Checklist antes de entregar

- [ ] `npm test` en verde
- [ ] La app abre desde internet y se puede comprar una entrada de punta a punta
- [ ] README con el enlace público
- [ ] Ningún secreto en el repositorio (`git log -p | grep -i secret` sin valores reales)
- [ ] Enlace del repositorio subido al Módulo 5 antes del 31 de diciembre
