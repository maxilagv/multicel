const logger = require('../lib/logger');

const N8N_BASE_URL =
  process.env.N8N_BASE_URL ||
  process.env.N8N_WEBHOOK_BASE_URL ||
  '';
const N8N_TOKEN =
  process.env.N8N_WEBHOOK_TOKEN ||
  process.env.N8N_WEBHOOK_SECRET ||
  '';
const DEFAULT_TIMEOUT_MS = Math.max(1000, Number(process.env.N8N_TIMEOUT_MS || 8000));

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isEnabled() {
  return Boolean(normalizeBaseUrl(N8N_BASE_URL));
}

async function deliverEvent({ eventName, idempotencyKey, payload }) {
  const baseUrl = normalizeBaseUrl(N8N_BASE_URL);
  if (!baseUrl) {
    return {
      ok: false,
      skipped: 'n8n_not_configured',
      status: null,
      retryable: true,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const url = `${baseUrl}/webhook/${encodeURIComponent(String(eventName || '').trim())}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(N8N_TOKEN ? { 'X-Webhook-Token': N8N_TOKEN } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': String(idempotencyKey) } : {}),
      },
      body: JSON.stringify({
        event: eventName,
        idempotency_key: idempotencyKey || null,
        timestamp: new Date().toISOString(),
        data: payload || {},
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const text = await response.text().catch(() => '');
    return {
      ok: response.ok,
      status: response.status,
      retryable: response.status >= 500 || response.status === 429,
      body: text,
    };
  } catch (error) {
    clearTimeout(timer);
    const message = error?.name === 'AbortError'
      ? `Timeout enviando evento "${eventName}" a n8n`
      : error?.message || 'Error desconocido enviando evento a n8n';

    logger.warn({ err: message, eventName }, '[n8n] delivery failed');
    return {
      ok: false,
      status: null,
      retryable: true,
      errorMessage: message,
    };
  }
}

module.exports = {
  isEnabled,
  deliverEvent,
};
