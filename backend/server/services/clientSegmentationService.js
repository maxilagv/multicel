const { query, withTransaction } = require('../db/pg');
const automationEventRepo = require('../db/repositories/automationEventRepository');

const SEGMENTS = ['vip', 'frecuente', 'activo', 'dormido', 'inactivo'];

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysSince(value, now = new Date()) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) return null;
  const diff = now.getTime() - time;
  return Math.max(0, Math.floor(diff / 86400000));
}

function calculateLeadScore(metrics) {
  let score = 0;

  if (metrics.telefono_e164) score += 10;
  if (metrics.email) score += 5;
  if (metrics.total_compras >= 1) score += 20;

  if (metrics.dias_desde_ultima_compra != null) {
    if (metrics.dias_desde_ultima_compra <= 30) score += 30;
    else if (metrics.dias_desde_ultima_compra <= 90) score += 15;
    else if (metrics.dias_desde_ultima_compra > 180) score -= 20;
  }

  if (metrics.total_gastado > 500000) score += 50;
  else if (metrics.total_gastado > 100000) score += 25;

  if (metrics.total_compras > 5) score += 20;
  if (metrics.respondio_whatsapp) score += 15;
  if (metrics.whatsapp_opt_in) score += 10;
  if (metrics.oportunidades_activas > 0) score += 20;
  if (metrics.deuda_pendiente > 0) score -= 10;
  if (metrics.whatsapp_status === 'blocked') score -= 20;

  return clamp(score, 0, 100);
}

function deriveLeadSegment(score) {
  const normalized = clamp(score, 0, 100);
  if (normalized >= 90) return 'vip';
  if (normalized >= 70) return 'frecuente';
  if (normalized >= 40) return 'activo';
  if (normalized >= 20) return 'dormido';
  return 'inactivo';
}

function suggestedActionForSegment(segment) {
  if (segment === 'vip') return 'Dar atencion prioritaria y ofrecer novedades importantes.';
  if (segment === 'frecuente') return 'Mantener contacto cercano y avisar cuando haya oportunidades reales.';
  if (segment === 'activo') return 'Hacer seguimiento normal y responder rapido cuando consulte.';
  if (segment === 'dormido') return 'Conviene retomar el contacto con un mensaje suave.';
  return 'Conviene revisar si vale la pena reactivarlo o dejarlo en pausa.';
}

function buildClientInsight(row, now = new Date()) {
  const diasDesdeUltimaCompra = daysSince(row.ultima_compra_at, now);
  const leadScore = clamp(row.lead_score, 0, 100);
  const leadSegment = deriveLeadSegment(leadScore);

  return {
    lead_score: leadScore,
    lead_segmento: leadSegment,
    dias_desde_ultima_compra: diasDesdeUltimaCompra,
    total_compras: toNumber(row.total_compras),
    total_gastado: toNumber(row.total_gastado),
    deuda_pendiente: toNumber(row.deuda_pendiente),
    oportunidades_activas: toNumber(row.oportunidades_activas),
    respondio_whatsapp: Boolean(row.respondio_whatsapp),
    whatsapp_opt_in: Boolean(row.whatsapp_opt_in),
    fecha_nacimiento: row.fecha_nacimiento || null,
    sugerencia: suggestedActionForSegment(leadSegment),
  };
}

async function listClientMetrics({ clienteId = null, limit = 500 } = {}) {
  const params = [];
  const where = ['c.deleted_at IS NULL', "c.estado = 'activo'"];

  if (clienteId != null) {
    params.push(Number(clienteId));
    where.push(`c.id = $${params.length}`);
  }

  const boundedLimit = Math.min(Math.max(Number(limit) || 500, 1), 5000);
  params.push(boundedLimit);

  const { rows } = await query(
    `SELECT c.id,
            c.nombre,
            c.apellido,
            c.email,
            c.telefono_e164,
            c.whatsapp_opt_in,
            c.whatsapp_status,
            c.fecha_registro,
            c.fecha_nacimiento,
            c.tipo_cliente,
            c.segmento,
            c.lead_score,
            c.lead_segmento,
            c.lead_score_updated_at,
            COALESCE(vstats.total_compras, 0) AS total_compras,
            COALESCE(vstats.total_gastado, 0) AS total_gastado,
            vstats.ultima_compra_at,
            COALESCE(mstats.respondio_whatsapp, 0) AS respondio_whatsapp,
            COALESCE(mstats.mensajes_recibidos, 0) AS mensajes_recibidos,
            COALESCE(opps.oportunidades_activas, 0) AS oportunidades_activas,
            COALESCE(deuda.deuda_pendiente, 0) AS deuda_pendiente
       FROM clientes c
       LEFT JOIN (
         SELECT v.cliente_id,
                COUNT(*) AS total_compras,
                COALESCE(SUM(v.total), 0) AS total_gastado,
                MAX(v.fecha) AS ultima_compra_at
           FROM ventas v
          WHERE v.estado_pago <> 'cancelado'
          GROUP BY v.cliente_id
       ) vstats ON vstats.cliente_id = c.id
       LEFT JOIN (
         SELECT wm.cliente_id,
                COUNT(*) AS mensajes_recibidos,
                MAX(CASE WHEN wm.direccion = 'recibido' THEN 1 ELSE 0 END) AS respondio_whatsapp
           FROM whatsapp_mensajes wm
          WHERE wm.cliente_id IS NOT NULL
          GROUP BY wm.cliente_id
       ) mstats ON mstats.cliente_id = c.id
       LEFT JOIN (
         SELECT o.cliente_id,
                COUNT(*) AS oportunidades_activas
           FROM crm_oportunidades o
          WHERE o.oculto = FALSE
            AND o.fase NOT IN ('ganado', 'perdido')
          GROUP BY o.cliente_id
       ) opps ON opps.cliente_id = c.id
       LEFT JOIN (
         SELECT v.cliente_id,
                COALESCE(SUM(GREATEST(v.total - COALESCE(p.pagado, 0), 0)), 0) AS deuda_pendiente
           FROM ventas v
           LEFT JOIN (
             SELECT venta_id, SUM(monto) AS pagado
               FROM pagos
              WHERE venta_id IS NOT NULL
              GROUP BY venta_id
           ) p ON p.venta_id = v.id
          WHERE v.estado_pago <> 'cancelado'
          GROUP BY v.cliente_id
       ) deuda ON deuda.cliente_id = c.id
      WHERE ${where.join(' AND ')}
      ORDER BY c.id ASC
      LIMIT $${params.length}`,
    params
  );

  return (rows || []).map((row) => {
    const dias = daysSince(row.ultima_compra_at);
    return {
      ...row,
      id: Number(row.id),
      whatsapp_opt_in: Boolean(row.whatsapp_opt_in),
      total_compras: toNumber(row.total_compras),
      total_gastado: toNumber(row.total_gastado),
      mensajes_recibidos: toNumber(row.mensajes_recibidos),
      respondio_whatsapp: Boolean(row.respondio_whatsapp),
      oportunidades_activas: toNumber(row.oportunidades_activas),
      deuda_pendiente: toNumber(row.deuda_pendiente),
      lead_score: toNumber(row.lead_score),
      dias_desde_ultima_compra: dias,
    };
  });
}

async function persistClientLead(client, candidate, recalculated, runStamp) {
  await client.query(
    `UPDATE clientes
        SET lead_score = $2,
            lead_segmento = $3,
            lead_score_updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [candidate.id, recalculated.lead_score, recalculated.lead_segmento]
  );

  const previousSegment = String(candidate.lead_segmento || 'inactivo').trim().toLowerCase();
  const nextSegment = recalculated.lead_segmento;
  if (previousSegment === nextSegment) return;

  await automationEventRepo.enqueueTx(client, {
    eventName: 'cliente_segmento_actualizado',
    aggregateType: 'cliente',
    aggregateId: candidate.id,
    idempotencyKey: `cliente:${candidate.id}:segmento:${nextSegment}:${runStamp}`,
    payload: {
      cliente_id: candidate.id,
      nombre: candidate.nombre,
      apellido: candidate.apellido || null,
      segmento_anterior: previousSegment,
      segmento_nuevo: nextSegment,
      lead_score: recalculated.lead_score,
    },
  });

  if (nextSegment === 'vip') {
    await automationEventRepo.enqueueTx(client, {
      eventName: 'cliente_vip_activado',
      aggregateType: 'cliente',
      aggregateId: candidate.id,
      idempotencyKey: `cliente:${candidate.id}:vip:${runStamp}`,
      payload: {
        cliente_id: candidate.id,
        nombre: candidate.nombre,
        apellido: candidate.apellido || null,
        lead_score: recalculated.lead_score,
      },
    });
  }
}

async function recalculateSegments({ clienteId = null, limit = 500 } = {}) {
  const candidates = await listClientMetrics({ clienteId, limit });
  const runStamp = new Date().toISOString().slice(0, 10);
  const summary = {
    processed: 0,
    updated: 0,
    changed: 0,
    new_vip: 0,
    segments: {
      vip: 0,
      frecuente: 0,
      activo: 0,
      dormido: 0,
      inactivo: 0,
    },
  };

  for (const candidate of candidates) {
    const leadScore = calculateLeadScore(candidate);
    const leadSegment = deriveLeadSegment(leadScore);
    const recalculated = {
      lead_score: leadScore,
      lead_segmento: leadSegment,
    };

    summary.processed += 1;
    summary.segments[leadSegment] += 1;

    const changed =
      toNumber(candidate.lead_score) !== leadScore ||
      String(candidate.lead_segmento || 'inactivo').trim().toLowerCase() !== leadSegment;

    if (
      String(candidate.lead_segmento || 'inactivo').trim().toLowerCase() !== 'vip' &&
      leadSegment === 'vip'
    ) {
      summary.new_vip += 1;
    }

    await withTransaction(async (client) => {
      await persistClientLead(client, candidate, recalculated, runStamp);
    });

    summary.updated += 1;
    if (changed) summary.changed += 1;
  }

  return summary;
}

module.exports = {
  SEGMENTS,
  calculateLeadScore,
  deriveLeadSegment,
  buildClientInsight,
  listClientMetrics,
  recalculateSegments,
  __test__: {
    calculateLeadScore,
    deriveLeadSegment,
    buildClientInsight,
    daysSince,
  },
};
