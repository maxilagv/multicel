const reportService = require('../services/reportExecutiveService');
const llm = require('../services/llmService');

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function reportData(req, res) {
  try {
    const rangeInput = {
      desde: req.query?.desde,
      hasta: req.query?.hasta,
    };
    const filters = reportService.resolveFilters(req.query || {});
    const historyDays = Math.max(7, parseNumber(req.query?.history, 90));
    const forecastDays = Math.max(1, parseNumber(req.query?.forecast, 14));
    const insightsLimit = Math.min(Math.max(parseNumber(req.query?.limit, 10), 1), 20);
    const topLimit = Math.min(Math.max(parseNumber(req.query?.top, 5), 1), 20);

    const data = await reportService.buildExecutiveReportData({
      rangeInput,
      filters,
      historyDays,
      forecastDays,
      insightsLimit,
      topLimit,
    });
    res.json(data);
  } catch (e) {
    console.error('[report-ai] reportData error:', e);
    res.status(500).json({ error: 'No se pudo generar el reporte ejecutivo' });
  }
}

async function reportSummary(req, res) {
  try {
    if (process.env.AI_LLM_ENABLED !== 'true') {
      return res.status(503).json({ error: 'AI LLM deshabilitada' });
    }

    const rangeInput = {
      desde: req.body?.desde || req.query?.desde,
      hasta: req.body?.hasta || req.query?.hasta,
    };
    const filters = reportService.resolveFilters(req.body || req.query || {});
    const historyDays = Math.max(7, parseNumber(req.body?.history || req.query?.history, 90));
    const forecastDays = Math.max(1, parseNumber(req.body?.forecast || req.query?.forecast, 14));
    const insightsLimit = Math.min(Math.max(parseNumber(req.body?.limit || req.query?.limit, 10), 1), 20);
    const topLimit = Math.min(Math.max(parseNumber(req.body?.top || req.query?.top, 5), 1), 20);

    const data = await reportService.buildExecutiveReportData({
      rangeInput,
      filters,
      historyDays,
      forecastDays,
      insightsLimit,
      topLimit,
    });

    const narrative = await llm.generateExecutiveReportNarrative({ data });
    res.json({ narrative, data });
  } catch (e) {
    console.error('[report-ai] reportSummary error:', e);
    if (e && typeof e.message === 'string' && e.message.includes('No AI provider available')) {
      return res
        .status(503)
        .json({ error: 'No hay proveedor de IA disponible (revisa las API keys y la configuracion local).' });
    }
    res.status(500).json({ error: 'No se pudo generar el resumen ejecutivo con IA' });
  }
}

module.exports = {
  reportData,
  reportSummary,
};
