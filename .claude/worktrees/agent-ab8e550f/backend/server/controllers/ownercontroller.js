const { body, param, validationResult } = require('express-validator');
const ownerRepo = require('../db/repositories/ownerRepository');
const ownerService = require('../services/ownerIntelligenceService');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

function getUserId(req) {
  if (req.authUser?.id) return Number(req.authUser.id);
  if (req.user?.sub) return Number(req.user.sub);
  return null;
}

async function riskRanking(req, res) {
  try {
    const limit = Number(req.query.limit || 100);
    const persist = String(req.query.persist || '1') !== '0';
    const rows = await ownerService.buildRiskRanking({ limit, persistSnapshot: persist });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo calcular el ranking de riesgo' });
  }
}

async function autoReminders(req, res) {
  try {
    const limit = Number(req.body?.limit || 50);
    const created = await ownerService.generateAutoReminders({
      limit,
      userId: getUserId(req),
    });
    res.status(201).json({ created: created.length, reminders: created });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron generar recordatorios automaticos' });
  }
}

async function listReminders(req, res) {
  try {
    const rows = await ownerRepo.listReminders({
      status: req.query.status,
      clienteId: req.query.cliente_id,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener recordatorios' });
  }
}

const validateCreateReminder = [
  body('cliente_id').isInt({ gt: 0 }),
  body('canal').optional().isIn(['whatsapp', 'email', 'manual']),
  body('destino').optional({ nullable: true }).isString().isLength({ min: 3, max: 120 }),
  body('template_code').optional().isString().isLength({ min: 3, max: 80 }),
  body('payload').optional().isObject(),
  body('scheduled_at').optional({ nullable: true }).isISO8601(),
];

async function createReminder(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.createReminder({
      clienteId: Number(req.body.cliente_id),
      canal: req.body.canal || 'manual',
      destino: req.body.destino || null,
      templateCode: req.body.template_code || 'manual_followup',
      payload: req.body.payload || {},
      scheduledAt: req.body.scheduled_at || null,
      status: 'pending',
      userId: getUserId(req),
    });
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear el recordatorio' });
  }
}

const validateCreatePromise = [
  body('cliente_id').isInt({ gt: 0 }),
  body('monto_prometido').isFloat({ gt: 0 }),
  body('fecha_promesa').isISO8601(),
  body('canal_preferido').optional().isIn(['whatsapp', 'email', 'telefono', 'manual']),
  body('notas').optional().isString().isLength({ max: 500 }),
];

async function createPromise(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const created = await ownerRepo.createPromise({
      clienteId: Number(req.body.cliente_id),
      montoPrometido: Number(req.body.monto_prometido),
      fechaPromesa: req.body.fecha_promesa,
      canalPreferido: req.body.canal_preferido || 'manual',
      notas: req.body.notas || null,
      userId: getUserId(req),
    });
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear la promesa de pago' });
  }
}

async function listPromises(req, res) {
  try {
    const rows = await ownerRepo.listPromises({
      clienteId: req.query.cliente_id,
      estado: req.query.estado,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener promesas' });
  }
}

const validateUpdatePromiseStatus = [
  param('id').isInt({ gt: 0 }),
  body('estado').isIn(['pendiente', 'cumplida', 'incumplida', 'cancelada']),
  body('notas').optional().isString().isLength({ max: 500 }),
];

async function updatePromiseStatus(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.updatePromiseStatus({
      id: Number(req.params.id),
      estado: req.body.estado,
      notas: req.body.notas,
      userId: getUserId(req),
    });
    if (!out) return res.status(404).json({ error: 'Promesa no encontrada' });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar la promesa' });
  }
}

async function marginsRealtime(req, res) {
  try {
    const rows = await ownerService.getMarginsRealtime({
      dimension: req.query.dimension,
      desde: req.query.desde,
      hasta: req.query.hasta,
      limit: req.query.limit,
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el control de margenes' });
  }
}

async function listRepricingRules(req, res) {
  try {
    const rows = await ownerRepo.listRepricingRules();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener reglas de repricing' });
  }
}

const validateRepricingRule = [
  body('nombre').isString().isLength({ min: 3, max: 120 }),
  body('scope').optional().isIn(['global', 'categoria', 'proveedor', 'producto']),
  body('scope_ref_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('channel').optional({ nullable: true }).isIn(['local', 'distribuidor', 'final']),
  body('margin_min').optional().isFloat({ min: 0 }),
  body('margin_target').optional().isFloat({ min: 0 }),
  body('usd_pass_through').optional().isFloat({ min: 0 }),
  body('rounding_step').optional().isFloat({ gt: 0 }),
  body('prioridad').optional().isInt({ min: 1, max: 9999 }),
  body('status').optional().isIn(['active', 'inactive']),
];
const validateRepricingRulePatch = [
  body('nombre').optional().isString().isLength({ min: 3, max: 120 }),
  body('scope').optional().isIn(['global', 'categoria', 'proveedor', 'producto']),
  body('scope_ref_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('channel').optional({ nullable: true }).isIn(['local', 'distribuidor', 'final']),
  body('margin_min').optional().isFloat({ min: 0 }),
  body('margin_target').optional().isFloat({ min: 0 }),
  body('usd_pass_through').optional().isFloat({ min: 0 }),
  body('rounding_step').optional().isFloat({ gt: 0 }),
  body('prioridad').optional().isInt({ min: 1, max: 9999 }),
  body('status').optional().isIn(['active', 'inactive']),
];

async function createRepricingRule(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const payload = {
      nombre: req.body.nombre,
      scope: req.body.scope || 'global',
      scope_ref_id: req.body.scope_ref_id || null,
      channel: req.body.channel || null,
      margin_min: Number(req.body.margin_min ?? 0.15),
      margin_target: Number(req.body.margin_target ?? 0.3),
      usd_pass_through: Number(req.body.usd_pass_through ?? 1),
      rounding_step: Number(req.body.rounding_step ?? 1),
      prioridad: Number(req.body.prioridad ?? 100),
      status: req.body.status || 'active',
    };
    const out = await ownerRepo.createRepricingRule(payload, getUserId(req));
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear la regla de repricing' });
  }
}

const validateRuleId = [param('id').isInt({ gt: 0 })];

async function updateRepricingRule(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.updateRepricingRule(Number(req.params.id), req.body || {});
    if (!out) return res.status(404).json({ error: 'Regla no encontrada o sin cambios' });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar la regla de repricing' });
  }
}

const validateRepricingPreview = [
  body('product_ids').optional().isArray(),
  body('product_ids.*').optional().isInt({ gt: 0 }),
  body('limit').optional().isInt({ gt: 0, lt: 10001 }),
];

async function repricingPreview(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const preview = await ownerService.buildRepricingPreview({
      productIds: req.body.product_ids || [],
      limit: Number(req.body.limit || 500),
    });
    res.json(preview);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo generar preview de repricing' });
  }
}

async function repricingApply(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerService.applyRepricing({
      productIds: req.body.product_ids || [],
      limit: Number(req.body.limit || 500),
      userId: getUserId(req),
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo aplicar repricing' });
  }
}

async function commandCenter(req, res) {
  try {
    const baseCash = req.query.base_cash != null ? Number(req.query.base_cash) : null;
    const horizonsRaw = String(req.query.horizons || '7,30,90')
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isInteger(x) && x > 0 && x <= 365);
    const horizons = horizonsRaw.length ? horizonsRaw : [7, 30, 90];
    const out = await ownerService.getOwnerCommandCenter({
      baseCash,
      horizons,
      persistAlerts: String(req.query.persist_alerts || '1') !== '0',
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo construir el centro de mando' });
  }
}

async function listAlerts(req, res) {
  try {
    const rows = await ownerRepo.listAlerts({
      status: req.query.status || 'open',
      limit: req.query.limit,
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener alertas' });
  }
}

const validateDismissAlert = [param('id').isInt({ gt: 0 })];

async function dismissAlert(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.dismissAlert(Number(req.params.id));
    if (!out) return res.status(404).json({ error: 'Alerta no encontrada' });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo cerrar la alerta' });
  }
}

async function listFiscalRules(req, res) {
  try {
    const rows = await ownerRepo.listFiscalRules();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener reglas fiscales' });
  }
}

const validateFiscalRule = [
  body('tipo').isIn(['retencion', 'percepcion']),
  body('nombre').isString().isLength({ min: 3, max: 120 }),
  body('impuesto').optional().isString().isLength({ min: 2, max: 40 }),
  body('jurisdiccion').optional().isString().isLength({ min: 2, max: 80 }),
  body('scope').optional().isIn(['global', 'cliente', 'proveedor', 'producto']),
  body('scope_ref_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('alicuota').isFloat({ min: 0 }),
  body('monto_minimo').optional().isFloat({ min: 0 }),
  body('vigencia_desde').optional({ nullable: true }).isISO8601(),
  body('vigencia_hasta').optional({ nullable: true }).isISO8601(),
  body('activo').optional().isBoolean(),
  body('prioridad').optional().isInt({ min: 1, max: 9999 }),
];
const validateFiscalRulePatch = [
  body('tipo').optional().isIn(['retencion', 'percepcion']),
  body('nombre').optional().isString().isLength({ min: 3, max: 120 }),
  body('impuesto').optional().isString().isLength({ min: 2, max: 40 }),
  body('jurisdiccion').optional().isString().isLength({ min: 2, max: 80 }),
  body('scope').optional().isIn(['global', 'cliente', 'proveedor', 'producto']),
  body('scope_ref_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('alicuota').optional().isFloat({ min: 0 }),
  body('monto_minimo').optional().isFloat({ min: 0 }),
  body('vigencia_desde').optional({ nullable: true }).isISO8601(),
  body('vigencia_hasta').optional({ nullable: true }).isISO8601(),
  body('activo').optional().isBoolean(),
  body('prioridad').optional().isInt({ min: 1, max: 9999 }),
];

async function createFiscalRule(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.createFiscalRule(req.body || {});
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear la regla fiscal' });
  }
}

async function updateFiscalRule(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.updateFiscalRule(Number(req.params.id), req.body || {});
    if (!out) return res.status(404).json({ error: 'Regla no encontrada o sin cambios' });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar la regla fiscal' });
  }
}

const validateFiscalSim = [
  body('monto').isFloat({ gt: 0 }),
  body('fecha').optional().isISO8601(),
  body('cliente_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('proveedor_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('producto_id').optional({ nullable: true }).isInt({ gt: 0 }),
];

async function simulateFiscal(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerService.simulateFiscalAr(req.body || {});
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo simular capa fiscal AR' });
  }
}

async function listPriceLists(req, res) {
  try {
    const rows = await ownerRepo.listPriceLists();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener listas de precios' });
  }
}

const validatePriceList = [
  body('nombre').isString().isLength({ min: 2, max: 120 }),
  body('moneda_base').optional().isString().isLength({ min: 2, max: 8 }),
  body('canal').optional({ nullable: true }).isString().isLength({ min: 2, max: 40 }),
  body('estrategia_actualizacion').optional().isIn(['manual', 'usd', 'ipc', 'proveedor', 'mixta']),
  body('activo').optional().isBoolean(),
];
const validatePriceListPatch = [
  body('nombre').optional().isString().isLength({ min: 2, max: 120 }),
  body('moneda_base').optional().isString().isLength({ min: 2, max: 8 }),
  body('canal').optional({ nullable: true }).isString().isLength({ min: 2, max: 40 }),
  body('estrategia_actualizacion').optional().isIn(['manual', 'usd', 'ipc', 'proveedor', 'mixta']),
  body('activo').optional().isBoolean(),
];

async function createPriceList(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.createPriceList(req.body || {});
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear lista de precios' });
  }
}

async function updatePriceList(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.updatePriceList(Number(req.params.id), req.body || {});
    if (!out) return res.status(404).json({ error: 'Lista no encontrada o sin cambios' });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar lista de precios' });
  }
}

const validatePriceListId = [param('id').isInt({ gt: 0 })];

async function listPriceListRules(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const rows = await ownerRepo.listPriceListRules(Number(req.params.id));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener reglas de la lista' });
  }
}

const validatePriceListRule = [
  body('tipo_regla').isIn(['usd', 'ipc', 'proveedor', 'canal', 'markup_fijo', 'markup_pct']),
  body('prioridad').optional().isInt({ min: 1, max: 9999 }),
  body('parametros').optional().isObject(),
  body('activo').optional().isBoolean(),
];
const validatePriceListRulePatch = [
  body('tipo_regla').optional().isIn(['usd', 'ipc', 'proveedor', 'canal', 'markup_fijo', 'markup_pct']),
  body('prioridad').optional().isInt({ min: 1, max: 9999 }),
  body('parametros').optional().isObject(),
  body('activo').optional().isBoolean(),
];

async function createPriceListRule(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.createPriceListRule(Number(req.params.id), req.body || {});
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear regla de lista de precios' });
  }
}

const validateRuleParamId = [param('ruleId').isInt({ gt: 0 })];

async function updatePriceListRule(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const fields = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(fields, 'parametros')) {
      fields.parametros_json = JSON.stringify(fields.parametros || {});
      delete fields.parametros;
    }
    const out = await ownerRepo.updatePriceListRule(Number(req.params.ruleId), fields);
    if (!out) return res.status(404).json({ error: 'Regla no encontrada o sin cambios' });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar regla de lista de precios' });
  }
}

async function previewPriceList(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const rows = await ownerService.previewPriceList({
      priceListId: Number(req.params.id),
      limit: Number(req.body?.limit || 500),
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo simular la lista de precios' });
  }
}

async function listChannelIntegrations(req, res) {
  try {
    const rows = await ownerRepo.listChannelIntegrations();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener integraciones de canales' });
  }
}

const validateChannelParam = [param('canal').isIn(['mercadolibre', 'tiendanube', 'whatsapp_catalog'])];

const validateUpsertChannel = [
  ...validateChannelParam,
  body('estado').optional().isIn(['disconnected', 'connected', 'error']),
  body('config').optional().isObject(),
  body('secret_ref').optional().isString().isLength({ min: 3, max: 200 }),
];

async function upsertChannelIntegration(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    await ownerRepo.upsertChannelIntegration({
      canal: req.params.canal,
      estado: req.body.estado || 'connected',
      config: req.body.config || {},
      secretRef: req.body.secret_ref || null,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo guardar la integracion de canal' });
  }
}

const validateQueueSync = [
  ...validateChannelParam,
  body('job_type').optional().isString().isLength({ min: 2, max: 80 }),
  body('payload').optional().isObject(),
];

async function queueChannelSync(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.createChannelSyncJob({
      canal: req.params.canal,
      jobType: req.body.job_type || 'catalog_sync',
      payload: req.body.payload || {},
    });
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo encolar sync de canal' });
  }
}

async function listChannelJobs(req, res) {
  try {
    const rows = await ownerRepo.listChannelSyncJobs({
      status: req.query.status,
      limit: req.query.limit,
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener jobs de integraciones' });
  }
}

async function listBetaCompanies(req, res) {
  try {
    const rows = await ownerRepo.listBetaCompanies();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener empresas beta' });
  }
}

const validateBetaCompany = [
  body('nombre').isString().isLength({ min: 2, max: 120 }),
  body('cuit').optional().isString().isLength({ min: 6, max: 20 }),
  body('segmento').optional().isString().isLength({ min: 2, max: 80 }),
  body('tamano_equipo').optional({ nullable: true }).isInt({ min: 1, max: 10000 }),
  body('estado').optional().isIn(['invited', 'active', 'paused', 'churned']),
  body('onboarded_at').optional({ nullable: true }).isISO8601(),
  body('nps_score').optional({ nullable: true }).isInt({ min: 0, max: 10 }),
];

async function createBetaCompany(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.createBetaCompany(req.body || {});
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear empresa beta' });
  }
}

const validateBetaFeedback = [
  param('id').isInt({ gt: 0 }),
  body('modulo').isString().isLength({ min: 2, max: 80 }),
  body('impacto_score').isInt({ min: 1, max: 5 }),
  body('comentario').optional().isString().isLength({ max: 1000 }),
];

async function createBetaFeedback(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.createBetaFeedback({
      companyId: Number(req.params.id),
      modulo: req.body.modulo,
      impactoScore: Number(req.body.impacto_score),
      comentario: req.body.comentario || null,
    });
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo registrar feedback beta' });
  }
}

async function betaMetrics(req, res) {
  try {
    const out = await ownerRepo.getBetaMetrics();
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener metricas beta' });
  }
}

async function listReleaseCycles(req, res) {
  try {
    const rows = await ownerRepo.listReleaseCycles();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener ciclos de release train' });
  }
}

const validateCreateCycle = [
  body('codigo').isString().isLength({ min: 3, max: 80 }),
  body('mes').matches(/^\d{4}-\d{2}$/),
  body('objetivos').optional().isObject(),
];

async function createReleaseCycle(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.createReleaseCycle({
      codigo: req.body.codigo,
      mes: req.body.mes,
      objetivos: req.body.objetivos || {},
    });
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear ciclo de release train' });
  }
}

const validateAddReleaseEntry = [
  param('id').isInt({ gt: 0 }),
  body('categoria').isString().isLength({ min: 2, max: 80 }),
  body('titulo').isString().isLength({ min: 4, max: 160 }),
  body('impacto_negocio').isString().isLength({ min: 8, max: 1200 }),
  body('kpi_target').optional().isString().isLength({ max: 200 }),
];

async function addReleaseEntry(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.addReleaseEntry({
      cycleId: Number(req.params.id),
      categoria: req.body.categoria,
      titulo: req.body.titulo,
      impactoNegocio: req.body.impacto_negocio,
      kpiTarget: req.body.kpi_target || null,
    });
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo registrar changelog de negocio' });
  }
}

const validateCloseCycle = [
  param('id').isInt({ gt: 0 }),
  body('changelog_resumen').optional().isString().isLength({ max: 3000 }),
];

async function closeReleaseCycle(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const out = await ownerRepo.closeReleaseCycle(
      Number(req.params.id),
      req.body?.changelog_resumen || null
    );
    if (!out) return res.status(404).json({ error: 'Ciclo no encontrado' });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo cerrar ciclo de release train' });
  }
}

module.exports = {
  riskRanking,
  autoReminders: [
    body('limit').optional().isInt({ gt: 0, lt: 1001 }),
    autoReminders,
  ],
  listReminders,
  createReminder: [...validateCreateReminder, createReminder],
  listPromises,
  createPromise: [...validateCreatePromise, createPromise],
  updatePromiseStatus: [...validateUpdatePromiseStatus, updatePromiseStatus],
  marginsRealtime,
  listRepricingRules,
  createRepricingRule: [...validateRepricingRule, createRepricingRule],
  updateRepricingRule: [...validateRuleId, ...validateRepricingRulePatch, updateRepricingRule],
  repricingPreview: [...validateRepricingPreview, repricingPreview],
  repricingApply: [...validateRepricingPreview, repricingApply],
  commandCenter,
  listAlerts,
  dismissAlert: [...validateDismissAlert, dismissAlert],
  listFiscalRules,
  createFiscalRule: [...validateFiscalRule, createFiscalRule],
  updateFiscalRule: [...validateRuleId, ...validateFiscalRulePatch, updateFiscalRule],
  simulateFiscal: [...validateFiscalSim, simulateFiscal],
  listPriceLists,
  createPriceList: [...validatePriceList, createPriceList],
  updatePriceList: [...validatePriceListId, ...validatePriceListPatch, updatePriceList],
  listPriceListRules: [...validatePriceListId, listPriceListRules],
  createPriceListRule: [...validatePriceListId, ...validatePriceListRule, createPriceListRule],
  updatePriceListRule: [...validateRuleParamId, ...validatePriceListRulePatch, updatePriceListRule],
  previewPriceList: [...validatePriceListId, body('limit').optional().isInt({ gt: 0, lt: 10001 }), previewPriceList],
  listChannelIntegrations,
  upsertChannelIntegration: [...validateUpsertChannel, upsertChannelIntegration],
  queueChannelSync: [...validateQueueSync, queueChannelSync],
  listChannelJobs,
  listBetaCompanies,
  createBetaCompany: [...validateBetaCompany, createBetaCompany],
  createBetaFeedback: [...validateBetaFeedback, createBetaFeedback],
  betaMetrics,
  listReleaseCycles,
  createReleaseCycle: [...validateCreateCycle, createReleaseCycle],
  addReleaseEntry: [...validateAddReleaseEntry, addReleaseEntry],
  closeReleaseCycle: [...validateCloseCycle, closeReleaseCycle],
};
