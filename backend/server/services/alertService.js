/**
 * alertService.js
 *
 * Servicio de alertas WhatsApp para el dueño del sistema (Camino B).
 *
 * Responsabilidades:
 *   - Enviar mensajes de texto 1:1 al teléfono del dueño via el proveedor
 *     WhatsApp activo (whatsappWebProvider o disabledProvider).
 *   - Formatear los mensajes para cada tipo de alerta del sistema.
 *   - Rate limiting interno para evitar ban de WhatsApp.
 *
 * Diseño:
 *   Este servicio es completamente independiente del campaignDispatcher
 *   (que maneja envíos batch de PDFs a N destinatarios).
 *   Aquí solo enviamos texto a UNO: el dueño.
 *
 * Variables de entorno:
 *   ALERT_MAX_MSG_PER_HOUR  — máximo de mensajes por hora (default 20)
 */

'use strict';

const { getActiveProvider } = require('./messaging/providerRegistry');
const alertConfigRepo       = require('../db/repositories/alertConfigRepository');
const logger = require('../lib/logger');

// ─── Rate Limiter ─────────────────────────────────────────────────────────────

const MAX_MSG_PER_HOUR = Math.max(1, Number(process.env.ALERT_MAX_MSG_PER_HOUR || 20));
const ONE_HOUR_MS = 60 * 60 * 1000;
let warnedMissingOwnerPhone = false;

// Ventana deslizante: array de timestamps de envíos exitosos.
const sentTimestamps = [];

function isRateLimited() {
  const now = Date.now();
  // Eliminar entradas más viejas de 1 hora.
  while (sentTimestamps.length && sentTimestamps[0] < now - ONE_HOUR_MS) {
    sentTimestamps.shift();
  }
  return sentTimestamps.length >= MAX_MSG_PER_HOUR;
}

function recordSent() {
  sentTimestamps.push(Date.now());
}

// ─── Formateo de moneda (ARS) ─────────────────────────────────────────────────

function formatARS(amount) {
  const n = Number(amount) || 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

// ─── Envío central ────────────────────────────────────────────────────────────

/**
 * Envía un mensaje de texto al dueño del sistema.
 *
 * @param {string} text — Cuerpo del mensaje.
 * @returns {{ ok: boolean, skipped?: string, errorMessage?: string }}
 */
async function sendOwnerAlert(text) {
  const config = await alertConfigRepo.getAlertConfig();

  if (!config.enabled) {
    return { ok: false, skipped: 'alerts_disabled' };
  }

  const phone = config.ownerPhone || process.env.OWNER_PHONE_E164 || null;
  if (!phone) {
    if (!warnedMissingOwnerPhone) {
      logger.info('[AlertService] No hay teléfono de dueño configurado (alert_owner_phone / OWNER_PHONE_E164).');
      warnedMissingOwnerPhone = true;
    }
    return { ok: false, skipped: 'no_phone' };
  }
  warnedMissingOwnerPhone = false;
  if (!phone) {
    logger.warn('[AlertService] No hay teléfono de dueño configurado (alert_owner_phone / OWNER_PHONE_E164).');
    return { ok: false, skipped: 'no_phone' };
  }

  if (isRateLimited()) {
    logger.warn(`[AlertService] Rate limit alcanzado (${MAX_MSG_PER_HOUR} msg/h). Mensaje descartado.`);
    return { ok: false, skipped: 'rate_limited' };
  }

  const provider = getActiveProvider();
  const status   = await provider.getStatus();
  const configured = Boolean(status?.configured);
  const connected  = !status?.capabilities?.requiresConnection || status?.state === 'connected';

  if (!configured || !connected) {
    logger.warn('[AlertService] Proveedor WhatsApp no conectado. Mensaje descartado:', text.slice(0, 80));
    return { ok: false, skipped: 'provider_offline' };
  }

  try {
    const result = await provider.sendTextMessage({
      toE164: phone,
      body: text,
      automatizado: true,
      automatizacionNombre: 'alerta_dueno',
    });

    if (result?.ok) {
      recordSent();
      logger.info(`[AlertService] Alerta enviada a ${phone}: ${text.slice(0, 60)}...`);
    } else {
      logger.warn('[AlertService] El proveedor rechazó el envío:', result?.errorMessage);
    }

    return result;
  } catch (err) {
    logger.error({ err: err?.message }, '[AlertService] Error inesperado al enviar alerta:');
    return { ok: false, errorMessage: err?.message };
  }
}

// ─── Tipos de alerta ──────────────────────────────────────────────────────────

/**
 * Alerta de stock bajo para un producto.
 *
 * @param {{ name: string, stock: number, threshold: number }} product
 */
async function sendStockAlert(product) {
  const config = await alertConfigRepo.getAlertConfig();
  if (!config.stock.enabled) return { ok: false, skipped: 'stock_alerts_disabled' };

  const message = [
    `⚠️ *Stock bajo* en Kaisen`,
    ``,
    `Producto: *${product.name}*`,
    `Stock actual: ${product.stock} unidades`,
    `Mínimo configurado: ${product.threshold} unidades`,
    ``,
    `Revisá el inventario para reabastecer a tiempo.`,
  ].join('\n');

  return sendOwnerAlert(message);
}

/**
 * Alerta de venta de importe alto.
 *
 * @param {{ total: number, cliente: string, productos: string, metodo: string }} sale
 */
async function sendBigSaleAlert(sale) {
  const config = await alertConfigRepo.getAlertConfig();
  if (!config.bigSale.enabled) return { ok: false, skipped: 'big_sale_alerts_disabled' };
  if (Number(sale.total) < config.bigSale.minArs) return { ok: false, skipped: 'below_threshold' };

  const message = [
    `💰 *Venta grande registrada* en Kaisen`,
    ``,
    `Total: *${formatARS(sale.total)}*`,
    `Cliente: ${sale.cliente || 'Consumidor Final'}`,
    sale.productos ? `Productos: ${sale.productos}` : null,
    sale.metodo    ? `Método de pago: ${sale.metodo}` : null,
  ].filter(Boolean).join('\n');

  return sendOwnerAlert(message);
}

/**
 * Resumen diario de operaciones.
 *
 * @param {{ ventas: number, totalBruto: number, clientes: number, topProducto?: string }} data
 */
async function sendDailySummary(data) {
  const config = await alertConfigRepo.getAlertConfig();
  if (!config.daily.enabled) return { ok: false, skipped: 'daily_summary_disabled' };

  const now = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  const message = [
    `📊 *Resumen del día* — ${now}`,
    ``,
    `Ventas realizadas: *${data.ventas}*`,
    `Total facturado: *${formatARS(data.totalBruto)}*`,
    `Clientes atendidos: ${data.clientes}`,
    data.topProducto ? `Producto más vendido: ${data.topProducto}` : null,
  ].filter(Boolean).join('\n');

  return sendOwnerAlert(message);
}

/**
 * Alerta de seguridad (reemplaza el sendSMSNotification simulado de security.js).
 *
 * @param {string} message
 */
async function sendSecurityAlert(message) {
  const text = `🔐 *Alerta de seguridad* — Kaisen\n\n${message}`;
  // Las alertas de seguridad no pasan por el chequeo de config.enabled
  // porque siempre queremos saber de intentos de acceso.
  // Pero sí respetan el rate limit y el estado del proveedor.
  const config = await alertConfigRepo.getAlertConfig();
  const phone   = config.ownerPhone || process.env.OWNER_PHONE_E164 || null;
  if (!phone) {
    logger.warn('[AlertService] Alerta de seguridad sin teléfono configurado:', message);
    return { ok: false, skipped: 'no_phone' };
  }

  if (isRateLimited()) {
    logger.warn('[AlertService] Rate limit alcanzado. Alerta de seguridad descartada:', message.slice(0, 80));
    return { ok: false, skipped: 'rate_limited' };
  }

  const provider = getActiveProvider();
  const status   = await provider.getStatus();
  const ready    = Boolean(status?.configured) &&
                   (!status?.capabilities?.requiresConnection || status?.state === 'connected');

  if (!ready) {
    // Si el proveedor no está listo para seguridad, fallback a consola.
    logger.warn(`[AlertService][SEGURIDAD] WhatsApp offline. Alerta no enviada: ${message}`);
    return { ok: false, skipped: 'provider_offline' };
  }

  try {
    const result = await provider.sendTextMessage({
      toE164: phone,
      body: text,
      automatizado: true,
      automatizacionNombre: 'alerta_seguridad',
    });
    if (result?.ok) recordSent();
    return result;
  } catch (err) {
    logger.error({ err: err?.message }, '[AlertService] Error al enviar alerta de seguridad:');
    return { ok: false, errorMessage: err?.message };
  }
}

module.exports = {
  sendOwnerAlert,
  sendStockAlert,
  sendBigSaleAlert,
  sendDailySummary,
  sendSecurityAlert,
};
