const { query } = require('../../db/pg');
const crmAccountRepo = require('./crmAccountRepository');

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

async function resolveCuentaAndCliente({ crm_cuenta_id, cliente_id } = {}) {
  if (crm_cuenta_id) {
    const cuenta = await crmAccountRepo.getById(crm_cuenta_id);
    if (!cuenta) {
      const error = new Error('Cuenta CRM no encontrada');
      error.status = 400;
      throw error;
    }
    return {
      crm_cuenta_id: Number(cuenta.id),
      cliente_id: cuenta.cliente_id != null ? Number(cuenta.cliente_id) : null,
    };
  }

  if (cliente_id) {
    const cuenta = await crmAccountRepo.ensureForClienteId(cliente_id);
    return {
      crm_cuenta_id: cuenta?.id || null,
      cliente_id: Number(cliente_id),
    };
  }

  return {
    crm_cuenta_id: null,
    cliente_id: null,
  };
}

async function list({
  q,
  cliente_id,
  crm_cuenta_id,
  oportunidad_id,
  proyecto_id,
  estado,
  asignado_a_usuario_id,
  include_completed = true,
  limit = 50,
  offset = 0,
} = {}) {
  const where = [];
  const params = [];

  if (q) {
    params.push(`%${String(q).trim().toLowerCase()}%`);
    where.push(
      `(LOWER(a.asunto) LIKE $${params.length}
        OR LOWER(COALESCE(a.descripcion, '')) LIKE $${params.length}
        OR LOWER(COALESCE(cc.nombre, '')) LIKE $${params.length})`
    );
  }
  if (cliente_id) {
    params.push(Number(cliente_id));
    where.push(`a.cliente_id = $${params.length}`);
  }
  if (crm_cuenta_id) {
    params.push(Number(crm_cuenta_id));
    where.push(`a.crm_cuenta_id = $${params.length}`);
  }
  if (oportunidad_id) {
    params.push(Number(oportunidad_id));
    where.push(`a.oportunidad_id = $${params.length}`);
  }
  if (proyecto_id) {
    params.push(Number(proyecto_id));
    where.push(`a.proyecto_id = $${params.length}`);
  }
  if (estado) {
    params.push(estado);
    where.push(`a.estado = $${params.length}`);
  } else if (!include_completed) {
    where.push(`a.estado <> 'completado'`);
  }
  if (asignado_a_usuario_id) {
    params.push(Number(asignado_a_usuario_id));
    where.push(`a.asignado_a_usuario_id = $${params.length}`);
  }

  const lim = clampInt(limit, 1, 200, 50);
  const off = clampInt(offset, 0, 100000, 0);
  params.push(lim, off);

  const { rows } = await query(
    `SELECT a.id,
            a.tipo,
            a.asunto,
            a.descripcion,
            a.resultado,
            a.fecha_hora,
            a.fecha_fin,
            a.completado_en,
            a.estado,
            a.prioridad,
            a.cliente_id,
            a.crm_cuenta_id,
            COALESCE(cc.nombre, c.nombre) AS cliente_nombre,
            a.oportunidad_id,
            a.proyecto_id,
            a.asignado_a_usuario_id,
            u.nombre AS asignado_nombre,
            a.origen_tipo,
            a.origen_id,
            a.creado_en,
            a.actualizado_en
       FROM crm_actividades a
       LEFT JOIN clientes c ON c.id = a.cliente_id
       LEFT JOIN crm_cuentas cc ON cc.id = a.crm_cuenta_id
       LEFT JOIN usuarios u ON u.id = a.asignado_a_usuario_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY COALESCE(a.fecha_hora, a.creado_en) DESC, a.id DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}`,
    params
  );

  return rows.map((row) => ({
    ...row,
    cliente_id: row.cliente_id != null ? Number(row.cliente_id) : null,
    crm_cuenta_id: row.crm_cuenta_id != null ? Number(row.crm_cuenta_id) : null,
    oportunidad_id: row.oportunidad_id != null ? Number(row.oportunidad_id) : null,
    proyecto_id: row.proyecto_id != null ? Number(row.proyecto_id) : null,
    asignado_a_usuario_id:
      row.asignado_a_usuario_id != null ? Number(row.asignado_a_usuario_id) : null,
  }));
}

async function create({
  cliente_id,
  crm_cuenta_id,
  oportunidad_id,
  proyecto_id,
  tipo,
  asunto,
  descripcion,
  resultado,
  fecha_hora,
  fecha_fin,
  estado = 'pendiente',
  prioridad = 'media',
  metadata_json,
  asignado_a_usuario_id,
  origen_tipo,
  origen_id,
}) {
  const resolved = await resolveCuentaAndCliente({ crm_cuenta_id, cliente_id });
  const completadoEn = estado === 'completado' ? new Date() : null;

  const { rows } = await query(
    `INSERT INTO crm_actividades(
       cliente_id,
       crm_cuenta_id,
       oportunidad_id,
       proyecto_id,
       tipo,
       asunto,
       descripcion,
       resultado,
       fecha_hora,
       fecha_fin,
       completado_en,
       estado,
       prioridad,
       metadata_json,
       asignado_a_usuario_id,
       origen_tipo,
       origen_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING id`,
    [
      resolved.cliente_id,
      resolved.crm_cuenta_id,
      oportunidad_id || null,
      proyecto_id || null,
      tipo,
      asunto,
      descripcion || null,
      resultado || null,
      fecha_hora || null,
      fecha_fin || null,
      completadoEn,
      estado,
      prioridad,
      metadata_json || null,
      asignado_a_usuario_id || null,
      origen_tipo || null,
      origen_id || null,
    ]
  );

  return { id: rows[0]?.id };
}

async function update(id, fields) {
  const current = await getById(id);
  if (!current) return null;

  const shouldResolveCuenta =
    Object.prototype.hasOwnProperty.call(fields, 'crm_cuenta_id') ||
    Object.prototype.hasOwnProperty.call(fields, 'cliente_id');

  const resolved = shouldResolveCuenta
    ? await resolveCuentaAndCliente({
        crm_cuenta_id:
          Object.prototype.hasOwnProperty.call(fields, 'crm_cuenta_id')
            ? fields.crm_cuenta_id
            : current.crm_cuenta_id,
        cliente_id:
          Object.prototype.hasOwnProperty.call(fields, 'cliente_id')
            ? fields.cliente_id
            : current.cliente_id,
      })
    : {
        crm_cuenta_id: current.crm_cuenta_id,
        cliente_id: current.cliente_id,
      };

  const finalEstado =
    Object.prototype.hasOwnProperty.call(fields, 'estado') ? fields.estado : current.estado;

  const mappedFields = {
    cliente_id: resolved.cliente_id,
    crm_cuenta_id: resolved.crm_cuenta_id,
    oportunidad_id: fields.oportunidad_id,
    proyecto_id: fields.proyecto_id,
    tipo: fields.tipo,
    asunto: fields.asunto,
    descripcion: fields.descripcion,
    resultado: fields.resultado,
    fecha_hora: fields.fecha_hora,
    fecha_fin: fields.fecha_fin,
    completado_en:
      Object.prototype.hasOwnProperty.call(fields, 'completado_en')
        ? fields.completado_en
        : finalEstado === 'completado' && current.estado !== 'completado'
          ? new Date()
          : undefined,
    estado: fields.estado,
    prioridad: fields.prioridad,
    metadata_json: fields.metadata_json,
    asignado_a_usuario_id: fields.asignado_a_usuario_id,
    origen_tipo: fields.origen_tipo,
    origen_id: fields.origen_id,
  };

  const sets = [];
  const params = [];
  let index = 1;

  for (const [key, value] of Object.entries(mappedFields)) {
    if (
      key === 'cliente_id' ||
      key === 'crm_cuenta_id' ||
      Object.prototype.hasOwnProperty.call(fields, key)
    ) {
      sets.push(`${key} = $${index++}`);
      params.push(value ?? null);
    }
  }

  if (!sets.length) return { id };

  params.push(Number(id));
  const { rows } = await query(
    `UPDATE crm_actividades
        SET ${sets.join(', ')},
            actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $${index}
      RETURNING id`,
    params
  );
  return rows[0] || null;
}

async function getById(id) {
  const { rows } = await query(
    `SELECT a.id,
            a.tipo,
            a.asunto,
            a.descripcion,
            a.resultado,
            a.fecha_hora,
            a.fecha_fin,
            a.completado_en,
            a.estado,
            a.prioridad,
            a.cliente_id,
            a.crm_cuenta_id,
            COALESCE(cc.nombre, c.nombre) AS cliente_nombre,
            a.oportunidad_id,
            a.proyecto_id,
            a.asignado_a_usuario_id,
            u.nombre AS asignado_nombre,
            a.origen_tipo,
            a.origen_id,
            a.creado_en,
            a.actualizado_en
       FROM crm_actividades a
       LEFT JOIN clientes c ON c.id = a.cliente_id
       LEFT JOIN crm_cuentas cc ON cc.id = a.crm_cuenta_id
       LEFT JOIN usuarios u ON u.id = a.asignado_a_usuario_id
      WHERE a.id = $1
      LIMIT 1`,
    [Number(id)]
  );
  if (!rows[0]) return null;
  return {
    ...rows[0],
    cliente_id: rows[0].cliente_id != null ? Number(rows[0].cliente_id) : null,
    crm_cuenta_id: rows[0].crm_cuenta_id != null ? Number(rows[0].crm_cuenta_id) : null,
    oportunidad_id: rows[0].oportunidad_id != null ? Number(rows[0].oportunidad_id) : null,
    proyecto_id: rows[0].proyecto_id != null ? Number(rows[0].proyecto_id) : null,
    asignado_a_usuario_id:
      rows[0].asignado_a_usuario_id != null ? Number(rows[0].asignado_a_usuario_id) : null,
  };
}

async function findByOrigin(origen_tipo, origen_id) {
  const { rows } = await query(
    `SELECT id
       FROM crm_actividades
      WHERE origen_tipo = $1
        AND origen_id = $2
      ORDER BY id ASC`,
    [origen_tipo, origen_id]
  );
  return rows.map((row) => Number(row.id));
}

module.exports = {
  list,
  create,
  update,
  getById,
  findByOrigin,
};
