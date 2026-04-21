const crypto = require('crypto');
const { getJson, setJson, deleteValue } = require('./runtimeStore');

const OTP_TTL_MS = 5 * 60 * 1000;

function generateOtpCode() {
  const num = crypto.randomInt(0, 1_000_000);
  return num.toString().padStart(6, '0');
}

function newTransactionId() {
  return crypto.randomBytes(16).toString('hex');
}

function getOtpTtlMs() {
  const parsed = Number(process.env.OTP_TTL_MS || OTP_TTL_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : OTP_TTL_MS;
}

function keyFor(txId) {
  return `otp:${txId}`;
}

async function createOtpTransaction({ email, userId, role }) {
  const txId = newTransactionId();
  const code = generateOtpCode();
  const expiresAt = Date.now() + getOtpTtlMs();
  await setJson(
    keyFor(txId),
    {
      email,
      userId,
      role: role || null,
      code,
      expiresAt,
      attempts: 0,
    },
    getOtpTtlMs()
  );
  return { txId, code, expiresAt };
}

async function getOtpTransaction(txId) {
  if (!txId) return null;
  return getJson(keyFor(txId));
}

async function saveOtpTransaction(txId, record) {
  if (!txId || !record) return null;
  const ttlMs = Math.max(1, Number(record.expiresAt || 0) - Date.now());
  await setJson(keyFor(txId), record, ttlMs);
  return record;
}

async function deleteOtpTransaction(txId) {
  if (!txId) return;
  await deleteValue(keyFor(txId));
}

module.exports = {
  createOtpTransaction,
  getOtpTransaction,
  saveOtpTransaction,
  deleteOtpTransaction,
  getOtpTtlMs,
};
