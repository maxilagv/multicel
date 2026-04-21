const { query } = require('../../db/pg');

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function mapCuenta(row) {
  if (!row) return null;
  return {
    ...row,
    cliente_id: row.cliente_id != null ? Number(row.cliente_id) : null,
    proveedor_id: row.proveedor_id != null ? Number(row.proveedor_id) : null,
    owner_usuario_id: row.owner_usuario_id != null ? Number(row.owner_usuario_id) : null,
  };
}

async function list({
  q,
  tipo,
  estado,
  owner_usuario_id,
  limit = 50,
  offset = 0,
} = {}) {
  const params = [];
  const where = [];

  if (q) {
    params.push(`%${String(q).trim().toLowerCase()}%`);
    where.push(
      `(LOWER(cc.nombre) LIKE $${params.length}
        OR LOWER(COALESCE(cc.email, '')) LIKE $${params.length}
        OR LOWER(COALESCE(cc.telefono, '')) LIKE $${params.length})`
    );
  }
  if (tipo) {
    params.push(tipo);
    where.push(`cc.tipo = $${params.length}`);
  }
  if (estado) {
    params.push(estado);
    where.push(`cc.estado = $${params.length}`);
  }
  if (owner_usuario_id) {
    params.push(Number(owner_usuario_id));
    where.push(`cc.owner_usuario_id = $${params.length}`);
  }

  const lim = clampInt(limit, 1, 200, 50);
  const off = clampInt(offset, 0, 50000, 0);
  params.push(lim, off);

  const { rows } = await query(
    `SELECT cc.id,
            cc.tipo,
            cc.origen,
            cc.nombre,
            cc.cliente_id,
            cc.proveedor_id,
            cc.email,
            cc.telefono,
            cc.estado,
            cc.owner_usuario_id,
            cc.notas,
            cc.created_at,
            cc.updated_at,
            cli.nombre AS cliente_nombre,
            cli.apellido AS cliente_apellido,
            pr.nombre AS proveedor_nombre,
            u.nombre AS owner_nombre
       FROM crm_cuentas cc
       LEFT JOIN clientes cli ON cli.id = cc.cliente_id
       LEFT JOIN proveedores pr ON pr.id = cc.proveedor_id
       LEFT JOIN usuarios u ON u.id = cc.owner_usuario_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY cc.updated_at DESC, cc.id DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}`,
    params
  );

  return rows.map(mapCuenta);
}

async function getById(id) {
  const { rows } = await query(
    `SELECT cc.id,
            cc.tipo,
            cc.origen,
            cc.nombre,
            cc.cliente_id,
            cc.proveedor_id,
            cc.email,
            cc.telefono,
            cc.estado,
            cc.owner_usuario_id,
            cc.notas,
            cc.created_at,
            cc.updated_at,
            cli.nombre AS cliente_nombre,
            cli.apellido AS cliente_apellido,
            pr.nombre AS proveedor_nombre
       FROM crm_cuentas cc
       LEFT JOIN clientes cli ON cli.id = cc.cliente_id
       LEFT JOIN proveedores pr ON pr.id = cc.proveedor_id
      WHERE cc.id = $1
      LIMIT 1`,
    [id]
  );
  return mapCuenta(rows[0] || null);
}

async function getByClienteId(clienteId) {
  const { rows } = await query(
    `SELECT *
       FROM crm_cuentas
      WHERE cliente_id = $1
      LIMIT 1`,
    [clienteId]
  );
  return mapCuenta(rows[0] || null);
}

async function create({
  tipo = 'potencial',
  origen = 'manual',
  nombre,
  cliente_id,
  proveedor_id,
  email,
  telefono,
  estado = 'activo',
  owner_usuario_id,
  notas,
}) {
  const { rows } = await query(
    `INSERT INTO crm_cuentas(
       tipo,
       origen,
       nombre,
       cliente_id,
       proveedor_id,
       email,
       telefono,
       estado,
       owner_usuario_id,
       notas
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      tipo,
      origen,
      nombre,
      cliente_id || null,
      proveedor_id || null,
      email || null,
      telefono || null,
      estado,
      owner_usuario_id || null,
      notas || null,
    ]
  );
  return getById(rows[0]?.id);
}

async function update(id, fields) {
  const sets = [];
  const params = [];
  let index = 1;

  for (const [key, column] of Object.entries({
    tipo: 'tipo',
    origen: 'origen',
    nombre: 'nombre',
    cliente_id: 'cliente_id',
    proveedor_id: 'proveedor_id',
    email: 'email',
    telefono: 'telefono',
    estado: 'estado',
    owner_usuario_id: 'owner_usuario_id',
    notas: 'notas',
  })) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${column} = $${index++}`);
      params.push(fields[key] ?? null);
    }
  }

  if (!sets.length) return getById(id);

  params.push(Number(id));
  const { rows } = await query(
    `UPDATE crm_cuentas
        SET ${sets.join(', ')},
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $${index}
      RETURNING id`,
    params
  );

  if (!rows[0]) return null;
  return getById(id);
}

async function ensureForClienteId(clienteId) {
  const existing = await getByClienteId(clienteId);
  if (existing) return existing;

  const { rows } = await query(
    `SELECT id,
            TRIM(CONCAT(nombre, IFNULL(CONCAT(' ', apellido), ''))) AS nombre,
            email,
            telefono,
            estado
       FROM clientes
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1`,
    [clienteId]
  );
  const cliente = rows[0];
  if (!cliente) return null;

  return create({
    tipo: 'cliente',
    origen: 'cliente',
    nombre: cliente.nombre,
    cliente_id: cliente.id,
    email: cliente.email,
    telefono: cliente.telefono,
    estado: cliente.estado || 'activo',
  });
}

module.exports = {
  list,
  getById,
  getByClienteId,
  create,
  update,
  ensureForClienteId,
};
