const aiWorkspaceService = require('../aiWorkspaceService');
const aiRuntimeRepository = require('../../db/repositories/aiRuntimeRepository');
const { buildDatasetDescriptor } = require('../agentDatasetGovernanceService');

function buildProposalEvidence(proposal) {
  return [
    proposal?.entity_name ? { label: 'Entidad', value: proposal.entity_name, tone: 'neutral' } : null,
    proposal?.category ? { label: 'Categoria', value: proposal.category, tone: 'neutral' } : null,
    proposal?.priority_level ? { label: 'Prioridad', value: proposal.priority_level, tone: 'neutral' } : null,
  ].filter(Boolean);
}

function buildBlockedResult(message, proposal = null) {
  const evidence = buildProposalEvidence(proposal);
  return {
    title: 'Accion bloqueada',
    message,
    next_best_step: 'Revisar la propuesta y corregir las condiciones antes de volver a intentar.',
    surfaces: [
      {
        type: 'hero_summary',
        title: 'Accion bloqueada',
        status_tone: 'atencion',
        summary: message,
        why_it_matters: proposal?.title || 'La propuesta no pudo avanzar con seguridad.',
        next_step: 'Volver a prioridades y revisar el contexto.',
        range_label: 'Actual',
        freshness_label: new Date().toISOString(),
      },
      {
        type: 'evidence_block',
        items: evidence,
        range: null,
        freshness: new Date().toISOString(),
        source_label: 'Policy engine',
      },
    ],
    actions: [],
    evidence,
    meta: {
      degraded: false,
      used_fallback: false,
      datasets: ['workspace_dashboard'],
    },
  };
}

function buildActionResult({ message, proposal, execution = null }) {
  const evidence = buildProposalEvidence(proposal);
  const actions = proposal
    ? [
        {
          id: `proposal_${proposal.id}`,
          title: proposal.title,
          summary: proposal.summary || null,
          action_type: proposal.action_type || 'operational_followup_review',
          risk_level: proposal.risk_level || (proposal.requires_approval ? 'medium' : 'low'),
          requires_approval: Boolean(proposal.requires_approval),
          can_execute: false,
          status: String(proposal.effective_status || proposal.status || 'pendiente').trim().toLowerCase(),
          blocked_reasons: [],
          proposal_id: Number(proposal.id),
          recommended_intent: null,
          approval_policy: proposal.approval_policy || null,
        },
      ]
    : [];

  return {
    title: proposal?.title || 'Revision de accion',
    message,
    next_best_step: execution ? 'Seguir el estado de ejecucion en prioridades.' : 'Volver a prioridades para revisar el siguiente paso.',
    surfaces: [
      {
        type: 'approval_panel',
        proposal_id: proposal?.id || null,
        title: proposal?.title || 'Revision de accion',
        reason: proposal?.why_text || proposal?.summary || null,
        risk_level: proposal?.risk_level || (proposal?.requires_approval ? 'medium' : 'low'),
        action_type: proposal?.action_type || 'operational_followup_review',
        approval_policy: proposal?.approval_policy || null,
        expected_impact: proposal?.expected_impact || null,
        evidence,
        approval_status: proposal?.approval_estado || null,
        can_approve: Boolean(proposal?.requires_approval),
      },
      execution
        ? {
        type: 'execution_status',
        execution_id: execution.id || null,
        status: execution.status || null,
        channel: execution.channel || null,
        message: execution.result?.message || message,
        updated_at: execution.updated_at || null,
        error: execution.automation_event_error || null,
        outcome_status: execution.outcome_status || null,
        outcome_summary: execution.outcome_summary || null,
      }
        : {
            type: 'execution_status',
            execution_id: null,
            status: proposal?.effective_status || proposal?.status || null,
            channel: null,
            message,
            updated_at: new Date().toISOString(),
            error: null,
          },
    ],
    actions,
    evidence,
    meta: {
      freshness: new Date().toISOString(),
      datasets: [
        buildDatasetDescriptor('workspace_dashboard', {
          generatedAt: new Date().toISOString(),
        }),
        buildDatasetDescriptor('policy_engine', {
          generatedAt: new Date().toISOString(),
        }),
      ],
    },
  };
}

async function run({
  input = {},
  requestedByUsuarioId = null,
  requestedByRole = null,
} = {}) {
  const proposalId = Number(input?.action?.proposal_id || 0);
  const intent = String(input?.action?.intent || '').trim().toLowerCase();

  if (!Number.isFinite(proposalId) || proposalId <= 0) {
    return buildBlockedResult('No se encontro la propuesta que queres revisar.');
  }

  const currentProposal = await aiRuntimeRepository.getProposalById(proposalId);
  if (!currentProposal) {
    return buildBlockedResult('La propuesta ya no existe o no esta disponible.');
  }

  try {
    if (intent === 'request_approval') {
      const result = await aiWorkspaceService.requestProposalApproval({
        proposalId,
        requestedByUsuarioId,
        requestedByRole,
      });
      return buildActionResult({
        message: result.message,
        proposal: result.proposal,
        execution: null,
      });
    }

    if (intent === 'execute') {
      const result = await aiWorkspaceService.executeApprovedProposal({
        proposalId,
        requestedByUsuarioId,
        requestedByRole,
      });
      return buildActionResult({
        message: result.message,
        proposal: result.proposal,
        execution: result.execution,
      });
    }

    if (intent === 'discard') {
      const proposal = await aiWorkspaceService.updateProposalStatus({
        proposalId,
        status: 'descartada',
        requestedByUsuarioId,
      });
      return buildActionResult({
        message: 'La propuesta se descarto correctamente.',
        proposal,
        execution: null,
      });
    }

    if (intent === 'review') {
      const proposal = await aiWorkspaceService.updateProposalStatus({
        proposalId,
        status: 'en_revision',
        requestedByUsuarioId,
      });
      return buildActionResult({
        message: 'La propuesta quedo en revision.',
        proposal,
        execution: null,
      });
    }

    return buildActionResult({
      message: 'La propuesta ya esta lista para revision.',
      proposal: currentProposal,
      execution: await aiRuntimeRepository.getExecutionByProposalId(proposalId),
    });
  } catch (error) {
    return buildBlockedResult(error?.message || 'No se pudo procesar la accion solicitada.', currentProposal);
  }
}

module.exports = {
  run,
};
