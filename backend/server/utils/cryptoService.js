const crypto = require('crypto');

function deriveKey() {
  const source =
    process.env.ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    process.env.REFRESH_TOKEN_SECRET ||
    '';

  if (!source) {
    throw new Error('Missing ENCRYPTION_KEY or JWT secret for crypto operations');
  }

  return crypto.createHash('sha256').update(String(source)).digest();
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function decodePayload(value) {
  return JSON.parse(Buffer.from(String(value), 'base64').toString('utf8'));
}

function encryptText(value) {
  if (!value) return null;
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return encodePayload({
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ciphertext.toString('base64'),
    alg: 'aes-256-gcm',
  });
}

function decryptText(value) {
  if (!value) return null;
  const key = deriveKey();
  const payload = decodePayload(value);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(String(payload.iv || ''), 'base64')
  );
  decipher.setAuthTag(Buffer.from(String(payload.tag || ''), 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(String(payload.data || ''), 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

module.exports = {
  encryptText,
  decryptText,
};
