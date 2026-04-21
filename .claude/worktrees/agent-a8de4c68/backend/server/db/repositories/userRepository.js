const { query } = require('../../db/pg');

async function findByEmail(email) {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.email, u.password_hash, u.rol_id, u.activo,
            u.caja_tipo_default,
            r.nombre AS rol
       FROM usuarios u
  LEFT JOIN roles r ON r.id = u.rol_id
      WHERE LOWER(u.email) = LOWER($1)
      LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.email, u.rol_id, u.activo, u.caja_tipo_default, r.nombre AS rol
       FROM usuarios u
  LEFT JOIN roles r ON r.id = u.rol_id
      WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function list({ q, activo, role, limit = 100, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (q) { params.push(`%${q.toLowerCase()}%`); where.push(`(LOWER(u.nombre) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length})`); }
  if (typeof activo !== 'undefined') { params.push(activo === 'true' ? true : false); where.push(`u.activo = $${params.length}`); }
  if (role) { params.push(String(role).trim().toLowerCase()); where.push(`LOWER(r.nombre) = $${params.length}`); }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim); params.push(off);
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.email, u.activo, u.caja_tipo_default, r.nombre AS rol
       FROM usuarios u
  LEFT JOIN roles r ON r.id = u.rol_id
      ${where.length? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY u.id DESC
      LIMIT $${params.length-1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function create({ nombre, email, password_hash, rol_id, activo = true, caja_tipo_default = 'sucursal' }) {
  const { rows } = await query(
    `INSERT INTO usuarios(nombre, email, password_hash, rol_id, activo, caja_tipo_default)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [nombre, email, password_hash, rol_id, !!activo, caja_tipo_default || 'sucursal']
  );
  return rows[0];
}

async function update(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  for (const [key, col] of Object.entries({ nombre:'nombre', email:'email', rol_id:'rol_id', activo:'activo', caja_tipo_default:'caja_tipo_default' })) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${p++}`);
      params.push(fields[key]);
    }
  }
  if (!sets.length) return { id };
  params.push(id);
  const { rows } = await query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${p} RETURNING id`, params);
  return rows[0] || null;
}

async function setPasswordHash(id, password_hash) {
  const { rows } = await query(`UPDATE usuarios SET password_hash = $1 WHERE id = $2 RETURNING id`, [password_hash, id]);
  return rows[0] || null;
}

async function listRoles() {
  const { rows } = await query('SELECT id, nombre FROM roles ORDER BY id');
  return rows;
}

async function getRoleByName(name) {
  const roleName = String(name || '').trim().toLowerCase();
  if (!roleName) return null;
  const { rows } = await query(
    `SELECT id, nombre
       FROM roles
      WHERE LOWER(nombre) = $1
      LIMIT 1`,
    [roleName]
  );
  return rows[0] || null;
}

async function sellerPerformance({ desde, hasta } = {}) {
  const params = [];
  const fechaFilters = [];
  if (desde) {
    params.push(desde);
    fechaFilters.push(`date(v.fecha) >= date($${params.length})`);
  }
  if (hasta) {
    params.push(hasta);
    fechaFilters.push(`date(v.fecha) <= date($${params.length})`);
  }
  const fechaWhere = fechaFilters.length ? ` AND ${fechaFilters.join(' AND ')}` : '';

  const { rows } = await query(
    `WITH ventas_filtradas AS (
        SELECT v.id, v.usuario_id, v.neto
          FROM ventas v
         WHERE v.estado_pago <> 'cancelado'
           AND v.oculto = 0
           ${fechaWhere}
      ),
      margen_por_venta AS (
        SELECT v.id,
               v.usuario_id,
               v.neto AS total_venta,
               COALESCE(SUM((vd.precio_unitario - COALESCE(p.precio_costo, 0)) * vd.cantidad), 0) AS margen_venta
          FROM ventas_filtradas v
          LEFT JOIN ventas_detalle vd ON vd.venta_id = v.id
          LEFT JOIN productos p ON p.id = vd.producto_id
         GROUP BY v.id, v.usuario_id, v.neto
      )
      SELECT u.id,
             u.nombre,
             u.email,
             u.activo,
             r.nombre AS rol,
             COUNT(mv.id) AS ventas_count,
             COALESCE(SUM(mv.total_venta), 0) AS total_ventas,
             COALESCE(SUM(mv.margen_venta), 0) AS margen
        FROM usuarios u
        JOIN roles r ON r.id = u.rol_id
        LEFT JOIN margen_por_venta mv ON mv.usuario_id = u.id
       WHERE r.nombre = 'vendedor'
       GROUP BY u.id, u.nombre, u.email, u.activo, r.nombre
       ORDER BY total_ventas DESC`,
    params
  );
  return rows;
}

async function hasAdmin() {
  const { rows } = await query(
    `SELECT 1
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
      WHERE r.nombre = 'admin'
        AND u.activo = 1
      LIMIT 1`
  );
  return rows.length > 0;
}

async function countActive(excludeId = null) {
  const params = [];
  let where = 'WHERE activo = 1';
  if (excludeId) {
    params.push(excludeId);
    where += ` AND id <> $${params.length}`;
  }
  const { rows } = await query(
    `SELECT COUNT(*) AS total FROM usuarios ${where}`,
    params
  );
  return Number(rows?.[0]?.total || 0);
}

module.exports = {
  findByEmail,
  findById,
  list,
  create,
  update,
  setPasswordHash,
  listRoles,
  getRoleByName,
  sellerPerformance,
  hasAdmin,
  countActive,
};
