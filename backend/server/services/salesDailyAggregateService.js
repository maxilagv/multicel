const logger = require('../lib/logger');
const { query, withTransaction } = require('../db/pg');

const DEFAULT_LOOKBACK_DAYS = 120;
const DEFAULT_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_STALE_AFTER_MINUTES = 60;

const aggregateState = {
  running: false,
  last_started_at: null,
  last_success_at: null,
  last_error: null,
};

let schedulerStarted = false;

function toIsoDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

function buildDateRange(fromStr, toStr) {
  const out = [];
  let cursor = fromStr;
  while (cursor && cursor <= toStr) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveRange({ from, to, lookbackDays = DEFAULT_LOOKBACK_DAYS } = {}) {
  const today = toIsoDate(new Date());
  const toStr = toIsoDate(to) || today;
  const fromStr = toIsoDate(from) || addDays(toStr, -(Math.max(1, Number(lookbackDays) || DEFAULT_LOOKBACK_DAYS) - 1));
  return {
    fromStr,
    toStr,
  };
}

function ensureDay(map, fecha) {
  if (!map.has(fecha)) {
    map.set(fecha, {
      fecha,
      total_ventas: 0,
      total_deudas_iniciales: 0,
      total_gastos: 0,
      total_compras: 0,
      total_pagos_clientes: 0,
      total_pagos_proveedores: 0,
      cantidad_ventas: 0,
      ticket_promedio: 0,
      margen_total: 0,
    });
  }
  return map.get(fecha);
}

async function refreshSalesDailyAggregates({ from, to, lookbackDays } = {}) {
  const { fromStr, toStr } = resolveRange({ from, to, lookbackDays });
  aggregateState.running = true;
  aggregateState.last_started_at = new Date().toISOString();

  try {
    const [ventasRows, margenRows, deudasRows, gastosRows, comprasRows, pagosRows, pagosProvRows] =
      await Promise.all([
        query(
          `SELECT DATE(fecha) AS fecha,
                  COUNT(*) AS cantidad_ventas,
                  COALESCE(SUM(neto), 0) AS total_ventas
             FROM ventas
            WHERE estado_pago <> 'cancelado'
              AND oculto = 0
              AND DATE(fecha) >= DATE($1)
              AND DATE(fecha) <= DATE($2)
            GROUP BY DATE(fecha)`,
          [fromStr, toStr]
        ).then((res) => res.rows || []),
        query(
          `SELECT DATE(v.fecha) AS fecha,
                  COALESCE(
                    SUM(
                      COALESCE(d.base_sin_iva, d.subtotal, 0) -
                      (COALESCE(d.costo_unitario_pesos, 0) * COALESCE(d.cantidad, 0))
                    ),
                    0
                  ) AS margen_total
             FROM ventas v
             LEFT JOIN ventas_detalle d ON d.venta_id = v.id
            WHERE v.estado_pago <> 'cancelado'
              AND v.oculto = 0
              AND DATE(v.fecha) >= DATE($1)
              AND DATE(v.fecha) <= DATE($2)
            GROUP BY DATE(v.fecha)`,
          [fromStr, toStr]
        ).then((res) => res.rows || []),
        query(
          `SELECT DATE(fecha) AS fecha,
                  COALESCE(SUM(monto), 0) AS total_deudas_iniciales
             FROM clientes_deudas_iniciales_pagos
            WHERE DATE(fecha) >= DATE($1)
              AND DATE(fecha) <= DATE($2)
            GROUP BY DATE(fecha)`,
          [fromStr, toStr]
        ).then((res) => res.rows || []),
        query(
          `SELECT DATE(fecha) AS fecha,
                  COALESCE(SUM(monto), 0) AS total_gastos
             FROM gastos
            WHERE DATE(fecha) >= DATE($1)
              AND DATE(fecha) <= DATE($2)
            GROUP BY DATE(fecha)`,
          [fromStr, toStr]
        ).then((res) => res.rows || []),
        query(
          `SELECT DATE(fecha) AS fecha,
                  COALESCE(SUM(total_costo), 0) AS total_compras
             FROM compras
            WHERE estado <> 'cancelado'
              AND DATE(fecha) >= DATE($1)
              AND DATE(fecha) <= DATE($2)
            GROUP BY DATE(fecha)`,
          [fromStr, toStr]
        ).then((res) => res.rows || []),
        query(
          `SELECT DATE(fecha) AS fecha,
                  COALESCE(SUM(monto), 0) AS total_pagos_clientes
             FROM pagos
            WHERE DATE(fecha) >= DATE($1)
              AND DATE(fecha) <= DATE($2)
            GROUP BY DATE(fecha)`,
          [fromStr, toStr]
        ).then((res) => res.rows || []),
        query(
          `SELECT DATE(fecha) AS fecha,
                  COALESCE(SUM(monto), 0) AS total_pagos_proveedores
             FROM pagos_proveedores
            WHERE DATE(fecha) >= DATE($1)
              AND DATE(fecha) <= DATE($2)
            GROUP BY DATE(fecha)`,
          [fromStr, toStr]
        ).then((res) => res.rows || []),
      ]);

    const rowsByDate = new Map();
    for (const fecha of buildDateRange(fromStr, toStr)) {
      ensureDay(rowsByDate, fecha);
    }

    for (const row of ventasRows) {
      const item = ensureDay(rowsByDate, toIsoDate(row.fecha));
      item.cantidad_ventas = normalizeNumber(row.cantidad_ventas);
      item.total_ventas = normalizeNumber(row.total_ventas);
    }
    for (const row of margenRows) {
      ensureDay(rowsByDate, toIsoDate(row.fecha)).margen_total = normalizeNumber(
        row.margen_total
      );
    }
    for (const row of deudasRows) {
      ensureDay(rowsByDate, toIsoDate(row.fecha)).total_deudas_iniciales = normalizeNumber(
        row.total_deudas_iniciales
      );
    }
    for (const row of gastosRows) {
      ensureDay(rowsByDate, toIsoDate(row.fecha)).total_gastos = normalizeNumber(
        row.total_gastos
      );
    }
    for (const row of comprasRows) {
      ensureDay(rowsByDate, toIsoDate(row.fecha)).total_compras = normalizeNumber(
        row.total_compras
      );
    }
    for (const row of pagosRows) {
      ensureDay(rowsByDate, toIsoDate(row.fecha)).total_pagos_clientes = normalizeNumber(
        row.total_pagos_clientes
      );
    }
    for (const row of pagosProvRows) {
      ensureDay(rowsByDate, toIsoDate(row.fecha)).total_pagos_proveedores = normalizeNumber(
        row.total_pagos_proveedores
      );
    }

    const rows = Array.from(rowsByDate.values()).map((row) => ({
      ...row,
      ticket_promedio:
        row.cantidad_ventas > 0 ? row.total_ventas / row.cantidad_ventas : 0,
    }));

    await withTransaction(async (client) => {
      await client.query(
        `DELETE FROM ventas_agregadas_diarias
          WHERE fecha >= $1
            AND fecha <= $2`,
        [fromStr, toStr]
      );

      if (!rows.length) return;

      const values = [];
      const placeholders = rows.map((row, idx) => {
        const base = idx * 10;
        values.push(
          row.fecha,
          row.total_ventas,
          row.total_deudas_iniciales,
          row.total_gastos,
          row.total_compras,
          row.total_pagos_clientes,
          row.total_pagos_proveedores,
          row.cantidad_ventas,
          row.ticket_promedio,
          row.margen_total
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`;
      });

      await client.query(
        `INSERT INTO ventas_agregadas_diarias (
          fecha,
          total_ventas,
          total_deudas_iniciales,
          total_gastos,
          total_compras,
          total_pagos_clientes,
          total_pagos_proveedores,
          cantidad_ventas,
          ticket_promedio,
          margen_total
        ) VALUES ${placeholders.join(', ')}`,
        values
      );
    });

    aggregateState.last_success_at = new Date().toISOString();
    aggregateState.last_error = null;
    return rows;
  } catch (err) {
    aggregateState.last_error = err?.message || 'aggregate_refresh_error';
    throw err;
  } finally {
    aggregateState.running = false;
  }
}

async function ensureSalesDailyAggregatesFresh({ from, to, staleAfterMinutes } = {}) {
  const { fromStr, toStr } = resolveRange({ from, to });
  const maxAgeMinutes = Math.max(
    1,
    Number(staleAfterMinutes || process.env.SALES_AGGREGATES_STALE_AFTER_MINUTES || DEFAULT_STALE_AFTER_MINUTES)
  );

  const { rows } = await query(
    `SELECT COUNT(*) AS total_rows, MAX(updated_at) AS last_updated_at
       FROM ventas_agregadas_diarias
      WHERE fecha >= $1
        AND fecha <= $2`,
    [fromStr, toStr]
  );

  const meta = rows?.[0] || {};
  const totalRows = normalizeNumber(meta.total_rows);
  const lastUpdatedAt = meta.last_updated_at ? new Date(meta.last_updated_at) : null;
  const stale =
    !lastUpdatedAt ||
    Number.isNaN(lastUpdatedAt.getTime()) ||
    Date.now() - lastUpdatedAt.getTime() > maxAgeMinutes * 60 * 1000;

  if (!totalRows || stale) {
    await refreshSalesDailyAggregates({ from: fromStr, to: toStr });
  }

  return { fromStr, toStr };
}

async function listSalesDailyAggregates({ from, to } = {}) {
  const { fromStr, toStr } = await ensureSalesDailyAggregatesFresh({ from, to });
  const { rows } = await query(
    `SELECT fecha,
            total_ventas,
            total_deudas_iniciales,
            total_gastos,
            total_compras,
            total_pagos_clientes,
            total_pagos_proveedores,
            cantidad_ventas,
            ticket_promedio,
            margen_total,
            updated_at
       FROM ventas_agregadas_diarias
      WHERE fecha >= $1
        AND fecha <= $2
      ORDER BY fecha`,
    [fromStr, toStr]
  );
  return rows || [];
}

async function getSalesDailyAggregateTotals({ from, to } = {}) {
  const { fromStr, toStr } = await ensureSalesDailyAggregatesFresh({ from, to });
  const { rows } = await query(
    `SELECT COALESCE(SUM(total_ventas), 0) AS total_ventas,
            COALESCE(SUM(total_deudas_iniciales), 0) AS total_deudas_iniciales,
            COALESCE(SUM(total_gastos), 0) AS total_gastos,
            COALESCE(SUM(total_compras), 0) AS total_compras,
            COALESCE(SUM(total_pagos_clientes), 0) AS total_pagos_clientes,
            COALESCE(SUM(total_pagos_proveedores), 0) AS total_pagos_proveedores,
            COALESCE(SUM(cantidad_ventas), 0) AS cantidad_ventas,
            COALESCE(SUM(margen_total), 0) AS margen_total
       FROM ventas_agregadas_diarias
      WHERE fecha >= $1
        AND fecha <= $2`,
    [fromStr, toStr]
  );
  return rows?.[0] || null;
}

function getSalesDailyAggregateStatus() {
  return {
    running: aggregateState.running,
    last_started_at: aggregateState.last_started_at,
    last_success_at: aggregateState.last_success_at,
    last_error: aggregateState.last_error,
  };
}

function startSalesDailyAggregateScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const intervalMs = Math.max(
    60_000,
    Number(process.env.SALES_AGGREGATES_REFRESH_MS || DEFAULT_REFRESH_INTERVAL_MS)
  );
  const lookbackDays = Math.max(
    7,
    Number(process.env.SALES_AGGREGATES_LOOKBACK_DAYS || DEFAULT_LOOKBACK_DAYS)
  );

  const runRefresh = () =>
    refreshSalesDailyAggregates({ lookbackDays }).catch((err) => {
      logger.error({ err: err?.message || err }, '[sales-aggregates] refresh error');
    });

  runRefresh();
  const timer = setInterval(runRefresh, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = {
  refreshSalesDailyAggregates,
  ensureSalesDailyAggregatesFresh,
  listSalesDailyAggregates,
  getSalesDailyAggregateTotals,
  getSalesDailyAggregateStatus,
  startSalesDailyAggregateScheduler,
};
