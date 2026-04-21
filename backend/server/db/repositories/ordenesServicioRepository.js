const { query, withTransaction } = require('../../db/pg');
const inv = require('../../services/inventoryService');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clampInt(n, min, max, d) {
  const v = parseInt(n, 10);
  return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : d;
}

/** Genera el próximo número de OS con formato OS-YYYY-NNNN */
async function generarNumeroOS() {
  const year = new Date().getFullYear();
  const prefix = `OS-${year}-`;
  const { rows } = await query(
    `SELECT numero_os FROM ordenes_servicio WHERE numero_os LIKE $1 ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  );
  if (!rows.length) return `${prefix}0001`;
  const last = String(rows[0].numero_os || '');
  const n = parseInt(last.slice(prefix.length), 10);
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

/** Recalcula y actualiza los totales de la OS */
async function recalcularTotales(client, os_id) {
  const { rows: ins } = await client.query(
    `SELECT COALESCE(SUM(subtotal), 0) AS total_ins FROM os_insumos_usados WHERE os_id = $1`,
    [os_id]
  );
  const { rows: pre } = await client.query(
    `SELECT COALESCE(SUM(subtotal), 0) AS total_pre FROM os_presupuesto_items WHERE os_id = $1`,
    [os_id]
  );
  const total_insumos = Number(ins[0]?.total_ins || 0);
  const total_mano_obra = Number(pre[0]?.total_pre || 0);
  const total_os = total_insumos + total_mano_obra;
  await client.query(
    `UPDATE ordenes_servicio
       SET total_insumos = $1, total_mano_obra = $2, total_os = $3, updated_at = NOW()
     WHERE id = $4`,
    [total_insumos, total_mano_obra, total_os, os_id]
  );
  return { total_insumos, total_mano_obra, total_os };
}

// ─── Tipos de trabajo ─────────────────────────────────────────────────────────

async function listTiposTrabajo({ soloActivos = true } = {}) {
  await query(
    `INSERT INTO os_tipos_trabajo(nombre, descripcion, color)
     SELECT 'Cambio', 'Cambio de producto o repuesto con descuento automatico de stock al entregar.', '#0ea5e9'
      WHERE NOT EXISTS (
        SELECT 1
          FROM os_tipos_trabajo
         WHERE LOWER(TRIM(nombre)) = 'cambio'
      )`
  );
  const where = soloActivos ? 'WHERE activo = 1' : '';
  const { rows } = await query(
    `SELECT id, nombre, descripcion, color, activo FROM os_tipos_trabajo ${where} ORDER BY nombre ASC`
  );
  return rows;
}

async function createTipoTrabajo({ nombre, descripcion, color }) {
  const { rows } = await query(
    `INSERT INTO os_tipos_trabajo(nombre, descripcion, color) VALUES($1, $2, $3) RETURNING id`,
    [nombre.trim(), descripcion || null, color || '#6366f1']
  );
  return rows[0];
}

async function updateTipoTrabajo(id, { nombre, descripcion, color, activo }) {
  const sets = [];
  const params = [];
  if (nombre   !== undefined) { sets.push(`nombre = $${params.length + 1}`);      params.push(nombre.trim()); }
  if (descripcion !== undefined) { sets.push(`descripcion = $${params.length + 1}`); params.push(descripcion); }
  if (color    !== undefined) { sets.push(`color = $${params.length + 1}`);       params.push(color); }
  if (activo   !== undefined) { sets.push(`activo = $${params.length + 1}`);      params.push(activo ? 1 : 0); }
  if (!sets.length) return { id };
  params.push(id);
  const { rows } = await query(
    `UPDATE os_tipos_trabajo SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
    params
  );
  return rows[0] || null;
}

// ─── Órdenes de servicio ──────────────────────────────────────────────────────

/**
 * Lista OS con filtros opcionales.
 * Retorna datos suficientes para la tabla principal (sin detalle de insumos/docs).
 */
async function list({
  q,
  estado,
  tecnico_id,
  cliente_id,
  desde,
  hasta,
  limit = 50,
  offset = 0,
} = {}) {
  const where = ['1=1'];
  const params = [];

  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(
      `(LOWER(os.numero_os) LIKE $${params.length}
        OR LOWER(c.nombre) LIKE $${params.length}
        OR LOWER(os.descripcion_problema) LIKE $${params.length})`
    );
  }
  if (estado) {
    params.push(estado);
    where.push(`os.estado = $${params.length}`);
  }
  if (tecnico_id) {
    params.push(tecnico_id);
    where.push(`os.tecnico_id = $${params.length}`);
  }
  if (cliente_id) {
    params.push(cliente_id);
    where.push(`os.cliente_id = $${params.length}`);
  }
  if (desde) {
    params.push(desde);
    where.push(`DATE(os.fecha_recepcion) >= $${params.length}`);
  }
  if (hasta) {
    params.push(hasta);
    where.push(`DATE(os.fecha_recepcion) <= $${params.length}`);
  }

  const lim = clampInt(limit, 1, 200, 50);
  const off = clampInt(offset, 0, 999999, 0);
  params.push(lim, off);

  const sql = `
    SELECT
      os.id,
      os.numero_os,
      os.estado,
      os.descripcion_problema,
      os.fecha_recepcion,
      os.fecha_estimada_entrega,
      os.fecha_entrega_real,
      os.total_mano_obra,
      os.total_insumos,
      os.total_os,
      os.presupuesto_aprobado,
      os.updated_at,
      c.id        AS cliente_id,
      c.nombre    AS cliente_nombre,
      c.telefono  AS cliente_telefono,
      t.id        AS tecnico_id,
      t.nombre    AS tecnico_nombre,
      tt.id       AS tipo_trabajo_id,
      tt.nombre   AS tipo_trabajo_nombre,
      tt.color    AS tipo_trabajo_color
    FROM ordenes_servicio os
    LEFT JOIN clientes  c  ON c.id  = os.cliente_id
    LEFT JOIN usuarios  t  ON t.id  = os.tecnico_id
    LEFT JOIN os_tipos_trabajo tt ON tt.id = os.tipo_trabajo_id
    WHERE ${where.join(' AND ')}
    ORDER BY os.id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const { rows } = await query(sql, params);

  // Total sin paginar (para el contador de la UI)
  const countParams = params.slice(0, -2);
  const { rows: countRows } = await query(
    `SELECT COUNT(*) AS total
       FROM ordenes_servicio os
       LEFT JOIN clientes c ON c.id = os.cliente_id
      WHERE ${where.join(' AND ')}`,
    countParams
  );

  return { rows, total: Number(countRows[0]?.total || 0) };
}

/** Conteo por estado para el tablero Kanban */
async function tablero() {
  const { rows } = await query(
    `SELECT estado, COUNT(*) AS cantidad, COALESCE(SUM(total_os), 0) AS monto_total
       FROM ordenes_servicio
      GROUP BY estado`
  );
  return rows;
}

/** Detalle completo de una OS (sin insumos/docs, se piden en endpoints separados) */
async function findById(id) {
  const { rows } = await query(
    `SELECT
       os.id, os.numero_os, os.estado,
       os.descripcion_problema, os.observaciones_internas, os.observaciones_cliente,
       os.fecha_recepcion, os.fecha_estimada_entrega, os.fecha_entrega_real,
       os.total_mano_obra, os.total_insumos, os.total_os,
       os.presupuesto_aprobado, os.venta_id,
       os.created_at, os.updated_at,
       c.id AS cliente_id, c.nombre AS cliente_nombre,
       c.telefono AS cliente_telefono, c.email AS cliente_email,
       t.id AS tecnico_id, t.nombre AS tecnico_nombre,
       tt.id AS tipo_trabajo_id, tt.nombre AS tipo_trabajo_nombre, tt.color AS tipo_trabajo_color,
       cb.nombre AS created_by_nombre
     FROM ordenes_servicio os
     LEFT JOIN clientes        c  ON c.id  = os.cliente_id
     LEFT JOIN usuarios        t  ON t.id  = os.tecnico_id
     LEFT JOIN os_tipos_trabajo tt ON tt.id = os.tipo_trabajo_id
     LEFT JOIN usuarios        cb ON cb.id = os.created_by
     WHERE os.id = $1`,
    [id]
  );
  return rows[0] || null;
}

/** Crea una nueva OS. Genera el número automáticamente. */
async function create({ cliente_id, tipo_trabajo_id, descripcion_problema, observaciones_internas, observaciones_cliente, tecnico_id, fecha_estimada_entrega, created_by }) {
  return withTransaction(async (client) => {
    const numero_os = await generarNumeroOS();
    const { rows } = await client.query(
      `INSERT INTO ordenes_servicio
         (numero_os, cliente_id, tipo_trabajo_id, descripcion_problema,
          observaciones_internas, observaciones_cliente, tecnico_id,
          fecha_estimada_entrega, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        numero_os,
        cliente_id,
        tipo_trabajo_id || null,
        descripcion_problema.trim(),
        observaciones_internas || null,
        observaciones_cliente  || null,
        tecnico_id || null,
        fecha_estimada_entrega || null,
        created_by || null,
      ]
    );
    const os_id = rows[0].id;
    // Registrar estado inicial en el historial
    await client.query(
      `INSERT INTO os_historial_estados(os_id, estado_anterior, estado_nuevo, usuario_id, observacion)
       VALUES($1, NULL, 'recibido', $2, 'Orden de servicio creada')`,
      [os_id, created_by || null]
    );
    return { id: os_id, numero_os };
  });
}

/** Actualiza campos editables de la OS (no cambia estado) */
async function update(id, fields) {
  const allowed = [
    'tipo_trabajo_id', 'descripcion_problema', 'observaciones_internas',
    'observaciones_cliente', 'tecnico_id', 'fecha_estimada_entrega',
    'total_mano_obra',
  ];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${key} = $${params.length + 1}`);
      params.push(fields[key] ?? null);
    }
  }
  if (!sets.length) return { id };
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const { rows } = await query(
    `UPDATE ordenes_servicio SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
    params
  );
  return rows[0] || null;
}

/**
 * Cambia el estado de la OS con validación de transiciones.
 * Al pasar a ENTREGADO: descuenta automáticamente los insumos del stock.
 */
const TRANSICIONES_VALIDAS = {
  recibido:      ['presupuestado', 'aceptado', 'en_proceso', 'cancelado'],
  presupuestado: ['aceptado', 'cancelado', 'recibido'],
  aceptado:      ['en_proceso', 'cancelado'],
  en_proceso:    ['terminado', 'cancelado'],
  terminado:     ['entregado', 'en_proceso'],
  entregado:     ['facturado'],
  facturado:     [],
  cancelado:     [],
};

async function cambiarEstado(os_id, nuevo_estado, usuario_id, usuario_nombre, observacion, deposito_id) {
  return withTransaction(async (client) => {
    // 1. Leer estado actual con lock
    const { rows: osRows } = await client.query(
      `SELECT id, estado FROM ordenes_servicio WHERE id = $1`,
      [os_id]
    );
    if (!osRows.length) {
      const err = new Error('Orden de servicio no encontrada');
      err.status = 404;
      throw err;
    }
    const estado_actual = osRows[0].estado;

    // 2. Validar transición
    const permitidos = TRANSICIONES_VALIDAS[estado_actual] || [];
    if (!permitidos.includes(nuevo_estado)) {
      const err = new Error(
        `No se puede cambiar de "${estado_actual}" a "${nuevo_estado}". ` +
        `Transiciones válidas desde "${estado_actual}": ${permitidos.join(', ') || 'ninguna'}.`
      );
      err.status = 422;
      throw err;
    }

    // 3. Campos extra al cambiar de estado
    const extraSets = [];
    const extraParams = [];

    if (nuevo_estado === 'entregado') {
      // Descontar insumos del stock automáticamente
      const { rows: insumos } = await client.query(
        `SELECT producto_id, cantidad FROM os_insumos_usados WHERE os_id = $1`,
        [os_id]
      );
      for (const ins of insumos) {
        await inv.removeStockTx(client, {
          producto_id:  ins.producto_id,
          cantidad:     ins.cantidad,
          motivo:       'os_entrega',
          referencia:   `OS #${os_id}`,
          usuario_id:   usuario_id || null,
          deposito_id:  deposito_id || null,
        });
      }
      extraSets.push(`fecha_entrega_real = NOW()`);
    }

    if (nuevo_estado === 'facturado') {
      // nada extra por ahora; venta_id se setea aparte si se genera venta
    }

    const allSets = ['estado = $1', 'updated_at = NOW()', ...extraSets];
    const allParams = [nuevo_estado, ...extraParams, os_id];

    await client.query(
      `UPDATE ordenes_servicio SET ${allSets.join(', ')} WHERE id = $${allParams.length}`,
      allParams
    );

    // 4. Agregar entrada inmutable al historial
    await client.query(
      `INSERT INTO os_historial_estados
         (os_id, estado_anterior, estado_nuevo, usuario_id, usuario_nombre, observacion)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [os_id, estado_actual, nuevo_estado, usuario_id || null, usuario_nombre || null, observacion || null]
    );

    return { id: os_id, estado_anterior: estado_actual, estado_nuevo: nuevo_estado };
  });
}

/** Vincula una venta a la OS (al facturar desde módulo de ventas) */
async function setVentaId(os_id, venta_id) {
  await query(
    `UPDATE ordenes_servicio SET venta_id = $1, updated_at = NOW() WHERE id = $2`,
    [venta_id, os_id]
  );
}

// ─── Historial ────────────────────────────────────────────────────────────────

async function getHistorial(os_id) {
  const { rows } = await query(
    `SELECT h.id, h.estado_anterior, h.estado_nuevo, h.observacion,
            h.usuario_nombre, h.created_at
       FROM os_historial_estados h
      WHERE h.os_id = $1
      ORDER BY h.id ASC`,
    [os_id]
  );
  return rows;
}

// ─── Insumos ──────────────────────────────────────────────────────────────────

async function getInsumos(os_id) {
  const { rows } = await query(
    `SELECT
       i.id, i.os_id, i.cantidad, i.precio_unitario, i.subtotal, i.notas, i.created_at,
       p.id AS producto_id, p.nombre AS producto_nombre, p.codigo AS producto_codigo
     FROM os_insumos_usados i
     JOIN productos p ON p.id = i.producto_id
     WHERE i.os_id = $1
     ORDER BY i.id ASC`,
    [os_id]
  );
  return rows;
}

async function addInsumo(os_id, { producto_id, cantidad, precio_unitario, notas, created_by }) {
  const cant = Math.max(0.01, Number(cantidad) || 0);
  const precio = Math.max(0, Number(precio_unitario) || 0);
  const subtotal = Math.round(cant * precio * 100) / 100;

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO os_insumos_usados(os_id, producto_id, cantidad, precio_unitario, subtotal, notas, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [os_id, producto_id, cant, precio, subtotal, notas || null, created_by || null]
    );
    await recalcularTotales(client, os_id);
    return rows[0];
  });
}

async function updateInsumo(os_id, insumo_id, { cantidad, precio_unitario, notas }) {
  return withTransaction(async (client) => {
    const cant = Math.max(0.01, Number(cantidad) || 0);
    const precio = Math.max(0, Number(precio_unitario) || 0);
    const subtotal = Math.round(cant * precio * 100) / 100;
    await client.query(
      `UPDATE os_insumos_usados
          SET cantidad = $1, precio_unitario = $2, subtotal = $3, notas = $4
        WHERE id = $5 AND os_id = $6`,
      [cant, precio, subtotal, notas ?? null, insumo_id, os_id]
    );
    await recalcularTotales(client, os_id);
    return { id: insumo_id };
  });
}

async function removeInsumo(os_id, insumo_id) {
  return withTransaction(async (client) => {
    await client.query(
      `DELETE FROM os_insumos_usados WHERE id = $1 AND os_id = $2`,
      [insumo_id, os_id]
    );
    await recalcularTotales(client, os_id);
    return { id: insumo_id };
  });
}

// ─── Documentos ───────────────────────────────────────────────────────────────

async function getDocumentos(os_id, rol_usuario) {
  const { rows } = await query(
    `SELECT id, nombre_archivo, tipo_mime, url_archivo, descripcion, acceso_roles, created_at
       FROM os_documentos
      WHERE os_id = $1 AND activo = 1
      ORDER BY id ASC`,
    [os_id]
  );
  // Filtrar por rol si el documento tiene restricciones
  return rows.filter((doc) => {
    if (!doc.acceso_roles) return true;
    const roles = Array.isArray(doc.acceso_roles) ? doc.acceso_roles : JSON.parse(doc.acceso_roles || '[]');
    if (!roles.length) return true;
    return roles.includes(rol_usuario);
  });
}

async function addDocumento(os_id, { nombre_archivo, tipo_mime, url_archivo, descripcion, acceso_roles, uploaded_by }) {
  const { rows } = await query(
    `INSERT INTO os_documentos(os_id, nombre_archivo, tipo_mime, url_archivo, descripcion, acceso_roles, uploaded_by)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      os_id,
      nombre_archivo.trim(),
      tipo_mime || null,
      url_archivo.trim(),
      descripcion || null,
      acceso_roles ? JSON.stringify(acceso_roles) : null,
      uploaded_by || null,
    ]
  );
  return rows[0];
}

async function removeDocumento(os_id, doc_id) {
  await query(
    `UPDATE os_documentos SET activo = 0 WHERE id = $1 AND os_id = $2`,
    [doc_id, os_id]
  );
  return { id: doc_id };
}

// ─── Presupuesto ──────────────────────────────────────────────────────────────

async function getPresupuesto(os_id) {
  const { rows } = await query(
    `SELECT id, descripcion, cantidad, precio_unitario, subtotal, orden
       FROM os_presupuesto_items
      WHERE os_id = $1
      ORDER BY orden ASC, id ASC`,
    [os_id]
  );
  return rows;
}

/**
 * Reemplaza todos los items del presupuesto de la OS.
 * items: [{ descripcion, cantidad, precio_unitario }]
 */
async function setPresupuesto(os_id, items) {
  return withTransaction(async (client) => {
    await client.query(`DELETE FROM os_presupuesto_items WHERE os_id = $1`, [os_id]);

    let totalManoObra = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const cant = Math.max(0, Number(item.cantidad) || 1);
      const precio = Math.max(0, Number(item.precio_unitario) || 0);
      const subtotal = Math.round(cant * precio * 100) / 100;
      totalManoObra += subtotal;
      await client.query(
        `INSERT INTO os_presupuesto_items(os_id, descripcion, cantidad, precio_unitario, subtotal, orden)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [os_id, String(item.descripcion || '').trim(), cant, precio, subtotal, i]
      );
    }

    // Actualizar mano de obra y recalcular total
    await client.query(
      `UPDATE ordenes_servicio SET total_mano_obra = $1, updated_at = NOW() WHERE id = $2`,
      [Math.round(totalManoObra * 100) / 100, os_id]
    );
    await recalcularTotales(client, os_id);
    return { os_id, items_count: items.length };
  });
}

module.exports = {
  // Tipos de trabajo
  listTiposTrabajo,
  createTipoTrabajo,
  updateTipoTrabajo,
  // Órdenes
  list,
  tablero,
  findById,
  create,
  update,
  cambiarEstado,
  setVentaId,
  // Historial
  getHistorial,
  // Insumos
  getInsumos,
  addInsumo,
  updateInsumo,
  removeInsumo,
  // Documentos
  getDocumentos,
  addDocumento,
  removeDocumento,
  // Presupuesto
  getPresupuesto,
  setPresupuesto,
};
