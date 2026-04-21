const { withTransaction, query } = require('../../db/pg');
const inv = require('../../services/inventoryService');
const configRepo = require('./configRepository');

function normalizeFx(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeInt(value) {
  const n = parseInt(value || '0', 10);
  return Number.isFinite(n) ? n : 0;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toMysqlDatetimeUTC(date) {
  return (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`
  );
}

function normalizeDatetimeInput(input, fieldLabel) {
  if (!input) return toMysqlDatetimeUTC(new Date());
  const candidate = input instanceof Date ? input : new Date(String(input).trim());
  if (Number.isNaN(candidate.getTime())) {
    const e = new Error(`${fieldLabel} invalida`);
    e.status = 400;
    throw e;
  }
  return toMysqlDatetimeUTC(candidate);
}

async function createCompra({ proveedor_id, fecha, moneda = 'USD', detalle = [], oc_numero, adjunto_url }) {
  return withTransaction(async (client) => {
    const compraFecha = normalizeDatetimeInput(fecha, 'Fecha de compra');
    const prov = await client.query('SELECT id FROM proveedores WHERE id = $1', [proveedor_id]);
    if (!prov.rowCount) {
      const e = new Error('Proveedor no encontrado');
      e.status = 400;
      throw e;
    }
    const dolarBlue = normalizeFx(await configRepo.getDolarBlue().catch(() => null));
    let total = 0;
    for (const d of detalle) {
      const subtotal = (Number(d.costo_unitario) || 0) * (Number(d.cantidad) || 0) + (Number(d.costo_envio) || 0);
      total += subtotal;
    }
    const insCompra = await client.query(
      `INSERT INTO compras(proveedor_id, fecha, total_costo, moneda, estado, oc_numero, adjunto_url)
       VALUES ($1, $2, $3, $4, 'pendiente', $5, $6) RETURNING id`,
      [proveedor_id, compraFecha, total, moneda, oc_numero || null, adjunto_url || null]
    );
    const compraId = insCompra.rows[0].id;

    for (const d of detalle) {
      const subtotal = (Number(d.costo_unitario) || 0) * (Number(d.cantidad) || 0) + (Number(d.costo_envio) || 0);
      const itemMoneda = d.moneda || moneda || 'USD';
      let itemTipoCambio = typeof d.tipo_cambio !== 'undefined' ? d.tipo_cambio : null;
      let fx = normalizeFx(itemTipoCambio);
      if (!fx && itemMoneda === 'USD' && dolarBlue) fx = dolarBlue;
      itemTipoCambio = fx;
      await client.query(
        `INSERT INTO compras_detalle(
           compra_id,
           producto_id,
           cantidad,
           costo_unitario,
           costo_envio,
           subtotal,
           moneda,
           tipo_cambio
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [compraId, d.producto_id, d.cantidad, d.costo_unitario, d.costo_envio || 0, subtotal, itemMoneda, itemTipoCambio]
      );
    }
    return { id: compraId, total };
  });
}

function buildEstadoRecepcionSql() {
  return `CASE
    WHEN c.estado = 'cancelado' THEN 'cancelado'
    WHEN COALESCE(d.total_cantidad, 0) > 0 AND COALESCE(d.total_recibida, 0) >= COALESCE(d.total_cantidad, 0) THEN 'recibido'
    WHEN COALESCE(d.total_recibida, 0) > 0 THEN 'parcial'
    ELSE 'pendiente'
  END`;
}

async function listarCompras({ limit = 100, offset = 0 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const estadoRecepcionSql = buildEstadoRecepcionSql();
  const { rows } = await query(
    `SELECT c.id,
            c.proveedor_id,
            p.nombre AS proveedor_nombre,
            c.fecha,
            c.total_costo::float AS total_costo,
            c.moneda,
            c.estado,
            c.oc_numero,
            c.adjunto_url,
            COALESCE(d.total_cantidad, 0) AS total_cantidad,
            COALESCE(d.total_recibida, 0) AS total_recibida,
            ${estadoRecepcionSql} AS estado_recepcion
       FROM compras c
       JOIN proveedores p ON p.id = c.proveedor_id
       LEFT JOIN (
         SELECT compra_id,
                SUM(cantidad) AS total_cantidad,
                SUM(cantidad_recibida) AS total_recibida
           FROM compras_detalle
          GROUP BY compra_id
       ) d ON d.compra_id = c.id
      ORDER BY c.id DESC
      LIMIT $1 OFFSET $2`,
    [lim, off]
  );
  return rows;
}

async function listarComprasPorProveedor({ proveedor_id, limit = 100, offset = 0 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const estadoRecepcionSql = buildEstadoRecepcionSql();
  const { rows } = await query(
    `SELECT c.id,
            c.fecha,
            c.total_costo::float AS total_costo,
            c.moneda,
            c.estado,
            c.oc_numero,
            c.adjunto_url,
            COALESCE(d.total_cantidad, 0) AS total_cantidad,
            COALESCE(d.total_recibida, 0) AS total_recibida,
            ${estadoRecepcionSql} AS estado_recepcion
       FROM compras c
       LEFT JOIN (
         SELECT compra_id,
                SUM(cantidad) AS total_cantidad,
                SUM(cantidad_recibida) AS total_recibida
           FROM compras_detalle
          GROUP BY compra_id
       ) d ON d.compra_id = c.id
      WHERE c.proveedor_id = $1
      ORDER BY c.id DESC
      LIMIT $2 OFFSET $3`,
    [proveedor_id, lim, off]
  );
  return rows;
}

async function getCompraDetalle(id) {
  const { rows } = await query(
    `SELECT d.id,
            d.producto_id,
            pr.nombre AS producto_nombre,
            d.cantidad,
            d.cantidad_recibida,
            d.costo_unitario::float AS costo_unitario,
            d.costo_envio::float AS costo_envio,
            d.subtotal::float AS subtotal,
            d.moneda,
            d.tipo_cambio::float AS tipo_cambio
       FROM compras_detalle d
       JOIN productos pr ON pr.id = d.producto_id
      WHERE d.compra_id = $1`,
    [id]
  );
  return rows;
}

async function recibirCompra({ compra_id, fecha_recepcion, observaciones, usuario_id, deposito_id, detalle }) {
  return withTransaction(async (client) => {
    const recepcionFecha = normalizeDatetimeInput(fecha_recepcion, 'Fecha de recepcion');
    const c = await client.query(
      'SELECT id, estado, proveedor_id, moneda FROM compras WHERE id = $1',
      [compra_id]
    );
    if (!c.rowCount) {
      const e = new Error('Compra no encontrada');
      e.status = 404;
      throw e;
    }
    if (c.rows[0].estado === 'recibido') return { id: compra_id, already: true };
    if (c.rows[0].estado === 'cancelado') {
      const e = new Error('Compra cancelada');
      e.status = 400;
      throw e;
    }

    const resolvedDepositoId = await inv.resolveDepositoId(client, deposito_id);

    const { rows: det } = await client.query(
      `SELECT producto_id,
              cantidad,
              cantidad_recibida,
              costo_unitario,
              moneda,
              tipo_cambio
         FROM compras_detalle
        WHERE compra_id = $1`,
      [compra_id]
    );

    const requested = Array.isArray(detalle) ? detalle : null;
    const detByProducto = new Map(det.map((row) => [row.producto_id, row]));
    const toReceive = [];

    if (requested && requested.length) {
      for (const item of requested) {
        const productoId = Number(item.producto_id);
        const cantidadReq = normalizeInt(item.cantidad);
        if (!productoId || cantidadReq <= 0) continue;
        const row = detByProducto.get(productoId);
        if (!row) {
          const e = new Error('Producto no pertenece a la compra');
          e.status = 400;
          throw e;
        }
        const restante = Math.max(0, Number(row.cantidad) - Number(row.cantidad_recibida || 0));
        if (cantidadReq > restante) {
          const e = new Error('Cantidad a recibir supera lo pendiente');
          e.status = 400;
          throw e;
        }
        toReceive.push({ ...row, cantidad_recibir: cantidadReq });
      }
    } else {
      for (const row of det) {
        const restante = Math.max(0, Number(row.cantidad) - Number(row.cantidad_recibida || 0));
        if (restante > 0) toReceive.push({ ...row, cantidad_recibir: restante });
      }
    }

    if (!toReceive.length) {
      const e = new Error('No hay cantidades pendientes para recibir');
      e.status = 400;
      throw e;
    }

    const insRecep = await client.query(
      `INSERT INTO recepciones(compra_id, fecha_recepcion, observaciones, deposito_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [compra_id, recepcionFecha, observaciones || null, resolvedDepositoId]
    );
    const recepcionId = insRecep.rows[0]?.id;

    const dolarBlue = normalizeFx(await configRepo.getDolarBlue().catch(() => null));

    for (const d of toReceive) {
      await client.query(
        `UPDATE compras_detalle
            SET cantidad_recibida = cantidad_recibida + $1
          WHERE compra_id = $2
            AND producto_id = $3`,
        [d.cantidad_recibir, compra_id, d.producto_id]
      );

      if (recepcionId) {
        await client.query(
          `INSERT INTO recepciones_detalle(recepcion_id, producto_id, cantidad)
           VALUES ($1, $2, $3)`,
          [recepcionId, d.producto_id, d.cantidad_recibir]
        );
      }

      await inv.addStockTx(client, {
        producto_id: d.producto_id,
        cantidad: d.cantidad_recibir,
        motivo: 'compra',
        referencia: `COMPRA ${compra_id}`,
        deposito_id: resolvedDepositoId,
        usuario_id,
      });

      const monedaDetalle = d.moneda || c.rows[0].moneda || 'USD';
      let tipoCambio = normalizeFx(d.tipo_cambio);
      if (!tipoCambio && monedaDetalle === 'USD' && dolarBlue) tipoCambio = dolarBlue;
      const costoUnitario = Number(d.costo_unitario) || 0;

      let costoPesos = 0;
      let costoDolares = 0;

      if (monedaDetalle === 'ARS') {
        costoPesos = costoUnitario;
        if (tipoCambio && tipoCambio > 0) {
          costoDolares = costoUnitario / tipoCambio;
        }
      } else if (monedaDetalle === 'USD') {
        costoDolares = costoUnitario;
        if (tipoCambio && tipoCambio > 0) {
          costoPesos = costoUnitario * tipoCambio;
        }
      } else {
        costoPesos = 0;
        costoDolares = 0;
      }

      if (costoPesos <= 0 && costoDolares <= 0) {
        continue;
      }

      const { rows: prodRows } = await client.query(
        'SELECT margen_local, margen_distribuidor FROM productos WHERE id = $1',
        [d.producto_id]
      );
      if (!prodRows.length) continue;
      const prod = prodRows[0];
      const margenLocal = Number(prod.margen_local) || 0.15;
      const margenDistribuidor = Number(prod.margen_distribuidor) || 0.45;

      const precioLocal = costoPesos > 0 ? costoPesos * (1 + margenLocal) : 0;
      const precioDistribuidor = costoPesos > 0 ? costoPesos * (1 + margenDistribuidor) : 0;

      await client.query(
        `UPDATE productos
            SET precio_costo = $1,
                precio_costo_pesos = $1,
                precio_costo_dolares = $2,
                tipo_cambio = $3,
                margen_local = $4,
                margen_distribuidor = $5,
                precio_venta = $6,
                precio_local = $7,
                precio_distribuidor = $8,
                proveedor_id = $9,
                actualizado_en = CURRENT_TIMESTAMP
          WHERE id = $10`,
        [
          costoPesos,
          costoDolares,
          tipoCambio,
          margenLocal,
          margenDistribuidor,
          precioLocal,
          precioLocal,
          precioDistribuidor,
          c.rows[0].proveedor_id,
          d.producto_id,
        ]
      );

      await client.query(
        `INSERT INTO productos_historial(
           producto_id,
           proveedor_id,
           costo_pesos,
           costo_dolares,
           tipo_cambio,
           margen_local,
           margen_distribuidor,
           precio_local,
           precio_distribuidor,
           usuario_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          d.producto_id,
          c.rows[0].proveedor_id,
          costoPesos || null,
          costoDolares || null,
          tipoCambio,
          margenLocal,
          margenDistribuidor,
          precioLocal || null,
          precioDistribuidor || null,
          usuario_id || null,
        ]
      );
    }

    const { rows: sumRows } = await client.query(
      `SELECT SUM(cantidad) AS total_cantidad,
              SUM(cantidad_recibida) AS total_recibida
         FROM compras_detalle
        WHERE compra_id = $1`,
      [compra_id]
    );
    const totalCantidad = Number(sumRows[0]?.total_cantidad || 0);
    const totalRecibida = Number(sumRows[0]?.total_recibida || 0);
    if (totalCantidad > 0 && totalRecibida >= totalCantidad) {
      await client.query("UPDATE compras SET estado = 'recibido' WHERE id = $1", [compra_id]);
      return { id: compra_id, received: true };
    }
    return { id: compra_id, received: false };
  });
}

module.exports = {
  createCompra,
  listarCompras,
  listarComprasPorProveedor,
  getCompraDetalle,
  recibirCompra,
};
