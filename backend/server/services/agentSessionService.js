const crypto = require('crypto');
const agentSessionRepository = require('../db/repositories/agentSessionRepository');
const { normalizeSessionStatus } = require('./agentStatusMachine');

function isSessionEnabled() {
  const raw = String(process.env.AI_AGENT_SESSION_ENABLED || 'true').trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'off');
}

function buildSessionKey() {
  return `agt_${crypto.randomBytes(12).toString('hex')}`;
}

function buildInitialSummary(input = {}) {
  return {
    objective: input?.preset || input?.question || 'overview',
    last_lane: null,
    last_surface: input?.surface || 'today',
    active_range: input?.context?.range || { desde: null, hasta: null },
    active_filters: input?.context?.filters || {},
    active_entity: input?.context?.active_entity || null,
    active_detail_target: input?.context?.detail_target || null,
    short_context: '',
    recent_decisions: [],
  };
}

function buildShortContext({ input = {}, laneKey = null, laneResult = {} } = {}) {
  const base = String(laneResult?.message || '').trim();
  if (base) return base.slice(0, 280);
  if (input?.question) return String(input.question).trim().slice(0, 280);
  if (input?.preset) return `Ultimo preset consultado: ${input.preset}`;
  return '';
}

async function loadOrCreateSession({
  sessionId = null,
  requestedByUsuarioId = null,
  requestedByRole = null,
  input = {},
}) {
  if (!isSessionEnabled()) {
    return {
      id: null,
      session_key: null,
      status: 'stateless',
      primary_lane: null,
      current_objective: input?.preset || input?.question || null,
      current_surface: input?.surface || 'today',
      summary: buildInitialSummary(input),
      scope: {},
      metadata: {
        requested_by_role: requestedByRole || null,
      },
      memory: [],
      events: [],
    };
  }

  const normalizedSessionId = String(sessionId || '').trim();
  if (normalizedSessionId) {
    const existing = await agentSessionRepository.getSessionByKeyForUser({
      sessionKey: normalizedSessionId,
      usuarioId: requestedByUsuarioId,
    });
    if (existing) {
      const [memory, events] = await Promise.all([
        agentSessionRepository.listSessionMemory({ sessionId: existing.id }),
        agentSessionRepository.listSessionEvents({ sessionId: existing.id, limit: 12 }),
      ]);
      return {
        ...existing,
        memory,
        events,
        runs: await agentSessionRepository.listSessionRuns({ sessionId: existing.id, limit: 12 }),
      };
    }
  }

  const created = await agentSessionRepository.createSession({
    sessionKey: buildSessionKey(),
    usuarioId: requestedByUsuarioId,
    status: 'active',
    currentObjective: input?.preset || input?.question || 'overview',
    currentSurface: input?.surface || 'today',
    summary: buildInitialSummary(input),
    scope: {
      active_range: input?.context?.range || { desde: null, hasta: null },
      active_filters: input?.context?.filters || {},
    },
    metadata: {
      requested_by_role: requestedByRole || null,
    },
  });

  return {
    ...created,
    memory: [],
    events: [],
    runs: [],
  };
}

async function recordRun({
  session = null,
  runId = null,
  input = {},
  laneKey = null,
  laneResult = {},
}) {
  if (!session?.id) {
    return session;
  }

  const summary = {
    ...(session.summary || {}),
    objective: input?.preset || input?.question || session?.current_objective || 'overview',
    last_lane: laneKey,
    last_surface: input?.surface || session?.current_surface || 'today',
    active_range: input?.context?.range || session?.summary?.active_range || { desde: null, hasta: null },
    active_filters: input?.context?.filters || session?.summary?.active_filters || {},
    active_entity: input?.context?.active_entity || session?.summary?.active_entity || null,
    active_detail_target:
      input?.context?.detail_target || session?.summary?.active_detail_target || null,
    short_context: buildShortContext({ input, laneKey, laneResult }),
  };

  const updatedSession = await agentSessionRepository.updateSessionSnapshot({
    id: session.id,
    status: normalizeSessionStatus('active'),
    primaryLane: laneKey || session.primary_lane || null,
    currentObjective: summary.objective,
    currentSurface: summary.last_surface,
    summary,
    scope: {
      active_range: summary.active_range,
      active_filters: summary.active_filters,
    },
    metadata: {
      ...(session.metadata || {}),
      last_run_id: runId,
    },
  });

  await Promise.all([
    agentSessionRepository.appendSessionEvent({
      sessionId: session.id,
      runId,
      role: 'user',
      eventType: 'agent_input',
      input,
      output: {},
    }),
    agentSessionRepository.appendSessionEvent({
      sessionId: session.id,
      runId,
      role: 'assistant',
      eventType: 'agent_output',
      input: {},
      output: {
        title: laneResult?.title || null,
        message: laneResult?.message || null,
        lane: laneKey,
      },
    }),
    agentSessionRepository.upsertSessionMemory({
      sessionId: session.id,
      memoryKey: 'active_range',
      value: summary.active_range,
    }),
    agentSessionRepository.upsertSessionMemory({
      sessionId: session.id,
      memoryKey: 'active_filters',
      value: summary.active_filters,
    }),
    agentSessionRepository.upsertSessionMemory({
      sessionId: session.id,
      memoryKey: 'last_lane',
      value: { key: laneKey },
    }),
    agentSessionRepository.upsertSessionMemory({
      sessionId: session.id,
      memoryKey: 'active_detail_target',
      value: { value: summary.active_detail_target },
    }),
    agentSessionRepository.linkSessionRun({
      sessionId: session.id,
      runId,
      laneKey,
      surfaceKey: summary.last_surface,
      objective: summary.objective,
      status: laneResult?.meta?.degraded ? 'degraded' : 'completed',
      degraded: Boolean(laneResult?.meta?.degraded),
      datasets: Array.isArray(laneResult?.meta?.datasets) ? laneResult.meta.datasets : [],
      summary: {
        title: laneResult?.title || null,
        message: laneResult?.message || null,
      },
    }),
  ]);

  const [memory, events, runs] = await Promise.all([
    agentSessionRepository.listSessionMemory({ sessionId: session.id }),
    agentSessionRepository.listSessionEvents({ sessionId: session.id, limit: 12 }),
    agentSessionRepository.listSessionRuns({ sessionId: session.id, limit: 12 }),
  ]);

  return {
    ...updatedSession,
    memory,
    events,
    runs,
  };
}

async function getSessionSnapshot({
  sessionId,
  requestedByUsuarioId = null,
}) {
  const session = await agentSessionRepository.getSessionByKeyForUser({
    sessionKey: sessionId,
    usuarioId: requestedByUsuarioId,
  });
  if (!session) return null;
  const [memory, events, runs] = await Promise.all([
    agentSessionRepository.listSessionMemory({ sessionId: session.id }),
    agentSessionRepository.listSessionEvents({ sessionId: session.id, limit: 20 }),
    agentSessionRepository.listSessionRuns({ sessionId: session.id, limit: 20 }),
  ]);
  return {
    ...session,
    memory,
    events,
    runs,
  };
}

async function listRecentSessions({
  requestedByUsuarioId = null,
  limit = 12,
}) {
  if (!isSessionEnabled()) return [];
  return agentSessionRepository.listSessionsForUser({ usuarioId: requestedByUsuarioId, limit });
}

module.exports = {
  isSessionEnabled,
  loadOrCreateSession,
  recordRun,
  getSessionSnapshot,
  listRecentSessions,
};
