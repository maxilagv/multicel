const INPUT_SURFACES = ['today', 'ask', 'priorities', 'analyze', 'history', 'widget'];
const PRESETS = ['overview', 'today', 'cash', 'clients', 'stock'];

function safeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSurface(value) {
  const text = String(value || '').trim().toLowerCase();
  return INPUT_SURFACES.includes(text) ? text : 'today';
}

function normalizePreset(value) {
  const text = String(value || '').trim().toLowerCase();
  return PRESETS.includes(text) ? text : null;
}

function normalizeRange(range = {}) {
  const desde = safeText(range?.desde, '') || null;
  const hasta = safeText(range?.hasta, '') || null;
  return { desde, hasta };
}

function normalizeFilters(filters) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return {};
  return filters;
}

function normalizeAction(action = {}) {
  return {
    intent: safeText(action?.intent, '') || null,
    proposal_id: safeNumber(action?.proposal_id),
    execution_id: safeNumber(action?.execution_id),
  };
}

function normalizeAgentInput(raw = {}) {
  const context = raw?.context && typeof raw.context === 'object' ? raw.context : {};
  return {
    surface: normalizeSurface(raw.surface),
    question: safeText(raw.question),
    preset: normalizePreset(raw.preset),
    session_id: safeText(raw.session_id, '') || null,
    context: {
      range: normalizeRange(context.range || { desde: raw.desde, hasta: raw.hasta }),
      filters: normalizeFilters(context.filters || raw.filters),
      active_entity:
        context.active_entity && typeof context.active_entity === 'object'
          ? context.active_entity
          : null,
      detail_target: safeText(context.detail_target || raw.detail_target, '') || null,
    },
    action: normalizeAction(raw.action),
  };
}

function summarizeFocusCards(items = [], limit = 3) {
  return (Array.isArray(items) ? items : [])
    .slice(0, limit)
    .map((item) => `- ${safeText(item.title, 'Foco')}: ${safeText(item.summary || item.why_it_matters, '')}`.trim())
    .filter(Boolean);
}

function buildChatReply(envelope = {}) {
  const response = envelope.response || {};
  const surfaces = Array.isArray(envelope.surfaces) ? envelope.surfaces : [];
  const focusSurface = surfaces.find((item) => item?.type === 'focus_cards');
  const actionList = Array.isArray(envelope.actions) ? envelope.actions : [];
  const lines = [];

  if (response.title) lines.push(`## ${response.title}`);
  if (response.message) lines.push(String(response.message).trim());

  const focusLines = summarizeFocusCards(focusSurface?.items || []);
  if (focusLines.length) {
    lines.push('');
    lines.push('### Focos');
    lines.push(...focusLines);
  }

  const nextAction = actionList.find((item) => item?.recommended_intent || item?.can_execute);
  if (nextAction) {
    lines.push('');
    lines.push('### Siguiente paso');
    lines.push(`- ${safeText(nextAction.title, 'Revisar accion')}`);
  } else if (response.next_best_step) {
    lines.push('');
    lines.push('### Siguiente paso');
    lines.push(`- ${String(response.next_best_step).trim()}`);
  }

  return lines.filter(Boolean).join('\n');
}

module.exports = {
  INPUT_SURFACES,
  PRESETS,
  normalizeAgentInput,
  normalizeRange,
  normalizeFilters,
  buildChatReply,
};
