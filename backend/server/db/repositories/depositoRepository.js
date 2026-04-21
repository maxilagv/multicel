const { query, withTransaction } = require('../../db/pg');
const { columnExists } = require('../../db/schemaSupport');

function normalizeRolDeposito(value, fallback = 'operador') {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'admin' || normalized === 'operador' || normalized === 'visor') {
    return normalized;
  }
  return fallback;
}

async function list({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE activo = TRUE';
  const { rows } = await query(
    `SELECT id,
            nombre,
            codigo,
            direccion,
            activo,
            creado_en,
            actualizado_en
       FROM depositos
       ${where}
       ORDER BY nombre ASC`
  );
  return rows;
}

async function create({ nombre, codigo, direccion }) {
  const sql = `
    INSERT INTO depositos(nombre, codigo, direccion, activo)
    VALUES ($1, $2, $3, TRUE)
    RETURNING id
  `;
  const params = [nombre, codigo || null, direccion || null];
  const { rows } = await query(sql, params);
  return rows[0];
}

async function update(id, { nombre, codigo, direccion, activo }) {
  const sets = [];
  const params = [];
  let p = 1;

  if (typeof nombre !== 'undefined') {
    sets.push(`nombre = $${p++}`);
    params.push(nombre);
  }
  if (typeof codigo !== 'undefined') {
    sets.push(`codigo = $${p++}`);
    params.push(codigo || null);
  }
  if (typeof direccion !== 'undefined') {
    sets.push(`direccion = $${p++}`);
    params.push(direccion || null);
  }
  if (typeof activo !== 'undefined') {
    sets.push(`activo = $${p++}`);
    params.push(Boolean(activo));
  }

  if (!sets.length) return null;

  const sql = `UPDATE depositos SET ${sets.join(', ')}, actualizado_en = NOW() WHERE id = $${p} RETURNING id`;
  params.push(id);
  const { rows } = await query(sql, params);
  return rows[0] || null;
}

async function deactivate(id) {
  const { rows } = await query(
    'UPDATE depositos SET activo = FALSE, actualizado_en = NOW() WHERE id = $1 RETURNING id',
    [id]
  );
  return rows[0] || null;
}

async function getUsuariosDeposito(depositoId) {
  const hasPrimaryDeposito = await columnExists('usuarios', 'deposito_principal_id');
  const { rows } = await query(
    `SELECT u.id,
            u.nombre,
            u.email,
            r.nombre AS rol,
            ${
              hasPrimaryDeposito
                ? 'u.deposito_principal_id'
                : 'NULL AS deposito_principal_id'
            },
            ${
              hasPrimaryDeposito
                ? 'dp.nombre AS deposito_principal_nombre'
                : 'NULL AS deposito_principal_nombre'
            },
            ud.rol_deposito,
            ${
              hasPrimaryDeposito
                ? 'CASE WHEN u.deposito_principal_id = $1 THEN TRUE ELSE FALSE END AS deposito_principal_actual'
                : 'FALSE AS deposito_principal_actual'
            },
            CASE WHEN ud.usuario_id IS NOT NULL THEN TRUE ELSE FALSE END AS asignado
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       ${hasPrimaryDeposito ? 'LEFT JOIN depositos dp ON dp.id = u.deposito_principal_id' : ''}
       LEFT JOIN usuarios_depositos ud
         ON ud.usuario_id = u.id AND ud.deposito_id = $1
      WHERE u.activo = TRUE AND u.deleted_at IS NULL
      ORDER BY u.nombre ASC`,
    [depositoId],
  );
  return rows;
}

async function setUsuariosDeposito(depositoId, items) {
  return withTransaction(async (client) => {
    const { rows: existingRows } = await client.query(
      'SELECT usuario_id, rol_deposito FROM usuarios_depositos WHERE deposito_id = $1',
      [depositoId]
    );
    const existingRoles = new Map(
      (existingRows || []).map((row) => [
        Number(row.usuario_id),
        normalizeRolDeposito(row.rol_deposito),
      ])
    );
    await client.query('DELETE FROM usuarios_depositos WHERE deposito_id = $1', [depositoId]);
    if (!Array.isArray(items)) return;
    const seenUserIds = new Set();
    for (const it of items) {
      const userId = Number(it.usuario_id);
      if (!Number.isInteger(userId) || userId <= 0) continue;
      if (seenUserIds.has(userId)) continue;
      seenUserIds.add(userId);
      const rol = normalizeRolDeposito(
        it.rol_deposito,
        existingRoles.get(userId) || 'operador'
      );
      await client.query(
        'INSERT INTO usuarios_depositos(usuario_id, deposito_id, rol_deposito) VALUES ($1, $2, $3)',
        [userId, depositoId, rol],
      );
    }
  });
}

module.exports = {
  list,
  create,
  update,
  deactivate,
  getUsuariosDeposito,
  setUsuariosDeposito,
};

