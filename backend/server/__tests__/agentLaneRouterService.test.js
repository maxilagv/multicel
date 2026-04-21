const service = require('../services/agentLaneRouterService');

describe('agentLaneRouterService', () => {
  test('enruta acciones explicitas al lane de revision de acciones', () => {
    const lane = service.resolveLane({
      input: {
        action: {
          intent: 'execute',
          proposal_id: 15,
        },
      },
      session: null,
    });

    expect(lane.key).toBe('action_review');
    expect(lane.reason).toBe('explicit_action');
  });

  test('usa predictive_analysis para la surface de analisis', () => {
    const lane = service.resolveLane({
      input: {
        surface: 'analyze',
        question: '',
        context: {},
        action: {},
      },
      session: null,
    });

    expect(lane.key).toBe('predictive_analysis');
  });

  test('mantiene continuidad de sesion cuando aplica', () => {
    const lane = service.resolveLane({
      input: {
        question: 'y que hago con eso?',
        context: {},
        action: {},
      },
      session: {
        primary_lane: 'daily_priorities',
      },
    });

    expect(lane.key).toBe('daily_priorities');
    expect(lane.continued_from_session).toBe(true);
  });

  test('no secuestra una pregunta nueva por continuidad de sesion', () => {
    const lane = service.resolveLane({
      input: {
        surface: 'ask',
        question: 'como estan las metricas de mi negocio?',
        context: {},
        action: {},
      },
      session: {
        primary_lane: 'daily_priorities',
      },
    });

    expect(lane.key).toBe('executive_overview');
    expect(lane.continued_from_session).toBe(false);
  });
});
