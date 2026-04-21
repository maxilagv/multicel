const { withTransaction } = require('../db/pg');
const logger = require('../lib/logger');
const automationEventRepository = require('../db/repositories/automationEventRepository');
const aiRuntimeRepository = require('../db/repositories/aiRuntimeRepository');
const { getFallbackStatusForExecutionFailure } = require('./aiActionContracts');

const TERMINAL_PROPOSAL_STATUSES = new Set(['descartada', 'vencida', 'ejecutada']);

function normalizeEventStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function buildSyncPlan({ proposal, event }) {
  const eventStatus = normalizeEventStatus(event?.status);
  const proposalStatus = String(proposal?.status || '').trim().toLowerCase();
  const preserveProposalStatus = TERMINAL_PROPOSAL_STATUSES.has(proposalStatus);
  const baseResult = {
    delivery_status: eventStatus || 'unknown',
    response_status: event?.response_status == null ? null : Number(event.response_status),
    last_error: event?.last_error || null,
    synced_at: new Date().toISOString(),
  };

  if (eventStatus === 'sent') {
    return {
      executionStatus: 'entregada',
      proposalStatus: preserveProposalStatus ? null : 'programada',
      proposalNote: preserveProposalStatus ? null : 'La accion llego correctamente al flujo de automatizacion',
      result: {
        ...baseResult,
        message: 'La accion ya fue entregada al flujo automatico',
      },
    };
  }

  if (eventStatus === 'failed') {
    return {
      executionStatus: 'fallida',
      proposalStatus: preserveProposalStatus
        ? null
        : getFallbackStatusForExecutionFailure(proposal),
      proposalNote: preserveProposalStatus
        ? null
        : 'La automatizacion fallo y la propuesta volvio a revision segura',
      result: {
        ...baseResult,
        message: 'La automatizacion no pudo enviarse y quedo para revision manual',
      },
    };
  }

  if (eventStatus === 'pending') {
    return {
      executionStatus: 'reintentando',
      proposalStatus: preserveProposalStatus ? null : 'programada',
      proposalNote: preserveProposalStatus ? null : 'La automatizacion sigue esperando un nuevo intento',
      result: {
        ...baseResult,
        message: 'La automatizacion sigue en cola y se va a reintentar',
      },
    };
  }

  if (eventStatus === 'sending') {
    return {
      executionStatus: 'en_proceso',
      proposalStatus: preserveProposalStatus ? null : 'programada',
      proposalNote: preserveProposalStatus ? null : 'La automatizacion esta intentando entregar la accion',
      result: {
        ...baseResult,
        message: 'La automatizacion esta enviando la accion',
      },
    };
  }

  return {
    executionStatus: 'programada',
    proposalStatus: null,
    proposalNote: null,
    result: {
      ...baseResult,
      message: 'La accion sigue registrada en la cola de automatizacion',
    },
  };
}

async function syncAutomationEventToAiExecution({
  automationEventId,
  event: providedEvent = null,
} = {}) {
  const event =
    providedEvent ||
    (automationEventId != null
      ? await automationEventRepository.getById(automationEventId)
      : null);

  if (!event) return null;
  if (String(event.aggregate_type || '').trim() !== 'ai_action_proposal') return null;
  if (event.aggregate_id == null) return null;

  const proposal = await aiRuntimeRepository.getProposalById(event.aggregate_id);
  if (!proposal) return null;

  const existingExecution = await aiRuntimeRepository.getExecutionByProposalId(proposal.id);
  const plan = buildSyncPlan({ proposal, event });
  const payload = existingExecution?.payload || event.payload || {};
  const mergedResult = {
    ...(existingExecution?.result || {}),
    ...(plan.result || {}),
  };

  await withTransaction(async (client) => {
    await aiRuntimeRepository.createOrUpdateExecutionTx(client, {
      proposalId: proposal.id,
      status: plan.executionStatus,
      channel: 'n8n',
      payload,
      result: mergedResult,
      idempotencyKey: existingExecution?.idempotency_key || `execution:${proposal.proposal_key || proposal.id}`,
      policySnapshot: existingExecution?.policy_snapshot || proposal.policy_snapshot || null,
      approvalSnapshot: existingExecution?.approval_snapshot || (
        proposal.approval_id
          ? {
              approval_id: proposal.approval_id,
              approval_status: proposal.approval_estado || null,
            }
          : null
      ),
      outcomeStatus: plan.executionStatus,
      outcomeSummary: plan.result?.message || null,
      automationEventId: event.id,
      requestedByUsuarioId: existingExecution?.requested_by_usuario_id || null,
      executedByUsuarioId: existingExecution?.executed_by_usuario_id || null,
    });

    if (plan.proposalStatus && plan.proposalStatus !== proposal.status) {
      await aiRuntimeRepository.updateProposalStatusTx(client, {
        id: proposal.id,
        status: plan.proposalStatus,
        resolvedByUsuarioId: null,
        resolvedNote: plan.proposalNote,
      });
    }
  });

  return {
    proposal: await aiRuntimeRepository.getProposalById(proposal.id),
    execution: await aiRuntimeRepository.getExecutionByProposalId(proposal.id),
    event,
  };
}

async function reconcileRecentAiEvents({ limit = 40 } = {}) {
  const events = await automationEventRepository.listRecent({
    limit,
    aggregateType: 'ai_action_proposal',
  });

  let synced = 0;
  for (const event of events) {
    try {
      const result = await syncAutomationEventToAiExecution({ event });
      if (result) synced += 1;
    } catch (error) {
      logger.warn(
        { err: error, automationEventId: event.id },
        '[ai-automation-sync] could not reconcile automation event'
      );
    }
  }

  return {
    reviewed: events.length,
    synced,
  };
}

module.exports = {
  syncAutomationEventToAiExecution,
  reconcileRecentAiEvents,
  __test__: {
    buildSyncPlan,
  },
};
