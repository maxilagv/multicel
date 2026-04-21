const { PRESETS } = require('./agentContracts');

function hasAny(text, parts) {
  return parts.some((part) => text.includes(part));
}

function classifyQuestion(question = '') {
  const text = String(question || '').trim().toLowerCase();
  if (!text) return null;
  if (hasAny(text, ['stock', 'reposicion', 'faltante', 'forecast', 'pronost', 'anomali', 'precio'])) {
    return 'predictive_analysis';
  }
  if (hasAny(text, ['prioridad', 'pendiente', 'aproba', 'accion', 'automatiz'])) {
    return 'daily_priorities';
  }
  if (hasAny(text, ['caja', 'ventas', 'negocio', 'cliente', 'hoy', 'resumen'])) {
    return 'executive_overview';
  }
  return 'free_question_grounded';
}

function looksLikeFollowUpQuestion(question = '') {
  const text = String(question || '').trim().toLowerCase();
  if (!text) return false;
  const normalized = text.replace(/[?¿!]/g, '').trim();
  if (!normalized) return false;

  const followUpStarts = [
    'y ',
    'y que',
    'y ahora',
    'y con',
    'entonces',
    'eso',
    'esto',
    'esa',
    'ese',
    'tambien',
    'ademas',
    'como sigo',
    'seguimos',
    'profundiza',
    'amplia',
    'mas detalle',
    'mostrame mas',
  ];
  if (followUpStarts.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }

  return (
    normalized.includes('con eso') ||
    normalized.includes('con esta') ||
    normalized.includes('con este') ||
    normalized.includes('de eso') ||
    normalized.includes('de esta') ||
    normalized.includes('de este') ||
    normalized.includes('que hago con eso') ||
    normalized.includes('que hago con esta') ||
    normalized.includes('que hago con este')
  );
}

function resolveLane({ input = {}, session = null } = {}) {
  const actionIntent = String(input?.action?.intent || '').trim().toLowerCase();
  if (actionIntent || input?.action?.proposal_id) {
    return {
      key: 'action_review',
      confidence: 1,
      reason: 'explicit_action',
      continued_from_session: false,
    };
  }

  if (input?.surface === 'priorities') {
    return {
      key: 'daily_priorities',
      confidence: 0.98,
      reason: 'surface_priorities',
      continued_from_session: false,
    };
  }

  if (input?.surface === 'analyze' || input?.context?.detail_target) {
    return {
      key: 'predictive_analysis',
      confidence: 0.98,
      reason: 'surface_analyze',
      continued_from_session: false,
    };
  }

  if (input?.surface === 'history') {
    return {
      key: 'session_history',
      confidence: 0.99,
      reason: 'surface_history',
      continued_from_session: true,
    };
  }

  if (PRESETS.includes(String(input?.preset || '').trim().toLowerCase())) {
    return {
      key: 'executive_overview',
      confidence: 0.97,
      reason: 'preset',
      continued_from_session: false,
    };
  }

  const sessionLane = String(session?.primary_lane || '').trim();
  if (
    sessionLane &&
    input?.question &&
    (!input?.surface || input?.surface === 'ask' || input?.surface === 'widget') &&
    looksLikeFollowUpQuestion(input.question) &&
    String(input.question).trim().length <= 90
  ) {
    return {
      key: sessionLane,
      confidence: 0.84,
      reason: 'session_continuity',
      continued_from_session: true,
    };
  }

  if (input?.surface === 'today') {
    return {
      key: 'executive_overview',
      confidence: 0.92,
      reason: 'surface_today',
      continued_from_session: false,
    };
  }

  if (input?.surface === 'widget' || input?.surface === 'ask') {
    return {
      key: classifyQuestion(input?.question),
      confidence: 0.78,
      reason: 'question_classification',
      continued_from_session: false,
    };
  }

  return {
    key: classifyQuestion(input?.question) || 'executive_overview',
    confidence: 0.7,
    reason: 'default_classification',
    continued_from_session: false,
  };
}

module.exports = {
  resolveLane,
  __test__: {
    classifyQuestion,
    looksLikeFollowUpQuestion,
  },
};
