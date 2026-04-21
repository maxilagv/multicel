const { query } = require('../../db/pg');
const payroll = require('../../services/vendorPayrollService');

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
  return rows || [];
}

async function getVendedorById(usuario_id) {
  const userId = Number(usuario_id);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.email, u.activo
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
      WHERE r.nombre = 'vendedor'
        AND u.id = $1
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function countProductCommissionStats() {
  const { rows } = await query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN COALESCE(comision_pct, 0) > 0 THEN 1 ELSE 0 END), 0) AS con_comision
       FROM productos
      WHERE activo = 1
        AND deleted_at IS NULL`
  );
  const row = rows[0] || {};
  const total = Number(row.total || 0);
  const conComision = Number(row.con_comision || 0);
  return {
    total,
    con_comision: conComision,
    sin_comision: Math.max(total - conComision, 0),
  };
}

async function listLiquidacionLines({ usuario_id = null, desde, hasta }) {
  const where = [
    `v.estado_pago <> 'cancelado'`,
    'v.oculto = 0',
    `v.estado_entrega = 'entregado'`,
    `date(COALESCE(v.fecha_entrega, v.fecha)) >= date($1)`,
    `date(COALESCE(v.fecha_entrega, v.fecha)) <= date($2)`,
  ];
  const params = [desde, hasta];

  if (usuario_id != null) {
    params.push(Number(usuario_id));
    where.push(`v.usuario_id = $${params.length}`);
  }

  const { rows } = await query(
    `SELECT v.id AS venta_id,
            v.usuario_id,
            v.fecha,
            v.fecha_entrega,
            COALESCE(v.fecha_entrega, v.fecha) AS fecha_operacion,
            v.total AS venta_total,
            v.neto AS venta_neto,
            v.estado_pago,
            v.estado_entrega,
            v.price_list_type,
            c.nombre AS cliente_nombre,
            c.apellido AS cliente_apellido,
            d.id AS detalle_id,
            d.producto_id,
            p.nombre AS producto_nombre,
            d.cantidad,
            d.precio_unitario,
            d.subtotal,
            d.base_sin_iva,
            d.comision_pct AS comision_pct_guardado,
            d.comision_monto AS comision_monto_guardado,
            d.comision_tipo_calculo,
            d.lista_precio_id,
            d.lista_precio_codigo,
            COALESCE(lp.nombre, d.lista_precio_codigo) AS lista_precio_nombre,
            COALESCE(lp.legacy_code, lp.slug, d.lista_precio_codigo) AS lista_precio_codigo_resuelto
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
  LEFT JOIN ventas_detalle d ON d.venta_id = v.id
  LEFT JOIN productos p ON p.id = d.producto_id
  LEFT JOIN listas_precio lp ON lp.id = d.lista_precio_id
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(v.fecha_entrega, v.fecha) DESC, v.id DESC, d.id ASC`,
    params
  );
  return rows || [];
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
  if (!rows[0]) return null;
  return {
    ...rows[0],
    porcentaje: normalizeNumber(rows[0].porcentaje, 0),
    base_tipo: payroll.normalizeBaseType(rows[0].base_tipo),
  };
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
    payroll.normalizePeriodo(periodo),
    normalizeNumber(porcentaje, 0),
    payroll.normalizeBaseType(base_tipo),
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
  return rows || [];
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
    params.push(payroll.normalizePeriodo(periodo));
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
  return rows || [];
}

async function listHistorialPagos({ usuario_id, limit = 200, offset = 0 }) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
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
      WHERE usuario_id = $1
      ORDER BY fecha_pago DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [usuario_id, lim, off]
  );
  return rows || [];
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
    payroll.normalizePeriodo(periodo),
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

async function getVendorConfig(usuario_id) {
  const { rows } = await query(
    `SELECT id, usuario_id, sueldo_fijo, comision_tipo, periodo_liquidacion, activo
       FROM vendedores_config
      WHERE usuario_id = $1
      LIMIT 1`,
    [usuario_id]
  );
  if (!rows[0]) return null;
  return {
    ...rows[0],
    sueldo_fijo: normalizeNumber(rows[0].sueldo_fijo, 0),
    comision_tipo: payroll.normalizeCommissionMode(rows[0].comision_tipo),
    periodo_liquidacion: payroll.normalizePeriodo(rows[0].periodo_liquidacion || 'mes'),
  };
}

async function vendorConfigsAll() {
  const { rows } = await query(
    `SELECT usuario_id, sueldo_fijo, comision_tipo, periodo_liquidacion
       FROM vendedores_config
      WHERE activo = 1`
  );
  return (rows || []).map((row) => ({
    ...row,
    sueldo_fijo: normalizeNumber(row.sueldo_fijo, 0),
    comision_tipo: payroll.normalizeCommissionMode(row.comision_tipo),
    periodo_liquidacion: payroll.normalizePeriodo(row.periodo_liquidacion || 'mes'),
  }));
}

async function setVendorConfig({ usuario_id, sueldo_fijo, comision_tipo, periodo_liquidacion }) {
  await query(
    `INSERT INTO vendedores_config (usuario_id, sueldo_fijo, comision_tipo, periodo_liquidacion)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (usuario_id) DO UPDATE SET
       sueldo_fijo = EXCLUDED.sueldo_fijo,
       comision_tipo = EXCLUDED.comision_tipo,
       periodo_liquidacion = EXCLUDED.periodo_liquidacion`,
    [
      usuario_id,
      normalizeNumber(sueldo_fijo, 0),
      payroll.normalizeCommissionMode(comision_tipo),
      payroll.normalizePeriodo(periodo_liquidacion || 'mes'),
    ]
  );
}

async function sumaAdelantos({ usuario_id, desde, hasta }) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(monto), 0) AS adelantos_total
       FROM vendedores_adelantos
      WHERE usuario_id = $1
        AND date(fecha) >= date($2)
        AND date(fecha) <= date($3)`,
    [usuario_id, desde, hasta]
  );
  return rows[0] ? normalizeNumber(rows[0].adelantos_total, 0) : 0;
}

async function adelantosSumPorVendedor({ desde, hasta }) {
  const { rows } = await query(
    `SELECT usuario_id,
            COALESCE(SUM(monto), 0) AS adelantos_total
       FROM vendedores_adelantos
      WHERE date(fecha) >= date($1)
        AND date(fecha) <= date($2)
      GROUP BY usuario_id`,
    [desde, hasta]
  );
  return rows || [];
}

async function listAdelantos({ usuario_id, desde, hasta, limit = 200, offset = 0 }) {
  const where = ['usuario_id = $1'];
  const params = [usuario_id];
  if (desde) {
    params.push(desde);
    where.push(`date(fecha) >= date($${params.length})`);
  }
  if (hasta) {
    params.push(hasta);
    where.push(`date(fecha) <= date($${params.length})`);
  }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);
  const { rows } = await query(
    `SELECT id, usuario_id, monto, fecha, notas, usuario_registro, creado_en
       FROM vendedores_adelantos
      WHERE ${where.join(' AND ')}
      ORDER BY fecha DESC, id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows || [];
}

async function createAdelanto({ usuario_id, monto, fecha, notas, usuario_registro }) {
  const { rows } = await query(
    `INSERT INTO vendedores_adelantos (usuario_id, monto, fecha, notas, usuario_registro)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      usuario_id,
      normalizeNumber(monto, 0),
      fecha,
      notas || null,
      usuario_registro || null,
    ]
  );
  return rows[0] || null;
}

module.exports = {
  listVendedores,
  getVendedorById,
  countProductCommissionStats,
  listLiquidacionLines,
  getComisionActiva,
  deactivateComisiones,
  createComision,
  pagosSumPorVendedor,
  sumPagos,
  listPagos,
  listHistorialPagos,
  createPago,
  getVendorConfig,
  vendorConfigsAll,
  setVendorConfig,
  sumaAdelantos,
  adelantosSumPorVendedor,
  listAdelantos,
  createAdelanto,
};
