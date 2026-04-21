const aiRuntimeRepository = require('../db/repositories/aiRuntimeRepository');
const governanceService = require('./agentGovernanceService');

function indexByStatus(items = []) {
  const out = {};
  for (const item of items || []) {
    out[String(item.status || '').trim().toLowerCase()] = Number(item.total || 0);
  }
  return out;
}

function buildAlerts({ runtimeStatus, runScorecard, executionScorecard, recentExecutions }) {
  const thresholds = runtimeStatus.alert_thresholds || {};
  const runTotals = indexByStatus(runScorecard?.items || []);
  const executionItems = Array.isArray(executionScorecard?.items) ? executionScorecard.items : [];
  const failedExecutions = executionItems
    .filter((item) => String(item.status || '').trim().toLowerCase() === 'fallida')
    .reduce((acc, item) => acc + Number(item.total || 0), 0);
  const pendingExecutions = executionItems
    .filter((item) => ['programada', 'reintentando', 'en_proceso'].includes(String(item.status || '').trim().toLowerCase()))
    .reduce((acc, item) => acc + Number(item.total || 0), 0);

  const alerts = [];
  if (runtimeStatus.kill_switch_enabled) {
    alerts.push({
      level: 'critical',
      code: 'kill_switch_enabled',
      message: 'El agente esta frenado por kill switch global.',
    });
  }

  if (runtimeStatus.shadow_mode_enabled) {
    alerts.push({
      level: 'warning',
      code: 'shadow_mode_enabled',
      message: 'Las automatizaciones estan en shadow mode y no generan side effects reales.',
    });
  }

  if (Number(runTotals.degraded || 0) >= Number(thresholds.degraded_runs_last_24h || 0)) {
    alerts.push({
      level: 'warning',
      code: 'degraded_runs_spike',
      message: 'La cantidad de corridas degradadas supero el umbral operativo de 24 horas.',
      value: Number(runTotals.degraded || 0),
    });
  }

  if (failedExecutions >= Number(thresholds.failed_executions_last_24h || 0)) {
    alerts.push({
      level: 'critical',
      code: 'failed_executions_spike',
      message: 'La cantidad de ejecuciones fallidas supero el umbral operativo de 24 horas.',
      value: failedExecutions,
    });
  }

  if (pendingExecutions >= Number(thresholds.pending_executions_last_24h || 0)) {
    alerts.push({
      level: 'warning',
      code: 'pending_executions_backlog',
      message: 'Hay demasiadas ejecuciones pendientes o reintentando en las ultimas 24 horas.',
      value: pendingExecutions,
    });
  }

  const duplicates = (recentExecutions || []).filter(
    (item) => String(item.outcome_summary || '').toLowerCase().includes('duplic')
  );
  if (duplicates.length > 0) {
    alerts.push({
      level: 'warning',
      code: 'duplicate_execution_signal',
      message: 'Se detectaron senales recientes de duplicado en ejecuciones del agente.',
      value: duplicates.length,
    });
  }

  return alerts;
}

async function getOperationsOverview() {
  const runtimeStatus = governanceService.buildRuntimeStatus();
  const [recentRuns, recentExecutions, runScorecard, feedbackSummary, feedbackScorecard, executionScorecard] =
    await Promise.all([
      aiRuntimeRepository.listRuns({ limit: 12 }),
      aiRuntimeRepository.listRecentExecutions({ limit: 12 }),
      aiRuntimeRepository.countRunsByStatus({ hours: 24 }),
      aiRuntimeRepository.getFeedbackSummary({ days: 30 }),
      aiRuntimeRepository.getFeedbackScorecard({ days: 30 }),
      aiRuntimeRepository.getExecutionScorecard({ days: 1 }),
    ]);

  return {
    generated_at: new Date().toISOString(),
    runtime: runtimeStatus,
    alerts: buildAlerts({
      runtimeStatus,
      runScorecard,
      executionScorecard,
      recentExecutions,
    }),
    scorecards: {
      runs_24h: runScorecard,
      feedback_30d: feedbackSummary,
      feedback_by_category_30d: feedbackScorecard,
      executions_24h: executionScorecard,
    },
    recent_runs: recentRuns,
    recent_executions: recentExecutions,
  };
}

module.exports = {
  getOperationsOverview,
  __test__: {
    buildAlerts,
  },
};
