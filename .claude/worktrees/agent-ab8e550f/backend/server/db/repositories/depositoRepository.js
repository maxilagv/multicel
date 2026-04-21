const { query } = require('../../db/pg');

async function list({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE activo = TRUE';
  const { rows } = await query(
    `SELECT id,
            nombre,
            codigo,
            direccion,
            activo,
            creado_en,
            actualizado_en
       FROM depositos
       ${where}
       ORDER BY nombre ASC`
  );
  return rows;
}

async function create({ nombre, codigo, direccion }) {
  const sql = `
    INSERT INTO depositos(nombre, codigo, direccion, activo)
    VALUES ($1, $2, $3, TRUE)
    RETURNING id
  `;
  const params = [nombre, codigo || null, direccion || null];
  const { rows } = await query(sql, params);
  return rows[0];
}

async function update(id, { nombre, codigo, direccion, activo }) {
  const sets = [];
  const params = [];
  let p = 1;

  if (typeof nombre !== 'undefined') {
    sets.push(`nombre = $${p++}`);
    params.push(nombre);
  }
  if (typeof codigo !== 'undefined') {
    sets.push(`codigo = $${p++}`);
    params.push(codigo || null);
  }
  if (typeof direccion !== 'undefined') {
    sets.push(`direccion = $${p++}`);
    params.push(direccion || null);
  }
  if (typeof activo !== 'undefined') {
    sets.push(`activo = $${p++}`);
    params.push(Boolean(activo));
  }

  if (!sets.length) return null;

  const sql = `UPDATE depositos SET ${sets.join(', ')}, actualizado_en = NOW() WHERE id = $${p} RETURNING id`;
  params.push(id);
  const { rows } = await query(sql, params);
  return rows[0] || null;
}

async function deactivate(id) {
  const { rows } = await query(
    'UPDATE depositos SET activo = FALSE, actualizado_en = NOW() WHERE id = $1 RETURNING id',
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

