const { query, withTransaction } = require('../../db/pg');

function mapContacto(row) {
  if (!row) return null;
  return {
    ...row,
    crm_cuenta_id: Number(row.crm_cuenta_id),
    cliente_id: row.cliente_id != null ? Number(row.cliente_id) : null,
    proveedor_id: row.proveedor_id != null ? Number(row.proveedor_id) : null,
    es_principal: Boolean(row.es_principal),
    activo: Boolean(row.activo),
  };
}

async function list({ crm_cuenta_id, q, soloActivos = true } = {}) {
  const params = [];
  const where = [];

  if (crm_cuenta_id) {
    params.push(Number(crm_cuenta_id));
    where.push(`c.crm_cuenta_id = $${params.length}`);
  }
  if (q) {
    params.push(`%${String(q).trim().toLowerCase()}%`);
    where.push(
      `(LOWER(c.nombre) LIKE $${params.length}
        OR LOWER(COALESCE(c.cargo, '')) LIKE $${params.length}
        OR LOWER(COALESCE(c.email, '')) LIKE $${params.length}
        OR LOWER(COALESCE(c.telefono, '')) LIKE $${params.length}
        OR LOWER(COALESCE(c.whatsapp, '')) LIKE $${params.length})`
    );
  }
  if (soloActivos) where.push('c.activo = TRUE');

  const { rows } = await query(
    `SELECT c.id,
            c.crm_cuenta_id,
            c.cliente_id,
            c.proveedor_id,
            c.nombre,
            c.cargo,
            c.email,
            c.telefono,
            c.whatsapp,
            c.es_principal,
            c.notas,
            c.activo,
            c.created_at,
            c.updated_at
       FROM crm_contactos c
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.es_principal DESC, c.nombre ASC`,
    params
  );

  return rows.map(mapContacto);
}

async function getById(id) {
  const { rows } = await query(
    `SELECT id,
            crm_cuenta_id,
            cliente_id,
            proveedor_id,
            nombre,
            cargo,
            email,
            telefono,
            whatsapp,
            es_principal,
            notas,
            activo,
            created_at,
            updated_at
       FROM crm_contactos
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return mapContacto(rows[0] || null);
}

async function create(data) {
  return withTransaction(async (client) => {
    if (data.es_principal) {
      await client.query(
        `UPDATE crm_contactos
            SET es_principal = FALSE
          WHERE crm_cuenta_id = $1`,
        [Number(data.crm_cuenta_id)]
      );
    }

    const { rows } = await client.query(
      `INSERT INTO crm_contactos(
         crm_cuenta_id,
         cliente_id,
         proveedor_id,
         nombre,
         cargo,
         email,
         telefono,
         whatsapp,
         es_principal,
         notas,
         activo
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
       RETURNING id`,
      [
        Number(data.crm_cuenta_id),
        data.cliente_id || null,
        data.proveedor_id || null,
        data.nombre,
        data.cargo || null,
        data.email || null,
        data.telefono || null,
        data.whatsapp || null,
        data.es_principal ? 1 : 0,
        data.notas || null,
      ]
    );
    return getById(rows[0]?.id);
  });
}

async function update(id, fields) {
  return withTransaction(async (client) => {
    const current = await client.query(
      'SELECT id, crm_cuenta_id FROM crm_contactos WHERE id = $1 LIMIT 1',
      [Number(id)]
    );
    if (!current.rows[0]) return null;

    const cuentaId = Number(current.rows[0].crm_cuenta_id);
    if (fields.es_principal) {
      await client.query(
        `UPDATE crm_contactos
            SET es_principal = FALSE
          WHERE crm_cuenta_id = $1`,
        [cuentaId]
      );
    }

    const sets = [];
    const params = [];
    let index = 1;

    for (const [key, column] of Object.entries({
      nombre: 'nombre',
      cargo: 'cargo',
      email: 'email',
      telefono: 'telefono',
      whatsapp: 'whatsapp',
      es_principal: 'es_principal',
      notas: 'notas',
      activo: 'activo',
    })) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        sets.push(`${column} = $${index++}`);
        if (key === 'es_principal' || key === 'activo') params.push(fields[key] ? 1 : 0);
        else params.push(fields[key] ?? null);
      }
    }

    if (!sets.length) return getById(id);

    params.push(Number(id));
    const { rows } = await client.query(
      `UPDATE crm_contactos
          SET ${sets.join(', ')},
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $${index}
        RETURNING id`,
      params
    );

    if (!rows[0]) return null;
    return getById(id);
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
};
