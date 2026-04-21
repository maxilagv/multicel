const crypto = require('crypto');
const apiKeyRepo = require('../db/repositories/apiKeyRepository');

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function extractToken(req) {
  const headerKey = req.get('x-api-key');
  if (headerKey) return String(headerKey).trim();

  const authHeader = req.get('authorization');
  if (!authHeader) return '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  return match ? String(match[1] || '').trim() : '';
}

async function internalApiKeyMiddleware(req, res, next) {
  try {
    const rawToken = extractToken(req);
    if (!rawToken) {
      return res.status(401).json({ error: 'Credencial interna requerida' });
    }

    const envToken = String(process.env.INTERNAL_API_TOKEN || '').trim();
    if (envToken && safeEqual(rawToken, envToken)) {
      req.internalAuth = {
        source: 'env',
        nombre: 'internal-env-token',
        permisos: { all: true },
      };
      return next();
    }

    const apiKey = await apiKeyRepo.findActiveByRawKey(rawToken);
    if (!apiKey) {
      return res.status(401).json({ error: 'Credencial interna invalida' });
    }

    await apiKeyRepo.touchLastUse(apiKey.id).catch(() => {});
    req.internalAuth = {
      source: 'db',
      id: Number(apiKey.id),
      nombre: apiKey.nombre,
      permisos: apiKey.permisos || {},
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = internalApiKeyMiddleware;
