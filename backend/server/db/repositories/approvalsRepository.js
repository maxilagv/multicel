const { query, withTransaction } = require('../../db/pg');

async function createPending({ regla_id, solicitado_por_usuario_id, entidad, entidad_id, motivo, payload }) {
  return withTransaction(async (client) => {
    const payloadJson = payload ? JSON.stringify(payload) : null;
    const ins = await client.query(
      `INSERT INTO aprobaciones(regla_id, estado, solicitado_por_usuario_id, entidad, entidad_id, motivo, payload)
       VALUES ($1,'pendiente',$2,$3,$4,$5,$6)
       RETURNING id`,
      [regla_id, solicitado_por_usuario_id || null, entidad || null, entidad_id || null, motivo || null, payloadJson]
    );
    const id = ins.rows[0].id;
    await client.query(
      `INSERT INTO aprobaciones_historial(aprobacion_id, usuario_id, accion, notas)
       VALUES ($1,$2,'creado',$3)`,
      [id, solicitado_por_usuario_id || null, motivo || null]
    );
    return { id };
  });
}

async function list({ estado = 'pendiente', limit = 100, offset = 0 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const { rows } = await query(
    `SELECT a.id, a.estado, a.solicitado_por_usuario_id, a.aprobado_por_usuario_id,
            a.entidad, a.entidad_id, a.motivo, a.payload, a.creado_en, a.actualizado_en,
            r.clave AS regla_clave, r.descripcion AS regla_descripcion
       FROM aprobaciones a
       JOIN reglas_aprobacion r ON r.id = a.regla_id
      WHERE ($1::text IS NULL OR a.estado = $1)
      ORDER BY a.id DESC
      LIMIT $2 OFFSET $3`,
    [estado || null, lim, off]
  );
  return rows.map((r) => ({
    ...r,
    payload: typeof r.payload === 'string' ? safeJsonParse(r.payload) : r.payload,
  }));
}

async function updateStatus({ id, estado, aprobado_por_usuario_id, notas }) {
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE aprobaciones SET estado = $1, aprobado_por_usuario_id = $2, resuelto_en = NOW(), actualizado_en = NOW() WHERE id = $3`,
      [estado, aprobado_por_usuario_id || null, id]
    );
    await client.query(
      `INSERT INTO aprobaciones_historial(aprobacion_id, usuario_id, accion, notas)
       VALUES ($1,$2,$3,$4)`,
      [id, aprobado_por_usuario_id || null, estado === 'aprobado' ? 'aprobado' : 'rechazado', notas || null]
    );
    return { id };
  });
}

module.exports = { createPending, list, updateStatus };

// Consume (delete) a matching approved approval so the guarded action can proceed
// Match by rule id + entity + entity id and, if provided, payload (as JSONB @> filter)
async function consumeApprovedMatch({ regla_id, entidad, entidad_id, payload }) {
  return withTransaction(async (client) => {
    const payloadJson = payload ? JSON.stringify(payload) : null;
    const sel = await client.query(
      `SELECT id
         FROM aprobaciones
        WHERE regla_id = $1
          AND estado = 'aprobado'
          AND (($2::text IS NULL AND entidad IS NULL) OR entidad = $2)
          AND (($3::bigint IS NULL AND entidad_id IS NULL) OR entidad_id = $3)
          AND ($4::text IS NULL OR payload = $4)
        ORDER BY id DESC
        LIMIT 1`,
      [regla_id, entidad || null, entidad_id || null, payloadJson]
    );
    if (!sel.rows.length) return null;
    const id = sel.rows[0].id;
    await client.query('DELETE FROM aprobaciones WHERE id = $1', [id]);
    return { id };
  });
}

module.exports.consumeApprovedMatch = consumeApprovedMatch;

function safeJsonParse(value) {
  if (!value) return value;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
