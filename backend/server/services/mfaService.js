const crypto = require('crypto');
const QRCode = require('qrcode');
const {
  generateSecret,
  generateURI,
  verifySync,
} = require('otplib');
const runtimeStore = require('./runtimeStore');
const { encryptText, decryptText } = require('../utils/cryptoService');

const SETUP_TTL_MS = 10 * 60 * 1000;
const BACKUP_CODE_COUNT = 8;
const TOTP_OPTIONS = {
  step: 30,
  window: 1,
};

function getIssuer() {
  return String(process.env.APP_NAME || process.env.JWT_ISSUER || 'Kaisen ERP').trim();
}

function setupStoreKey(userId) {
  return `mfa:setup:${Number(userId)}`;
}

function hashBackupCode(value) {
  return crypto.createHash('sha256').update(String(value || '').trim()).digest('hex');
}

function generateBackupCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => alphabet[Math.floor(Math.random() * alphabet.length)];
  const raw = Array.from({ length: 8 }, pick).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function buildBackupCodeRows(codes) {
  return codes.map((code) => ({
    hash: hashBackupCode(code),
    used_at: null,
  }));
}

function parseBackupCodeRows(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function createSetupChallenge({ userId, email }) {
  const secret = generateSecret();
  const otpauthUrl = generateURI({
    issuer: getIssuer(),
    label: String(email || '').trim(),
    secret,
    algorithm: 'SHA1',
    digits: 6,
    period: TOTP_OPTIONS.step,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    margin: 1,
    width: 256,
  });

  await runtimeStore.setJson(
    setupStoreKey(userId),
    {
      secret,
      email: String(email || '').trim(),
      created_at: new Date().toISOString(),
    },
    SETUP_TTL_MS
  );

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
    expires_in_seconds: Math.floor(SETUP_TTL_MS / 1000),
  };
}

async function confirmSetup({ userId, code }) {
  const pending = await runtimeStore.getJson(setupStoreKey(userId));
  if (!pending?.secret) {
    const err = new Error('La configuracion MFA expiro. Genera un nuevo QR.');
    err.status = 400;
    err.code = 'MFA_SETUP_EXPIRED';
    throw err;
  }

  const token = String(code || '').trim();
  const verification = verifySync({
    token,
    secret: pending.secret,
    step: TOTP_OPTIONS.step,
    window: TOTP_OPTIONS.window,
  });
  if (!verification?.valid) {
    const err = new Error('El codigo TOTP no es valido.');
    err.status = 400;
    err.code = 'MFA_INVALID_CODE';
    throw err;
  }

  const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () => generateBackupCode());
  await runtimeStore.deleteValue(setupStoreKey(userId));

  return {
    encryptedSecret: encryptText(pending.secret),
    backupCodes,
    backupCodeRows: buildBackupCodeRows(backupCodes),
  };
}

function verifyTotpToken({ encryptedSecret, token }) {
  if (!encryptedSecret || !token) return false;
  const secret = decryptText(encryptedSecret);
  if (!secret) return false;
  const verification = verifySync({
    token: String(token).trim(),
    secret,
    step: TOTP_OPTIONS.step,
    window: TOTP_OPTIONS.window,
  });
  return Boolean(verification?.valid);
}

function consumeBackupCode({ storedCodes, code }) {
  const rows = parseBackupCodeRows(storedCodes);
  const wantedHash = hashBackupCode(code);
  let matched = false;

  const nextRows = rows.map((row) => {
    if (matched) return row;
    if (!row || row.used_at) return row;
    if (String(row.hash || '') !== wantedHash) return row;
    matched = true;
    return {
      ...row,
      used_at: new Date().toISOString(),
    };
  });

  return {
    matched,
    nextRows,
  };
}

module.exports = {
  createSetupChallenge,
  confirmSetup,
  verifyTotpToken,
  consumeBackupCode,
  parseBackupCodeRows,
};
