const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const jwtBlacklistRepo = require('../db/repositories/jwtBlacklistRepository');

// Claves y parametros JWT, desde variables de entorno
const SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;
const JWT_ALG = process.env.JWT_ALG || 'HS256';

// Lista negra de tokens JWT invalidados (memoria + DB)
const tokenBlacklist = new Map();

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

function isBlacklistedLocal(token) {
  const exp = tokenBlacklist.get(token);
  if (!exp) return false;
  if (Date.now() >= exp) {
    tokenBlacklist.delete(token);
    return false;
  }
  return true;
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

/**
 * Middleware para verificar el token JWT de acceso.
 * Extrae el token del encabezado 'Authorization', lo verifica y adjunta la informacion del usuario a la solicitud.
 * Tambien verifica si el token esta en la lista negra.
 * @param {object} req - Objeto de solicitud de Express.
 * @param {object} res - Objeto de respuesta de Express.
 * @param {function} next - Funcion para pasar el control al siguiente middleware.
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extraer el token del encabezado 'Bearer <token>'

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  // Verificar que la clave secreta de JWT este definida
  if (!SECRET) {
    console.error('Error: La variable de entorno JWT_SECRET no esta definida para la verificacion del token.');
    return res.status(500).json({ error: 'Configuracion del servidor incompleta.' });
  }

  // Verificar si el token esta en la lista negra (memoria/DB)
  if (isBlacklistedLocal(token)) {
    return res.status(401).json({ error: 'Token invalido o revocado' });
  }

  try {
    const decoded = decodeToken(token);
    const jti = deriveJti(token, decoded);
    const blacklisted = await jwtBlacklistRepo.isBlacklisted({ jti, token });
    if (blacklisted) {
      tokenBlacklist.set(token, resolveExpiryMs(decoded));
      return res.status(401).json({ error: 'Token invalido o revocado' });
    }

    const verifyOptions = { algorithms: [JWT_ALG] };
    if (process.env.JWT_ISSUER) verifyOptions.issuer = process.env.JWT_ISSUER;
    if (process.env.JWT_AUDIENCE) verifyOptions.audience = process.env.JWT_AUDIENCE;
    const user = jwt.verify(token, SECRET, verifyOptions); // Verificar el token con restricciones
    if (user && user.role === 'cliente') {
      return res.status(403).json({ error: 'Token de cliente no autorizado' });
    }
    if (user && user.role === 'fletero' && !isFleteroAllowedRequest(req)) {
      return res.status(403).json({ error: 'Perfil fletero sin permisos para este recurso' });
    }
    req.user = user; // Adjuntar info del usuario a la solicitud
    req.token = token; // Adjuntar el token actual para posible invalidacion
    next(); // Continuar con la siguiente funcion de middleware o ruta
  } catch (err) {
    console.error('Error de verificacion de token:', err.message);
    // 401 permite que el frontend intente refrescar el access token con el refresh token
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

/**
 * Agrega un token a la lista negra.
 * @param {string} token - El token JWT a invalidar.
 */
function addTokenToBlacklist(token) {
  if (!token) return;
  const decoded = decodeToken(token);
  const jti = deriveJti(token, decoded);
  const expMs = resolveExpiryMs(decoded);
  tokenBlacklist.set(token, expMs);
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
