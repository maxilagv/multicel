const { query } = require('../../db/pg');
const { columnExists } = require('../schemaSupport');

function normalizeProveedorRow(row, { includeSensitive = true } = {}) {
  if (!row) return null;
  const cbu = row.cbu || null;
  return {
    id: Number(row.id),
    nombre: row.nombre,
    email: row.email || null,
    telefono: row.telefono || null,
    whatsapp: row.whatsapp || null,
    direccion: row.direccion || null,
    cuit_cuil: row.cuit_cuil || null,
    alias_cuenta: row.alias_cuenta || null,
    cbu: includeSensitive ? cbu : null,
    cbu_masked: cbu ? `${String(cbu).slice(0, 4)}...${String(cbu).slice(-4)}` : null,
    banco: row.banco || null,
    activo: typeof row.activo === 'undefined' ? true : Number(row.activo) === 1,
    notas_internas: row.notas_internas || null,
    tiempo_reposicion_dias:
      row.tiempo_reposicion_dias != null ? Number(row.tiempo_reposicion_dias) : null,
    fecha_registro: row.fecha_registro || null,
    actualizado_en: row.actualizado_en || null,
  };
}

async function getSupplierColumns() {
  const optionalColumns = [
    'whatsapp',
    'alias_cuenta',
    'cbu',
    'banco',
    'activo',
    'notas_internas',
    'tiempo_reposicion_dias',
    'actualizado_en',
  ];
  const enabled = [];
  for (const column of optionalColumns) {
    if (await columnExists('proveedores', column)) {
      enabled.push(column);
    }
  }
  return enabled;
}

async function list({ q, limit = 50, offset = 0 } = {}) {
  const extraColumns = await getSupplierColumns();
  const where = [];
  const params = [];
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(LOWER(nombre) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR LOWER(telefono) LIKE $${params.length} OR LOWER(cuit_cuil) LIKE $${params.length})`);
  }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);
  const selectColumns = [
    'id',
    'nombre',
    'email',
    'telefono',
    'direccion',
    'cuit_cuil',
    'fecha_registro',
    ...extraColumns,
  ];
  const sql = `SELECT ${selectColumns.join(', ')}
                 FROM proveedores
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY id DESC
                LIMIT $${params.length - 1}
               OFFSET $${params.length}`;
  const { rows } = await query(sql, params);
  return rows.map((row) => normalizeProveedorRow(row));
}

async function create(payload) {
  const {
    nombre,
    email,
    telefono,
    whatsapp,
    direccion,
    cuit_cuil,
    alias_cuenta,
    cbu,
    banco,
    activo,
    notas_internas,
    tiempo_reposicion_dias,
  } = payload || {};
  const extraColumns = await getSupplierColumns();
  const columns = ['nombre', 'email', 'telefono', 'direccion', 'cuit_cuil'];
  const values = [nombre, email || null, telefono || null, direccion || null, cuit_cuil || null];
  if (extraColumns.includes('whatsapp')) {
    columns.push('whatsapp');
    values.push(whatsapp || null);
  }
  if (extraColumns.includes('alias_cuenta')) {
    columns.push('alias_cuenta');
    values.push(alias_cuenta || null);
  }
  if (extraColumns.includes('cbu')) {
    columns.push('cbu');
    values.push(cbu || null);
  }
  if (extraColumns.includes('banco')) {
    columns.push('banco');
    values.push(banco || null);
  }
  if (extraColumns.includes('activo')) {
    columns.push('activo');
    values.push(typeof activo === 'boolean' ? (activo ? 1 : 0) : 1);
  }
  if (extraColumns.includes('notas_internas')) {
    columns.push('notas_internas');
    values.push(notas_internas || null);
  }
  if (extraColumns.includes('tiempo_reposicion_dias')) {
    columns.push('tiempo_reposicion_dias');
    values.push(
      tiempo_reposicion_dias != null && Number.isFinite(Number(tiempo_reposicion_dias))
        ? Number(tiempo_reposicion_dias)
        : null
    );
  }
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const { rows } = await query(
    `INSERT INTO proveedores(${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING id`,
    values
  );
  return rows[0];
}

async function update(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  const extraColumns = await getSupplierColumns();
  const baseMap = {
    nombre: 'nombre',
    email: 'email',
    telefono: 'telefono',
    direccion: 'direccion',
    cuit_cuil: 'cuit_cuil',
  };
  if (extraColumns.includes('whatsapp')) baseMap.whatsapp = 'whatsapp';
  if (extraColumns.includes('alias_cuenta')) baseMap.alias_cuenta = 'alias_cuenta';
  if (extraColumns.includes('cbu')) baseMap.cbu = 'cbu';
  if (extraColumns.includes('banco')) baseMap.banco = 'banco';
  if (extraColumns.includes('activo')) baseMap.activo = 'activo';
  if (extraColumns.includes('notas_internas')) baseMap.notas_internas = 'notas_internas';
  if (extraColumns.includes('tiempo_reposicion_dias')) {
    baseMap.tiempo_reposicion_dias = 'tiempo_reposicion_dias';
  }
  for (const [key, col] of Object.entries(baseMap)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${p++}`);
      if (key === 'activo') {
        params.push(fields[key] ? 1 : 0);
      } else if (key === 'tiempo_reposicion_dias') {
        params.push(
          fields[key] != null && Number.isFinite(Number(fields[key])) ? Number(fields[key]) : null
        );
      } else {
        params.push(fields[key] ?? null);
      }
    }
  }
  if (!sets.length) return { id };
  params.push(id);
  const { rows } = await query(`UPDATE proveedores SET ${sets.join(', ')} WHERE id = $${p} RETURNING id`, params);
  return rows[0] || null;
}

async function findById(id, options = {}) {
  const extraColumns = await getSupplierColumns();
  const selectColumns = [
    'id',
    'nombre',
    'email',
    'telefono',
    'direccion',
    'cuit_cuil',
    ...extraColumns,
  ];
  const { rows } = await query(
    `SELECT ${selectColumns.join(', ')}
       FROM proveedores
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return normalizeProveedorRow(rows[0] || null, options);
}

async function findByExactName(nombre) {
  const extraColumns = await getSupplierColumns();
  const selectColumns = [
    'id',
    'nombre',
    'email',
    'telefono',
    'direccion',
    'cuit_cuil',
    ...extraColumns,
  ];
  const { rows } = await query(
    `SELECT ${selectColumns.join(', ')}
       FROM proveedores
      WHERE LOWER(nombre) = LOWER($1)
      LIMIT 1`,
    [nombre]
  );
  return normalizeProveedorRow(rows[0] || null);
}

async function listCuentaEmpresaProviders() {
  const extraColumns = await getSupplierColumns();
  if (!extraColumns.includes('alias_cuenta')) return [];
  const hasActivo = extraColumns.includes('activo');
  const where = ['alias_cuenta IS NOT NULL', "TRIM(alias_cuenta) <> ''"];
  if (hasActivo) where.push('COALESCE(activo, 1) = 1');
  const selectColumns = [
    'id',
    'nombre',
    'alias_cuenta',
    ...(extraColumns.includes('banco') ? ['banco'] : []),
    ...(extraColumns.includes('tiempo_reposicion_dias') ? ['tiempo_reposicion_dias'] : []),
  ];
  const { rows } = await query(
    `SELECT ${selectColumns.join(', ')}
       FROM proveedores
      WHERE ${where.join(' AND ')}
      ORDER BY nombre ASC`
  );
  return rows.map((row) => ({
    id: Number(row.id),
    nombre: row.nombre,
    alias_cuenta: row.alias_cuenta,
    banco: row.banco || null,
    tiempo_reposicion_dias:
      row.tiempo_reposicion_dias != null ? Number(row.tiempo_reposicion_dias) : null,
  }));
}

async function getProveedorCuentaCorrienteResumen(proveedorId) {
  const { rows } = await query(
    `SELECT proveedor_id,
            COALESCE(SUM(debito), 0)::float AS total_debito,
            COALESCE(SUM(credito), 0)::float AS total_credito,
            (COALESCE(SUM(debito), 0) - COALESCE(SUM(credito), 0))::float AS saldo
       FROM proveedores_cuenta_corriente
      WHERE proveedor_id = $1
      GROUP BY proveedor_id`,
    [Number(proveedorId)]
  );
  return rows[0]
    ? {
        proveedor_id: Number(rows[0].proveedor_id),
        total_debito: Number(rows[0].total_debito || 0),
        total_credito: Number(rows[0].total_credito || 0),
        saldo: Number(rows[0].saldo || 0),
      }
    : {
        proveedor_id: Number(proveedorId),
        total_debito: 0,
        total_credito: 0,
        saldo: 0,
      };
}

async function getProveedorCuentaCorrienteDetalle(proveedorId, { limit = 100, offset = 0 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const { rows } = await query(
    `SELECT pcc.id,
            pcc.proveedor_id,
            pcc.compra_id,
            pcc.transaccion_id,
            pcc.tipo_movimiento,
            pcc.debito::float AS debito,
            pcc.credito::float AS credito,
            pcc.descripcion,
            pcc.fecha
       FROM proveedores_cuenta_corriente pcc
      WHERE pcc.proveedor_id = $1
      ORDER BY pcc.fecha DESC, pcc.id DESC
      LIMIT $2 OFFSET $3`,
    [Number(proveedorId), lim, off]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    proveedor_id: Number(row.proveedor_id),
    compra_id: row.compra_id != null ? Number(row.compra_id) : null,
    transaccion_id: row.transaccion_id != null ? Number(row.transaccion_id) : null,
    tipo_movimiento: row.tipo_movimiento,
    debito: Number(row.debito || 0),
    credito: Number(row.credito || 0),
    descripcion: row.descripcion || null,
    fecha: row.fecha,
  }));
}

module.exports = {
  list,
  create,
  update,
  findById,
  findByExactName,
  listCuentaEmpresaProviders,
  getProveedorCuentaCorrienteResumen,
  getProveedorCuentaCorrienteDetalle,
};
