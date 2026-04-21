const agentRuntimeService = require('./agentRuntimeService');
const agentFeedbackService = require('./agentFeedbackService');

const REPLAY_CASES = [
  {
    id: 'overview_today',
    label: 'Resumen general del negocio',
    input: { surface: 'today', preset: 'overview' },
    expects: { lane: 'executive_overview', minEvidence: 1 },
  },
  {
    id: 'priorities_today',
    label: 'Prioridades operativas',
    input: { surface: 'priorities' },
    expects: { lane: 'daily_priorities', minActions: 0 },
  },
  {
    id: 'analysis_stock',
    label: 'Analisis de stock y forecast',
    input: { surface: 'analyze' },
    expects: { lane: 'predictive_analysis', minEvidence: 1 },
  },
];

function scoreReplay(caseDef, envelope) {
  const evidenceCount = Array.isArray(envelope?.evidence) ? envelope.evidence.length : 0;
  const actionCount = Array.isArray(envelope?.actions) ? envelope.actions.length : 0;
  const laneOk = String(envelope?.lane?.key || '') === String(caseDef?.expects?.lane || '');
  const evidenceOk =
    caseDef?.expects?.minEvidence == null || evidenceCount >= Number(caseDef.expects.minEvidence);
  const actionsOk =
    caseDef?.expects?.minActions == null || actionCount >= Number(caseDef.expects.minActions);

  return {
    lane_ok: laneOk,
    evidence_ok: evidenceOk,
    actions_ok: actionsOk,
    score: [laneOk, evidenceOk, actionsOk].filter(Boolean).length / 3,
    evidence_count: evidenceCount,
    action_count: actionCount,
  };
}

async function runReplaySuite({
  requestedByUsuarioId = null,
  requestedByRole = 'admin',
} = {}) {
  const results = [];
  for (const caseDef of REPLAY_CASES) {
    const envelope = await agentRuntimeService.runAgent({
      input: caseDef.input,
      requestedByUsuarioId,
      requestedByRole,
    });
    results.push({
      id: caseDef.id,
      label: caseDef.label,
      lane: envelope?.lane?.key || null,
      run_id: envelope?.run?.id || null,
      degraded: Boolean(envelope?.meta?.degraded),
      datasets: envelope?.meta?.datasets || [],
      score: scoreReplay(caseDef, envelope),
    });
  }

  const avgScore =
    results.reduce((acc, item) => acc + Number(item.score?.score || 0), 0) /
    Math.max(results.length, 1);
  const feedback = await agentFeedbackService.getFeedbackSummary({ days: 30 }).catch(() => null);

  return {
    generated_at: new Date().toISOString(),
    total_cases: results.length,
    average_score: Number(avgScore.toFixed(4)),
    results,
    feedback_summary: feedback,
  };
}

module.exports = {
  REPLAY_CASES,
  runReplaySuite,
  __test__: {
    scoreReplay,
  },
};
