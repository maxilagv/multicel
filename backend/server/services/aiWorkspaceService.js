const { withTransaction } = require('../db/pg');
const configRepo = require('../db/repositories/configRepository');
const userDepositoRepository = require('../db/repositories/usuarioDepositoRepository');
const logger = require('../lib/logger');
const aiService = require('./aiService');
const n8nService = require('./n8nService');
const clientSegmentationService = require('./clientSegmentationService');
const automationEventRepository = require('../db/repositories/automationEventRepository');
const approvalRuleRepository = require('../db/repositories/approvalRuleRepository');
const approvalsRepository = require('../db/repositories/approvalsRepository');
const aiRuntimeRepository = require('../db/repositories/aiRuntimeRepository');
const aiAutomationSyncService = require('./aiAutomationSyncService');
const aiPolicyEngineService = require('./aiPolicyEngineService');
const governanceService = require('./agentGovernanceService');
const {
  deriveActionType,
  buildProposalGovernance,
  buildExecutionContract: buildValidatedExecutionContract,
  buildExecutionIdempotencyKey,
  getFallbackStatusForExecutionFailure,
} = require('./aiActionContracts');

const DAILY_OBJECTIVE = 'prioridades_del_negocio';
const EXECUTION_RULE_KEY = 'ai_action_execution';
const BUSINESS_TIMEZONE =
  process.env.BUSINESS_TIMEZONE ||
  process.env.TZ ||
  'America/Argentina/Buenos_Aires';
const STALE_PROPOSAL_DAYS = Math.max(1, Number(process.env.AI_WORKSPACE_STALE_DAYS || 7));

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
  }).format(new Date());
}

function priorityFromSeverity(severity) {
  const value = String(severity || '').trim().toLowerCase();
  if (value === 'high') return 'alta';
  if (value === 'medium') return 'media';
  return 'baja';
}

function currency(value) {
  const amount = Number(value || 0);
  return `$${amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function formatClientName(row) {
  return `${row?.nombre || ''}${row?.apellido ? ` ${row.apellido}` : ''}`.trim() || 'Cliente';
}

function buildDailyProposalKey(type, entityId) {
  return `workspace:${type}:${entityId}`;
}

function mapInsightToProposal(item) {
  if (!item || !item.type) return null;
  const entityId = item.entity?.id != null ? item.entity.id : item.id;
  const entityName = item.entity?.name || item.entity_name || item.title || 'Elemento';
  const proposal = {
    proposalKey: buildDailyProposalKey(item.type, entityId),
    sourceType: 'insight',
    sourceKey: `${item.type}:${entityId}`,
    priorityLevel: priorityFromSeverity(item.severity),
    entityType: item.entity?.type || item.type,
    entityId,
    entityName,
    evidence: {
      metrics: item.metrics || {},
      raw_message: item.message || null,
      severity: item.severity || null,
    },
  };

  if (item.type === 'stockout' || item.type === 'stock_low') {
    const days = Number(item.metrics?.dias_hasta_quiebre || 0);
    return {
      ...proposal,
      category: 'stock',
      title: `Revisar reposicion de ${entityName}`,
      summary: item.message || 'El stock puede quedarse corto en los proximos dias.',
      whyText:
        days > 0
          ? `Al ritmo actual, alcanza para aproximadamente ${days.toFixed(1)} dias.`
          : 'El stock actual esta por debajo de lo recomendable.',
      recommendedAction: 'Validar cantidad disponible, revisar compras pendientes y preparar reposicion.',
      expectedImpact: 'Evita perder ventas por falta de mercaderia.',
      requiresApproval: false,
    };
  }

  if (item.type === 'overstock') {
    return {
      ...proposal,
      category: 'stock',
      title: `Revisar sobrestock de ${entityName}`,
      summary: item.message || 'Hay mas mercaderia de la necesaria para la rotacion actual.',
      whyText: 'Se detecto capital inmovilizado en un producto con salida lenta.',
      recommendedAction: 'Revisar precio, promos o ritmo de compra antes de seguir acumulando stock.',
      expectedImpact: 'Libera caja y ordena el inventario.',
      requiresApproval: false,
    };
  }

  if (item.type === 'price') {
    return {
      ...proposal,
      category: 'rentabilidad',
      title: `Revisar precio de ${entityName}`,
      summary: item.message || 'El precio actual quedo lejos del valor sugerido.',
      whyText: 'Conviene revisar este precio para proteger margen sin improvisar cambios.',
      recommendedAction: 'Confirmar costo, validar margen y recien despues enviar a aprobacion.',
      expectedImpact: 'Ayuda a sostener la rentabilidad sin tocar precios a ciegas.',
      requiresApproval: true,
    };
  }

  if (item.type === 'debt') {
    return {
      ...proposal,
      category: 'cobranzas',
      title: `Contactar a ${entityName} por saldo pendiente`,
      summary: item.message || 'Hay un saldo pendiente que conviene revisar cuanto antes.',
      whyText: 'Se detecto una deuda abierta con atraso suficiente como para hacer seguimiento.',
      recommendedAction: 'Preparar un contacto breve y respetuoso con el detalle del saldo y la fecha de pago.',
      expectedImpact: 'Mejora el ingreso de caja sin desordenar la relacion con el cliente.',
      requiresApproval: true,
    };
  }

  if (item.type === 'anomaly') {
    return {
      ...proposal,
      category: 'seguimiento',
      title: `Revisar movimiento fuera de lo habitual del ${entityName}`,
      summary: item.message || 'Se detecto un movimiento distinto a lo normal.',
      whyText: 'Puede ser una oportunidad, un error de carga o una senal de alerta temprana.',
      recommendedAction: 'Abrir el detalle del dia, confirmar que paso y decidir si hace falta intervenir.',
      expectedImpact: 'Permite detectar problemas o aciertos antes de que escalen.',
      requiresApproval: false,
    };
  }

  return {
    ...proposal,
    category: 'seguimiento',
    title: item.title || `Revisar ${entityName}`,
    summary: item.message || 'Se detecto una situacion que conviene revisar.',
    whyText: 'El sistema encontro una variacion relevante en la operacion.',
    recommendedAction: 'Abrir el detalle y validar el siguiente paso.',
    expectedImpact: 'Ayuda a actuar con mas criterio y menos improvisacion.',
    requiresApproval: false,
  };
}

function selectRecoveryCandidates(rows) {
  return (rows || [])
    .filter((row) => {
      const days = Number(row.dias_desde_ultima_compra);
      const score = Number(row.lead_score || 0);
      return (
        Number(row.total_compras || 0) > 0 &&
        Number.isFinite(days) &&
        days >= 45 &&
        days <= 240 &&
        score >= 25 &&
        Number(row.deuda_pendiente || 0) <= 0 &&
        Number(row.oportunidades_activas || 0) === 0 &&
        String(row.whatsapp_status || '').trim().toLowerCase() !== 'blocked' &&
        (Boolean(row.whatsapp_opt_in) || Boolean(row.email))
      );
    })
    .sort((a, b) => {
      const scoreDiff = Number(b.lead_score || 0) - Number(a.lead_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const spendDiff = Number(b.total_gastado || 0) - Number(a.total_gastado || 0);
      if (spendDiff !== 0) return spendDiff;
      return Number(a.dias_desde_ultima_compra || 0) - Number(b.dias_desde_ultima_compra || 0);
    })
    .slice(0, 8);
}

function mapClientToProposal(row) {
  const clientName = formatClientName(row);
  const score = Number(row.lead_score || 0);
  const priorityLevel = score >= 75 ? 'alta' : score >= 50 ? 'media' : 'baja';

  return {
    proposalKey: buildDailyProposalKey('reactivacion_cliente', row.id),
    sourceType: 'cliente',
    sourceKey: `cliente:${row.id}`,
    category: 'ventas',
    priorityLevel,
    title: `Volver a contactar a ${clientName}`,
    summary: `Hace ${Number(row.dias_desde_ultima_compra || 0)} dias que no compra y todavia muestra buen potencial.`,
    whyText: `Compro ${Number(row.total_compras || 0)} veces, gasto ${currency(row.total_gastado || 0)} y no tiene saldo pendiente.`,
    recommendedAction: 'Enviar un mensaje corto, personal y sin insistencia. Primero novedad real, despues oferta si aplica.',
    expectedImpact: 'Puede recuperar una venta con bajo riesgo de rechazo.',
    evidence: {
      lead_score: score,
      dias_desde_ultima_compra: Number(row.dias_desde_ultima_compra || 0),
      total_compras: Number(row.total_compras || 0),
      total_gastado: Number(row.total_gastado || 0),
      whatsapp_opt_in: Boolean(row.whatsapp_opt_in),
      email: row.email || null,
    },
    entityType: 'cliente',
    entityId: Number(row.id),
    entityName: clientName,
    requiresApproval: true,
  };
}

function summarizeProposals(proposals) {
  const areas = {
    ventas: 0,
    cobranzas: 0,
    stock: 0,
    rentabilidad: 0,
    seguimiento: 0,
  };
  const priorities = {
    alta: 0,
    media: 0,
    baja: 0,
  };
  let pendingApproval = 0;
  let inReview = 0;

  for (const item of proposals || []) {
    const category = String(item.category || 'seguimiento');
    const priority = String(item.priority_level || 'media');
    if (areas[category] != null) areas[category] += 1;
    if (priorities[priority] != null) priorities[priority] += 1;
    if (item.effective_status === 'aprobacion_pendiente') pendingApproval += 1;
    if (item.effective_status === 'en_revision') inReview += 1;
  }

  return {
    total_abiertas: (proposals || []).length,
    por_area: areas,
    por_prioridad: priorities,
    pendientes_aprobacion: pendingApproval,
    en_revision: inReview,
  };
}

async function getBusinessScopeSnapshot(requestedByUsuarioId = null) {
  const [businessName, businessAddress, logoUrl, depositos] = await Promise.all([
    configRepo.getTextParam('business_name').catch(() => ''),
    configRepo.getTextParam('business_address').catch(() => ''),
    configRepo.getTextParam('business_logo_url').catch(() => ''),
    requestedByUsuarioId
      ? userDepositoRepository.getUserDepositos(requestedByUsuarioId).catch(() => [])
      : Promise.resolve([]),
  ]);

  return {
    timezone: BUSINESS_TIMEZONE,
    business_name: businessName || 'Mi Empresa',
    business_address: businessAddress || '',
    business_logo_url: logoUrl || '',
    depositos_visibles: Array.isArray(depositos)
      ? depositos.map((item) => ({
          id: Number(item.id),
          nombre: item.nombre,
          codigo: item.codigo,
          rol: item.rol_deposito || null,
        }))
      : [],
  };
}

async function buildExecutionContract(proposal, requestedByUsuarioId = null) {
  const businessScope = await getBusinessScopeSnapshot(requestedByUsuarioId);
  return buildValidatedExecutionContract({
    proposal,
    businessScope,
    operatorUserId: requestedByUsuarioId,
  });
}

async function expireStaleProposals({ olderThanDays = STALE_PROPOSAL_DAYS } = {}) {
  const stale = await aiRuntimeRepository.listStaleProposals({
    olderThanDays,
    statuses: ['pendiente', 'en_revision'],
  });
  let expired = 0;

  for (const item of stale) {
    await withTransaction(async (client) => {
      if (
        item.approval_id &&
        String(item.approval_estado || '').trim().toLowerCase() === 'pendiente'
      ) {
        await approvalsRepository.updateStatus({
          id: item.approval_id,
          estado: 'rechazado',
          aprobado_por_usuario_id: null,
          notas: 'Solicitud cerrada por vencimiento de la propuesta',
        });
      }
      await aiRuntimeRepository.updateProposalStatusTx(client, {
        id: item.id,
        status: 'vencida',
        resolvedByUsuarioId: null,
        resolvedNote: 'La prioridad dejo de aparecer y se marco como vencida',
      });
    });
    expired += 1;
  }

  return expired;
}

async function refreshWorkspace({ requestedByUsuarioId = null } = {}) {
  const scopeSnapshot = await getBusinessScopeSnapshot(requestedByUsuarioId);
  const run = await aiRuntimeRepository.createRun({
    agent: 'centro_operativo_ia',
    agentVersion: '2026-04-16.2',
    objective: DAILY_OBJECTIVE,
    status: 'running',
    requestedByUsuarioId,
    scope: {
      generated_for: 'prioridades',
      generated_on: todayKey(),
      business_scope: scopeSnapshot,
    },
    summary: {
      status: 'running',
    },
  });

  try {
    const results = await Promise.allSettled([
      aiService.insights({
        historyDays: 90,
        forecastDays: 14,
        limit: 12,
      }),
      clientSegmentationService.listClientMetrics({ limit: 250 }),
    ]);

    const insightResult = results[0];
    const clientResult = results[1];

    const insights =
      insightResult.status === 'fulfilled' ? insightResult.value : { items: [], summary: null };
    const clientMetrics =
      clientResult.status === 'fulfilled' ? clientResult.value : [];

    const insightProposals = (insights?.items || []).map(mapInsightToProposal).filter(Boolean);
    const clientProposals = selectRecoveryCandidates(clientMetrics).map(mapClientToProposal);

    await aiRuntimeRepository.addRunStep({
      runId: run.id,
      stepOrder: 1,
      stepKey: 'salud_operativa',
      title: 'Revision de stock, precios, cobranzas y alertas',
      status: insightResult.status === 'fulfilled' ? 'ok' : 'error',
      details: {
        total_alertas: Number(insights?.summary?.total || 0),
        altas: Number(insights?.summary?.high || 0),
        medias: Number(insights?.summary?.medium || 0),
        bajas: Number(insights?.summary?.low || 0),
        error:
          insightResult.status === 'rejected'
            ? insightResult.reason?.message || 'No se pudo leer la salud operativa'
            : null,
      },
    });

    await aiRuntimeRepository.addRunStep({
      runId: run.id,
      stepOrder: 2,
      stepKey: 'oportunidades_comerciales',
      title: 'Revision de clientes con chance de volver',
      status: clientResult.status === 'fulfilled' ? 'ok' : 'error',
      details: {
        clientes_revisados: Array.isArray(clientMetrics) ? clientMetrics.length : 0,
        clientes_sugeridos: clientProposals.length,
        error:
          clientResult.status === 'rejected'
            ? clientResult.reason?.message || 'No se pudieron revisar clientes'
            : null,
      },
    });

    if (insightResult.status === 'rejected' && clientResult.status === 'rejected') {
      throw new Error('No se pudieron cargar las fuentes de datos para generar prioridades');
    }

    const proposals = [...insightProposals, ...clientProposals];
    const savedProposals = [];
    for (const proposal of proposals) {
      const governance = buildProposalGovernance({
        proposal_key: proposal.proposalKey,
        source_key: proposal.sourceKey,
        category: proposal.category,
        title: proposal.title,
        summary: proposal.summary,
        why_text: proposal.whyText,
        recommended_action: proposal.recommendedAction,
        expected_impact: proposal.expectedImpact,
        evidence: proposal.evidence,
        entity_type: proposal.entityType,
        entity_id: proposal.entityId,
        entity_name: proposal.entityName,
        requires_approval: proposal.requiresApproval,
      });
      const saved = await aiRuntimeRepository.upsertProposal({
        runId: run.id,
        proposalKey: proposal.proposalKey,
        sourceType: proposal.sourceType,
        sourceKey: proposal.sourceKey,
        category: proposal.category,
        actionType: governance.action_type,
        priorityLevel: proposal.priorityLevel,
        riskLevel: governance.risk_level,
        title: proposal.title,
        summary: proposal.summary,
        whyText: proposal.whyText,
        recommendedAction: proposal.recommendedAction,
        expectedImpact: proposal.expectedImpact,
        evidence: proposal.evidence,
        decisionReason: governance.decision_reason,
        idempotencyKey: governance.idempotency_key,
        entityType: proposal.entityType,
        entityId: proposal.entityId,
        entityName: proposal.entityName,
        requiresApproval: proposal.requiresApproval,
        approvalPolicy: governance.approval_policy,
      });
      if (saved) savedProposals.push(saved);
    }

    const summary = {
      status: 'completed',
      generated_on: todayKey(),
      proposals_created: savedProposals.length,
      warnings: [
        insightResult.status === 'rejected'
          ? insightResult.reason?.message || 'Fallo la lectura operativa'
          : null,
        clientResult.status === 'rejected'
          ? clientResult.reason?.message || 'Fallo la lectura comercial'
          : null,
      ].filter(Boolean),
      dashboard: summarizeProposals(savedProposals),
    };

    await aiRuntimeRepository.completeRun({
      id: run.id,
      status: 'completed',
      summary,
    });

    return {
      run,
      proposals: savedProposals,
      summary,
    };
  } catch (error) {
    logger.error({ err: error }, '[ai-workspace] refresh failed');
    await aiRuntimeRepository.completeRun({
      id: run.id,
      status: 'failed',
      summary: {
        status: 'failed',
        error: error?.message || 'unknown_error',
      },
    });
    throw error;
  }
}

async function getWorkspaceDashboard({
  requestedByUsuarioId = null,
  forceRefresh = false,
} = {}) {
  try {
    await aiAutomationSyncService.reconcileRecentAiEvents({ limit: 60 });
  } catch (error) {
    logger.warn({ err: error }, '[ai-workspace] could not reconcile automation events');
  }
  await expireStaleProposals();
  const today = todayKey();
  const latestRun = await aiRuntimeRepository.findLatestRunForDay({
    objective: DAILY_OBJECTIVE,
    day: today,
  });

  const shouldRefresh =
    forceRefresh ||
    !latestRun ||
    !['completed', 'running'].includes(String(latestRun.status || '').trim().toLowerCase());

  if (shouldRefresh) {
    try {
      await refreshWorkspace({ requestedByUsuarioId });
    } catch (error) {
      logger.error({ err: error }, '[ai-workspace] dashboard refresh fallback');
    }
  }

  const proposals = await aiRuntimeRepository.listProposals({
    statuses: ['pendiente', 'en_revision', 'aprobacion_pendiente', 'aprobada'],
    limit: 40,
    recentDays: 21,
  });

  const recentRuns = await aiRuntimeRepository.listRuns({
    objective: DAILY_OBJECTIVE,
    limit: 8,
  });
  const recentExecutions = await aiRuntimeRepository.listRecentExecutions({
    limit: 8,
  });

  return {
    generated_at: new Date().toISOString(),
    automation_enabled: n8nService.isEnabled(),
    runtime_status: governanceService.buildRuntimeStatus(),
    summary: summarizeProposals(proposals),
    proposals,
    recent_runs: recentRuns,
    recent_executions: recentExecutions,
  };
}

async function updateProposalStatus({
  proposalId,
  status,
  requestedByUsuarioId = null,
  note = null,
}) {
  const allowed = new Set(['en_revision', 'descartada', 'pendiente']);
  const nextStatus = String(status || '').trim().toLowerCase();
  if (!allowed.has(nextStatus)) {
    throw new Error('Estado invalido para la propuesta');
  }

  const proposal = await aiRuntimeRepository.getProposalById(proposalId);
  if (!proposal) {
    throw new Error('Propuesta no encontrada');
  }

  if (
    nextStatus === 'descartada' &&
    proposal.approval_id &&
    String(proposal.approval_estado || '').trim().toLowerCase() === 'pendiente'
  ) {
    await approvalsRepository.updateStatus({
      id: proposal.approval_id,
      estado: 'rechazado',
      aprobado_por_usuario_id: requestedByUsuarioId,
      notas: note || 'La propuesta se descarto desde el centro operativo',
    });
  }

  return aiRuntimeRepository.updateProposalStatus({
    id: proposal.id,
    status: nextStatus,
    resolvedByUsuarioId: requestedByUsuarioId,
    resolvedNote: note,
  });
}

async function requestProposalApproval({
  proposalId,
  requestedByUsuarioId = null,
  requestedByRole = null,
}) {
  const proposal = await aiRuntimeRepository.getProposalById(proposalId);
  if (!proposal) {
    throw new Error('Propuesta no encontrada');
  }
  if (!proposal.requires_approval) {
    return {
      proposal,
      approval_id: null,
      already_pending: false,
      message: 'Esta propuesta no necesita aprobacion antes de revisarla.',
    };
  }
  if (proposal.approval_id && proposal.approval_estado === 'pendiente') {
    return {
      proposal,
      approval_id: proposal.approval_id,
      already_pending: true,
      message: 'La aprobacion ya estaba pedida.',
    };
  }

  let rule = await approvalRuleRepository.findActiveByKey(EXECUTION_RULE_KEY);
  if (!rule) {
    rule = await approvalRuleRepository.create({
      clave: EXECUTION_RULE_KEY,
      descripcion: 'Autoriza acciones sugeridas por el centro operativo de IA antes de ejecutarlas',
      condicion: { requires_manual_review: true },
      activo: true,
    });
  }

  const recentExecutionCount = await aiRuntimeRepository.countRecentExecutionsForEntity({
    entityType: proposal.entity_type,
    entityId: proposal.entity_id,
    days: aiPolicyEngineService.ENTITY_COOLDOWN_DAYS,
  });
  const policy = aiPolicyEngineService.evaluateProposalPolicy({
    proposal,
    requesterRole: requestedByRole,
    recentExecutionCount,
  });

  const approval = await approvalsRepository.createPending({
    regla_id: rule.id,
    solicitado_por_usuario_id: requestedByUsuarioId,
    entidad: 'ai_action_proposal',
    entidad_id: proposal.id,
    motivo: `Autorizar accion sugerida: ${proposal.title}`,
    payload: {
      proposal_id: proposal.id,
      category: proposal.category,
      title: proposal.title,
      summary: proposal.summary,
      recommended_action: proposal.recommended_action,
      entity_name: proposal.entity_name,
      source_key: proposal.source_key,
      policy_check: policy,
    },
  });

  const updatedProposal = await aiRuntimeRepository.attachApproval({
    id: proposal.id,
    approvalId: approval.id,
  });

  return {
    proposal: updatedProposal,
    approval_id: approval.id,
    already_pending: false,
    message: 'La solicitud se envio a aprobaciones.',
  };
}

async function buildAutomationPayload(proposal, requestedByUsuarioId = null) {
  const executionContract = await buildExecutionContract(proposal, requestedByUsuarioId);
  const recentExecutionCount = await aiRuntimeRepository.countRecentExecutionsForEntity({
    entityType: proposal.entity_type,
    entityId: proposal.entity_id,
    days: aiPolicyEngineService.ENTITY_COOLDOWN_DAYS,
  });
  const policy = aiPolicyEngineService.evaluateProposalPolicy({
    proposal,
    recentExecutionCount,
  });
  return {
    contract_version: executionContract.contract_version,
    action_type: executionContract.action_type,
    workflow_key: executionContract.workflow_key,
    business_label: executionContract.business_label,
    proposal_id: proposal.id,
    proposal_key: proposal.proposal_key,
    category: proposal.category,
    priority_level: proposal.priority_level,
    title: proposal.title,
    summary: proposal.summary,
    why_text: proposal.why_text,
    recommended_action: proposal.recommended_action,
    expected_impact: proposal.expected_impact,
    entity: {
      type: proposal.entity_type,
      id: proposal.entity_id,
      name: proposal.entity_name,
    },
    evidence: proposal.evidence || {},
    requested_at: new Date().toISOString(),
    requires_approval: Boolean(proposal.requires_approval),
    execution_contract: executionContract,
    policy_check: policy,
    idempotency_key: buildExecutionIdempotencyKey(proposal),
  };
}

async function executeApprovedProposal({
  proposalId,
  requestedByUsuarioId = null,
  requestedByRole = null,
}) {
  if (!n8nService.isEnabled() && !governanceService.isShadowModeEnabled()) {
    throw new Error('Las automatizaciones todavia no estan configuradas');
  }

  const proposal = await aiRuntimeRepository.getProposalById(proposalId);
  if (!proposal) {
    throw new Error('Propuesta no encontrada');
  }

  const currentStatus = String(proposal.effective_status || '').trim().toLowerCase();
  if (currentStatus === 'descartada') {
    throw new Error('La propuesta fue descartada y no puede ejecutarse');
  }
  if (currentStatus === 'programada' || currentStatus === 'ejecutada') {
    return {
      proposal,
      execution: await aiRuntimeRepository.getExecutionByProposalId(proposal.id),
      already_programmed: true,
      message: 'La propuesta ya fue enviada a automatizacion.',
    };
  }
  if (proposal.requires_approval && String(proposal.approval_estado || '').trim().toLowerCase() !== 'aprobado') {
    throw new Error('La propuesta necesita aprobacion antes de automatizarse');
  }

  const recentExecutionCount = await aiRuntimeRepository.countRecentExecutionsForEntity({
    entityType: proposal.entity_type,
    entityId: proposal.entity_id,
    days: aiPolicyEngineService.ENTITY_COOLDOWN_DAYS,
  });
  const policy = aiPolicyEngineService.evaluateProposalPolicy({
    proposal,
    requesterRole: requestedByRole,
    recentExecutionCount,
  });

  if (policy.requires_approval && String(proposal.approval_estado || '').trim().toLowerCase() !== 'aprobado') {
    throw new Error('La propuesta necesita aprobacion antes de automatizarse');
  }

  if (!policy.can_queue_automation) {
    const reason =
      policy.reasons[0] ||
      'La politica actual no permite enviar esta automatizacion de forma segura';
    throw new Error(reason);
  }

  const actionType = proposal.action_type || deriveActionType(proposal);
  const [executionCountLastHour, executionCountLastDay, executionCountForActionLastDay] =
    await Promise.all([
      aiRuntimeRepository.countExecutionsSince({ amount: 1, unit: 'HOUR' }),
      aiRuntimeRepository.countExecutionsSince({ amount: 1, unit: 'DAY' }),
      aiRuntimeRepository.countExecutionsSince({
        amount: 1,
        unit: 'DAY',
        actionType,
      }),
    ]);
  const operationalDecision = governanceService.assertActionExecutionAllowed({
    actionType,
    executionCountLastHour,
    executionCountLastDay,
    executionCountForActionLastDay,
  });

  const payload = await buildAutomationPayload(proposal, requestedByUsuarioId);
  payload.policy_check = policy;
  payload.operational_check = operationalDecision;
  payload.governance = {
    action_type: actionType,
    risk_level: proposal.risk_level || policy.risk_level,
    approval_policy: proposal.approval_policy || policy.approval_policy,
    operational_limits: operationalDecision.limits,
    shadow_mode: operationalDecision.shadow_mode,
  };
  const idempotencyKey = buildExecutionIdempotencyKey(proposal);

  if (operationalDecision.shadow_mode) {
    await withTransaction(async (client) => {
      await aiRuntimeRepository.createOrUpdateExecutionTx(client, {
        proposalId: proposal.id,
        status: 'shadowed',
        channel: 'shadow_mode',
        payload,
        idempotencyKey,
        result: {
          queued: false,
          shadow_mode: true,
          message: 'La accion se valido en shadow mode y no fue enviada a automatizacion.',
          policy_check: policy,
          operational_check: operationalDecision,
        },
        policySnapshot: {
          ...policy,
          operational_check: operationalDecision,
        },
        approvalSnapshot: proposal.approval_id
          ? {
              approval_id: proposal.approval_id,
              approval_status: proposal.approval_estado || null,
            }
          : null,
        outcomeStatus: 'shadowed',
        outcomeSummary: 'La accion quedo auditada en shadow mode sin side effects.',
        requestedByUsuarioId,
        executedByUsuarioId: requestedByUsuarioId,
      });
    });

    return {
      proposal: await aiRuntimeRepository.getProposalById(proposal.id),
      execution: await aiRuntimeRepository.getExecutionByProposalId(proposal.id),
      already_programmed: false,
      shadow_mode: true,
      message: 'La propuesta se valido en shadow mode y no se envio a automatizacion.',
    };
  }

  await withTransaction(async (client) => {
    const event = await automationEventRepository.enqueueTx(client, {
      eventName: 'ai_action_requested',
      aggregateType: 'ai_action_proposal',
      aggregateId: proposal.id,
      idempotencyKey,
      payload,
    });

    await aiRuntimeRepository.createOrUpdateExecutionTx(client, {
      proposalId: proposal.id,
      status: 'programada',
      channel: 'n8n',
      payload,
      idempotencyKey,
      result: {
        queued: true,
        message: 'La accion fue enviada a la cola de automatizacion.',
        policy_check: policy,
        operational_check: operationalDecision,
      },
      policySnapshot: {
        ...policy,
        operational_check: operationalDecision,
      },
      approvalSnapshot: proposal.approval_id
        ? {
            approval_id: proposal.approval_id,
            approval_status: proposal.approval_estado || null,
          }
        : null,
      outcomeStatus: 'queued',
      outcomeSummary: 'La accion quedo en cola para automatizacion segura.',
      automationEventId: event?.id || null,
      requestedByUsuarioId,
      executedByUsuarioId: requestedByUsuarioId,
    });

    await aiRuntimeRepository.updateProposalStatusTx(client, {
      id: proposal.id,
      status: 'programada',
      resolvedByUsuarioId: requestedByUsuarioId,
      resolvedNote: 'Enviada a automatizacion segura',
    });
  });

  return {
    proposal: await aiRuntimeRepository.getProposalById(proposal.id),
    execution: await aiRuntimeRepository.getExecutionByProposalId(proposal.id),
    already_programmed: false,
    message: 'La propuesta se envio a automatizacion.',
  };
}

module.exports = {
  DAILY_OBJECTIVE,
  refreshWorkspace,
  getWorkspaceDashboard,
  updateProposalStatus,
  requestProposalApproval,
  executeApprovedProposal,
  expireStaleProposals,
  buildExecutionContract,
  __test__: {
    deriveActionType,
    getFallbackStatusForExecutionFailure,
  },
};
