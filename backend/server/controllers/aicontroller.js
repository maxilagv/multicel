const ai = require('../services/aiService');
const logger = require('../lib/logger');

async function forecast(req, res) {
  try {
    const forecastDays = Math.max(1, Number(req.query.days || 14));
    const historyDays = Math.max(7, Number(req.query.history || 90));
    const limit = Math.max(1, Number(req.query.limit || 100));
    const categoryId = req.query.category_id != null ? Number(req.query.category_id) : undefined;
    const includeDescendants =
      String(req.query.include_descendants || '').toLowerCase() === '1' ||
      String(req.query.include_descendants || '').toLowerCase() === 'true';
    const stockTargetDays = req.query.stockTargetDays
      ? Number(req.query.stockTargetDays)
      : undefined;
    const data = await ai.forecastByProduct({
      forecastDays,
      historyDays,
      limit,
      stockTargetDays,
      categoryId,
      includeDescendants,
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el pronóstico' });
  }
}

async function stockouts(req, res) {
  try {
    const days = Math.max(1, Number(req.query.days || 14));
    const historyDays = Math.max(7, Number(req.query.history || 90));
    const limit = Math.max(1, Number(req.query.limit || 100));
    const categoryId = req.query.category_id != null ? Number(req.query.category_id) : undefined;
    const includeDescendants =
      String(req.query.include_descendants || '').toLowerCase() === '1' ||
      String(req.query.include_descendants || '').toLowerCase() === 'true';
    const data = await ai.stockouts({ days, historyDays, limit, categoryId, includeDescendants });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener riesgo de stockout' });
  }
}

async function anomalias(req, res) {
  try {
    const scope = (req.query.scope || 'sales').toString();
    const period = Math.max(7, Number(req.query.period || 90));
    const sigma = Math.max(1, Number(req.query.sigma || 3));
    const data = await ai.anomalies({ scope, period, sigma });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo detectar anomalías' });
  }
}

async function precios(req, res) {
  try {
    const margin = req.query.margin != null ? Number(req.query.margin) : undefined;
    const history = Math.max(7, Number(req.query.history || 90));
    const limit = Math.max(1, Number(req.query.limit || 200));
    const data = await ai.pricingRecommendations({ margin, historyDays: history, limit });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo calcular precios sugeridos' });
  }
}

async function forecastDetail(req, res) {
  try {
    const productoId = req.params.id || req.query.producto_id;
    const historyDays = Math.max(7, Number(req.query.history || 90));
    const forecastDays = Math.max(1, Number(req.query.days || 14));
    const data = await ai.forecastDetail({ productoId, historyDays, forecastDays });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el detalle de pronóstico' });
  }
}

async function insights(req, res) {
  try {
    const historyDays = Math.max(7, Number(req.query.history || 90));
    const forecastDays = Math.max(1, Number(req.query.days || 14));
    const limit = Math.max(1, Number(req.query.limit || 12));
    const data = await ai.insights({ historyDays, forecastDays, limit });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener recomendaciones' });
  }
}

async function predictionsSummary(req, res) {
  try {
    if (process.env.AI_LLM_ENABLED !== 'true') {
      return res.status(503).json({ error: 'AI LLM deshabilitada' });
    }
    const historyDays = Math.max(7, Number(req.body?.history || req.query?.history || 90));
    const forecastDays = Math.max(1, Number(req.body?.days || req.query?.days || 14));
    const limit = Math.min(Math.max(Number(req.body?.limit || req.query?.limit || 8), 1), 20);
    const categoryId =
      req.body?.category_id != null
        ? Number(req.body.category_id)
        : req.query?.category_id != null
        ? Number(req.query.category_id)
        : undefined;
    const includeDescendants =
      String(req.body?.include_descendants ?? req.query?.include_descendants ?? '').toLowerCase() === '1' ||
      String(req.body?.include_descendants ?? req.query?.include_descendants ?? '').toLowerCase() === 'true';

    const [forecastList, stockoutList, preciosList, anomalyRes, insights] = await Promise.all([
      ai.forecastByProduct({ forecastDays, historyDays, limit: 50, categoryId, includeDescendants }),
      ai.stockouts({ days: forecastDays, historyDays, limit: 50, categoryId, includeDescendants }),
      ai.pricingRecommendations({ historyDays, limit: 50 }),
      ai.anomalies({ scope: 'sales', period: historyDays, sigma: 3 }).catch(() => ({ sales: [] })),
      ai.insights({ historyDays, forecastDays, limit: 12 }).catch(() => null),
    ]);

    const topRotation = (forecastList || [])
      .slice()
      .sort((a, b) => Number(b.daily_avg || 0) - Number(a.daily_avg || 0))
      .slice(0, limit);

    const stockRisk = (stockoutList || [])
      .slice()
      .sort((a, b) => Number(a.dias_hasta_quiebre || 0) - Number(b.dias_hasta_quiebre || 0))
      .slice(0, limit);

    const priceMoves = (preciosList || [])
      .slice()
      .sort((a, b) => Math.abs(Number(b.diferencia || 0)) - Math.abs(Number(a.diferencia || 0)))
      .slice(0, limit);

    const anomalies = Array.isArray(anomalyRes?.sales) ? anomalyRes.sales : [];
    const anomalyTop = anomalies
      .slice()
      .sort((a, b) => Math.abs(Number(b.z || 0)) - Math.abs(Number(a.z || 0)))
      .slice(0, limit);

    const data = {
      generated_at: new Date().toISOString(),
      params: {
        historyDays,
        forecastDays,
        limit,
        categoryId: categoryId ?? null,
        includeDescendants,
      },
      highlights: {
        top_rotacion: topRotation,
        stockouts: stockRisk,
        precios: priceMoves,
        anomalias: anomalyTop,
      },
      insights: insights?.items || [],
      insights_summary: insights?.summary || null,
    };

    const llm = require('../services/llmService');
    const narrative = await llm.generatePredictionsNarrative({ data });
    res.json({ narrative, data });
  } catch (e) {
    logger.error({ err: e }, '[ai] predictionsSummary error:');
    if (e && typeof e.message === 'string' && e.message.includes('No AI provider available')) {
      return res.status(503).json({ error: 'No hay proveedor de IA disponible' });
    }
    res.status(500).json({ error: 'No se pudo generar el resumen de predicciones' });
  }
}

module.exports = { forecast, stockouts, anomalias, precios, forecastDetail, insights, predictionsSummary };
