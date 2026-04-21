const http = require('http');
const https = require('https');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { URL, URLSearchParams } = require('url');
const { query } = require('../db/pg');
const clientRepo = require('../db/repositories/clientRepository');
const productRepo = require('../db/repositories/productRepository');
const salesRepo = require('../db/repositories/salesRepository');
const paymentRepo = require('../db/repositories/paymentRepository');
const integracionesRepo = require('../db/repositories/integracionesRepository');
const { encryptText, decryptText } = require('../utils/cryptoService');
const logger = require('../lib/logger');

const PROVIDER = 'ml';
const ML_API_BASE_URL = process.env.ML_API_BASE_URL || 'https://api.mercadolibre.com';
const ML_AUTH_BASE_URL = process.env.ML_AUTH_BASE_URL || 'https://auth.mercadolibre.com.ar';
const ML_CLIENT_ID = process.env.ML_CLIENT_ID || '';
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || '';
const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || '';
const ML_STATE_SECRET = process.env.ML_STATE_SECRET || process.env.JWT_SECRET || '';
const REQUEST_TIMEOUT_MS = Math.max(3000, Number(process.env.ML_HTTP_TIMEOUT_MS || 15000));
const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;
const DEFAULT_IMPORT_LIMIT = 20;
const DEFAULT_LISTING_TYPE_ID = process.env.ML_DEFAULT_LISTING_TYPE || 'gold_special';
const DEFAULT_CONDITION = process.env.ML_DEFAULT_CONDITION || 'new';
const DEFAULT_BUYING_MODE = process.env.ML_DEFAULT_BUYING_MODE || 'buy_it_now';
const DEFAULT_CURRENCY_ID = process.env.ML_DEFAULT_CURRENCY_ID || 'ARS';

function ensureMlEnvironment() {
  if (!ML_CLIENT_ID || !ML_CLIENT_SECRET || !ML_REDIRECT_URI) {
    const error = new Error('MercadoLibre requiere ML_CLIENT_ID, ML_CLIENT_SECRET y ML_REDIRECT_URI');
    error.status = 500;
    throw error;
  }
  if (!ML_STATE_SECRET) {
    const error = new Error('MercadoLibre requiere ML_STATE_SECRET o JWT_SECRET para firmar el state OAuth');
    error.status = 500;
    throw error;
  }
}

function withTimeout(promise, ms = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MercadoLibre timeout after ${ms}ms`)), ms);
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

function extractErrorMessage(res) {
  const payload = parseJsonSafe(res?.text);
  return (
    payload?.message ||
    payload?.error_description ||
    payload?.error ||
    payload?.cause?.[0]?.message ||
    (res?.text ? String(res.text).slice(0, 300) : null) ||
    `MercadoLibre HTTP ${res?.status || 0}`
  );
}

function normalizeDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeTsToMs(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw > 1e12 ? raw : raw * 1000;
}

function safeCompare(expected, actual) {
  const left = Buffer.from(String(expected || ''));
  const right = Buffer.from(String(actual || ''));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseSignatureHeader(headerValue) {
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

function parseMlOrderId(rawValue) {
  if (rawValue == null) return null;
  const text = String(rawValue).trim();
  if (!text) return null;
  const direct = Number(text);
  if (Number.isInteger(direct) && direct > 0) return direct;
  const match = text.match(/\/orders\/(\d+)/i);
  if (match) return Number(match[1]);
  return null;
}

function buildStatePayload(extra = {}) {
  return {
    nonce: crypto.randomBytes(10).toString('hex'),
    created_at: new Date().toISOString(),
    ...extra,
  };
}

function createOAuthStateToken(extra = {}) {
  ensureMlEnvironment();
  return jwt.sign(buildStatePayload(extra), ML_STATE_SECRET, {
    expiresIn: '10m',
    issuer: 'kaisen-integraciones',
    audience: 'mercadolibre-oauth',
  });
}

function verifyOAuthStateToken(stateToken) {
  ensureMlEnvironment();
  return jwt.verify(stateToken, ML_STATE_SECRET, {
    issuer: 'kaisen-integraciones',
    audience: 'mercadolibre-oauth',
  });
}

function resolveFrontendIntegracionesUrl(status, description) {
  const base =
    process.env.INTEGRACIONES_FRONTEND_URL ||
    process.env.PUBLIC_ORIGIN ||
    'http://localhost:5173';
  const target = new URL('/app/integraciones', `${String(base).replace(/\/+$/, '')}/`);
  target.searchParams.set('ml', status);
  if (description) target.searchParams.set('message', description);
  return target.toString();
}

async function mlApiRequest(pathname, { method = 'GET', token, body, headers = {} } = {}) {
  const url = new URL(pathname, ML_API_BASE_URL).toString();
  const serializedBody = body == null ? null : JSON.stringify(body);
  const res = await withTimeout(
    httpRequest(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

async function mlTokenRequest(form) {
  ensureMlEnvironment();
  const body = new URLSearchParams(form).toString();
  const res = await withTimeout(
    httpRequest(new URL('/oauth/token', ML_API_BASE_URL).toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    })
  );

  if (!res.ok) {
    throw new Error(extractErrorMessage(res));
  }

  return parseJsonSafe(res.text) || {};
}

async function getUserInfo(accessToken) {
  const me = await mlApiRequest('/users/me', {
    method: 'GET',
    token: accessToken,
  });

  return {
    user_id: me.id ? String(me.id) : null,
    nickname: me.nickname || null,
    email: me.email || null,
    first_name: me.first_name || null,
    last_name: me.last_name || null,
  };
}

async function getStoredConfig() {
  return integracionesRepo.getIntegracionConfig(PROVIDER);
}

async function persistTokens(tokenData, extra = {}) {
  const accessToken = tokenData.access_token || extra.access_token;
  if (!accessToken) {
    throw new Error('MercadoLibre no devolvió access_token');
  }

  const refreshToken = tokenData.refresh_token || extra.refresh_token || null;
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + Number(tokenData.expires_in) * 1000)
    : extra.token_expires_at || null;
  const userInfo = extra.userInfo || (accessToken ? await getUserInfo(accessToken) : null);
  const existing = await getStoredConfig();

  const saved = await integracionesRepo.upsertIntegracionConfig(PROVIDER, {
    estado: 'conectado',
    access_token_enc: encryptText(accessToken),
    refresh_token_enc:
      refreshToken != null ? encryptText(refreshToken) : existing?.refresh_token_enc || null,
    token_type: tokenData.token_type || extra.token_type || null,
    scope: tokenData.scope || extra.scope || null,
    external_user_id: userInfo?.user_id || existing?.external_user_id || null,
    external_user_name: userInfo?.nickname || userInfo?.email || existing?.external_user_name || null,
    token_expires_at: expiresAt,
    ultimo_sync_en: new Date(),
    ultimo_error: null,
    activo: true,
    metadata_json: {
      connected_at: new Date().toISOString(),
      nickname: userInfo?.nickname || null,
      email: userInfo?.email || null,
      first_name: userInfo?.first_name || null,
      last_name: userInfo?.last_name || null,
    },
    ...(extra.webhookSecret ? { webhook_secret_enc: encryptText(extra.webhookSecret) } : {}),
  });

  return { config: saved, userInfo };
}

function buildAuthorizationUrl(stateToken) {
  ensureMlEnvironment();
  const url = new URL('/authorization', ML_AUTH_BASE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', ML_CLIENT_ID);
  url.searchParams.set('redirect_uri', ML_REDIRECT_URI);
  url.searchParams.set('state', stateToken);
  return url.toString();
}

async function exchangeCodeForTokens(code) {
  ensureMlEnvironment();
  const data = await mlTokenRequest({
    grant_type: 'authorization_code',
    client_id: ML_CLIENT_ID,
    client_secret: ML_CLIENT_SECRET,
    code,
    redirect_uri: ML_REDIRECT_URI,
  });
  const userInfo = await getUserInfo(data.access_token);
  return { ...data, userInfo };
}

async function connectFromAuthorizationCode(code) {
  const tokens = await exchangeCodeForTokens(code);
  return persistTokens(tokens, { userInfo: tokens.userInfo });
}

async function refreshTokens() {
  ensureMlEnvironment();
  const config = await getStoredConfig();
  if (!config?.refresh_token_enc) {
    const error = new Error('MercadoLibre no tiene refresh token configurado');
    error.status = 409;
    throw error;
  }

  const refreshToken = decryptText(config.refresh_token_enc);
  if (!refreshToken) {
    const error = new Error('No se pudo leer el refresh token de MercadoLibre');
    error.status = 500;
    throw error;
  }

  const refreshed = await mlTokenRequest({
    grant_type: 'refresh_token',
    client_id: ML_CLIENT_ID,
    client_secret: ML_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  return persistTokens(refreshed, {
    refresh_token: refreshed.refresh_token || refreshToken,
    token_type: refreshed.token_type || config.token_type,
    scope: refreshed.scope || config.scope,
  });
}

async function getActiveAccessToken() {
  const config = await getStoredConfig();
  if (!config || Number(config.activo || 0) !== 1 || !config.access_token_enc) {
    const error = new Error('MercadoLibre no está conectado');
    error.status = 409;
    throw error;
  }

  const tokenExpiresAt = normalizeDateTime(config.token_expires_at);
  if (tokenExpiresAt && tokenExpiresAt.getTime() - Date.now() <= TOKEN_REFRESH_WINDOW_MS) {
    const refreshed = await refreshTokens();
    return decryptText(refreshed.config.access_token_enc);
  }

  const accessToken = decryptText(config.access_token_enc);
  if (!accessToken) {
    const error = new Error('No se pudo leer el access token de MercadoLibre');
    error.status = 500;
    throw error;
  }

  return accessToken;
}

async function resolveSellerUserId(accessToken) {
  const config = await getStoredConfig();
  if (config?.external_user_id) return String(config.external_user_id);
  const userInfo = await getUserInfo(accessToken);
  await integracionesRepo.upsertIntegracionConfig(PROVIDER, {
    external_user_id: userInfo.user_id,
    external_user_name: userInfo.nickname || userInfo.email || null,
    ultimo_sync_en: new Date(),
    ultimo_error: null,
  });
  return userInfo.user_id;
}

async function loadLocalProduct(productoId) {
  const product = await productRepo.findById(productoId);
  if (!product) {
    const error = new Error('Producto no encontrado');
    error.status = 404;
    throw error;
  }

  const { rows } = await query(
    `SELECT COALESCE(i.cantidad_disponible, 0)::float AS stock_quantity
       FROM productos p
  LEFT JOIN inventario i ON i.producto_id = p.id
      WHERE p.id = $1
      LIMIT 1`,
    [productoId]
  );

  return {
    ...product,
    stock_quantity: Number(rows[0]?.stock_quantity || 0),
  };
}

function buildSellerCustomField(product) {
  const codigo = product?.codigo ? `:${product.codigo}` : '';
  return `kaisen:${product.id}${codigo}`;
}

function parseSellerCustomField(value) {
  const match = String(value || '').match(/^kaisen:(\d+)/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function buildItemPayload(product, config = {}) {
  const categoryId = config.category_id || config.categoryId || null;
  if (!categoryId) {
    const error = new Error('category_id es requerido para publicar en MercadoLibre');
    error.status = 400;
    throw error;
  }

  const price =
    config.price != null ? Number(config.price) : Number(product.price_local || product.price || 0);
  const availableQuantity =
    config.available_quantity != null
      ? Number(config.available_quantity)
      : Math.max(0, Math.floor(Number(product.stock_quantity || 0)));

  if (!(price > 0)) {
    const error = new Error('El producto no tiene un precio válido para publicar en MercadoLibre');
    error.status = 400;
    throw error;
  }

  return {
    title: config.title || product.name,
    category_id: categoryId,
    price,
    currency_id: config.currency_id || DEFAULT_CURRENCY_ID,
    available_quantity: availableQuantity,
    buying_mode: config.buying_mode || DEFAULT_BUYING_MODE,
    condition: config.condition || DEFAULT_CONDITION,
    listing_type_id: config.listing_type_id || DEFAULT_LISTING_TYPE_ID,
    seller_custom_field: config.seller_custom_field || buildSellerCustomField(product),
    pictures: config.pictures || (product.image_url ? [{ source: product.image_url }] : undefined),
    attributes:
      Array.isArray(config.attributes) && config.attributes.length ? config.attributes : undefined,
    catalog_product_id: config.catalog_product_id || undefined,
  };
}

function roundMoney(value) {
  const numeric = Number(value) || 0;
  return Math.round(numeric * 100) / 100;
}

function normalizeSyncResult(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    producto_id: Number(row.producto_id),
    producto_nombre: row.producto_nombre || null,
    producto_codigo: row.producto_codigo || null,
    producto_precio:
      row.producto_precio != null ? Number(row.producto_precio) : null,
    producto_stock:
      row.producto_stock != null ? Number(row.producto_stock) : null,
    ml_item_id: row.ml_item_id || null,
    ml_permalink: row.ml_permalink || null,
    estado_publicacion: row.estado_publicacion || null,
    precio_publicado:
      row.precio_publicado != null ? Number(row.precio_publicado) : null,
    stock_publicado:
      row.stock_publicado != null ? Number(row.stock_publicado) : null,
    ultimo_sync_en: row.ultimo_sync_en || null,
    ultimo_error: row.ultimo_error || null,
    actualizado_en: row.actualizado_en || null,
  };
}

function buildUpdatePayloadFromProduct(product, config = {}) {
  const payload = {};
  const title = config.title || product.name;
  const price =
    config.price != null ? Number(config.price) : Number(product.price_local || product.price || 0);
  const availableQuantity =
    config.available_quantity != null
      ? Number(config.available_quantity)
      : Math.max(0, Math.floor(Number(product.stock_quantity || 0)));

  if (title) payload.title = title;
  if (Number.isFinite(price) && price > 0) payload.price = price;
  if (Number.isFinite(availableQuantity) && availableQuantity >= 0) {
    payload.available_quantity = Math.floor(availableQuantity);
  }
  if (Array.isArray(config.pictures) && config.pictures.length) payload.pictures = config.pictures;
  if (Array.isArray(config.attributes) && config.attributes.length) {
    payload.attributes = config.attributes;
  }
  return payload;
}

function splitDisplayName(value) {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  if (!raw) return { nombre: 'Cliente', apellido: 'MercadoLibre' };
  const parts = raw.split(' ');
  if (parts.length === 1) {
    return { nombre: parts[0], apellido: 'MercadoLibre' };
  }
  return {
    nombre: parts.shift(),
    apellido: parts.join(' '),
  };
}

function ensureClientTag(existingTags, nextTag) {
  const current = String(existingTags || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const normalized = current.map((item) => item.toLowerCase());
  if (!normalized.includes(String(nextTag || '').trim().toLowerCase()) && nextTag) {
    current.push(String(nextTag).trim());
  }
  return current.join(', ');
}

async function markConnected(extra = {}) {
  await integracionesRepo.setIntegracionStatus(PROVIDER, 'conectado', {
    ultimo_sync_en: new Date(),
    ultimo_error: null,
    ...extra,
  });
}

async function getItemById(mlItemId, accessToken) {
  return mlApiRequest(`/items/${encodeURIComponent(mlItemId)}`, {
    method: 'GET',
    token: accessToken,
  });
}

async function persistSyncState({
  productoId,
  mlItemId,
  itemPayload,
  integracionConfigId = null,
} = {}) {
  const existing =
    (productoId ? await integracionesRepo.getMlProductSyncByProductoId(productoId) : null) ||
    (mlItemId ? await integracionesRepo.getMlProductSyncByMlItemId(String(mlItemId)) : null) ||
    null;

  const resolvedProductoId = productoId || Number(existing?.producto_id || 0) || null;
  if (!resolvedProductoId) {
    return {
      ml_item_id: String(itemPayload?.id || mlItemId || ''),
      estado_publicacion: itemPayload?.status || null,
      precio_publicado:
        itemPayload?.price != null ? Number(itemPayload.price) : null,
      stock_publicado:
        itemPayload?.available_quantity != null
          ? Number(itemPayload.available_quantity)
          : null,
      ml_permalink: itemPayload?.permalink || null,
    };
  }

  await integracionesRepo.upsertMlProductSync({
    producto_id: resolvedProductoId,
    integracion_config_id: integracionConfigId ?? existing?.integracion_config_id ?? null,
    ml_item_id: String(itemPayload?.id || mlItemId || existing?.ml_item_id || ''),
    ml_permalink:
      itemPayload?.permalink ?? existing?.ml_permalink ?? null,
    estado_publicacion:
      itemPayload?.status || existing?.estado_publicacion || 'active',
    precio_publicado:
      itemPayload?.price != null
        ? Number(itemPayload.price)
        : existing?.precio_publicado ?? null,
    stock_publicado:
      itemPayload?.available_quantity != null
        ? Number(itemPayload.available_quantity)
        : existing?.stock_publicado ?? null,
    ultimo_sync_en: new Date(),
    ultimo_error: null,
    payload_json: itemPayload,
  });

  const fresh = await integracionesRepo.getMlProductSyncByProductoId(resolvedProductoId);
  return normalizeSyncResult(fresh);
}

async function publishProduct(productoId, config = {}) {
  const existing = await integracionesRepo.getMlProductSyncByProductoId(productoId);
  if (existing?.ml_item_id) {
    const error = new Error('El producto ya está sincronizado con MercadoLibre');
    error.status = 409;
    throw error;
  }

  const accessToken = await getActiveAccessToken();
  const product = await loadLocalProduct(productoId);
  const integrationConfig = await getStoredConfig();
  const created = await mlApiRequest('/items', {
    method: 'POST',
    token: accessToken,
    body: buildItemPayload(product, config),
  });

  const saved = await persistSyncState({
    productoId,
    mlItemId: created.id,
    itemPayload: created,
    integracionConfigId: integrationConfig?.id || null,
  });

  await markConnected();
  return saved;
}

async function updateMlItem(mlItemId, payload = {}) {
  const body = {};
  for (const key of [
    'title',
    'price',
    'available_quantity',
    'status',
    'pictures',
    'attributes',
  ]) {
    if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
      body[key] = payload[key];
    }
  }

  if (!Object.keys(body).length) {
    const error = new Error('No hay cambios válidos para enviar a MercadoLibre');
    error.status = 400;
    throw error;
  }

  const accessToken = await getActiveAccessToken();
  return mlApiRequest(`/items/${encodeURIComponent(mlItemId)}`, {
    method: 'PUT',
    token: accessToken,
    body,
  });
}

async function updateProductPrice(mlItemId, price) {
  const numericPrice = Number(price);
  if (!(numericPrice > 0)) {
    const error = new Error('price debe ser mayor a 0');
    error.status = 400;
    throw error;
  }

  const updated = await updateMlItem(mlItemId, { price: numericPrice });
  const integrationConfig = await getStoredConfig();
  const saved = await persistSyncState({
    mlItemId,
    itemPayload: updated,
    integracionConfigId: integrationConfig?.id || null,
  });
  await markConnected();
  return saved;
}

async function updateProductStock(mlItemId, stock) {
  const numericStock = Number(stock);
  if (!Number.isFinite(numericStock) || numericStock < 0) {
    const error = new Error('stock debe ser 0 o mayor');
    error.status = 400;
    throw error;
  }

  const updated = await updateMlItem(mlItemId, {
    available_quantity: Math.floor(numericStock),
  });
  const integrationConfig = await getStoredConfig();
  const saved = await persistSyncState({
    mlItemId,
    itemPayload: updated,
    integracionConfigId: integrationConfig?.id || null,
  });
  await markConnected();
  return saved;
}

async function syncProduct(productoId, config = {}) {
  const existing = await integracionesRepo.getMlProductSyncByProductoId(productoId);
  if (!existing?.ml_item_id) {
    return publishProduct(productoId, config);
  }

  const product = await loadLocalProduct(productoId);
  const integrationConfig = await getStoredConfig();
  const updated = await updateMlItem(existing.ml_item_id, buildUpdatePayloadFromProduct(product, config));
  const saved = await persistSyncState({
    productoId,
    mlItemId: existing.ml_item_id,
    itemPayload: updated,
    integracionConfigId: integrationConfig?.id || null,
  });
  await markConnected();
  return saved;
}

async function updateSyncStatus(mlItemId, status) {
  const updated = await updateMlItem(mlItemId, { status });
  const integrationConfig = await getStoredConfig();
  const saved = await persistSyncState({
    mlItemId,
    itemPayload: updated,
    integracionConfigId: integrationConfig?.id || null,
  });
  await markConnected();
  return saved;
}

async function pauseItem(mlItemId) {
  return updateSyncStatus(mlItemId, 'paused');
}

async function reactivateItem(mlItemId) {
  return updateSyncStatus(mlItemId, 'active');
}

async function closeItem(mlItemId) {
  return updateSyncStatus(mlItemId, 'closed');
}

async function getOrders(filters = {}) {
  const accessToken = filters.accessToken || (await getActiveAccessToken());
  const sellerUserId = await resolveSellerUserId(accessToken);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || DEFAULT_IMPORT_LIMIT, 1), 50);
  const offset = Math.max(parseInt(filters.offset, 10) || 0, 0);
  const params = new URLSearchParams();
  params.set('seller', String(sellerUserId));
  params.set('sort', 'date_desc');
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const fromDate = normalizeDateTime(filters.from || filters.desde);
  const toDate = normalizeDateTime(filters.to || filters.hasta);
  if (fromDate) params.set('order.date_created.from', fromDate.toISOString());
  if (toDate) params.set('order.date_created.to', toDate.toISOString());
  if (filters.status) params.set('order.status', String(filters.status));

  const data = await mlApiRequest(`/orders/search?${params.toString()}`, {
    method: 'GET',
    token: accessToken,
  });

  return {
    results: Array.isArray(data.results)
      ? data.results
      : Array.isArray(data.orders)
      ? data.orders
      : [],
    paging: data.paging || null,
  };
}

function extractBuyerSeed(order) {
  const buyer = order?.buyer || {};
  const displayName =
    buyer.nickname ||
    order?.shipping?.receiver_address?.receiver_name ||
    order?.receiver_address?.receiver_name ||
    '';
  const splitName = splitDisplayName(
    [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || displayName
  );

  return {
    buyerId: buyer.id ? String(buyer.id) : null,
    nombre: splitName.nombre,
    apellido: splitName.apellido,
    email: buyer.email || null,
    telefono:
      buyer.phone?.number ||
      buyer.phone ||
      order?.shipping?.receiver_address?.receiver_phone ||
      order?.receiver_address?.receiver_phone ||
      null,
  };
}

async function findClientByMlBuyerId(mlBuyerId) {
  if (!mlBuyerId) return null;
  const { rows } = await query(
    `SELECT id, nombre, apellido, email, telefono, tags, estado, deleted_at
       FROM clientes
      WHERE deleted_at IS NULL
        AND LOWER(COALESCE(tags, '')) LIKE $1
      LIMIT 1`,
    [`%ml_buyer:${String(mlBuyerId).toLowerCase()}%`]
  );
  return rows[0] || null;
}

async function findClientByEmail(email) {
  if (!email) return null;
  const { rows } = await query(
    `SELECT id, nombre, apellido, email, telefono, tags, estado, deleted_at
       FROM clientes
      WHERE deleted_at IS NULL
        AND LOWER(email) = LOWER($1)
      LIMIT 1`,
    [String(email).trim()]
  );
  return rows[0] || null;
}

async function findOrCreateMlClient(order) {
  const seed = extractBuyerSeed(order);
  const buyerTag = seed.buyerId ? `ml_buyer:${seed.buyerId}` : null;
  let client = buyerTag ? await findClientByMlBuyerId(seed.buyerId) : null;
  if (!client && seed.email) {
    client = await findClientByEmail(seed.email);
  }

  if (client) {
    const updates = {};
    const tagsWithSource = ensureClientTag(client.tags, 'mercadolibre');
    const mergedTags = buyerTag ? ensureClientTag(tagsWithSource, buyerTag) : tagsWithSource;

    if (mergedTags !== String(client.tags || '')) updates.tags = mergedTags;
    if (!client.email && seed.email) updates.email = seed.email;
    if (!client.telefono && seed.telefono) updates.telefono = seed.telefono;
    if (!client.nombre && seed.nombre) updates.nombre = seed.nombre;
    if (!client.apellido && seed.apellido) updates.apellido = seed.apellido;
    if (String(client.estado || '').toLowerCase() !== 'activo') updates.estado = 'activo';

    if (Object.keys(updates).length) {
      await clientRepo.update(Number(client.id), updates);
    }

    return {
      id: Number(client.id),
      created: false,
    };
  }

  const created = await clientRepo.create({
    nombre: seed.nombre,
    apellido: seed.apellido,
    telefono: seed.telefono,
    email: seed.email,
    estado: 'activo',
    tipo_cliente: 'minorista',
    segmento: 'mercadolibre',
    tags: [buyerTag, 'mercadolibre'].filter(Boolean).join(', '),
  });

  return {
    id: Number(created.id),
    created: true,
  };
}

async function resolveOrderItems(order, accessToken, integracionConfigId = null) {
  const orderItems = Array.isArray(order?.order_items) ? order.order_items : [];
  if (!orderItems.length) {
    const error = new Error('La orden de MercadoLibre no contiene items');
    error.status = 400;
    throw error;
  }

  const remoteItemCache = new Map();
  const resolved = [];
  const missing = [];

  for (const line of orderItems) {
    const quantity = Number(line.quantity || line.unit_quantity || 0);
    const rawItem = line.item || {};
    const mlItemId = rawItem.id ? String(rawItem.id) : null;
    let syncRow = mlItemId
      ? await integracionesRepo.getMlProductSyncByMlItemId(mlItemId)
      : null;
    let remoteItem = null;
    let productoId = syncRow?.producto_id ? Number(syncRow.producto_id) : null;

    if (!productoId && mlItemId) {
      if (!remoteItemCache.has(mlItemId)) {
        try {
          remoteItemCache.set(mlItemId, await getItemById(mlItemId, accessToken));
        } catch {
          remoteItemCache.set(mlItemId, null);
        }
      }
      remoteItem = remoteItemCache.get(mlItemId);

      productoId = parseSellerCustomField(
        rawItem.seller_custom_field || remoteItem?.seller_custom_field
      );

      if (!productoId) {
        const sellerSku = rawItem.seller_sku || remoteItem?.seller_sku || null;
        if (sellerSku) {
          const localByCode = await productRepo.findByCodigo(sellerSku);
          if (localByCode?.id) productoId = Number(localByCode.id);
        }
      }
    }

    let product = null;
    if (productoId) {
      try {
        product = await loadLocalProduct(productoId);
      } catch {
        product = null;
      }
    }

    if (!product) {
      missing.push({
        ml_item_id: mlItemId,
        title: rawItem.title || line.title || null,
      });
      continue;
    }

    const listedUnitPrice = Number(
      line.unit_price || rawItem.unit_price || 0
    );
    const fullUnitPrice = Number(line.full_unit_price || 0);
    const fallbackUnitPrice =
      listedUnitPrice > 0
        ? listedUnitPrice
        : quantity > 0 && fullUnitPrice > 0
        ? fullUnitPrice / quantity
        : Number(product.price_local || product.price || 0);

    if (!(quantity > 0) || !(fallbackUnitPrice > 0)) {
      missing.push({
        ml_item_id: mlItemId,
        title: rawItem.title || line.title || null,
      });
      continue;
    }

    if (!syncRow && mlItemId) {
      syncRow = await integracionesRepo.upsertMlProductSync({
        producto_id: Number(product.id),
        integracion_config_id: integracionConfigId,
        ml_item_id: mlItemId,
        ml_permalink: remoteItem?.permalink || null,
        estado_publicacion: remoteItem?.status || 'active',
        precio_publicado:
          remoteItem?.price != null ? Number(remoteItem.price) : roundMoney(fallbackUnitPrice),
        stock_publicado:
          remoteItem?.available_quantity != null
            ? Number(remoteItem.available_quantity)
            : null,
        ultimo_sync_en: new Date(),
        ultimo_error: null,
        payload_json: remoteItem || rawItem,
      });
    }

    resolved.push({
      producto_id: Number(product.id),
      cantidad: quantity,
      precio_unitario: roundMoney(fallbackUnitPrice),
    });
  }

  if (missing.length) {
    const error = new Error(
      `No se pudieron mapear ${missing.length} item(s) de MercadoLibre a productos de Kaisen`
    );
    error.status = 400;
    error.details = missing;
    throw error;
  }

  return resolved;
}

function isOrderCancelled(order) {
  const statuses = [
    order?.status,
    order?.status_detail,
    order?.shipping?.status,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  return statuses.some((status) =>
    ['cancelled', 'cancelado', 'cancelled_by_user', 'cancelled_by_seller'].includes(status)
  );
}

function isOrderPaid(order) {
  if (Number(order?.paid_amount || 0) > 0) return true;
  const payments = Array.isArray(order?.payments) ? order.payments : [];
  return payments.some((payment) => {
    const status = String(payment?.status || '').trim().toLowerCase();
    const amount = Number(
      payment?.transaction_amount ||
        payment?.total_paid_amount ||
        payment?.amount ||
        0
    );
    return ['approved', 'accredited', 'paid'].includes(status) && amount > 0;
  });
}

function resolveApprovedAmount(order) {
  const payments = Array.isArray(order?.payments) ? order.payments : [];
  const approved = payments.reduce((acc, payment) => {
    const status = String(payment?.status || '').trim().toLowerCase();
    if (!['approved', 'accredited', 'paid'].includes(status)) return acc;
    const amount = Number(
      payment?.transaction_amount ||
        payment?.total_paid_amount ||
        payment?.amount ||
        0
    );
    return acc + (amount > 0 ? amount : 0);
  }, 0);

  if (approved > 0) return roundMoney(approved);
  if (Number(order?.paid_amount || 0) > 0) return roundMoney(order.paid_amount);
  if (isOrderPaid(order) && Number(order?.total_amount || 0) > 0) {
    return roundMoney(order.total_amount);
  }
  return 0;
}

async function getOrderById(mlOrderId, accessToken = null) {
  const token = accessToken || (await getActiveAccessToken());
  return mlApiRequest(`/orders/${encodeURIComponent(mlOrderId)}`, {
    method: 'GET',
    token,
  });
}

async function importOrderAsVenta(mlOrderId, options = {}) {
  const accessToken = options.accessToken || (await getActiveAccessToken());
  const integrationConfig = await getStoredConfig();
  let order = options.order || null;
  if (!order || !Array.isArray(order.order_items) || !order.order_items.length) {
    order = await getOrderById(mlOrderId, accessToken);
  }
  const orderId = String(order?.id || mlOrderId || '').trim();
  if (!orderId) {
    const error = new Error('mlOrderId inválido');
    error.status = 400;
    throw error;
  }

  const claim = await integracionesRepo.claimMlOrderImportProcessing({
    ml_order_id: orderId,
    integracion_config_id: integrationConfig?.id || null,
    ml_buyer_id: order?.buyer?.id ? String(order.buyer.id) : null,
    ml_shipping_id: order?.shipping?.id ? String(order.shipping.id) : null,
    ml_pack_id: order?.pack_id ? String(order.pack_id) : null,
    estado_orden: order?.status || null,
    total_order: Number(order?.total_amount || 0) || null,
    fecha_orden: order?.date_created || null,
    importado_en: new Date(),
    payload_json: order,
  });

  if (!claim.claimed) {
    if (claim.row?.venta_id) {
      return {
        imported: false,
        already_imported: true,
        ml_order_id: orderId,
        venta_id: Number(claim.row.venta_id),
      };
    }

    return {
      imported: false,
      already_processing: true,
      ml_order_id: orderId,
    };
  }

  let createdVenta = null;
  let createdPago = null;
  let usedReservaFallback = false;

  try {
    if (isOrderCancelled(order)) {
      await integracionesRepo.updateMlOrderImport(orderId, {
        integracion_config_id: integrationConfig?.id || null,
        ml_buyer_id: order?.buyer?.id ? String(order.buyer.id) : null,
        ml_shipping_id: order?.shipping?.id ? String(order.shipping.id) : null,
        ml_pack_id: order?.pack_id ? String(order.pack_id) : null,
        estado_orden: order?.status || null,
        estado_importacion: 'omitido',
        total_order: Number(order?.total_amount || 0) || null,
        fecha_orden: order?.date_created || null,
        importado_en: new Date(),
        ultimo_error: null,
        payload_json: order,
      });
      return {
        imported: false,
        skipped: 'cancelled',
        ml_order_id: orderId,
      };
    }

    const client = await findOrCreateMlClient(order);
    const items = await resolveOrderItems(order, accessToken, integrationConfig?.id || null);

    try {
      createdVenta = await salesRepo.createVenta({
        cliente_id: Number(client.id),
        fecha: order?.date_created || new Date(),
        items,
        es_reserva: false,
        price_list_type: 'local',
        allow_custom_unit_price: true,
      });
    } catch (error) {
      if (error?.status === 409 || error?.code === 'STOCK_INSUFICIENTE') {
        usedReservaFallback = true;
        createdVenta = await salesRepo.createVenta({
          cliente_id: Number(client.id),
          fecha: order?.date_created || new Date(),
          items,
          es_reserva: true,
          price_list_type: 'local',
          allow_custom_unit_price: true,
        });
      } else {
        throw error;
      }
    }

    const approvedAmount = resolveApprovedAmount(order);
    if (approvedAmount > 0 && isOrderPaid(order)) {
      createdPago = await paymentRepo.crearPago({
        venta_id: Number(createdVenta.id),
        cliente_id: Number(client.id),
        monto: approvedAmount,
        fecha:
          order?.date_closed ||
          order?.date_last_updated ||
          order?.date_created ||
          new Date(),
        metodo: 'otro',
      });
    }

    await integracionesRepo.updateMlOrderImport(orderId, {
      integracion_config_id: integrationConfig?.id || null,
      venta_id: Number(createdVenta.id),
      ml_buyer_id: order?.buyer?.id ? String(order.buyer.id) : null,
      ml_shipping_id: order?.shipping?.id ? String(order.shipping.id) : null,
      ml_pack_id: order?.pack_id ? String(order.pack_id) : null,
      estado_orden: order?.status || null,
      estado_importacion: 'importado',
      total_order: Number(order?.total_amount || 0) || null,
      fecha_orden: order?.date_created || null,
      importado_en: new Date(),
      ultimo_error: null,
      payload_json: order,
    });

    await markConnected();

    return {
      imported: true,
      ml_order_id: orderId,
      venta_id: Number(createdVenta.id),
      local_pago_id: Number(createdPago?.pago_id || 0) || null,
      es_reserva: Boolean(createdVenta?.es_reserva || usedReservaFallback),
    };
  } catch (error) {
    await integracionesRepo
      .updateMlOrderImport(orderId, {
        integracion_config_id: integrationConfig?.id || null,
        venta_id: createdVenta?.id ? Number(createdVenta.id) : null,
        ml_buyer_id: order?.buyer?.id ? String(order.buyer.id) : null,
        ml_shipping_id: order?.shipping?.id ? String(order.shipping.id) : null,
        ml_pack_id: order?.pack_id ? String(order.pack_id) : null,
        estado_orden: order?.status || null,
        estado_importacion: createdVenta?.id ? 'parcial' : 'error',
        total_order: Number(order?.total_amount || 0) || null,
        fecha_orden: order?.date_created || null,
        importado_en: new Date(),
        ultimo_error: error.message || 'No se pudo importar la orden',
        payload_json: order,
      })
      .catch((repoError) => {
        logger.error({ err: repoError, ml_order_id: orderId }, 'ml import state update failed');
      });

    throw error;
  }
}

async function importOrders(filters = {}) {
  const accessToken = await getActiveAccessToken();
  const { results, paging } = await getOrders({
    ...filters,
    accessToken,
  });
  const summary = {
    total: results.length,
    imported: 0,
    skipped: 0,
    errors: 0,
    results: [],
    paging,
  };

  for (const order of results) {
    const orderId = String(order?.id || '').trim();
    try {
      const result = await importOrderAsVenta(orderId, {
        order,
        accessToken,
      });
      summary.results.push(result);
      if (result.imported) summary.imported += 1;
      else summary.skipped += 1;
    } catch (error) {
      summary.errors += 1;
      summary.results.push({
        imported: false,
        ml_order_id: orderId,
        error: error.message || 'No se pudo importar la orden',
      });
    }
  }

  return summary;
}

async function getStatus() {
  const config = await getStoredConfig();
  if (!config) {
    return {
      connected: false,
      provider: PROVIDER,
      status: 'desconectado',
      ml_user_id: null,
      ml_user_name: null,
      token_expires_at: null,
      last_sync_at: null,
      last_error: null,
      webhook_secret_configured: false,
    };
  }

  return {
    connected: Number(config.activo || 0) === 1 && Boolean(config.access_token_enc),
    provider: PROVIDER,
    status: config.estado || 'desconectado',
    ml_user_id: config.external_user_id || null,
    ml_user_name: config.external_user_name || null,
    token_expires_at: config.token_expires_at || null,
    last_sync_at: config.ultimo_sync_en || null,
    last_error: config.ultimo_error || null,
    webhook_secret_configured: Boolean(config.webhook_secret_enc),
  };
}

async function disconnect() {
  await integracionesRepo.disableIntegracion(PROVIDER);
  return getStatus();
}

async function validateWebhookSignature({ headers = {}, query = {}, body = {} } = {}) {
  const config = await getStoredConfig();
  if (!config?.webhook_secret_enc) return true;

  const webhookSecret = decryptText(config.webhook_secret_enc);
  if (!webhookSecret) return false;

  const signatureHeader =
    headers['x-signature'] ||
    headers['x-ml-signature'] ||
    headers['x-hub-signature-256'] ||
    headers['X-Signature'] ||
    headers['X-ML-Signature'] ||
    headers['X-Hub-Signature-256'];
  const parsed = parseSignatureHeader(signatureHeader);
  const ts =
    parsed.ts ||
    headers['x-timestamp'] ||
    headers['x-ts'] ||
    headers['X-Timestamp'] ||
    headers['X-Ts'];
  const requestId =
    headers['x-request-id'] ||
    headers['X-Request-Id'];
  const digest =
    parsed.v1 ||
    parsed.sha256 ||
    parsed.signature ||
    String(signatureHeader || '').replace(/^sha256=/i, '').trim();
  const resource =
    query.resource ||
    body?.resource ||
    body?.data?.id ||
    body?.id ||
    '';
  const topic =
    query.topic ||
    body?.topic ||
    body?.type ||
    '';

  if (!ts || !requestId || !digest || !resource) return false;

  const tsMs = normalizeTsToMs(ts);
  if (!tsMs || Math.abs(Date.now() - tsMs) > WEBHOOK_MAX_AGE_MS) {
    return false;
  }

  const manifest = `resource:${resource};topic:${topic};request-id:${requestId};ts:${ts};`;
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(manifest)
    .digest('hex');

  return safeCompare(expected, String(digest).trim().toLowerCase());
}

async function processWebhookNotification({ headers = {}, query = {}, body = {} } = {}) {
  const validSignature = await validateWebhookSignature({ headers, query, body });
  const config = await getStoredConfig();
  if (config?.webhook_secret_enc && !validSignature) {
    const error = new Error('Firma de webhook de MercadoLibre inválida');
    error.status = 401;
    throw error;
  }

  const topic = String(query.topic || body?.topic || body?.type || '').toLowerCase();
  const resource = query.resource || body?.resource || body?.data?.id || body?.id || '';

  if (topic && !topic.includes('order') && !String(resource).toLowerCase().includes('/orders/')) {
    return { ok: true, ignored: `unsupported_topic:${topic}` };
  }

  const mlOrderId = parseMlOrderId(resource || body?.id || body?.data?.id);
  if (!mlOrderId) {
    return { ok: true, ignored: 'missing_order_id' };
  }

  const result = await importOrderAsVenta(mlOrderId);
  return {
    ok: true,
    ...result,
  };
}

module.exports = {
  buildAuthorizationUrl,
  createOAuthStateToken,
  verifyOAuthStateToken,
  resolveFrontendIntegracionesUrl,
  exchangeCodeForTokens,
  connectFromAuthorizationCode,
  refreshTokens,
  getActiveAccessToken,
  publishProduct,
  updateMlItem,
  updateProductPrice,
  updateProductStock,
  pauseItem,
  reactivateItem,
  closeItem,
  getOrders,
  getOrderById,
  importOrderAsVenta,
  importOrders,
  syncProduct,
  getStatus,
  disconnect,
  validateWebhookSignature,
  processWebhookNotification,
};
