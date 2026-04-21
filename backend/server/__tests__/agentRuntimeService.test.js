const service = require('../services/agentRuntimeService');

describe('agentRuntimeService', () => {
  test('ejecuta una corrida completa y devuelve envelope uniforme', async () => {
    const addRunStep = jest.fn().mockResolvedValue(null);
    const result = await service.runAgent({
      input: {
        surface: 'today',
        preset: 'overview',
      },
      requestedByUsuarioId: 7,
      requestedByRole: 'admin',
      deps: {
        normalizeAgentInput: (input) => ({
          surface: input.surface,
          preset: input.preset,
          question: '',
          session_id: null,
          context: { range: { desde: null, hasta: null }, filters: {}, active_entity: null, detail_target: null },
          action: { intent: null, proposal_id: null, execution_id: null },
        }),
        sessionService: {
          loadOrCreateSession: jest.fn().mockResolvedValue({
            id: 11,
            session_key: 'agt_test',
            status: 'active',
            summary: {},
            current_surface: 'today',
            primary_lane: null,
            memory: [],
          }),
          recordRun: jest.fn().mockImplementation(async ({ session, laneKey }) => ({
            ...session,
            primary_lane: laneKey,
            summary: { last_lane: laneKey },
          })),
        },
        aiRuntimeRepository: {
          createRun: jest.fn().mockResolvedValue({ id: 21, status: 'running', started_at: '2026-04-20T10:00:00.000Z' }),
          addRunStep,
          completeRun: jest.fn().mockImplementation(async ({ id, status, summary }) => ({
            id,
            status,
            summary,
            started_at: '2026-04-20T10:00:00.000Z',
            completed_at: '2026-04-20T10:00:01.000Z',
          })),
        },
        laneRouterService: {
          resolveLane: jest.fn().mockReturnValue({
            key: 'executive_overview',
            confidence: 0.95,
            reason: 'preset',
            continued_from_session: false,
          }),
        },
        contextBuilderService: {
          buildContext: jest.fn().mockResolvedValue({
            range: { desde: null, hasta: null },
            filters: {},
            detail_target: null,
          }),
        },
        laneHandlers: {
          executive_overview: {
            run: jest.fn().mockResolvedValue({
              title: 'Resumen del negocio',
              message: 'La caja viene estable.',
              next_best_step: 'Seguir el foco principal.',
              surfaces: [{ type: 'hero_summary', summary: 'ok' }],
              actions: [],
              evidence: [],
              meta: { degraded: false },
            }),
          },
        },
      },
    });

    expect(result.run.id).toBe(21);
    expect(result.run.status).toBe('completed');
    expect(result.session.id).toBe('agt_test');
    expect(result.lane.key).toBe('executive_overview');
    expect(result.response.title).toBe('Resumen del negocio');
    expect(addRunStep).toHaveBeenCalledTimes(4);
  });

  test('marca la corrida como failed cuando el lane explota', async () => {
    const completeRun = jest.fn().mockResolvedValue(null);

    await expect(
      service.runAgent({
        input: {
          surface: 'today',
        },
        requestedByUsuarioId: 7,
        requestedByRole: 'admin',
        deps: {
          normalizeAgentInput: () => ({
            surface: 'today',
            preset: null,
            question: '',
            session_id: null,
            context: { range: { desde: null, hasta: null }, filters: {}, active_entity: null, detail_target: null },
            action: { intent: null, proposal_id: null, execution_id: null },
          }),
          sessionService: {
            loadOrCreateSession: jest.fn().mockResolvedValue({
              id: 11,
              session_key: 'agt_test',
              status: 'active',
              summary: {},
              memory: [],
            }),
          },
          aiRuntimeRepository: {
            createRun: jest.fn().mockResolvedValue({ id: 77, status: 'running' }),
            addRunStep: jest.fn().mockResolvedValue(null),
            completeRun,
          },
          laneRouterService: {
            resolveLane: jest.fn().mockReturnValue({
              key: 'executive_overview',
              confidence: 1,
              reason: 'default',
              continued_from_session: false,
            }),
          },
          contextBuilderService: {
            buildContext: jest.fn().mockResolvedValue({}),
          },
          laneHandlers: {
            executive_overview: {
              run: jest.fn().mockRejectedValue(new Error('lane_failed')),
            },
          },
        },
      })
    ).rejects.toThrow('lane_failed');

    expect(completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 77,
        status: 'failed',
      })
    );
  });
});
