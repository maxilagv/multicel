const { query } = require('../../db/pg');

async function saveRefreshToken({ user_id, token, jti, user_agent, ip, expires_at }) {
  await query(
    `INSERT INTO auth_refresh_tokens(user_id, token, jti, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [user_id, token, jti, user_agent || null, ip || null, expires_at]
  );
}

async function revokeRefreshToken(token) {
  await query(`UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE token = $1`, [token]);
}

async function isRefreshTokenValid(token) {
  const { rows } = await query(
    `SELECT 1 FROM auth_refresh_tokens
      WHERE token = $1
        AND revoked_at IS NULL
        AND NOW() < expires_at
      LIMIT 1`,
    [token]
  );
  return !!rows.length;
}

module.exports = { saveRefreshToken, revokeRefreshToken, isRefreshTokenValid };

