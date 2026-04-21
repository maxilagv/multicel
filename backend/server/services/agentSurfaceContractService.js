const { summarizeDatasets } = require('./agentDatasetGovernanceService');

function normalizeSurface(surface = {}, index = 0) {
  const type = String(surface?.type || '').trim() || `surface_${index + 1}`;
  return {
    id: surface.id || `${type}_${index + 1}`,
    ...surface,
    type,
  };
}

function buildEnvelope({
  input = {},
  run = null,
  session = null,
  lane = {},
  laneResult = {},
} = {}) {
  const normalizedRun = {
    id: run?.id || null,
    status: run?.status || 'completed',
    degraded: Boolean(laneResult?.meta?.degraded),
    started_at: run?.started_at || null,
    completed_at: run?.completed_at || null,
  };
  const datasets = Array.isArray(laneResult?.meta?.datasets) ? laneResult.meta.datasets : [];

  return {
    run: normalizedRun,
    session: {
      id: session?.session_key || null,
      status: session?.status || 'stateless',
      primary_lane: session?.primary_lane || lane?.key || null,
      current_surface: input?.surface || session?.current_surface || 'today',
      summary: session?.summary || {},
      runs: Array.isArray(session?.runs) ? session.runs : [],
    },
    lane: {
      key: lane?.key || null,
      confidence: lane?.confidence || 0,
      reason: lane?.reason || null,
      continued_from_session: Boolean(lane?.continued_from_session),
    },
    response: {
      title: laneResult?.title || 'Agente del negocio',
      message: laneResult?.message || '',
      next_best_step: laneResult?.next_best_step || null,
      follow_ups: Array.isArray(laneResult?.follow_ups) ? laneResult.follow_ups : [],
    },
    surfaces: (Array.isArray(laneResult?.surfaces) ? laneResult.surfaces : []).map(normalizeSurface),
    actions: Array.isArray(laneResult?.actions) ? laneResult.actions : [],
    evidence: Array.isArray(laneResult?.evidence) ? laneResult.evidence : [],
    meta: {
      requires_clarification: Boolean(laneResult?.meta?.requires_clarification),
      degraded: Boolean(laneResult?.meta?.degraded),
      used_fallback: Boolean(laneResult?.meta?.used_fallback),
      degradation_reason: laneResult?.meta?.degradation_reason || null,
      range: laneResult?.meta?.range || input?.context?.range || null,
      freshness: laneResult?.meta?.freshness || null,
      datasets,
      data_quality: summarizeDatasets(datasets),
    },
  };
}

module.exports = {
  buildEnvelope,
};
