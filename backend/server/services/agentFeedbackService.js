const aiRuntimeRepository = require('../db/repositories/aiRuntimeRepository');

const FEEDBACK_TYPES = [
  'run_helpful',
  'run_not_helpful',
  'proposal_correct',
  'proposal_incorrect',
  'proposal_risky',
  'proposal_useful',
];

function normalizeFeedbackType(value) {
  const type = String(value || '').trim().toLowerCase();
  return FEEDBACK_TYPES.includes(type) ? type : null;
}

async function createFeedback({
  runId = null,
  proposalId = null,
  feedbackType,
  rating = null,
  notes = null,
  createdByUsuarioId = null,
} = {}) {
  const normalizedType = normalizeFeedbackType(feedbackType);
  if (!normalizedType) {
    throw new Error('Tipo de feedback invalido para el agente.');
  }
  if (!runId && !proposalId) {
    throw new Error('El feedback del agente necesita un run o una propuesta asociada.');
  }

  return aiRuntimeRepository.createFeedback({
    proposalId,
    runId,
    feedbackType: normalizedType,
    rating,
    notes,
    createdByUsuarioId,
  });
}

async function getFeedbackSummary({ days = 30 } = {}) {
  return aiRuntimeRepository.getFeedbackSummary({ days });
}

module.exports = {
  FEEDBACK_TYPES,
  normalizeFeedbackType,
  createFeedback,
  getFeedbackSummary,
};
