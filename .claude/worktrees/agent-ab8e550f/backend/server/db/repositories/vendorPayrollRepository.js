const { query } = require('../../db/pg');

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function listVendedores() {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.email, u.activo
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
      WHERE r.nombre = 'vendedor'
      ORDER BY u.nombre ASC`
  );
  return rows;
}

async function ventasResumenPorVendedor({ desde, hasta }) {
  const params = [desde, hasta];
  const { rows } = await query(
    `SELECT u.id AS usuario_id,
            u.nombre,
            u.email,
            u.activo,
            COUNT(DISTINCT v.id) AS ventas_count,
            COALESCE(SUM(d.base_sin_iva), 0) AS ventas_total,
            COALESCE(SUM(d.comision_monto), 0) AS comision_total,
            COALESCE(SUM(d.base_sin_iva - (COALESCE(d.costo_unitario_pesos, 0) * d.cantidad)), 0) AS margen_total
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id AND r.nombre = 'vendedor'
       LEFT JOIN ventas v
              ON v.usuario_id = u.id
             AND v.estado_pago <> 'cancelado'
             AND v.oculto = 0
             AND v.estado_entrega = 'entregado'
             AND date(COALESCE(v.fecha_entrega, v.fecha), 'localtime') >= date($1)
             AND date(COALESCE(v.fecha_entrega, v.fecha), 'localtime') <= date($2)
        LEFT JOIN ventas_detalle d ON d.venta_id = v.id
      GROUP BY u.id, u.nombre, u.email, u.activo
      ORDER BY u.nombre ASC`,
    params
  );
  return rows;
}

async function ventasResumen({ usuario_id, desde, hasta }) {
  const params = [usuario_id, desde, hasta];
  const { rows } = await query(
    `SELECT COUNT(DISTINCT v.id) AS ventas_count,
            COALESCE(SUM(d.base_sin_iva), 0) AS ventas_total,
            COALESCE(SUM(d.comision_monto), 0) AS comision_total,
            COALESCE(SUM(d.base_sin_iva - (COALESCE(d.costo_unitario_pesos, 0) * d.cantidad)), 0) AS margen_total
       FROM ventas v
  LEFT JOIN ventas_detalle d ON d.venta_id = v.id
      WHERE v.usuario_id = $1
        AND v.estado_pago <> 'cancelado'
        AND v.oculto = 0
        AND v.estado_entrega = 'entregado'
        AND date(COALESCE(v.fecha_entrega, v.fecha), 'localtime') >= date($2)
        AND date(COALESCE(v.fecha_entrega, v.fecha), 'localtime') <= date($3)`,
    params
  );
  return rows[0] || { ventas_count: 0, ventas_total: 0, comision_total: 0, margen_total: 0 };
}

async function ventasDetallePorVendedor({ usuario_id, desde, hasta, limit = 200, offset = 0 }) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const params = [usuario_id, desde, hasta, lim, off];
  const { rows } = await query(
    `SELECT v.id,
            v.fecha,
            v.fecha_entrega,
            v.total,
            v.neto,
            v.estado_pago,
            v.estado_entrega,
            COALESCE(SUM(d.base_sin_iva), 0) AS base_sin_iva_total,
            COALESCE(SUM(d.comision_monto), 0) AS comision_total,
            COALESCE(SUM(d.base_sin_iva - (COALESCE(d.costo_unitario_pesos, 0) * d.cantidad)), 0) AS margen_total,
            c.nombre AS cliente_nombre,
            c.apellido AS cliente_apellido
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
  LEFT JOIN ventas_detalle d ON d.venta_id = v.id
      WHERE v.usuario_id = $1
        AND v.estado_pago <> 'cancelado'
        AND v.oculto = 0
        AND v.estado_entrega = 'entregado'
        AND date(COALESCE(v.fecha_entrega, v.fecha), 'localtime') >= date($2)
        AND date(COALESCE(v.fecha_entrega, v.fecha), 'localtime') <= date($3)
      GROUP BY v.id, v.fecha, v.fecha_entrega, v.total, v.neto, v.estado_pago, v.estado_entrega, c.nombre, c.apellido
      ORDER BY COALESCE(v.fecha_entrega, v.fecha) DESC
      LIMIT $4 OFFSET $5`,
    params
  );
  return rows;
}

async function getComisionActiva({ usuario_id, periodo, fecha }) {
  const params = [usuario_id, periodo, fecha];
  const { rows } = await query(
    `SELECT id,
            usuario_id,
            periodo,
            porcentaje,
            base_tipo,
            vigencia_desde,
            vigencia_hasta,
            activo
       FROM vendedores_comisiones
      WHERE usuario_id = $1
        AND periodo = $2
        AND activo = 1
        AND (vigencia_desde IS NULL OR date(vigencia_desde) <= date($3))
        AND (vigencia_hasta IS NULL OR date(vigencia_hasta) >= date($3))
      ORDER BY date(vigencia_desde) DESC, id DESC
      LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function comisionesActivasPorPeriodo({ periodo, fecha }) {
  const params = [periodo, fecha];
  const { rows } = await query(
    `SELECT id,
            usuario_id,
            periodo,
            porcentaje,
            base_tipo,
            vigencia_desde,
            vigencia_hasta,
            activo
       FROM vendedores_comisiones
      WHERE periodo = $1
        AND activo = 1
        AND (vigencia_desde IS NULL OR date(vigencia_desde) <= date($2))
        AND (vigencia_hasta IS NULL OR date(vigencia_hasta) >= date($2))
      ORDER BY date(vigencia_desde) DESC, id DESC`,
    params
  );
  return rows;
}

async function deactivateComisiones({ usuario_id, periodo }) {
  const params = [usuario_id, periodo];
  await query(
    `UPDATE vendedores_comisiones
        SET activo = 0
      WHERE usuario_id = $1
        AND periodo = $2
        AND activo = 1`,
    params
  );
}

async function createComision({
  usuario_id,
  periodo,
  porcentaje,
  base_tipo = 'bruto',
  vigencia_desde,
  vigencia_hasta,
  activo = 1,
}) {
  const params = [
    usuario_id,
    periodo,
    normalizeNumber(porcentaje, 0),
    base_tipo || 'bruto',
    vigencia_desde || null,
    vigencia_hasta || null,
    activo ? 1 : 0,
  ];
  const { rows } = await query(
    `INSERT INTO vendedores_comisiones(
        usuario_id, periodo, porcentaje, base_tipo, vigencia_desde, vigencia_hasta, activo
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    params
  );
  return rows[0] || null;
}

async function pagosSumPorVendedor({ periodo, desde, hasta }) {
  const params = [periodo, desde, hasta];
  const { rows } = await query(
    `SELECT usuario_id,
            COALESCE(SUM(monto_pagado), 0) AS pagado_total
       FROM vendedores_pagos
      WHERE periodo = $1
        AND date(desde) >= date($2)
        AND date(hasta) <= date($3)
      GROUP BY usuario_id`,
    params
  );
  return rows;
}

async function sumPagos({ usuario_id, periodo, desde, hasta }) {
  const params = [usuario_id, periodo, desde, hasta];
  const { rows } = await query(
    `SELECT COALESCE(SUM(monto_pagado), 0) AS pagado_total
       FROM vendedores_pagos
      WHERE usuario_id = $1
        AND periodo = $2
        AND date(desde) >= date($3)
        AND date(hasta) <= date($4)`,
    params
  );
  return rows[0] ? normalizeNumber(rows[0].pagado_total, 0) : 0;
}

async function listPagos({ usuario_id, periodo, desde, hasta, limit = 200, offset = 0 }) {
  const where = ['usuario_id = $1'];
  const params = [usuario_id];
  if (periodo) {
    params.push(periodo);
    where.push(`periodo = $${params.length}`);
  }
  if (desde) {
    params.push(desde);
    where.push(`date(desde) >= date($${params.length})`);
  }
  if (hasta) {
    params.push(hasta);
    where.push(`date(hasta) <= date($${params.length})`);
  }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);
  const { rows } = await query(
    `SELECT id,
            usuario_id,
            periodo,
            desde,
            hasta,
            ventas_total,
            porcentaje,
            monto_calculado,
            monto_pagado,
            fecha_pago,
            metodo,
            notas,
            usuario_registro
       FROM vendedores_pagos
      WHERE ${where.join(' AND ')}
      ORDER BY fecha_pago DESC, id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function createPago({
  usuario_id,
  periodo,
  desde,
  hasta,
  ventas_total,
  porcentaje,
  monto_calculado,
  monto_pagado,
  metodo,
  notas,
  usuario_registro,
}) {
  const params = [
    usuario_id,
    periodo,
    desde,
    hasta,
    normalizeNumber(ventas_total, 0),
    normalizeNumber(porcentaje, 0),
    normalizeNumber(monto_calculado, 0),
    normalizeNumber(monto_pagado, 0),
    metodo || null,
    notas || null,
    usuario_registro || null,
  ];
  const { rows } = await query(
    `INSERT INTO vendedores_pagos(
        usuario_id, periodo, desde, hasta, ventas_total, porcentaje,
        monto_calculado, monto_pagado, metodo, notas, usuario_registro
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    params
  );
  return rows[0] || null;
}

module.exports = {
  listVendedores,
  ventasResumenPorVendedor,
  ventasResumen,
  ventasDetallePorVendedor,
  getComisionActiva,
  comisionesActivasPorPeriodo,
  deactivateComisiones,
  createComision,
  pagosSumPorVendedor,
  sumPagos,
  listPagos,
  createPago,
};
