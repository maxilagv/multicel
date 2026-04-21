const { query, withTransaction } = require('../../db/pg');

function clampInt(n, min, max, d) {
  const v = parseInt(n, 10);
  if (Number.isFinite(v)) return Math.min(Math.max(v, min), max);
  return d;
}

async function list({ q, estado, prioridad, cliente_id, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(LOWER(asunto) LIKE $${params.length} OR LOWER(descripcion) LIKE $${params.length})`);
  }
  if (estado) { params.push(estado); where.push(`estado = $${params.length}`); }
  if (prioridad) { params.push(prioridad); where.push(`prioridad = $${params.length}`); }
  if (cliente_id) { params.push(cliente_id); where.push(`cliente_id = $${params.length}`); }
  const lim = clampInt(limit, 1, 200, 50);
  const off = clampInt(offset, 0, 100000, 0);
  params.push(lim, off);
  const sql = `SELECT t.id, t.asunto, t.descripcion, t.estado, t.prioridad, t.tipo,
                      t.cliente_id, c.nombre AS cliente_nombre,
                      t.asignado_a_usuario_id, t.venta_id,
                      t.creado_en, t.actualizado_en, t.cerrado_en
                 FROM tickets t
            LEFT JOIN clientes c ON c.id = t.cliente_id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY t.id DESC
                LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const { rows } = await query(sql, params);
  return rows;
}

async function create({ cliente_id, asunto, descripcion, estado = 'abierto', prioridad = 'media', tipo = 'soporte', asignado_a_usuario_id, venta_id }) {
  const { rows } = await query(
    `INSERT INTO tickets(cliente_id, asunto, descripcion, estado, prioridad, tipo, asignado_a_usuario_id, venta_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [cliente_id || null, asunto, descripcion || null, estado, prioridad, tipo, asignado_a_usuario_id || null, venta_id || null]
  );
  return rows[0];
}

async function update(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  for (const [key, col] of Object.entries({
    cliente_id: 'cliente_id',
    asunto: 'asunto',
    descripcion: 'descripcion',
    estado: 'estado',
    prioridad: 'prioridad',
    tipo: 'tipo',
    asignado_a_usuario_id: 'asignado_a_usuario_id',
    venta_id: 'venta_id',
    cerrado_en: 'cerrado_en',
  })) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${p++}`);
      params.push(fields[key] ?? null);
    }
  }
  if (!sets.length) return { id };
  params.push(id);
  const { rows } = await query(`UPDATE tickets SET ${sets.join(', ')} WHERE id = $${p} RETURNING id`, params);
  return rows[0] || null;
}

async function listEvents(ticket_id) {
  const { rows } = await query(
    `SELECT e.id, e.tipo, e.detalle, e.usuario_id, u.nombre AS usuario_nombre, e.creado_en
       FROM ticket_eventos e
  LEFT JOIN usuarios u ON u.id = e.usuario_id
      WHERE e.ticket_id = $1
      ORDER BY e.id ASC`,
    [ticket_id]
  );
  return rows;
}

async function addEvent({ ticket_id, usuario_id, tipo, detalle }) {
  return withTransaction(async (client) => {
    const ev = await client.query(
      `INSERT INTO ticket_eventos(ticket_id, usuario_id, tipo, detalle)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [ticket_id, usuario_id || null, tipo, detalle || null]
    );
    if (tipo === 'cambio_estado') {
      // detalle puede ser 'nuevo_estado:...'
      const m = /nuevo_estado:(\w+)/.exec(detalle || '');
      if (m) {
        await client.query(`UPDATE tickets SET estado = $1, actualizado_en = NOW() WHERE id = $2`, [m[1], ticket_id]);
      }
    }
    return ev.rows[0];
  });
}

module.exports = { list, create, update, listEvents, addEvent };

