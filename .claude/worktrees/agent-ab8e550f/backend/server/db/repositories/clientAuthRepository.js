const { query } = require('../../db/pg');

async function findByEmail(email) {
  const { rows } = await query(
    `SELECT ca.id,
            ca.cliente_id,
            ca.email,
            ca.password_hash,
            ca.activo,
            ca.password_set_at,
            ca.last_login_at
       FROM clientes_auth ca
      WHERE LOWER(ca.email) = LOWER($1)
      LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findByClienteId(clienteId) {
  const { rows } = await query(
    `SELECT ca.id,
            ca.cliente_id,
            ca.email,
            ca.password_hash,
            ca.activo,
            ca.password_set_at,
            ca.last_login_at
       FROM clientes_auth ca
      WHERE ca.cliente_id = $1
      LIMIT 1`,
    [clienteId]
  );
  return rows[0] || null;
}

async function createAuth({ cliente_id, email, password_hash }) {
  const { rows } = await query(
    `INSERT INTO clientes_auth(cliente_id, email, password_hash, password_set_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id, cliente_id, email`,
    [cliente_id, email, password_hash]
  );
  return rows[0];
}

async function updatePassword(clienteId, passwordHash, email) {
  const params = [passwordHash, clienteId];
  const sets = ['password_hash = $1', 'password_set_at = NOW()', 'actualizado_en = NOW()'];
  if (email) {
    params.push(email);
    sets.push(`email = $${params.length}`);
  }
  const { rows } = await query(
    `UPDATE clientes_auth
        SET ${sets.join(', ')}
      WHERE cliente_id = $2
      RETURNING id, cliente_id, email`,
    params
  );
  return rows[0] || null;
}

async function updateLastLogin(clienteId) {
  await query(
    `UPDATE clientes_auth
        SET last_login_at = NOW(),
            actualizado_en = NOW()
      WHERE cliente_id = $1`,
    [clienteId]
  );
}

module.exports = {
  findByEmail,
  findByClienteId,
  createAuth,
  updatePassword,
  updateLastLogin,
};
