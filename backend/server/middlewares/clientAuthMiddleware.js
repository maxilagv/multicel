const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const JWT_ALG = process.env.JWT_ALG || 'HS256';

function clientAuthMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de cliente requerido' });
  }

  if (!SECRET) {
    console.error('Error: JWT_SECRET no configurado para clientes.');
    return res.status(500).json({ error: 'Configuracion del servidor incompleta.' });
  }

  try {
    const verifyOptions = { algorithms: [JWT_ALG] };
    if (process.env.JWT_ISSUER) verifyOptions.issuer = process.env.JWT_ISSUER;
    if (process.env.JWT_AUDIENCE) verifyOptions.audience = process.env.JWT_AUDIENCE;
    const payload = jwt.verify(token, SECRET, verifyOptions);
    if (!payload || payload.role !== 'cliente') {
      return res.status(403).json({ error: 'Token no autorizado para clientes' });
    }
    req.client = {
      id: payload.sub,
      email: payload.email,
    };
    req.token = token;
    next();
  } catch (err) {
    console.error('Error de verificacion de token de cliente:', err.message);
    return res.status(401).json({ error: 'Token de cliente invalido o expirado' });
  }
}

module.exports = clientAuthMiddleware;
