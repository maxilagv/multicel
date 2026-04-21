const express = require('express');
const router = express.Router();
const { ping, getPoolStats } = require('../db/pg');
const pkg = require('../package.json');
const {
  getSalesDailyAggregateStatus,
} = require('../services/salesDailyAggregateService');

function getRuntimeStoreStatus() {
  try {
    const { getRuntimeStoreStatus } = require('../services/runtimeStore');
    return getRuntimeStoreStatus();
  } catch (_) {
    return { backend: 'memory', connected: false, configured: false };
  }
}

async function buildHealthPayload() {
  const startedAt = Date.now();
  let dbOk = false;
  let dbError = null;

  try {
    await ping();
    dbOk = true;
  } catch (err) {
    dbError = err?.message || 'db_unavailable';
  }

  return {
    status: dbOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Number(process.uptime().toFixed(2)),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || pkg.version,
    request_window_ms: Date.now() - startedAt,
    db: {
      status: dbOk ? 'connected' : 'error',
      error: dbError,
      pool: getPoolStats(),
    },
    sales_aggregates: getSalesDailyAggregateStatus(),
    runtime_store: getRuntimeStoreStatus(),
  };
}

async function healthHandler(req, res) {
  const payload = await buildHealthPayload();
  return res.status(payload.db.status === 'connected' ? 200 : 503).json(payload);
}

router.get('/health', healthHandler);
router.get('/healthz', healthHandler);

router.get('/readyz', async (req, res) => {
  const payload = await buildHealthPayload();
  return res.status(payload.db.status === 'connected' ? 200 : 503).json(payload);
});

router.get('/livez', (req, res) => {
  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Number(process.uptime().toFixed(2)),
    version: process.env.APP_VERSION || pkg.version,
  });
});

// ── /api/ops/status — solo accesible con OPS_SECRET en header ──
// Para monitoreo del operador/desarrollador, no del cliente
router.get('/ops/status', async (req, res) => {
  const opsSecret = process.env.OPS_SECRET;
  if (opsSecret) {
    const provided = req.headers['x-ops-secret'] || req.query.secret;
    if (!provided || provided !== opsSecret) {
      return res.status(403).json({ error: 'No autorizado' });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'OPS_SECRET no configurado' });
  }

  const health = await buildHealthPayload();

  return res.json({
    ...health,
    process: {
      pid: process.pid,
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      nodeVersion: process.version,
    },
  });
});

module.exports = router;
