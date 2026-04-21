/**
 * alertScheduler.js
 *
 * Planificador de alertas automáticas para el dueño (Camino B).
 *
 * Tareas:
 *   1. RESUMEN DIARIO — se envía una vez al día a la hora configurada.
 *   2. CHECK DE STOCK — se ejecuta cada N minutos; envía alerta por cada
 *      producto con stock por debajo del umbral (máx. 1 alerta por producto
 *      cada 24 h para evitar spam).
 *
 * Diseño:
 *   Usa setInterval (igual que whatsappCampaignDispatcher) para no depender
 *   de bibliotecas externas de cron. El intervalo base es de 1 minuto.
 *
 * Variables de entorno:
 *   ALERT_SCHEDULER_ENABLED      — 'false' deshabilita por completo (default 'true')
 *   ALERT_STOCK_CHECK_INTERVAL_M — intervalo en minutos del chequeo de stock (default 30)
 */

'use strict';

const { query }           = require('../db/pg');
const alertConfigRepo     = require('../db/repositories/alertConfigRepository');
const logger = require('../lib/logger');
const { sendStockAlert, sendDailySummary } = require('./alertService');

// ─── Config ───────────────────────────────────────────────────────────────────

const TICK_MS = 60 * 1000; // El scheduler revisa el estado cada minuto.

const STOCK_CHECK_INTERVAL_M = Math.max(
  5,
  Number(process.env.ALERT_STOCK_CHECK_INTERVAL_M || 30)
);

function isSchedulerEnabled() {
  const raw = String(process.env.ALERT_SCHEDULER_ENABLED || 'true').trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'off');
}

// ─── Estado interno ───────────────────────────────────────────────────────────

let timer             = null;
let lastDailySentDate = null;           // 'YYYY-MM-DD' del último resumen enviado
let lastStockCheckAt  = 0;             // timestamp del último check de stock
const stockAlertedAt  = new Map();     // productoId → timestamp de la última alerta enviada

const STOCK_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 h entre alertas del mismo producto

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Devuelve el resumen de ventas del día actual (hora local del servidor).
 */
async function fetchTodaySalesSummary() {
  const { rows } = await query(`
    SELECT
      COUNT(*)                       AS total_ventas,
      COALESCE(SUM(total), 0)        AS total_bruto,
      COUNT(DISTINCT cliente_id)     AS total_clientes
    FROM ventas
    WHERE DATE(fecha) = CURDATE()
      AND estado_pago <> 'cancelado'
  `);

  const row = rows[0] || {};

  // Producto más vendido hoy
  const { rows: topRows } = await query(`
    SELECT p.nombre, SUM(vd.cantidad) AS qty
    FROM venta_detalles vd
    JOIN ventas v ON v.id = vd.venta_id
    JOIN productos p ON p.id = vd.producto_id
    WHERE DATE(v.fecha) = CURDATE()
      AND v.estado_pago <> 'cancelado'
    GROUP BY vd.producto_id, p.nombre
    ORDER BY qty DESC
    LIMIT 1
  `);

  return {
    ventas:       Number(row.total_ventas  || 0),
    totalBruto:   Number(row.total_bruto   || 0),
    clientes:     Number(row.total_clientes|| 0),
    topProducto:  topRows[0]?.nombre || null,
  };
}

/**
 * Devuelve productos cuyo stock disponible está por debajo del umbral.
 */
async function fetchLowStockProducts(threshold) {
  const { rows } = await query(
    `SELECT p.id, p.nombre AS name, COALESCE(i.cantidad_disponible, 0) AS stock
     FROM productos p
LEFT JOIN inventario i ON i.producto_id = p.id
     WHERE p.activo = 1
       AND COALESCE(i.cantidad_disponible, 0) <= $1
     ORDER BY stock ASC
     LIMIT 20`,
    [threshold]
  );
  return rows;
}

// ─── Tareas programadas ───────────────────────────────────────────────────────

async function runDailySummary(config) {
  const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  if (lastDailySentDate === todayStr) return; // ya enviado hoy

  const nowHour = new Date().getHours();
  if (nowHour < config.daily.hour) return; // todavía no es la hora

  try {
    const data = await fetchTodaySalesSummary();
    const result = await sendDailySummary(data);

    if (result?.ok || result?.skipped === 'daily_summary_disabled') {
      // Marcamos como enviado incluso si estaba deshabilitado
      // para no volver a intentar en el mismo día.
      lastDailySentDate = todayStr;
    }
  } catch (err) {
    logger.error({ err: err?.message }, '[AlertScheduler] Error en resumen diario:');
  }
}

async function runStockCheck(config) {
  const now = Date.now();
  if (now - lastStockCheckAt < STOCK_CHECK_INTERVAL_M * 60 * 1000) return;
  lastStockCheckAt = now;

  try {
    const products = await fetchLowStockProducts(config.stock.threshold);

    for (const product of products) {
      const lastAlertTime = stockAlertedAt.get(product.id) || 0;
      if (now - lastAlertTime < STOCK_COOLDOWN_MS) continue; // cooldown activo

      const result = await sendStockAlert({
        name:      product.name,
        stock:     Number(product.stock),
        threshold: config.stock.threshold,
      });

      if (result?.ok) {
        stockAlertedAt.set(product.id, now);
      }
    }
  } catch (err) {
    logger.error({ err: err?.message }, '[AlertScheduler] Error en chequeo de stock:');
  }
}

// ─── Tick principal ───────────────────────────────────────────────────────────

async function tick() {
  try {
    const config = await alertConfigRepo.getAlertConfig();
    if (!config.enabled) return;

    if (config.daily.enabled) {
      await runDailySummary(config);
    }

    if (config.stock.enabled) {
      await runStockCheck(config);
    }
  } catch (err) {
    // Error de DB u otro: no queremos que el scheduler se detenga.
    logger.error({ err: err?.message }, '[AlertScheduler] Error en tick:');
  }
}

// ─── Start / Stop ─────────────────────────────────────────────────────────────

function startAlertScheduler() {
  if (!isSchedulerEnabled()) {
    logger.info('[AlertScheduler] Deshabilitado por ALERT_SCHEDULER_ENABLED=false.');
    return;
  }
  if (timer) return; // ya corriendo

  logger.info(
    `[AlertScheduler] Iniciado. Stock check cada ${STOCK_CHECK_INTERVAL_M} min.`
  );

  timer = setInterval(tick, TICK_MS);
  // Ejecutar el primer tick inmediatamente tras el boot (sin bloquear).
  setImmediate(tick);
}

function stopAlertScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  logger.info('[AlertScheduler] Detenido.');
}

module.exports = {
  startAlertScheduler,
  stopAlertScheduler,
};
