/**
 * Crea una app Express mínima solo con las rutas necesarias para cada test.
 * Evita cargar el sistema completo (con DB, WhatsApp, etc.) en tests unitarios.
 *
 * Uso:
 *   const app = createTestApp({ routes: ['auth'] });
 *   const res = await request(app).post('/api/login').send({...});
 */

const express = require('express');
const xss = require('xss-clean');

const ROUTE_MAP = {
  auth: () => require('../../routes/authroutes'),
  products: () => require('../../routes/productroutes'),
  sales: () => require('../../routes/salesroutes'),
  clients: () => require('../../routes/clientroutes'),
  config: () => require('../../routes/configroutes'),
};

function createTestApp({ routes = [] } = {}) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(xss());

  for (const routeKey of routes) {
    const routeLoader = ROUTE_MAP[routeKey];
    if (!routeLoader) throw new Error(`Ruta de test desconocida: ${routeKey}`);
    app.use('/api', routeLoader());
  }

  // Error handler genérico
  app.use((err, req, res, _next) => {
    res.status(500).json({ error: err.message || 'Error interno' });
  });

  return app;
}

module.exports = { createTestApp };
