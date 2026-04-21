const { query } = require('../pg');

async function list({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE activo = 1';
  const { rows } = await query(
    `SELECT id, nombre, color_hex, activo
       FROM zonas
       ${where}
       ORDER BY nombre ASC`
  );
  return rows;
}

async function create({ nombre, color_hex, activo = true }) {
  const { rows } = await query(
    `INSERT INTO zonas(nombre, color_hex, activo)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [nombre, color_hex, !!activo]
  );
  return rows[0];
}

async function update(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  for (const [key, col] of Object.entries({ nombre: 'nombre', color_hex: 'color_hex', activo: 'activo' })) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${p++}`);
      params.push(fields[key]);
    }
  }
  if (!sets.length) return { id };
  params.push(id);
  const { rows } = await query(`UPDATE zonas SET ${sets.join(', ')}, actualizado_en = CURRENT_TIMESTAMP WHERE id = $${p} RETURNING id`, params);
  return rows[0] || null;
}

async function deactivate(id) {
  const { rows } = await query(
    `UPDATE zonas SET activo = 0, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  list,
  create,
  update,
  deactivate,
};
