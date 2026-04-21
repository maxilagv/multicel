const { query } = require('../../db/pg');

async function findActiveByKey(clave) {
  const { rows } = await query(
    `SELECT id, clave, descripcion, condicion, activo FROM reglas_aprobacion WHERE clave = $1 AND activo = TRUE LIMIT 1`,
    [clave]
  );
  const row = rows[0] || null;
  if (row && typeof row.condicion === 'string') {
    row.condicion = safeJsonParse(row.condicion);
  }
  return row;
}

async function list({ activo } = {}) {
  const params = [];
  const where = [];
  if (typeof activo === 'boolean') {
    params.push(activo);
    where.push(`activo = $${params.length}`);
  }
  const sql = `SELECT id, clave, descripcion, condicion, activo, creado_en, actualizado_en FROM reglas_aprobacion ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC`;
  const { rows } = await query(sql, params);
  return rows.map((r) => ({
    ...r,
    condicion: typeof r.condicion === 'string' ? safeJsonParse(r.condicion) : r.condicion,
  }));
}

async function create({ clave, descripcion, condicion, activo = true }) {
  const condValue = condicion && typeof condicion === 'object' ? JSON.stringify(condicion) : condicion || null;
  const { rows } = await query(
    `INSERT INTO reglas_aprobacion(clave, descripcion, condicion, activo)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [clave, descripcion || null, condValue, Boolean(activo)]
  );
  return rows[0];
}

function safeJsonParse(value) {
  if (!value || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

module.exports = { findActiveByKey, list, create };
