const { query, withTransaction } = require('../../db/pg');

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function mapProyecto(row) {
  if (!row) return null;
  return {
    ...row,
    crm_cuenta_id: row.crm_cuenta_id != null ? Number(row.crm_cuenta_id) : null,
    cliente_id: row.cliente_id != null ? Number(row.cliente_id) : null,
    responsable_usuario_id:
      row.responsable_usuario_id != null ? Number(row.responsable_usuario_id) : null,
    created_by: row.created_by != null ? Number(row.created_by) : null,
    progreso_pct: Number(row.progreso_pct || 0),
    presupuesto_estimado:
      row.presupuesto_estimado != null ? Number(row.presupuesto_estimado) : null,
  };
}

function mapTarea(row) {
  if (!row) return null;
  return {
    ...row,
    proyecto_id: Number(row.proyecto_id),
    parent_id: row.parent_id != null ? Number(row.parent_id) : null,
    responsable_usuario_id:
      row.responsable_usuario_id != null ? Number(row.responsable_usuario_id) : null,
    progreso_pct: Number(row.progreso_pct || 0),
    requiere_agenda: Boolean(row.requiere_agenda),
    created_by: row.created_by != null ? Number(row.created_by) : null,
  };
}

async function recalculateProjectProgress(client, proyectoId) {
  const { rows } = await client.query(
    `SELECT AVG(progreso_pct) AS progreso_promedio
       FROM crm_tareas_proyecto
      WHERE proyecto_id = $1`,
    [Number(proyectoId)]
  );
  const average = rows[0]?.progreso_promedio != null ? Number(rows[0].progreso_promedio) : 0;
  await client.query(
    `UPDATE crm_proyectos
        SET progreso_pct = $1,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $2`,
    [average, Number(proyectoId)]
  );
}

async function list({
  crm_cuenta_id,
  cliente_id,
  estado,
  responsable_usuario_id,
  limit = 50,
  offset = 0,
} = {}) {
  const params = [];
  const where = [];

  if (crm_cuenta_id) {
    params.push(Number(crm_cuenta_id));
    where.push(`p.crm_cuenta_id = $${params.length}`);
  }
  if (cliente_id) {
    params.push(Number(cliente_id));
    where.push(`p.cliente_id = $${params.length}`);
  }
  if (estado) {
    params.push(estado);
    where.push(`p.estado = $${params.length}`);
  }
  if (responsable_usuario_id) {
    params.push(Number(responsable_usuario_id));
    where.push(`p.responsable_usuario_id = $${params.length}`);
  }

  const lim = clampInt(limit, 1, 200, 50);
  const off = clampInt(offset, 0, 50000, 0);
  params.push(lim, off);

  const { rows } = await query(
    `SELECT p.id,
            p.crm_cuenta_id,
            p.cliente_id,
            p.nombre,
            p.descripcion,
            p.tipo,
            p.estado,
            p.prioridad,
            p.responsable_usuario_id,
            p.fecha_inicio,
            p.fecha_fin,
            p.progreso_pct,
            p.presupuesto_estimado,
            p.color_hex,
            p.created_by,
            p.created_at,
            p.updated_at,
            cc.nombre AS cuenta_nombre,
            u.nombre AS responsable_nombre
       FROM crm_proyectos p
       LEFT JOIN crm_cuentas cc ON cc.id = p.crm_cuenta_id
       LEFT JOIN usuarios u ON u.id = p.responsable_usuario_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.updated_at DESC, p.id DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}`,
    params
  );
  return rows.map(mapProyecto);
}

async function getById(id) {
  const { rows } = await query(
    `SELECT p.id,
            p.crm_cuenta_id,
            p.cliente_id,
            p.nombre,
            p.descripcion,
            p.tipo,
            p.estado,
            p.prioridad,
            p.responsable_usuario_id,
            p.fecha_inicio,
            p.fecha_fin,
            p.progreso_pct,
            p.presupuesto_estimado,
            p.color_hex,
            p.created_by,
            p.created_at,
            p.updated_at,
            cc.nombre AS cuenta_nombre,
            u.nombre AS responsable_nombre
       FROM crm_proyectos p
       LEFT JOIN crm_cuentas cc ON cc.id = p.crm_cuenta_id
       LEFT JOIN usuarios u ON u.id = p.responsable_usuario_id
      WHERE p.id = $1
      LIMIT 1`,
    [Number(id)]
  );
  return mapProyecto(rows[0] || null);
}

async function listTareas(proyectoId) {
  const { rows } = await query(
    `SELECT t.id,
            t.proyecto_id,
            t.parent_id,
            t.nombre,
            t.descripcion,
            t.estado,
            t.prioridad,
            t.responsable_usuario_id,
            t.fecha_inicio,
            t.fecha_fin,
            t.progreso_pct,
            t.orden,
            t.requiere_agenda,
            t.created_by,
            t.created_at,
            t.updated_at,
            u.nombre AS responsable_nombre
       FROM crm_tareas_proyecto t
       LEFT JOIN usuarios u ON u.id = t.responsable_usuario_id
      WHERE t.proyecto_id = $1
      ORDER BY t.orden ASC, t.fecha_inicio ASC, t.id ASC`,
    [Number(proyectoId)]
  );
  return rows.map(mapTarea);
}

async function createProject(data) {
  const { rows } = await query(
    `INSERT INTO crm_proyectos(
       crm_cuenta_id,
       cliente_id,
       nombre,
       descripcion,
       tipo,
       estado,
       prioridad,
       responsable_usuario_id,
       fecha_inicio,
       fecha_fin,
       progreso_pct,
       presupuesto_estimado,
       color_hex,
       created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12, $13)
     RETURNING id`,
    [
      data.crm_cuenta_id || null,
      data.cliente_id || null,
      data.nombre,
      data.descripcion || null,
      data.tipo || 'proyecto',
      data.estado || 'planificado',
      data.prioridad || 'media',
      data.responsable_usuario_id || null,
      data.fecha_inicio || null,
      data.fecha_fin || null,
      data.presupuesto_estimado != null ? Number(data.presupuesto_estimado) : null,
      data.color_hex || '#6366F1',
      data.created_by || null,
    ]
  );
  return getById(rows[0]?.id);
}

async function updateProject(id, fields) {
  const sets = [];
  const params = [];
  let index = 1;

  for (const [key, column] of Object.entries({
    crm_cuenta_id: 'crm_cuenta_id',
    cliente_id: 'cliente_id',
    nombre: 'nombre',
    descripcion: 'descripcion',
    tipo: 'tipo',
    estado: 'estado',
    prioridad: 'prioridad',
    responsable_usuario_id: 'responsable_usuario_id',
    fecha_inicio: 'fecha_inicio',
    fecha_fin: 'fecha_fin',
    progreso_pct: 'progreso_pct',
    presupuesto_estimado: 'presupuesto_estimado',
    color_hex: 'color_hex',
  })) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${column} = $${index++}`);
      params.push(fields[key] ?? null);
    }
  }

  if (!sets.length) return getById(id);

  params.push(Number(id));
  const { rows } = await query(
    `UPDATE crm_proyectos
        SET ${sets.join(', ')},
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $${index}
      RETURNING id`,
    params
  );
  if (!rows[0]) return null;
  return getById(id);
}

async function createTask(proyectoId, data) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO crm_tareas_proyecto(
         proyecto_id,
         parent_id,
         nombre,
         descripcion,
         estado,
         prioridad,
         responsable_usuario_id,
         fecha_inicio,
         fecha_fin,
         progreso_pct,
         orden,
         requiere_agenda,
         created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        Number(proyectoId),
        data.parent_id || null,
        data.nombre,
        data.descripcion || null,
        data.estado || 'pendiente',
        data.prioridad || 'media',
        data.responsable_usuario_id || null,
        data.fecha_inicio || null,
        data.fecha_fin || null,
        data.progreso_pct != null ? Number(data.progreso_pct) : 0,
        data.orden != null ? Number(data.orden) : 0,
        data.requiere_agenda === false ? 0 : 1,
        data.created_by || null,
      ]
    );

    await recalculateProjectProgress(client, proyectoId);
    return rows[0]?.id ? getTaskById(rows[0].id) : null;
  });
}

async function getTaskById(id) {
  const { rows } = await query(
    `SELECT t.id,
            t.proyecto_id,
            t.parent_id,
            t.nombre,
            t.descripcion,
            t.estado,
            t.prioridad,
            t.responsable_usuario_id,
            t.fecha_inicio,
            t.fecha_fin,
            t.progreso_pct,
            t.orden,
            t.requiere_agenda,
            t.created_by,
            t.created_at,
            t.updated_at
       FROM crm_tareas_proyecto t
      WHERE t.id = $1
      LIMIT 1`,
    [Number(id)]
  );
  return mapTarea(rows[0] || null);
}

async function updateTask(id, fields) {
  return withTransaction(async (client) => {
    const { rows: currentRows } = await client.query(
      'SELECT id, proyecto_id FROM crm_tareas_proyecto WHERE id = $1 LIMIT 1',
      [Number(id)]
    );
    const current = currentRows[0];
    if (!current) return null;

    const sets = [];
    const params = [];
    let index = 1;

    for (const [key, column] of Object.entries({
      nombre: 'nombre',
      descripcion: 'descripcion',
      estado: 'estado',
      prioridad: 'prioridad',
      responsable_usuario_id: 'responsable_usuario_id',
      fecha_inicio: 'fecha_inicio',
      fecha_fin: 'fecha_fin',
      progreso_pct: 'progreso_pct',
      orden: 'orden',
      requiere_agenda: 'requiere_agenda',
      parent_id: 'parent_id',
    })) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        sets.push(`${column} = $${index++}`);
        if (key === 'requiere_agenda') params.push(fields[key] ? 1 : 0);
        else params.push(fields[key] ?? null);
      }
    }

    if (!sets.length) return getTaskById(id);

    params.push(Number(id));
    const { rows } = await client.query(
      `UPDATE crm_tareas_proyecto
          SET ${sets.join(', ')},
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $${index}
        RETURNING id`,
      params
    );
    if (!rows[0]) return null;

    await recalculateProjectProgress(client, current.proyecto_id);
    return getTaskById(id);
  });
}

module.exports = {
  list,
  getById,
  listTareas,
  createProject,
  updateProject,
  createTask,
  getTaskById,
  updateTask,
};
