function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getSurface(envelope, type) {
  return asArray(envelope?.surfaces).find((item) => item?.type === type) || null;
}

function envelopeToExecutiveAssistantLegacy(envelope = {}) {
  const hero = getSurface(envelope, 'hero_summary');
  const focus = getSurface(envelope, 'focus_cards');

  return {
    generated_at: envelope?.run?.completed_at || envelope?.run?.started_at || new Date().toISOString(),
    question: envelope?.response?.title || 'Resumen del negocio',
    intent: envelope?.lane?.key === 'daily_priorities' ? 'today' : 'overview',
    answer: envelope?.response?.message || '',
    range: envelope?.meta?.range || null,
    cards: asArray(focus?.items).map((item) => ({
      title: item.title,
      tone: item.tone || hero?.status_tone || 'estable',
      summary: item.summary || '',
      why_it_matters: item.why_it_matters || '',
      next_step: item.next_step || '',
      impact: item.impact || null,
    })),
    priority_actions: asArray(envelope?.actions).map((item) => ({
      id: item.proposal_id || 0,
      title: item.title,
      summary: item.summary || '',
      next_step: item.blocked_reasons?.[0] || item.summary || '',
      needs_approval: Boolean(item.requires_approval),
    })),
    evidence: asArray(envelope?.evidence).map((item) => ({
      label: item.label,
      value: item.value,
    })),
  };
}

module.exports = {
  envelopeToExecutiveAssistantLegacy,
};
