const { query, withTransaction } = require('../pg');

const CONFIG_COLUMNS = {
  estado: 'estado',
  access_token_enc: 'access_token_enc',
  refresh_token_enc: 'refresh_token_enc',
  token_type: 'token_type',
  scope: 'scope',
  external_user_id: 'external_user_id',
  external_user_name: 'external_user_name',
  token_expires_at: 'token_expires_at',
  refresh_token_expires_at: 'refresh_token_expires_at',
  webhook_secret_enc: 'webhook_secret_enc',
  metadata_json: 'metadata_json',
  ultimo_sync_en: 'ultimo_sync_en',
  ultimo_error: 'ultimo_error',
  activo: 'activo',
};

const MP_LINK_COLUMNS = {
  integracion_config_id: 'integracion_config_id',
  mp_preference_id: 'mp_preference_id',
  mp_payment_id: 'mp_payment_id',
  external_reference: 'external_reference',
  init_point: 'init_point',
  sandbox_init_point: 'sandbox_init_point',
  estado: 'estado',
  payment_status_detail: 'payment_status_detail',
  local_pago_id: 'local_pago_id',
  expires_at: 'expires_at',
  last_seen_at: 'last_seen_at',
  payload_json: 'payload_json',
};

const ML_SYNC_COLUMNS = {
  integracion_config_id: 'integracion_config_id',
  ml_item_id: 'ml_item_id',
  ml_permalink: 'ml_permalink',
  estado_publicacion: 'estado_publicacion',
  precio_publicado: 'precio_publicado',
  stock_publicado: 'stock_publicado',
  ultimo_sync_en: 'ultimo_sync_en',
  ultimo_error: 'ultimo_error',
  payload_json: 'payload_json',
};

const ML_ORDER_COLUMNS = {
  integracion_config_id: 'integracion_config_id',
  venta_id: 'venta_id',
  ml_buyer_id: 'ml_buyer_id',
  ml_shipping_id: 'ml_shipping_id',
  ml_pack_id: 'ml_pack_id',
  estado_orden: 'estado_orden',
  estado_importacion: 'estado_importacion',
  total_order: 'total_order',
  fecha_orden: 'fecha_orden',
  importado_en: 'importado_en',
  ultimo_error: 'ultimo_error',
  payload_json: 'payload_json',
};

const PROCESSING_LOCK_TTL_MS = 15 * 60 * 1000;

function normalizeBoolean(value) {
  if (value == null) return null;
  return value ? 1 : 0;
}

function normalizeDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeJson(value) {
  if (value == null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function buildUpdateClause(data, mapping, params) {
  const sets = [];
  for (const [key, column] of Object.entries(mapping)) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    let value = data[key];
    if (key === 'metadata_json' || key === 'payload_json') value = normalizeJson(value);
    if (key === 'activo') value = normalizeBoolean(value);
    if (key.endsWith('_at') || key.endsWith('_en') || key === 'fecha_orden' || key === 'importado_en') {
      value = normalizeDateTime(value);
    }
    params.push(value ?? null);
    sets.push(`${column} = $${params.length}`);
  }
  return sets;
}

function isFreshProcessingLock(row) {
  if (!row) return false;
  const status = String(row.estado_importacion || row.estado || '').toLowerCase();
  if (status !== 'procesando') return false;
  const updatedAt = normalizeDateTime(row.actualizado_en || row.last_seen_at || row.importado_en);
  if (!updatedAt) return false;
  return Date.now() - updatedAt.getTime() < PROCESSING_LOCK_TTL_MS;
}

function normalizeConfigActivo(payload = {}) {
  if (Object.prototype.hasOwnProperty.call(payload, 'activo')) {
    return normalizeBoolean(payload.activo);
  }
  const status = String(payload.estado || '').trim().toLowerCase();
  return status === 'desconectado' ? 0 : 1;
}

async function getIntegracionConfig(proveedor) {
  const { rows } = await query(
    `SELECT *
       FROM integraciones_config
      WHERE proveedor = $1
      LIMIT 1`,
    [proveedor]
  );
  return rows[0] || null;
}

async function upsertIntegracionConfig(proveedor, data = {}) {
  const existing = await getIntegracionConfig(proveedor);
  const payload = { ...data };
  if (Object.prototype.hasOwnProperty.call(payload, 'metadata_json')) {
    payload.metadata_json = normalizeJson(payload.metadata_json);
  }

  if (!existing) {
    const record = {
      estado: payload.estado || 'desconectado',
      access_token_enc: payload.access_token_enc ?? null,
      refresh_token_enc: payload.refresh_token_enc ?? null,
      token_type: payload.token_type ?? null,
      scope: payload.scope ?? null,
      external_user_id: payload.external_user_id ?? null,
      external_user_name: payload.external_user_name ?? null,
      token_expires_at: normalizeDateTime(payload.token_expires_at),
      refresh_token_expires_at: normalizeDateTime(payload.refresh_token_expires_at),
      webhook_secret_enc: payload.webhook_secret_enc ?? null,
      metadata_json: payload.metadata_json ?? null,
      ultimo_sync_en: normalizeDateTime(payload.ultimo_sync_en),
      ultimo_error: payload.ultimo_error ?? null,
      activo: normalizeConfigActivo(payload),
    };
    const { rows } = await query(
      `INSERT INTO integraciones_config(
         proveedor, estado, access_token_enc, refresh_token_enc, token_type, scope,
         external_user_id, external_user_name, token_expires_at, refresh_token_expires_at,
         webhook_secret_enc, metadata_json, ultimo_sync_en, ultimo_error, activo
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        proveedor,
        record.estado,
        record.access_token_enc,
        record.refresh_token_enc,
        record.token_type,
        record.scope,
        record.external_user_id,
        record.external_user_name,
        record.token_expires_at,
        record.refresh_token_expires_at,
        record.webhook_secret_enc,
        record.metadata_json,
        record.ultimo_sync_en,
        record.ultimo_error,
        record.activo,
      ]
    );
    return rows[0] || null;
  }

  const params = [];
  const sets = buildUpdateClause(payload, CONFIG_COLUMNS, params);
  if (!sets.length) return existing;
  sets.push('actualizado_en = CURRENT_TIMESTAMP');
  params.push(proveedor);
  const { rows } = await query(
    `UPDATE integraciones_config
        SET ${sets.join(', ')}
      WHERE proveedor = $${params.length}
      RETURNING *`,
    params
  );
  return rows[0] || existing;
}

async function setIntegracionStatus(proveedor, estado, extra = {}) {
  return upsertIntegracionConfig(proveedor, {
    ...extra,
    estado,
    activo: estado !== 'desconectado',
  });
}

async function disableIntegracion(proveedor) {
  return upsertIntegracionConfig(proveedor, {
    estado: 'desconectado',
    access_token_enc: null,
    refresh_token_enc: null,
    token_type: null,
    scope: null,
    token_expires_at: null,
    refresh_token_expires_at: null,
    external_user_id: null,
    external_user_name: null,
    webhook_secret_enc: null,
    metadata_json: null,
    ultimo_error: null,
    activo: false,
  });
}

async function getMpPaymentLink(ventaId) {
  const { rows } = await query(
    `SELECT mpl.*, ic.proveedor, ic.estado AS integracion_estado
       FROM mp_payment_links mpl
  LEFT JOIN integraciones_config ic ON ic.id = mpl.integracion_config_id
      WHERE mpl.venta_id = $1
      LIMIT 1`,
    [ventaId]
  );
  return rows[0] || null;
}

async function getMpPaymentLinkByPreferenceId(preferenceId) {
  const { rows } = await query(
    `SELECT *
       FROM mp_payment_links
      WHERE mp_preference_id = $1
      LIMIT 1`,
    [preferenceId]
  );
  return rows[0] || null;
}

async function getMpPaymentLinkByPaymentId(paymentId) {
  const { rows } = await query(
    `SELECT *
       FROM mp_payment_links
      WHERE mp_payment_id = $1
      LIMIT 1`,
    [paymentId]
  );
  return rows[0] || null;
}

async function upsertMpPaymentLink(data = {}) {
  const ventaId = Number(data.venta_id);
  if (!Number.isInteger(ventaId) || ventaId <= 0) {
    throw new Error('venta_id invalido para mp_payment_links');
  }

  const existingByVenta = await getMpPaymentLink(ventaId);
  const existingByPreference = data.mp_preference_id
    ? await getMpPaymentLinkByPreferenceId(data.mp_preference_id)
    : null;

  const existing =
    existingByVenta ||
    existingByPreference ||
    null;

  if (
    existingByVenta &&
    existingByPreference &&
    Number(existingByVenta.id) !== Number(existingByPreference.id)
  ) {
    throw new Error('Conflicto de preference_id con otra venta');
  }

  if (!existing) {
    const payload = {
      integracion_config_id: data.integracion_config_id ?? null,
      mp_preference_id: data.mp_preference_id,
      mp_payment_id: data.mp_payment_id ?? null,
      external_reference: data.external_reference ?? null,
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point ?? null,
      estado: data.estado || 'pendiente',
      payment_status_detail: data.payment_status_detail ?? null,
      local_pago_id: data.local_pago_id ?? null,
      expires_at: normalizeDateTime(data.expires_at),
      last_seen_at: normalizeDateTime(data.last_seen_at),
      payload_json: normalizeJson(data.payload_json),
    };

    const { rows } = await query(
      `INSERT INTO mp_payment_links(
         venta_id, integracion_config_id, mp_preference_id, mp_payment_id, external_reference,
         init_point, sandbox_init_point, estado, payment_status_detail, local_pago_id,
         expires_at, last_seen_at, payload_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        ventaId,
        payload.integracion_config_id,
        payload.mp_preference_id,
        payload.mp_payment_id,
        payload.external_reference,
        payload.init_point,
        payload.sandbox_init_point,
        payload.estado,
        payload.payment_status_detail,
        payload.local_pago_id,
        payload.expires_at,
        payload.last_seen_at,
        payload.payload_json,
      ]
    );
    return rows[0] || null;
  }

  const params = [];
  const sets = buildUpdateClause(data, MP_LINK_COLUMNS, params);
  if (!sets.length) return existing;
  sets.push('actualizado_en = CURRENT_TIMESTAMP');
  params.push(ventaId);
  const { rows } = await query(
    `UPDATE mp_payment_links
        SET ${sets.join(', ')}
      WHERE venta_id = $${params.length}
      RETURNING *`,
    params
  );
  return rows[0] || existing;
}

async function updateMpPaymentLinkEstado(ventaId, fields = {}) {
  const params = [];
  const sets = buildUpdateClause(fields, MP_LINK_COLUMNS, params);
  if (!sets.length) return getMpPaymentLink(ventaId);
  sets.push('actualizado_en = CURRENT_TIMESTAMP');
  params.push(ventaId);
  const { rows } = await query(
    `UPDATE mp_payment_links
        SET ${sets.join(', ')}
      WHERE venta_id = $${params.length}
      RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function claimMpPaymentLinkProcessing(ventaId, mpPaymentId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT *
         FROM mp_payment_links
        WHERE venta_id = $1
        LIMIT 1
        FOR UPDATE`,
      [ventaId]
    );

    const row = rows[0] || null;
    if (!row) return { claimed: false, row: null };
    if (row.local_pago_id) return { claimed: false, row };
    if (String(row.estado || '').toLowerCase() === 'procesando' && isFreshProcessingLock(row)) {
      return { claimed: false, row };
    }

    await client.query(
      `UPDATE mp_payment_links
          SET mp_payment_id = COALESCE($2, mp_payment_id),
              estado = 'procesando',
              last_seen_at = CURRENT_TIMESTAMP,
              actualizado_en = CURRENT_TIMESTAMP
        WHERE venta_id = $1`,
      [ventaId, mpPaymentId || null]
    );

    const { rows: updatedRows } = await client.query(
      `SELECT *
         FROM mp_payment_links
        WHERE venta_id = $1
        LIMIT 1`,
      [ventaId]
    );

    return { claimed: true, row: updatedRows[0] || row };
  });
}

function buildMlSyncSelect({ whereSql = '', suffixSql = '', params = [] } = {}) {
  return query(
    `SELECT s.*,
            p.nombre AS producto_nombre,
            p.codigo AS producto_codigo,
            p.precio_venta::float AS producto_precio,
            COALESCE(i.cantidad_disponible, 0)::float AS producto_stock
       FROM ml_product_sync s
       JOIN productos p ON p.id = s.producto_id
  LEFT JOIN inventario i ON i.producto_id = p.id
      ${whereSql}
   ORDER BY s.actualizado_en DESC, s.id DESC
      ${suffixSql}`,
    params
  );
}

async function listMlProductSync({ limit = 100, offset = 0 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const { rows } = await buildMlSyncSelect({
    suffixSql: `LIMIT $1 OFFSET $2`,
    params: [lim, off],
  });
  return rows;
}

async function getMlProductSyncByProductoId(productoId) {
  const { rows } = await buildMlSyncSelect({
    whereSql: `WHERE s.producto_id = $1`,
    suffixSql: `LIMIT 1`,
    params: [productoId],
  });
  return rows[0] || null;
}

async function getMlProductSyncByMlItemId(mlItemId) {
  const { rows } = await buildMlSyncSelect({
    whereSql: `WHERE s.ml_item_id = $1`,
    suffixSql: `LIMIT 1`,
    params: [mlItemId],
  });
  return rows[0] || null;
}

async function upsertMlProductSync(data = {}) {
  const productoId = Number(data.producto_id);
  if (!Number.isInteger(productoId) || productoId <= 0) {
    throw new Error('producto_id invalido para ml_product_sync');
  }

  const existingByProducto = await getMlProductSyncByProductoId(productoId);
  const existingByItem = data.ml_item_id ? await getMlProductSyncByMlItemId(data.ml_item_id) : null;

  if (
    existingByProducto &&
    existingByItem &&
    Number(existingByProducto.id) !== Number(existingByItem.id)
  ) {
    throw new Error('Conflicto entre producto_id y ml_item_id');
  }

  const existing = existingByProducto || existingByItem || null;

  if (!existing) {
    const { rows } = await query(
      `INSERT INTO ml_product_sync(
         producto_id, integracion_config_id, ml_item_id, ml_permalink,
         estado_publicacion, precio_publicado, stock_publicado,
         ultimo_sync_en, ultimo_error, payload_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        productoId,
        data.integracion_config_id ?? null,
        data.ml_item_id,
        data.ml_permalink ?? null,
        data.estado_publicacion || 'active',
        data.precio_publicado ?? null,
        data.stock_publicado ?? null,
        normalizeDateTime(data.ultimo_sync_en),
        data.ultimo_error ?? null,
        normalizeJson(data.payload_json),
      ]
    );
    return rows[0] || null;
  }

  const params = [];
  const sets = buildUpdateClause(data, ML_SYNC_COLUMNS, params);
  if (!sets.length) return existing;
  sets.push('actualizado_en = CURRENT_TIMESTAMP');
  params.push(productoId);
  const { rows } = await query(
    `UPDATE ml_product_sync
        SET ${sets.join(', ')}
      WHERE producto_id = $${params.length}
      RETURNING *`,
    params
  );
  return rows[0] || existing;
}

async function getMlOrderImport(mlOrderId) {
  const { rows } = await query(
    `SELECT moi.*,
            v.fecha AS venta_fecha,
            v.neto::float AS venta_neto,
            v.estado_pago AS venta_estado_pago
       FROM ml_orders_import moi
  LEFT JOIN ventas v ON v.id = moi.venta_id
      WHERE moi.ml_order_id = $1
      LIMIT 1`,
    [mlOrderId]
  );
  return rows[0] || null;
}

async function findMlOrderImportByVentaId(ventaId) {
  const { rows } = await query(
    `SELECT *
       FROM ml_orders_import
      WHERE venta_id = $1
      LIMIT 1`,
    [ventaId]
  );
  return rows[0] || null;
}

async function createMlOrderImport(data = {}) {
  if (!data.ml_order_id) {
    throw new Error('ml_order_id requerido');
  }

  const existing = await getMlOrderImport(data.ml_order_id);
  if (existing) return existing;

  const { rows } = await query(
    `INSERT INTO ml_orders_import(
       ml_order_id, integracion_config_id, venta_id, ml_buyer_id, ml_shipping_id, ml_pack_id,
       estado_orden, estado_importacion, total_order, fecha_orden, importado_en, ultimo_error, payload_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      data.ml_order_id,
      data.integracion_config_id ?? null,
      data.venta_id ?? null,
      data.ml_buyer_id ?? null,
      data.ml_shipping_id ?? null,
      data.ml_pack_id ?? null,
      data.estado_orden ?? null,
      data.estado_importacion || 'pendiente',
      data.total_order ?? null,
      normalizeDateTime(data.fecha_orden),
      normalizeDateTime(data.importado_en),
      data.ultimo_error ?? null,
      normalizeJson(data.payload_json),
    ]
  );

  return rows[0] || null;
}

async function updateMlOrderImport(mlOrderId, fields = {}) {
  const params = [];
  const sets = buildUpdateClause(fields, ML_ORDER_COLUMNS, params);
  if (!sets.length) return getMlOrderImport(mlOrderId);
  sets.push('actualizado_en = CURRENT_TIMESTAMP');
  params.push(mlOrderId);
  const { rows } = await query(
    `UPDATE ml_orders_import
        SET ${sets.join(', ')}
      WHERE ml_order_id = $${params.length}
      RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function claimMlOrderImportProcessing(data = {}) {
  if (!data.ml_order_id) {
    throw new Error('ml_order_id requerido');
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT *
         FROM ml_orders_import
        WHERE ml_order_id = $1
        LIMIT 1
        FOR UPDATE`,
      [data.ml_order_id]
    );

    const existing = rows[0] || null;

    if (existing) {
      if (existing.venta_id) return { claimed: false, row: existing };
      if (isFreshProcessingLock(existing)) return { claimed: false, row: existing };

      const params = [];
      const sets = buildUpdateClause(
        {
          ...data,
          estado_importacion: 'procesando',
          ultimo_error: null,
        },
        ML_ORDER_COLUMNS,
        params
      );
      sets.push('actualizado_en = CURRENT_TIMESTAMP');
      params.push(data.ml_order_id);
      const { rows: updatedRows } = await client.query(
        `UPDATE ml_orders_import
            SET ${sets.join(', ')}
          WHERE ml_order_id = $${params.length}
          RETURNING *`,
        params
      );
      return { claimed: true, row: updatedRows[0] || existing };
    }

    const { rows: insertedRows } = await client.query(
      `INSERT INTO ml_orders_import(
         ml_order_id, integracion_config_id, venta_id, ml_buyer_id, ml_shipping_id, ml_pack_id,
         estado_orden, estado_importacion, total_order, fecha_orden, importado_en, ultimo_error, payload_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        data.ml_order_id,
        data.integracion_config_id ?? null,
        data.venta_id ?? null,
        data.ml_buyer_id ?? null,
        data.ml_shipping_id ?? null,
        data.ml_pack_id ?? null,
        data.estado_orden ?? null,
        'procesando',
        data.total_order ?? null,
        normalizeDateTime(data.fecha_orden),
        normalizeDateTime(data.importado_en),
        data.ultimo_error ?? null,
        normalizeJson(data.payload_json),
      ]
    );

    return { claimed: true, row: insertedRows[0] || null };
  });
}

async function listMlOrderImports({
  limit = 100,
  offset = 0,
  estado_importacion,
  desde,
  hasta,
} = {}) {
  const where = [];
  const params = [];

  if (estado_importacion) {
    params.push(estado_importacion);
    where.push(`moi.estado_importacion = $${params.length}`);
  }
  if (desde) {
    params.push(normalizeDateTime(desde));
    where.push(`moi.fecha_orden >= $${params.length}`);
  }
  if (hasta) {
    params.push(normalizeDateTime(hasta));
    where.push(`moi.fecha_orden <= $${params.length}`);
  }

  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);

  const { rows } = await query(
    `SELECT moi.*,
            v.fecha AS venta_fecha,
            v.neto::float AS venta_neto,
            v.estado_pago AS venta_estado_pago
       FROM ml_orders_import moi
  LEFT JOIN ventas v ON v.id = moi.venta_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
   ORDER BY moi.actualizado_en DESC, moi.id DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params
  );

  return rows;
}

module.exports = {
  getIntegracionConfig,
  upsertIntegracionConfig,
  setIntegracionStatus,
  disableIntegracion,
  getMpPaymentLink,
  getMpPaymentLinkByPreferenceId,
  getMpPaymentLinkByPaymentId,
  upsertMpPaymentLink,
  updateMpPaymentLinkEstado,
  claimMpPaymentLinkProcessing,
  listMlProductSync,
  getMlProductSyncByProductoId,
  getMlProductSyncByMlItemId,
  upsertMlProductSync,
  getMlOrderImport,
  findMlOrderImportByVentaId,
  createMlOrderImport,
  updateMlOrderImport,
  claimMlOrderImportProcessing,
  listMlOrderImports,
};
