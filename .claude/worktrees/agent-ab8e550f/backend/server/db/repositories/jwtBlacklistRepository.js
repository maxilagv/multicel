const { query } = require('../pg');

async function add({ jti, token, expires_at }) {
  if (!jti || !token || !expires_at) return;
  await query(
    `INSERT INTO jwt_blacklist(jti, token, expires_at)
     VALUES ($1, $2, $3)`,
    [jti, token, expires_at]
  );
}

async function isBlacklisted({ jti, token }) {
  if (!jti && !token) return false;
  const { rows } = await query(
    `SELECT 1
       FROM jwt_blacklist
      WHERE (jti = $1 OR token = $2)
        AND NOW() < expires_at
      LIMIT 1`,
    [jti || '', token || '']
  );
  return rows.length > 0;
}

async function cleanupExpired() {
  await query(
    `DELETE FROM jwt_blacklist WHERE NOW() >= expires_at`
  );
}

module.exports = { add, isBlacklisted, cleanupExpired };
