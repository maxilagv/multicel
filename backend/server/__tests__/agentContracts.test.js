const service = require('../services/agentContracts');

describe('agentContracts', () => {
  test('normaliza el input del runtime con defaults seguros', () => {
    const input = service.normalizeAgentInput({
      surface: 'ASK',
      question: '  como vamos hoy  ',
      context: {
        filters: { categoria_id: 3 },
      },
      action: {
        proposal_id: '18',
      },
    });

    expect(input.surface).toBe('ask');
    expect(input.question).toBe('como vamos hoy');
    expect(input.context.filters.categoria_id).toBe(3);
    expect(input.action.proposal_id).toBe(18);
    expect(input.action.intent).toBe(null);
  });

  test('arma una respuesta de chat legible desde el envelope del agente', () => {
    const reply = service.buildChatReply({
      response: {
        title: 'Resumen del negocio',
        message: 'La caja viene estable y hay dos prioridades abiertas.',
      },
      surfaces: [
        {
          type: 'focus_cards',
          items: [
            { title: 'Caja', summary: 'Se mantiene positiva.' },
          ],
        },
      ],
      actions: [
        {
          title: 'Revisar cobranza',
          can_execute: true,
        },
      ],
    });

    expect(reply).toMatch(/Resumen del negocio/);
    expect(reply).toMatch(/Caja/);
    expect(reply).toMatch(/Revisar cobranza/);
  });
});
