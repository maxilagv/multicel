const { query } = require('../db/pg');
const configRepo = require('../db/repositories/configRepository');
const aiService = require('./aiService');
const { getJson: getRuntimeJson, setJson: setRuntimeJson } = require('./runtimeStore');

const REPORT_CACHE_MS = Number(process.env.AI_REPORT_CACHE_MS || 30000);

function buildCacheKey(key) {
  return `report-executive:${key}`;
}

async function getCache(key) {
  return getRuntimeJson(buildCacheKey(key));
}

async function setCache(key, data, ttlMs) {
  await setRuntimeJson(buildCacheKey(key), data, ttlMs);
  return data;
}

function parseDateParam(value, fallback) {
  if (value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback;
}

function toIsoDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function resolveRange(input = {}) {
  const today = new Date();
  const defaultHasta = today;
  const defaultDesde = new Date(today);
  defaultDesde.setDate(defaultDesde.getDate() - 29);

  const fromDate = parseDateParam(input.desde, defaultDesde);
  const toDate = parseDateParam(input.hasta, defaultHasta);

  const fromStr = toIsoDate(fromDate);
  const toStr = toIsoDate(toDate);
  const days = Math.max(1, Math.round((toDate - fromDate) / (24 * 60 * 60 * 1000)) + 1);

  return { fromDate, toDate, fromStr, toStr, days };
}

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function percentChange(current, previous) {
  const prev = normalizeNumber(previous, 0);
  if (!prev) return null;
  const cur = normalizeNumber(current, 0);
  return ((cur - prev) / prev) * 100;
}

function buildDateFilter(column, params, fromStr, toStr) {
  params.push(fromStr);
  const fromIdx = params.length;
  params.push(toStr);
  const toIdx = params.length;
  return [
    `date(${column}, 'localtime') >= date($${fromIdx})`,
    `date(${column}, 'localtime') <= date($${toIdx})`,
  ];
}

function resolveFilters(query = {}) {
  return {
    usuarioId: Number.isInteger(Number(query.usuario_id)) ? Number(query.usuario_id) : null,
    depositoId: Number.isInteger(Number(query.deposito_id)) ? Number(query.deposito_id) : null,
    clienteId: Number.isInteger(Number(query.cliente_id)) ? Number(query.cliente_id) : null,
    proveedorId: Number.isInteger(Number(query.proveedor_id)) ? Number(query.proveedor_id) : null,
  };
}

async function buildExecutiveReportData({
  rangeInput = {},
  filters = {},
  historyDays = 90,
  forecastDays = 14,
  insightsLimit = 10,
  topLimit = 5,
} = {}) {
  const range = resolveRange(rangeInput);
  const cacheKey = [
    'exec',
    range.desde || range.fromStr,
    range.hasta || range.toStr,
    filters?.usuarioId || 'all',
    filters?.depositoId || 'all',
    filters?.clienteId || 'all',
    filters?.proveedorId || 'all',
    historyDays,
    forecastDays,
    insightsLimit,
    topLimit,
  ].join(':');
  const cached = await getCache(cacheKey);
  if (cached) return cached;
  const { fromStr, toStr, days } = range;
  const { usuarioId, depositoId, clienteId, proveedorId } = filters;

  const ventasParams = [];
  const ventasWhere = buildDateFilter('v.fecha', ventasParams, fromStr, toStr);
  ventasWhere.push("v.estado_pago <> 'cancelado'");
  if (usuarioId) {
    ventasParams.push(usuarioId);
    ventasWhere.push(`v.usuario_id = $${ventasParams.length}`);
  }
  if (depositoId) {
    ventasParams.push(depositoId);
    ventasWhere.push(`v.deposito_id = $${ventasParams.length}`);
  }
  if (clienteId) {
    ventasParams.push(clienteId);
    ventasWhere.push(`v.cliente_id = $${ventasParams.length}`);
  }
  const { rows: ventasRows } = await query(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(v.neto),0) AS total
       FROM ventas v
      WHERE ${ventasWhere.join(' AND ')}`,
    ventasParams
  );
  const ventasCount = normalizeNumber(ventasRows[0]?.cantidad, 0);
  const ventasTotal = normalizeNumber(ventasRows[0]?.total, 0);

  const comprasParams = [];
  const comprasWhere = buildDateFilter('c.fecha', comprasParams, fromStr, toStr);
  comprasWhere.push("c.estado <> 'cancelado'");
  if (proveedorId) {
    comprasParams.push(proveedorId);
    comprasWhere.push(`c.proveedor_id = $${comprasParams.length}`);
  }
  const { rows: comprasRows } = await query(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(c.total_costo),0) AS total
       FROM compras c
      WHERE ${comprasWhere.join(' AND ')}`,
    comprasParams
  );
  const comprasCount = normalizeNumber(comprasRows[0]?.cantidad, 0);
  const comprasTotal = normalizeNumber(comprasRows[0]?.total, 0);

  const gastosParams = [];
  const gastosWhere = buildDateFilter('g.fecha', gastosParams, fromStr, toStr);
  if (usuarioId) {
    gastosParams.push(usuarioId);
    gastosWhere.push(`g.usuario_id = $${gastosParams.length}`);
  }
  const { rows: gastosRows } = await query(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(g.monto),0) AS total
       FROM gastos g
      WHERE ${gastosWhere.join(' AND ')}`,
    gastosParams
  );
  const gastosCount = normalizeNumber(gastosRows[0]?.cantidad, 0);
  const gastosTotal = normalizeNumber(gastosRows[0]?.total, 0);

  const pagosParams = [];
  const pagosWhere = buildDateFilter('p.fecha', pagosParams, fromStr, toStr);
  if (clienteId) {
    pagosParams.push(clienteId);
    pagosWhere.push(`p.cliente_id = $${pagosParams.length}`);
  }
  const { rows: pagosRows } = await query(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(p.monto),0) AS total
       FROM pagos p
      WHERE ${pagosWhere.join(' AND ')}`,
    pagosParams
  );
  const pagosCount = normalizeNumber(pagosRows[0]?.cantidad, 0);
  const pagosTotal = normalizeNumber(pagosRows[0]?.total, 0);

  const pagosProvParams = [];
  const pagosProvWhere = buildDateFilter('pp.fecha', pagosProvParams, fromStr, toStr);
  if (proveedorId) {
    pagosProvParams.push(proveedorId);
    pagosProvWhere.push(`pp.proveedor_id = $${pagosProvParams.length}`);
  }
  const { rows: pagosProvRows } = await query(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(pp.monto),0) AS total
       FROM pagos_proveedores pp
      WHERE ${pagosProvWhere.join(' AND ')}`,
    pagosProvParams
  );
  const pagosProvCount = normalizeNumber(pagosProvRows[0]?.cantidad, 0);
  const pagosProvTotal = normalizeNumber(pagosProvRows[0]?.total, 0);

  const deudasIniParams = [];
  const deudasIniWhere = buildDateFilter('d.fecha', deudasIniParams, fromStr, toStr);
  if (clienteId) {
    deudasIniParams.push(clienteId);
    deudasIniWhere.push(`d.cliente_id = $${deudasIniParams.length}`);
  }
  const { rows: deudasIniRows } = await query(
    `SELECT COALESCE(SUM(d.monto),0) AS total
       FROM clientes_deudas_iniciales_pagos d
      WHERE ${deudasIniWhere.join(' AND ')}`,
    deudasIniParams
  );
  const deudasIniTotal = normalizeNumber(deudasIniRows[0]?.total, 0);

  const ticketProm = ventasCount > 0 ? ventasTotal / ventasCount : 0;
  const cobranzaRatio = ventasTotal > 0 ? pagosTotal / ventasTotal : null;
  const gananciaNeta = ventasTotal - gastosTotal;

  const cashIn = pagosTotal + deudasIniTotal;
  const cashOut = gastosTotal + pagosProvTotal;
  const cashNet = cashIn - cashOut;

  const prevEnd = new Date(`${fromStr}T00:00:00Z`);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  const prevRange = { fromStr: toIsoDate(prevStart), toStr: toIsoDate(prevEnd) };

  const ventasPrevParams = [];
  const ventasPrevWhere = buildDateFilter('v.fecha', ventasPrevParams, prevRange.fromStr, prevRange.toStr);
  ventasPrevWhere.push("v.estado_pago <> 'cancelado'");
  if (usuarioId) {
    ventasPrevParams.push(usuarioId);
    ventasPrevWhere.push(`v.usuario_id = $${ventasPrevParams.length}`);
  }
  if (depositoId) {
    ventasPrevParams.push(depositoId);
    ventasPrevWhere.push(`v.deposito_id = $${ventasPrevParams.length}`);
  }
  if (clienteId) {
    ventasPrevParams.push(clienteId);
    ventasPrevWhere.push(`v.cliente_id = $${ventasPrevParams.length}`);
  }
  const { rows: ventasPrevRows } = await query(
    `SELECT COALESCE(SUM(v.neto),0) AS total
       FROM ventas v
      WHERE ${ventasPrevWhere.join(' AND ')}`,
    ventasPrevParams
  );
  const ventasPrevTotal = normalizeNumber(ventasPrevRows[0]?.total, 0);

  const gastosPrevParams = [];
  const gastosPrevWhere = buildDateFilter('g.fecha', gastosPrevParams, prevRange.fromStr, prevRange.toStr);
  if (usuarioId) {
    gastosPrevParams.push(usuarioId);
    gastosPrevWhere.push(`g.usuario_id = $${gastosPrevParams.length}`);
  }
  const { rows: gastosPrevRows } = await query(
    `SELECT COALESCE(SUM(g.monto),0) AS total
       FROM gastos g
      WHERE ${gastosPrevWhere.join(' AND ')}`,
    gastosPrevParams
  );
  const gastosPrevTotal = normalizeNumber(gastosPrevRows[0]?.total, 0);

  const ventasPct = percentChange(ventasTotal, ventasPrevTotal);
  const gastosPct = percentChange(gastosTotal, gastosPrevTotal);
  const gananciaPct = percentChange(gananciaNeta, ventasPrevTotal - gastosPrevTotal);

  const topClientesParams = [];
  const topClientesWhere = buildDateFilter('v.fecha', topClientesParams, fromStr, toStr);
  topClientesWhere.push("v.estado_pago <> 'cancelado'");
  if (usuarioId) {
    topClientesParams.push(usuarioId);
    topClientesWhere.push(`v.usuario_id = $${topClientesParams.length}`);
  }
  if (depositoId) {
    topClientesParams.push(depositoId);
    topClientesWhere.push(`v.deposito_id = $${topClientesParams.length}`);
  }
  if (clienteId) {
    topClientesParams.push(clienteId);
    topClientesWhere.push(`v.cliente_id = $${topClientesParams.length}`);
  }
  const { rows: topClientesRows } = await query(
    `SELECT c.id, c.nombre, c.apellido, SUM(v.neto) AS total
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
      WHERE ${topClientesWhere.join(' AND ')}
      GROUP BY c.id, c.nombre, c.apellido
      ORDER BY total DESC
      LIMIT $${topClientesParams.length + 1}`,
    [...topClientesParams, Math.min(Math.max(topLimit, 1), 20)]
  );

  const topProdParams = [];
  const topProdWhere = buildDateFilter('v.fecha', topProdParams, fromStr, toStr);
  topProdWhere.push("v.estado_pago <> 'cancelado'");
  if (usuarioId) {
    topProdParams.push(usuarioId);
    topProdWhere.push(`v.usuario_id = $${topProdParams.length}`);
  }
  if (depositoId) {
    topProdParams.push(depositoId);
    topProdWhere.push(`v.deposito_id = $${topProdParams.length}`);
  }
  if (clienteId) {
    topProdParams.push(clienteId);
    topProdWhere.push(`v.cliente_id = $${topProdParams.length}`);
  }
  const { rows: topProdRows } = await query(
    `SELECT p.id, p.nombre, SUM(d.cantidad) AS unidades, SUM(d.subtotal) AS monto
       FROM ventas_detalle d
       JOIN ventas v ON v.id = d.venta_id
       JOIN productos p ON p.id = d.producto_id
      WHERE ${topProdWhere.join(' AND ')}
      GROUP BY p.id, p.nombre
      ORDER BY unidades DESC, monto DESC
      LIMIT $${topProdParams.length + 1}`,
    [...topProdParams, Math.min(Math.max(topLimit, 1), 20)]
  );

  const { rows: stockRows } = await query(
    `SELECT producto_id, nombre, cantidad_disponible, stock_minimo
       FROM vista_stock_bajo
      ORDER BY (stock_minimo - cantidad_disponible) DESC
      LIMIT 6`
  );

  let debtThreshold = null;
  try {
    debtThreshold = await configRepo.getDebtThreshold();
  } catch {}
  const { rows: debtRows } = await query(
    `SELECT c.id, c.nombre, c.apellido, v.deuda_pendiente, v.deuda_mas_90, v.dias_promedio_atraso
       FROM vista_deudas v
       JOIN clientes c ON c.id = v.cliente_id
      WHERE v.deuda_pendiente > 0
      ORDER BY v.deuda_pendiente DESC
      LIMIT 6`
  );
  const filteredDebts = debtThreshold
    ? debtRows.filter((r) => normalizeNumber(r.deuda_pendiente, 0) >= Number(debtThreshold))
    : debtRows;

  let insights = null;
  try {
    insights = await aiService.insights({
      historyDays: Math.max(7, Number(historyDays)),
      forecastDays: Math.max(1, Number(forecastDays)),
      limit: Math.min(Math.max(Number(insightsLimit) || 10, 1), 20),
    });
  } catch {
    insights = null;
  }

  return setCache(cacheKey, {
    generated_at: new Date().toISOString(),
    range: { desde: fromStr, hasta: toStr, dias: days },
    filters: { usuario_id: usuarioId, deposito_id: depositoId, cliente_id: clienteId, proveedor_id: proveedorId },
    kpis: {
      ventas: { total: ventasTotal, count: ventasCount, avg_ticket: Number(ticketProm.toFixed(2)) },
      compras: { total: comprasTotal, count: comprasCount },
      gastos: { total: gastosTotal, count: gastosCount },
      pagos_clientes: { total: pagosTotal, count: pagosCount },
      pagos_proveedores: { total: pagosProvTotal, count: pagosProvCount },
      deudas_iniciales_pagos: { total: deudasIniTotal },
      ganancia_neta: { total: gananciaNeta },
      cobranza_ratio: cobranzaRatio != null ? Number((cobranzaRatio * 100).toFixed(2)) : null,
      cashflow: { cash_in: cashIn, cash_out: cashOut, neto: cashNet },
    },
    trends: {
      ventas_pct: ventasPct != null ? Number(ventasPct.toFixed(2)) : null,
      gastos_pct: gastosPct != null ? Number(gastosPct.toFixed(2)) : null,
      ganancia_pct: gananciaPct != null ? Number(gananciaPct.toFixed(2)) : null,
    },
    top: {
      clientes: (topClientesRows || []).map((r) => ({
        id: r.id,
        nombre: `${r.nombre || ''}${r.apellido ? ` ${r.apellido}` : ''}`.trim(),
        total: normalizeNumber(r.total, 0),
      })),
      productos: (topProdRows || []).map((r) => ({
        id: r.id,
        nombre: r.nombre,
        unidades: normalizeNumber(r.unidades, 0),
        monto: normalizeNumber(r.monto, 0),
      })),
    },
    riesgos: {
      stock_bajo: (stockRows || []).map((r) => ({
        producto_id: r.producto_id,
        nombre: r.nombre,
        disponible: normalizeNumber(r.cantidad_disponible, 0),
        stock_minimo: normalizeNumber(r.stock_minimo, 0),
      })),
      deudas: (filteredDebts || []).map((r) => ({
        cliente_id: r.id,
        nombre: `${r.nombre || ''}${r.apellido ? ` ${r.apellido}` : ''}`.trim(),
        deuda_pendiente: normalizeNumber(r.deuda_pendiente, 0),
        deuda_mas_90: normalizeNumber(r.deuda_mas_90, 0),
        dias_promedio_atraso: r.dias_promedio_atraso,
      })),
      alertas: insights?.items || [],
      alertas_resumen: insights?.summary || null,
    },
  }, REPORT_CACHE_MS);
}

module.exports = {
  resolveRange,
  resolveFilters,
  buildExecutiveReportData,
};
