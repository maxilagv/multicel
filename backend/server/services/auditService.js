const logger = require('../lib/logger');
const { query } = require('../db/pg');

function safeStringify(value) {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
}

function safeParse(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (_) {
    return value;
  }
}

async function log({
  usuario_id = null,
  accion,
  tabla_afectada,
  registro_id = null,
  descripcion = null,
}) {
  try {
    await query(
      `INSERT INTO logs(usuario_id, accion, tabla_afectada, registro_id, descripcion)
       VALUES ($1, $2, $3, $4, $5)`,
      [usuario_id, accion, tabla_afectada, registro_id, descripcion]
    );
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('[audit] legacy log failed:', e.message);
    }
  }
}

async function logDetailed({
  usuario_id = null,
  usuario_email = null,
  accion,
  entidad = null,
  entidad_id = null,
  datos_anteriores = null,
  datos_nuevos = null,
  ip_address = null,
  user_agent = null,
  request_id = null,
}) {
  const previousJson = safeStringify(datos_anteriores);
  const nextJson = safeStringify(datos_nuevos);

  try {
    await query(
      `INSERT INTO audit_log(
         usuario_id,
         usuario_email,
         accion,
         entidad,
         entidad_id,
         datos_anteriores,
         datos_nuevos,
         ip_address,
         user_agent,
         request_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        usuario_id,
        usuario_email,
        accion,
        entidad,
        entidad_id,
        previousJson,
        nextJson,
        ip_address,
        user_agent,
        request_id,
      ]
    );
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('[audit] detailed log failed:', e.message);
    }
  }

  return log({
    usuario_id,
    accion,
    tabla_afectada: entidad || 'sistema',
    registro_id: entidad_id,
    descripcion:
      previousJson || nextJson
        ? `prev=${previousJson || 'null'} next=${nextJson || 'null'}`
        : null,
  });
}

async function listDetailed({ limit = 100, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  const { rows } = await query(
    `SELECT id,
            usuario_id,
            usuario_email,
            accion,
            entidad,
            entidad_id,
            datos_anteriores,
            datos_nuevos,
            ip_address,
            user_agent,
            request_id,
            created_at
       FROM audit_log
      ORDER BY created_at DESC, id DESC
      LIMIT $1 OFFSET $2`,
    [lim, off]
  );
  return rows.map((row) => ({
    ...row,
    datos_anteriores: safeParse(row.datos_anteriores),
    datos_nuevos: safeParse(row.datos_nuevos),
  }));
}

module.exports = {
  log,
  logDetailed,
  listDetailed,
};
