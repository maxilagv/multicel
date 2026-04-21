const crypto = require('crypto');

function getRequestUrl(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host') || '';
  const path = req.originalUrl || req.url || '';
  return `${proto}://${host}${path}`;
}

function buildExpectedSignature(authToken, url, params = {}) {
  const sortedKeys = Object.keys(params || {}).sort();
  const payload = sortedKeys.reduce((acc, key) => acc + key + String(params[key] ?? ''), url);
  return crypto.createHmac('sha1', String(authToken || '')).update(payload, 'utf8').digest('base64');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyTwilioWebhook(req) {
  const skipValidation = String(process.env.TWILIO_SKIP_SIGNATURE_VALIDATION || 'false')
    .trim()
    .toLowerCase();
  if (skipValidation === 'true' || skipValidation === '1') return true;

  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const providedSignature = req.get('x-twilio-signature');
  if (!authToken || !providedSignature) return false;

  const expected = buildExpectedSignature(authToken, getRequestUrl(req), req.body || {});
  return safeEqual(expected, providedSignature);
}

module.exports = {
  verifyTwilioWebhook,
  __test__: {
    buildExpectedSignature,
  },
};
