const { query, withTransaction } = require('../../db/pg');

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function encodeJson(value) {
  try {
    return JSON.stringify(value == null ? {} : value);
  } catch {
    return '{}';
  }
}

function decodeJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function listDebtRiskBase({ limit = 100 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const { rows } = await query(
    `SELECT c.id AS cliente_id,
            c.nombre,
            c.apellido,
            c.telefono,
            c.email,
            COALESCE(vd.deuda_pendiente, 0)::float AS deuda_pendiente,
            COALESCE(vd.deuda_0_30, 0)::float AS deuda_0_30,
            COALESCE(vd.deuda_31_60, 0)::float AS deuda_31_60,
            COALESCE(vd.deuda_61_90, 0)::float AS deuda_61_90,
            COALESCE(vd.deuda_mas_90, 0)::float AS deuda_mas_90,
            COALESCE(vd.dias_promedio_atraso, 0)::float AS dias_promedio_atraso,
            (
              SELECT MAX(date(p.fecha))
              FROM pagos p
              WHERE p.cliente_id = c.id
            ) AS last_payment_date,
            (
              SELECT COUNT(*)
              FROM cobranza_promesas cp
              WHERE cp.cliente_id = c.id
                AND cp.estado = 'incumplida'
            ) AS promesas_incumplidas,
            (
              SELECT COUNT(*)
              FROM cobranza_promesas cp
              WHERE cp.cliente_id = c.id
            ) AS promesas_totales
       FROM clientes c
  LEFT JOIN vista_deudas vd ON vd.cliente_id = c.id
      WHERE c.estado = 'activo'
      ORDER BY COALESCE(vd.deuda_pendiente, 0) DESC, c.id DESC
      LIMIT $1`,
    [lim]
  );
  return rows || [];
}

async function insertRiskSnapshot({ clienteId, score, bucket, factores }) {
  await query(
    `INSERT INTO cobranza_riesgo_snapshots(cliente_id, score, bucket, factores_json)
     VALUES ($1, $2, $3, $4)`,
    [clienteId, score, bucket, encodeJson(factores)]
  );
}

async function listPromises({ clienteId, estado, limit = 100, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (clienteId) {
    params.push(Number(clienteId));
    where.push(`cp.cliente_id = $${params.length}`);
  }
  if (estado) {
    params.push(String(estado));
    where.push(`cp.estado = $${params.length}`);
  }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 300);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);
  const { rows } = await query(
    `SELECT cp.id,
            cp.cliente_id,
            c.nombre,
            c.apellido,
            cp.monto_prometido::float AS monto_prometido,
            cp.fecha_promesa,
            cp.estado,
            cp.canal_preferido,
            cp.notas,
            cp.created_at,
            cp.updated_at
       FROM cobranza_promesas cp
       JOIN clientes c ON c.id = cp.cliente_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY cp.fecha_promesa ASC, cp.id DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params
  );
  return rows || [];
}

async function createPromise({
  clienteId,
  montoPrometido,
  fechaPromesa,
  canalPreferido = 'manual',
  notas = null,
  userId = null,
}) {
  const { rows } = await query(
    `INSERT INTO cobranza_promesas(
       cliente_id, monto_prometido, fecha_promesa, canal_preferido, notas, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING id`,
    [clienteId, montoPrometido, fechaPromesa, canalPreferido, notas, userId]
  );
  return rows[0] || null;
}

async function updatePromiseStatus({ id, estado, notas, userId }) {
  const fields = ['estado = $2', 'updated_at = CURRENT_TIMESTAMP', 'updated_by = $3'];
  const params = [id, estado, userId || null];
  if (typeof notas !== 'undefined') {
    params.push(notas || null);
    fields.push(`notas = $${params.length}`);
  }
  const { rows } = await query(
    `UPDATE cobranza_promesas
        SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING id, cliente_id`,
    params
  );
  return rows[0] || null;
}

async function listReminders({ status, clienteId, limit = 100, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (status) {
    params.push(String(status));
    where.push(`r.status = $${params.length}`);
  }
  if (clienteId) {
    params.push(Number(clienteId));
    where.push(`r.cliente_id = $${params.length}`);
  }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 300);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);
  const { rows } = await query(
    `SELECT r.id,
            r.cliente_id,
            c.nombre,
            c.apellido,
            r.canal,
            r.destino,
            r.template_code,
            r.payload_json,
            r.scheduled_at,
            r.sent_at,
            r.status,
            r.error_message
       FROM cobranza_recordatorios r
       JOIN clientes c ON c.id = r.cliente_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY r.scheduled_at DESC, r.id DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params
  );
  return (rows || []).map((r) => ({
    ...r,
    payload: decodeJson(r.payload_json, {}),
  }));
}

async function createReminder({
  clienteId,
  canal,
  destino,
  templateCode,
  payload,
  scheduledAt = null,
  status = 'pending',
  userId = null,
}) {
  const { rows } = await query(
    `INSERT INTO cobranza_recordatorios(
       cliente_id, canal, destino, template_code, payload_json, scheduled_at, status, created_by
     ) VALUES (
       $1, $2, $3, $4, $5, COALESCE($6, CURRENT_TIMESTAMP), $7, $8
     )
     RETURNING id`,
    [clienteId, canal, destino || null, templateCode, encodeJson(payload), scheduledAt, status, userId]
  );
  return rows[0] || null;
}

async function listMargins({ dimension = 'producto', desde, hasta, limit = 50 } = {}) {
  const dim = String(dimension || 'producto').toLowerCase();
  const allowed = new Set(['producto', 'vendedor', 'deposito']);
  const group = allowed.has(dim) ? dim : 'producto';
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 300);
  const fromDate = toIsoDate(parseDate(desde) || new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
  const toDate = toIsoDate(parseDate(hasta) || new Date());

  const selectMap = {
    producto: 'p.id AS entity_id, p.nombre AS entity_name',
    vendedor: 'u.id AS entity_id, u.nombre AS entity_name',
    deposito: 'd.id AS entity_id, d.nombre AS entity_name',
  };
  const joinMap = {
    producto: `JOIN productos p ON p.id = vd.producto_id
               LEFT JOIN usuarios u ON u.id = v.usuario_id
               LEFT JOIN depositos d ON d.id = v.deposito_id`,
    vendedor: `JOIN productos p ON p.id = vd.producto_id
               LEFT JOIN usuarios u ON u.id = v.usuario_id
               LEFT JOIN depositos d ON d.id = v.deposito_id`,
    deposito: `JOIN productos p ON p.id = vd.producto_id
               LEFT JOIN usuarios u ON u.id = v.usuario_id
               LEFT JOIN depositos d ON d.id = v.deposito_id`,
  };
  const groupByMap = {
    producto: 'p.id, p.nombre',
    vendedor: 'u.id, u.nombre',
    deposito: 'd.id, d.nombre',
  };

  const { rows } = await query(
    `SELECT ${selectMap[group]},
            COALESCE(SUM(vd.subtotal), 0)::float AS ingresos,
            COALESCE(SUM(vd.cantidad * COALESCE(vd.costo_unitario_pesos, p.precio_costo)), 0)::float AS costo,
            (
              COALESCE(SUM(vd.subtotal), 0) -
              COALESCE(SUM(vd.cantidad * COALESCE(vd.costo_unitario_pesos, p.precio_costo)), 0)
            )::float AS margen
       FROM ventas_detalle vd
       JOIN ventas v ON v.id = vd.venta_id
       ${joinMap[group]}
      WHERE v.estado_pago <> 'cancelado'
        AND date(v.fecha, 'localtime') >= date($1)
        AND date(v.fecha, 'localtime') <= date($2)
      GROUP BY ${groupByMap[group]}
      ORDER BY margen DESC
      LIMIT $3`,
    [fromDate, toDate, lim]
  );
  return rows || [];
}

async function listRepricingRules() {
  const { rows } = await query(
    `SELECT id, nombre, scope, scope_ref_id, channel,
            margin_min::float AS margin_min,
            margin_target::float AS margin_target,
            usd_pass_through::float AS usd_pass_through,
            rounding_step::float AS rounding_step,
            prioridad,
            status,
            created_at,
            updated_at
       FROM repricing_rules
      ORDER BY prioridad ASC, id ASC`
  );
  return rows || [];
}

async function createRepricingRule(rule, userId = null) {
  const { rows } = await query(
    `INSERT INTO repricing_rules(
       nombre, scope, scope_ref_id, channel, margin_min, margin_target, usd_pass_through,
       rounding_step, prioridad, status, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      rule.nombre,
      rule.scope || 'global',
      rule.scope_ref_id || null,
      rule.channel || null,
      rule.margin_min,
      rule.margin_target,
      rule.usd_pass_through,
      rule.rounding_step,
      rule.prioridad,
      rule.status || 'active',
      userId,
    ]
  );
  return rows[0] || null;
}

async function updateRepricingRule(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  const map = {
    nombre: 'nombre',
    scope: 'scope',
    scope_ref_id: 'scope_ref_id',
    channel: 'channel',
    margin_min: 'margin_min',
    margin_target: 'margin_target',
    usd_pass_through: 'usd_pass_through',
    rounding_step: 'rounding_step',
    prioridad: 'prioridad',
    status: 'status',
  };
  for (const [k, col] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(fields, k)) continue;
    sets.push(`${col} = $${p}`);
    params.push(fields[k]);
    p += 1;
  }
  if (!sets.length) return null;
  sets.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  const { rows } = await query(
    `UPDATE repricing_rules SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
    params
  );
  return rows[0] || null;
}

async function listProductsForPricing({ productIds = [], limit = 2000 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 2000, 1), 10000);
  if (Array.isArray(productIds) && productIds.length) {
    const ids = productIds.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0);
    if (!ids.length) return [];
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await query(
      `SELECT p.id, p.nombre, p.categoria_id, p.proveedor_id,
              p.precio_costo::float AS precio_costo,
              p.precio_costo_pesos::float AS precio_costo_pesos,
              p.precio_costo_dolares::float AS precio_costo_dolares,
              p.precio_venta::float AS precio_venta,
              p.precio_local::float AS precio_local,
              p.precio_distribuidor::float AS precio_distribuidor,
              p.precio_final::float AS precio_final,
              p.tipo_cambio::float AS tipo_cambio
         FROM productos p
        WHERE p.activo = 1
          AND p.id IN (${placeholders})`,
      ids
    );
    return rows || [];
  }
  const { rows } = await query(
    `SELECT p.id, p.nombre, p.categoria_id, p.proveedor_id,
            p.precio_costo::float AS precio_costo,
            p.precio_costo_pesos::float AS precio_costo_pesos,
            p.precio_costo_dolares::float AS precio_costo_dolares,
            p.precio_venta::float AS precio_venta,
            p.precio_local::float AS precio_local,
            p.precio_distribuidor::float AS precio_distribuidor,
            p.precio_final::float AS precio_final,
            p.tipo_cambio::float AS tipo_cambio
       FROM productos p
      WHERE p.activo = 1
      ORDER BY p.id ASC
      LIMIT $1`,
    [lim]
  );
  return rows || [];
}

async function applyRepricing({ updates, userId = null }) {
  if (!Array.isArray(updates) || !updates.length) return 0;
  return withTransaction(async (client) => {
    let changed = 0;
    for (const row of updates) {
      const productoId = Number(row.producto_id);
      if (!Number.isInteger(productoId) || productoId <= 0) continue;
      await client.query(
        `UPDATE productos
            SET precio_venta = COALESCE($2, precio_venta),
                precio_local = COALESCE($3, precio_local),
                precio_distribuidor = COALESCE($4, precio_distribuidor),
                precio_final = COALESCE($5, precio_final),
                actualizado_en = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [
          productoId,
          row.precio_venta == null ? null : Number(row.precio_venta),
          row.precio_local == null ? null : Number(row.precio_local),
          row.precio_distribuidor == null ? null : Number(row.precio_distribuidor),
          row.precio_final == null ? null : Number(row.precio_final),
        ]
      );
      await client.query(
        `INSERT INTO productos_historial(
           producto_id, proveedor_id, costo_pesos, costo_dolares, tipo_cambio,
           margen_local, margen_distribuidor, precio_local, precio_distribuidor, usuario_id
         )
         SELECT id, proveedor_id, precio_costo_pesos, precio_costo_dolares, tipo_cambio,
                margen_local, margen_distribuidor, precio_local, precio_distribuidor, $2
           FROM productos
          WHERE id = $1`,
        [productoId, userId]
      );
      changed += 1;
    }
    return changed;
  });
}

async function getCashDailySeries({ fromDate, toDate }) {
  const { rows } = await query(
    `WITH movimientos AS (
       SELECT date(fecha, 'localtime') AS fecha, monto::float AS monto, 'in' AS tipo
         FROM pagos
       UNION ALL
       SELECT date(fecha, 'localtime') AS fecha, monto::float AS monto, 'in' AS tipo
         FROM clientes_deudas_iniciales_pagos
       UNION ALL
       SELECT date(fecha, 'localtime') AS fecha, monto::float AS monto, 'out' AS tipo
         FROM gastos
       UNION ALL
       SELECT date(fecha, 'localtime') AS fecha, monto::float AS monto, 'out' AS tipo
         FROM pagos_proveedores
     )
     SELECT fecha,
            COALESCE(SUM(CASE WHEN tipo = 'in' THEN monto ELSE 0 END), 0)::float AS entradas,
            COALESCE(SUM(CASE WHEN tipo = 'out' THEN monto ELSE 0 END), 0)::float AS salidas
       FROM movimientos
      WHERE date(fecha) >= date($1)
        AND date(fecha) <= date($2)
      GROUP BY fecha
      ORDER BY fecha ASC`,
    [fromDate, toDate]
  );
  return rows || [];
}

async function getCashTotals() {
  const { rows } = await query(
    `SELECT
       COALESCE((SELECT SUM(monto) FROM pagos), 0)::float
       + COALESCE((SELECT SUM(monto) FROM clientes_deudas_iniciales_pagos), 0)::float AS total_in,
       COALESCE((SELECT SUM(monto) FROM gastos), 0)::float
       + COALESCE((SELECT SUM(monto) FROM pagos_proveedores), 0)::float AS total_out`
  );
  return rows[0] || { total_in: 0, total_out: 0 };
}

async function getDebtTotals() {
  const { rows } = await query(
    `SELECT
       COALESCE(SUM(deuda_pendiente), 0)::float AS deuda_total,
       COALESCE(SUM(deuda_mas_90), 0)::float AS deuda_mas_90
       FROM vista_deudas`
  );
  return rows[0] || { deuda_total: 0, deuda_mas_90: 0 };
}

async function getStockBreakRisk({ limit = 20 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
  const { rows } = await query(
    `SELECT producto_id, codigo, nombre, cantidad_disponible, stock_minimo
       FROM vista_stock_bajo
      ORDER BY (stock_minimo - cantidad_disponible) DESC
      LIMIT $1`,
    [lim]
  );
  return rows || [];
}

async function insertAlert({ alertCode, severity, title, detail, actionLabel, actionPath, metadata }) {
  const { rows } = await query(
    `INSERT INTO owner_alerts(alert_code, severity, title, detail, action_label, action_path, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [alertCode, severity, title, detail || null, actionLabel || null, actionPath || null, encodeJson(metadata)]
  );
  return rows[0] || null;
}

async function listAlerts({ status = 'open', limit = 100 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const { rows } = await query(
    `SELECT id, alert_code, severity, title, detail, action_label, action_path, status, metadata_json, detected_at, resolved_at
       FROM owner_alerts
      WHERE status = $1
      ORDER BY detected_at DESC
      LIMIT $2`,
    [status, lim]
  );
  return (rows || []).map((r) => ({ ...r, metadata: decodeJson(r.metadata_json, {}) }));
}

async function dismissAlert(id) {
  const { rows } = await query(
    `UPDATE owner_alerts
        SET status = 'dismissed',
            resolved_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id`,
    [id]
  );
  return rows[0] || null;
}

async function listFiscalRules() {
  const { rows } = await query(
    `SELECT id, tipo, nombre, impuesto, jurisdiccion, scope, scope_ref_id,
            alicuota::float AS alicuota, monto_minimo::float AS monto_minimo,
            vigencia_desde, vigencia_hasta, activo, prioridad
       FROM fiscal_ar_rules
      ORDER BY activo DESC, prioridad ASC, id ASC`
  );
  return rows || [];
}

async function createFiscalRule(rule) {
  const activo =
    typeof rule.activo === 'undefined' || rule.activo === null
      ? 1
      : rule.activo
      ? 1
      : 0;
  const { rows } = await query(
    `INSERT INTO fiscal_ar_rules(
       tipo, nombre, impuesto, jurisdiccion, scope, scope_ref_id, alicuota,
       monto_minimo, vigencia_desde, vigencia_hasta, activo, prioridad
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      rule.tipo,
      rule.nombre,
      rule.impuesto || 'iibb',
      rule.jurisdiccion || 'nacional',
      rule.scope || 'global',
      rule.scope_ref_id || null,
      rule.alicuota,
      rule.monto_minimo || 0,
      rule.vigencia_desde || null,
      rule.vigencia_hasta || null,
      activo,
      rule.prioridad || 100,
    ]
  );
  return rows[0] || null;
}

async function updateFiscalRule(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  const map = {
    tipo: 'tipo',
    nombre: 'nombre',
    impuesto: 'impuesto',
    jurisdiccion: 'jurisdiccion',
    scope: 'scope',
    scope_ref_id: 'scope_ref_id',
    alicuota: 'alicuota',
    monto_minimo: 'monto_minimo',
    vigencia_desde: 'vigencia_desde',
    vigencia_hasta: 'vigencia_hasta',
    activo: 'activo',
    prioridad: 'prioridad',
  };
  for (const [k, col] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(fields, k)) continue;
    sets.push(`${col} = $${p}`);
    params.push(k === 'activo' ? (fields[k] ? 1 : 0) : fields[k]);
    p += 1;
  }
  if (!sets.length) return null;
  sets.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  const { rows } = await query(
    `UPDATE fiscal_ar_rules SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
    params
  );
  return rows[0] || null;
}

async function listPriceLists() {
  const { rows } = await query(
    `SELECT id, nombre, moneda_base, canal, estrategia_actualizacion, activo, created_at, updated_at
       FROM price_lists
      ORDER BY activo DESC, nombre ASC`
  );
  return rows || [];
}

async function createPriceList(data) {
  const activo =
    typeof data.activo === 'undefined' || data.activo === null
      ? 1
      : data.activo
      ? 1
      : 0;
  const { rows } = await query(
    `INSERT INTO price_lists(nombre, moneda_base, canal, estrategia_actualizacion, activo)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [
      data.nombre,
      data.moneda_base || 'ARS',
      data.canal || null,
      data.estrategia_actualizacion || 'manual',
      activo,
    ]
  );
  return rows[0] || null;
}

async function updatePriceList(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  const map = {
    nombre: 'nombre',
    moneda_base: 'moneda_base',
    canal: 'canal',
    estrategia_actualizacion: 'estrategia_actualizacion',
    activo: 'activo',
  };
  for (const [k, col] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(fields, k)) continue;
    sets.push(`${col} = $${p}`);
    params.push(k === 'activo' ? (fields[k] ? 1 : 0) : fields[k]);
    p += 1;
  }
  if (!sets.length) return null;
  sets.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  const { rows } = await query(
    `UPDATE price_lists SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
    params
  );
  return rows[0] || null;
}

async function listPriceListRules(priceListId) {
  const { rows } = await query(
    `SELECT id, price_list_id, tipo_regla, prioridad, parametros_json, activo
       FROM price_list_rules
      WHERE price_list_id = $1
      ORDER BY activo DESC, prioridad ASC, id ASC`,
    [priceListId]
  );
  return (rows || []).map((r) => ({ ...r, parametros: decodeJson(r.parametros_json, {}) }));
}

async function createPriceListRule(priceListId, rule) {
  const activo =
    typeof rule.activo === 'undefined' || rule.activo === null
      ? 1
      : rule.activo
      ? 1
      : 0;
  const { rows } = await query(
    `INSERT INTO price_list_rules(price_list_id, tipo_regla, prioridad, parametros_json, activo)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [priceListId, rule.tipo_regla, rule.prioridad || 100, encodeJson(rule.parametros || {}), activo]
  );
  return rows[0] || null;
}

async function updatePriceListRule(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  const map = {
    tipo_regla: 'tipo_regla',
    prioridad: 'prioridad',
    parametros_json: 'parametros_json',
    activo: 'activo',
  };
  for (const [k, col] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(fields, k)) continue;
    sets.push(`${col} = $${p}`);
    if (k === 'activo') params.push(fields[k] ? 1 : 0);
    else params.push(fields[k]);
    p += 1;
  }
  if (!sets.length) return null;
  sets.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  const { rows } = await query(
    `UPDATE price_list_rules SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
    params
  );
  return rows[0] || null;
}

async function listChannelIntegrations() {
  const { rows } = await query(
    `SELECT id, canal, estado, config_json, secret_ref, last_sync_at, last_error, created_at, updated_at
       FROM channel_integrations
      ORDER BY canal ASC`
  );
  return (rows || []).map((r) => ({ ...r, config: decodeJson(r.config_json, {}) }));
}

async function upsertChannelIntegration({ canal, estado, config, secretRef }) {
  await query(
    `INSERT INTO channel_integrations(canal, estado, config_json, secret_ref)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (canal) DO UPDATE
       SET estado = EXCLUDED.estado,
           config_json = EXCLUDED.config_json,
           secret_ref = COALESCE(EXCLUDED.secret_ref, channel_integrations.secret_ref),
           last_error = NULL,
           updated_at = CURRENT_TIMESTAMP`,
    [canal, estado || 'connected', encodeJson(config || {}), secretRef || null]
  );
}

async function createChannelSyncJob({ canal, jobType, payload }) {
  const { rows } = await query(
    `INSERT INTO channel_sync_jobs(canal, job_type, payload_json, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id`,
    [canal, jobType, encodeJson(payload || {})]
  );
  return rows[0] || null;
}

async function listChannelSyncJobs({ status, limit = 100 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const where = [];
  const params = [];
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  params.push(lim);
  const { rows } = await query(
    `SELECT id, canal, job_type, payload_json, status, attempts, scheduled_at, started_at, finished_at, error_message
       FROM channel_sync_jobs
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY scheduled_at DESC, id DESC
      LIMIT $${params.length}`,
    params
  );
  return (rows || []).map((r) => ({ ...r, payload: decodeJson(r.payload_json, {}) }));
}

async function listBetaCompanies() {
  const { rows } = await query(
    `SELECT id, nombre, cuit, segmento, tamano_equipo, estado, onboarded_at, last_feedback_at, nps_score, created_at
       FROM beta_program_companies
      ORDER BY created_at DESC, id DESC`
  );
  return rows || [];
}

async function createBetaCompany(data) {
  const { rows } = await query(
    `INSERT INTO beta_program_companies(nombre, cuit, segmento, tamano_equipo, estado, onboarded_at, nps_score)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      data.nombre,
      data.cuit || null,
      data.segmento || null,
      data.tamano_equipo || null,
      data.estado || 'invited',
      data.onboarded_at || null,
      typeof data.nps_score === 'number' ? data.nps_score : null,
    ]
  );
  return rows[0] || null;
}

async function createBetaFeedback({ companyId, modulo, impactoScore, comentario }) {
  const { rows } = await query(
    `INSERT INTO beta_feedback(company_id, modulo, impacto_score, comentario)
     VALUES ($1,$2,$3,$4)
     RETURNING id`,
    [companyId, modulo, impactoScore, comentario || null]
  );
  await query(
    `UPDATE beta_program_companies
        SET last_feedback_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [companyId]
  );
  return rows[0] || null;
}

async function getBetaMetrics() {
  const { rows: companyRows } = await query(
    `SELECT
       COUNT(*)::int AS total_companies,
       COALESCE(SUM(CASE WHEN estado = 'active' THEN 1 ELSE 0 END), 0)::int AS active_companies,
       COALESCE(AVG(nps_score), 0)::float AS avg_nps
       FROM beta_program_companies`
  );
  const { rows: feedbackRows } = await query(
    `SELECT
       COUNT(*)::int AS total_feedback,
       COALESCE(AVG(impacto_score), 0)::float AS avg_impact
       FROM beta_feedback`
  );
  return {
    companies: companyRows[0] || {},
    feedback: feedbackRows[0] || {},
  };
}

async function listReleaseCycles() {
  const { rows } = await query(
    `SELECT id, codigo, mes, estado, objetivos_json, changelog_resumen, opened_at, closed_at
       FROM release_train_cycles
      ORDER BY mes DESC, id DESC`
  );
  return (rows || []).map((r) => ({ ...r, objetivos: decodeJson(r.objetivos_json, {}) }));
}

async function createReleaseCycle({ codigo, mes, objetivos }) {
  const { rows } = await query(
    `INSERT INTO release_train_cycles(codigo, mes, estado, objetivos_json)
     VALUES ($1,$2,'open',$3)
     RETURNING id`,
    [codigo, mes, encodeJson(objetivos || {})]
  );
  return rows[0] || null;
}

async function addReleaseEntry({ cycleId, categoria, titulo, impactoNegocio, kpiTarget }) {
  const { rows } = await query(
    `INSERT INTO release_changelog_entries(cycle_id, categoria, titulo, impacto_negocio, kpi_target)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [cycleId, categoria, titulo, impactoNegocio, kpiTarget || null]
  );
  return rows[0] || null;
}

async function closeReleaseCycle(id, summary) {
  const { rows } = await query(
    `UPDATE release_train_cycles
        SET estado = 'closed',
            changelog_resumen = $2,
            closed_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id`,
    [id, summary || null]
  );
  return rows[0] || null;
}

module.exports = {
  listDebtRiskBase,
  insertRiskSnapshot,
  listPromises,
  createPromise,
  updatePromiseStatus,
  listReminders,
  createReminder,
  listMargins,
  listRepricingRules,
  createRepricingRule,
  updateRepricingRule,
  listProductsForPricing,
  applyRepricing,
  getCashDailySeries,
  getCashTotals,
  getDebtTotals,
  getStockBreakRisk,
  insertAlert,
  listAlerts,
  dismissAlert,
  listFiscalRules,
  createFiscalRule,
  updateFiscalRule,
  listPriceLists,
  createPriceList,
  updatePriceList,
  listPriceListRules,
  createPriceListRule,
  updatePriceListRule,
  listChannelIntegrations,
  upsertChannelIntegration,
  createChannelSyncJob,
  listChannelSyncJobs,
  listBetaCompanies,
  createBetaCompany,
  createBetaFeedback,
  getBetaMetrics,
  listReleaseCycles,
  createReleaseCycle,
  addReleaseEntry,
  closeReleaseCycle,
};
