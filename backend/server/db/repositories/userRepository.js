const { query } = require('../../db/pg');
const { columnExists } = require('../../db/schemaSupport');

async function hasPrimaryDepositoColumn(client = null) {
  return columnExists('usuarios', 'deposito_principal_id', client?.query ? client : null);
}

function normalizePositiveIntArray(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );
}

async function findByEmail(email) {
  const hasPrimaryDeposito = await hasPrimaryDepositoColumn();
  const { rows } = await query(
    `SELECT u.id,
            u.nombre,
            u.email,
            u.password_hash,
            u.rol_id,
            u.activo,
            u.caja_tipo_default,
            ${
              hasPrimaryDeposito
                ? 'u.deposito_principal_id'
                : 'NULL AS deposito_principal_id'
            },
            u.deleted_at,
            u.totp_secret,
            u.totp_enabled,
            u.totp_backup_codes,
            r.nombre AS rol
       FROM usuarios u
  LEFT JOIN roles r ON r.id = u.rol_id
      WHERE LOWER(u.email) = LOWER($1)
        AND u.deleted_at IS NULL
      LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const hasPrimaryDeposito = await hasPrimaryDepositoColumn();
  const { rows } = await query(
    `SELECT u.id,
            u.nombre,
            u.email,
            u.rol_id,
            u.activo,
            u.caja_tipo_default,
            ${
              hasPrimaryDeposito
                ? 'u.deposito_principal_id'
                : 'NULL AS deposito_principal_id'
            },
            u.deleted_at,
            u.totp_enabled,
            r.nombre AS rol
       FROM usuarios u
  LEFT JOIN roles r ON r.id = u.rol_id
      WHERE u.id = $1
        AND u.deleted_at IS NULL
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findByIdForSecurity(id) {
  const hasPrimaryDeposito = await hasPrimaryDepositoColumn();
  const { rows } = await query(
    `SELECT u.id,
            u.nombre,
            u.email,
            u.rol_id,
            u.activo,
            u.caja_tipo_default,
            ${
              hasPrimaryDeposito
                ? 'u.deposito_principal_id'
                : 'NULL AS deposito_principal_id'
            },
            u.deleted_at,
            u.totp_secret,
            u.totp_enabled,
            u.totp_backup_codes,
            r.nombre AS rol
       FROM usuarios u
  LEFT JOIN roles r ON r.id = u.rol_id
      WHERE u.id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function list({
  q,
  activo,
  role,
  roleNames,
  limit = 100,
  offset = 0,
  includeDeleted = false,
  onlyDeleted = false,
  visibleDepositoIds = null,
  enforceVisibleDepositoSubset = false,
} = {}) {
  const hasPrimaryDeposito = await hasPrimaryDepositoColumn();
  const where = [];
  const params = [];
  if (onlyDeleted) where.push('u.deleted_at IS NOT NULL');
  else if (!includeDeleted) where.push('u.deleted_at IS NULL');
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(LOWER(u.nombre) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length})`);
  }
  if (typeof activo !== 'undefined') {
    params.push(activo === 'true' ? true : false);
    where.push(`u.activo = $${params.length}`);
  }
  if (role) {
    params.push(String(role).trim().toLowerCase());
    where.push(`LOWER(r.nombre) = $${params.length}`);
  }
  const normalizedRoleNames = Array.isArray(roleNames)
    ? roleNames
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    : [];
  if (normalizedRoleNames.length) {
    const start = params.length + 1;
    params.push(...normalizedRoleNames);
    const marks = normalizedRoleNames.map((_, index) => `$${start + index}`).join(', ');
    where.push(`LOWER(r.nombre) IN (${marks})`);
  }
  const normalizedDepositoIds = normalizePositiveIntArray(visibleDepositoIds);
  if (normalizedDepositoIds.length) {
    const start = params.length + 1;
    params.push(...normalizedDepositoIds);
    const marks = normalizedDepositoIds.map((_, index) => `$${start + index}`).join(', ');
    const visibilityClauses = [
      `EXISTS (
        SELECT 1
          FROM usuarios_depositos ud_scope
         WHERE ud_scope.usuario_id = u.id
           AND ud_scope.deposito_id IN (${marks})
      )`,
    ];
    if (hasPrimaryDeposito) {
      visibilityClauses.push(`u.deposito_principal_id IN (${marks})`);
    }
    where.push(`(${visibilityClauses.join(' OR ')})`);

    if (enforceVisibleDepositoSubset) {
      where.push(`NOT EXISTS (
        SELECT 1
          FROM usuarios_depositos ud_other
         WHERE ud_other.usuario_id = u.id
           AND ud_other.deposito_id NOT IN (${marks})
      )`);
      if (hasPrimaryDeposito) {
        where.push(`(u.deposito_principal_id IS NULL OR u.deposito_principal_id IN (${marks}))`);
      }
    }
  }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);
  const { rows } = await query(
    `SELECT u.id,
            u.nombre,
            u.email,
            u.activo,
            u.caja_tipo_default,
            ${
              hasPrimaryDeposito
                ? 'u.deposito_principal_id'
                : 'NULL AS deposito_principal_id'
            },
            ${
              hasPrimaryDeposito
                ? 'dp.nombre AS deposito_principal_nombre'
                : 'NULL AS deposito_principal_nombre'
            },
            ${
              hasPrimaryDeposito
                ? 'dp.codigo AS deposito_principal_codigo'
                : 'NULL AS deposito_principal_codigo'
            },
            u.deleted_at,
            u.totp_enabled,
            r.nombre AS rol
       FROM usuarios u
  LEFT JOIN roles r ON r.id = u.rol_id
  ${
    hasPrimaryDeposito
      ? 'LEFT JOIN depositos dp ON dp.id = u.deposito_principal_id'
      : ''
  }
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY u.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function listClientResponsibles({
  roleNames = ['vendedor', 'gerente_sucursal'],
  visibleDepositoIds = null,
  userIds = null,
} = {}) {
  const params = [];
  const where = ['u.activo = TRUE', 'u.deleted_at IS NULL'];

  const normalizedRoles = Array.isArray(roleNames)
    ? roleNames
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    : [];
  if (normalizedRoles.length) {
    const start = params.length + 1;
    params.push(...normalizedRoles);
    const marks = normalizedRoles.map((_, index) => `$${start + index}`).join(', ');
    where.push(`LOWER(r.nombre) IN (${marks})`);
  }

  const normalizedUserIds = Array.isArray(userIds)
    ? userIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : [];
  if (normalizedUserIds.length) {
    const start = params.length + 1;
    params.push(...normalizedUserIds);
    const marks = normalizedUserIds.map((_, index) => `$${start + index}`).join(', ');
    where.push(`u.id IN (${marks})`);
  } else {
    const normalizedDepositoIds = Array.isArray(visibleDepositoIds)
      ? visibleDepositoIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      : [];
    if (normalizedDepositoIds.length) {
      const start = params.length + 1;
      params.push(...normalizedDepositoIds);
      const marks = normalizedDepositoIds.map((_, index) => `$${start + index}`).join(', ');
      where.push(`ud.deposito_id IN (${marks})`);
    }
  }

  const { rows } = await query(
    `SELECT DISTINCT
            u.id,
            u.nombre,
            u.email,
            r.nombre AS rol,
            d.id AS deposito_id,
            d.nombre AS deposito_nombre,
            d.codigo AS deposito_codigo
       FROM usuarios u
  LEFT JOIN roles r ON r.id = u.rol_id
  LEFT JOIN usuarios_depositos ud ON ud.usuario_id = u.id
  LEFT JOIN depositos d ON d.id = ud.deposito_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY d.nombre ASC, u.nombre ASC`,
    params
  );
  return rows;
}

async function create({
  nombre,
  email,
  password_hash,
  rol_id,
  activo = true,
  caja_tipo_default = 'sucursal',
  deposito_principal_id = null,
}) {
  const hasPrimaryDeposito = await hasPrimaryDepositoColumn();
  const columns = [
    'nombre',
    'email',
    'password_hash',
    'rol_id',
    'activo',
    'caja_tipo_default',
  ];
  const values = [nombre, email, password_hash, rol_id, !!activo, caja_tipo_default || 'sucursal'];
  if (hasPrimaryDeposito) {
    columns.push('deposito_principal_id');
    values.push(deposito_principal_id || null);
  }
  columns.push('deleted_at', 'totp_enabled');
  values.push(null, 0);
  const { rows } = await query(
    `INSERT INTO usuarios(
       ${columns.join(',\n       ')}
     )
     VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})
     RETURNING id`,
    values
  );
  return rows[0];
}

async function update(id, fields) {
  const hasPrimaryDeposito = await hasPrimaryDepositoColumn();
  const sets = [];
  const params = [];
  let p = 1;
  for (const [key, col] of Object.entries({
    nombre: 'nombre',
    email: 'email',
    rol_id: 'rol_id',
    activo: 'activo',
    caja_tipo_default: 'caja_tipo_default',
    ...(hasPrimaryDeposito ? { deposito_principal_id: 'deposito_principal_id' } : {}),
    deleted_at: 'deleted_at',
    totp_secret: 'totp_secret',
    totp_enabled: 'totp_enabled',
    totp_backup_codes: 'totp_backup_codes',
  })) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${p++}`);
      params.push(fields[key]);
    }
  }
  if (!sets.length) return { id };
  params.push(id);
  const { rows } = await query(
    `UPDATE usuarios
        SET ${sets.join(', ')},
            actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $${p}
      RETURNING id`,
    params
  );
  return rows[0] || null;
}

async function setPasswordHash(id, password_hash) {
  const { rows } = await query(
    `UPDATE usuarios
        SET password_hash = $1,
            actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id`,
    [password_hash, id]
  );
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

async function getRoleById(id) {
  const roleId = Number(id);
  if (!Number.isInteger(roleId) || roleId <= 0) return null;
  const { rows } = await query(
    `SELECT id, nombre
       FROM roles
      WHERE id = $1
      LIMIT 1`,
    [roleId]
  );
  return rows[0] || null;
}

async function sellerPerformance({ desde, hasta, visibleDepositoIds = null } = {}) {
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
  const normalizedDepositoIds = normalizePositiveIntArray(visibleDepositoIds);
  let depositoWhere = '';
  if (normalizedDepositoIds.length) {
    const start = params.length + 1;
    params.push(...normalizedDepositoIds);
    const marks = normalizedDepositoIds.map((_, index) => `$${start + index}`).join(', ');
    depositoWhere = ` AND v.deposito_id IN (${marks})`;
  }

  const { rows } = await query(
    `WITH ventas_filtradas AS (
        SELECT v.id, v.usuario_id, v.neto
          FROM ventas v
         WHERE v.estado_pago <> 'cancelado'
           AND v.oculto = 0
           ${fechaWhere}
           ${depositoWhere}
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
         AND u.deleted_at IS NULL
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
        AND u.deleted_at IS NULL
      LIMIT 1`
  );
  return rows.length > 0;
}

async function countActive(excludeId = null) {
  const params = [];
  let where = 'WHERE activo = 1 AND deleted_at IS NULL';
  if (excludeId) {
    params.push(excludeId);
    where += ` AND id <> $${params.length}`;
  }
  const { rows } = await query(`SELECT COUNT(*) AS total FROM usuarios ${where}`, params);
  return Number(rows?.[0]?.total || 0);
}

async function softDelete(id) {
  const { rows } = await query(
    `UPDATE usuarios
        SET activo = 0,
            deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP),
            actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING id`,
    [id]
  );
  return rows[0] || null;
}

async function restore(id) {
  const { rows } = await query(
    `UPDATE usuarios
        SET activo = 1,
            deleted_at = NULL,
            actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $1
        AND deleted_at IS NOT NULL
      RETURNING id`,
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  findByEmail,
  findById,
  findByIdForSecurity,
  list,
  listClientResponsibles,
  create,
  update,
  setPasswordHash,
  listRoles,
  getRoleByName,
  getRoleById,
  sellerPerformance,
  hasAdmin,
  countActive,
  softDelete,
  restore,
};
