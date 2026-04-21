const executiveAssistantService = require('../executiveAssistantService');
const { buildDatasetDescriptor } = require('../agentDatasetGovernanceService');

function mapTone(value) {
  const tone = String(value || '').trim().toLowerCase();
  if (tone === 'urgente' || tone === 'atencion' || tone === 'estable') return tone;
  return 'estable';
}

function mapEvidenceItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    label: item.label,
    value: item.value,
    tone: 'neutral',
  }));
}

function buildAskFollowUps(intent) {
  if (intent === 'stock') {
    return [
      { label: 'Abrir analisis', surface: 'analyze' },
      { label: 'Ver prioridades', surface: 'priorities' },
    ];
  }
  if (intent === 'today') {
    return [
      { label: 'Ver prioridades', surface: 'priorities' },
      { label: 'Volver al resumen', surface: 'today' },
    ];
  }
  return [
    { label: 'Volver al resumen', surface: 'today' },
    { label: 'Ver prioridades', surface: 'priorities' },
  ];
}

async function run({ input = {}, context = {}, requestedByUsuarioId = null } = {}) {
  const reply = await executiveAssistantService.buildExecutiveAssistantReply({
    question: input.question || '',
    preset: input.preset || '',
    rangeInput: context.range || {},
    filters: context.filters || {},
    requestedByUsuarioId,
  });

  const focusCards = (Array.isArray(reply.cards) ? reply.cards : []).map((card, index) => ({
    id: `overview_card_${index + 1}`,
    title: card.title,
    tone: mapTone(card.tone),
    summary: card.summary,
    why_it_matters: card.why_it_matters,
    next_step: card.next_step,
    impact: card.impact || null,
  }));

  const actions = (Array.isArray(reply.priority_actions) ? reply.priority_actions : []).map((item) => ({
    id: `proposal_${item.id}`,
    title: item.title,
    summary: item.summary || null,
    action_type: item.needs_approval ? 'operational_followup_review' : 'operational_followup_review',
    risk_level: item.needs_approval ? 'medium' : 'low',
    requires_approval: Boolean(item.needs_approval),
    can_execute: !item.needs_approval,
    status: item.needs_approval ? 'review' : 'pending',
    blocked_reasons: item.needs_approval ? ['La accion requiere aprobacion antes de ejecutarse.'] : [],
    proposal_id: Number(item.id),
    recommended_intent: item.needs_approval ? 'request_approval' : 'execute',
  }));

  const evidence = mapEvidenceItems(reply.evidence || []);
  const datasets = [
    buildDatasetDescriptor('executive_summary_input', {
      generatedAt: reply.generated_at || null,
    }),
    buildDatasetDescriptor('workspace_dashboard', {
      generatedAt: reply.generated_at || null,
    }),
  ];
  const isAskSurface = input?.surface === 'ask' || input?.surface === 'widget';

  if (isAskSurface) {
    const askHighlights = focusCards.slice(0, 3).map((card) => ({
      title: card.title,
      tone: card.tone,
      summary: card.summary,
      why_it_matters: card.why_it_matters,
      next_step: card.next_step,
    }));

    return {
      title: reply.question || 'Respuesta del agente',
      message: reply.answer || 'No se pudo generar una respuesta clara.',
      next_best_step: askHighlights[0]?.next_step || null,
      follow_ups: buildAskFollowUps(reply.intent),
      surfaces: [
        {
          type: 'hero_summary',
          title: reply.question || 'Respuesta del agente',
          status_tone: askHighlights[0]?.tone || 'estable',
          summary: reply.answer || '',
          why_it_matters: askHighlights[0]?.why_it_matters || '',
          next_step: askHighlights[0]?.next_step || null,
          range_label:
            reply?.range?.desde && reply?.range?.hasta
              ? `${reply.range.desde} a ${reply.range.hasta}`
              : 'Corte actual',
          freshness_label: reply.generated_at || null,
        },
        {
          type: 'ask_highlights',
          title: 'En simple',
          items: askHighlights,
        },
        {
          type: 'metric_strip',
          title: 'Metricas clave',
          items: evidence.slice(0, 4),
        },
      ],
      actions: [],
      evidence: evidence.slice(0, 4),
      meta: {
        range: reply.range || null,
        freshness: reply.generated_at || null,
        datasets,
        degraded: false,
      },
    };
  }

  return {
    title: reply.question || 'Resumen del negocio',
    message: reply.answer || 'No se pudo generar un resumen claro del negocio.',
    next_best_step: focusCards[0]?.next_step || null,
    follow_ups: [
      { label: 'Ver prioridades', surface: 'priorities' },
      { label: 'Abrir analisis', surface: 'analyze' },
    ],
    surfaces: [
      {
        type: 'hero_summary',
        title: reply.question || 'Resumen del negocio',
        status_tone: focusCards[0]?.tone || 'estable',
        summary: reply.answer || '',
        why_it_matters: focusCards[0]?.why_it_matters || '',
        next_step: focusCards[0]?.next_step || null,
        range_label: reply?.range?.desde && reply?.range?.hasta ? `${reply.range.desde} a ${reply.range.hasta}` : 'Corte actual',
        freshness_label: reply.generated_at || null,
      },
      {
        type: 'focus_cards',
        items: focusCards,
      },
      {
        type: 'action_list',
        items: actions,
      },
      {
        type: 'evidence_block',
        items: evidence,
        range: reply.range || null,
        freshness: reply.generated_at || null,
        source_label: 'Resumen ejecutivo',
      },
    ],
    actions,
    evidence,
    meta: {
      range: reply.range || null,
      freshness: reply.generated_at || null,
      datasets,
      degraded: false,
    },
  };
}

module.exports = {
  run,
};
