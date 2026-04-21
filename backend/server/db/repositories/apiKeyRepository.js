const crypto = require('crypto');
const { query } = require('../../db/pg');

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey || '')).digest('hex');
}

async function findActiveByRawKey(rawKey) {
  const keyHash = hashApiKey(rawKey);
  const { rows } = await query(
    `SELECT id, nombre, key_hash, permisos_json, ultimo_uso, activo
       FROM api_keys
      WHERE key_hash = $1
        AND activo = 1
      LIMIT 1`,
    [keyHash]
  );
  const row = rows[0] || null;
  if (!row) return null;

  let permisos = {};
  try {
    permisos = row.permisos_json ? JSON.parse(row.permisos_json) : {};
  } catch {
    permisos = {};
  }

  return {
    ...row,
    permisos,
  };
}

async function touchLastUse(id) {
  await query(
    `UPDATE api_keys
        SET ultimo_uso = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [Number(id)]
  );
}

module.exports = {
  hashApiKey,
  findActiveByRawKey,
  touchLastUse,
};
