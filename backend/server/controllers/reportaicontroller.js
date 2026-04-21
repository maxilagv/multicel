const reportService = require('../services/reportExecutiveService');
const agentRuntimeService = require('../services/agentRuntimeService');
const { envelopeToExecutiveAssistantLegacy } = require('../services/agentLegacyAdapterService');
const logger = require('../lib/logger');
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
    logger.error({ err: e }, '[report-ai] reportData error:');
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
    logger.error({ err: e }, '[report-ai] reportSummary error:');
    if (e && typeof e.message === 'string' && e.message.includes('No AI provider available')) {
      return res
        .status(503)
        .json({ error: 'No hay proveedor de IA disponible (revisa las API keys y la configuracion local).' });
    }
    res.status(500).json({ error: 'No se pudo generar el resumen ejecutivo con IA' });
  }
}

async function executiveAssistant(req, res) {
  try {
    const envelope = await agentRuntimeService.runAgent({
      input: {
        surface: 'ask',
        question: req.body?.question || req.query?.question || '',
        preset: req.body?.preset || req.query?.preset || '',
        context: {
          range: {
            desde: req.body?.desde || req.query?.desde || null,
            hasta: req.body?.hasta || req.query?.hasta || null,
          },
          filters: reportService.resolveFilters(req.body || req.query || {}),
        },
      },
      requestedByUsuarioId: req?.user?.sub ? Number(req.user.sub) : null,
      requestedByRole: req?.authUser?.rol || req?.user?.role || null,
    });
    res.json(envelopeToExecutiveAssistantLegacy(envelope));
  } catch (e) {
    logger.error({ err: e }, '[report-ai] executiveAssistant error:');
    res.status(500).json({ error: 'No se pudo preparar la respuesta ejecutiva' });
  }
}

module.exports = {
  reportData,
  reportSummary,
  executiveAssistant,
};
