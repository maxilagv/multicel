const ownerRepo = require('../db/repositories/ownerRepository');
const configRepo = require('../db/repositories/configRepository');

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function round2(n) {
  const x = Number(n) || 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function toIsoDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function daysDiff(from, to = new Date()) {
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function computeRiskBucket(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

function computeRiskScore(row, debtThreshold = 250000) {
  const deuda = Number(row.deuda_pendiente || 0);
  const deudaMas90 = Number(row.deuda_mas_90 || 0);
  const diasAtraso = Number(row.dias_promedio_atraso || 0);
  const promesasInc = Number(row.promesas_incumplidas || 0);
  const promesasTot = Number(row.promesas_totales || 0);

  let score = 0;
  const threshold = Math.max(1000, Number(debtThreshold) || 250000);
  score += 40 * clamp(deuda / threshold, 0, 1);

  if (diasAtraso >= 90) score += 30;
  else if (diasAtraso >= 60) score += 22;
  else if (diasAtraso >= 30) score += 15;
  else if (diasAtraso >= 15) score += 8;

  const agingRatio = deuda > 0 ? deudaMas90 / deuda : 0;
  score += 20 * clamp(agingRatio, 0, 1);

  if (promesasTot > 0) {
    const brokenRatio = promesasInc / promesasTot;
    score += 15 * clamp(brokenRatio, 0, 1);
  } else if (promesasInc > 0) {
    score += 10;
  }

  const sinceLastPayment = daysDiff(row.last_payment_date);
  if (sinceLastPayment != null) {
    if (sinceLastPayment >= 60) score += 12;
    else if (sinceLastPayment >= 30) score += 6;
  } else if (deuda > 0) {
    score += 8;
  }

  return Math.round(clamp(score, 0, 100));
}

function riskTemplateByBucket(bucket) {
  if (bucket === 'critical') return 'deuda_critica';
  if (bucket === 'high') return 'deuda_alta';
  if (bucket === 'medium') return 'deuda_media';
  return 'deuda_baja';
}

async function buildRiskRanking({
  limit = 100,
  persistSnapshot = true,
  clientVisibility = null,
} = {}) {
  const baseRows = await ownerRepo.listDebtRiskBase({ limit, clientVisibility });
  const debtThreshold = await configRepo.getDebtThreshold();
  const ranking = [];
  for (const row of baseRows) {
    const score = computeRiskScore(row, debtThreshold);
    const bucket = computeRiskBucket(score);
    const factors = {
      deuda_pendiente: Number(row.deuda_pendiente || 0),
      deuda_mas_90: Number(row.deuda_mas_90 || 0),
      dias_promedio_atraso: Number(row.dias_promedio_atraso || 0),
      promesas_incumplidas: Number(row.promesas_incumplidas || 0),
      promesas_totales: Number(row.promesas_totales || 0),
    };
    const enriched = { ...row, score, bucket, factores: factors };
    ranking.push(enriched);
    if (persistSnapshot) {
      await ownerRepo.insertRiskSnapshot({
        clienteId: row.cliente_id,
        score,
        bucket,
        factores: factors,
      });
    }
  }
  ranking.sort((a, b) => b.score - a.score || b.deuda_pendiente - a.deuda_pendiente);
  return ranking;
}

async function generateAutoReminders({
  limit = 50,
  userId = null,
  clientVisibility = null,
} = {}) {
  const ranking = await buildRiskRanking({
    limit,
    persistSnapshot: false,
    clientVisibility,
  });
  const selected = ranking.filter((r) => r.deuda_pendiente > 0 && ['high', 'critical'].includes(r.bucket));
  const created = [];

  for (const row of selected.slice(0, limit)) {
    const whatsappTarget = row.telefono_e164 || row.telefono || null;
    const canal = whatsappTarget ? 'whatsapp' : row.email ? 'email' : 'manual';
    const destino = canal === 'whatsapp' ? whatsappTarget : canal === 'email' ? row.email : null;
    const payload = {
      cliente: `${row.nombre || ''} ${row.apellido || ''}`.trim(),
      deuda_pendiente: Number(row.deuda_pendiente || 0),
      deuda_mas_90: Number(row.deuda_mas_90 || 0),
      score: row.score,
      bucket: row.bucket,
    };
    const reminder = await ownerRepo.createReminder({
      clienteId: row.cliente_id,
      canal,
      destino,
      templateCode: riskTemplateByBucket(row.bucket),
      payload,
      status: 'pending',
      userId,
    });
    if (reminder?.id) {
      created.push({
        id: reminder.id,
        cliente_id: row.cliente_id,
        canal,
        destino,
        template_code: riskTemplateByBucket(row.bucket),
      });
    }
  }
  return created;
}

async function getMarginsRealtime({ dimension, desde, hasta, limit }) {
  const rows = await ownerRepo.listMargins({ dimension, desde, hasta, limit });
  return rows.map((r) => {
    const ingresos = Number(r.ingresos || 0);
    const costo = Number(r.costo || 0);
    const margen = Number(r.margen || 0);
    return {
      entity_id: r.entity_id,
      entity_name: r.entity_name || 'N/A',
      ingresos: round2(ingresos),
      costo: round2(costo),
      margen: round2(margen),
      margen_pct: ingresos > 0 ? round2((margen / ingresos) * 100) : 0,
    };
  });
}

function ruleMatchesProduct(rule, product) {
  const scope = String(rule.scope || 'global');
  const ref = Number(rule.scope_ref_id || 0);
  if (scope === 'global') return true;
  if (scope === 'categoria') return Number(product.categoria_id) === ref;
  if (scope === 'proveedor') return Number(product.proveedor_id) === ref;
  if (scope === 'producto') return Number(product.id) === ref;
  return false;
}

function selectBestRule(rules, product) {
  const active = rules
    .filter((r) => String(r.status || 'active') === 'active')
    .filter((r) => ruleMatchesProduct(r, product))
    .sort((a, b) => Number(a.prioridad || 100) - Number(b.prioridad || 100));
  return active[0] || null;
}

function roundToStep(value, step) {
  const s = Math.max(Number(step) || 1, 0.01);
  return round2(Math.round(value / s) * s);
}

function computeCostInArs(product, dolarBlue) {
  const costoPesos = Number(product.precio_costo_pesos || 0);
  if (costoPesos > 0) return costoPesos;
  const costoUsd = Number(product.precio_costo_dolares || 0);
  if (costoUsd <= 0) return Number(product.precio_costo || 0);
  const fx = Number(dolarBlue || product.tipo_cambio || 0);
  return fx > 0 ? costoUsd * fx : Number(product.precio_costo || 0);
}

function normalizeOptionalPrice(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return round2(n);
}

function buildCurrentPriceSnapshot(product) {
  return {
    venta: round2(Number(product.precio_venta || 0)),
    local: round2(Number(product.precio_local || product.precio_venta || 0)),
    distribuidor: round2(Number(product.precio_distribuidor || 0)),
    final: round2(Number(product.precio_final || 0)),
  };
}

function buildNextPriceSnapshot(current, prices = {}) {
  return {
    venta: prices.venta ?? current.venta,
    local: prices.local ?? current.local,
    distribuidor: prices.distribuidor ?? current.distribuidor,
    final: prices.final ?? current.final,
  };
}

function normalizePriceOverrides(prices = {}) {
  return {
    venta: normalizeOptionalPrice(prices.precio_venta),
    local: normalizeOptionalPrice(prices.precio_local),
    distribuidor: normalizeOptionalPrice(prices.precio_distribuidor),
    final: normalizeOptionalPrice(prices.precio_final),
  };
}

function hasAnyPriceOverride(prices = {}) {
  return Object.values(prices).some((value) => value !== undefined);
}

function samePriceSnapshot(left, right) {
  return (
    round2(Number(left?.venta || 0)) === round2(Number(right?.venta || 0)) &&
    round2(Number(left?.local || 0)) === round2(Number(right?.local || 0)) &&
    round2(Number(left?.distribuidor || 0)) === round2(Number(right?.distribuidor || 0)) &&
    round2(Number(left?.final || 0)) === round2(Number(right?.final || 0))
  );
}

async function buildRepricingPreview({
  productIds = [],
  categoryId = null,
  includeDescendants = false,
  limit = 500,
} = {}) {
  const [rules, products, dolarBlue] = await Promise.all([
    ownerRepo.listRepricingRules(),
    ownerRepo.listProductsForPricing({ productIds, categoryId, includeDescendants, limit }),
    configRepo.getDolarBlue(),
  ]);

  const preview = [];
  for (const product of products) {
    const rule = selectBestRule(rules, product);
    if (!rule) continue;

    const costArs = computeCostInArs(product, dolarBlue);
    if (costArs <= 0) continue;

    const marginMin = Number(rule.margin_min || 0.15);
    const marginTarget = Number(rule.margin_target || marginMin);
    const pass = Number(rule.usd_pass_through || 1);
    const rounding = Number(rule.rounding_step || 1);

    const floor = costArs * (1 + marginMin);
    const target = costArs * (1 + marginTarget) * pass;
    const suggested = roundToStep(Math.max(floor, target), rounding);

    const channel = rule.channel || null;
    const currentLocal = Number(product.precio_local || product.precio_venta || 0);
    const currentDist = Number(product.precio_distribuidor || 0);
    const currentFinal = Number(product.precio_final || 0);

    const suggestedLocal = channel && channel !== 'local' ? currentLocal : suggested;
    const suggestedDist = channel && channel !== 'distribuidor' ? currentDist : suggested;
    const suggestedFinal = channel && channel !== 'final' ? currentFinal : suggested;
    const suggestedVenta = channel && channel !== 'local' ? Number(product.precio_venta || 0) : suggestedLocal;

    preview.push({
      producto_id: Number(product.id),
      producto: product.nombre,
      regla_id: Number(rule.id),
      regla_nombre: rule.nombre,
      channel,
      costo_ars: round2(costArs),
      precio_actual: {
        venta: round2(Number(product.precio_venta || 0)),
        local: round2(currentLocal),
        distribuidor: round2(currentDist),
        final: round2(currentFinal),
      },
      precio_sugerido: {
        venta: round2(suggestedVenta),
        local: round2(suggestedLocal),
        distribuidor: round2(suggestedDist),
        final: round2(suggestedFinal),
      },
    });
  }
  return preview;
}

async function applyRepricing({
  productIds = [],
  categoryId = null,
  includeDescendants = false,
  limit = 500,
  userId = null,
} = {}) {
  const preview = await buildRepricingPreview({ productIds, categoryId, includeDescendants, limit });
  const updates = preview.map((p) => ({
    producto_id: p.producto_id,
    precio_venta: p.precio_sugerido.venta,
    precio_local: p.precio_sugerido.local,
    precio_distribuidor: p.precio_sugerido.distribuidor,
    precio_final: p.precio_sugerido.final,
  }));
  const changed = await ownerRepo.applyRepricing({ updates, userId });
  return { changed, preview };
}

async function buildBulkPricePreview({
  productIds = [],
  categoryId = null,
  includeDescendants = true,
  limit = 500,
  prices = {},
} = {}) {
  const normalizedPrices = normalizePriceOverrides(prices);
  if (!hasAnyPriceOverride(normalizedPrices)) return [];

  const products = await ownerRepo.listProductsForPricing({
    productIds,
    categoryId,
    includeDescendants,
    limit,
  });

  const preview = [];
  for (const product of products) {
    const current = buildCurrentPriceSnapshot(product);
    const suggested = buildNextPriceSnapshot(current, normalizedPrices);
    if (samePriceSnapshot(current, suggested)) continue;
    preview.push({
      producto_id: Number(product.id),
      producto: product.nombre,
      precio_actual: current,
      precio_sugerido: suggested,
    });
  }
  return preview;
}

async function applyBulkPrice({
  productIds = [],
  categoryId = null,
  includeDescendants = true,
  limit = 500,
  prices = {},
  userId = null,
} = {}) {
  const preview = await buildBulkPricePreview({
    productIds,
    categoryId,
    includeDescendants,
    limit,
    prices,
  });
  const updates = preview.map((row) => ({
    producto_id: row.producto_id,
    precio_venta: row.precio_sugerido?.venta,
    precio_local: row.precio_sugerido?.local,
    precio_distribuidor: row.precio_sugerido?.distribuidor,
    precio_final: row.precio_sugerido?.final,
  }));
  const changed = await ownerRepo.applyRepricing({ updates, userId });
  return { changed, preview };
}

function calcMovingAverage(values, days) {
  const src = values.slice(-Math.max(1, days));
  if (!src.length) return 0;
  return src.reduce((acc, x) => acc + x, 0) / src.length;
}

function buildProjection({ cashNow, avgDailyNet, horizons }) {
  const byHorizon = {};
  for (const h of horizons) {
    byHorizon[h] = round2(cashNow + avgDailyNet * h);
  }
  return byHorizon;
}

function buildActionableAlerts({
  projected,
  debtTotals,
  stockBreaks,
  cashThreshold,
}) {
  const alerts = [];
  const h7 = Number(projected[7] || 0);
  const h30 = Number(projected[30] || 0);

   function cashSeverity(projectedValue) {
    if (projectedValue < 0) return 'critical';
    if (projectedValue >= cashThreshold) return null;
    const gap = Math.abs(cashThreshold - projectedValue);
    const softGap = Math.max(Math.abs(cashThreshold) * 0.2, 25000);
    return gap > softGap ? 'warn' : 'info';
  }

  if (h7 < cashThreshold) {
    const sev = cashSeverity(h7);
    if (sev) {
      alerts.push({
        alert_code: 'cash_7d_low',
        severity: sev,
        title: 'Caja proyectada 7 dias por debajo del umbral',
        detail: `Caja proyectada 7 dias: ${round2(h7)} ARS`,
        action_label: 'Lanzar cobranzas urgentes',
        action_path: '/app/finanzas',
        metadata: { horizon: 7, projected: round2(h7), threshold: cashThreshold },
      });
    }
  }
  if (h30 < cashThreshold) {
    const sev = cashSeverity(h30);
    if (sev) {
      alerts.push({
        alert_code: 'cash_30d_low',
        severity: sev,
        title: 'Caja proyectada 30 dias comprometida',
        detail: `Caja proyectada 30 dias: ${round2(h30)} ARS`,
        action_label: 'Replanificar pagos y compras',
        action_path: '/app/compras',
        metadata: { horizon: 30, projected: round2(h30), threshold: cashThreshold },
      });
    }
  }
  if (Number(debtTotals.deuda_mas_90 || 0) > 0) {
    const deudaTotal = Number(debtTotals.deuda_total || 0);
    const deuda90 = Number(debtTotals.deuda_mas_90 || 0);
    const ratio = deudaTotal > 0 ? deuda90 / deudaTotal : 1;
    const severity = ratio >= 0.5 ? 'critical' : ratio >= 0.2 ? 'warn' : 'info';
    alerts.push({
      alert_code: 'debt_90_plus',
      severity,
      title: 'Cartera vencida +90 dias activa',
      detail: `Deuda +90 dias: ${round2(deuda90)} ARS`,
      action_label: 'Activar promesas de pago',
      action_path: '/app/clientes',
      metadata: { ...debtTotals, ratio_90: round2(ratio * 100) },
    });
  }
  if (Array.isArray(stockBreaks) && stockBreaks.length > 0) {
    const count = stockBreaks.length;
    const severity = count >= 15 ? 'critical' : count >= 5 ? 'warn' : 'info';
    alerts.push({
      alert_code: 'stock_break_risk',
      severity,
      title: 'Riesgo de quiebre de stock detectado',
      detail: `${count} productos debajo del minimo`,
      action_label: 'Reponer inventario',
      action_path: '/app/stock',
      metadata: { count },
    });
  }
  return alerts;
}

async function getOwnerCommandCenter({
  baseCash = null,
  horizons = [7, 30, 90],
  persistAlerts = true,
} = {}) {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 59);
  const fromStr = toIsoDate(from);
  const toStr = toIsoDate(today);
  const [series, totals, debtTotals, stockBreaks, thresholdParam] = await Promise.all([
    ownerRepo.getCashDailySeries({ fromDate: fromStr, toDate: toStr }),
    ownerRepo.getCashTotals(),
    ownerRepo.getDebtTotals(),
    ownerRepo.getStockBreakRisk({ limit: 25 }),
    configRepo.getNumericParam('cash_alert_threshold'),
  ]);

  const netSeries = series.map((r) => Number(r.entradas || 0) - Number(r.salidas || 0));
  const avg14 = calcMovingAverage(netSeries, 14);
  const avg30 = calcMovingAverage(netSeries, 30);
  const avgDailyNet = avg30 * 0.7 + avg14 * 0.3;
  const currentCash =
    baseCash != null
      ? Number(baseCash)
      : Number(totals.total_in || 0) - Number(totals.total_out || 0);

  const projection = buildProjection({
    cashNow: currentCash,
    avgDailyNet,
    horizons,
  });
  const cashThreshold = Number(thresholdParam || 0);
  const alerts = buildActionableAlerts({
    projected: projection,
    debtTotals,
    stockBreaks,
    cashThreshold,
  });

  if (persistAlerts) {
    for (const alert of alerts) {
      await ownerRepo.insertAlert({
        alertCode: alert.alert_code,
        severity: alert.severity,
        title: alert.title,
        detail: alert.detail,
        actionLabel: alert.action_label,
        actionPath: alert.action_path,
        metadata: alert.metadata,
      });
    }
  }

  return {
    caja_actual: round2(currentCash),
    promedio_neto_diario: round2(avgDailyNet),
    proyeccion_caja: projection,
    deuda: {
      total: round2(Number(debtTotals.deuda_total || 0)),
      mas_90: round2(Number(debtTotals.deuda_mas_90 || 0)),
    },
    stock_breaks: stockBreaks,
    alertas: alerts,
  };
}

function normalizeScopeMatch(rule, payload) {
  const scope = String(rule.scope || 'global');
  const ref = Number(rule.scope_ref_id || 0);
  if (scope === 'global') return true;
  if (scope === 'cliente') return Number(payload.cliente_id || 0) === ref;
  if (scope === 'proveedor') return Number(payload.proveedor_id || 0) === ref;
  if (scope === 'producto') return Number(payload.producto_id || 0) === ref;
  return false;
}

function inValidityRange(rule, dateStr) {
  const d = toIsoDate(dateStr || new Date());
  if (!d) return false;
  const from = rule.vigencia_desde ? toIsoDate(rule.vigencia_desde) : null;
  const to = rule.vigencia_hasta ? toIsoDate(rule.vigencia_hasta) : null;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

async function simulateFiscalAr(payload) {
  const amount = Math.max(0, Number(payload.monto || 0));
  const rules = await ownerRepo.listFiscalRules();
  const active = rules
    .filter((r) => Number(r.activo || 0) === 1)
    .filter((r) => normalizeScopeMatch(r, payload))
    .filter((r) => inValidityRange(r, payload.fecha))
    .filter((r) => amount >= Number(r.monto_minimo || 0))
    .sort((a, b) => Number(a.prioridad || 100) - Number(b.prioridad || 100));

  const breakdown = active.map((r) => {
    const monto = round2(amount * (Number(r.alicuota || 0) / 100));
    return {
      rule_id: Number(r.id),
      nombre: r.nombre,
      tipo: r.tipo,
      alicuota: Number(r.alicuota || 0),
      monto,
    };
  });

  const total = breakdown.reduce((acc, x) => acc + Number(x.monto || 0), 0);
  return {
    monto_base: amount,
    total_fiscal: round2(total),
    detalle: breakdown,
  };
}

function applyRuleToPrice(current, rule) {
  const tipo = String(rule.tipo_regla || '');
  const params = rule.parametros || {};
  const val = Number(params.valor || 0);
  if (tipo === 'markup_fijo') return current + val;
  if (tipo === 'markup_pct') return current * (1 + val / 100);
  if (tipo === 'usd') return current * (1 + val / 100);
  if (tipo === 'ipc') return current * (1 + val / 100);
  if (tipo === 'proveedor') return current * (1 + val / 100);
  if (tipo === 'canal') return current * (1 + val / 100);
  return current;
}

async function previewPriceList({ priceListId, limit = 500 } = {}) {
  const [rules, products] = await Promise.all([
    ownerRepo.listPriceListRules(priceListId),
    ownerRepo.listProductsForPricing({ limit }),
  ]);
  const activeRules = rules
    .filter((r) => Number(r.activo || 0) === 1)
    .sort((a, b) => Number(a.prioridad || 100) - Number(b.prioridad || 100));

  const preview = [];
  for (const p of products) {
    let nextPrice = Number(p.precio_venta || 0);
    for (const r of activeRules) {
      nextPrice = applyRuleToPrice(nextPrice, r);
    }
    preview.push({
      producto_id: Number(p.id),
      producto: p.nombre,
      precio_actual: round2(Number(p.precio_venta || 0)),
      precio_lista: round2(nextPrice),
      variacion_pct:
        Number(p.precio_venta || 0) > 0
          ? round2(((nextPrice - Number(p.precio_venta || 0)) / Number(p.precio_venta || 0)) * 100)
          : 0,
    });
  }
  return preview;
}

module.exports = {
  computeRiskScore,
  computeRiskBucket,
  buildRiskRanking,
  generateAutoReminders,
  getMarginsRealtime,
  buildRepricingPreview,
  applyRepricing,
  buildBulkPricePreview,
  applyBulkPrice,
  getOwnerCommandCenter,
  simulateFiscalAr,
  previewPriceList,
};
