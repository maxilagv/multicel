const crypto = require('crypto');
const { query } = require('../db/pg');
const reportExecutiveService = require('./reportExecutiveService');
const aiWorkspaceService = require('./aiWorkspaceService');
const clientSegmentationService = require('./clientSegmentationService');
const ownerIntelligenceService = require('./ownerIntelligenceService');

const DATASET_VERSIONS = {
  sales_snapshot: 'v1',
  inventory_snapshot: 'v1',
  customer_profile_snapshot: 'v1',
  receivables_snapshot: 'v1',
  campaign_performance_snapshot: 'v1',
  pricing_snapshot: 'v1',
  executive_summary_input: 'v1',
};

const DEFAULT_COMPANY_ID = Number.isInteger(Number(process.env.AI_COMPANY_ID))
  ? Number(process.env.AI_COMPANY_ID)
  : null;
const DEFAULT_LEAD_TIME_DAYS = Math.max(
  1,
  Number(process.env.AI_LEAD_TIME_DAYS || 7)
);

function normalizePositiveInt(value, fallback = null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeLimit(value, fallback = 100, max = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

function normalizeBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (['1', 'true', 'si', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return fallback;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function formatClientName(row) {
  return `${row?.nombre || ''}${row?.apellido ? ` ${row.apellido}` : ''}`.trim();
}

function buildScope({
  dataset,
  branchId = null,
  companyId = DEFAULT_COMPANY_ID,
  requestSource = 'internal_api',
  objective = null,
  customerId = null,
  productId = null,
  period = null,
}) {
  return {
    company_id: companyId,
    branch_id: branchId,
    user_id: null,
    user_role: 'internal_service',
    objective: objective || dataset,
    customer_id: customerId,
    product_id: productId,
    period: period || null,
    dry_run: true,
    request_source: requestSource,
  };
}

function sortForHash(value) {
  if (Array.isArray(value)) return value.map(sortForHash);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortForHash(value[key]);
      return acc;
    }, {});
}

function createHash(value) {
  const payload = JSON.stringify(sortForHash(value));
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function buildEnvelope({
  dataset,
  filters,
  scope,
  records = [],
  summary = {},
  collections = {},
}) {
  const generatedAt = new Date().toISOString();
  const content = {
    dataset,
    schema_version: DATASET_VERSIONS[dataset] || 'v1',
    generated_at: generatedAt,
    filters_used: filters || {},
    scope,
    records_used: Array.isArray(records) ? records.length : 0,
    records,
    collections,
    summary,
  };

  return {
    ...content,
    hash: createHash({
      dataset: content.dataset,
      schema_version: content.schema_version,
      filters_used: content.filters_used,
      scope: content.scope,
      records: content.records,
      collections: content.collections,
      summary: content.summary,
    }),
  };
}

function resolveRangeAndPeriod(rangeInput = {}) {
  const range = reportExecutiveService.resolveRange(rangeInput || {});
  return {
    range,
    period: `${range.fromStr}:${range.toStr}`,
  };
}

function buildSalesWhere({ fromStr, toStr, filters = {}, params = [] }) {
  const where = [
    "v.estado_pago <> 'cancelado'",
    'COALESCE(v.oculto, 0) = 0',
    `date(v.fecha, 'localtime') >= date($${params.push(fromStr)})`,
    `date(v.fecha, 'localtime') <= date($${params.push(toStr)})`,
  ];

  if (filters.usuarioId) {
    where.push(`v.usuario_id = $${params.push(filters.usuarioId)}`);
  }
  if (filters.depositoId) {
    where.push(`v.deposito_id = $${params.push(filters.depositoId)}`);
  }
  if (filters.clienteId) {
    where.push(`v.cliente_id = $${params.push(filters.clienteId)}`);
  }

  return { where, params };
}

async function buildSalesSnapshot({
  rangeInput = {},
  filters = {},
  limit = 200,
  topLimit = 10,
  companyId = DEFAULT_COMPANY_ID,
  requestSource = 'internal_api',
} = {}) {
  const { range, period } = resolveRangeAndPeriod(rangeInput);
  const reportData = await reportExecutiveService.buildExecutiveReportData({
    rangeInput,
    filters,
    insightsLimit: Math.max(topLimit, 8),
    topLimit,
  });

  const params = [];
  const salesFilter = buildSalesWhere({
    fromStr: range.fromStr,
    toStr: range.toStr,
    filters,
    params,
  });
  params.push(normalizeLimit(limit, 200, 500));

  const { rows } = await query(
    `SELECT date(v.fecha, 'localtime') AS fecha,
            v.id AS venta_id,
            v.deposito_id AS sucursal_id,
            d.nombre AS sucursal_nombre,
            v.cliente_id,
            TRIM(CONCAT(COALESCE(c.nombre, ''), ' ', COALESCE(c.apellido, ''))) AS cliente_nombre,
            v.usuario_id AS vendedor_id,
            u.nombre AS vendedor_nombre,
            vd.producto_id,
            p.nombre AS producto_nombre,
            SUM(vd.cantidad)::float AS cantidad,
            SUM(COALESCE(vd.subtotal, 0) - COALESCE(vd.descuento_oferta, 0))::float AS monto,
            SUM(vd.cantidad * COALESCE(vd.costo_unitario_pesos, p.precio_costo, 0))::float AS costo,
            SUM(COALESCE(vd.descuento_oferta, 0))::float AS descuento,
            SUM(
              (COALESCE(vd.subtotal, 0) - COALESCE(vd.descuento_oferta, 0)) -
              (vd.cantidad * COALESCE(vd.costo_unitario_pesos, p.precio_costo, 0))
            )::float AS margen
       FROM ventas_detalle vd
       JOIN ventas v ON v.id = vd.venta_id
       JOIN productos p ON p.id = vd.producto_id
       LEFT JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN usuarios u ON u.id = v.usuario_id
       LEFT JOIN depositos d ON d.id = v.deposito_id
      WHERE ${salesFilter.where.join(' AND ')}
      GROUP BY date(v.fecha, 'localtime'),
               v.id,
               v.deposito_id,
               d.nombre,
               v.cliente_id,
               c.nombre,
               c.apellido,
               v.usuario_id,
               u.nombre,
               vd.producto_id,
               p.nombre
      ORDER BY fecha DESC, venta_id DESC
      LIMIT $${params.length}`,
    params
  );

  return buildEnvelope({
    dataset: 'sales_snapshot',
    filters: {
      desde: range.fromStr,
      hasta: range.toStr,
      usuario_id: filters.usuarioId || null,
      deposito_id: filters.depositoId || null,
      cliente_id: filters.clienteId || null,
      proveedor_id: filters.proveedorId || null,
      limit: normalizeLimit(limit, 200, 500),
    },
    scope: buildScope({
      dataset: 'sales_snapshot',
      branchId: filters.depositoId || null,
      companyId,
      requestSource,
      customerId: filters.clienteId || null,
      period,
    }),
    records: (rows || []).map((row) => ({
      fecha: toIsoDate(row.fecha),
      venta_id: Number(row.venta_id),
      sucursal: {
        id: row.sucursal_id != null ? Number(row.sucursal_id) : null,
        nombre: row.sucursal_nombre || null,
      },
      cliente: {
        id: row.cliente_id != null ? Number(row.cliente_id) : null,
        nombre: row.cliente_nombre || null,
      },
      vendedor: {
        id: row.vendedor_id != null ? Number(row.vendedor_id) : null,
        nombre: row.vendedor_nombre || null,
      },
      producto: {
        id: Number(row.producto_id),
        nombre: row.producto_nombre,
      },
      cantidad: safeNumber(row.cantidad, 0),
      monto: safeNumber(row.monto, 0),
      costo: safeNumber(row.costo, 0),
      descuento: safeNumber(row.descuento, 0),
      margen: safeNumber(row.margen, 0),
    })),
    summary: {
      ventas: reportData.kpis?.ventas || null,
      cashflow: reportData.kpis?.cashflow || null,
      tendencias: reportData.trends || null,
    },
    collections: {
      serie_diaria: reportData.series || null,
      top_clientes: reportData.top?.clientes || [],
      top_productos: reportData.top?.productos || [],
      alertas: reportData.riesgos?.alertas || [],
    },
  });
}

async function buildInventorySnapshot({
  depositoId = null,
  historyDays = 90,
  limit = 200,
  companyId = DEFAULT_COMPANY_ID,
  requestSource = 'internal_api',
} = {}) {
  const boundedLimit = normalizeLimit(limit, 200, 500);
  const boundedHistory = normalizeLimit(historyDays, 90, 365);
  const joinInventario = depositoId
    ? 'LEFT JOIN inventario_depositos i ON i.producto_id = p.id AND i.deposito_id = $1'
    : 'LEFT JOIN inventario i ON i.producto_id = p.id';
  const baseParams = [];

  if (depositoId) {
    baseParams.push(Number(depositoId));
  }
  baseParams.push(boundedHistory);
  baseParams.push(boundedLimit);

  const limitMark = `$${baseParams.length}`;
  const historyMark = `$${depositoId ? 2 : 1}`;

  const { rows } = await query(
    `SELECT p.id AS producto_id,
            p.nombre AS producto_nombre,
            p.codigo,
            p.stock_minimo,
            p.reorden,
            p.proveedor_id,
            prov.nombre AS proveedor_principal,
            COALESCE(i.cantidad_disponible, 0)::float AS stock_disponible,
            COALESCE(i.cantidad_reservada, 0)::float AS stock_reservado,
            COALESCE(ventas.unidades, 0)::float AS unidades_vendidas_periodo,
            COALESCE(ventas.unidades, 0)::float / ${historyMark} AS rotacion_diaria
       FROM productos p
  LEFT JOIN proveedores prov ON prov.id = p.proveedor_id
       ${joinInventario}
  LEFT JOIN (
         SELECT vd.producto_id,
                SUM(vd.cantidad) AS unidades
           FROM ventas_detalle vd
           JOIN ventas v ON v.id = vd.venta_id
          WHERE v.estado_pago <> 'cancelado'
            AND COALESCE(v.oculto, 0) = 0
            AND date(v.fecha, 'localtime') >= date(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${historyMark} DAY))
          GROUP BY vd.producto_id
       ) ventas ON ventas.producto_id = p.id
      WHERE p.activo = 1
      ORDER BY stock_disponible ASC, p.id ASC
      LIMIT ${limitMark}`,
    baseParams
  );

  return buildEnvelope({
    dataset: 'inventory_snapshot',
    filters: {
      deposito_id: depositoId || null,
      history_days: boundedHistory,
      limit: boundedLimit,
    },
    scope: buildScope({
      dataset: 'inventory_snapshot',
      branchId: depositoId || null,
      companyId,
      requestSource,
      period: `${boundedHistory}d`,
    }),
    records: (rows || []).map((row) => {
      const rotacionDiaria = safeNumber(row.rotacion_diaria, 0);
      const stockDisponible = safeNumber(row.stock_disponible, 0);
      const cobertura = rotacionDiaria > 0 ? stockDisponible / rotacionDiaria : null;
      return {
        producto: {
          id: Number(row.producto_id),
          codigo: row.codigo || null,
          nombre: row.producto_nombre,
        },
        sucursal: depositoId ? { id: Number(depositoId) } : null,
        stock_disponible: stockDisponible,
        stock_reservado: safeNumber(row.stock_reservado, 0),
        stock_minimo: safeNumber(row.stock_minimo, 0),
        punto_reorden: safeNumber(row.reorden, 0),
        lead_time_dias: DEFAULT_LEAD_TIME_DAYS,
        proveedor_principal: row.proveedor_id
          ? {
              id: Number(row.proveedor_id),
              nombre: row.proveedor_principal || null,
            }
          : null,
        rotacion_diaria: Number(rotacionDiaria.toFixed(4)),
        cobertura_estimada_dias:
          cobertura == null ? null : Number(cobertura.toFixed(2)),
      };
    }),
    summary: {
      productos_revisados: rows.length,
      productos_con_stock_bajo: rows.filter(
        (row) => safeNumber(row.stock_disponible, 0) <= safeNumber(row.stock_minimo, 0)
      ).length,
    },
  });
}

async function loadCustomerSignalsByIds(clientIds = []) {
  const ids = Array.from(
    new Set(
      (clientIds || [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );
  if (!ids.length) {
    return {
      lastMessageByClient: new Map(),
      lastCrmActivityByClient: new Map(),
    };
  }

  const marks = ids.map((_, index) => `$${index + 1}`).join(', ');
  const [messageRes, activityRes] = await Promise.all([
    query(
      `SELECT wm.cliente_id,
              MAX(CASE WHEN wm.direccion = 'recibido' THEN wm.created_at END) AS ultima_respuesta_at,
              MAX(wm.created_at) AS ultimo_contacto_at
         FROM whatsapp_mensajes wm
        WHERE wm.cliente_id IN (${marks})
        GROUP BY wm.cliente_id`,
      ids
    ),
    query(
      `SELECT a.cliente_id,
              MAX(COALESCE(a.fecha_hora, a.creado_en)) AS ultima_actividad_at
         FROM crm_actividades a
        WHERE a.cliente_id IN (${marks})
        GROUP BY a.cliente_id`,
      ids
    ),
  ]);

  const lastMessageByClient = new Map();
  for (const row of messageRes.rows || []) {
    lastMessageByClient.set(Number(row.cliente_id), row);
  }

  const lastCrmActivityByClient = new Map();
  for (const row of activityRes.rows || []) {
    lastCrmActivityByClient.set(Number(row.cliente_id), row);
  }

  return {
    lastMessageByClient,
    lastCrmActivityByClient,
  };
}

async function buildCustomerProfileSnapshot({
  clienteId = null,
  limit = 200,
  companyId = DEFAULT_COMPANY_ID,
  requestSource = 'internal_api',
} = {}) {
  const metrics = await clientSegmentationService.listClientMetrics({
    clienteId,
    limit: normalizeLimit(limit, 200, 500),
  });
  const clientIds = metrics.map((row) => row.id);
  const signals = await loadCustomerSignalsByIds(clientIds);

  const records = metrics.map((row) => {
    const messageSignals = signals.lastMessageByClient.get(row.id);
    const crmSignals = signals.lastCrmActivityByClient.get(row.id);
    const totalCompras = safeNumber(row.total_compras, 0);
    const totalGastado = safeNumber(row.total_gastado, 0);

    return {
      cliente: {
        id: Number(row.id),
        nombre: formatClientName(row) || row.email || `Cliente ${row.id}`,
      },
      recencia_dias: row.dias_desde_ultima_compra,
      frecuencia: totalCompras,
      monto_total: totalGastado,
      ticket_promedio: totalCompras > 0 ? Number((totalGastado / totalCompras).toFixed(2)) : 0,
      ultima_respuesta_comercial_at: toIsoDate(messageSignals?.ultima_respuesta_at),
      ultimo_contacto_at:
        toIsoDate(crmSignals?.ultima_actividad_at || messageSignals?.ultimo_contacto_at),
      deuda_pendiente: safeNumber(row.deuda_pendiente, 0),
      estado_comercial: row.lead_segmento || 'sin_clasificar',
      opt_in: Boolean(row.whatsapp_opt_in),
      canales: {
        whatsapp_opt_in: Boolean(row.whatsapp_opt_in),
        email: row.email || null,
      },
      lead_score: safeNumber(row.lead_score, 0),
      oportunidades_activas: safeNumber(row.oportunidades_activas, 0),
    };
  });

  return buildEnvelope({
    dataset: 'customer_profile_snapshot',
    filters: {
      cliente_id: clienteId || null,
      limit: normalizeLimit(limit, 200, 500),
    },
    scope: buildScope({
      dataset: 'customer_profile_snapshot',
      companyId,
      requestSource,
      customerId: clienteId || null,
      period: 'lifetime',
    }),
    records,
    summary: {
      clientes_revisados: records.length,
      clientes_con_opt_in: records.filter((row) => row.opt_in).length,
      clientes_con_deuda: records.filter((row) => row.deuda_pendiente > 0).length,
    },
  });
}

async function buildReceivablesSnapshot({
  limit = 200,
  companyId = DEFAULT_COMPANY_ID,
  requestSource = 'internal_api',
} = {}) {
  const ranking = await ownerIntelligenceService.buildRiskRanking({
    limit: normalizeLimit(limit, 200, 500),
    persistSnapshot: false,
  });

  const records = ranking.map((row) => ({
    cliente: {
      id: Number(row.cliente_id),
      nombre: formatClientName(row) || `Cliente ${row.cliente_id}`,
      telefono: row.telefono_e164 || row.telefono || null,
      email: row.email || null,
    },
    saldo_pendiente: safeNumber(row.deuda_pendiente, 0),
    buckets_deuda: {
      deuda_0_30: safeNumber(row.deuda_0_30, 0),
      deuda_31_60: safeNumber(row.deuda_31_60, 0),
      deuda_61_90: safeNumber(row.deuda_61_90, 0),
      deuda_mas_90: safeNumber(row.deuda_mas_90, 0),
    },
    atraso_promedio_dias: safeNumber(row.dias_promedio_atraso, 0),
    comportamiento_historico_pago: {
      score_riesgo: safeNumber(row.score, 0),
      bucket: row.bucket || 'low',
      ultima_fecha_pago: toIsoDate(row.last_payment_date),
      promesas_incumplidas: safeNumber(row.promesas_incumplidas, 0),
      promesas_totales: safeNumber(row.promesas_totales, 0),
    },
  }));

  return buildEnvelope({
    dataset: 'receivables_snapshot',
    filters: {
      limit: normalizeLimit(limit, 200, 500),
    },
    scope: buildScope({
      dataset: 'receivables_snapshot',
      companyId,
      requestSource,
      period: 'open_balance',
    }),
    records,
    summary: {
      clientes_con_saldo: records.filter((row) => row.saldo_pendiente > 0).length,
      saldo_total: Number(
        records.reduce((acc, row) => acc + safeNumber(row.saldo_pendiente, 0), 0).toFixed(2)
      ),
      riesgo_alto_o_critico: records.filter((row) =>
        ['high', 'critical'].includes(
          String(row.comportamiento_historico_pago.bucket || '').toLowerCase()
        )
      ).length,
    },
  });
}

async function buildCampaignPerformanceSnapshot({
  days = 90,
  limit = 50,
  companyId = DEFAULT_COMPANY_ID,
  requestSource = 'internal_api',
} = {}) {
  const boundedDays = normalizeLimit(days, 90, 365);
  const boundedLimit = normalizeLimit(limit, 50, 200);

  const { rows } = await query(
    `SELECT c.id AS campaign_id,
            c.nombre AS campaign_name,
            c.canal,
            c.estado,
            c.created_at,
            COALESCE(rec.destinatarios_total, 0) AS destinatarios_total,
            COALESCE(rec.enviados, 0) AS enviados,
            COALESCE(rec.fallidos, 0) AS fallidos,
            COALESCE(reads.lecturas, 0) AS lecturas,
            COALESCE(respuestas.respuestas, 0) AS respuestas,
            COALESCE(fatigue.fatiga_promedio_por_cliente, 0)::float AS fatiga_promedio_por_cliente,
            COALESCE(fatigue.fatiga_maxima_por_cliente, 0) AS fatiga_maxima_por_cliente
       FROM whatsapp_campaigns c
  LEFT JOIN (
         SELECT campaign_id,
                COUNT(*) AS destinatarios_total,
                SUM(CASE WHEN estado = 'sent' THEN 1 ELSE 0 END) AS enviados,
                SUM(CASE WHEN estado = 'failed' THEN 1 ELSE 0 END) AS fallidos
           FROM whatsapp_campaign_recipients
          GROUP BY campaign_id
       ) rec ON rec.campaign_id = c.id
  LEFT JOIN (
         SELECT r.campaign_id,
                SUM(CASE WHEN de.provider_status = 'read' THEN 1 ELSE 0 END) AS lecturas
           FROM whatsapp_campaign_recipients r
           JOIN whatsapp_delivery_events de ON de.campaign_recipient_id = r.id
          GROUP BY r.campaign_id
       ) reads ON reads.campaign_id = c.id
  LEFT JOIN (
         SELECT campaign_id,
                COUNT(*) AS respuestas
           FROM whatsapp_mensajes
          WHERE direccion = 'recibido'
            AND campaign_id IS NOT NULL
          GROUP BY campaign_id
       ) respuestas ON respuestas.campaign_id = c.id
  LEFT JOIN (
         SELECT r.campaign_id,
                AVG(COALESCE(client_counts.contactos_30d, 0)) AS fatiga_promedio_por_cliente,
                MAX(COALESCE(client_counts.contactos_30d, 0)) AS fatiga_maxima_por_cliente
           FROM whatsapp_campaign_recipients r
      LEFT JOIN (
             SELECT cliente_id,
                    COUNT(*) AS contactos_30d
               FROM whatsapp_campaign_recipients
              WHERE cliente_id IS NOT NULL
                AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL $1 DAY)
              GROUP BY cliente_id
           ) client_counts ON client_counts.cliente_id = r.cliente_id
          GROUP BY r.campaign_id
       ) fatigue ON fatigue.campaign_id = c.id
      WHERE c.created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL $1 DAY)
      ORDER BY c.id DESC
      LIMIT $2`,
    [boundedDays, boundedLimit]
  );

  const records = (rows || []).map((row) => ({
    campana: {
      id: Number(row.campaign_id),
      nombre: row.campaign_name,
      estado: row.estado || null,
    },
    segmento: null,
    canal: row.canal || 'whatsapp',
    enviados: safeNumber(row.enviados, 0),
    aperturas_o_lecturas: safeNumber(row.lecturas, 0),
    respuestas: safeNumber(row.respuestas, 0),
    conversiones: 0,
    fatiga_por_cliente: {
      promedio_30d: Number(safeNumber(row.fatiga_promedio_por_cliente, 0).toFixed(2)),
      maximo_30d: safeNumber(row.fatiga_maxima_por_cliente, 0),
    },
    destinatarios_total: safeNumber(row.destinatarios_total, 0),
  }));

  return buildEnvelope({
    dataset: 'campaign_performance_snapshot',
    filters: {
      days: boundedDays,
      limit: boundedLimit,
    },
    scope: buildScope({
      dataset: 'campaign_performance_snapshot',
      companyId,
      requestSource,
      period: `${boundedDays}d`,
    }),
    records,
    summary: {
      campanas_revisadas: records.length,
      envios_totales: records.reduce((acc, row) => acc + row.enviados, 0),
      respuestas_totales: records.reduce((acc, row) => acc + row.respuestas, 0),
    },
  });
}

async function buildPricingSnapshot({
  historyDays = 90,
  limit = 200,
  companyId = DEFAULT_COMPANY_ID,
  requestSource = 'internal_api',
} = {}) {
  const boundedDays = normalizeLimit(historyDays, 90, 365);
  const boundedLimit = normalizeLimit(limit, 200, 500);

  const { rows } = await query(
    `SELECT p.id AS producto_id,
            p.nombre AS producto_nombre,
            p.codigo,
            COALESCE(p.precio_venta, 0)::float AS precio_actual,
            COALESCE(p.precio_costo_pesos, p.precio_costo, 0)::float AS costo,
            COALESCE(stock.cantidad_disponible, 0)::float AS stock,
            COALESCE(stats.descuento_total, 0)::float AS descuentos_aplicados,
            COALESCE(stats.margen_historico_pct, 0)::float AS margen_historico_pct,
            COALESCE(stats.unidades, 0)::float / $1 AS rotacion_diaria
       FROM productos p
  LEFT JOIN inventario stock ON stock.producto_id = p.id
  LEFT JOIN (
         SELECT vd.producto_id,
                SUM(COALESCE(vd.descuento_oferta, 0)) AS descuento_total,
                SUM(vd.cantidad) AS unidades,
                CASE
                  WHEN SUM(COALESCE(vd.subtotal, 0) - COALESCE(vd.descuento_oferta, 0)) > 0
                    THEN (
                      SUM(
                        (COALESCE(vd.subtotal, 0) - COALESCE(vd.descuento_oferta, 0)) -
                        (vd.cantidad * COALESCE(vd.costo_unitario_pesos, p.precio_costo, 0))
                      )
                      / SUM(COALESCE(vd.subtotal, 0) - COALESCE(vd.descuento_oferta, 0))
                    ) * 100
                  ELSE 0
                END AS margen_historico_pct
           FROM ventas_detalle vd
           JOIN ventas v ON v.id = vd.venta_id
           JOIN productos p ON p.id = vd.producto_id
          WHERE v.estado_pago <> 'cancelado'
            AND COALESCE(v.oculto, 0) = 0
            AND date(v.fecha, 'localtime') >= date(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL $1 DAY))
          GROUP BY vd.producto_id
       ) stats ON stats.producto_id = p.id
      WHERE p.activo = 1
      ORDER BY ABS(COALESCE(stats.margen_historico_pct, 0)) ASC, p.id ASC
      LIMIT $2`,
    [boundedDays, boundedLimit]
  );

  const records = (rows || []).map((row) => ({
    producto: {
      id: Number(row.producto_id),
      codigo: row.codigo || null,
      nombre: row.producto_nombre,
    },
    precio_actual: safeNumber(row.precio_actual, 0),
    costo: safeNumber(row.costo, 0),
    descuentos_aplicados: safeNumber(row.descuentos_aplicados, 0),
    margen_historico_pct: Number(safeNumber(row.margen_historico_pct, 0).toFixed(2)),
    rotacion_diaria: Number(safeNumber(row.rotacion_diaria, 0).toFixed(4)),
    stock: safeNumber(row.stock, 0),
  }));

  return buildEnvelope({
    dataset: 'pricing_snapshot',
    filters: {
      history_days: boundedDays,
      limit: boundedLimit,
    },
    scope: buildScope({
      dataset: 'pricing_snapshot',
      companyId,
      requestSource,
      period: `${boundedDays}d`,
    }),
    records,
    summary: {
      productos_revisados: records.length,
      productos_con_margen_bajo: records.filter(
        (row) => row.margen_historico_pct <= 10
      ).length,
    },
  });
}

async function buildExecutiveSummaryInput({
  rangeInput = {},
  filters = {},
  requestedByUsuarioId = null,
  companyId = DEFAULT_COMPANY_ID,
  requestSource = 'internal_api',
} = {}) {
  const { range, period } = resolveRangeAndPeriod(rangeInput);
  const [reportData, priorities] = await Promise.all([
    reportExecutiveService.buildExecutiveReportData({
      rangeInput,
      filters,
      insightsLimit: 10,
      topLimit: 5,
    }),
    aiWorkspaceService.getWorkspaceDashboard({
      requestedByUsuarioId,
      forceRefresh: false,
    }),
  ]);

  return buildEnvelope({
    dataset: 'executive_summary_input',
    filters: {
      desde: range.fromStr,
      hasta: range.toStr,
      usuario_id: filters.usuarioId || null,
      deposito_id: filters.depositoId || null,
      cliente_id: filters.clienteId || null,
      proveedor_id: filters.proveedorId || null,
    },
    scope: buildScope({
      dataset: 'executive_summary_input',
      branchId: filters.depositoId || null,
      companyId,
      requestSource,
      customerId: filters.clienteId || null,
      period,
    }),
    records: [],
    summary: {
      report_generated_at: reportData.generated_at,
      priorities_generated_at: priorities.generated_at,
      prioridades_abiertas: priorities.summary?.total_abiertas || 0,
    },
    collections: {
      executive_report: reportData,
      business_priorities: priorities,
    },
  });
}

const DATASET_BUILDERS = {
  sales_snapshot: buildSalesSnapshot,
  inventory_snapshot: buildInventorySnapshot,
  customer_profile_snapshot: buildCustomerProfileSnapshot,
  receivables_snapshot: buildReceivablesSnapshot,
  campaign_performance_snapshot: buildCampaignPerformanceSnapshot,
  pricing_snapshot: buildPricingSnapshot,
};

async function getDataset(dataset, options = {}) {
  const key = String(dataset || '').trim().toLowerCase();
  const builder = DATASET_BUILDERS[key];
  if (!builder) {
    throw new Error('Dataset IA no soportado');
  }
  return builder(options);
}

module.exports = {
  DATASET_VERSIONS,
  getDataset,
  buildExecutiveSummaryInput,
  __test__: {
    buildScope,
    buildEnvelope,
    createHash,
    normalizePositiveInt,
    normalizeLimit,
    normalizeBool,
  },
};
