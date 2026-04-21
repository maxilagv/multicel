const { body, validationResult } = require('express-validator');
const { getActiveProvider } = require('../services/messaging/providerRegistry');
const activityRepo = require('../db/repositories/crmActivityRepository');
const reportExecutiveService = require('../services/reportExecutiveService');
const aiDataGatewayService = require('../services/aiDataGatewayService');
const { listDatasets } = require('../services/agentDataRegistry');

const validateCreateActivity = [
  body('tipo')
    .isIn(['llamada', 'reunion', 'tarea', 'visita', 'email', 'recordatorio'])
    .withMessage('tipo invalido'),
  body('asunto').trim().notEmpty().withMessage('asunto requerido'),
  body('estado').optional().isIn(['pendiente', 'completado', 'cancelado']),
  body('cliente_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('crm_cuenta_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('oportunidad_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('asignado_a_usuario_id').optional({ nullable: true }).isInt({ gt: 0 }),
];

const validateSendText = [
  body('telefono_e164').trim().notEmpty().withMessage('telefono_e164 requerido'),
  body('mensaje').trim().notEmpty().withMessage('mensaje requerido'),
  body('cliente_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('campaign_id').optional({ nullable: true }).isInt({ gt: 0 }),
];

const validateSendTemplate = [
  body('telefono_e164').trim().notEmpty().withMessage('telefono_e164 requerido'),
  body('template_sid').trim().notEmpty().withMessage('template_sid requerido'),
  body('variables').optional().isObject(),
  body('cliente_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('campaign_id').optional({ nullable: true }).isInt({ gt: 0 }),
];

function normalizeErrors(res, errors) {
  return res.status(400).json({ errors: errors.array() });
}

function toOptionalPositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toOptionalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildInternalRequestSource(req) {
  const source = req?.internalAuth?.nombre || req?.internalAuth?.source || 'internal_api';
  return `internal:${source}`;
}

function buildDatasetOptions(req) {
  const filters = reportExecutiveService.resolveFilters(req.query || {});
  return {
    rangeInput: {
      desde: toOptionalDate(req.query?.desde),
      hasta: toOptionalDate(req.query?.hasta),
    },
    filters,
    depositoId: toOptionalPositiveInt(req.query?.deposito_id),
    clienteId: toOptionalPositiveInt(req.query?.cliente_id),
    historyDays: toOptionalPositiveInt(req.query?.history_days || req.query?.history),
    days: toOptionalPositiveInt(req.query?.days),
    limit: toOptionalPositiveInt(req.query?.limit),
    topLimit: toOptionalPositiveInt(req.query?.top),
    requestSource: buildInternalRequestSource(req),
    companyId: toOptionalPositiveInt(req.query?.company_id),
  };
}

async function createActivity(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return normalizeErrors(res, errors);

  try {
    const result = await activityRepo.create({
      ...req.body,
      origen: 'automatizacion',
    });
    return res.status(201).json({ id: result.id });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || 'No se pudo crear la actividad',
    });
  }
}

async function sendText(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return normalizeErrors(res, errors);

  try {
    const provider = getActiveProvider();
    const result = await provider.sendTextMessage({
      toE164: req.body.telefono_e164,
      body: req.body.mensaje,
      automatizado: true,
      automatizacionNombre: req.body.automatizacion_nombre || 'automatizacion',
      campaignId: req.body.campaign_id || null,
      clientId: req.body.cliente_id || null,
    });

    if (!result?.ok) {
      return res.status(400).json({
        error: result?.errorMessage || 'No se pudo enviar el mensaje',
        status: result?.status || null,
      });
    }

    return res.status(201).json({
      ok: true,
      provider_message_id: result.providerMessageId || result.sid || null,
      provider_status: result.providerStatus || result.status || null,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'No se pudo enviar el mensaje',
    });
  }
}

async function sendTemplate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return normalizeErrors(res, errors);

  try {
    const provider = getActiveProvider();
    if (typeof provider.sendTemplateMessage !== 'function') {
      return res.status(400).json({
        error: 'El canal actual no soporta plantillas oficiales',
      });
    }

    const result = await provider.sendTemplateMessage({
      toE164: req.body.telefono_e164,
      templateSid: req.body.template_sid,
      variables: req.body.variables || {},
      body: req.body.mensaje || null,
      automatizado: true,
      automatizacionNombre: req.body.automatizacion_nombre || 'automatizacion',
      campaignId: req.body.campaign_id || null,
      clientId: req.body.cliente_id || null,
    });

    if (!result?.ok) {
      return res.status(400).json({
        error: result?.errorMessage || 'No se pudo enviar la plantilla',
        status: result?.status || null,
      });
    }

    return res.status(201).json({
      ok: true,
      provider_message_id: result.providerMessageId || result.sid || null,
      provider_status: result.providerStatus || result.status || null,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'No se pudo enviar la plantilla',
    });
  }
}

async function getAiDataset(req, res) {
  try {
    const dataset = String(req.params?.dataset || '').trim().toLowerCase();
    const options = buildDatasetOptions(req);
    const data = await aiDataGatewayService.getDataset(dataset, options);
    return res.json(data);
  } catch (error) {
    if (error?.message === 'Dataset IA no soportado') {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'No se pudo generar el dataset interno para IA',
    });
  }
}

async function getAiDatasetCatalog(req, res) {
  return res.json({
    generated_at: new Date().toISOString(),
    items: listDatasets(),
  });
}

async function getExecutiveSummaryInput(req, res) {
  try {
    const options = buildDatasetOptions(req);
    const data = await aiDataGatewayService.buildExecutiveSummaryInput(options);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo generar el briefing ejecutivo interno',
    });
  }
}

module.exports = {
  createActivity: [...validateCreateActivity, createActivity],
  sendText: [...validateSendText, sendText],
  sendTemplate: [...validateSendTemplate, sendTemplate],
  getAiDatasetCatalog,
  getAiDataset,
  getExecutiveSummaryInput,
};
