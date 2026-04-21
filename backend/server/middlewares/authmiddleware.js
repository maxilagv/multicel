const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const jwtBlacklistRepo = require('../db/repositories/jwtBlacklistRepository');
const {
  isTokenRevoked,
  markTokenRevoked,
} = require('../services/tokenRevocationStore');

const SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;
const JWT_ALG = process.env.JWT_ALG || 'HS256';

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function decodeToken(token) {
  try {
    return jwt.decode(token) || {};
  } catch (_) {
    return {};
  }
}

function deriveJti(token, decoded) {
  if (decoded && decoded.jti) return String(decoded.jti);
  return hashToken(token);
}

function resolveExpiryMs(decoded) {
  if (decoded && Number.isFinite(decoded.exp)) {
    return Number(decoded.exp) * 1000;
  }
  return Date.now() + 24 * 60 * 60 * 1000;
}

function normalizeReqPath(req) {
  const fromPath = String(req?.path || '').trim();
  if (fromPath.startsWith('/api/')) return fromPath;
  if (fromPath.startsWith('/')) return `/api${fromPath}`;
  const fromOriginal = String(req?.originalUrl || '').split('?')[0].trim();
  if (fromOriginal.startsWith('/')) return fromOriginal;
  return '/';
}

function isFleteroAllowedRequest(req) {
  const method = String(req?.method || 'GET').toUpperCase();
  const path = normalizeReqPath(req);
  if (method === 'POST' && path === '/api/logout') return true;
  if (method === 'GET' && (path === '/api/ventas' || path === '/api/ventas/')) return true;
  if (method === 'GET' && /^\/api\/reportes\/remito\/\d+\.pdf$/.test(path)) return true;
  return false;
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido', code: 'SESSION_EXPIRED' });
  }

  if (!SECRET) {
    console.error('JWT_SECRET no esta definida para verificar access tokens.');
    return res.status(500).json({ error: 'Configuracion del servidor incompleta.' });
  }

  try {
    const decoded = decodeToken(token);
    const jti = deriveJti(token, decoded);

    if (await isTokenRevoked({ jti, token })) {
      return res.status(401).json({ error: 'Token invalido o revocado', code: 'SESSION_EXPIRED' });
    }

    const blacklisted = await jwtBlacklistRepo.isBlacklisted({ jti, token });
    if (blacklisted) {
      await markTokenRevoked({
        jti,
        token,
        expiresAtMs: resolveExpiryMs(decoded),
      });
      return res.status(401).json({ error: 'Token invalido o revocado', code: 'SESSION_EXPIRED' });
    }

    const verifyOptions = { algorithms: [JWT_ALG] };
    if (process.env.JWT_ISSUER) verifyOptions.issuer = process.env.JWT_ISSUER;
    if (process.env.JWT_AUDIENCE) verifyOptions.audience = process.env.JWT_AUDIENCE;

    const user = jwt.verify(token, SECRET, verifyOptions);
    if (user && user.role === 'cliente') {
      return res.status(403).json({ error: 'Token de cliente no autorizado', code: 'FORBIDDEN' });
    }
    if (user && user.role === 'fletero' && !isFleteroAllowedRequest(req)) {
      return res
        .status(403)
        .json({ error: 'Perfil fletero sin permisos para este recurso', code: 'FORBIDDEN' });
    }

    req.user = user;
    req.token = token;
    return next();
  } catch (err) {
    console.error('Error de verificacion de token:', err?.message || err);
    return res.status(401).json({ error: 'Token invalido o expirado', code: 'SESSION_EXPIRED' });
  }
}

async function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();

  if (!SECRET) {
    console.error('JWT_SECRET no esta definida para verificar access tokens.');
    return res.status(500).json({ error: 'Configuracion del servidor incompleta.' });
  }

  try {
    const decoded = decodeToken(token);
    const jti = deriveJti(token, decoded);

    if (await isTokenRevoked({ jti, token })) {
      return res.status(401).json({ error: 'Token invalido o revocado', code: 'SESSION_EXPIRED' });
    }

    const blacklisted = await jwtBlacklistRepo.isBlacklisted({ jti, token });
    if (blacklisted) {
      await markTokenRevoked({
        jti,
        token,
        expiresAtMs: resolveExpiryMs(decoded),
      });
      return res.status(401).json({ error: 'Token invalido o revocado', code: 'SESSION_EXPIRED' });
    }

    const verifyOptions = { algorithms: [JWT_ALG] };
    if (process.env.JWT_ISSUER) verifyOptions.issuer = process.env.JWT_ISSUER;
    if (process.env.JWT_AUDIENCE) verifyOptions.audience = process.env.JWT_AUDIENCE;

    const user = jwt.verify(token, SECRET, verifyOptions);
    if (user && user.role === 'cliente') {
      return res.status(403).json({ error: 'Token de cliente no autorizado', code: 'FORBIDDEN' });
    }

    req.user = user;
    req.token = token;
    return next();
  } catch (err) {
    console.error('Error de verificacion de token:', err?.message || err);
    return res.status(401).json({ error: 'Token invalido o expirado', code: 'SESSION_EXPIRED' });
  }
}

function addTokenToBlacklist(token) {
  if (!token) return;
  const decoded = decodeToken(token);
  const jti = deriveJti(token, decoded);
  const expMs = resolveExpiryMs(decoded);

  markTokenRevoked({ jti, token, expiresAtMs: expMs }).catch((err) =>
    console.error('Runtime blacklist error:', err?.message || err)
  );

  jwtBlacklistRepo
    .add({ jti, token, expires_at: new Date(expMs) })
    .catch((err) => console.error('Blacklist persist error:', err?.message || err));

  if (Math.random() < 0.05) {
    jwtBlacklistRepo.cleanupExpired().catch(() => {});
  }
}

module.exports = authMiddleware;
module.exports.addTokenToBlacklist = addTokenToBlacklist;
module.exports.SECRET = SECRET;
module.exports.REFRESH_SECRET = REFRESH_SECRET;
module.exports.optional = optionalAuthMiddleware;
