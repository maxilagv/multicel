const aiService = require('../aiService');
const { buildDatasetDescriptor } = require('../agentDatasetGovernanceService');

function toTableRows(rows = [], mapper) {
  return (Array.isArray(rows) ? rows : []).map(mapper);
}

async function run({ context = {} } = {}) {
  const historyDays = 90;
  const forecastDays = 14;
  const categoryId = context?.filters?.category_id != null ? Number(context.filters.category_id) : undefined;
  const includeDescendants = Boolean(context?.filters?.include_descendants);
  const generatedAt = new Date().toISOString();
  const [forecastRes, stockoutsRes, pricesRes, anomaliesRes] = await Promise.allSettled([
    aiService.forecastByProduct({ forecastDays, historyDays, limit: 8, categoryId, includeDescendants }),
    aiService.stockouts({ days: forecastDays, historyDays, limit: 8, categoryId, includeDescendants }),
    aiService.pricingRecommendations({ historyDays, limit: 8 }),
    aiService.anomalies({ scope: 'sales', period: historyDays, sigma: 3 }),
  ]);

  const forecast = forecastRes.status === 'fulfilled' ? forecastRes.value : [];
  const stockouts = stockoutsRes.status === 'fulfilled' ? stockoutsRes.value : [];
  const precios = pricesRes.status === 'fulfilled' ? pricesRes.value : [];
  const anomalies = anomaliesRes.status === 'fulfilled' ? anomaliesRes.value : { sales: [] };
  const degradedReasons = [
    forecastRes.status === 'rejected' ? 'No se pudo calcular forecast.' : null,
    stockoutsRes.status === 'rejected' ? 'No se pudo leer riesgo de stock.' : null,
    pricesRes.status === 'rejected' ? 'No se pudo calcular revision de precios.' : null,
    anomaliesRes.status === 'rejected' ? 'No se pudieron cargar anomalias.' : null,
  ].filter(Boolean);

  const topStockouts = (stockouts || []).slice(0, 4);
  const topForecast = (forecast || []).slice(0, 4);
  const topPrices = (precios || []).slice(0, 4);
  const topAnomalies = Array.isArray(anomalies?.sales) ? anomalies.sales.slice(0, 4) : [];

  const focusCards = [
    ...topStockouts.map((item) => ({
      id: `stockout_${item.producto_id}`,
      title: item.producto_nombre,
      tone: 'urgente',
      summary: `Cobertura estimada: ${Number(item.cobertura_dias || 0).toFixed(1)} dias.`,
      why_it_matters: `Puede quebrarse en ${Number(item.dias_hasta_quiebre || 0).toFixed(1)} dias.`,
      next_step: `Reponer ${Number(item.sugerido_reponer || 0)} unidades y revisar proveedor.`,
      impact: 'Evita quiebres de stock.',
    })),
    ...topPrices.slice(0, 2).map((item) => ({
      id: `pricing_${item.producto_id}`,
      title: item.producto_nombre,
      tone: 'atencion',
      summary: `Precio actual $${Number(item.precio_actual || 0).toFixed(0)} vs sugerido $${Number(item.precio_sugerido || 0).toFixed(0)}.`,
      why_it_matters: 'Puede haber margen perdido o precio fuera de contexto.',
      next_step: 'Revisar costo, margen y politica comercial antes de mover el precio.',
      impact: 'Protege rentabilidad.',
    })),
  ].slice(0, 6);

  const detailPanel = {
    type: 'detail_panel',
    detail_type: 'predictive_overview',
    title: 'Analisis predictivo',
    summary: `Se detectaron ${topStockouts.length} riesgos de stock, ${topPrices.length} sugerencias de precio y ${topAnomalies.length} anomalias destacadas.`,
    sections: [
      {
        title: 'Riesgo de stock',
        rows: toTableRows(topStockouts, (item) => ({
          label: item.producto_nombre,
          value: `${Number(item.dias_hasta_quiebre || 0).toFixed(1)} dias hasta quiebre`,
        })),
      },
      {
        title: 'Rotacion proyectada',
        rows: toTableRows(topForecast, (item) => ({
          label: item.producto_nombre,
          value: `${Number(item.forecast_units || 0).toFixed(0)} unidades proyectadas`,
        })),
      },
      {
        title: 'Precios a revisar',
        rows: toTableRows(topPrices, (item) => ({
          label: item.producto_nombre,
          value: `$${Number(item.precio_actual || 0).toFixed(0)} -> $${Number(item.precio_sugerido || 0).toFixed(0)}`,
        })),
      },
    ],
    derived_actions: [],
  };

  const evidence = [
    { label: 'Forecast revisado', value: String((forecast || []).length), tone: 'neutral' },
    { label: 'Stockouts detectados', value: String((stockouts || []).length), tone: 'neutral' },
    { label: 'Precios sugeridos', value: String((precios || []).length), tone: 'neutral' },
  ];
  const datasets = [
    buildDatasetDescriptor('forecast', {
      generatedAt,
      degraded: forecastRes.status === 'rejected',
      reason: forecastRes.status === 'rejected' ? degradedReasons[0] : null,
    }),
    buildDatasetDescriptor('stockouts', {
      generatedAt,
      degraded: stockoutsRes.status === 'rejected',
      reason: stockoutsRes.status === 'rejected' ? degradedReasons.find((item) => item.includes('stock')) : null,
    }),
    buildDatasetDescriptor('pricing', {
      generatedAt,
      degraded: pricesRes.status === 'rejected',
      reason: pricesRes.status === 'rejected' ? degradedReasons.find((item) => item.includes('precios')) : null,
    }),
    buildDatasetDescriptor('anomalies', {
      generatedAt,
      degraded: anomaliesRes.status === 'rejected',
      reason: anomaliesRes.status === 'rejected' ? degradedReasons.find((item) => item.includes('anomalias')) : null,
    }),
  ];

  return {
    title: 'Analisis predictivo',
    message: 'Abri el detalle para revisar riesgos de stock, rotacion, precios y anomalias del negocio.',
    next_best_step: focusCards[0]?.next_step || 'Revisar el bloque con mayor riesgo operativo.',
    follow_ups: [
      { label: 'Volver al resumen', surface: 'today' },
      { label: 'Ver prioridades', surface: 'priorities' },
    ],
    surfaces: [
      detailPanel,
      {
        type: 'focus_cards',
        items: focusCards,
      },
      {
        type: 'evidence_block',
        items: evidence,
        range: { desde: null, hasta: null },
        freshness: new Date().toISOString(),
        source_label: 'Analisis predictivo',
      },
    ],
    actions: [],
    evidence,
    meta: {
      freshness: generatedAt,
      datasets,
      degraded: degradedReasons.length > 0,
      used_fallback: degradedReasons.length > 0,
      degradation_reason: degradedReasons[0] || null,
    },
  };
}

module.exports = {
  run,
};
