const { query } = require('../../db/pg');
const crmAccountRepo = require('./crmAccountRepository');
const automationEventRepo = require('./automationEventRepository');

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
      cuenta,
    };
  }

  if (cliente_id) {
    const cuenta = await crmAccountRepo.ensureForClienteId(cliente_id);
    return {
      crm_cuenta_id: cuenta?.id || null,
      cliente_id: Number(cliente_id),
      cuenta,
    };
  }

  return {
    crm_cuenta_id: null,
    cliente_id: null,
    cuenta: null,
  };
}

async function list({
  q,
  fase,
  cliente_id,
  crm_cuenta_id,
  owner_id,
  include_ocultas = false,
  limit = 50,
  offset = 0,
} = {}) {
  const where = [];
  const params = [];

  if (!include_ocultas) where.push('o.oculto = FALSE');
  if (q) {
    params.push(`%${String(q).trim().toLowerCase()}%`);
    where.push(
      `(LOWER(o.titulo) LIKE $${params.length}
        OR LOWER(COALESCE(o.notas, '')) LIKE $${params.length}
        OR LOWER(COALESCE(cc.nombre, '')) LIKE $${params.length})`
    );
  }
  if (fase) {
    params.push(fase);
    where.push(`o.fase = $${params.length}`);
  }
  if (cliente_id) {
    params.push(Number(cliente_id));
    where.push(`o.cliente_id = $${params.length}`);
  }
  if (crm_cuenta_id) {
    params.push(Number(crm_cuenta_id));
    where.push(`o.crm_cuenta_id = $${params.length}`);
  }
  if (owner_id) {
    params.push(Number(owner_id));
    where.push(`o.owner_usuario_id = $${params.length}`);
  }

  const lim = clampInt(limit, 1, 200, 50);
  const off = clampInt(offset, 0, 100000, 0);
  params.push(lim, off);

  const { rows } = await query(
    `SELECT o.id,
            o.cliente_id,
            o.crm_cuenta_id,
            COALESCE(cc.nombre, c.nombre) AS cliente_nombre,
            o.titulo,
            o.fase,
            o.valor_estimado AS valor_estimado,
            o.probabilidad,
            o.fecha_cierre_estimada,
            o.owner_usuario_id,
            o.notas,
            o.creado_en,
            o.actualizado_en,
            o.oculto
       FROM crm_oportunidades o
       LEFT JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN crm_cuentas cc ON cc.id = o.crm_cuenta_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY o.actualizado_en DESC, o.id DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}`,
    params
  );

  return rows.map((row) => ({
    ...row,
    cliente_id: row.cliente_id != null ? Number(row.cliente_id) : null,
    crm_cuenta_id: row.crm_cuenta_id != null ? Number(row.crm_cuenta_id) : null,
    owner_usuario_id: row.owner_usuario_id != null ? Number(row.owner_usuario_id) : null,
    valor_estimado: Number(row.valor_estimado || 0),
    probabilidad: Number(row.probabilidad || 0),
    oculto: Boolean(row.oculto),
  }));
}

async function create(
  {
    cliente_id,
    crm_cuenta_id,
    titulo,
    fase = 'lead',
    valor_estimado = 0,
    probabilidad = 0,
    fecha_cierre_estimada,
    owner_usuario_id,
    notas,
    oculto = false,
  },
  options = {}
) {
  const resolved = await resolveCuentaAndCliente({ crm_cuenta_id, cliente_id });
  const { rows } = await query(
    `INSERT INTO crm_oportunidades(
       cliente_id,
       crm_cuenta_id,
       titulo,
       fase,
       valor_estimado,
       probabilidad,
       fecha_cierre_estimada,
       owner_usuario_id,
       notas,
       oculto
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      resolved.cliente_id,
      resolved.crm_cuenta_id,
      titulo,
      fase,
      Number(valor_estimado || 0),
      Number(probabilidad || 0),
      fecha_cierre_estimada || null,
      owner_usuario_id || null,
      notas || null,
      oculto ? 1 : 0,
    ]
  );

  const createdId = rows[0]?.id;
  await query(
    `INSERT INTO crm_oportunidad_historial(
       oportunidad_id,
       crm_cuenta_id,
       estado_anterior,
       estado_nuevo,
       changed_by_user_id,
       notas
     )
     VALUES ($1, $2, NULL, $3, $4, $5)`,
    [
      createdId,
      resolved.crm_cuenta_id,
      fase,
      options.changed_by_user_id || null,
      options.notas_historial || null,
    ]
  );

  if (createdId) {
    await automationEventRepo.enqueueTx(null, {
      eventName: 'oportunidad_creada',
      aggregateType: 'crm_oportunidad',
      aggregateId: createdId,
      idempotencyKey: `crm:oportunidad:${createdId}:creada`,
      payload: {
        oportunidad_id: createdId,
        cliente_id: resolved.cliente_id,
        crm_cuenta_id: resolved.crm_cuenta_id,
        titulo,
        fase,
        valor_estimado: Number(valor_estimado || 0),
        probabilidad: Number(probabilidad || 0),
        owner_usuario_id: owner_usuario_id || null,
      },
    });
  }

  return { id: createdId };
}

async function update(id, fields, options = {}) {
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

  const sets = [];
  const params = [];
  let index = 1;

  const mappedFields = {
    cliente_id: resolved.cliente_id,
    crm_cuenta_id: resolved.crm_cuenta_id,
    titulo: fields.titulo,
    fase: fields.fase,
    valor_estimado:
      Object.prototype.hasOwnProperty.call(fields, 'valor_estimado')
        ? Number(fields.valor_estimado || 0)
        : undefined,
    probabilidad:
      Object.prototype.hasOwnProperty.call(fields, 'probabilidad')
        ? Number(fields.probabilidad || 0)
        : undefined,
    fecha_cierre_estimada: fields.fecha_cierre_estimada,
    owner_usuario_id: fields.owner_usuario_id,
    notas: fields.notas,
    oculto:
      Object.prototype.hasOwnProperty.call(fields, 'oculto') ? (fields.oculto ? 1 : 0) : undefined,
  };

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
    `UPDATE crm_oportunidades
        SET ${sets.join(', ')},
            actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $${index}
      RETURNING id`,
    params
  );
  if (!rows[0]) return null;

  const next = await getById(id);
  if (current.fase !== next.fase) {
    await query(
      `INSERT INTO crm_oportunidad_historial(
         oportunidad_id,
         crm_cuenta_id,
         estado_anterior,
         estado_nuevo,
         changed_by_user_id,
         notas
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        Number(id),
        next.crm_cuenta_id || null,
        current.fase || null,
        next.fase,
        options.changed_by_user_id || null,
        options.notas_historial || null,
      ]
    );

    await automationEventRepo.enqueueTx(null, {
      eventName: 'oportunidad_fase_cambio',
      aggregateType: 'crm_oportunidad',
      aggregateId: Number(id),
      idempotencyKey: `crm:oportunidad:${id}:fase:${next.fase}`,
      payload: {
        oportunidad_id: Number(id),
        cliente_id: next.cliente_id || null,
        crm_cuenta_id: next.crm_cuenta_id || null,
        fase_anterior: current.fase || null,
        fase_nueva: next.fase,
        valor_estimado: Number(next.valor_estimado || 0),
        probabilidad: Number(next.probabilidad || 0),
        owner_usuario_id: next.owner_usuario_id || null,
      },
    });
  }

  return { id };
}

async function getById(id) {
  const { rows } = await query(
    `SELECT o.id,
            o.cliente_id,
            o.crm_cuenta_id,
            COALESCE(cc.nombre, c.nombre) AS cliente_nombre,
            o.titulo,
            o.fase,
            o.valor_estimado AS valor_estimado,
            o.probabilidad,
            o.fecha_cierre_estimada,
            o.owner_usuario_id,
            o.notas,
            o.creado_en,
            o.actualizado_en,
            o.oculto
       FROM crm_oportunidades o
       LEFT JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN crm_cuentas cc ON cc.id = o.crm_cuenta_id
      WHERE o.id = $1`,
    [Number(id)]
  );
  if (!rows[0]) return null;
  return {
    ...rows[0],
    cliente_id: rows[0].cliente_id != null ? Number(rows[0].cliente_id) : null,
    crm_cuenta_id: rows[0].crm_cuenta_id != null ? Number(rows[0].crm_cuenta_id) : null,
    owner_usuario_id:
      rows[0].owner_usuario_id != null ? Number(rows[0].owner_usuario_id) : null,
    valor_estimado: Number(rows[0].valor_estimado || 0),
    probabilidad: Number(rows[0].probabilidad || 0),
    oculto: Boolean(rows[0].oculto),
  };
}

async function getHistory(id) {
  const { rows } = await query(
    `SELECT h.id,
            h.oportunidad_id,
            h.crm_cuenta_id,
            h.estado_anterior,
            h.estado_nuevo,
            h.changed_by_user_id,
            h.notas,
            h.created_at,
            u.nombre AS changed_by_nombre
       FROM crm_oportunidad_historial h
       LEFT JOIN usuarios u ON u.id = h.changed_by_user_id
      WHERE h.oportunidad_id = $1
      ORDER BY h.created_at ASC, h.id ASC`,
    [Number(id)]
  );
  return rows;
}

async function analytics() {
  const [opportunities, history] = await Promise.all([
    list({ include_ocultas: false, limit: 5000, offset: 0 }),
    query(
      `SELECT oportunidad_id, estado_nuevo, created_at
         FROM crm_oportunidad_historial
        ORDER BY oportunidad_id ASC, created_at ASC, id ASC`
    ),
  ]);

  const fasesMap = new Map();
  for (const row of opportunities) {
    const current = fasesMap.get(row.fase) || { fase: row.fase, cantidad: 0, valor_total: 0 };
    current.cantidad += 1;
    current.valor_total += Number(row.valor_estimado || 0);
    fasesMap.set(row.fase, current);
  }

  const expectedPairs = [
    ['lead', 'contacto'],
    ['contacto', 'propuesta'],
    ['propuesta', 'negociacion'],
    ['negociacion', 'ganado'],
  ];

  const byOpportunity = new Map();
  for (const row of history.rows) {
    const opportunityId = Number(row.oportunidad_id);
    if (!byOpportunity.has(opportunityId)) byOpportunity.set(opportunityId, []);
    byOpportunity.get(opportunityId).push(row);
  }

  const conversions = expectedPairs.map(([de, a]) => {
    let totalDesde = 0;
    let totalHasta = 0;
    const durations = [];

    for (const steps of byOpportunity.values()) {
      const hasFrom = steps.some((step) => step.estado_nuevo === de);
      if (hasFrom) totalDesde += 1;

      for (let i = 0; i < steps.length - 1; i += 1) {
        const current = steps[i];
        const next = steps[i + 1];
        if (current.estado_nuevo === de && next.estado_nuevo === a) {
          totalHasta += 1;
          const start = new Date(current.created_at).getTime();
          const end = new Date(next.created_at).getTime();
          if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
            durations.push((end - start) / (1000 * 60 * 60 * 24));
          }
          break;
        }
      }
    }

    const tasa = totalDesde > 0 ? totalHasta / totalDesde : 0;
    const tiempoPromedio =
      durations.length > 0
        ? durations.reduce((acc, value) => acc + value, 0) / durations.length
        : null;

    return {
      de,
      a,
      tasa,
      tiempo_promedio_dias: tiempoPromedio,
    };
  });

  return {
    fases: Array.from(fasesMap.values()).sort((left, right) =>
      String(left.fase).localeCompare(String(right.fase))
    ),
    conversiones: conversions,
  };
}

module.exports = {
  list,
  create,
  update,
  getById,
  getHistory,
  analytics,
};
