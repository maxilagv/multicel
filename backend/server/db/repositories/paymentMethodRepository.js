const { query } = require('../pg');

function normalizeRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    nombre: row.nombre,
    moneda: row.moneda || null,
    activo: Number(row.activo) === 1,
    orden: row.orden != null ? Number(row.orden) : 0,
    creado_en: row.creado_en,
    actualizado_en: row.actualizado_en,
  };
}

async function list({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE activo = 1';
  const { rows } = await query(
    `SELECT id, nombre, moneda, activo, orden, creado_en, actualizado_en
       FROM metodos_pago
       ${where}
      ORDER BY orden ASC, nombre ASC`
  );
  return rows.map(normalizeRow);
}

async function findById(id) {
  const { rows } = await query(
    `SELECT id, nombre, moneda, activo, orden, creado_en, actualizado_en
       FROM metodos_pago
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return normalizeRow(rows[0]);
}

async function create({ nombre, moneda = null, activo = true, orden = 0 }) {
  const { rows, lastID } = await query(
    `INSERT INTO metodos_pago(nombre, moneda, activo, orden)
     VALUES ($1, $2, $3, $4)`,
    [nombre, moneda, activo ? 1 : 0, orden]
  );
  const id = rows?.[0]?.id || lastID;
  return findById(id);
}

async function update(id, { nombre, moneda, activo, orden }) {
  const sets = [];
  const params = [];
  let p = 1;
  if (typeof nombre !== 'undefined') {
    sets.push(`nombre = $${p++}`);
    params.push(nombre);
  }
  if (typeof moneda !== 'undefined') {
    sets.push(`moneda = $${p++}`);
    params.push(moneda);
  }
  if (typeof activo !== 'undefined') {
    sets.push(`activo = $${p++}`);
    params.push(activo ? 1 : 0);
  }
  if (typeof orden !== 'undefined') {
    sets.push(`orden = $${p++}`);
    params.push(orden);
  }
  if (!sets.length) return findById(id);
  params.push(id);
  await query(
    `UPDATE metodos_pago
        SET ${sets.join(', ')},
            actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $${p}`,
    params
  );
  return findById(id);
}

async function deactivate(id) {
  await query(
    `UPDATE metodos_pago
        SET activo = 0,
            actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id]
  );
  return findById(id);
}

module.exports = { list, findById, create, update, deactivate };
