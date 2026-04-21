const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const { query } = require('../db/pg');
const salesRepo = require('../db/repositories/salesRepository');
const paymentRepo = require('../db/repositories/paymentRepository');
const integracionesRepo = require('../db/repositories/integracionesRepository');
const { encryptText, decryptText } = require('../utils/cryptoService');
const logger = require('../lib/logger');

const PROVIDER = 'mp';
const MP_API_BASE_URL = process.env.MP_API_BASE_URL || 'https://api.mercadopago.com';
const REQUEST_TIMEOUT_MS = Math.max(3000, Number(process.env.MP_HTTP_TIMEOUT_MS || 15000));
const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

function withTimeout(promise, ms = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MercadoPago timeout after ${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
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
    } catch (error) {
      reject(error);
    }
  });
}

function parseJsonSafe(value) {
  if (!value) return null;
  try {
    return typeof value === 'object' ? value : JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeBaseUrl(raw) {
  if (!raw) return null;
  return String(raw).replace(/\/+$/, '');
}

function resolvePublicBaseUrl() {
  return normalizeBaseUrl(
    process.env.PUBLIC_API_BASE_URL ||
      process.env.PUBLIC_ORIGIN ||
      process.env.APP_BASE_URL ||
      null
  );
}

function resolveApiUrl(pathname) {
  const base = resolvePublicBaseUrl();
  if (!base) return null;
  return new URL(pathname, `${base}/`).toString();
}

function extractErrorMessage(res) {
  const payload = parseJsonSafe(res?.text);
  return (
    payload?.message ||
    payload?.error ||
    payload?.cause?.[0]?.description ||
    payload?.cause?.[0]?.message ||
    (res?.text ? String(res.text).slice(0, 300) : null) ||
    `MercadoPago HTTP ${res?.status || 0}`
  );
}

function normalizeTsToMs(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw > 1e12 ? raw : raw * 1000;
}

function safeCompareHex(expectedHex, actualHex) {
  const expected = Buffer.from(String(expectedHex || ''), 'hex');
  const actual = Buffer.from(String(actualHex || ''), 'hex');
  if (!expected.length || expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function parseMpSignature(headerValue) {
  const out = {};
  String(headerValue || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [key, ...rest] = entry.split('=');
      if (!key) return;
      out[key.trim().toLowerCase()] = rest.join('=').trim();
    });
  return out;
}

function buildMpSignatureManifest({ dataId, requestId, ts }) {
  return `id:${dataId};request-id:${requestId};ts:${ts};`;
}

function parseVentaId(rawValue) {
  if (rawValue == null) return null;
  const text = String(rawValue).trim();
  if (!text) return null;
  if (/^venta:/i.test(text)) {
    const num = Number(text.slice('venta:'.length));
    return Number.isInteger(num) && num > 0 ? num : null;
  }
  const direct = Number(text);
  return Number.isInteger(direct) && direct > 0 ? direct : null;
}

function parseVentaIdFromPayment(payment) {
  const metadataVentaId =
    parseVentaId(payment?.metadata?.venta_id) ||
    parseVentaId(payment?.additional_info?.metadata?.venta_id);
  if (metadataVentaId) return metadataVentaId;
  return parseVentaId(payment?.external_reference);
}

function normalizePaymentLinkResponse(link) {
  if (!link) return null;
  return {
    id: Number(link.id),
    venta_id: Number(link.venta_id),
    mp_preference_id: link.mp_preference_id,
    mp_payment_id: link.mp_payment_id || null,
    external_reference: link.external_reference || null,
    init_point: link.init_point,
    sandbox_init_point: link.sandbox_init_point || null,
    estado: link.estado || 'pendiente',
    payment_status_detail: link.payment_status_detail || null,
    local_pago_id: link.local_pago_id ? Number(link.local_pago_id) : null,
    expires_at: link.expires_at || null,
    last_seen_at: link.last_seen_at || null,
  };
}

async function mpApiRequest(pathname, { method = 'GET', token, body, headers = {} } = {}) {
  const url = new URL(pathname, MP_API_BASE_URL).toString();
  const serializedBody = body == null ? null : JSON.stringify(body);
  const res = await withTimeout(
    httpRequest(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(serializedBody
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(serializedBody),
            }
          : {}),
        ...headers,
      },
      body: serializedBody,
    })
  );

  if (!res.ok) {
    throw new Error(extractErrorMessage(res));
  }

  return parseJsonSafe(res.text) || {};
}

async function getVentaHeader(ventaId) {
  const { rows } = await query(
    `SELECT v.id,
            v.cliente_id,
            v.fecha,
            v.neto::float AS neto,
            v.estado_pago,
            c.nombre AS cliente_nombre,
            c.apellido AS cliente_apellido
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
      WHERE v.id = $1
        AND COALESCE(v.oculto, 0) = 0
      LIMIT 1`,
    [ventaId]
  );
  return rows[0] || null;
}

async function getVentaItems(ventaId) {
  const rows = await salesRepo.getVentaDetalle(ventaId);
  return Array.isArray(rows) ? rows : [];
}

async function saveAccessToken({ accessToken, webhookSecret }) {
  const verified = await verifyAccessToken(accessToken);
  const existing = await integracionesRepo.getIntegracionConfig(PROVIDER);
  const saved = await integracionesRepo.upsertIntegracionConfig(PROVIDER, {
    estado: 'conectado',
    access_token_enc: encryptText(accessToken),
    external_user_id: verified.user_id ? String(verified.user_id) : null,
    external_user_name: verified.nickname || verified.email || verified.first_name || null,
    metadata_json: {
      verified_at: new Date().toISOString(),
      email: verified.email || null,
      first_name: verified.first_name || null,
      last_name: verified.last_name || null,
    },
    ultimo_sync_en: new Date(),
    ultimo_error: null,
    activo: true,
    ...(webhookSecret
      ? { webhook_secret_enc: encryptText(webhookSecret) }
      : existing?.webhook_secret_enc
      ? {}
      : {}),
  });

  return {
    config: saved,
    verified,
  };
}

async function verifyAccessToken(token) {
  const data = await mpApiRequest('/users/me', {
    method: 'GET',
    token,
  });

  if (!data?.id) {
    throw new Error('MercadoPago no devolvió un usuario válido');
  }

  return {
    user_id: data.id ? String(data.id) : null,
    nickname: data.nickname || null,
    email: data.email || null,
    first_name: data.first_name || null,
    last_name: data.last_name || null,
  };
}

async function getActiveAccessToken() {
  const config = await integracionesRepo.getIntegracionConfig(PROVIDER);
  if (!config || Number(config.activo || 0) !== 1 || !config.access_token_enc) {
    const error = new Error('MercadoPago no está conectado');
    error.status = 409;
    throw error;
  }

  const token = decryptText(config.access_token_enc);
  if (!token) {
    const error = new Error('No se pudo leer el token de MercadoPago');
    error.status = 500;
    throw error;
  }

  return token;
}

async function createPaymentPreference(ventaId, items) {
  const accessToken = await getActiveAccessToken();
  const notificationUrl = resolveApiUrl('/api/integraciones/mp/webhook');
  const frontendBase = resolvePublicBaseUrl();

  const payload = {
    items,
    external_reference: `venta:${ventaId}`,
    metadata: {
      venta_id: ventaId,
      origin: 'kaisen',
    },
    notification_url: notificationUrl || undefined,
    back_urls: frontendBase
      ? {
          success: frontendBase,
          pending: frontendBase,
          failure: frontendBase,
        }
      : undefined,
    auto_return: frontendBase ? 'approved' : undefined,
  };

  return mpApiRequest('/checkout/preferences', {
    method: 'POST',
    token: accessToken,
    body: payload,
  });
}

async function getPaymentById(mpPaymentId) {
  const accessToken = await getActiveAccessToken();
  return mpApiRequest(`/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
    method: 'GET',
    token: accessToken,
  });
}

async function generatePaymentLinkForVenta(ventaId) {
  const sale = await getVentaHeader(ventaId);
  if (!sale) {
    const error = new Error('Venta no encontrada');
    error.status = 404;
    throw error;
  }

  if (String(sale.estado_pago) === 'pagada') {
    const error = new Error('La venta ya está pagada');
    error.status = 409;
    throw error;
  }

  const existingLink = await integracionesRepo.getMpPaymentLink(ventaId);
  if (existingLink?.init_point) {
    return normalizePaymentLinkResponse(existingLink);
  }

  const items = await getVentaItems(ventaId);
  if (!items.length) {
    const error = new Error('La venta no tiene items para generar un link');
    error.status = 400;
    throw error;
  }

  const preferenceItems = items.map((item) => {
    const quantity = Math.max(1, Number(item.cantidad || 0));
    const subtotalNeto = Number(item.subtotal_neto || item.subtotal || 0);
    const unitPrice = quantity > 0 ? subtotalNeto / quantity : subtotalNeto;
    return {
      id: String(item.producto_id),
      title: item.producto_nombre || `Producto ${item.producto_id}`,
      quantity,
      unit_price: Math.round(unitPrice * 100) / 100,
      currency_id: 'ARS',
    };
  });

  const preference = await createPaymentPreference(ventaId, preferenceItems);
  const config = await integracionesRepo.getIntegracionConfig(PROVIDER);
  const savedLink = await integracionesRepo.upsertMpPaymentLink({
    venta_id: ventaId,
    integracion_config_id: config?.id || null,
    mp_preference_id: preference.id,
    external_reference: preference.external_reference || `venta:${ventaId}`,
    init_point: preference.init_point,
    sandbox_init_point: preference.sandbox_init_point || null,
    estado: 'pendiente',
    expires_at: preference.expires || preference.date_of_expiration || null,
    payload_json: preference,
    last_seen_at: new Date(),
  });

  await integracionesRepo.setIntegracionStatus(PROVIDER, 'conectado', {
    ultimo_sync_en: new Date(),
    ultimo_error: null,
  });

  return normalizePaymentLinkResponse(savedLink);
}

async function getPaymentLink(ventaId) {
  const link = await integracionesRepo.getMpPaymentLink(ventaId);
  return normalizePaymentLinkResponse(link);
}

async function getStatus() {
  const config = await integracionesRepo.getIntegracionConfig(PROVIDER);
  if (!config) {
    return {
      connected: false,
      provider: PROVIDER,
      status: 'desconectado',
      mp_user_id: null,
      mp_user_name: null,
      last_sync_at: null,
      webhook_secret_configured: false,
    };
  }

  return {
    connected: Number(config.activo || 0) === 1 && Boolean(config.access_token_enc),
    provider: PROVIDER,
    status: config.estado || 'desconectado',
    mp_user_id: config.external_user_id || null,
    mp_user_name: config.external_user_name || null,
    last_sync_at: config.ultimo_sync_en || null,
    last_error: config.ultimo_error || null,
    webhook_secret_configured: Boolean(config.webhook_secret_enc),
  };
}

async function disconnect() {
  await integracionesRepo.disableIntegracion(PROVIDER);
  return getStatus();
}

async function validateWebhookSignature({ headers = {}, query = {}, body = {} }) {
  const config = await integracionesRepo.getIntegracionConfig(PROVIDER);
  if (!config?.webhook_secret_enc) return true;

  const webhookSecret = decryptText(config.webhook_secret_enc);
  if (!webhookSecret) return false;

  const signature = parseMpSignature(headers['x-signature'] || headers['X-Signature']);
  const requestId = headers['x-request-id'] || headers['X-Request-Id'];
  const ts = signature.ts;
  const v1 = signature.v1;
  const dataId =
    query['data.id'] ||
    query.data_id ||
    body?.data?.id ||
    body?.id ||
    null;

  if (!ts || !v1 || !requestId || !dataId) return false;

  const tsMs = normalizeTsToMs(ts);
  if (!tsMs || Math.abs(Date.now() - tsMs) > WEBHOOK_MAX_AGE_MS) {
    return false;
  }

  const manifest = buildMpSignatureManifest({
    dataId: String(dataId),
    requestId: String(requestId),
    ts: String(ts),
  });

  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(manifest)
    .digest('hex');

  return safeCompareHex(expected, v1);
}

async function processWebhookNotification({ headers = {}, query = {}, body = {} } = {}) {
  const validSignature = await validateWebhookSignature({ headers, query, body });
  const config = await integracionesRepo.getIntegracionConfig(PROVIDER);
  if (config?.webhook_secret_enc && !validSignature) {
    throw new Error('Firma de webhook de MercadoPago inválida');
  }

  const notificationType = String(
    query.type ||
      body.type ||
      query.topic ||
      body.topic ||
      body.action ||
      ''
  ).toLowerCase();

  const paymentId =
    query['data.id'] ||
    query.data_id ||
    body?.data?.id ||
    body?.id ||
    null;

  if (!paymentId) {
    return { ok: true, ignored: 'missing_payment_id' };
  }

  if (notificationType && !notificationType.includes('payment')) {
    return { ok: true, ignored: `unsupported_topic:${notificationType}` };
  }

  const payment = await getPaymentById(paymentId);
  const ventaId = parseVentaIdFromPayment(payment);
  if (!ventaId) {
    throw new Error(`No se pudo resolver la venta para el pago ${paymentId}`);
  }

  const link = await integracionesRepo.getMpPaymentLink(ventaId);
  if (!link) {
    throw new Error(`No existe mp_payment_link para la venta ${ventaId}`);
  }

  const paymentStatus = String(payment.status || 'desconocido').toLowerCase();
  const paymentStatusDetail = payment.status_detail || null;

  const claim = await integracionesRepo.claimMpPaymentLinkProcessing(ventaId, String(payment.id));
  if (!claim.claimed && claim.row?.local_pago_id) {
    await integracionesRepo.updateMpPaymentLinkEstado(ventaId, {
      mp_payment_id: String(payment.id),
      estado: paymentStatus,
      payment_status_detail: paymentStatusDetail,
      payload_json: payment,
      last_seen_at: new Date(),
    });
    return { ok: true, skipped: 'already_processed' };
  }

  if (!claim.claimed && String(claim.row?.estado || '').toLowerCase() === 'procesando') {
    return { ok: true, skipped: 'already_processing' };
  }

  let localPagoId = claim.row?.local_pago_id ? Number(claim.row.local_pago_id) : null;

  if (paymentStatus === 'approved' && !localPagoId) {
    const sale = await getVentaHeader(ventaId);
    if (!sale) {
      throw new Error(`Venta ${ventaId} no encontrada al procesar el pago`);
    }

    if (String(sale.estado_pago || '').toLowerCase() !== 'pagada') {
      const paymentAmount = Number(
        payment.transaction_amount || payment.transaction_details?.total_paid_amount || 0
      );
      if (!(paymentAmount > 0)) {
        throw new Error(`MercadoPago devolvió un monto inválido para el pago ${payment.id}`);
      }

      const localPayment = await paymentRepo.crearPago({
        venta_id: ventaId,
        cliente_id: Number(sale.cliente_id),
        monto: paymentAmount,
        fecha:
          payment.date_approved ||
          payment.date_last_updated ||
          payment.date_created ||
          new Date(),
        metodo: 'otro',
      });

      localPagoId = Number(localPayment?.pago_id || 0) || null;
    } else {
      const { rows } = await query(
        `SELECT id
           FROM pagos
          WHERE venta_id = $1
          ORDER BY id DESC
          LIMIT 1`,
        [ventaId]
      );
      localPagoId = Number(rows[0]?.id || 0) || null;
    }
  }

  const updatedLink = await integracionesRepo.updateMpPaymentLinkEstado(ventaId, {
    mp_payment_id: String(payment.id),
    estado: paymentStatus,
    payment_status_detail: paymentStatusDetail,
    local_pago_id: localPagoId,
    payload_json: payment,
    last_seen_at: new Date(),
  });

  await integracionesRepo.setIntegracionStatus(PROVIDER, 'conectado', {
    ultimo_sync_en: new Date(),
    ultimo_error: null,
  });

  return {
    ok: true,
    venta_id: ventaId,
    mp_payment_id: String(payment.id),
    local_pago_id: localPagoId,
    estado: updatedLink?.estado || paymentStatus,
  };
}

module.exports = {
  saveAccessToken,
  verifyAccessToken,
  getActiveAccessToken,
  createPaymentPreference,
  getPaymentById,
  generatePaymentLinkForVenta,
  getPaymentLink,
  getStatus,
  disconnect,
  validateWebhookSignature,
  processWebhookNotification,
};
