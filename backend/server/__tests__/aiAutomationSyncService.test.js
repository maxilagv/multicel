const service = require('../services/aiAutomationSyncService');

describe('aiAutomationSyncService', () => {
  test('marca como entregada cuando el evento fue enviado al flujo', () => {
    const plan = service.__test__.buildSyncPlan({
      proposal: {
        status: 'programada',
        requires_approval: true,
        approval_estado: 'aprobado',
      },
      event: {
        status: 'sent',
        response_status: 200,
      },
    });

    expect(plan.executionStatus).toBe('entregada');
    expect(plan.proposalStatus).toBe('programada');
    expect(plan.result.message).toMatch(/entregada/i);
  });

  test('devuelve a pendiente una propuesta aprobada si el envio falla', () => {
    const plan = service.__test__.buildSyncPlan({
      proposal: {
        status: 'programada',
        requires_approval: true,
        approval_estado: 'aprobado',
      },
      event: {
        status: 'failed',
        last_error: 'Webhook caido',
      },
    });

    expect(plan.executionStatus).toBe('fallida');
    expect(plan.proposalStatus).toBe('pendiente');
    expect(plan.result.last_error).toBe('Webhook caido');
  });

  test('manda a revision cuando falla una propuesta sin aprobacion final', () => {
    const plan = service.__test__.buildSyncPlan({
      proposal: {
        status: 'programada',
        requires_approval: false,
      },
      event: {
        status: 'failed',
      },
    });

    expect(plan.proposalStatus).toBe('en_revision');
  });

  test('no reabre una propuesta descartada aunque llegue una actualizacion del outbox', () => {
    const plan = service.__test__.buildSyncPlan({
      proposal: {
        status: 'descartada',
        requires_approval: false,
      },
      event: {
        status: 'failed',
      },
    });

    expect(plan.proposalStatus).toBeNull();
    expect(plan.executionStatus).toBe('fallida');
  });
});
