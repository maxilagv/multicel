const { query, withTransaction } = require('../../db/pg');
const attachmentRepo = require('./attachmentRepository');
const crmAccountRepo = require('./crmAccountRepository');

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function formatCarpetaNumero(id) {
  return `LAB-${String(id).padStart(6, '0')}`;
}

async function listTiposExamen({ soloActivos = true } = {}) {
  const { rows } = await query(
    `SELECT id, codigo, nombre, descripcion, periodicidad_dias, activo
       FROM laboral_tipos_examen
      ${soloActivos ? 'WHERE activo = TRUE' : ''}
      ORDER BY nombre ASC`
  );
  return rows;
}

async function listNomencladores({ cliente_pagador_id, tipo_examen_id, soloActivos = true } = {}) {
  const params = [];
  const where = [];

  if (cliente_pagador_id) {
    params.push(Number(cliente_pagador_id));
    where.push(`n.cliente_pagador_id = $${params.length}`);
  }
  if (tipo_examen_id) {
    params.push(Number(tipo_examen_id));
    where.push(`(n.tipo_examen_id = $${params.length} OR n.tipo_examen_id IS NULL)`);
  }
  if (soloActivos) where.push('n.activo = TRUE');

  const { rows } = await query(
    `SELECT n.id,
            n.cliente_pagador_id,
            n.tipo_examen_id,
            n.codigo,
            n.descripcion,
            n.precio_unitario,
            n.activo,
            t.nombre AS tipo_examen_nombre,
            c.nombre AS cliente_pagador_nombre
       FROM laboral_nomencladores n
       LEFT JOIN laboral_tipos_examen t ON t.id = n.tipo_examen_id
       JOIN clientes c ON c.id = n.cliente_pagador_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.nombre ASC, n.codigo ASC`,
    params
  );
  return rows.map((row) => ({
    ...row,
    precio_unitario: Number(row.precio_unitario || 0),
  }));
}

async function getNomencladorById(id) {
  const { rows } = await query(
    `SELECT n.id,
            n.cliente_pagador_id,
            n.tipo_examen_id,
            n.codigo,
            n.descripcion,
            n.precio_unitario,
            n.activo,
            t.nombre AS tipo_examen_nombre,
            c.nombre AS cliente_pagador_nombre
       FROM laboral_nomencladores n
       LEFT JOIN laboral_tipos_examen t ON t.id = n.tipo_examen_id
       JOIN clientes c ON c.id = n.cliente_pagador_id
      WHERE n.id = $1
      LIMIT 1`,
    [Number(id)]
  );
  if (!rows[0]) return null;
  return {
    ...rows[0],
    precio_unitario: Number(rows[0].precio_unitario || 0),
  };
}

async function createNomenclador(data) {
  const { rows } = await query(
    `INSERT INTO laboral_nomencladores(
       cliente_pagador_id,
       tipo_examen_id,
       codigo,
       descripcion,
       precio_unitario,
       activo
     )
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING id`,
    [
      Number(data.cliente_pagador_id),
      data.tipo_examen_id || null,
      data.codigo,
      data.descripcion,
      Number(data.precio_unitario || 0),
    ]
  );
  return getNomencladorById(rows[0]?.id);
}

async function updateNomenclador(id, fields) {
  const sets = [];
  const params = [];
  let index = 1;

  for (const [key, column] of Object.entries({
    tipo_examen_id: 'tipo_examen_id',
    codigo: 'codigo',
    descripcion: 'descripcion',
    precio_unitario: 'precio_unitario',
    activo: 'activo',
  })) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${column} = $${index++}`);
      if (key === 'activo') params.push(fields[key] ? 1 : 0);
      else params.push(fields[key] ?? null);
    }
  }

  if (!sets.length) return getNomencladorById(id);

  params.push(Number(id));
  const { rows } = await query(
    `UPDATE laboral_nomencladores
        SET ${sets.join(', ')},
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $${index}
      RETURNING id`,
    params
  );
  return rows[0] ? getNomencladorById(id) : null;
}

async function createCarpeta(data) {
  return withTransaction(async (client) => {
    const cuenta = data.crm_cuenta_id
      ? await crmAccountRepo.getById(data.crm_cuenta_id)
      : await crmAccountRepo.ensureForClienteId(data.cliente_pagador_id);

    const { rows: insertRows } = await client.query(
      `INSERT INTO carpetas_laborales(
         numero_carpeta,
         cliente_pagador_id,
         crm_cuenta_id,
         tipo_carpeta,
         tipo_examen_id,
         empleado_nombre,
         empleado_dni,
         empleado_legajo,
         empleado_email,
         fecha_turno,
         proximo_control_fecha,
         ausentismo_controlar,
         estado,
         prioridad,
         resumen_clinico,
         observaciones,
         created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id`,
      [
        `TMP-${Date.now()}`,
        Number(data.cliente_pagador_id),
        cuenta?.id || null,
        data.tipo_carpeta || 'ingreso',
        data.tipo_examen_id || null,
        data.empleado_nombre,
        data.empleado_dni || null,
        data.empleado_legajo || null,
        data.empleado_email || null,
        data.fecha_turno || null,
        data.proximo_control_fecha || null,
        data.ausentismo_controlar ? 1 : 0,
        data.estado || 'abierta',
        data.prioridad || 'normal',
        data.resumen_clinico || null,
        data.observaciones || null,
        data.created_by || null,
      ]
    );

    const carpetaId = Number(insertRows[0].id);
    await client.query(
      'UPDATE carpetas_laborales SET numero_carpeta = $2 WHERE id = $1',
      [carpetaId, formatCarpetaNumero(carpetaId)]
    );

    const { rows: sectorRows } = await client.query(
      `SELECT sector_id, orden
         FROM laboral_tipos_examen_sectores
        WHERE tipo_examen_id = $1
        ORDER BY orden ASC`,
      [data.tipo_examen_id || null]
    );

    for (const sector of sectorRows) {
      await client.query(
        `INSERT INTO carpetas_laborales_informes(carpeta_id, sector_id, estado, fecha_solicitud, orden)
         VALUES ($1, $2, 'pendiente', CURRENT_TIMESTAMP, $3)`,
        [carpetaId, Number(sector.sector_id), Number(sector.orden || 0)]
      );
    }

    const { rows: nomencladores } = await client.query(
      `SELECT id, descripcion, precio_unitario
         FROM laboral_nomencladores
        WHERE cliente_pagador_id = $1
          AND activo = TRUE
          AND (tipo_examen_id = $2 OR tipo_examen_id IS NULL)
        ORDER BY codigo ASC`,
      [Number(data.cliente_pagador_id), data.tipo_examen_id || null]
    );

    for (const nomenclador of nomencladores) {
      await client.query(
        `INSERT INTO carpetas_laborales_practicas(
           carpeta_id,
           nomenclador_id,
           descripcion_manual,
           cantidad,
           precio_unitario,
           periodo_facturacion
         )
         VALUES ($1, $2, $3, 1, $4, $5)`,
        [
          carpetaId,
          Number(nomenclador.id),
          nomenclador.descripcion,
          Number(nomenclador.precio_unitario || 0),
          new Date().toISOString().slice(0, 7),
        ]
      );
    }

    await client.query(
      `INSERT INTO carpetas_laborales_eventos(carpeta_id, tipo_evento, detalle, user_id)
       VALUES ($1, 'carpeta_creada', $2, $3)`,
      [carpetaId, `Apertura de carpeta ${data.tipo_carpeta || 'ingreso'}`, data.created_by || null]
    );

    return getCarpetaById(carpetaId);
  });
}

async function updateCarpeta(id, fields) {
  const sets = [];
  const params = [];
  let index = 1;

  for (const [key, column] of Object.entries({
    tipo_carpeta: 'tipo_carpeta',
    tipo_examen_id: 'tipo_examen_id',
    empleado_nombre: 'empleado_nombre',
    empleado_dni: 'empleado_dni',
    empleado_legajo: 'empleado_legajo',
    empleado_email: 'empleado_email',
    fecha_turno: 'fecha_turno',
    fecha_cierre: 'fecha_cierre',
    proximo_control_fecha: 'proximo_control_fecha',
    ausentismo_controlar: 'ausentismo_controlar',
    estado: 'estado',
    prioridad: 'prioridad',
    resumen_clinico: 'resumen_clinico',
    observaciones: 'observaciones',
  })) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${column} = $${index++}`);
      if (key === 'ausentismo_controlar') params.push(fields[key] ? 1 : 0);
      else params.push(fields[key] ?? null);
    }
  }

  if (!sets.length) return getCarpetaById(id);

  params.push(Number(id));
  const { rows } = await query(
    `UPDATE carpetas_laborales
        SET ${sets.join(', ')},
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $${index}
      RETURNING id`,
    params
  );
  return rows[0] ? getCarpetaById(id) : null;
}

async function listCarpetas({
  q,
  cliente_pagador_id,
  estado,
  tipo_carpeta,
  soloPendientes = false,
  limit = 50,
  offset = 0,
} = {}) {
  const params = [];
  const where = [];

  if (q) {
    params.push(`%${String(q).trim().toLowerCase()}%`);
    where.push(
      `(LOWER(cl.empleado_nombre) LIKE $${params.length}
        OR LOWER(COALESCE(cl.empleado_dni, '')) LIKE $${params.length}
        OR LOWER(COALESCE(cl.numero_carpeta, '')) LIKE $${params.length}
        OR LOWER(COALESCE(c.nombre, '')) LIKE $${params.length})`
    );
  }
  if (cliente_pagador_id) {
    params.push(Number(cliente_pagador_id));
    where.push(`cl.cliente_pagador_id = $${params.length}`);
  }
  if (estado) {
    params.push(estado);
    where.push(`cl.estado = $${params.length}`);
  }
  if (tipo_carpeta) {
    params.push(tipo_carpeta);
    where.push(`cl.tipo_carpeta = $${params.length}`);
  }
  if (soloPendientes) {
    where.push(
      `EXISTS (
        SELECT 1
          FROM carpetas_laborales_informes cli
         WHERE cli.carpeta_id = cl.id
           AND cli.estado <> 'firmado'
      )`
    );
  }

  const lim = clampInt(limit, 1, 200, 50);
  const off = clampInt(offset, 0, 50000, 0);
  params.push(lim, off);

  const { rows } = await query(
    `SELECT cl.id,
            cl.numero_carpeta,
            cl.cliente_pagador_id,
            cl.crm_cuenta_id,
            cl.tipo_carpeta,
            cl.tipo_examen_id,
            cl.empleado_nombre,
            cl.empleado_dni,
            cl.empleado_legajo,
            cl.empleado_email,
            cl.fecha_apertura,
            cl.fecha_turno,
            cl.fecha_cierre,
            cl.proximo_control_fecha,
            cl.ausentismo_controlar,
            cl.estado,
            cl.prioridad,
            cl.created_at,
            c.nombre AS cliente_pagador_nombre,
            t.nombre AS tipo_examen_nombre,
            COUNT(cli.id) AS total_informes,
            SUM(CASE WHEN cli.estado = 'firmado' THEN 1 ELSE 0 END) AS informes_firmados,
            SUM(CASE WHEN cli.estado = 'pendiente' THEN 1 ELSE 0 END) AS informes_pendientes
       FROM carpetas_laborales cl
       JOIN clientes c ON c.id = cl.cliente_pagador_id
       LEFT JOIN laboral_tipos_examen t ON t.id = cl.tipo_examen_id
       LEFT JOIN carpetas_laborales_informes cli ON cli.carpeta_id = cl.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY cl.id, c.nombre, t.nombre
      ORDER BY cl.updated_at DESC, cl.id DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}`,
    params
  );

  return rows.map((row) => ({
    ...row,
    total_informes: Number(row.total_informes || 0),
    informes_firmados: Number(row.informes_firmados || 0),
    informes_pendientes: Number(row.informes_pendientes || 0),
  }));
}

async function listInformes(carpetaId) {
  const { rows } = await query(
    `SELECT i.id,
            i.carpeta_id,
            i.sector_id,
            i.tipo_informe,
            i.estado,
            i.solicitado_a_usuario_id,
            i.profesional_id,
            i.fecha_solicitud,
            i.fecha_realizacion,
            i.fecha_firma,
            i.resumen,
            i.hallazgos,
            i.aptitud_laboral,
            i.archivo_adjunto_id,
            i.orden,
            s.nombre AS sector_nombre,
            s.codigo AS sector_codigo,
            s.color_hex,
            u.nombre AS profesional_nombre
       FROM carpetas_laborales_informes i
       JOIN sectores s ON s.id = i.sector_id
       LEFT JOIN usuarios u ON u.id = i.profesional_id
      WHERE i.carpeta_id = $1
      ORDER BY i.orden ASC, i.id ASC`,
    [Number(carpetaId)]
  );
  return rows.map((row) => ({
    ...row,
    archivo_adjunto_id: row.archivo_adjunto_id != null ? Number(row.archivo_adjunto_id) : null,
  }));
}

async function getInformeById(id) {
  const { rows } = await query(
    `SELECT i.id,
            i.carpeta_id,
            i.sector_id,
            i.tipo_informe,
            i.estado,
            i.solicitado_a_usuario_id,
            i.profesional_id,
            i.fecha_solicitud,
            i.fecha_realizacion,
            i.fecha_firma,
            i.resumen,
            i.hallazgos,
            i.aptitud_laboral,
            i.archivo_adjunto_id,
            i.orden,
            s.nombre AS sector_nombre,
            s.codigo AS sector_codigo,
            s.color_hex
       FROM carpetas_laborales_informes i
       JOIN sectores s ON s.id = i.sector_id
      WHERE i.id = $1
      LIMIT 1`,
    [Number(id)]
  );
  return rows[0] || null;
}

async function updateInforme(carpetaId, informeId, fields) {
  return withTransaction(async (client) => {
    const sets = [];
    const params = [];
    let index = 1;

    for (const [key, column] of Object.entries({
      estado: 'estado',
      solicitado_a_usuario_id: 'solicitado_a_usuario_id',
      profesional_id: 'profesional_id',
      fecha_realizacion: 'fecha_realizacion',
      fecha_firma: 'fecha_firma',
      resumen: 'resumen',
      hallazgos: 'hallazgos',
      aptitud_laboral: 'aptitud_laboral',
      archivo_adjunto_id: 'archivo_adjunto_id',
      tipo_informe: 'tipo_informe',
    })) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        sets.push(`${column} = $${index++}`);
        params.push(fields[key] ?? null);
      }
    }

    if (!sets.length) return getInformeById(informeId);

    params.push(Number(informeId), Number(carpetaId));
    const { rows } = await client.query(
      `UPDATE carpetas_laborales_informes
          SET ${sets.join(', ')},
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $${index}
          AND carpeta_id = $${index + 1}
        RETURNING id`,
      params
    );

    if (!rows[0]) return null;

    await client.query(
      `INSERT INTO carpetas_laborales_eventos(carpeta_id, tipo_evento, detalle)
       VALUES ($1, 'informe_actualizado', $2)`,
      [Number(carpetaId), `Actualizacion del informe ${Number(informeId)}`]
    );

    return getInformeById(informeId);
  });
}

async function listPracticas(carpetaId) {
  const { rows } = await query(
    `SELECT p.id,
            p.carpeta_id,
            p.nomenclador_id,
            p.descripcion_manual,
            p.cantidad,
            p.precio_unitario,
            p.facturado,
            p.facturado_venta_id,
            p.periodo_facturacion,
            n.codigo AS nomenclador_codigo,
            n.descripcion AS nomenclador_descripcion
       FROM carpetas_laborales_practicas p
       LEFT JOIN laboral_nomencladores n ON n.id = p.nomenclador_id
      WHERE p.carpeta_id = $1
      ORDER BY p.id ASC`,
    [Number(carpetaId)]
  );
  return rows.map((row) => ({
    ...row,
    cantidad: Number(row.cantidad || 0),
    precio_unitario: Number(row.precio_unitario || 0),
    facturado: Boolean(row.facturado),
    facturado_venta_id: row.facturado_venta_id != null ? Number(row.facturado_venta_id) : null,
  }));
}

async function listEventos(carpetaId) {
  const { rows } = await query(
    `SELECT e.id,
            e.carpeta_id,
            e.tipo_evento,
            e.detalle,
            e.user_id,
            e.created_at,
            u.nombre AS usuario_nombre
       FROM carpetas_laborales_eventos e
       LEFT JOIN usuarios u ON u.id = e.user_id
      WHERE e.carpeta_id = $1
      ORDER BY e.created_at DESC, e.id DESC`,
    [Number(carpetaId)]
  );
  return rows;
}

async function getCarpetaById(id) {
  const { rows } = await query(
    `SELECT cl.id,
            cl.numero_carpeta,
            cl.cliente_pagador_id,
            cl.crm_cuenta_id,
            cl.tipo_carpeta,
            cl.tipo_examen_id,
            cl.empleado_nombre,
            cl.empleado_dni,
            cl.empleado_legajo,
            cl.empleado_email,
            cl.fecha_apertura,
            cl.fecha_turno,
            cl.fecha_cierre,
            cl.proximo_control_fecha,
            cl.ausentismo_controlar,
            cl.estado,
            cl.prioridad,
            cl.resumen_clinico,
            cl.observaciones,
            cl.created_by,
            cl.created_at,
            cl.updated_at,
            c.nombre AS cliente_pagador_nombre,
            t.nombre AS tipo_examen_nombre
       FROM carpetas_laborales cl
       JOIN clientes c ON c.id = cl.cliente_pagador_id
       LEFT JOIN laboral_tipos_examen t ON t.id = cl.tipo_examen_id
      WHERE cl.id = $1
      LIMIT 1`,
    [Number(id)]
  );

  const carpeta = rows[0];
  if (!carpeta) return null;

  const [informes, practicas, eventos, documentos] = await Promise.all([
    listInformes(id),
    listPracticas(id),
    listEventos(id),
    attachmentRepo.listByEntity('carpeta_laboral', id),
  ]);

  return {
    ...carpeta,
    informes,
    practicas,
    eventos,
    documentos,
  };
}

async function addDocumento(carpetaId, data) {
  const attachment = await attachmentRepo.create({
    entity_type: 'carpeta_laboral',
    entity_id: Number(carpetaId),
    storage_provider: data.storage_provider || 'external_url',
    resource_type: data.resource_type || 'raw',
    nombre_archivo: data.nombre_archivo,
    url_archivo: data.url_archivo,
    mime_type: data.tipo_mime || null,
    extension: data.extension || null,
    size_bytes: data.size_bytes || null,
    descripcion: data.descripcion || null,
    visibility_scope: data.visibility_scope || 'private',
    visibility_roles: data.visibility_roles || [],
    uploaded_by: data.uploaded_by || null,
  });

  await query(
    `INSERT INTO carpetas_laborales_eventos(carpeta_id, tipo_evento, detalle, user_id)
     VALUES ($1, 'documento_agregado', $2, $3)`,
    [Number(carpetaId), `Documento agregado: ${data.nombre_archivo}`, data.uploaded_by || null]
  );

  return attachment;
}

async function listAusentismoPendiente({ dias = 30 } = {}) {
  const horizon = clampInt(dias, 1, 365, 30);
  const { rows } = await query(
    `SELECT cl.id,
            cl.numero_carpeta,
            cl.empleado_nombre,
            cl.proximo_control_fecha,
            cl.estado,
            c.id AS cliente_pagador_id,
            c.nombre AS cliente_pagador_nombre,
            c.email AS cliente_pagador_email
       FROM carpetas_laborales cl
       JOIN clientes c ON c.id = cl.cliente_pagador_id
      WHERE cl.ausentismo_controlar = TRUE
        AND cl.proximo_control_fecha IS NOT NULL
        AND cl.estado IN ('abierta', 'en_proceso')
        AND cl.proximo_control_fecha <= DATE_ADD(CURDATE(), INTERVAL $1 DAY)
      ORDER BY cl.proximo_control_fecha ASC, cl.id ASC`,
    [horizon]
  );
  return rows;
}

module.exports = {
  listTiposExamen,
  listNomencladores,
  getNomencladorById,
  createNomenclador,
  updateNomenclador,
  createCarpeta,
  updateCarpeta,
  listCarpetas,
  getCarpetaById,
  listInformes,
  updateInforme,
  getInformeById,
  listPracticas,
  listEventos,
  addDocumento,
  listAusentismoPendiente,
  formatCarpetaNumero,
};
