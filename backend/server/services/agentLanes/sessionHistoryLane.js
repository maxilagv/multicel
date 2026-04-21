const agentSessionRepository = require('../../db/repositories/agentSessionRepository');
const { buildDatasetDescriptor } = require('../agentDatasetGovernanceService');

function summarizeHistoryRuns(runs = []) {
  return runs.slice(0, 8).map((item) => ({
    id: `history_run_${item.run_id}`,
    title: item.summary?.title || item.objective || 'Corrida del agente',
    tone: item.degraded ? 'atencion' : item.status === 'failed' ? 'urgente' : 'estable',
    summary: `${item.lane_key || 'lane'} • ${item.surface_key || 'surface'} • ${item.status || 'completed'}`,
    why_it_matters: item.degraded
      ? 'Esta corrida uso un fallback o tuvo datos parciales.'
      : 'Sirve para retomar contexto y entender decisiones recientes.',
    next_step: 'Abrir el detalle o retomar la conversacion desde esta misma sesion.',
    run_id: item.run_id,
  }));
}

async function run({ session = null, requestedByUsuarioId = null } = {}) {
  const sessionRuns = session?.id
    ? await agentSessionRepository.listSessionRuns({ sessionId: session.id, limit: 12 })
    : [];
  const recentSessions = requestedByUsuarioId
    ? await agentSessionRepository.listSessionsForUser({ usuarioId: requestedByUsuarioId, limit: 8 })
    : [];

  const evidence = [
    { label: 'Corridas en esta sesion', value: String(sessionRuns.length), tone: 'neutral' },
    { label: 'Sesiones recientes', value: String(recentSessions.length), tone: 'neutral' },
  ];

  return {
    title: 'Historial del agente',
    message: sessionRuns.length
      ? 'Aca tenes el rastro reciente del agente para retomar contexto sin perder trazabilidad.'
      : 'Todavia no hay corridas suficientes en esta sesion. Usa Hoy, Preguntar o Prioridades y despues volve aca.',
    next_best_step: sessionRuns.length ? 'Revisar la corrida mas reciente o retomar una pregunta.' : 'Volver al resumen principal.',
    follow_ups: [
      { label: 'Volver al resumen', surface: 'today' },
      { label: 'Preguntar algo', surface: 'ask' },
    ],
    surfaces: [
      {
        type: 'hero_summary',
        title: 'Historial del agente',
        status_tone: sessionRuns.some((item) => item.degraded) ? 'atencion' : 'estable',
        summary: sessionRuns.length
          ? `Esta sesion acumula ${sessionRuns.length} corridas trazables.`
          : 'Todavia no hay trazabilidad suficiente en esta sesion.',
        why_it_matters: 'El historial permite entender que vio el agente, que sugirio y con que estado termino.',
        next_step: sessionRuns.length ? 'Revisar la ultima corrida o retomar una decision pendiente.' : 'Generar una primera corrida del agente.',
        range_label: 'Sesiones recientes',
        freshness_label: new Date().toISOString(),
      },
      {
        type: 'session_history',
        current_session_id: session?.session_key || null,
        runs: sessionRuns,
        recent_sessions: recentSessions,
      },
      {
        type: 'focus_cards',
        items: summarizeHistoryRuns(sessionRuns),
      },
      {
        type: 'evidence_block',
        items: evidence,
        range: null,
        freshness: new Date().toISOString(),
        source_label: 'Runtime del agente',
      },
    ],
    actions: [],
    evidence,
    meta: {
      degraded: false,
      datasets: [
        buildDatasetDescriptor('session_history', {
          generatedAt: new Date().toISOString(),
        }),
      ],
      freshness: new Date().toISOString(),
    },
  };
}

module.exports = {
  run,
};
