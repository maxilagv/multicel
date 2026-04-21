const governanceService = require('../services/agentGovernanceService');

describe('agentGovernanceService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('bloquea la ejecucion cuando el action type esta deshabilitado', () => {
    process.env.AI_AGENT_DISABLED_ACTION_TYPES = 'price_review';

    const decision = governanceService.evaluateActionExecution({
      actionType: 'price_review',
      executionCountLastHour: 0,
      executionCountLastDay: 0,
      executionCountForActionLastDay: 0,
    });

    expect(decision.can_execute).toBe(false);
    expect(decision.reasons[0]).toContain('price_review');
  });

  test('marca shadow mode cuando esta habilitado', () => {
    process.env.AI_AGENT_SHADOW_MODE = 'true';

    const decision = governanceService.evaluateActionExecution({
      actionType: 'client_reactivation',
      executionCountLastHour: 0,
      executionCountLastDay: 0,
      executionCountForActionLastDay: 0,
    });

    expect(decision.can_execute).toBe(true);
    expect(decision.shadow_mode).toBe(true);
  });
});
