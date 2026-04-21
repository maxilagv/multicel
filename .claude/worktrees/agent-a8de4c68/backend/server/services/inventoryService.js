const { withTransaction } = require('../db/pg');
const audit = require('./auditService');

async function ensureInventarioDeposito(client, productoId, depositoId) {
  const r = await client.query(
    'SELECT id FROM inventario_depositos WHERE producto_id = $1 AND deposito_id = $2',
    [productoId, depositoId]
  );
  if (!r.rowCount) {
    await client.query(
      'INSERT INTO inventario_depositos(producto_id, deposito_id, cantidad_disponible, cantidad_reservada) VALUES ($1, $2, 0, 0)',
      [productoId, depositoId]
    );
  }
}

async function getDefaultDepositoId(client) {
  // 1) Parametro explícito
  const { rows: paramRows } = await client.query(
    "SELECT valor_num FROM parametros_sistema WHERE clave = 'deposito_default_id' LIMIT 1"
  );
  const val = paramRows[0]?.valor_num;
  if (val != null) {
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // 2) Depósito con código MAIN
  const { rows: mainRows } = await client.query(
    "SELECT id FROM depositos WHERE codigo = 'MAIN' ORDER BY id ASC LIMIT 1"
  );
  if (mainRows.length) return Number(mainRows[0].id);

  // 3) Cualquier depósito activo
  const { rows: anyRows } = await client.query(
    'SELECT id FROM depositos WHERE activo = TRUE ORDER BY id ASC LIMIT 1'
  );
  if (anyRows.length) return Number(anyRows[0].id);

  throw new Error('No hay depósito por defecto configurado');
}

async function resolveDepositoId(client, depositoId) {
  const n = Number(depositoId);
  if (Number.isInteger(n) && n > 0) return n;
  return getDefaultDepositoId(client);
}

async function addStockTx(client, { producto_id, cantidad, motivo, referencia, usuario_id = null, deposito_id = null }) {
  const depId = await resolveDepositoId(client, deposito_id);

  await ensureInventarioDeposito(client, producto_id, depId);

  // Actualizar inventario por depósito
  await client.query(
    `UPDATE inventario_depositos
        SET cantidad_disponible = cantidad_disponible + $1,
            actualizado_en = NOW()
      WHERE producto_id = $2 AND deposito_id = $3`,
    [cantidad, producto_id, depId]
  );

  // Actualizar inventario global (suma de todos los depósitos)
  await client.query(
    `INSERT INTO movimientos_stock(producto_id, deposito_id, tipo, cantidad, motivo, referencia, usuario_id)
     VALUES ($1, $2, 'entrada', $3, $4, $5, $6)`,
    [producto_id, depId, cantidad, motivo || 'compra', referencia || null, usuario_id]
  );

  audit.log({
    usuario_id,
    accion: 'entrada_stock',
    tabla_afectada: 'inventario',
    registro_id: producto_id,
    descripcion: `${cantidad} por ${motivo || 'N/A'} ref=${referencia || ''} dep=${depId}`,
  });
}

async function removeStockTx(client, { producto_id, cantidad, motivo, referencia, usuario_id = null, deposito_id = null }) {
  const depId = await resolveDepositoId(client, deposito_id);

  await ensureInventarioDeposito(client, producto_id, depId);

  const { rows } = await client.query(
    'SELECT cantidad_disponible FROM inventario_depositos WHERE producto_id = $1 AND deposito_id = $2',
    [producto_id, depId]
  );
  const available = rows[0]?.cantidad_disponible ?? 0;
  if (available < cantidad) {
    const e = new Error(`Stock insuficiente para producto ${producto_id} en depósito ${depId}`);
    e.status = 409;
    throw e;
  }

  await client.query(
    `UPDATE inventario_depositos
        SET cantidad_disponible = cantidad_disponible - $1,
            actualizado_en = NOW()
      WHERE producto_id = $2 AND deposito_id = $3`,
    [cantidad, producto_id, depId]
  );

  await client.query(
    `INSERT INTO movimientos_stock(producto_id, deposito_id, tipo, cantidad, motivo, referencia, usuario_id)
     VALUES ($1, $2, 'salida', $3, $4, $5, $6)`,
    [producto_id, depId, cantidad, motivo || 'venta', referencia || null, usuario_id]
  );

  audit.log({
    usuario_id,
    accion: 'salida_stock',
    tabla_afectada: 'inventario',
    registro_id: producto_id,
    descripcion: `${cantidad} por ${motivo || 'N/A'} ref=${referencia || ''} dep=${depId}`,
  });
}

async function addStockBatch({ items, motivo, referencia, usuario_id = null, deposito_id = null }) {
  return withTransaction(async (client) => {
    for (const it of items) {
      await addStockTx(client, { ...it, motivo, referencia, usuario_id, deposito_id });
    }
  });
}

async function removeStockBatch({ items, motivo, referencia, usuario_id = null, deposito_id = null }) {
  return withTransaction(async (client) => {
    for (const it of items) {
      await removeStockTx(client, { ...it, motivo, referencia, usuario_id, deposito_id });
    }
  });
}

// Ajustes manuales y reservas
async function adjustStock({ producto_id, cantidad, motivo, referencia, usuario_id = null, deposito_id = null }) {
  // cantidad puede ser positiva (entrada) o negativa (salida)
  return withTransaction(async (client) => {
    if (cantidad === 0) return;
    if (cantidad > 0) {
      await addStockTx(client, {
        producto_id,
        cantidad,
        motivo: `ajuste: ${motivo || ''}`.trim(),
        referencia,
        usuario_id,
        deposito_id,
      });
    } else {
      await removeStockTx(client, {
        producto_id,
        cantidad: Math.abs(cantidad),
        motivo: `ajuste: ${motivo || ''}`.trim(),
        referencia,
        usuario_id,
        deposito_id,
      });
    }
  });
}

async function reserveStock({ producto_id, cantidad, referencia, usuario_id = null, deposito_id = null }) {
  return withTransaction(async (client) => {
    const depId = await resolveDepositoId(client, deposito_id);

    await ensureInventarioDeposito(client, producto_id, depId);

    const { rows } = await client.query(
      'SELECT cantidad_disponible, cantidad_reservada FROM inventario_depositos WHERE producto_id = $1 AND deposito_id = $2',
      [producto_id, depId]
    );
    const disp = rows[0]?.cantidad_disponible ?? 0;
    const res = rows[0]?.cantidad_reservada ?? 0;
    if (disp < cantidad) {
      const e = new Error('Stock insuficiente para reservar');
      e.status = 409;
      throw e;
    }

    await client.query(
      `UPDATE inventario_depositos
          SET cantidad_disponible = cantidad_disponible - $1,
              cantidad_reservada = cantidad_reservada + $1,
              actualizado_en = NOW()
        WHERE producto_id = $2 AND deposito_id = $3`,
      [cantidad, producto_id, depId]
    );

    audit.log({
      usuario_id,
      accion: 'reservar_stock',
      tabla_afectada: 'inventario',
      registro_id: producto_id,
      descripcion: `${cantidad} ref=${referencia || ''} dep=${depId}`,
    });
  });
}

async function releaseReservation({ producto_id, cantidad, referencia, usuario_id = null, deposito_id = null }) {
  return withTransaction(async (client) => {
    const depId = await resolveDepositoId(client, deposito_id);

    await ensureInventarioDeposito(client, producto_id, depId);

    const { rows } = await client.query(
      'SELECT cantidad_disponible, cantidad_reservada FROM inventario_depositos WHERE producto_id = $1 AND deposito_id = $2',
      [producto_id, depId]
    );
    const res = rows[0]?.cantidad_reservada ?? 0;
    if (res < cantidad) {
      const e = new Error('Cantidad a liberar mayor que reservada');
      e.status = 409;
      throw e;
    }

    await client.query(
      `UPDATE inventario_depositos
          SET cantidad_disponible = cantidad_disponible + $1,
              cantidad_reservada = cantidad_reservada - $1,
              actualizado_en = NOW()
        WHERE producto_id = $2 AND deposito_id = $3`,
      [cantidad, producto_id, depId]
    );

    audit.log({
      usuario_id,
      accion: 'liberar_reserva',
      tabla_afectada: 'inventario',
      registro_id: producto_id,
      descripcion: `${cantidad} ref=${referencia || ''} dep=${depId}`,
    });
  });
}

async function transferStock({
  producto_id,
  cantidad,
  deposito_origen_id,
  deposito_destino_id,
  motivo,
  referencia,
  usuario_id = null,
}) {
  return withTransaction(async (client) => {
    const qty = Number(cantidad);
    if (!Number.isInteger(qty) || qty <= 0) {
      const e = new Error('cantidad debe ser un entero positivo');
      e.status = 400;
      throw e;
    }

    const fromDepId = await resolveDepositoId(client, deposito_origen_id);
    const toDepId = await resolveDepositoId(client, deposito_destino_id);

    if (fromDepId === toDepId) {
      const e = new Error('El depÃ³sito origen y destino deben ser distintos');
      e.status = 400;
      throw e;
    }

    await ensureInventarioDeposito(client, producto_id, fromDepId);
    await ensureInventarioDeposito(client, producto_id, toDepId);

    const { rows } = await client.query(
      'SELECT cantidad_disponible FROM inventario_depositos WHERE producto_id = $1 AND deposito_id = $2',
      [producto_id, fromDepId]
    );
    const available = rows[0]?.cantidad_disponible ?? 0;
    if (available < qty) {
      const e = new Error(`Stock insuficiente para transferencia desde depÃ³sito ${fromDepId}`);
      e.status = 409;
      throw e;
    }

    await client.query(
      `UPDATE inventario_depositos
          SET cantidad_disponible = cantidad_disponible - $1,
              actualizado_en = NOW()
        WHERE producto_id = $2 AND deposito_id = $3`,
      [qty, producto_id, fromDepId]
    );

    await client.query(
      `UPDATE inventario_depositos
          SET cantidad_disponible = cantidad_disponible + $1,
              actualizado_en = NOW()
        WHERE producto_id = $2 AND deposito_id = $3`,
      [qty, producto_id, toDepId]
    );

    const movMotivo = motivo || 'transferencia';
    const ref = referencia || null;

    await client.query(
      `INSERT INTO movimientos_stock(producto_id, deposito_id, tipo, cantidad, motivo, referencia, usuario_id)
       VALUES ($1, $2, 'salida', $3, $4, $5, $6)`,
      [producto_id, fromDepId, qty, movMotivo, ref, usuario_id]
    );
    await client.query(
      `INSERT INTO movimientos_stock(producto_id, deposito_id, tipo, cantidad, motivo, referencia, usuario_id)
       VALUES ($1, $2, 'entrada', $3, $4, $5, $6)`,
      [producto_id, toDepId, qty, movMotivo, ref, usuario_id]
    );

    audit.log({
      usuario_id,
      accion: 'transferir_stock',
      tabla_afectada: 'inventario',
      registro_id: producto_id,
      descripcion: `${qty} de dep=${fromDepId} a dep=${toDepId} ref=${ref || ''}`,
    });
  });
}

module.exports = {
  addStockTx,
  removeStockTx,
  addStockBatch,
  removeStockBatch,
  adjustStock,
  reserveStock,
  releaseReservation,
  transferStock,
  getDefaultDepositoId,
  resolveDepositoId,
};
