const logger = require('../lib/logger');
const aiRuntimeRepository = require('../db/repositories/aiRuntimeRepository');
const agentSessionService = require('./agentSessionService');
const laneRouterService = require('./agentLaneRouterService');
const contextBuilderService = require('./agentContextBuilderService');
const surfaceContractService = require('./agentSurfaceContractService');
const { normalizeAgentInput } = require('./agentContracts');
const governanceService = require('./agentGovernanceService');
const executiveOverviewLane = require('./agentLanes/executiveOverviewLane');
const dailyPrioritiesLane = require('./agentLanes/dailyPrioritiesLane');
const predictiveAnalysisLane = require('./agentLanes/predictiveAnalysisLane');
const actionReviewLane = require('./agentLanes/actionReviewLane');
const freeQuestionGroundedLane = require('./agentLanes/freeQuestionGroundedLane');
const sessionHistoryLane = require('./agentLanes/sessionHistoryLane');

const DEFAULT_AGENT_VERSION = '2026-04-20.1';

function isRuntimeEnabled() {
  const raw = String(process.env.AI_AGENT_RUNTIME_ENABLED || 'true').trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'off');
}

function buildObjective(input, laneKey) {
  if (input?.action?.intent) return `action:${input.action.intent}`;
  if (input?.preset) return `preset:${input.preset}`;
  if (input?.question) return input.question.slice(0, 120);
  return laneKey || 'agent_runtime';
}

function buildRunSummary(laneKey, laneResult) {
  return {
    lane: laneKey,
    title: laneResult?.title || null,
    degraded: Boolean(laneResult?.meta?.degraded),
    surfaces: Array.isArray(laneResult?.surfaces) ? laneResult.surfaces.length : 0,
    actions: Array.isArray(laneResult?.actions) ? laneResult.actions.length : 0,
  };
}

function getDefaultLaneHandlers() {
  return {
    executive_overview: executiveOverviewLane,
    daily_priorities: dailyPrioritiesLane,
    predictive_analysis: predictiveAnalysisLane,
    action_review: actionReviewLane,
    free_question_grounded: freeQuestionGroundedLane,
    session_history: sessionHistoryLane,
  };
}

function resolveDeps(overrides = {}) {
  return {
    aiRuntimeRepository: overrides.aiRuntimeRepository || aiRuntimeRepository,
    sessionService: overrides.sessionService || agentSessionService,
    laneRouterService: overrides.laneRouterService || laneRouterService,
    contextBuilderService: overrides.contextBuilderService || contextBuilderService,
    surfaceContractService: overrides.surfaceContractService || surfaceContractService,
    normalizeAgentInput: overrides.normalizeAgentInput || normalizeAgentInput,
    laneHandlers: overrides.laneHandlers || getDefaultLaneHandlers(),
    governanceService: overrides.governanceService || governanceService,
  };
}

async function runAgent({
  input: rawInput = {},
  requestedByUsuarioId = null,
  requestedByRole = null,
  deps = {},
} = {}) {
  if (!isRuntimeEnabled()) {
    throw new Error('El runtime del agente esta deshabilitado por configuracion.');
  }

  const {
    aiRuntimeRepository: runRepo,
    sessionService,
    laneRouterService,
    contextBuilderService,
    surfaceContractService,
    normalizeAgentInput,
    laneHandlers,
    governanceService,
  } = resolveDeps(deps);

  governanceService.assertRuntimeAccess();
  const input = normalizeAgentInput(rawInput);
  const session = await sessionService.loadOrCreateSession({
    sessionId: input.session_id,
    requestedByUsuarioId,
    requestedByRole,
    input,
  });

  let run = null;
  let lane = null;

  try {
    lane = laneRouterService.resolveLane({ input, session });
    governanceService.assertRuntimeAccess({ laneKey: lane.key });
    run = await runRepo.createRun({
      agent: 'business_agent_runtime',
      agentVersion: DEFAULT_AGENT_VERSION,
      objective: buildObjective(input, lane.key),
      status: 'running',
      requestedByUsuarioId,
      scope: {
        lane: lane.key,
        surface: input.surface,
        session_id: session?.session_key || null,
      },
      summary: {
        status: 'running',
      },
    });

    await runRepo.addRunStep({
      runId: run.id,
      stepOrder: 1,
      stepKey: 'governance_checked',
      title: 'Gobierno del runtime validado',
      status: 'ok',
      details: governanceService.buildRuntimeStatus(),
    });

    await runRepo.addRunStep({
      runId: run.id,
      stepOrder: 2,
      stepKey: 'lane_selected',
      title: `Lane seleccionado: ${lane.key}`,
      status: 'ok',
      details: lane,
    });

    const context = await contextBuilderService.buildContext({ input, session });
    await runRepo.addRunStep({
      runId: run.id,
      stepOrder: 3,
      stepKey: 'context_built',
      title: 'Contexto del agente preparado',
      status: 'ok',
      details: {
        has_range: Boolean(context?.range?.desde || context?.range?.hasta),
        has_filters: Object.keys(context?.filters || {}).length > 0,
        detail_target: context?.detail_target || null,
      },
    });

    const handler = laneHandlers[lane.key];
    if (!handler || typeof handler.run !== 'function') {
      throw new Error(`No existe un handler registrado para el lane "${lane.key}"`);
    }

    const laneResult = await handler.run({
      input,
      context,
      session,
      requestedByUsuarioId,
      requestedByRole,
    });

    await runRepo.addRunStep({
      runId: run.id,
      stepOrder: 4,
      stepKey: 'lane_completed',
      title: `Lane completado: ${lane.key}`,
      status: laneResult?.meta?.degraded ? 'warning' : 'ok',
      details: buildRunSummary(lane.key, laneResult),
    });

    const completedStatus = laneResult?.meta?.degraded ? 'degraded' : 'completed';
    const completedRun = await runRepo.completeRun({
      id: run.id,
      status: completedStatus,
      summary: buildRunSummary(lane.key, laneResult),
    });

    const updatedSession = await sessionService.recordRun({
      session,
      runId: completedRun.id,
      input,
      laneKey: lane.key,
      laneResult,
    });

    return surfaceContractService.buildEnvelope({
      input,
      run: completedRun,
      session: updatedSession,
      lane,
      laneResult,
    });
  } catch (error) {
    if (run?.id) {
      try {
        await runRepo.completeRun({
          id: run.id,
          status: 'failed',
          summary: {
            lane: lane?.key || null,
            error: error?.message || 'runtime_error',
          },
        });
      } catch (completeError) {
        logger.error({ err: completeError }, '[agent-runtime] failed to complete failed run');
      }
    }
    throw error;
  }
}

async function getSessionSnapshot({
  sessionId,
  requestedByUsuarioId = null,
  deps = {},
} = {}) {
  const { sessionService } = resolveDeps(deps);
  return sessionService.getSessionSnapshot({ sessionId, requestedByUsuarioId });
}

async function getRunById({ runId, deps = {} } = {}) {
  const { aiRuntimeRepository: runRepo } = resolveDeps(deps);
  return runRepo.getRunById(runId);
}

async function listRecentSessions({
  requestedByUsuarioId = null,
  limit = 12,
  deps = {},
} = {}) {
  const { sessionService } = resolveDeps(deps);
  return sessionService.listRecentSessions({ requestedByUsuarioId, limit });
}

module.exports = {
  isRuntimeEnabled,
  runAgent,
  getSessionSnapshot,
  getRunById,
  listRecentSessions,
};
