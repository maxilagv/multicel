const { query, withTransaction } = require('../../db/pg');

async function getUserDepositoIds(usuarioId) {
  const { rows } = await query(
    'SELECT deposito_id FROM usuarios_depositos WHERE usuario_id = $1',
    [usuarioId]
  );
  return rows.map((r) => Number(r.deposito_id));
}

async function getUserDepositos(usuarioId) {
  const { rows } = await query(
    `SELECT d.id,
            d.nombre,
            d.codigo,
            d.direccion,
            d.activo,
            ud.rol_deposito
       FROM usuarios_depositos ud
       JOIN depositos d ON d.id = ud.deposito_id
      WHERE ud.usuario_id = $1
      ORDER BY d.nombre ASC`,
    [usuarioId]
  );
  return rows;
}

async function setUserDepositos(usuarioId, items) {
  return withTransaction(async (client) => {
    await client.query('DELETE FROM usuarios_depositos WHERE usuario_id = $1', [
      usuarioId,
    ]);
    if (!Array.isArray(items)) return;
    for (const it of items) {
      const depId = Number(it.deposito_id ?? it.id);
      if (!Number.isInteger(depId) || depId <= 0) continue;
      const rol =
        typeof it.rol_deposito === 'string' && it.rol_deposito.trim()
          ? it.rol_deposito.trim()
          : null;
      await client.query(
        'INSERT INTO usuarios_depositos(usuario_id, deposito_id, rol_deposito) VALUES ($1, $2, $3)',
        [usuarioId, depId, rol],
      );
    }
  });
}

module.exports = {
  getUserDepositoIds,
  getUserDepositos,
  setUserDepositos,
};
