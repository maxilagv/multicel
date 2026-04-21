const { query } = require('../../db/pg');

function clampInt(n, min, max, d) {
  const v = parseInt(n, 10);
  if (Number.isFinite(v)) return Math.min(Math.max(v, min), max);
  return d;
}

async function list({ cliente_id, oportunidad_id, estado, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (cliente_id) { params.push(cliente_id); where.push(`a.cliente_id = $${params.length}`); }
  if (oportunidad_id) { params.push(oportunidad_id); where.push(`a.oportunidad_id = $${params.length}`); }
  if (estado) { params.push(estado); where.push(`a.estado = $${params.length}`); }
  const lim = clampInt(limit, 1, 200, 50);
  const off = clampInt(offset, 0, 100000, 0);
  params.push(lim, off);
  const sql = `SELECT a.id, a.tipo, a.asunto, a.descripcion, a.fecha_hora, a.estado,
                      a.cliente_id, c.nombre AS cliente_nombre,
                      a.oportunidad_id,
                      a.asignado_a_usuario_id,
                      a.creado_en, a.actualizado_en
                 FROM crm_actividades a
            LEFT JOIN clientes c ON c.id = a.cliente_id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY COALESCE(a.fecha_hora, a.creado_en) DESC
                LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const { rows } = await query(sql, params);
  return rows;
}

async function create({ cliente_id, oportunidad_id, tipo, asunto, descripcion, fecha_hora, estado = 'pendiente', asignado_a_usuario_id }) {
  const { rows } = await query(
    `INSERT INTO crm_actividades(cliente_id, oportunidad_id, tipo, asunto, descripcion, fecha_hora, estado, asignado_a_usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [cliente_id || null, oportunidad_id || null, tipo, asunto, descripcion || null, fecha_hora || null, estado, asignado_a_usuario_id || null]
  );
  return rows[0];
}

async function update(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  for (const [key, col] of Object.entries({
    cliente_id: 'cliente_id',
    oportunidad_id: 'oportunidad_id',
    tipo: 'tipo',
    asunto: 'asunto',
    descripcion: 'descripcion',
    fecha_hora: 'fecha_hora',
    estado: 'estado',
    asignado_a_usuario_id: 'asignado_a_usuario_id',
  })) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${p++}`);
      params.push(fields[key] ?? null);
    }
  }
  if (!sets.length) return { id };
  params.push(id);
  const { rows } = await query(`UPDATE crm_actividades SET ${sets.join(', ')} WHERE id = $${p} RETURNING id`, params);
  return rows[0] || null;
}

module.exports = { list, create, update };

