const { __test__ } = require('../services/agentOperationsService');

describe('agentOperationsService', () => {
  test('emite alertas cuando hay shadow mode y picos operativos', () => {
    const alerts = __test__.buildAlerts({
      runtimeStatus: {
        kill_switch_enabled: false,
        shadow_mode_enabled: true,
        alert_thresholds: {
          degraded_runs_last_24h: 2,
          failed_executions_last_24h: 2,
          pending_executions_last_24h: 2,
        },
      },
      runScorecard: {
        items: [{ status: 'degraded', total: 3 }],
      },
      executionScorecard: {
        items: [
          { action_type: 'client_reactivation', status: 'fallida', total: 2 },
          { action_type: 'client_reactivation', status: 'programada', total: 3 },
        ],
      },
      recentExecutions: [],
    });

    expect(alerts.some((item) => item.code === 'shadow_mode_enabled')).toBe(true);
    expect(alerts.some((item) => item.code === 'degraded_runs_spike')).toBe(true);
    expect(alerts.some((item) => item.code === 'failed_executions_spike')).toBe(true);
    expect(alerts.some((item) => item.code === 'pending_executions_backlog')).toBe(true);
  });
});
