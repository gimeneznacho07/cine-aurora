'use strict';
const path = require('node:path');
const { crearApp } = require('./src/http/app');

const secreto = process.env.TOKEN_SECRET;
if (!secreto || secreto.length < 16) {
  console.error('Falta TOKEN_SECRET (mínimo 16 caracteres). Copiá .env.example como .env y completalo.');
  process.exit(1);
}

const app = crearApp({
  ruta: path.resolve(process.env.DB_PATH || 'backend/data/cine.db'),
  secreto,
  adminInicial: { email: process.env.INITIAL_ADMIN_EMAIL, password: process.env.INITIAL_ADMIN_PASSWORD },
  frontendUrl: process.env.FRONTEND_URL || undefined,
  frontendDir: path.join(__dirname, '..', 'frontend'),
  sembrar: true, // carga la cartelera de demostración si falta
});

const puerto = Number(process.env.PORT) || 3000;
app.servidor.listen(puerto, () => console.log(`Cine Aurora escuchando en http://localhost:${puerto}`));

// La cartelera de demostración se repone una vez por hora (siempre hay funciones para los próximos 7 días).
const { sembrarDemo } = require('./src/seed');
setInterval(() => sembrarDemo({ db: app.db, ahora: Date.now }), 60 * 60 * 1000).unref();

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => app.servidor.close(() => process.exit(0)));
}
