const { query } = require('../db/pg');
const categoryRepo = require('../db/repositories/categoryRepository');
const logger = require('../lib/logger');
const { getJson: getRuntimeJson, setJson: setRuntimeJson } = require('./runtimeStore');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const LOCAL_AI_URL = process.env.LOCAL_AI_URL;
const AI_PY_FORECAST = process.env.AI_PY_FORECAST === 'true';
const AI_PY_PRICING = process.env.AI_PY_PRICING === 'true';
const AI_PY_TIMEOUT_MS = Number(process.env.AI_PY_TIMEOUT_MS || 5000);
const FORECAST_CACHE_MS = Number(process.env.AI_FORECAST_CACHE_MS || 60000);
const INSIGHTS_CACHE_MS = Number(process.env.AI_INSIGHTS_CACHE_MS || 30000);
const CONFIG_CACHE_MS = Number(process.env.AI_ALERTS_CONFIG_CACHE_MS || 60000);

function toNumber(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const FORECAST_ALPHA = clamp(toNumber(process.env.AI_FORECAST_ALPHA, 0.35), 0.05, 0.95);
const FORECAST_BETA = clamp(toNumber(process.env.AI_FORECAST_BETA, 0.2), 0.01, 0.6);
const FORECAST_AVG_WINDOW = Math.max(3, Number(process.env.AI_FORECAST_AVG_WINDOW || 7));
const DEFAULT_STOCK_TARGET_DAYS = Math.max(7, Number(process.env.AI_STOCK_TARGET_DAYS || 30));
const DEFAULT_LEAD_TIME_DAYS = Math.max(1, Number(process.env.AI_LEAD_TIME_DAYS || 7));
const DEFAULT_SERVICE_Z = clamp(toNumber(process.env.AI_SERVICE_LEVEL_Z, 1.28), 0.5, 3);
const DEFAULT_OVERSTOCK_DAYS = Math.max(30, Number(process.env.AI_OVERSTOCK_DAYS || 90));
const DEFAULT_OVERSTOCK_MIN_DAILY_AVG = Math.max(0, Number(process.env.AI_OVERSTOCK_MIN_DAILY_AVG || 0.05));
const DEFAULT_OVERSTOCK_MIN_UNITS = Math.max(0, Number(process.env.AI_OVERSTOCK_MIN_UNITS || 2));
const DEFAULT_PRICE_ALERT_PCT = clamp(toNumber(process.env.AI_PRICE_ALERT_PCT, 0.08), 0.01, 0.5);
const DEFAULT_PRICE_ALERT_ABS = Math.max(0, Number(process.env.AI_PRICE_ALERT_ABS || 0));
const DEFAULT_STOCKOUT_DAYS_HIGH = Math.max(1, Number(process.env.AI_STOCKOUT_DAYS_HIGH || 3));
const DEFAULT_STOCKOUT_DAYS_MED = Math.max(
  DEFAULT_STOCKOUT_DAYS_HIGH + 1,
  Number(process.env.AI_STOCKOUT_DAYS_MED || 7)
);
const SALES_AGGREGATION_MODE = String(process.env.AI_SALES_AGGREGATION_MODE || 'auto')
  .trim()
  .toLowerCase();
const SALES_MODE_CACHE_MS = Math.max(5000, Number(process.env.AI_SALES_MODE_CACHE_MS || 30000));
const DELIVERED_MODE_MIN_RATIO = clamp(
  toNumber(process.env.AI_DELIVERED_MODE_MIN_RATIO, 0.6),
  0.05,
  1
);
const DELIVERED_MODE_MIN_COUNT = Math.max(
  1,
  Number(process.env.AI_DELIVERED_MODE_MIN_COUNT || 20)
);

function inMarks(start, count) {
  return Array.from({ length: count }, (_, idx) => `$${start + idx}`).join(', ');
}

function buildCacheKey(namespace, key) {
  return `ai:${namespace}:${key}`;
}

async function getCache(namespace, key) {
  return getRuntimeJson(buildCacheKey(namespace, key));
}

async function setCache(namespace, key, data, ttlMs) {
  // Evict la entrada más antigua cuando se supera el límite
  await setRuntimeJson(buildCacheKey(namespace, key), data, ttlMs);
  return data;
}

function toIsoDateLocal(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildDateRange(historyDays) {
  const days = Math.max(1, Number(historyDays) || 1);
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(toIsoDateLocal(d));
  }
  return out;
}

function chooseSalesAggregationMode({
  configuredMode = SALES_AGGREGATION_MODE,
  deliveredCount = 0,
  totalCount = 0,
  minDeliveredRatio = DELIVERED_MODE_MIN_RATIO,
  minDeliveredCount = DELIVERED_MODE_MIN_COUNT,
} = {}) {
  const mode = String(configuredMode || 'auto').trim().toLowerCase();
  if (mode === 'all') return 'all';
  if (mode === 'delivered') return 'delivered';
  const total = Math.max(0, Number(totalCount || 0));
  const delivered = Math.max(0, Number(deliveredCount || 0));
  if (total <= 0) return 'all';
  const ratio = delivered / total;
  return delivered >= minDeliveredCount && ratio >= minDeliveredRatio ? 'delivered' : 'all';
}

function qualifyColumn(alias, column) {
  return alias ? `${alias}.${column}` : column;
}

function buildSalesAggregationStrategy(mode, alias = 'v') {
  const selectedMode = String(mode || 'all').trim().toLowerCase() === 'delivered' ? 'delivered' : 'all';
  const dateExpr =
    selectedMode === 'delivered'
      ? `COALESCE(${qualifyColumn(alias, 'fecha_entrega')}, ${qualifyColumn(alias, 'fecha')})`
      : qualifyColumn(alias, 'fecha');
  const conditions =
    selectedMode === 'delivered'
      ? [
          `${qualifyColumn(alias, 'estado_pago')} <> 'cancelado'`,
          `${qualifyColumn(alias, 'oculto')} = 0`,
          `${qualifyColumn(alias, 'estado_entrega')} = 'entregado'`,
        ]
      : [
          `${qualifyColumn(alias, 'estado_pago')} <> 'cancelado'`,
          `${qualifyColumn(alias, 'oculto')} = 0`,
        ];

  return {
    mode: selectedMode,
    dateExpr,
    whereSql: conditions.join('\n        AND '),
  };
}

async function resolveSalesAggregationStrategy({ historyDays = 90 } = {}) {
  const configuredMode = String(SALES_AGGREGATION_MODE || 'auto').trim().toLowerCase();
  if (configuredMode === 'all' || configuredMode === 'delivered') {
    return buildSalesAggregationStrategy(configuredMode, 'v');
  }

  const cacheKey = `sales-mode:${Math.max(1, Number(historyDays) || 1)}`;
  const cached = await getCache('sales-mode', cacheKey);
  if (cached) return cached;

  const dateKeys = buildDateRange(historyDays);
  const startDate = dateKeys[0];
  const { rows } = await query(
    `SELECT COUNT(*)::float AS total_count,
            SUM(CASE WHEN estado_entrega = 'entregado' THEN 1 ELSE 0 END)::float AS delivered_count
       FROM ventas
      WHERE estado_pago <> 'cancelado'
        AND oculto = 0
        AND date(fecha, 'localtime') >= date($1)`,
    [startDate]
  );
  const row = rows?.[0] || {};
  const selectedMode = chooseSalesAggregationMode({
    configuredMode,
    deliveredCount: row.delivered_count,
    totalCount: row.total_count,
  });
  return setCache(
    'sales-mode',
    cacheKey,
    buildSalesAggregationStrategy(selectedMode, 'v'),
    SALES_MODE_CACHE_MS
  );
}

function withTimeout(promise, ms = AI_PY_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('AI Python timeout')), ms);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function httpRequest(rawUrl, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(rawUrl);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options = {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers,
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
            text: data,
          });
        });
      });

      req.on('error', (err) => reject(err));

      if (body) req.write(body);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function getProductsBasic(categoryId, { includeDescendants = false } = {}) {
  const params = [];
  const where = [];
  if (categoryId != null) {
    const ids = await categoryRepo.getCategoryFilterIds(categoryId, {
      includeDescendants: Boolean(includeDescendants),
      onlyActive: true,
    });
    if (!ids.length) return [];
    const start = params.length + 1;
    params.push(...ids);
    where.push(`categoria_id IN (${inMarks(start, ids.length)})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT id,
            nombre,
            precio_costo::float AS precio_costo,
            precio_venta::float AS precio_venta,
            stock_minimo,
            stock_maximo,
            reorden,
            categoria_id,
            activo
       FROM productos
       ${whereSql}`,
    params
  );
  return rows;
}

async function getInventoryMap() {
  const { rows } = await query(
    `SELECT producto_id AS id, COALESCE(cantidad_disponible,0) AS disponible FROM inventario`
  );
  const map = new Map();
  for (const r of rows) map.set(Number(r.id), toNumber(r.disponible, 0));
  return map;
}

async function getSalesQtyByProduct(historyDays = 90, categoryId, { includeDescendants = false } = {}) {
  const dateKeys = buildDateRange(historyDays);
  const startDate = dateKeys[0];
  const params = [startDate];
  const salesStrategy = await resolveSalesAggregationStrategy({ historyDays });
  let categoryFilter = '';
  if (categoryId != null) {
    const ids = await categoryRepo.getCategoryFilterIds(categoryId, {
      includeDescendants: Boolean(includeDescendants),
      onlyActive: true,
    });
    if (!ids.length) return new Map();
    const start = params.length + 1;
    params.push(...ids);
    categoryFilter = `AND p.categoria_id IN (${inMarks(start, ids.length)})`;
  }
  const { rows } = await query(
    `SELECT vd.producto_id AS id, SUM(vd.cantidad)::float AS unidades
       FROM ventas_detalle vd
       JOIN ventas v ON v.id = vd.venta_id
       JOIN productos p ON p.id = vd.producto_id
      WHERE ${salesStrategy.whereSql}
        AND date(${salesStrategy.dateExpr}, 'localtime') >= date($1)
        ${categoryFilter}
       GROUP BY vd.producto_id`,
    params
  );
  const map = new Map();
  for (const r of rows) map.set(Number(r.id), toNumber(r.unidades, 0));
  return map;
}

async function getSalesSeriesBundle({ historyDays = 90, categoryId, includeDescendants = false } = {}) {
  const dateKeys = buildDateRange(historyDays);
  const startDate = dateKeys[0];
  const params = [startDate];
  const salesStrategy = await resolveSalesAggregationStrategy({ historyDays });
  let categoryFilter = '';
  if (categoryId != null) {
    const ids = await categoryRepo.getCategoryFilterIds(categoryId, {
      includeDescendants: Boolean(includeDescendants),
      onlyActive: true,
    });
    if (!ids.length) return { dateKeys, seriesMap: new Map() };
    const start = params.length + 1;
    params.push(...ids);
    categoryFilter = `AND p.categoria_id IN (${inMarks(start, ids.length)})`;
  }
  const { rows } = await query(
    `SELECT vd.producto_id AS id,
            date(${salesStrategy.dateExpr}, 'localtime') AS dia,
            SUM(vd.cantidad)::float AS unidades
       FROM ventas_detalle vd
       JOIN ventas v ON v.id = vd.venta_id
       JOIN productos p ON p.id = vd.producto_id
      WHERE ${salesStrategy.whereSql}
        AND date(${salesStrategy.dateExpr}, 'localtime') >= date($1)
        ${categoryFilter}
      GROUP BY vd.producto_id, date(${salesStrategy.dateExpr}, 'localtime')
      ORDER BY vd.producto_id, date(${salesStrategy.dateExpr}, 'localtime')`,
    params
  );
  const seriesMap = new Map();
    for (const r of rows) {
      const id = Number(r.id);
      const day = toIsoDateLocal(r.dia);
      if (!day) continue;
      const perProduct = seriesMap.get(id) || new Map();
      perProduct.set(day, toNumber(r.unidades, 0));
      seriesMap.set(id, perProduct);
    }
  return { dateKeys, seriesMap };
}

function buildSeriesFromMap(seriesMap, dateKeys, productId) {
  const perProduct = seriesMap.get(productId);
  return dateKeys.map((day) => (perProduct ? toNumber(perProduct.get(day), 0) : 0));
}

function computeForecastSeries(series, horizonDays, alpha = FORECAST_ALPHA, beta = FORECAST_BETA) {
  const horizon = Math.max(1, Number(horizonDays) || 1);
  if (!series.length) {
    return { forecast: Array.from({ length: horizon }, () => 0), level: 0, trend: 0 };
  }
  let level = series[0];
  let trend = series.length > 1 ? series[1] - series[0] : 0;
  const avg = mean(series);
  const maxTrend = Math.max(1, avg * 1.5);
  trend = clamp(trend, -maxTrend, maxTrend);

  for (let i = 1; i < series.length; i += 1) {
    const value = series[i];
    const prevLevel = level;
    level = alpha * value + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  const forecast = [];
  for (let i = 1; i <= horizon; i += 1) {
    forecast.push(Math.max(0, level + i * trend));
  }

  return { forecast, level, trend };
}

function computeDailyAverage({ series, forecast, avgWindow = FORECAST_AVG_WINDOW } = {}) {
  if (Array.isArray(forecast) && forecast.length) {
    const window = Math.min(Math.max(1, avgWindow), forecast.length);
    return mean(forecast.slice(0, window));
  }
  const base = Array.isArray(series) ? series : [];
  if (!base.length) return 0;
  const window = Math.min(Math.max(1, avgWindow), base.length);
  const start = Math.max(0, base.length - window);
  return mean(base.slice(start));
}

function computeSafetyStock(series, leadTimeDays = DEFAULT_LEAD_TIME_DAYS, serviceZ = DEFAULT_SERVICE_Z) {
  if (!series.length) return 0;
  const sigma = stddev(series);
  if (!sigma) return 0;
  const lt = Math.max(1, Number(leadTimeDays) || 1);
  return serviceZ * sigma * Math.sqrt(lt);
}

async function getInsightsConfig() {
  const cached = await getCache('config', 'insights');
  if (cached) return cached;

  const { rows } = await query(
    `SELECT clave, valor_num FROM parametros_sistema
      WHERE clave IN (
        'deuda_umbral_rojo',
        'ai_price_alert_pct',
        'ai_price_alert_abs',
        'ai_overstock_days',
        'ai_overstock_min_daily_avg',
        'ai_overstock_min_units',
        'ai_stockout_days_high',
        'ai_stockout_days_med'
      )`
  );

  const map = new Map();
  for (const r of rows) {
    if (!r || !r.clave) continue;
    map.set(String(r.clave), r.valor_num);
  }

  const debtThreshold = toNumber(
    map.get('deuda_umbral_rojo'),
    toNumber(process.env.AI_DEBT_ALERT_THRESHOLD, 0)
  );

  const stockoutDaysHigh = Math.max(
    1,
    toNumber(map.get('ai_stockout_days_high'), DEFAULT_STOCKOUT_DAYS_HIGH)
  );
  const stockoutDaysMed = Math.max(
    stockoutDaysHigh + 1,
    toNumber(map.get('ai_stockout_days_med'), DEFAULT_STOCKOUT_DAYS_MED)
  );

  const config = {
    debtThreshold,
    priceAlertPct: clamp(toNumber(map.get('ai_price_alert_pct'), DEFAULT_PRICE_ALERT_PCT), 0.01, 0.5),
    priceAlertAbs: Math.max(0, toNumber(map.get('ai_price_alert_abs'), DEFAULT_PRICE_ALERT_ABS)),
    overstockDays: Math.max(30, toNumber(map.get('ai_overstock_days'), DEFAULT_OVERSTOCK_DAYS)),
    overstockMinDailyAvg: Math.max(
      0,
      toNumber(map.get('ai_overstock_min_daily_avg'), DEFAULT_OVERSTOCK_MIN_DAILY_AVG)
    ),
    overstockMinUnits: Math.max(
      0,
      toNumber(map.get('ai_overstock_min_units'), DEFAULT_OVERSTOCK_MIN_UNITS)
    ),
    stockoutDaysHigh,
    stockoutDaysMed,
  };

  return setCache('config', 'insights', config, CONFIG_CACHE_MS);
}
async function callPythonForecast({ products, historyDays, forecastDays, seriesBundle }) {
  if (!LOCAL_AI_URL) throw new Error('LOCAL_AI_URL not configured');

  const bundle =
    seriesBundle ||
    (await getSalesSeriesBundle({
      historyDays,
    }));
  const { dateKeys, seriesMap } = bundle;

  const series = products
    .filter((p) => p.activo !== false)
    .map((p) => ({
      producto_id: p.id,
      producto_nombre: p.nombre,
      history: dateKeys.map((day) => ({
        fecha: day,
        unidades: seriesMap.get(p.id)?.get(day) ?? 0,
      })),
    }));

  const payload = JSON.stringify({
    history_days: Math.max(1, Number(historyDays)),
    horizon_days: Number(forecastDays),
    series,
  });

  const url = `${LOCAL_AI_URL.replace(/\/$/, '')}/forecast`;

  const res = await withTimeout(
    httpRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      body: payload,
    })
  );

  if (!res.ok) {
    throw new Error(`AI Python forecast error: ${res.status} ${res.text || ''}`.trim());
  }

  const data = JSON.parse(res.text || '{}');
  if (!data || !Array.isArray(data.forecasts)) {
    throw new Error('AI Python forecast: invalid response');
  }
  return data.forecasts;
}

async function buildForecastList({
  forecastDays = 14,
  historyDays = 90,
  stockTargetDays,
  categoryId,
  includeDescendants = false,
} = {}) {
  const targetDays = Math.max(7, toNumber(stockTargetDays, DEFAULT_STOCK_TARGET_DAYS));
  const cacheKey = `forecast:${historyDays}:${forecastDays}:${targetDays}:${categoryId ?? 'all'}:${includeDescendants ? 'tree' : 'node'}`;
  const cached = await getCache('forecast', cacheKey);
  if (cached) return cached;

  const [products, invMap, seriesBundle] = await Promise.all([
    getProductsBasic(categoryId, { includeDescendants }),
    getInventoryMap(),
    getSalesSeriesBundle({ historyDays, categoryId, includeDescendants }),
  ]);

  let pyDailyAvgById = null;
  if (AI_PY_FORECAST && LOCAL_AI_URL) {
    try {
      const forecasts = await callPythonForecast({ products, historyDays, forecastDays, seriesBundle });
      pyDailyAvgById = new Map();
      for (const f of forecasts) {
        if (f && typeof f.producto_id !== 'undefined' && typeof f.daily_avg === 'number') {
          pyDailyAvgById.set(Number(f.producto_id), Number(f.daily_avg));
        }
      }
    } catch (err) {
      logger.error({ err: err }, 'AI Python forecast failed, using local forecast:');
    }
  }

  const { dateKeys, seriesMap } = seriesBundle;
  const list = products
    .filter((p) => p.activo !== false)
    .map((p) => {
      const series = buildSeriesFromMap(seriesMap, dateKeys, p.id);
      const historyUnits = series.reduce((acc, v) => acc + toNumber(v, 0), 0);
      const { forecast } = computeForecastSeries(series, forecastDays);
      const fallbackAvg = computeDailyAverage({ series, forecast });
      const dailyAvgRaw =
        pyDailyAvgById && pyDailyAvgById.has(p.id)
          ? toNumber(pyDailyAvgById.get(p.id), fallbackAvg)
          : fallbackAvg;
      const dailyAvg = Math.max(0, dailyAvgRaw);

      const available = toNumber(invMap.get(p.id), 0);
      const forecastUnits = dailyAvg * Number(forecastDays);
      const coberturaDias = dailyAvg > 0 ? available / dailyAvg : Infinity;
      const minDesired = Math.max(0, toNumber(p.stock_minimo, 0), toNumber(p.reorden, 0));
      const safetyStock = computeSafetyStock(series);
      let targetStock = dailyAvg > 0 ? dailyAvg * targetDays + safetyStock : minDesired;
      if (targetStock < minDesired) targetStock = minDesired;
      const sugeridoReponer = Math.max(0, targetStock - available);

      return {
        producto_id: p.id,
        producto_nombre: p.nombre,
        daily_avg: Number(dailyAvg.toFixed(4)),
        history_units: Number(historyUnits.toFixed(2)),
        forecast_units: Number(forecastUnits.toFixed(2)),
        disponible: available,
        cobertura_dias: Number((coberturaDias === Infinity ? 9999 : coberturaDias).toFixed(2)),
        sugerido_reponer: Math.ceil(sugeridoReponer),
      };
    })
    .sort((a, b) => b.daily_avg - a.daily_avg);

  return setCache('forecast', cacheKey, list, FORECAST_CACHE_MS);
}

async function forecastByProductSimple({
  forecastDays = 14,
  historyDays = 90,
  limit = 100,
  stockTargetDays,
  categoryId,
  includeDescendants = false,
}) {
  const list = await buildForecastList({ forecastDays, historyDays, stockTargetDays, categoryId, includeDescendants });
  const finalLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  return list.slice(0, finalLimit);
}

async function forecastByProduct({
  forecastDays = 14,
  historyDays = 90,
  limit = 100,
  stockTargetDays,
  categoryId,
  includeDescendants = false,
}) {
  const list = await buildForecastList({ forecastDays, historyDays, stockTargetDays, categoryId, includeDescendants });
  const finalLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  return list.slice(0, finalLimit);
}

async function stockouts({ days = 14, historyDays = 90, limit = 100, categoryId, includeDescendants = false }) {
  const forecast = await forecastByProduct({
    forecastDays: days,
    historyDays,
    limit: 5000,
    categoryId,
    includeDescendants,
  });
  const atRisk = forecast
    .filter((r) => r.daily_avg > 0 && r.disponible / r.daily_avg < Number(days))
    .map((r) => ({
      ...r,
      dias_hasta_quiebre: Number((r.disponible / r.daily_avg).toFixed(2)),
    }))
    .sort((a, b) => a.dias_hasta_quiebre - b.dias_hasta_quiebre)
    .slice(0, Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500));
  return atRisk;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

async function dailyTotals({ table, valueCol, periodDays = 90, filter = '', dateExpr = 'fecha' }) {
  const { rows } = await query(
    `SELECT date(${dateExpr}, 'localtime') AS dia, SUM(${valueCol})::float AS total
       FROM ${table}
      WHERE date(${dateExpr}, 'localtime') >= date('now', '-' || $1 || ' days') ${filter}
      GROUP BY date(${dateExpr}, 'localtime')
      ORDER BY date(${dateExpr}, 'localtime')`,
    [String(periodDays)]
  );
  return rows.map((r) => ({ dia: r.dia, total: toNumber(r.total, 0) }));
}

async function dailySalesTotals({ periodDays = 90 } = {}) {
  const salesStrategy = await resolveSalesAggregationStrategy({ historyDays: periodDays });
  const tableStrategy = buildSalesAggregationStrategy(salesStrategy.mode, '');
  return dailyTotals({
    table: 'ventas',
    valueCol: 'neto',
    periodDays,
    dateExpr: tableStrategy.dateExpr,
    filter: `AND ${tableStrategy.whereSql}`,
  });
}

async function anomalies({ scope = 'sales', period = 90, sigma = 3 }) {
  const k = Number(sigma || process.env.AI_ANOMALY_SIGMA || 3);
  const out = {};
  if (scope === 'sales' || scope === 'both') {
    const sales = await dailySalesTotals({ periodDays: period });
    const vals = sales.map((r) => r.total);
    const m = mean(vals);
    const s = stddev(vals);
    out.sales = sales
      .map((r) => ({ ...r, z: s ? (r.total - m) / s : 0 }))
      .filter((r) => Math.abs(r.z) >= k)
      .map((r) => ({ dia: r.dia, total: r.total, z: Number(r.z.toFixed(2)), tipo: r.z >= 0 ? 'alto' : 'bajo' }));
  }
  if (scope === 'expenses' || scope === 'both') {
    const gastos = await dailyTotals({ table: 'gastos', valueCol: 'monto', periodDays: period });
    const vals = gastos.map((r) => r.total);
    const m = mean(vals);
    const s = stddev(vals);
    out.expenses = gastos
      .map((r) => ({ ...r, z: s ? (r.total - m) / s : 0 }))
      .filter((r) => Math.abs(r.z) >= k)
      .map((r) => ({ dia: r.dia, total: r.total, z: Number(r.z.toFixed(2)), tipo: r.z >= 0 ? 'alto' : 'bajo' }));
  }
  return out;
}

async function forecastDetail({ productoId, historyDays = 90, forecastDays = 14 }) {
  const id = Number(productoId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Producto inválido');
  }
  const { rows: prodRows } = await query(
    `SELECT id, nombre FROM productos WHERE id = $1`,
    [id]
  );
  if (!prodRows.length) {
    throw new Error('Producto no encontrado');
  }
  const producto = prodRows[0];

  const dateKeys = buildDateRange(historyDays);
  const startDate = dateKeys[0];
  const salesStrategy = await resolveSalesAggregationStrategy({ historyDays });

  const { rows } = await query(
    `SELECT date(${salesStrategy.dateExpr}, 'localtime') AS dia, SUM(vd.cantidad)::float AS unidades
       FROM ventas_detalle vd
       JOIN ventas v ON v.id = vd.venta_id
      WHERE vd.producto_id = $1
        AND ${salesStrategy.whereSql}
        AND date(${salesStrategy.dateExpr}, 'localtime') >= date($2)
       GROUP BY 1
       ORDER BY 1`,
    [id, startDate]
  );

  const salesByDay = new Map();
    for (const r of rows) {
      const day = toIsoDateLocal(r.dia);
      if (!day) continue;
      salesByDay.set(day, toNumber(r.unidades, 0));
    }

  const series = dateKeys.map((day) => toNumber(salesByDay.get(day), 0));
  const history = dateKeys.map((day, idx) => ({
    dia: day,
    unidades: series[idx],
  }));

  const { forecast } = computeForecastSeries(series, forecastDays);
  const dailyAvg = computeDailyAverage({ series, forecast });

    const lastDate = dateKeys.length
      ? new Date(`${dateKeys[dateKeys.length - 1]}T00:00:00`)
      : new Date();
    const forecastRows = forecast.map((units, idx) => {
      const d = new Date(lastDate);
      d.setDate(d.getDate() + idx + 1);
      return {
        dia: toIsoDateLocal(d),
        unidades: Number(units.toFixed(4)),
      };
    });

  return {
    producto_id: producto.id,
    producto_nombre: producto.nombre,
    daily_avg: Number(dailyAvg.toFixed(4)),
    history,
    forecast: forecastRows,
  };
}

async function pricingRecommendations({ margin, historyDays = 90, limit = 200 }) {
  const targetMargin = toNumber(margin ?? process.env.PRICING_TARGET_MARGIN, 0.3);
  const rotLow = toNumber(process.env.AI_ROTATION_LOW_PER_DAY, 0.05);
  const rotHigh = toNumber(process.env.AI_ROTATION_HIGH_PER_DAY, 0.5);
  const adjUp = toNumber(process.env.AI_PRICING_UP_ADJ, 0.05);
  const adjDown = toNumber(process.env.AI_PRICING_DOWN_ADJ, 0.05);

  const [products, salesMap] = await Promise.all([
    getProductsBasic(),
    getSalesQtyByProduct(historyDays),
  ]);

  const daysBase = Math.max(1, Number(historyDays));

  const buildSimpleRecs = () => {
    const recs = products
      .filter((p) => p.activo !== false)
      .map((p) => {
        const dailyAvg = toNumber(salesMap.get(p.id), 0) / daysBase;
        const costo = Math.max(0, toNumber(p.precio_costo, 0));
        const precioActual = Math.max(0, toNumber(p.precio_venta, 0));
        if (costo <= 0) {
          return {
            producto_id: p.id,
            producto_nombre: p.nombre,
            precio_actual: precioActual,
            precio_sugerido: precioActual,
            diferencia: 0,
            margen_estimado: null,
            rotacion_diaria: Number(dailyAvg.toFixed(4)),
          };
        }
        let base = Math.max(costo * (1 + targetMargin), costo);
        if (dailyAvg >= rotHigh) base *= 1 + adjUp;
        else if (dailyAvg > 0 && dailyAvg <= rotLow) base *= Math.max(0.01, 1 - adjDown);
        const sugerido = Number(base.toFixed(2));
        const dif = Number((sugerido - precioActual).toFixed(2));
        const impactoMargen = costo > 0 ? Number(((sugerido - costo) / sugerido).toFixed(3)) : null;
        return {
          producto_id: p.id,
          producto_nombre: p.nombre,
          precio_actual: precioActual,
          precio_sugerido: sugerido,
          diferencia: dif,
          margen_estimado: impactoMargen,
          rotacion_diaria: Number(dailyAvg.toFixed(4)),
        };
      })
      .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))
      .slice(0, Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500));

    return recs;
  };

  if (!AI_PY_PRICING || !LOCAL_AI_URL) {
    return buildSimpleRecs();
  }

  try {
    const productosPayload = products
      .filter((p) => p.activo !== false)
      .map((p) => {
        const dailyAvg = toNumber(salesMap.get(p.id), 0) / daysBase;
        return {
          producto_id: p.id,
          producto_nombre: p.nombre,
          precio_costo: Math.max(0, toNumber(p.precio_costo, 0)),
          precio_actual: Math.max(0, toNumber(p.precio_venta, 0)),
          rotacion_diaria: Number(dailyAvg.toFixed(4)),
        };
      });

    const payload = JSON.stringify({
      history_days: daysBase,
      target_margin: targetMargin,
      productos: productosPayload,
    });

    const url = `${LOCAL_AI_URL.replace(/\/$/, '')}/pricing`;

    const res = await withTimeout(
      httpRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        body: payload,
      })
    );

    if (!res.ok) {
      throw new Error(`AI Python pricing error: ${res.status} ${res.text || ''}`.trim());
    }

    const data = JSON.parse(res.text || '{}');
    if (!data || !Array.isArray(data.recomendaciones)) {
      throw new Error('AI Python pricing: invalid response');
    }

    const recs = data.recomendaciones
      .map((r) => {
        const base = productosPayload.find((p) => p.producto_id === r.producto_id);
        const costo = Math.max(0, toNumber(base?.precio_costo, 0));
        const precioActual = Math.max(0, toNumber(base?.precio_actual, 0));
        if (costo <= 0) {
          return {
            producto_id: r.producto_id,
            producto_nombre: r.producto_nombre,
            precio_actual: precioActual,
            precio_sugerido: precioActual,
            diferencia: 0,
            margen_estimado: null,
            rotacion_diaria: toNumber(base?.rotacion_diaria, 0),
          };
        }
        const precioSugerido = toNumber(r.precio_sugerido, 0);
        const margenEstimadoRaw = typeof r.margen_estimado === 'number' ? r.margen_estimado : null;
        const margenEstimado =
          margenEstimadoRaw != null
            ? margenEstimadoRaw
            : costo > 0 && precioSugerido > 0
            ? Number(((precioSugerido - costo) / precioSugerido).toFixed(3))
            : null;
        return {
          producto_id: r.producto_id,
          producto_nombre: r.producto_nombre,
          precio_actual: precioActual,
          precio_sugerido: precioSugerido,
          diferencia: toNumber(r.diferencia, 0),
          margen_estimado: margenEstimado,
          rotacion_diaria:
            typeof r.rotacion_diaria === 'number' ? r.rotacion_diaria : toNumber(base?.rotacion_diaria, 0),
        };
      })
      .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))
      .slice(0, Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500));

    return recs;
  } catch (err) {
    logger.error({ err: err }, 'AI Python pricing failed, falling back to simple pricing:');
    return buildSimpleRecs();
  }
}

async function insights({ historyDays = 90, forecastDays = 14, limit = 12 } = {}) {
  const finalLimit = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 50);
  const cacheKey = `insights:${historyDays}:${forecastDays}:${finalLimit}`;
  const cached = await getCache('insights', cacheKey);
  if (cached) return cached;

  const config = await getInsightsConfig();
  const [forecastList, stockBajoRows, pricingRecs, anomalyRes, debtRes] = await Promise.all([
    buildForecastList({ forecastDays, historyDays }),
    query(
      `SELECT producto_id, nombre, cantidad_disponible, stock_minimo
         FROM vista_stock_bajo
        ORDER BY (stock_minimo - cantidad_disponible) DESC
        LIMIT $1`,
      [Math.max(finalLimit, 10)]
    ).then((res) => res.rows || []),
    pricingRecommendations({ historyDays, limit: 200 }).catch(() => []),
    anomalies({ scope: 'sales', period: historyDays, sigma: 3 }).catch(() => ({ sales: [] })),
    query(
      `SELECT c.id AS cliente_id,
              c.nombre,
              c.apellido,
              v.deuda_pendiente,
              v.deuda_mas_90,
              v.dias_promedio_atraso
         FROM vista_deudas v
         JOIN clientes c ON c.id = v.cliente_id
        WHERE v.deuda_pendiente > 0
        ORDER BY v.deuda_pendiente DESC
        LIMIT $1`,
      [Math.max(finalLimit, 10)]
    ).then((res) => res.rows || []),
  ]);

  const items = [];
  const seen = new Set();
  const severityRank = { high: 3, medium: 2, low: 1 };

  const pushItem = (item) => {
    const entityKey = item.entity && item.entity.id != null ? item.entity.id : item.id;
    const key = `${item.type}:${entityKey}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  const stockoutCandidates = forecastList
    .filter((r) => r.daily_avg > 0 && r.cobertura_dias <= config.stockoutDaysMed)
    .sort((a, b) => a.cobertura_dias - b.cobertura_dias)
    .slice(0, Math.max(finalLimit, 8));

  for (const r of stockoutCandidates) {
    const daysToBreak = Number((r.disponible / r.daily_avg).toFixed(2));
    const severity =
      daysToBreak <= config.stockoutDaysHigh
        ? 'high'
        : daysToBreak <= config.stockoutDaysMed
        ? 'medium'
        : 'low';
    pushItem({
      id: `stockout-${r.producto_id}`,
      type: 'stockout',
      severity,
      title: 'Riesgo de quiebre',
      message: `Se queda sin stock en ~${daysToBreak} dias. Reponer ${r.sugerido_reponer} u.`,
      sort_value: 1000 - daysToBreak,
      entity: { type: 'producto', id: r.producto_id, name: r.producto_nombre },
      metrics: {
        dias_hasta_quiebre: daysToBreak,
        disponible: r.disponible,
        daily_avg: r.daily_avg,
      },
    });
  }

  for (const r of stockBajoRows || []) {
    const disponible = toNumber(r.cantidad_disponible, 0);
    const minimo = Math.max(0, toNumber(r.stock_minimo, 0));
    if (!minimo) continue;
    const ratio = disponible / minimo;
    const severity = disponible <= 0 ? 'high' : ratio < 0.5 ? 'medium' : 'low';
    pushItem({
      id: `stock-low-${r.producto_id}`,
      type: 'stock_low',
      severity,
      title: 'Stock bajo minimo',
      message: `Stock ${disponible} / minimo ${minimo}.`,
      sort_value: 900 - ratio * 100,
      entity: { type: 'producto', id: r.producto_id, name: r.nombre },
      metrics: { disponible, stock_minimo: minimo },
    });
  }

  const overstockCandidates = forecastList
    .filter((r) => {
      const avg = toNumber(r.daily_avg, 0);
      if (avg <= 0) return false;
      if (avg < config.overstockMinDailyAvg) return false;
      const histUnits = toNumber(
        typeof r.history_units !== 'undefined' ? r.history_units : avg * historyDays,
        0
      );
      if (histUnits < config.overstockMinUnits) return false;
      return r.cobertura_dias >= config.overstockDays;
    })
    .sort((a, b) => b.cobertura_dias - a.cobertura_dias)
    .slice(0, Math.max(finalLimit, 6));

  for (const r of overstockCandidates) {
    const coverage = Number(r.cobertura_dias || 0);
    const severity = coverage >= config.overstockDays * 1.5 ? 'high' : 'medium';
    pushItem({
      id: `overstock-${r.producto_id}`,
      type: 'overstock',
      severity,
      title: 'Sobre stock',
      message: `Cobertura ${coverage} dias con rotacion baja.`,
      sort_value: coverage,
      entity: { type: 'producto', id: r.producto_id, name: r.producto_nombre },
      metrics: { cobertura_dias: coverage, daily_avg: r.daily_avg, disponible: r.disponible },
    });
  }

  const priceCandidates = (pricingRecs || [])
    .filter((r) => {
      const precio = toNumber(r.precio_actual, 0);
      const sugerido = toNumber(r.precio_sugerido, 0);
      if (sugerido <= 0) return false;
      const diff = Math.abs(toNumber(r.diferencia, 0));
      if (!precio && !config.priceAlertAbs) return false;
      const pct = precio ? diff / precio : 0;
      return diff >= config.priceAlertAbs || pct >= config.priceAlertPct;
    })
    .sort((a, b) => Math.abs(toNumber(b.diferencia, 0)) - Math.abs(toNumber(a.diferencia, 0)))
    .slice(0, Math.max(finalLimit, 8));

  for (const r of priceCandidates) {
    const precio = Math.max(0, toNumber(r.precio_actual, 0));
    const diff = toNumber(r.diferencia, 0);
    const diffPct = precio ? Math.abs(diff) / precio : 0;
    const severity = diffPct >= 0.2 ? 'high' : diffPct >= 0.1 ? 'medium' : 'low';
    const sign = diff >= 0 ? '+' : '-';
    pushItem({
      id: `price-${r.producto_id}`,
      type: 'price',
      severity,
      title: 'Precio a revisar',
      message: `Sugerido $${Number(r.precio_sugerido).toFixed(2)} (${sign}$${Math.abs(diff).toFixed(2)}).`,
      sort_value: diffPct * 100,
      entity: { type: 'producto', id: r.producto_id, name: r.producto_nombre },
      metrics: {
        precio_actual: precio,
        precio_sugerido: r.precio_sugerido,
        diferencia: diff,
        margen_estimado: r.margen_estimado,
      },
    });
  }

  const debtThreshold = Math.max(0, toNumber(config.debtThreshold, 0));
  for (const r of debtRes || []) {
    const deuda = toNumber(r.deuda_pendiente, 0);
    if (debtThreshold && deuda < debtThreshold) continue;
    const highDebt = debtThreshold ? deuda >= debtThreshold * 2 : deuda >= 0;
    const hasLate = toNumber(r.deuda_mas_90, 0) > 0;
    const severity = highDebt || hasLate ? 'high' : 'medium';
    const name = `${r.nombre || ''}${r.apellido ? ` ${r.apellido}` : ''}`.trim() || 'Cliente';
    pushItem({
      id: `debt-${r.cliente_id}`,
      type: 'debt',
      severity,
      title: 'Deuda pendiente',
      message: `Saldo $${deuda.toFixed(2)}. Atraso prom: ${r.dias_promedio_atraso ?? '-'} dias.`,
      sort_value: deuda,
      entity: { type: 'cliente', id: r.cliente_id, name },
      metrics: {
        deuda_pendiente: deuda,
        deuda_mas_90: toNumber(r.deuda_mas_90, 0),
        dias_promedio_atraso: r.dias_promedio_atraso,
      },
    });
  }

  const anomaliesList = Array.isArray(anomalyRes?.sales) ? anomalyRes.sales : [];
  const anomalyCandidates = anomaliesList
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, Math.max(finalLimit, 4));

  for (const r of anomalyCandidates) {
    const severity = Math.abs(r.z) >= 4 ? 'high' : Math.abs(r.z) >= 3 ? 'medium' : 'low';
    pushItem({
      id: `anomaly-${r.dia}`,
      type: 'anomaly',
      severity,
      title: 'Anomalia de ventas',
      message: `Dia ${r.dia} con z-score ${r.z} (${r.tipo}).`,
      sort_value: Math.abs(r.z),
      entity: { type: 'dia', id: r.dia, name: r.dia },
      metrics: { total: r.total, z: r.z, tipo: r.tipo },
    });
  }

  items.sort((a, b) => {
    const sevDiff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
    if (sevDiff !== 0) return sevDiff;
    return (b.sort_value || 0) - (a.sort_value || 0);
  });

  const trimmed = items.slice(0, finalLimit).map((item) => {
    const { sort_value, ...rest } = item;
    return rest;
  });

  const summary = trimmed.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.severity === 'high') acc.high += 1;
      else if (item.severity === 'medium') acc.medium += 1;
      else acc.low += 1;
      return acc;
    },
    { total: 0, high: 0, medium: 0, low: 0 }
  );

  return setCache('insights', cacheKey, {
    generated_at: new Date().toISOString(),
    summary,
    items: trimmed,
  }, INSIGHTS_CACHE_MS);
}

module.exports = {
  forecastByProduct,
  stockouts,
  anomalies,
  pricingRecommendations,
  forecastDetail,
  insights,
  __test__: {
    chooseSalesAggregationMode,
    buildSalesAggregationStrategy,
  },
};
