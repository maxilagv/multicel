// ==============================
//   CARGA DE VARIABLES ENV
// ==============================
require('dotenv').config();

const express = require('express');
const app = express();

// ==============================
//   🔥 TRUST PROXY — OBLIGATORIO EN RENDER
// ==============================
// Debe ser la PRIMERA configuración de express
app.set('trust proxy', 'loopback');

// ==============================
//   IMPORTS DE MIDDLEWARES
// ==============================
const helmet = require('helmet');
const cors = require('cors');
const xss = require('xss-clean');
const compression = require('compression');
const path = require('path');
const hpp = require('hpp');

const {
  apiLimiter,
  apiGlobalLimiter,
  loggingMiddleware,
  pathTraversalProtection,
  sendSMSNotification,
} = require('./middlewares/security.js');

// ==============================
//   IMPORT DE RUTAS
// ==============================
const authRoutes = require('./routes/authroutes.js');
const setupRoutes = require('./routes/setuproutes.js');
const productRoutes = require('./routes/productroutes.js');
const categoryRoutes = require('./routes/categoryroutes.js');
const publicRoutes = require('./routes/publicroutes.js');
const healthRoutes = require('./routes/healthroutes.js');
const orderRoutes = require('./routes/orderroutes.js');
const reportRoutes = require('./routes/reportroutes.js');
const aiRoutes = require('./routes/airoutes.js');
const inventoryRoutes = require('./routes/inventarioroutes.js');
const userRoutes = require('./routes/userroutes.js');
const clientRoutes = require('./routes/clientroutes.js');
const clientPortalRoutes = require('./routes/clientportalroutes.js');
const supplierRoutes = require('./routes/supplierroutes.js');
const purchaseRoutes = require('./routes/purchaseroutes.js');
const salesRoutes = require('./routes/salesroutes.js');
const paymentRoutes = require('./routes/paymentroutes.js');
const paymentMethodRoutes = require('./routes/paymentmethodroutes.js');
const crmRoutes = require('./routes/crmroutes.js');
const ticketRoutes = require('./routes/ticketroutes.js');
const approvalRoutes = require('./routes/approvalroutes.js');
const financeRoutes = require('./routes/financeroutes.js');
const vendorPayrollRoutes = require('./routes/vendorpayrollroutes.js');
const configRoutes = require('./routes/configroutes.js');
const catalogRoutes = require('./routes/catalogroutes.js');
const llmRoutes = require('./routes/llmroutes.js');
const adminRoutes = require('./routes/adminroutes.js');
const depositoRoutes = require('./routes/depositoroutes.js');
const zonasRoutes = require('./routes/zonasroutes.js');
const marketplaceRoutes = require('./routes/marketplaceroutes.js');
const arcaRoutes = require('./routes/arcaroutes.js');
const ownerRoutes = require('./routes/ownerroutes.js');
const pricingRoutes = require('./routes/pricingroutes.js');

// ==============================
//   CONFIG SERVER
// ==============================
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Necesario para Render

app.disable('x-powered-by');

// ==============================
//   HELMET + CSP
// ==============================
const cspConnectSrc = (() => {
  const set = new Set([
    "'self'",
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);

  if (process.env.CORS_ALLOWED_ORIGINS) {
    process.env.CORS_ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .forEach((origin) => {
        try {
          set.add(new URL(origin).origin);
        } catch {}
      });
  }

  if (process.env.PUBLIC_ORIGIN) {
    try {
      set.add(new URL(process.env.PUBLIC_ORIGIN).origin);
    } catch {}
  }

  return Array.from(set);
})();

app.use(
  helmet({
    referrerPolicy: { policy: 'no-referrer' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https://placehold.co"],
        connectSrc: cspConnectSrc,
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        objectSrc: ["'none'"],
      },
    },
  })
);

// Log temprano para incluir rechazos por CORS
app.use(loggingMiddleware);

// ==============================
//   CORS CONFIG
// ==============================
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

const baseAllowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
];

if (process.env.PUBLIC_ORIGIN) {
  try {
    baseAllowedOrigins.push(new URL(process.env.PUBLIC_ORIGIN).origin);
  } catch {}
}

const allowedOriginsSet = new Set(
  [...baseAllowedOrigins, ...allowedOrigins].filter(Boolean)
);

const corsAllowAll =
  process.env.CORS_ALLOW_ALL === 'true' ||
  process.env.CORS_ALLOWED_ORIGINS === '*';

const allowNullOrigin =
  process.env.CORS_ALLOW_NULL === 'true';

function corsOrigin(origin, callback) {
  if (corsAllowAll) return callback(null, true);
  if (!origin) return callback(null, true);
  if (origin === 'null') {
    return allowNullOrigin
      ? callback(null, true)
      : callback(new Error('No permitido por CORS'));
  }
  if (allowedOriginsSet.has(origin)) return callback(null, true);
  return callback(new Error('No permitido por CORS'));
}

app.use(
  cors({
    origin: corsAllowAll ? true : corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    optionsSuccessStatus: 204,
  })
);

// ==============================
//   MIDDLEWARES BASE
// ==============================
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(compression({ threshold: '1kb' }));
app.use(xss());
app.use(hpp());

// ==============================
//   LOG + PROTECCIÓN PATH TRAVERSAL
// ==============================
app.use(pathTraversalProtection);

// ==============================
//   GLOBAL RATE LIMIT ANTES DE RUTAS
// ==============================
app.use('/api', apiGlobalLimiter);

// ==============================
//   ARCHIVOS ESTÁTICOS
// ==============================
app.use(
  express.static(path.join(__dirname, 'public'), {
    etag: true,
    lastModified: true,
    maxAge: '7d',
    immutable: true,
  })
);

// ==============================
//   TODAS LAS RUTAS
// ==============================
app.use('/api', healthRoutes);
app.use('/api', publicRoutes);
app.use('/api', authRoutes);
app.use('/api', setupRoutes);
app.use('/api', productRoutes);
app.use('/api', categoryRoutes);
app.use('/api', orderRoutes);
app.use('/api', reportRoutes);
app.use('/api', aiRoutes);
app.use('/api', llmRoutes);
app.use('/api', inventoryRoutes);
app.use('/api', userRoutes);
app.use('/api', clientRoutes);
app.use('/api', clientPortalRoutes);
app.use('/api', supplierRoutes);
app.use('/api', purchaseRoutes);
app.use('/api', salesRoutes);
app.use('/api', paymentRoutes);
app.use('/api', paymentMethodRoutes);
app.use('/api', crmRoutes);
app.use('/api', ticketRoutes);
app.use('/api', approvalRoutes);
app.use('/api', financeRoutes);
app.use('/api', vendorPayrollRoutes);
app.use('/api', configRoutes);
app.use('/api', catalogRoutes);
app.use('/api', adminRoutes);
app.use('/api', depositoRoutes);
app.use('/api', zonasRoutes);
app.use('/api', marketplaceRoutes);
app.use('/api', arcaRoutes);
app.use('/api', ownerRoutes);
app.use('/api', pricingRoutes);

// ==============================
//   RUTA DEFAULT
// ==============================
app.get('/', (req, res) => {
  res.send('Servidor funcionando en Render');
});

// ==============================
//   ERROR HANDLER
// ==============================
app.use((err, req, res, next) => {
  console.error(err.stack);

  if (err.message === 'No permitido por CORS') {
    return res.status(403).json({ error: 'Origen no permitido', request_id: req.id });
  }

  sendSMSNotification(
    `Error grave en servidor: ${err.message}. Ruta: ${req.originalUrl}`
  );

  return res
    .status(500)
    .json({ error: 'Error interno del servidor', request_id: req.id });
});

// ==============================
//   START SERVER
// ==============================
function startServer({ port = PORT, host = HOST } = {}) {
  const server = app.listen(port, host, () => {
    console.log(`Servidor escuchando en http://${host}:${port}`);
  });

  // Keep alive para Render
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer;

