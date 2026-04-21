const { check, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const clientRepo = require('../db/repositories/clientRepository');
const clientAuthRepo = require('../db/repositories/clientAuthRepository');
const clientTokens = require('../db/repositories/clientRefreshTokenRepository');

const SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;
const JWT_ALG = process.env.JWT_ALG || 'HS256';
const JWT_ISSUER = process.env.JWT_ISSUER;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE;

function newJti() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function buildSignOpts(ttl) {
  const opts = { algorithm: JWT_ALG, expiresIn: ttl };
  if (JWT_ISSUER) opts.issuer = JWT_ISSUER;
  if (JWT_AUDIENCE) opts.audience = JWT_AUDIENCE;
  return opts;
}

async function issueTokens({ clienteId, email, req }) {
  if (!SECRET || !REFRESH_SECRET) {
    throw new Error('Server JWT secrets not configured');
  }
  const payload = { sub: clienteId, email, role: 'cliente' };
  const accessToken = jwt.sign(payload, SECRET, { ...buildSignOpts('15m'), jwtid: newJti() });
  const refreshJti = newJti();
  const refreshToken = jwt.sign(payload, REFRESH_SECRET, { ...buildSignOpts('7d'), jwtid: refreshJti });
  const expMs = 7 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + expMs);
  await clientTokens.saveRefreshToken({
    cliente_id: clienteId,
    token: refreshToken,
    jti: refreshJti,
    user_agent: req?.get ? req.get('user-agent') : null,
    ip: req?.ip || null,
    expires_at: expiresAt,
  });
  return { accessToken, refreshToken };
}

const validateRegister = [
  check('email').isEmail().normalizeEmail(),
  check('password').isLength({ min: 6 }).trim(),
  check('nombre').trim().notEmpty().withMessage('Nombre requerido'),
  check('apellido').optional().isString(),
  check('telefono').optional().isString(),
];

async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password, nombre, apellido, telefono } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();

  try {
    let cliente = await clientRepo.findByEmail(normalizedEmail);
    if (!cliente) {
      const created = await clientRepo.create({
        nombre,
        apellido,
        telefono,
        email: normalizedEmail,
        estado: 'activo',
      });
      cliente = await clientRepo.findById(created.id);
    }

    if (!cliente) {
      return res.status(400).json({ error: 'No se pudo crear el cliente' });
    }

    const existingAuth = await clientAuthRepo.findByClienteId(cliente.id);
    if (existingAuth) {
      return res.status(409).json({ error: 'El cliente ya tiene acceso configurado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await clientAuthRepo.createAuth({
      cliente_id: cliente.id,
      email: normalizedEmail,
      password_hash: passwordHash,
    });

    const tokens = await issueTokens({ clienteId: cliente.id, email: normalizedEmail, req });
    res.status(201).json(tokens);
  } catch (e) {
    console.error('Error en registro de cliente:', e.message);
    res.status(500).json({ error: 'No se pudo registrar el cliente' });
  }
}

const validateLogin = [
  check('email').isEmail().normalizeEmail(),
  check('password').isLength({ min: 6 }).trim(),
];

async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();

  try {
    const authRow = await clientAuthRepo.findByEmail(normalizedEmail);
    if (!authRow || authRow.activo === false) {
      return res.status(401).json({ error: 'Cliente no autorizado' });
    }
    const cliente = await clientRepo.findById(authRow.cliente_id);
    if (!cliente || cliente.estado !== 'activo') {
      return res.status(401).json({ error: 'Cliente inactivo o no encontrado' });
    }
    const match = await bcrypt.compare(password, authRow.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Contrase\u00f1a incorrecta' });
    }
    await clientAuthRepo.updateLastLogin(authRow.cliente_id);
    const tokens = await issueTokens({
      clienteId: authRow.cliente_id,
      email: authRow.email,
      req,
    });
    res.json(tokens);
  } catch (e) {
    console.error('Login cliente error:', e.message);
    res.status(500).json({ error: 'Error de autenticacion' });
  }
}

async function refreshToken(req, res) {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token requerido' });
  if (!REFRESH_SECRET || !SECRET) return res.status(500).json({ error: 'JWT no configurado' });
  try {
    const verifyOptions = { algorithms: [JWT_ALG] };
    if (JWT_ISSUER) verifyOptions.issuer = JWT_ISSUER;
    if (JWT_AUDIENCE) verifyOptions.audience = JWT_AUDIENCE;
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET, verifyOptions);
    const valid = await clientTokens.isRefreshTokenValid(refreshToken);
    if (!valid) return res.status(403).json({ error: 'Refresh token invalido o revocado' });
    if (!decoded || decoded.role !== 'cliente') {
      return res.status(403).json({ error: 'Refresh token invalido' });
    }
    const accessToken = jwt.sign(
      { sub: decoded.sub, email: decoded.email, role: 'cliente' },
      SECRET,
      { ...buildSignOpts('15m'), jwtid: newJti() }
    );
    res.json({ accessToken });
  } catch (err) {
    console.error('Refresh token cliente error:', err.message);
    return res.status(403).json({ error: 'Refresh token invalido o expirado' });
  }
}

async function logout(req, res) {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    try { await clientTokens.revokeRefreshToken(refreshToken); } catch (_) {}
  }
  return res.status(200).json({ message: 'Sesion cliente cerrada exitosamente.' });
}

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const len = 10;
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

const validateSetPassword = [
  check('password').optional().isLength({ min: 6 }).withMessage('La contrasena debe tener al menos 6 caracteres'),
];

async function getAccessStatus(req, res) {
  const clienteId = Number(req.params.id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(400).json({ error: 'ID de cliente invalido' });
  }

  try {
    const cliente = await clientRepo.findById(clienteId);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    const authRow = await clientAuthRepo.findByClienteId(clienteId);
    res.json({
      cliente_id: clienteId,
      email: authRow?.email || cliente.email || null,
      has_access: Boolean(authRow),
      password_set_at: authRow?.password_set_at || null,
      last_login_at: authRow?.last_login_at || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el acceso del cliente' });
  }
}

async function setAccessPassword(req, res) {
  const clienteId = Number(req.params.id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(400).json({ error: 'ID de cliente invalido' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const cliente = await clientRepo.findById(clienteId);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!cliente.email) {
      return res.status(400).json({ error: 'El cliente no tiene email configurado' });
    }

    const passwordPlain = req.body?.password ? String(req.body.password) : generatePassword();
    const passwordHash = await bcrypt.hash(passwordPlain, 10);
    const existingAuth = await clientAuthRepo.findByClienteId(clienteId);

    if (existingAuth) {
      await clientAuthRepo.updatePassword(clienteId, passwordHash, cliente.email);
    } else {
      await clientAuthRepo.createAuth({
        cliente_id: clienteId,
        email: cliente.email,
        password_hash: passwordHash,
      });
    }

    res.json({
      cliente_id: clienteId,
      email: cliente.email,
      password: passwordPlain,
      reset: Boolean(existingAuth),
    });
  } catch (e) {
    console.error('Error al configurar password cliente:', e.message);
    res.status(500).json({ error: 'No se pudo configurar la contrasena del cliente' });
  }
}

module.exports = {
  register: [...validateRegister, register],
  login: [...validateLogin, login],
  refreshToken,
  logout,
  getAccessStatus,
  setAccessPassword: [...validateSetPassword, setAccessPassword],
};
