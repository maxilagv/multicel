const { query } = require('../../db/pg');
const { buildSaleVisibilityClause } = require('../../lib/saleVisibility');

async function list({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE activo = 1';
  const { rows } = await query(
    `SELECT id, nombre, color, emoji, activo, usuario_id, created_at
       FROM vendedor_perfiles
       ${where}
       ORDER BY nombre ASC`
  );
  return rows;
}

async function findById(id) {
  const { rows } = await query(
    'SELECT id, nombre, color, emoji, activo FROM vendedor_perfiles WHERE id = $1 LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function create({ nombre, color, emoji, usuario_id }) {
  const { rows } = await query(
    `INSERT INTO vendedor_perfiles(nombre, color, emoji, usuario_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
    [nombre, color || '#6366f1', emoji || null, usuario_id || null]
  );
  return rows[0];
}

async function update(id, { nombre, color, emoji, activo }) {
  const sets = [];
  const params = [];
  let p = 1;

  if (typeof nombre !== 'undefined') { sets.push(`nombre = $${p++}`); params.push(nombre); }
  if (typeof color !== 'undefined') { sets.push(`color = $${p++}`); params.push(color); }
  if (typeof emoji !== 'undefined') { sets.push(`emoji = $${p++}`); params.push(emoji || null); }
  if (typeof activo !== 'undefined') { sets.push(`activo = $${p++}`); params.push(activo ? 1 : 0); }

  if (!sets.length) return null;

  params.push(id);
  const { rows } = await query(
    `UPDATE vendedor_perfiles SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${p} RETURNING id`,
    params
  );
  return rows[0] || null;
}

async function ranking({ desde, hasta, visibility = null } = {}) {
  const where = [
    "(v.oculto IS NULL OR v.oculto = 0)",
    "v.estado_pago != 'cancelado'",
    'v.usuario_id IS NOT NULL',
  ];
  const params = [];
  let p = 1;

  if (desde) {
    where.push(`v.fecha >= $${p++}`);
    params.push(desde);
  }
  if (hasta) {
    where.push(`v.fecha <= $${p++}`);
    params.push(`${hasta} 23:59:59`);
  }
  const visibilityClause = buildSaleVisibilityClause(params, visibility, 'v');
  if (visibilityClause) {
    where.push(visibilityClause);
  }

  const { rows } = await query(
    `SELECT
       COALESCE(vp_directo.usuario_id, v.usuario_id) AS id,
       COALESCE(
         NULLIF(TRIM(u_owner.nombre), ''),
         NULLIF(TRIM(v.vendedor_nombre), ''),
         NULLIF(TRIM(vp_directo.nombre), ''),
         NULLIF(TRIM(vp_usuario.nombre), ''),
         NULLIF(TRIM(u_owner.email), ''),
         CONCAT('Usuario #', COALESCE(vp_directo.usuario_id, v.usuario_id)::text)
       ) AS nombre,
       COALESCE(vp_usuario.color, vp_directo.color, '#6366f1') AS color,
       COALESCE(vp_usuario.emoji, vp_directo.emoji) AS emoji,
       COUNT(v.id)               AS total_ventas,
       COALESCE(SUM(v.total), 0) AS monto_total,
       COALESCE(SUM(v.neto), 0)  AS neto_total,
       MAX(v.fecha)              AS ultima_venta
     FROM ventas v
LEFT JOIN vendedor_perfiles vp_directo
       ON vp_directo.id = v.vendedor_perfil_id
LEFT JOIN usuarios u_owner
       ON u_owner.id = COALESCE(vp_directo.usuario_id, v.usuario_id)
LEFT JOIN vendedor_perfiles vp_usuario
       ON vp_usuario.usuario_id = COALESCE(vp_directo.usuario_id, v.usuario_id)
      AND vp_usuario.activo = 1
     WHERE ${where.join(' AND ')}
     GROUP BY COALESCE(vp_directo.usuario_id, v.usuario_id),
              u_owner.id,
              u_owner.nombre,
              u_owner.email,
              vp_directo.nombre,
              vp_directo.color,
              vp_directo.emoji,
              vp_usuario.nombre,
              vp_usuario.color,
              vp_usuario.emoji
     ORDER BY monto_total DESC, total_ventas DESC, ultima_venta DESC NULLS LAST`,
    params
  );
  return rows;
}

async function recentSales(limit = 10, visibility = null) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
  const params = [];
  const where = [
    'v.usuario_id IS NOT NULL',
    "(v.oculto IS NULL OR v.oculto = 0)",
    "v.estado_pago != 'cancelado'",
  ];
  const visibilityClause = buildSaleVisibilityClause(params, visibility, 'v');
  if (visibilityClause) {
    where.push(visibilityClause);
  }
  params.push(lim);
  const { rows } = await query(
    `SELECT
       v.id,
       v.fecha,
       v.total,
       COALESCE(vp_directo.usuario_id, v.usuario_id) AS usuario_id,
       COALESCE(
         NULLIF(TRIM(u_owner.nombre), ''),
         NULLIF(TRIM(v.vendedor_nombre), ''),
         NULLIF(TRIM(vp_directo.nombre), ''),
         NULLIF(TRIM(vp_usuario.nombre), ''),
         NULLIF(TRIM(u_owner.email), ''),
         'Usuario'
       ) AS vendedor_nombre,
       COALESCE(vp_usuario.color, vp_directo.color, '#6366f1') AS color,
       COALESCE(vp_usuario.emoji, vp_directo.emoji) AS emoji,
       c.nombre AS cliente_nombre
     FROM ventas v
LEFT JOIN vendedor_perfiles vp_directo ON vp_directo.id = v.vendedor_perfil_id
LEFT JOIN usuarios u_owner
       ON u_owner.id = COALESCE(vp_directo.usuario_id, v.usuario_id)
LEFT JOIN vendedor_perfiles vp_usuario
       ON vp_usuario.usuario_id = COALESCE(vp_directo.usuario_id, v.usuario_id)
      AND vp_usuario.activo = 1
     LEFT JOIN clientes c ON c.id = v.cliente_id
     WHERE ${where.join(' AND ')}
     ORDER BY v.fecha DESC
     LIMIT $1`,
    params
  );
  return rows;
}

module.exports = { list, findById, create, update, ranking, recentSales };
