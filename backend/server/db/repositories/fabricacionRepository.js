'use strict';

const { query, withTransaction } = require('../pg');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(val, min, max, fb) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fb;
  return Math.min(Math.max(n, min), max);
}

// ─── Recetas ──────────────────────────────────────────────────────────────────

async function listRecetas({ q, activa, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];

  if (activa !== undefined && activa !== '') {
    params.push(String(activa) === 'true' || String(activa) === '1' ? 1 : 0);
    where.push(`r.activa = $${params.length}`);
  }
  if (q) {
    params.push(`%${String(q).toLowerCase()}%`);
    where.push(
      `(LOWER(r.nombre) LIKE $${params.length} OR LOWER(COALESCE(p.nombre,'')) LIKE $${params.length})`
    );
  }

  const lim = clamp(limit, 1, 200, 50);
  const off = Math.max(Number(offset) || 0, 0);
  params.push(lim, off);

  const { rows } = await query(
    `SELECT r.id, r.nombre, r.descripcion, r.producto_terminado_id,
            p.nombre AS producto_terminado_nombre, p.codigo AS producto_terminado_codigo,
            r.rendimiento, r.unidad_rendimiento, r.tiempo_produccion_horas,
            r.activa, r.version, r.costo_calculado, r.costo_calculado_en,
            r.notas, r.created_at, r.updated_at,
            COUNT(i.id) AS total_items
       FROM recetas_fabricacion r
       LEFT JOIN productos p ON p.id = r.producto_terminado_id
       LEFT JOIN recetas_fabricacion_items i ON i.receta_id = r.id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       GROUP BY r.id, r.nombre, r.descripcion, r.producto_terminado_id,
                p.nombre, p.codigo, r.rendimiento, r.unidad_rendimiento,
                r.tiempo_produccion_horas, r.activa, r.version,
                r.costo_calculado, r.costo_calculado_en, r.notas, r.created_at, r.updated_at
       ORDER BY r.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function getRecetaById(id) {
  const { rows } = await query(
    `SELECT r.*,
            p.nombre AS producto_terminado_nombre, p.codigo AS producto_terminado_codigo,
            p.precio_venta AS producto_precio_venta
       FROM recetas_fabricacion r
       LEFT JOIN productos p ON p.id = r.producto_terminado_id
      WHERE r.id = $1`,
    [id]
  );
  if (!rows.length) return null;

  const receta = rows[0];

  const { rows: items } = await query(
    `SELECT i.id, i.producto_id, i.cantidad, i.unidad, i.notas,
            p.nombre AS producto_nombre, p.codigo AS producto_codigo,
            CAST(COALESCE(p.precio_costo_pesos, 0) AS DECIMAL(12,2)) AS costo_unitario,
            COALESCE(inv.cantidad_disponible, 0) AS stock_disponible
       FROM recetas_fabricacion_items i
       JOIN  productos p ON p.id = i.producto_id
       LEFT JOIN inventario inv ON inv.producto_id = i.producto_id
      WHERE i.receta_id = $1
      ORDER BY i.id`,
    [id]
  );

  receta.items = items;
  return receta;
}

async function createReceta(data) {
  const {
    nombre, descripcion, producto_terminado_id,
    rendimiento = 1, unidad_rendimiento = 'unidad',
    tiempo_produccion_horas, notas, items = [],
  } = data;

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO recetas_fabricacion
         (nombre, descripcion, producto_terminado_id, rendimiento, unidad_rendimiento, tiempo_produccion_horas, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        nombre,
        descripcion || null,
        producto_terminado_id || null,
        rendimiento,
        unidad_rendimiento,
        tiempo_produccion_horas || null,
        notas || null,
      ]
    );
    const recetaId = rows[0].id;

    for (const item of items) {
      await client.query(
        `INSERT INTO recetas_fabricacion_items (receta_id, producto_id, cantidad, unidad, notas)
         VALUES ($1,$2,$3,$4,$5)`,
        [recetaId, item.producto_id, item.cantidad, item.unidad || null, item.notas || null]
      );
    }

    return getRecetaById(recetaId);
  });
}

async function updateReceta(id, data) {
  const {
    nombre, descripcion, producto_terminado_id,
    rendimiento, unidad_rendimiento, tiempo_produccion_horas,
    notas, activa, items,
  } = data;

  return withTransaction(async (client) => {
    const sets = [];
    const params = [];

    if (nombre !== undefined)                { params.push(nombre);                  sets.push(`nombre = $${params.length}`); }
    if (descripcion !== undefined)           { params.push(descripcion || null);      sets.push(`descripcion = $${params.length}`); }
    if (producto_terminado_id !== undefined) { params.push(producto_terminado_id || null); sets.push(`producto_terminado_id = $${params.length}`); }
    if (rendimiento !== undefined)           { params.push(rendimiento);              sets.push(`rendimiento = $${params.length}`); }
    if (unidad_rendimiento !== undefined)    { params.push(unidad_rendimiento);       sets.push(`unidad_rendimiento = $${params.length}`); }
    if (tiempo_produccion_horas !== undefined) { params.push(tiempo_produccion_horas || null); sets.push(`tiempo_produccion_horas = $${params.length}`); }
    if (notas !== undefined)                 { params.push(notas || null);            sets.push(`notas = $${params.length}`); }
    if (activa !== undefined)                { params.push(activa ? 1 : 0);           sets.push(`activa = $${params.length}`); }

    if (sets.length) {
      params.push(id);
      await client.query(
        `UPDATE recetas_fabricacion SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    if (Array.isArray(items)) {
      await client.query('DELETE FROM recetas_fabricacion_items WHERE receta_id = $1', [id]);
      for (const item of items) {
        await client.query(
          `INSERT INTO recetas_fabricacion_items (receta_id, producto_id, cantidad, unidad, notas)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, item.producto_id, item.cantidad, item.unidad || null, item.notas || null]
        );
      }
      await client.query('UPDATE recetas_fabricacion SET version = version + 1 WHERE id = $1', [id]);
    }

    return getRecetaById(id);
  });
}

async function calcularCostoReceta(id) {
  const { rows: items } = await query(
    `SELECT i.cantidad, CAST(COALESCE(p.precio_costo_pesos, 0) AS DECIMAL(12,4)) AS costo_unitario
       FROM recetas_fabricacion_items i
       JOIN  productos p ON p.id = i.producto_id
      WHERE i.receta_id = $1`,
    [id]
  );

  const total = items.reduce(
    (acc, r) => acc + (parseFloat(r.cantidad) || 0) * (parseFloat(r.costo_unitario) || 0),
    0
  );

  await query(
    'UPDATE recetas_fabricacion SET costo_calculado = $1, costo_calculado_en = NOW() WHERE id = $2',
    [total, id]
  );

  return { costo_total: total, items_calculados: items.length };
}

// ─── Órdenes de fabricación ───────────────────────────────────────────────────

async function _nextNumeroOF(client) {
  const q = client ? client.query.bind(client) : query;
  const { rows } = await q('SELECT numero_of FROM ordenes_fabricacion ORDER BY id DESC LIMIT 1', []);
  if (!rows.length) return 'OF-0001';
  const m = String(rows[0].numero_of).match(/OF-(\d+)$/);
  const next = m ? parseInt(m[1], 10) + 1 : 1;
  return `OF-${String(next).padStart(4, '0')}`;
}

async function listOrdenes({
  q, estado, responsable_usuario_id, receta_id,
  desde, hasta, limit = 50, offset = 0,
} = {}) {
  const where = [];
  const params = [];

  if (q) {
    params.push(`%${String(q).toLowerCase()}%`);
    where.push(
      `(LOWER(o.numero_of) LIKE $${params.length} OR LOWER(r.nombre) LIKE $${params.length} OR LOWER(COALESCE(p.nombre,'')) LIKE $${params.length})`
    );
  }
  if (estado && estado !== 'todos') {
    params.push(estado);
    where.push(`o.estado = $${params.length}`);
  }
  if (responsable_usuario_id) { params.push(Number(responsable_usuario_id)); where.push(`o.responsable_usuario_id = $${params.length}`); }
  if (receta_id)               { params.push(Number(receta_id));               where.push(`o.receta_id = $${params.length}`); }
  if (desde)                   { params.push(desde);                            where.push(`DATE(o.created_at) >= $${params.length}`); }
  if (hasta)                   { params.push(hasta);                            where.push(`DATE(o.created_at) <= $${params.length}`); }

  const lim = clamp(limit, 1, 200, 50);
  const off = Math.max(Number(offset) || 0, 0);
  params.push(lim, off);

  const { rows } = await query(
    `SELECT o.id, o.numero_of, o.estado,
            o.cantidad_planificada, o.cantidad_producida,
            o.fecha_inicio_planificada, o.fecha_fin_planificada,
            o.fecha_inicio_real, o.fecha_fin_real,
            o.notas, o.costo_total_calculado, o.created_at, o.updated_at,
            o.receta_id, r.nombre AS receta_nombre,
            o.producto_terminado_id, p.nombre AS producto_nombre, p.codigo AS producto_codigo,
            o.responsable_usuario_id, u.nombre AS responsable_nombre,
            o.deposito_destino_id, d.nombre AS deposito_nombre
       FROM ordenes_fabricacion o
       JOIN  recetas_fabricacion r ON r.id = o.receta_id
       LEFT JOIN productos p ON p.id = o.producto_terminado_id
       LEFT JOIN usuarios  u ON u.id = o.responsable_usuario_id
       LEFT JOIN depositos d ON d.id = o.deposito_destino_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY o.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function getOrdenById(id) {
  const { rows } = await query(
    `SELECT o.*,
            r.nombre AS receta_nombre, r.rendimiento AS receta_rendimiento,
            p.nombre AS producto_nombre, p.codigo AS producto_codigo,
            u.nombre AS responsable_nombre,
            d.nombre AS deposito_nombre
       FROM ordenes_fabricacion o
       JOIN  recetas_fabricacion r ON r.id = o.receta_id
       LEFT JOIN productos p ON p.id = o.producto_terminado_id
       LEFT JOIN usuarios  u ON u.id = o.responsable_usuario_id
       LEFT JOIN depositos d ON d.id = o.deposito_destino_id
      WHERE o.id = $1`,
    [id]
  );
  if (!rows.length) return null;

  const orden = rows[0];

  const [insumosRes, historialRes] = await Promise.all([
    query(
      `SELECT ir.id, ir.producto_id, ir.cantidad_requerida,
              ir.cantidad_reservada, ir.cantidad_consumida,
              p.nombre AS producto_nombre, p.codigo AS producto_codigo
         FROM of_insumos_requeridos ir
         JOIN  productos p ON p.id = ir.producto_id
        WHERE ir.of_id = $1
        ORDER BY ir.id`,
      [id]
    ),
    query(
      'SELECT * FROM of_historial WHERE of_id = $1 ORDER BY created_at DESC',
      [id]
    ),
  ]);

  orden.insumos   = insumosRes.rows;
  orden.historial = historialRes.rows;
  return orden;
}

async function createOrden(data, usuarioId) {
  const {
    receta_id, cantidad_planificada,
    fecha_inicio_planificada, fecha_fin_planificada,
    responsable_usuario_id, deposito_destino_id, notas,
  } = data;

  return withTransaction(async (client) => {
    const numero_of = await _nextNumeroOF(client);

    // Pull recipe items and product
    const { rows: rfRows } = await client.query(
      'SELECT producto_terminado_id FROM recetas_fabricacion WHERE id = $1',
      [receta_id]
    );
    const productoTerminadoId = rfRows[0]?.producto_terminado_id || null;

    const { rows: rfItems } = await client.query(
      'SELECT producto_id, cantidad FROM recetas_fabricacion_items WHERE receta_id = $1',
      [receta_id]
    );

    const { rows } = await client.query(
      `INSERT INTO ordenes_fabricacion
         (numero_of, receta_id, producto_terminado_id, cantidad_planificada,
          fecha_inicio_planificada, fecha_fin_planificada,
          responsable_usuario_id, deposito_destino_id, notas, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        numero_of, receta_id, productoTerminadoId,
        cantidad_planificada,
        fecha_inicio_planificada || null, fecha_fin_planificada || null,
        responsable_usuario_id || null, deposito_destino_id || null,
        notas || null, usuarioId || null,
      ]
    );
    const ofId = rows[0].id;

    // Populate required insumos
    for (const item of rfItems) {
      const cantReq = parseFloat(item.cantidad) * parseFloat(cantidad_planificada);
      await client.query(
        `INSERT INTO of_insumos_requeridos (of_id, producto_id, cantidad_requerida)
         VALUES ($1,$2,$3)`,
        [ofId, item.producto_id, cantReq]
      );
    }

    await client.query(
      `INSERT INTO of_historial (of_id, estado_anterior, estado_nuevo, usuario_id, observacion)
       VALUES ($1, NULL, 'PLANIFICADA', $2, 'Orden creada')`,
      [ofId, usuarioId || null]
    );

    return getOrdenById(ofId);
  });
}

async function cambiarEstado(id, { estado, observacion }, usuario) {
  const { rows: cur } = await query(
    'SELECT estado FROM ordenes_fabricacion WHERE id = $1', [id]
  );
  if (!cur.length) return null;

  const estadoAnterior = cur[0].estado;
  const sets = ['estado = $1'];
  const params = [estado];

  if (estado === 'EN_PRODUCCION') sets.push('fecha_inicio_real = NOW()');
  if (estado === 'FINALIZADA')    sets.push('fecha_fin_real = NOW()');

  params.push(id);
  await query(
    `UPDATE ordenes_fabricacion SET ${sets.join(', ')} WHERE id = $${params.length}`,
    params
  );

  await query(
    `INSERT INTO of_historial (of_id, estado_anterior, estado_nuevo, usuario_id, usuario_nombre, observacion)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, estadoAnterior, estado, usuario?.id || null, usuario?.nombre || null, observacion || null]
  );

  return getOrdenById(id);
}

async function finalizarOrden(id, { cantidad_producida, costo_total, notas }, usuario) {
  await query(
    `UPDATE ordenes_fabricacion
        SET estado = 'FINALIZADA', fecha_fin_real = NOW(),
            cantidad_producida = $1, costo_total_calculado = $2
      WHERE id = $3`,
    [cantidad_producida || null, costo_total || null, id]
  );

  if (notas) {
    await query('UPDATE ordenes_fabricacion SET notas = $1 WHERE id = $2', [notas, id]);
  }

  await query(
    `INSERT INTO of_historial (of_id, estado_anterior, estado_nuevo, usuario_id, usuario_nombre, observacion)
     VALUES ($1,'EN_PRODUCCION','FINALIZADA',$2,$3,'Producción finalizada')`,
    [id, usuario?.id || null, usuario?.nombre || null]
  );

  return getOrdenById(id);
}

async function actualizarCantidadConsumida(ofId, insumoId, cantidad_consumida) {
  await query(
    'UPDATE of_insumos_requeridos SET cantidad_consumida = $1 WHERE id = $2 AND of_id = $3',
    [cantidad_consumida, insumoId, ofId]
  );
}

async function analisisAbastecimiento(id) {
  const { rows } = await query(
    `SELECT ir.id, ir.producto_id, ir.cantidad_requerida, ir.cantidad_reservada,
            p.nombre AS producto_nombre, p.codigo AS producto_codigo,
            COALESCE(inv.cantidad_disponible, 0) AS stock_disponible,
            COALESCE(inv.cantidad_reservada,  0) AS stock_reservado,
            COALESCE((
              SELECT SUM(ci.cantidad - COALESCE(ci.cantidad_recibida, 0))
                FROM compras_items ci
                JOIN compras c ON c.id = ci.compra_id
               WHERE ci.producto_id = ir.producto_id
                 AND c.estado IN ('pendiente','parcial')
                 AND ci.cantidad > COALESCE(ci.cantidad_recibida, 0)
            ), 0) AS entradas_pendientes
       FROM of_insumos_requeridos ir
       JOIN  productos p ON p.id = ir.producto_id
       LEFT JOIN inventario inv ON inv.producto_id = ir.producto_id
      WHERE ir.of_id = $1
      ORDER BY ir.id`,
    [id]
  );

  return rows.map((r) => {
    const req       = parseFloat(r.cantidad_requerida) || 0;
    const stock     = parseFloat(r.stock_disponible)   || 0;
    const entradas  = parseFloat(r.entradas_pendientes) || 0;
    const disponible = stock + entradas;
    const faltante   = Math.max(0, req - disponible);

    let estado;
    if (faltante === 0)             estado = 'ok';
    else if (disponible / req >= 0.75) estado = 'justo';
    else                             estado = 'falta';

    return { ...r, disponible, faltante, estado };
  });
}

async function tablero() {
  const { rows } = await query(
    `SELECT o.id, o.numero_of, o.estado,
            o.cantidad_planificada, o.cantidad_producida,
            o.fecha_inicio_planificada, o.fecha_fin_planificada, o.fecha_inicio_real,
            o.created_at, o.updated_at,
            r.nombre AS receta_nombre,
            p.nombre AS producto_nombre,
            u.nombre AS responsable_nombre,
            (SELECT COUNT(*) FROM of_insumos_requeridos ir WHERE ir.of_id = o.id)                  AS total_insumos,
            (SELECT COUNT(*) FROM of_insumos_requeridos ir
               LEFT JOIN inventario inv ON inv.producto_id = ir.producto_id
              WHERE ir.of_id = o.id
                AND COALESCE(inv.cantidad_disponible, 0) >= ir.cantidad_requerida)                  AS insumos_ok
       FROM ordenes_fabricacion o
       JOIN  recetas_fabricacion r ON r.id = o.receta_id
       LEFT JOIN productos p ON p.id = o.producto_terminado_id
       LEFT JOIN usuarios  u ON u.id = o.responsable_usuario_id
      WHERE o.estado NOT IN ('FINALIZADA','CANCELADA')
      ORDER BY o.fecha_fin_planificada ASC, o.id ASC`,
    []
  );
  return rows;
}

module.exports = {
  // Recetas
  listRecetas,
  getRecetaById,
  createReceta,
  updateReceta,
  calcularCostoReceta,
  // Órdenes
  listOrdenes,
  getOrdenById,
  createOrden,
  cambiarEstado,
  finalizarOrden,
  actualizarCantidadConsumida,
  analisisAbastecimiento,
  tablero,
};
