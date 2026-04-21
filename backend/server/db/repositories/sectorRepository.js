const { query, withTransaction } = require('../../db/pg');

async function list({ soloActivos = true, usuario_id, incluirUsuarios = false } = {}) {
  const params = [];
  const where = [];

  if (soloActivos) where.push('s.activo = TRUE');

  if (usuario_id) {
    params.push(Number(usuario_id));
    where.push(
      `EXISTS (
        SELECT 1
          FROM sectores_usuarios su
         WHERE su.sector_id = s.id
           AND su.usuario_id = $${params.length}
           AND su.activo = TRUE
      )`
    );
  }

  const { rows } = await query(
    `SELECT s.id,
            s.codigo,
            s.nombre,
            s.descripcion,
            s.color_hex,
            s.activo
       FROM sectores s
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY s.nombre ASC`,
    params
  );

  if (!incluirUsuarios || !rows.length) return rows;

  const ids = rows.map((row) => Number(row.id));
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
  const { rows: userRows } = await query(
    `SELECT su.sector_id,
            su.usuario_id,
            su.rol_sector,
            su.es_responsable,
            su.activo,
            u.nombre AS usuario_nombre,
            u.email AS usuario_email
       FROM sectores_usuarios su
       JOIN usuarios u ON u.id = su.usuario_id
      WHERE su.sector_id IN (${placeholders})
      ORDER BY u.nombre ASC`,
    ids
  );

  const usersBySector = new Map();
  for (const row of userRows) {
    const sectorId = Number(row.sector_id);
    if (!usersBySector.has(sectorId)) usersBySector.set(sectorId, []);
    usersBySector.get(sectorId).push(row);
  }

  return rows.map((row) => ({
    ...row,
    usuarios: usersBySector.get(Number(row.id)) || [],
  }));
}

async function getById(id) {
  const { rows } = await query(
    `SELECT id, codigo, nombre, descripcion, color_hex, activo
       FROM sectores
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function getByCodigo(codigo) {
  const { rows } = await query(
    `SELECT id, codigo, nombre, descripcion, color_hex, activo
       FROM sectores
      WHERE codigo = $1
      LIMIT 1`,
    [codigo]
  );
  return rows[0] || null;
}

async function setUsuarios(sectorId, usuarios = []) {
  return withTransaction(async (client) => {
    await client.query('DELETE FROM sectores_usuarios WHERE sector_id = $1', [sectorId]);

    for (const usuario of usuarios) {
      await client.query(
        `INSERT INTO sectores_usuarios(sector_id, usuario_id, rol_sector, es_responsable, activo)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [
          Number(sectorId),
          Number(usuario.usuario_id),
          usuario.rol_sector || 'profesional',
          usuario.es_responsable ? 1 : 0,
        ]
      );
    }

    return getById(sectorId);
  });
}

module.exports = {
  list,
  getById,
  getByCodigo,
  setUsuarios,
};
