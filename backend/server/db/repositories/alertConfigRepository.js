/**
 * alertConfigRepository.js
 *
 * Persistencia de configuración de alertas automáticas en la tabla
 * `parametros_sistema` (reutiliza la infraestructura existente de configRepository).
 *
 * Claves usadas:
 *   alert_enabled          (texto 'true'/'false')  — interruptor maestro
 *   alert_owner_phone      (texto E.164)            — destino de todas las alertas
 *   alert_stock_enabled    (texto 'true'/'false')
 *   alert_stock_threshold  (num)                    — unidades mínimas antes de alertar
 *   alert_daily_enabled    (texto 'true'/'false')
 *   alert_daily_hour       (num 0-23)               — hora local del resumen diario
 *   alert_big_sale_enabled (texto 'true'/'false')
 *   alert_big_sale_min_ars (num)                    — importe mínimo para alertar venta grande
 */

const { getTextParam, setTextParam, getNumericParam, setNumericParam } = require('./configRepository');

// ─── Helpers de lectura tipada ─────────────────────────────────────────────────

async function getBool(key, defaultValue = false) {
  const raw = await getTextParam(key);
  if (raw === null) return defaultValue;
  return raw === 'true';
}

async function getNum(key, defaultValue = null) {
  const val = await getNumericParam(key);
  return val === null ? defaultValue : val;
}

// ─── Lectura del bloque completo de configuración ─────────────────────────────

/**
 * Devuelve toda la configuración de alertas en un solo objeto.
 * Los valores null se reemplazan por los defaults del sistema.
 */
async function getAlertConfig() {
  const [
    enabled,
    ownerPhone,
    stockEnabled,
    stockThreshold,
    dailyEnabled,
    dailyHour,
    bigSaleEnabled,
    bigSaleMinArs,
  ] = await Promise.all([
    getBool('alert_enabled', true),
    getTextParam('alert_owner_phone'),
    getBool('alert_stock_enabled', true),
    getNum('alert_stock_threshold', 5),
    getBool('alert_daily_enabled', true),
    getNum('alert_daily_hour', 20),
    getBool('alert_big_sale_enabled', true),
    getNum('alert_big_sale_min_ars', 100000),
  ]);

  return {
    enabled,
    ownerPhone:      ownerPhone || null,
    stock: {
      enabled:   stockEnabled,
      threshold: stockThreshold,
    },
    daily: {
      enabled: dailyEnabled,
      hour:    Math.round(Math.min(Math.max(dailyHour, 0), 23)),
    },
    bigSale: {
      enabled:    bigSaleEnabled,
      minArs:     bigSaleMinArs,
    },
  };
}

// ─── Escritura campo a campo ───────────────────────────────────────────────────

async function setEnabled(value, usuarioId) {
  await setTextParam('alert_enabled', value ? 'true' : 'false', usuarioId);
}

async function setOwnerPhone(phone, usuarioId) {
  await setTextParam('alert_owner_phone', String(phone || '').trim(), usuarioId);
}

async function setStockEnabled(value, usuarioId) {
  await setTextParam('alert_stock_enabled', value ? 'true' : 'false', usuarioId);
}

async function setStockThreshold(value, usuarioId) {
  const n = Math.max(0, Number(value) || 0);
  await setNumericParam('alert_stock_threshold', n, usuarioId);
}

async function setDailyEnabled(value, usuarioId) {
  await setTextParam('alert_daily_enabled', value ? 'true' : 'false', usuarioId);
}

async function setDailyHour(value, usuarioId) {
  const h = Math.round(Math.min(Math.max(Number(value) || 0, 0), 23));
  await setNumericParam('alert_daily_hour', h, usuarioId);
}

async function setBigSaleEnabled(value, usuarioId) {
  await setTextParam('alert_big_sale_enabled', value ? 'true' : 'false', usuarioId);
}

async function setBigSaleMinArs(value, usuarioId) {
  const n = Math.max(0, Number(value) || 0);
  await setNumericParam('alert_big_sale_min_ars', n, usuarioId);
}

/**
 * Guarda toda la configuración de alertas en una sola llamada.
 * Solo actualiza las claves que vienen definidas en el objeto.
 */
async function saveAlertConfig(config = {}, usuarioId) {
  const ops = [];

  if (config.enabled !== undefined)             ops.push(setEnabled(config.enabled, usuarioId));
  if (config.ownerPhone !== undefined)          ops.push(setOwnerPhone(config.ownerPhone, usuarioId));

  if (config.stock?.enabled !== undefined)      ops.push(setStockEnabled(config.stock.enabled, usuarioId));
  if (config.stock?.threshold !== undefined)    ops.push(setStockThreshold(config.stock.threshold, usuarioId));

  if (config.daily?.enabled !== undefined)      ops.push(setDailyEnabled(config.daily.enabled, usuarioId));
  if (config.daily?.hour !== undefined)         ops.push(setDailyHour(config.daily.hour, usuarioId));

  if (config.bigSale?.enabled !== undefined)    ops.push(setBigSaleEnabled(config.bigSale.enabled, usuarioId));
  if (config.bigSale?.minArs !== undefined)     ops.push(setBigSaleMinArs(config.bigSale.minArs, usuarioId));

  await Promise.all(ops);
}

module.exports = {
  getAlertConfig,
  saveAlertConfig,
  setEnabled,
  setOwnerPhone,
  setStockEnabled,
  setStockThreshold,
  setDailyEnabled,
  setDailyHour,
  setBigSaleEnabled,
  setBigSaleMinArs,
};
