const service = require('../services/aiPolicyEngineService');

describe('aiPolicyEngineService', () => {
  test('bloquea reactivacion automatica sin canal disponible', () => {
    const result = service.evaluateProposalPolicy({
      proposal: {
        source_key: 'cliente:18',
        category: 'ventas',
        evidence: {
          whatsapp_opt_in: false,
          email: null,
          lead_score: 40,
        },
      },
      requesterRole: 'admin',
      recentExecutionCount: 0,
      now: new Date('2026-04-16T14:00:00.000Z'),
    });

    expect(result.can_queue_automation).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/canal/i);
  });

  test('mantiene aprobacion obligatoria para revision de precios', () => {
    const result = service.evaluateProposalPolicy({
      proposal: {
        category: 'rentabilidad',
        requires_approval: true,
      },
      requesterRole: 'admin',
      recentExecutionCount: 0,
      now: new Date('2026-04-16T14:00:00.000Z'),
    });

    expect(result.action_type).toBe('price_review_workflow');
    expect(result.requires_approval).toBe(true);
    expect(result.risk_level).toBe('high');
  });

  test('bloquea automatizacion por saturacion reciente de la misma entidad', () => {
    const result = service.evaluateProposalPolicy({
      proposal: {
        source_key: 'cliente:22',
        category: 'ventas',
        evidence: {
          whatsapp_opt_in: true,
          email: 'cliente@example.com',
        },
      },
      requesterRole: 'admin',
      recentExecutionCount: service.MAX_AUTOMATIONS_PER_ENTITY,
      now: new Date('2026-04-16T14:00:00.000Z'),
    });

    expect(result.can_queue_automation).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/saturacion/i);
  });
});
