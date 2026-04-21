const { query } = require('../db/pg');
const audit = require('../services/auditService');

const AUDITABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ROUTE_TABLES = [
  { regex: /^\/api\/productos\/(\d+)$/i, entidad: 'productos', table: 'productos' },
  { regex: /^\/api\/clientes\/(\d+)$/i, entidad: 'clientes', table: 'clientes' },
  { regex: /^\/api\/usuarios\/(\d+)$/i, entidad: 'usuarios', table: 'usuarios' },
  { regex: /^\/api\/metodos-pago\/(\d+)$/i, entidad: 'metodos_pago', table: 'metodos_pago' },
  { regex: /^\/api\/ventas\/(\d+)$/i, entidad: 'ventas', table: 'ventas' },
];

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return null;
  }
}

function resolveRouteMetadata(url) {
  const path = String(url || '').split('?')[0];
  for (const item of ROUTE_TABLES) {
    const match = path.match(item.regex);
    if (match) {
      return {
        entidad: item.entidad,
        table: item.table,
        entidadId: Number(match[1]),
      };
    }
  }

  const parts = path.split('/').filter(Boolean);
  return {
    entidad: parts[1] || 'sistema',
    table: null,
    entidadId: null,
  };
}

async function loadPreviousRow(table, entidadId) {
  if (!table || !entidadId) return null;
  try {
    const { rows } = await query(`SELECT * FROM ${table} WHERE id = $1 LIMIT 1`, [entidadId]);
    return rows[0] || null;
  } catch (_) {
    return null;
  }
}

async function auditMiddleware(req, res, next) {
  const method = String(req.method || 'GET').toUpperCase();
  if (!AUDITABLE_METHODS.has(method)) return next();

  const meta = resolveRouteMetadata(req.originalUrl || req.url);
  req.auditMeta = {
    ...meta,
    previousData: await loadPreviousRow(meta.table, meta.entidadId),
    requestBody: safeJson(req.body),
  };

  res.on('finish', () => {
    if (res.statusCode >= 500) return;

    audit
      .logDetailed({
        usuario_id: req.user?.sub ? Number(req.user.sub) : null,
        usuario_email: req.user?.email || req.body?.email || null,
        accion: `${method.toLowerCase()}.${req.auditMeta?.entidad || 'sistema'}`,
        entidad: req.auditMeta?.entidad || 'sistema',
        entidad_id: req.auditMeta?.entidadId || null,
        datos_anteriores: req.auditMeta?.previousData || null,
        datos_nuevos: req.auditMeta?.requestBody || null,
        ip_address: req.ip || null,
        user_agent: req.get('User-Agent') || null,
        request_id: req.id || null,
      })
      .catch(() => {});
  });

  return next();
}

module.exports = auditMiddleware;
