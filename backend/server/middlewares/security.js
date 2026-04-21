const rateLimit = require('express-rate-limit');
const logger = require('../lib/logger');
const crypto = require('crypto');

const failedLoginAttempts = new Map();
const FAILED_LOGIN_THRESHOLD = 5;

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function buildLimiterMessage({
  message = 'Demasiadas peticiones. Intenta nuevamente en unos minutos.',
  code = 'RATE_LIMIT_EXCEEDED',
} = {}) {
  return {
    error: message,
    code,
  };
}

/**
 * Envia una alerta de seguridad al duenio via WhatsApp (alertService).
 * Es un lazy-require para evitar dependencia circular en el boot.
 *
 * @param {string} message
 */
async function sendSMSNotification(message) {
  try {
    const { sendSecurityAlert } = require('../services/alertService');
    await sendSecurityAlert(message);
  } catch (err) {
    // Fallback silencioso para tests o boot parcial.
    logger.warn('[Security] alerta de seguridad (fallback consola):', message);
  }
}

function createLimiter({
  key,
  windowMs,
  max,
  message,
  code,
  notify = false,
  standardHeaders = true,
  legacyHeaders = false,
} = {}) {
  const resolvedWindowMs = toPositiveInt(windowMs, 60_000);
  const resolvedMax = toPositiveInt(max, 60);
  const payload = buildLimiterMessage({ message, code });

  return rateLimit({
    windowMs: resolvedWindowMs,
    max: resolvedMax,
    standardHeaders,
    legacyHeaders,
    handler: (req, res) => {
      if (notify) {
        const routeKey = key || req.originalUrl || req.path || 'unknown-route';
        sendSMSNotification(
          `Rate limit excedido en ${routeKey} desde IP ${req.ip}`
        ).catch(() => {});
      }
      const retryAfterSeconds = Math.ceil(resolvedWindowMs / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        ...payload,
        retry_after_seconds: retryAfterSeconds,
      });
    },
  });
}

const loginLimiter = createLimiter({
  key: 'auth:login',
  windowMs: process.env.RATE_LIMIT_LOGIN_WINDOW_MS || 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_LOGIN_MAX || 5,
  message: 'Demasiados intentos de login. Espera 15 minutos antes de reintentar.',
  code: 'AUTH_LOGIN_RATE_LIMITED',
  notify: true,
});

const otpLimiter = createLimiter({
  key: 'auth:otp',
  windowMs: process.env.RATE_LIMIT_OTP_WINDOW_MS || 10 * 60 * 1000,
  max: process.env.RATE_LIMIT_OTP_MAX || 10,
  message: 'Demasiados intentos de verificacion. Espera unos minutos antes de continuar.',
  code: 'AUTH_OTP_RATE_LIMITED',
  notify: true,
});

const refreshLimiter = createLimiter({
  key: 'auth:refresh',
  windowMs: process.env.RATE_LIMIT_REFRESH_WINDOW_MS || 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_REFRESH_MAX || 20,
  message: 'Demasiados intentos de renovacion de sesion. Intenta nuevamente en unos minutos.',
  code: 'AUTH_REFRESH_RATE_LIMITED',
});

const publicLimiter = createLimiter({
  key: 'public',
  windowMs: process.env.RATE_LIMIT_PUBLIC_WINDOW_MS || 60 * 1000,
  max: process.env.RATE_LIMIT_PUBLIC_MAX || 20,
  message: 'Demasiadas solicitudes publicas desde esta IP. Intenta nuevamente en un minuto.',
  code: 'PUBLIC_RATE_LIMITED',
});

const exportLimiter = createLimiter({
  key: 'exports',
  windowMs: process.env.RATE_LIMIT_EXPORT_WINDOW_MS || 60 * 1000,
  max: process.env.RATE_LIMIT_EXPORT_MAX || 3,
  message: 'Demasiadas exportaciones en poco tiempo. Espera un minuto antes de generar otra.',
  code: 'EXPORT_RATE_LIMITED',
  notify: true,
});

const uploadLimiter = createLimiter({
  key: 'uploads',
  windowMs: process.env.RATE_LIMIT_UPLOAD_WINDOW_MS || 60 * 1000,
  max: process.env.RATE_LIMIT_UPLOAD_MAX || 10,
  message: 'Maximo 10 cargas por minuto desde esta IP.',
  code: 'UPLOAD_RATE_LIMITED',
  notify: true,
});

const whatsappLimiter = createLimiter({
  key: 'whatsapp',
  windowMs: process.env.RATE_LIMIT_WHATSAPP_WINDOW_MS || 60 * 1000,
  max: process.env.RATE_LIMIT_WHATSAPP_MAX || 20,
  message: 'Limite temporal alcanzado para acciones de WhatsApp.',
  code: 'WHATSAPP_RATE_LIMITED',
  notify: true,
});

const aiLimiter = createLimiter({
  key: 'ai',
  windowMs: process.env.RATE_LIMIT_AI_WINDOW_MS || 60 * 1000,
  max: process.env.RATE_LIMIT_AI_MAX || 30,
  message: 'El modulo de IA recibio demasiadas solicitudes. Reintenta en unos segundos.',
  code: 'AI_RATE_LIMITED',
});

const apiLimiter = createLimiter({
  key: 'api',
  windowMs: process.env.RATE_LIMIT_API_WINDOW_MS || 60 * 1000,
  max: process.env.RATE_LIMIT_API_MAX || 60,
  message: 'Demasiadas peticiones a la API. Intenta nuevamente en un minuto.',
  code: 'API_RATE_LIMITED',
});

const apiGlobalLimiter = createLimiter({
  key: 'api-global',
  windowMs: process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_GLOBAL_MAX || 300,
  message: 'Demasiadas peticiones globales desde esta IP. Espera unos minutos antes de continuar.',
  code: 'API_GLOBAL_RATE_LIMITED',
});

const loggingMiddleware = (req, res, next) => {
  const reqId = crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  const startedAt = process.hrtime.bigint();
  const ua = req.get('User-Agent');
  const authHeader = req.get('Authorization');
  const redactedAuth = authHeader
    ? `${authHeader.split(' ')[0]} [REDACTED]`
    : 'none';

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const entry = {
      ts: new Date().toISOString(),
      request_id: reqId,
      ip: req.ip,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Number(durationMs.toFixed(2)),
      ua,
      auth: redactedAuth,
    };
    logger.info(JSON.stringify(entry));
  });

  next();
};

const pathTraversalProtection = (req, res, next) => {
  if (req.url.includes('..') || req.url.includes('//')) {
    sendSMSNotification(
      `Intento de path traversal detectado desde IP ${req.ip} en URL ${req.originalUrl}`
    ).catch(() => {});
    return res.status(400).send('Ruta invalida');
  }
  next();
};

module.exports = {
  apiLimiter,
  apiGlobalLimiter,
  aiLimiter,
  exportLimiter,
  uploadLimiter,
  whatsappLimiter,
  loginLimiter,
  otpLimiter,
  publicLimiter,
  refreshLimiter,
  loggingMiddleware,
  pathTraversalProtection,
  sendSMSNotification,
  failedLoginAttempts,
  FAILED_LOGIN_THRESHOLD,
  createLimiter,
};
