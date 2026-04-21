const crypto = require('crypto');
const { getValue, setValue } = require('./runtimeStore');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function buildJtiKey(jti) {
  return `jwt-blacklist:jti:${jti}`;
}

function buildHashKey(token) {
  return `jwt-blacklist:hash:${hashToken(token)}`;
}

async function isTokenRevoked({ jti, token }) {
  const checks = [];
  if (jti) checks.push(getValue(buildJtiKey(jti)));
  if (token) checks.push(getValue(buildHashKey(token)));
  if (!checks.length) return false;
  const results = await Promise.all(checks);
  return results.some(Boolean);
}

async function markTokenRevoked({ jti, token, expiresAtMs }) {
  const ttlMs = Math.max(1_000, Number(expiresAtMs || 0) - Date.now());
  const writes = [];
  if (jti) writes.push(setValue(buildJtiKey(jti), '1', ttlMs));
  if (token) writes.push(setValue(buildHashKey(token), '1', ttlMs));
  await Promise.all(writes);
}

module.exports = {
  isTokenRevoked,
  markTokenRevoked,
};
