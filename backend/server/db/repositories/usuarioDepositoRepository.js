const { query, withTransaction } = require('../../db/pg');
const { columnExists } = require('../../db/schemaSupport');

function normalizeRolDeposito(value, fallback = 'operador') {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'admin' || normalized === 'operador' || normalized === 'visor') {
    return normalized;
  }
  return fallback;
}

async function hasPrimaryDepositoColumn(client = null) {
  return columnExists('usuarios', 'deposito_principal_id', client?.query ? client : null);
}

async function getUserDepositoIds(usuarioId) {
  const hasPrimaryDeposito = await hasPrimaryDepositoColumn();
  if (hasPrimaryDeposito) {
    const { rows } = await query(
      `SELECT ud.deposito_id
         FROM usuarios_depositos ud
         LEFT JOIN usuarios u ON u.id = ud.usuario_id
        WHERE ud.usuario_id = $1
        ORDER BY CASE WHEN u.deposito_principal_id = ud.deposito_id THEN 0 ELSE 1 END,
                 ud.deposito_id ASC`,
      [usuarioId]
    );
    return rows.map((r) => Number(r.deposito_id));
  }
  const { rows } = await query(
    'SELECT deposito_id FROM usuarios_depositos WHERE usuario_id = $1',
    [usuarioId]
  );
  return rows.map((r) => Number(r.deposito_id));
}

async function getUserDepositos(usuarioId) {
  const hasPrimaryDeposito = await hasPrimaryDepositoColumn();
  const { rows } = await query(
    `SELECT d.id,
            d.nombre,
            d.codigo,
            d.direccion,
            d.activo,
            ud.rol_deposito,
            ${
              hasPrimaryDeposito
                ? 'CASE WHEN u.deposito_principal_id = ud.deposito_id THEN TRUE ELSE FALSE END AS es_principal'
                : 'FALSE AS es_principal'
            }
       FROM usuarios_depositos ud
       JOIN depositos d ON d.id = ud.deposito_id
       ${hasPrimaryDeposito ? 'LEFT JOIN usuarios u ON u.id = ud.usuario_id' : ''}
      WHERE ud.usuario_id = $1
      ORDER BY d.nombre ASC`,
    [usuarioId]
  );
  return rows;
}

async function getPrimaryDepositoId(usuarioId) {
  if (await hasPrimaryDepositoColumn()) {
    const { rows } = await query(
      `SELECT deposito_principal_id
         FROM usuarios
        WHERE id = $1
        LIMIT 1`,
      [usuarioId]
    );
    const primaryId = Number(rows?.[0]?.deposito_principal_id || 0);
    if (Number.isInteger(primaryId) && primaryId > 0) {
      return primaryId;
    }
  }
  const ids = await getUserDepositoIds(usuarioId);
  return ids.length ? Number(ids[0]) : null;
}

async function setUserDepositos(usuarioId, items, options = {}) {
  return withTransaction(async (client) => {
    const hasPrimaryDeposito = await hasPrimaryDepositoColumn(client);
    const { rows: existingRows } = await client.query(
      'SELECT deposito_id, rol_deposito FROM usuarios_depositos WHERE usuario_id = $1',
      [usuarioId]
    );
    const existingRoles = new Map(
      (existingRows || []).map((row) => [
        Number(row.deposito_id),
        normalizeRolDeposito(row.rol_deposito),
      ])
    );
    await client.query('DELETE FROM usuarios_depositos WHERE usuario_id = $1', [
      usuarioId,
    ]);
    const normalizedIds = [];
    if (!Array.isArray(items)) {
      if (hasPrimaryDeposito) {
        await client.query(
          'UPDATE usuarios SET deposito_principal_id = NULL WHERE id = $1',
          [usuarioId]
        );
      }
      return;
    }
    for (const it of items) {
      const depId = Number(it.deposito_id ?? it.id);
      if (!Number.isInteger(depId) || depId <= 0) continue;
      if (normalizedIds.includes(depId)) continue;
      normalizedIds.push(depId);
      const rol = normalizeRolDeposito(
        it.rol_deposito,
        existingRoles.get(depId) || 'operador'
      );
      await client.query(
        'INSERT INTO usuarios_depositos(usuario_id, deposito_id, rol_deposito) VALUES ($1, $2, $3)',
        [usuarioId, depId, rol],
      );
    }
    if (hasPrimaryDeposito) {
      const requestedPrimary = Number(options?.deposito_principal_id || 0);
      const primaryId = normalizedIds.includes(requestedPrimary)
        ? requestedPrimary
        : normalizedIds[0] || null;
      await client.query(
        'UPDATE usuarios SET deposito_principal_id = $1 WHERE id = $2',
        [primaryId, usuarioId]
      );
    }
  });
}

module.exports = {
  getUserDepositoIds,
  getUserDepositos,
  getPrimaryDepositoId,
  setUserDepositos,
};
