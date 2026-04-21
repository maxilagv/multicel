const { query } = require('../../db/pg');

function clampInt(n, min, max, d) {
  const v = parseInt(n, 10);
  if (Number.isFinite(v)) return Math.min(Math.max(v, min), max);
  return d;
}

async function list({ q, fase, cliente_id, owner_id, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  // Solo mostrar oportunidades no ocultas en los listados de CRM
  where.push('o.oculto = FALSE');
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(LOWER(titulo) LIKE $${params.length} OR LOWER(notas) LIKE $${params.length})`);
  }
  if (fase) { params.push(fase); where.push(`fase = $${params.length}`); }
  if (cliente_id) { params.push(cliente_id); where.push(`cliente_id = $${params.length}`); }
  if (owner_id) { params.push(owner_id); where.push(`owner_usuario_id = $${params.length}`); }
  const lim = clampInt(limit, 1, 200, 50);
  const off = clampInt(offset, 0, 100000, 0);
  params.push(lim, off);
  const sql = `SELECT o.id, o.cliente_id, c.nombre AS cliente_nombre, o.titulo, o.fase,
                      o.valor_estimado::float AS valor_estimado, o.probabilidad, o.fecha_cierre_estimada,
                      o.owner_usuario_id, o.notas, o.creado_en, o.actualizado_en, o.oculto
                 FROM crm_oportunidades o
                 JOIN clientes c ON c.id = o.cliente_id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY o.id DESC
                LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const { rows } = await query(sql, params);
  return rows;
}

async function create({ cliente_id, titulo, fase = 'lead', valor_estimado = 0, probabilidad = 0, fecha_cierre_estimada, owner_usuario_id, notas }) {
  const { rows } = await query(
    `INSERT INTO crm_oportunidades(cliente_id, titulo, fase, valor_estimado, probabilidad, fecha_cierre_estimada, owner_usuario_id, notas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [cliente_id, titulo, fase, valor_estimado, probabilidad, fecha_cierre_estimada || null, owner_usuario_id || null, notas || null]
  );
  return rows[0];
}

async function update(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  for (const [key, col] of Object.entries({
    cliente_id: 'cliente_id',
    titulo: 'titulo',
    fase: 'fase',
    valor_estimado: 'valor_estimado',
    probabilidad: 'probabilidad',
    fecha_cierre_estimada: 'fecha_cierre_estimada',
    owner_usuario_id: 'owner_usuario_id',
    notas: 'notas',
    oculto: 'oculto',
  })) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${p++}`);
      params.push(fields[key] ?? null);
    }
  }
  if (!sets.length) return { id };
  params.push(id);
  const { rows } = await query(`UPDATE crm_oportunidades SET ${sets.join(', ')} WHERE id = $${p} RETURNING id`, params);
  return rows[0] || null;
}

async function getById(id) {
  const { rows } = await query(
    `SELECT o.id, o.cliente_id, c.nombre AS cliente_nombre, o.titulo, o.fase,
            o.valor_estimado::float AS valor_estimado, o.probabilidad, o.fecha_cierre_estimada,
            o.owner_usuario_id, o.notas, o.creado_en, o.actualizado_en, o.oculto
       FROM crm_oportunidades o
       JOIN clientes c ON c.id = o.cliente_id
      WHERE o.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function analytics() {
  const fasesSql = `SELECT fase,
                           COUNT(*)::int AS cantidad,
                           COALESCE(SUM(valor_estimado),0)::float AS valor_total
                      FROM crm_oportunidades
                  GROUP BY fase
                  ORDER BY 1`;
  const convSql = `WITH base AS (
                     SELECT id, cliente_id, fase, valor_estimado, creado_en
                       FROM crm_oportunidades
                   ),
                   trans AS (
                     SELECT b.cliente_id,
                            MIN(CASE WHEN b.fase = 'lead' THEN b.creado_en END) AS lead_at,
                            MIN(CASE WHEN b.fase = 'contacto' THEN b.creado_en END) AS contacto_at,
                            MIN(CASE WHEN b.fase = 'propuesta' THEN b.creado_en END) AS propuesta_at,
                            MIN(CASE WHEN b.fase = 'negociacion' THEN b.creado_en END) AS negociacion_at,
                            MIN(CASE WHEN b.fase = 'ganado' THEN b.creado_en END) AS ganado_at
                       FROM base b
                   GROUP BY b.cliente_id
                   )
                SELECT 'lead' AS de, 'contacto' AS a,
                       SUM(CASE WHEN lead_at IS NOT NULL THEN 1 ELSE 0 END) AS total_desde,
                       SUM(CASE WHEN lead_at IS NOT NULL AND contacto_at IS NOT NULL THEN 1 ELSE 0 END) AS total_hasta,
                       AVG(CASE WHEN lead_at IS NOT NULL AND contacto_at IS NOT NULL THEN DATEDIFF(contacto_at, lead_at) END) AS dias_promedio
                  FROM trans
                UNION ALL
                SELECT 'contacto','propuesta',
                       SUM(CASE WHEN contacto_at IS NOT NULL THEN 1 ELSE 0 END),
                       SUM(CASE WHEN contacto_at IS NOT NULL AND propuesta_at IS NOT NULL THEN 1 ELSE 0 END),
                       AVG(CASE WHEN contacto_at IS NOT NULL AND propuesta_at IS NOT NULL THEN DATEDIFF(propuesta_at, contacto_at) END)
                  FROM trans
                UNION ALL
                SELECT 'propuesta','negociacion',
                       SUM(CASE WHEN propuesta_at IS NOT NULL THEN 1 ELSE 0 END),
                       SUM(CASE WHEN propuesta_at IS NOT NULL AND negociacion_at IS NOT NULL THEN 1 ELSE 0 END),
                       AVG(CASE WHEN propuesta_at IS NOT NULL AND negociacion_at IS NOT NULL THEN DATEDIFF(negociacion_at, propuesta_at) END)
                  FROM trans
                UNION ALL
                SELECT 'negociacion','ganado',
                       SUM(CASE WHEN negociacion_at IS NOT NULL THEN 1 ELSE 0 END),
                       SUM(CASE WHEN negociacion_at IS NOT NULL AND ganado_at IS NOT NULL THEN 1 ELSE 0 END),
                       AVG(CASE WHEN negociacion_at IS NOT NULL AND ganado_at IS NOT NULL THEN DATEDIFF(ganado_at, negociacion_at) END)
                  FROM trans`;
  const [fasesRes, convRes] = await Promise.all([
    query(fasesSql, []),
    query(convSql, []),
  ]);
  const fases = fasesRes.rows.map((r) => ({
    fase: r.fase,
    cantidad: Number(r.cantidad || 0),
    valor_total: Number(r.valor_total || 0),
  }));
  const pairs = [
    { de: 'lead', a: 'contacto' },
    { de: 'contacto', a: 'propuesta' },
    { de: 'propuesta', a: 'negociacion' },
    { de: 'negociacion', a: 'ganado' },
  ];
  const byKey = new Map();
  for (const r of convRes.rows) {
    const key = `${r.de}->${r.a}`;
    byKey.set(key, r);
  }
  const conversiones = pairs.map(({ de, a }) => {
    const r = byKey.get(`${de}->${a}`) || {};
    const totalDesde = Number(r.total_desde || 0);
    const totalHasta = Number(r.total_hasta || 0);
    const tasa = totalDesde > 0 ? totalHasta / totalDesde : 0;
    const diasProm = r.dias_promedio != null ? Number(r.dias_promedio) : null;
    return { de, a, tasa, tiempo_promedio_dias: diasProm };
  });
  return { fases, conversiones };
}

module.exports = { list, create, update, getById, analytics };
