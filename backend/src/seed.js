'use strict';
const { HORA, CONFIG, partesAR, inicioDiaAR } = require('./reglas');

// Películas de demostración (todas ficticias). Los "colores" arman el afiche en el frontend.
const PELICULAS = [
  ['La Última Frontera', 'Una tripulación cruza el borde del sistema solar y descubre que no está sola.', 'Ciencia ficción', 128, '+13', '#1d2b64', '#f2a93b'],
  ['Noches de Neón', 'Una periodista persigue una pista que la lleva a lo más oscuro de la ciudad.', 'Thriller', 112, '+16', '#2a0845', '#e5604d'],
  ['El Jardín de Mamá Rosa', 'Tres generaciones se reúnen para salvar la huerta familiar.', 'Comedia', 98, 'ATP', '#2f6f4e', '#f6d365'],
  ['Tormenta en el Sur', 'Un viaje por la Patagonia que pone a prueba a un padre y su hija.', 'Aventura', 141, '+13', '#0f3b57', '#7ec8e3'],
  ['Sombras del Abismo', 'Una expedición submarina despierta algo que debía seguir dormido.', 'Terror', 104, '+18', '#0b0c10', '#7a1f3d'],
  ['Pequeño Cosmos', 'Un robot diminuto sueña con tocar las estrellas.', 'Animación', 92, 'ATP', '#3a1c71', '#ffaf7b'],
];

const SALAS = [
  { nombre: 'Sala 1', filas: 8, columnas: 10, formato: '2D', precio: 8500 },
  { nombre: 'Sala 2', filas: 8, columnas: 10, formato: '2D', precio: 8500 },
  { nombre: 'Sala Premium', filas: 6, columnas: 8, formato: '3D', precio: 11000 },
];

const HORARIOS = [15, 18, 21]; // horas de inicio (AR). 180 min de margen alcanzan para la película más larga + limpieza.
const DIAS = 7;

/**
 * Carga datos de demostración. Es idempotente y "repone": si algún día de los próximos 7 no tiene funciones, las genera.
 * Si no hay salas ni películas, las crea.
 */
function sembrarDemo({ db, ahora }) {
  if (db.prepare('SELECT COUNT(*) n FROM salas').get().n === 0) {
    const ins = db.prepare('INSERT INTO salas (nombre, filas, columnas) VALUES (?, ?, ?)');
    for (const s of SALAS) ins.run(s.nombre, s.filas, s.columnas);
  }
  if (db.prepare('SELECT COUNT(*) n FROM peliculas').get().n === 0) {
    const ins = db.prepare(
      'INSERT INTO peliculas (titulo, sinopsis, genero, duracion_min, clasificacion, color_a, color_b) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const p of PELICULAS) ins.run(...p);
  }

  const salas = db.prepare('SELECT id, nombre FROM salas ORDER BY id').all();
  const peliculas = db.prepare('SELECT id, duracion_min FROM peliculas WHERE activa = 1 ORDER BY id').all();
  if (!peliculas.length) return 0;
  const configSala = (nombre) => SALAS.find((s) => s.nombre === nombre) ?? { formato: '2D', precio: 8500 };

  const insFuncion = db.prepare(
    'INSERT INTO funciones (pelicula_id, sala_id, inicio_ms, formato, precio_base) VALUES (?, ?, ?, ?, ?)');
  const hoy = partesAR(ahora());
  let creadas = 0;

  for (let dia = 0; dia < DIAS; dia++) {
    const inicioDia = inicioDiaAR(hoy.anio, hoy.mes, hoy.dia) + dia * 24 * HORA;
    const hayFunciones = db.prepare('SELECT COUNT(*) n FROM funciones WHERE inicio_ms >= ? AND inicio_ms < ?')
      .get(inicioDia, inicioDia + 24 * HORA).n;
    if (hayFunciones > 0) continue;
    salas.forEach((sala, si) => {
      HORARIOS.forEach((h, hi) => {
        const inicio = inicioDia + h * HORA;
        if (inicio <= ahora() + CONFIG.CIERRE_VENTA_MS) return; // las que ya empezaron o cerraron la venta no se cargan
        const pelicula = peliculas[(dia * 3 + si * 2 + hi) % peliculas.length];
        const { formato, precio } = configSala(sala.nombre);
        insFuncion.run(pelicula.id, sala.id, inicio, formato, precio);
        creadas += 1;
      });
    });
  }
  return creadas;
}

module.exports = { sembrarDemo };
