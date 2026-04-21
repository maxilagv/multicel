const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { check, validationResult } = require('express-validator');
const { sendSMSNotification, failedLoginAttempts, FAILED_LOGIN_THRESHOLD } = require('../middlewares/security.js');
const { SECRET, REFRESH_SECRET, addTokenToBlacklist } = require('../middlewares/authmiddleware.js');
const { sendVerificationEmail } = require('../utils/mailer');
const users = require('../db/repositories/userRepository');
const tokens = require('../db/repositories/tokenRepository');

const JWT_ALG = process.env.JWT_ALG || 'HS256';
const JWT_ISSUER = process.env.JWT_ISSUER;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE;

function newJti() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

// OTP store (in-memory)
const otpStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_MAX_ATTEMPTS = 5;

function generateOtpCode() {
  const num = crypto.randomInt(0, 1000000);
  return num.toString().padStart(6, '0');
}

function newTransaction(email, userId, role) {
  const txId = crypto.randomBytes(16).toString('hex');
  const code = generateOtpCode();
  const expiresAt = Date.now() + OTP_TTL_MS;
  otpStore.set(txId, { email, userId, role: role || null, code, expiresAt, attempts: 0 });
  return { txId, code, expiresAt };
}

// Validation
const validateLogin = [
  check('email').isEmail().normalizeEmail(),
  // No sanitizar password para no alterar credenciales validas.
  check('password').isString().isLength({ min: 6 }),
];

function buildSignOpts(ttl) {
  const opts = { algorithm: JWT_ALG, expiresIn: ttl };
  if (JWT_ISSUER) opts.issuer = JWT_ISSUER;
  if (JWT_AUDIENCE) opts.audience = JWT_AUDIENCE;
  return opts;
}

async function issueTokens(user, meta = {}) {
  if (!SECRET || !REFRESH_SECRET) {
    throw new Error('Server JWT secrets not configured');
  }
  const payload = { sub: user.id, email: user.email, role: user.rol };
  const accessJti = newJti();
  const accessToken = jwt.sign(payload, SECRET, { ...buildSignOpts('15m'), jwtid: accessJti });

  const refreshJti = newJti();
  const refreshToken = jwt.sign({ sub: user.id, email: user.email }, REFRESH_SECRET, { ...buildSignOpts('7d'), jwtid: refreshJti });
  // Persist refresh token (expiry from now + 7d)
  const expMs = 7 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + expMs);
  await tokens.saveRefreshToken({
    user_id: user.id,
    token: refreshToken,
    jti: refreshJti,
    user_agent: meta.user_agent || null,
    ip: meta.ip || null,
    expires_at: expiresAt,
  });
  return { accessToken, refreshToken };
}

async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  const clientIp = req.ip;
  if (!failedLoginAttempts.has(clientIp)) failedLoginAttempts.set(clientIp, 0);

  try {
    const user = await users.findByEmail((email || '').trim().toLowerCase());
    if (!user || user.activo === false) {
      failedLoginAttempts.set(clientIp, failedLoginAttempts.get(clientIp) + 1);
      return res.status(401).json({ error: 'Usuario no autorizado' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      failedLoginAttempts.set(clientIp, failedLoginAttempts.get(clientIp) + 1);
      if (failedLoginAttempts.get(clientIp) >= FAILED_LOGIN_THRESHOLD) {
        sendSMSNotification(`Alerta: múltiples intentos fallidos desde IP ${clientIp} para ${user.email}`);
      }
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    failedLoginAttempts.delete(clientIp);
    const t = await issueTokens(user, { user_agent: req.get('User-Agent'), ip: req.ip });
    res.json(t);
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: 'Error de autenticación' });
  }
}

async function loginStep1(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { email, password } = req.body;
  const clientIp = req.ip;
  if (!failedLoginAttempts.has(clientIp)) failedLoginAttempts.set(clientIp, 0);
  try {
    const user = await users.findByEmail((email || '').trim().toLowerCase());
    if (!user || user.activo === false) {
      failedLoginAttempts.set(clientIp, failedLoginAttempts.get(clientIp) + 1);
      if (failedLoginAttempts.get(clientIp) >= FAILED_LOGIN_THRESHOLD) sendSMSNotification(`Alerta: IP ${clientIp} email no autorizado`);
      return res.status(401).json({ error: 'Usuario no autorizado' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      failedLoginAttempts.set(clientIp, failedLoginAttempts.get(clientIp) + 1);
      if (failedLoginAttempts.get(clientIp) >= FAILED_LOGIN_THRESHOLD) sendSMSNotification(`Alerta: IP ${clientIp} password incorrecta`);
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    failedLoginAttempts.delete(clientIp);
    const { txId, code } = newTransaction(user.email, user.id, user.rol);
    try { await sendVerificationEmail(user.email, code); } catch (e) { console.error('OTP email error:', e.message); return res.status(500).json({ error: 'No se pudo enviar el código' }); }
    return res.json({ otpSent: true, txId });
  } catch (e) {
    console.error('Login step1 error:', e.message);
    res.status(500).json({ error: 'Error de autenticación' });
  }
}

function loginStep2(req, res) {
  const { txId, code } = req.body || {};
  if (!txId || !code) return res.status(400).json({ error: 'txId y código requeridos' });
  const rec = otpStore.get(txId);
  if (!rec) return res.status(400).json({ error: 'Transacción no encontrada o expirada' });
  if (Date.now() > rec.expiresAt) { otpStore.delete(txId); return res.status(400).json({ error: 'Código expirado' }); }
  if (rec.attempts >= OTP_MAX_ATTEMPTS) { otpStore.delete(txId); return res.status(429).json({ error: 'Demasiados intentos' }); }
  rec.attempts += 1;
  if (String(code).trim() !== rec.code) return res.status(401).json({ error: 'Código incorrecto' });

  otpStore.delete(txId);
  if (!SECRET || !REFRESH_SECRET) return res.status(500).json({ error: 'Server JWT no configurado' });
  const payload = { sub: rec.userId, email: rec.email, role: rec.role || null };
  const accessToken = jwt.sign(payload, SECRET, { ...buildSignOpts('15m'), jwtid: newJti() });
  const refreshJti = newJti();
  const refreshToken = jwt.sign(payload, REFRESH_SECRET, { ...buildSignOpts('7d'), jwtid: refreshJti });
  const expMs = 7 * 24 * 60 * 60 * 1000;
  tokens
    .saveRefreshToken({
      user_id: rec.userId,
      token: refreshToken,
      jti: refreshJti,
      user_agent: req.get('User-Agent'),
      ip: req.ip,
      expires_at: new Date(Date.now() + expMs),
    })
    .catch(() => {});
  return res.json({ accessToken, refreshToken });
}

async function refreshToken(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token requerido' });
  if (!REFRESH_SECRET || !SECRET) return res.status(500).json({ error: 'JWT no configurado' });
  try {
    const verifyOptions = { algorithms: [JWT_ALG] };
    if (JWT_ISSUER) verifyOptions.issuer = JWT_ISSUER;
    if (JWT_AUDIENCE) verifyOptions.audience = JWT_AUDIENCE;
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET, verifyOptions);
    const valid = await tokens.isRefreshTokenValid(refreshToken);
    if (!valid) return res.status(403).json({ error: 'Refresh token inválido o revocado' });
    // Load user
    const user = await users.findById(decoded.sub);
    if (!user || user.activo === false) return res.status(403).json({ error: 'Usuario inactivo o no encontrado' });
    const accessToken = jwt.sign({ sub: user.id, email: user.email, role: user.rol }, SECRET, { ...buildSignOpts('15m'), jwtid: newJti() });
    res.json({ accessToken });
  } catch (err) {
    console.error('Refresh token error:', err.message);
    return res.status(403).json({ error: 'Refresh token inválido o expirado' });
  }
}

async function logout(req, res) {
  const accessToken = req.token;
  if (accessToken) addTokenToBlacklist(accessToken);
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    try { await tokens.revokeRefreshToken(refreshToken); } catch (_) {}
  }
  return res.status(200).json({ message: 'Sesión cerrada exitosamente.' });
}

module.exports = {
  login: [...validateLogin, login],
  loginStep1: [...validateLogin, loginStep1],
  loginStep2,
  refreshToken,
  logout,
};
