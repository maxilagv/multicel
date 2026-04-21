const { withTransaction, query } = require('../../db/pg');

function sumSplitTotal(metodos) {
  return (metodos || []).reduce((acc, item) => acc + Number(item?.monto || 0), 0);
}

async function validarMetodosPago(client, metodos) {
  const ids = [...new Set(metodos.map((m) => Number(m.metodo_id)).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) {
    const e = new Error('metodos invalido');
    e.status = 400;
    throw e;
  }
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await client.query(
    `SELECT id, nombre, activo FROM metodos_pago WHERE id IN (${placeholders})`,
    ids
  );
  const map = new Map(rows.map((r) => [Number(r.id), { activo: Number(r.activo) === 1, nombre: r.nombre }]));
  for (const id of ids) {
    if (!map.has(id)) {
      const e = new Error(`Metodo de pago ${id} no existe`);
      e.status = 400;
      throw e;
    }
    if (!map.get(id).activo) {
      const e = new Error(`Metodo de pago ${id} inactivo`);
      e.status = 400;
      throw e;
    }
  }
  return map;
}

async function crearPago({
  venta_id,
  cliente_id,
  monto,
  fecha,
  metodo = 'efectivo',
  fecha_limite = null,
  metodos = null,
}) {
  return withTransaction(async (client) => {
    const splitItems = Array.isArray(metodos) ? metodos.filter(Boolean) : [];
    const hasSplit = splitItems.length > 0;
    const totalSplit = hasSplit ? sumSplitTotal(splitItems) : 0;
    const totalMonto = Number.isFinite(Number(monto)) && Number(monto) > 0 ? Number(monto) : totalSplit;
    if (!Number.isFinite(totalMonto) || totalMonto <= 0) {
      const e = new Error('monto invalido');
      e.status = 400;
      throw e;
    }
    let metodoLegacy = metodo;
    let metodosInfo = null;
    if (hasSplit) {
      for (const item of splitItems) {
        const metodoId = Number(item?.metodo_id);
        const montoItem = Number(item?.monto);
        if (!Number.isInteger(metodoId) || metodoId <= 0) {
          const e = new Error('metodo_id invalido');
          e.status = 400;
          throw e;
        }
        if (!Number.isFinite(montoItem) || montoItem <= 0) {
          const e = new Error('monto de metodo invalido');
          e.status = 400;
          throw e;
        }
      }
      if (totalSplit <= 0) {
        const e = new Error('metodos debe tener montos validos');
        e.status = 400;
        throw e;
      }
      const diff = Math.abs(totalSplit - totalMonto);
      if (diff > 0.01) {
        const e = new Error('La suma de metodos no coincide con el monto');
        e.status = 400;
        throw e;
      }
      metodosInfo = await validarMetodosPago(client, splitItems);
      if (splitItems.length === 1) {
        const info = metodosInfo.get(Number(splitItems[0].metodo_id));
        const name = info?.nombre ? String(info.nombre).trim().toLowerCase() : '';
        if (['efectivo', 'transferencia', 'tarjeta', 'otro'].includes(name)) {
          metodoLegacy = name;
        } else {
          metodoLegacy = 'otro';
        }
      } else {
        metodoLegacy = 'otro';
      }
    }

    const ventaId = venta_id ? Number(venta_id) : null;
    if (ventaId) {
      const v = await client.query('SELECT id, neto, estado_pago, cliente_id FROM ventas WHERE id = $1', [ventaId]);
      if (!v.rowCount) {
        const e = new Error('Venta no encontrada');
        e.status = 404;
        throw e;
      }
      const venta = v.rows[0];
      if (Number(venta.cliente_id) !== Number(cliente_id)) {
        const e = new Error('La venta no pertenece al cliente');
        e.status = 400;
        throw e;
      }
      // Insert pago asociado a venta
      const insertRes = await client.query(
        `INSERT INTO pagos(venta_id, cliente_id, monto, fecha, metodo, fecha_limite)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ventaId, cliente_id, totalMonto, fecha || new Date(), hasSplit ? metodoLegacy : metodo, fecha_limite || null]
      );
      const pagoId = insertRes.lastID;
      if (hasSplit && pagoId) {
        for (const item of splitItems) {
          await client.query(
            `INSERT INTO pagos_metodos(pago_id, metodo_id, monto, moneda)
             VALUES ($1, $2, $3, $4)`,
            [
              pagoId,
              Number(item.metodo_id),
              Number(item.monto),
              item.moneda ? String(item.moneda).toUpperCase() : null,
            ]
          );
        }
      }
      // Recalcular total pagado
      const { rows } = await client.query('SELECT COALESCE(SUM(monto),0)::float AS total FROM pagos WHERE venta_id = $1', [ventaId]);
      const totalPagado = rows[0].total;
      if (totalPagado >= Number(venta.neto)) {
        await client.query("UPDATE ventas SET estado_pago = 'pagada' WHERE id = $1", [ventaId]);
      }
      return { venta_id: ventaId, total_pagado: totalPagado };
    }

    const insertRes = await client.query(
      `INSERT INTO pagos(venta_id, cliente_id, monto, fecha, metodo, fecha_limite)
       VALUES (NULL, $1, $2, $3, $4, $5)`,
      [cliente_id, totalMonto, fecha || new Date(), hasSplit ? metodoLegacy : metodo, fecha_limite || null]
    );
    const pagoId = insertRes.lastID;
    if (hasSplit && pagoId) {
      for (const item of splitItems) {
        await client.query(
          `INSERT INTO pagos_metodos(pago_id, metodo_id, monto, moneda)
           VALUES ($1, $2, $3, $4)`,
          [
            pagoId,
            Number(item.metodo_id),
            Number(item.monto),
            item.moneda ? String(item.moneda).toUpperCase() : null,
          ]
        );
      }
    }
    return { venta_id: null, cliente_id, monto: totalMonto };
  });
}

async function listarPagos({ venta_id, cliente_id, limit = 100, offset = 0, include_metodos = false } = {}) {
  const where = [];
  const params = [];
  if (venta_id) { params.push(venta_id); where.push(`venta_id = $${params.length}`); }
  if (cliente_id) { params.push(cliente_id); where.push(`cliente_id = $${params.length}`); }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim); params.push(off);
  const { rows } = await query(
    `SELECT id, venta_id, cliente_id, monto::float AS monto, fecha, metodo, fecha_limite
       FROM pagos
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY id DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
    params
  );
  if (!include_metodos || !rows.length) return rows;
  const ids = rows.map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return rows;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows: detRows } = await query(
    `SELECT pm.pago_id,
            pm.monto::float AS monto,
            pm.moneda AS moneda,
            mp.id AS metodo_id,
            mp.nombre AS metodo_nombre,
            mp.moneda AS metodo_moneda
       FROM pagos_metodos pm
       JOIN metodos_pago mp ON mp.id = pm.metodo_id
      WHERE pm.pago_id IN (${placeholders})
      ORDER BY pm.id ASC`,
    ids
  );
  const map = new Map();
  for (const d of detRows) {
    const pid = Number(d.pago_id);
    const list = map.get(pid) || [];
    list.push({
      metodo_id: Number(d.metodo_id),
      metodo_nombre: d.metodo_nombre,
      monto: Number(d.monto || 0),
      moneda: d.moneda || d.metodo_moneda || null,
    });
    map.set(pid, list);
  }
  return rows.map((r) => ({ ...r, metodos: map.get(Number(r.id)) || [] }));
}

async function findById(id) {
  const { rows } = await query(
    'SELECT id, venta_id, cliente_id, monto::float AS monto FROM pagos WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function eliminarPago(id) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, venta_id, cliente_id FROM pagos WHERE id = $1',
      [id]
    );
    if (!rows.length) return null;
    const pago = rows[0];
    await client.query('DELETE FROM pagos WHERE id = $1', [id]);
    if (pago.venta_id) {
      const { rows: totalRows } = await client.query(
        'SELECT COALESCE(SUM(monto),0)::float AS total FROM pagos WHERE venta_id = $1',
        [pago.venta_id]
      );
      const totalPagado = Number(totalRows[0]?.total || 0);
      const { rows: ventaRows } = await client.query(
        'SELECT neto::float AS neto FROM ventas WHERE id = $1',
        [pago.venta_id]
      );
      if (ventaRows.length) {
        const neto = Number(ventaRows[0]?.neto || 0);
        const nuevoEstado = totalPagado >= neto ? 'pagada' : 'pendiente';
        await client.query('UPDATE ventas SET estado_pago = $2 WHERE id = $1', [
          pago.venta_id,
          nuevoEstado,
        ]);
      }
    }
    return { id: pago.id, venta_id: pago.venta_id, cliente_id: pago.cliente_id };
  });
}

module.exports = { crearPago, listarPagos, findById, eliminarPago };
