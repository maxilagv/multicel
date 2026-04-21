const { query, withTransaction } = require('../../db/pg');
const { tableExists, columnExists } = require('../schemaSupport');

function toReceiptDownloadUrl(id, storedUrl) {
  if (!storedUrl) return null;
  return `/api/cuenta-empresa/transacciones/${Number(id)}/comprobante`;
}

async function ensureCuentaEmpresaReady(client = null) {
  const tables = ['cuenta_empresa_transacciones', 'proveedores_cuenta_corriente'];
  for (const table of tables) {
    if (!(await tableExists(table, client))) {
      const error = new Error('La cuenta empresa todavia no esta lista en la base. Ejecuta la migracion V35.');
      error.status = 409;
      error.code = 'MIGRATION_REQUIRED';
      throw error;
    }
  }
}

async function createCuentaEmpresaTransaction(
  {
    proveedor_id,
    venta_id = null,
    monto,
    moneda = 'ARS',
    estado = 'pendiente',
    origen = 'manual',
    alias_cuenta_snapshot = null,
    banco_snapshot = null,
    comprobante_url = null,
    comprobante_nombre = null,
    comprobante_hash = null,
    nota = null,
    metadata_json = null,
    creado_por_usuario_id = null,
  },
  client = null
) {
  await ensureCuentaEmpresaReady(client);
  const runner = client?.query ? client : { query };
  const { rows } = await runner.query(
    `INSERT INTO cuenta_empresa_transacciones(
       proveedor_id,
       venta_id,
       monto,
       moneda,
       estado,
       origen,
       alias_cuenta_snapshot,
       banco_snapshot,
       comprobante_url,
       comprobante_nombre,
       comprobante_hash,
       nota,
       metadata_json,
       creado_por_usuario_id
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      Number(proveedor_id),
      venta_id != null ? Number(venta_id) : null,
      Number(monto || 0),
      moneda || 'ARS',
      estado,
      origen,
      alias_cuenta_snapshot || null,
      banco_snapshot || null,
      comprobante_url || null,
      comprobante_nombre || null,
      comprobante_hash || null,
      nota || null,
      metadata_json || null,
      creado_por_usuario_id || null,
    ]
  );
  return getCuentaEmpresaTransactionById(rows[0]?.id, client);
}

async function getCuentaEmpresaTransactionById(id, client = null) {
  if (!id) return null;
  await ensureCuentaEmpresaReady(client);
  const runner = client?.query ? client : { query };
  const { rows } = await runner.query(
    `SELECT t.id,
            t.proveedor_id,
            p.nombre AS proveedor_nombre,
            t.venta_id,
            t.monto::float AS monto,
            t.moneda,
            t.estado,
            t.origen,
            t.alias_cuenta_snapshot,
            t.banco_snapshot,
            t.comprobante_url,
            t.comprobante_nombre,
            t.comprobante_hash,
            t.nota,
            t.metadata_json,
            t.creado_por_usuario_id,
            t.revisado_por_usuario_id,
            t.revisado_en,
            t.creado_en,
            t.actualizado_en
       FROM cuenta_empresa_transacciones t
       JOIN proveedores p ON p.id = t.proveedor_id
      WHERE t.id = $1
      LIMIT 1`,
    [Number(id)]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    proveedor_id: Number(row.proveedor_id),
    proveedor_nombre: row.proveedor_nombre,
    venta_id: row.venta_id != null ? Number(row.venta_id) : null,
    monto: Number(row.monto || 0),
    moneda: row.moneda || 'ARS',
    estado: row.estado,
    origen: row.origen,
    alias_cuenta_snapshot: row.alias_cuenta_snapshot || null,
    banco_snapshot: row.banco_snapshot || null,
    comprobante_storage_url: row.comprobante_url || null,
    comprobante_url: toReceiptDownloadUrl(row.id, row.comprobante_url),
    comprobante_nombre: row.comprobante_nombre || null,
    comprobante_hash: row.comprobante_hash || null,
    nota: row.nota || null,
    metadata_json: row.metadata_json || null,
    creado_por_usuario_id: row.creado_por_usuario_id != null ? Number(row.creado_por_usuario_id) : null,
    revisado_por_usuario_id: row.revisado_por_usuario_id != null ? Number(row.revisado_por_usuario_id) : null,
    revisado_en: row.revisado_en || null,
    creado_en: row.creado_en,
    actualizado_en: row.actualizado_en,
  };
}

async function findTransactionByHash(hash) {
  if (!hash) return null;
  await ensureCuentaEmpresaReady();
  const { rows } = await query(
    `SELECT id
       FROM cuenta_empresa_transacciones
      WHERE comprobante_hash = $1
      LIMIT 1`,
    [hash]
  );
  return rows[0] ? getCuentaEmpresaTransactionById(rows[0].id) : null;
}

async function listCuentaEmpresaTransactions({
  proveedor_id = null,
  estado = null,
  origen = null,
  creado_por_usuario_id = null,
  limit = 100,
  offset = 0,
} = {}) {
  await ensureCuentaEmpresaReady();
  const where = [];
  const params = [];
  if (proveedor_id != null) {
    params.push(Number(proveedor_id));
    where.push(`t.proveedor_id = $${params.length}`);
  }
  if (estado) {
    params.push(String(estado).trim().toLowerCase());
    where.push(`LOWER(t.estado) = $${params.length}`);
  }
  if (origen) {
    params.push(String(origen).trim().toLowerCase());
    where.push(`LOWER(t.origen) = $${params.length}`);
  }
  if (creado_por_usuario_id != null) {
    params.push(Number(creado_por_usuario_id));
    where.push(`t.creado_por_usuario_id = $${params.length}`);
  }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);
  const { rows } = await query(
    `SELECT t.id,
            t.proveedor_id,
            p.nombre AS proveedor_nombre,
            t.venta_id,
            t.monto::float AS monto,
            t.moneda,
            t.estado,
            t.origen,
            t.alias_cuenta_snapshot,
            t.banco_snapshot,
            t.comprobante_url,
            t.comprobante_nombre,
            t.nota,
            t.creado_en,
            t.actualizado_en
       FROM cuenta_empresa_transacciones t
       JOIN proveedores p ON p.id = t.proveedor_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY t.creado_en DESC, t.id DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}`,
    params
  );
  return rows.map((row) => ({
    id: Number(row.id),
    proveedor_id: Number(row.proveedor_id),
    proveedor_nombre: row.proveedor_nombre,
    venta_id: row.venta_id != null ? Number(row.venta_id) : null,
    monto: Number(row.monto || 0),
    moneda: row.moneda || 'ARS',
    estado: row.estado,
    origen: row.origen,
    alias_cuenta_snapshot: row.alias_cuenta_snapshot || null,
    banco_snapshot: row.banco_snapshot || null,
    comprobante_url: toReceiptDownloadUrl(row.id, row.comprobante_url),
    comprobante_nombre: row.comprobante_nombre || null,
    nota: row.nota || null,
    creado_en: row.creado_en,
    actualizado_en: row.actualizado_en,
  }));
}

async function insertCuentaCorrienteMovement(
  {
    proveedor_id,
    compra_id = null,
    transaccion_id = null,
    tipo_movimiento,
    debito = 0,
    credito = 0,
    descripcion = null,
    metadata_json = null,
    creado_por_usuario_id = null,
  },
  client = null
) {
  await ensureCuentaEmpresaReady(client);
  const runner = client?.query ? client : { query };
  const { rows } = await runner.query(
    `INSERT INTO proveedores_cuenta_corriente(
       proveedor_id,
       compra_id,
       transaccion_id,
       tipo_movimiento,
       debito,
       credito,
       descripcion,
       metadata_json,
       creado_por_usuario_id
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      Number(proveedor_id),
      compra_id != null ? Number(compra_id) : null,
      transaccion_id != null ? Number(transaccion_id) : null,
      tipo_movimiento,
      Number(debito || 0),
      Number(credito || 0),
      descripcion || null,
      metadata_json || null,
      creado_por_usuario_id || null,
    ]
  );
  return rows[0]?.id ? Number(rows[0].id) : null;
}

async function ensureCompraMovement({
  compra_id,
  proveedor_id,
  monto,
  descripcion,
  creado_por_usuario_id = null,
}, client = null) {
  await ensureCuentaEmpresaReady(client);
  const runner = client?.query ? client : { query };
  const { rows } = await runner.query(
    `SELECT id
       FROM proveedores_cuenta_corriente
      WHERE compra_id = $1
        AND tipo_movimiento = 'compra'
      LIMIT 1`,
    [Number(compra_id)]
  );
  if (rows[0]?.id) return Number(rows[0].id);
  return insertCuentaCorrienteMovement(
    {
      proveedor_id,
      compra_id,
      tipo_movimiento: 'compra',
      debito: Number(monto || 0),
      credito: 0,
      descripcion: descripcion || `Compra #${compra_id}`,
      creado_por_usuario_id,
    },
    client
  );
}

async function reviewTransaction(id, { estado, revisado_por_usuario_id, nota = null, acreditar = false }) {
  return withTransaction(async (client) => {
    await ensureCuentaEmpresaReady(client);
    const current = await getCuentaEmpresaTransactionById(id, client);
    if (!current) {
      const error = new Error('Transaccion no encontrada');
      error.status = 404;
      throw error;
    }
    const targetEstado = acreditar ? 'acreditado' : estado;
    await client.query(
      `UPDATE cuenta_empresa_transacciones
          SET estado = $2,
              nota = COALESCE($3, nota),
              revisado_por_usuario_id = $4,
              revisado_en = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [Number(id), targetEstado, nota || null, revisado_por_usuario_id || null]
    );
    if (acreditar) {
      const { rows } = await client.query(
        `SELECT id
           FROM proveedores_cuenta_corriente
          WHERE transaccion_id = $1
            AND tipo_movimiento = 'cuenta_empresa_acreditada'
          LIMIT 1`,
        [Number(id)]
      );
      if (!rows[0]?.id) {
        await insertCuentaCorrienteMovement(
          {
            proveedor_id: current.proveedor_id,
            transaccion_id: current.id,
            tipo_movimiento: 'cuenta_empresa_acreditada',
            debito: 0,
            credito: current.monto,
            descripcion: `Acreditacion cuenta empresa #${current.id}`,
            creado_por_usuario_id: revisado_por_usuario_id || null,
          },
          client
        );
      }
    }
    return getCuentaEmpresaTransactionById(id, client);
  });
}

async function canUseProveedorCuentaField(client = null) {
  return columnExists('ventas', 'proveedor_cuenta_id', client);
}

module.exports = {
  ensureCuentaEmpresaReady,
  canUseProveedorCuentaField,
  createCuentaEmpresaTransaction,
  getCuentaEmpresaTransactionById,
  findTransactionByHash,
  listCuentaEmpresaTransactions,
  insertCuentaCorrienteMovement,
  ensureCompraMovement,
  reviewTransaction,
};
