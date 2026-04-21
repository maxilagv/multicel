const jwt = require('jsonwebtoken');
const logger = require('../lib/logger');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const {
  sendSMSNotification,
  failedLoginAttempts,
  FAILED_LOGIN_THRESHOLD,
} = require('../middlewares/security.js');
const {
  SECRET,
  REFRESH_SECRET,
  addTokenToBlacklist,
} = require('../middlewares/authmiddleware.js');
const { sendVerificationEmail } = require('../utils/mailer');
const {
  createOtpTransaction,
  getOtpTransaction,
  saveOtpTransaction,
  deleteOtpTransaction,
} = require('../services/otpStore');
const {
  createSetupChallenge,
  confirmSetup,
  verifyTotpToken,
  consumeBackupCode,
  parseBackupCodeRows,
} = require('../services/mfaService');
const users = require('../db/repositories/userRepository');
const tokens = require('../db/repositories/tokenRepository');
const userDeps = require('../db/repositories/usuarioDepositoRepository');

const JWT_ALG = process.env.JWT_ALG || 'HS256';
const JWT_ISSUER = process.env.JWT_ISSUER;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE;
const OTP_MAX_ATTEMPTS = 5;

const loginSchema = z.object({
  email: z.string().trim().email('Email invalido'),
  password: z.string().min(6, 'Contrasena invalida'),
  totp_code: z.string().trim().min(6).max(8).optional(),
  backup_code: z.string().trim().min(4).max(32).optional(),
});

const otpStep2Schema = z.object({
  txId: z.string().trim().min(1),
  code: z.string().trim().min(4).max(12),
});

const mfaConfirmSchema = z.object({
  code: z.string().trim().min(6).max(8),
});

const mfaDisableSchema = z.object({
  totp_code: z.string().trim().min(6).max(8).optional(),
  backup_code: z.string().trim().min(4).max(32).optional(),
});

function newJti() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
}

function buildSignOpts(ttl) {
  const opts = { algorithm: JWT_ALG, expiresIn: ttl };
  if (JWT_ISSUER) opts.issuer = JWT_ISSUER;
  if (JWT_AUDIENCE) opts.audience = JWT_AUDIENCE;
  return opts;
}

function toValidationErrors(error) {
  return error.issues.map((issue) => ({
    param: issue.path.join('.') || 'body',
    msg: issue.message,
  }));
}

function parseOrReply(schema, payload, res) {
  const parsed = schema.safeParse(payload || {});
  if (parsed.success) return parsed.data;
  res.status(400).json({
    error: 'Datos invalidos',
    code: 'VALIDATION_ERROR',
    errors: toValidationErrors(parsed.error),
  });
  return null;
}

async function buildAccessTokenPayload(user) {
  const payload = { sub: user.id, email: user.email, role: user.rol };
  if (String(user?.rol || '').trim().toLowerCase() !== 'gerente_sucursal') {
    return payload;
  }

  const depositoId =
    Number.isInteger(Number(user?.deposito_id)) && Number(user.deposito_id) > 0
      ? Number(user.deposito_id)
      : Number.isInteger(Number(user?.deposito_principal_id)) &&
          Number(user.deposito_principal_id) > 0
        ? Number(user.deposito_principal_id)
      : await userDeps.getPrimaryDepositoId(user.id);

  if (!depositoId) {
    const error = new Error('El gerente de sucursal no tiene una sucursal asignada');
    error.status = 403;
    error.code = 'DEPOSITO_SCOPE_REQUIRED';
    throw error;
  }

  payload.deposito_id = depositoId;
  return payload;
}

async function issueTokens(user, meta = {}) {
  if (!SECRET || !REFRESH_SECRET) {
    throw new Error('Server JWT secrets not configured');
  }

  const payload = await buildAccessTokenPayload(user);
  const accessJti = newJti();
  const accessToken = jwt.sign(payload, SECRET, {
    ...buildSignOpts('15m'),
    jwtid: accessJti,
  });

  const refreshJti = newJti();
  const refreshToken = jwt.sign(
    { sub: user.id, email: user.email },
    REFRESH_SECRET,
    { ...buildSignOpts('7d'), jwtid: refreshJti }
  );

  const expMs = 7 * 24 * 60 * 60 * 1000;
  await tokens.saveRefreshToken({
    user_id: user.id,
    token: refreshToken,
    jti: refreshJti,
    user_agent: meta.user_agent || null,
    ip: meta.ip || null,
    expires_at: new Date(Date.now() + expMs),
  });

  return { accessToken, refreshToken };
}

async function validateMfaIfNeeded(user, payload) {
  const isEnabled = Number(user?.totp_enabled || 0) === 1 && Boolean(user?.totp_secret);
  if (!isEnabled) return { ok: true };

  if (payload.backup_code) {
    const consumed = consumeBackupCode({
      storedCodes: user.totp_backup_codes,
      code: payload.backup_code,
    });
    if (!consumed.matched) {
      return {
        ok: false,
        status: 401,
        body: {
          error: 'Codigo de respaldo invalido',
          code: 'MFA_INVALID_BACKUP_CODE',
          mfa_required: true,
        },
      };
    }
    await users.update(user.id, {
      totp_backup_codes: JSON.stringify(consumed.nextRows),
    });
    return { ok: true, usedBackupCode: true };
  }

  if (!payload.totp_code) {
    return {
      ok: false,
      status: 401,
      body: {
        error: 'Se requiere el codigo de autenticacion de la app.',
        code: 'MFA_REQUIRED',
        mfa_required: true,
      },
    };
  }

  const valid = verifyTotpToken({
    encryptedSecret: user.totp_secret,
    token: payload.totp_code,
  });
  if (!valid) {
    return {
      ok: false,
      status: 401,
      body: {
        error: 'Codigo de autenticacion invalido',
        code: 'MFA_INVALID_CODE',
        mfa_required: true,
      },
    };
  }

  return { ok: true };
}

async function login(req, res) {
  const payload = parseOrReply(loginSchema, req.body, res);
  if (!payload) return;

  const clientIp = req.ip;
  if (!failedLoginAttempts.has(clientIp)) failedLoginAttempts.set(clientIp, 0);

  try {
    const user = await users.findByEmail(payload.email);
    if (!user || user.activo === false) {
      failedLoginAttempts.set(clientIp, failedLoginAttempts.get(clientIp) + 1);
      return res.status(401).json({
        error: 'Usuario no autorizado',
        code: 'AUTH_INVALID_CREDENTIALS',
      });
    }

    const match = await bcrypt.compare(payload.password, user.password_hash);
    if (!match) {
      failedLoginAttempts.set(clientIp, failedLoginAttempts.get(clientIp) + 1);
      if (failedLoginAttempts.get(clientIp) >= FAILED_LOGIN_THRESHOLD) {
        sendSMSNotification(
          `Alerta: multiples intentos fallidos desde IP ${clientIp} para ${user.email}`
        ).catch(() => {});
      }
      return res.status(401).json({
        error: 'Contrasena incorrecta',
        code: 'AUTH_INVALID_CREDENTIALS',
      });
    }

    const mfaResult = await validateMfaIfNeeded(user, payload);
    if (!mfaResult.ok) {
      return res.status(mfaResult.status).json(mfaResult.body);
    }

    failedLoginAttempts.delete(clientIp);
    const issued = await issueTokens(user, {
      user_agent: req.get('User-Agent'),
      ip: req.ip,
    });
    return res.json(issued);
  } catch (err) {
    logger.error({ err: err?.message || err }, 'Login error:');
    return res.status(500).json({ error: 'Error de autenticacion', code: 'AUTH_INTERNAL_ERROR' });
  }
}

async function loginStep1(req, res) {
  const payload = parseOrReply(loginSchema.pick({ email: true, password: true }), req.body, res);
  if (!payload) return;

  const clientIp = req.ip;
  if (!failedLoginAttempts.has(clientIp)) failedLoginAttempts.set(clientIp, 0);

  try {
    const user = await users.findByEmail(payload.email);
    if (!user || user.activo === false) {
      failedLoginAttempts.set(clientIp, failedLoginAttempts.get(clientIp) + 1);
      if (failedLoginAttempts.get(clientIp) >= FAILED_LOGIN_THRESHOLD) {
        sendSMSNotification(`Alerta: IP ${clientIp} email no autorizado`).catch(() => {});
      }
      return res.status(401).json({ error: 'Usuario no autorizado', code: 'AUTH_INVALID_CREDENTIALS' });
    }

    const match = await bcrypt.compare(payload.password, user.password_hash);
    if (!match) {
      failedLoginAttempts.set(clientIp, failedLoginAttempts.get(clientIp) + 1);
      if (failedLoginAttempts.get(clientIp) >= FAILED_LOGIN_THRESHOLD) {
        sendSMSNotification(`Alerta: IP ${clientIp} password incorrecta`).catch(() => {});
      }
      return res.status(401).json({ error: 'Contrasena incorrecta', code: 'AUTH_INVALID_CREDENTIALS' });
    }

    failedLoginAttempts.delete(clientIp);
    const { txId, code } = await createOtpTransaction({
      email: user.email,
      userId: user.id,
      role: user.rol,
    });

    try {
      await sendVerificationEmail(user.email, code);
    } catch (err) {
      logger.error({ err: err?.message || err }, 'OTP email error:');
      return res.status(500).json({ error: 'No se pudo enviar el codigo', code: 'OTP_SEND_FAILED' });
    }

    return res.json({ otpSent: true, txId });
  } catch (err) {
    logger.error({ err: err?.message || err }, 'Login step1 error:');
    return res.status(500).json({ error: 'Error de autenticacion', code: 'AUTH_INTERNAL_ERROR' });
  }
}

async function loginStep2(req, res) {
  const payload = parseOrReply(otpStep2Schema, req.body, res);
  if (!payload) return;

  const rec = await getOtpTransaction(payload.txId);
  if (!rec) {
    return res.status(400).json({ error: 'Transaccion no encontrada o expirada', code: 'OTP_NOT_FOUND' });
  }

  if (Date.now() > rec.expiresAt) {
    await deleteOtpTransaction(payload.txId);
    return res.status(400).json({ error: 'Codigo expirado', code: 'OTP_EXPIRED' });
  }

  if (rec.attempts >= OTP_MAX_ATTEMPTS) {
    await deleteOtpTransaction(payload.txId);
    return res.status(429).json({ error: 'Demasiados intentos', code: 'OTP_RATE_LIMITED' });
  }

  rec.attempts += 1;
  if (String(payload.code).trim() !== rec.code) {
    await saveOtpTransaction(payload.txId, rec);
    return res.status(401).json({ error: 'Codigo incorrecto', code: 'OTP_INVALID' });
  }

  await deleteOtpTransaction(payload.txId);

  try {
    const user = await users.findById(rec.userId);
    if (!user || user.activo === false) {
      return res.status(403).json({ error: 'Usuario inactivo o no encontrado', code: 'USER_NOT_FOUND' });
    }

    const issued = await issueTokens(user, {
      user_agent: req.get('User-Agent'),
      ip: req.ip,
    });
    return res.json(issued);
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || 'No se pudo iniciar sesion',
      code: error.code || 'AUTH_INTERNAL_ERROR',
    });
  }
}

async function refreshToken(req, res) {
  const refreshTokenValue = req.body?.refreshToken;
  if (!refreshTokenValue) {
    return res.status(401).json({ error: 'Refresh token requerido', code: 'REFRESH_REQUIRED' });
  }
  if (!REFRESH_SECRET || !SECRET) {
    return res.status(500).json({ error: 'JWT no configurado', code: 'JWT_NOT_CONFIGURED' });
  }

  try {
    const verifyOptions = { algorithms: [JWT_ALG] };
    if (JWT_ISSUER) verifyOptions.issuer = JWT_ISSUER;
    if (JWT_AUDIENCE) verifyOptions.audience = JWT_AUDIENCE;

    const decoded = jwt.verify(refreshTokenValue, REFRESH_SECRET, verifyOptions);
    const valid = await tokens.isRefreshTokenValid(refreshTokenValue);
    if (!valid) {
      return res.status(403).json({ error: 'Refresh token invalido o revocado', code: 'REFRESH_INVALID' });
    }

    const user = await users.findById(decoded.sub);
    if (!user || user.activo === false) {
      return res.status(403).json({ error: 'Usuario inactivo o no encontrado', code: 'USER_NOT_FOUND' });
    }

    const accessPayload = await buildAccessTokenPayload(user);
    const accessToken = jwt.sign(accessPayload, SECRET, {
      ...buildSignOpts('15m'),
      jwtid: newJti(),
    });
    return res.json({ accessToken });
  } catch (err) {
    logger.error({ err: err?.message || err }, 'Refresh token error:');
    return res.status(403).json({ error: 'Refresh token invalido o expirado', code: 'REFRESH_INVALID' });
  }
}

async function logout(req, res) {
  const accessToken = req.token;
  if (accessToken) addTokenToBlacklist(accessToken);

  const refreshTokenValue = req.body?.refreshToken;
  if (refreshTokenValue) {
    try {
      await tokens.revokeRefreshToken(refreshTokenValue);
    } catch (_) {}
  }

  return res.status(200).json({ message: 'Sesion cerrada exitosamente.' });
}

async function mfaStatus(req, res) {
  const userId = Number(req.user?.sub || 0);
  if (!userId) return res.status(401).json({ error: 'Sesion invalida', code: 'SESSION_EXPIRED' });

  const user = await users.findByIdForSecurity(userId);
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
  }

  const backupCodes = parseBackupCodeRows(user.totp_backup_codes);
  const remaining = backupCodes.filter((row) => row && !row.used_at).length;
  return res.json({
    enabled: Number(user.totp_enabled || 0) === 1,
    backup_codes_remaining: remaining,
  });
}

async function mfaSetup(req, res) {
  const userId = Number(req.user?.sub || 0);
  if (!userId) return res.status(401).json({ error: 'Sesion invalida', code: 'SESSION_EXPIRED' });

  const user = await users.findByIdForSecurity(userId);
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
  }

  try {
    const setup = await createSetupChallenge({
      userId,
      email: user.email,
    });
    return res.json(setup);
  } catch (error) {
    return res.status(500).json({ error: 'No se pudo iniciar MFA', code: 'MFA_SETUP_FAILED' });
  }
}

async function mfaConfirm(req, res) {
  const userId = Number(req.user?.sub || 0);
  if (!userId) return res.status(401).json({ error: 'Sesion invalida', code: 'SESSION_EXPIRED' });
  const payload = parseOrReply(mfaConfirmSchema, req.body, res);
  if (!payload) return;

  try {
    const result = await confirmSetup({
      userId,
      code: payload.code,
    });
    await users.update(userId, {
      totp_secret: result.encryptedSecret,
      totp_enabled: 1,
      totp_backup_codes: JSON.stringify(result.backupCodeRows),
    });
    return res.json({
      message: 'MFA activado correctamente',
      backup_codes: result.backupCodes,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || 'No se pudo activar MFA',
      code: error.code || 'MFA_CONFIRM_FAILED',
    });
  }
}

async function mfaDisable(req, res) {
  const userId = Number(req.user?.sub || 0);
  if (!userId) return res.status(401).json({ error: 'Sesion invalida', code: 'SESSION_EXPIRED' });
  const payload = parseOrReply(mfaDisableSchema, req.body, res);
  if (!payload) return;

  const user = await users.findByIdForSecurity(userId);
  if (!user || Number(user.totp_enabled || 0) !== 1 || !user.totp_secret) {
    return res.status(400).json({ error: 'MFA no esta habilitado', code: 'MFA_NOT_ENABLED' });
  }

  const verified = await validateMfaIfNeeded(user, payload);
  if (!verified.ok) {
    return res.status(verified.status).json(verified.body);
  }

  await users.update(userId, {
    totp_secret: null,
    totp_enabled: 0,
    totp_backup_codes: null,
  });
  return res.json({ message: 'MFA deshabilitado' });
}

module.exports = {
  login,
  loginStep1,
  loginStep2,
  refreshToken,
  logout,
  mfaStatus,
  mfaSetup,
  mfaConfirm,
  mfaDisable,
};
