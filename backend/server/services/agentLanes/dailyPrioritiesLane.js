const aiWorkspaceService = require('../aiWorkspaceService');
const aiPolicyEngineService = require('../aiPolicyEngineService');
const aiRuntimeRepository = require('../../db/repositories/aiRuntimeRepository');
const { buildDatasetDescriptor } = require('../agentDatasetGovernanceService');

function mapTone(priority) {
  const value = String(priority || '').trim().toLowerCase();
  if (value === 'alta') return 'urgente';
  if (value === 'media') return 'atencion';
  return 'estable';
}

function buildBlockedReasons(policy, proposal) {
  if (Array.isArray(policy?.reasons) && policy.reasons.length) return policy.reasons;
  if (proposal?.requires_approval) return ['La accion requiere aprobacion antes de ejecutarse.'];
  return [];
}

async function enrichAction(proposal, requestedByRole) {
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

  const effectiveStatus = String(proposal.effective_status || 'pendiente').trim().toLowerCase();
  const closedStatuses = new Set(['programada', 'ejecutada', 'descartada', 'vencida']);
  const canRequestApproval =
    policy.requires_approval &&
    proposal.requires_approval &&
    effectiveStatus !== 'aprobacion_pendiente' &&
    effectiveStatus !== 'aprobada' &&
    !closedStatuses.has(effectiveStatus);
  const canExecute =
    !closedStatuses.has(effectiveStatus) &&
    policy.can_queue_automation &&
    (!policy.requires_approval || effectiveStatus === 'aprobada');

  return {
    id: `proposal_${proposal.id}`,
    title: proposal.title,
    summary: proposal.summary || null,
    action_type: proposal.action_type || policy.action_type,
    risk_level: policy.risk_level,
    requires_approval: Boolean(policy.requires_approval),
    can_execute: Boolean(canExecute),
    status: effectiveStatus,
    blocked_reasons: buildBlockedReasons(policy, proposal),
    proposal_id: Number(proposal.id),
    recommended_intent: canExecute ? 'execute' : canRequestApproval ? 'request_approval' : null,
    approval_status: proposal.approval_estado || null,
    approval_policy: proposal.approval_policy || policy.approval_policy || null,
    decision_code: policy.decision_code || null,
  };
}

async function run({
  input = {},
  requestedByUsuarioId = null,
  requestedByRole = null,
} = {}) {
  const forceRefresh =
    String(input?.action?.intent || '').trim().toLowerCase() === 'refresh' ||
    String(input?.question || '').trim().toLowerCase().includes('actualiza');

  const data = await aiWorkspaceService.getWorkspaceDashboard({
    requestedByUsuarioId,
    forceRefresh,
  });

  const proposals = Array.isArray(data.proposals) ? data.proposals : [];
  const actions = await Promise.all(
    proposals.slice(0, 8).map((proposal) => enrichAction(proposal, requestedByRole))
  );

  const focusCards = proposals.slice(0, 6).map((proposal) => ({
    id: `priority_${proposal.id}`,
    title: proposal.title,
    tone: mapTone(proposal.priority_level),
    summary: proposal.summary || 'No hay resumen disponible.',
    why_it_matters: proposal.why_text || 'Conviene revisar esta prioridad con contexto.',
    next_step: proposal.recommended_action || 'Abrir detalle y decidir el siguiente paso.',
    impact: proposal.expected_impact || null,
  }));

  const evidence = [
    { label: 'Prioridades abiertas', value: String(data?.summary?.total_abiertas || 0), tone: 'neutral' },
    { label: 'Esperando aprobacion', value: String(data?.summary?.pendientes_aprobacion || 0), tone: 'neutral' },
    { label: 'En revision', value: String(data?.summary?.en_revision || 0), tone: 'neutral' },
  ];
  const datasets = [
    buildDatasetDescriptor('workspace_dashboard', {
      generatedAt: data.generated_at || null,
    }),
    buildDatasetDescriptor('policy_engine', {
      generatedAt: new Date().toISOString(),
    }),
  ];

  return {
    title: 'Prioridades del negocio',
    message: `Hay ${data?.summary?.total_abiertas || 0} prioridades abiertas para revisar hoy.`,
    next_best_step: focusCards[0]?.next_step || 'Revisar la primera prioridad abierta.',
    follow_ups: [
      { label: 'Actualizar prioridades', action_intent: 'refresh' },
      { label: 'Preguntar por una prioridad', surface: 'ask' },
    ],
    surfaces: [
      {
        type: 'hero_summary',
        title: 'Prioridades del negocio',
        status_tone: focusCards[0]?.tone || 'estable',
        summary: `Hay ${data?.summary?.total_abiertas || 0} prioridades abiertas y ${data?.summary?.pendientes_aprobacion || 0} esperando decision.`,
        why_it_matters: 'Esta vista organiza el trabajo con mayor impacto sobre ventas, caja y stock.',
        next_step: focusCards[0]?.next_step || null,
        range_label: 'Corte del dia',
        freshness_label: data.generated_at || null,
      },
      {
        type: 'focus_cards',
        items: focusCards,
      },
      {
        type: 'action_list',
        items: actions,
      },
      {
        type: 'evidence_block',
        items: evidence,
        range: null,
        freshness: data.generated_at || null,
        source_label: 'Workspace diario',
      },
    ],
    actions,
    evidence,
    meta: {
      freshness: data.generated_at || null,
      datasets,
      degraded: false,
    },
  };
}

module.exports = {
  run,
};
