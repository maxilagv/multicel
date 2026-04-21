const agentRuntimeService = require('../services/agentRuntimeService');
const agentFeedbackService = require('../services/agentFeedbackService');
const agentEvaluationService = require('../services/agentEvaluationService');
const governanceService = require('../services/agentGovernanceService');
const agentOperationsService = require('../services/agentOperationsService');

function currentUserId(req) {
  return req?.user?.sub ? Number(req.user.sub) : null;
}

function currentUserRole(req) {
  return req?.authUser?.rol || req?.user?.role || null;
}

async function runAgent(req, res) {
  try {
    const result = await agentRuntimeService.runAgent({
      input: req.body || {},
      requestedByUsuarioId: currentUserId(req),
      requestedByRole: currentUserRole(req),
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'No se pudo ejecutar el agente.' });
  }
}

async function getSession(req, res) {
  try {
    const snapshot = await agentRuntimeService.getSessionSnapshot({
      sessionId: req.params.id,
      requestedByUsuarioId: currentUserId(req),
    });
    if (!snapshot) {
      return res.status(404).json({ error: 'Sesion no encontrada' });
    }
    return res.json(snapshot);
  } catch (error) {
    return res.status(500).json({ error: 'No se pudo cargar la sesion del agente.' });
  }
}

async function continueSession(req, res) {
  try {
    const result = await agentRuntimeService.runAgent({
      input: {
        ...(req.body || {}),
        session_id: req.params.id,
      },
      requestedByUsuarioId: currentUserId(req),
      requestedByRole: currentUserRole(req),
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'No se pudo continuar la sesion.' });
  }
}

async function listSessions(req, res) {
  try {
    const sessions = await agentRuntimeService.listRecentSessions({
      requestedByUsuarioId: currentUserId(req),
      limit: Number(req.query?.limit || 12),
    });
    return res.json({ items: sessions });
  } catch (error) {
    return res.status(500).json({ error: 'No se pudo listar el historial del agente.' });
  }
}

async function getRun(req, res) {
  try {
    const runId = Number(req.params.id);
    if (!Number.isFinite(runId) || runId <= 0) {
      return res.status(400).json({ error: 'Run invalido' });
    }
    const run = await agentRuntimeService.getRunById({ runId });
    if (!run) {
      return res.status(404).json({ error: 'Run no encontrado' });
    }
    return res.json(run);
  } catch (error) {
    return res.status(500).json({ error: 'No se pudo cargar la corrida.' });
  }
}

async function createFeedback(req, res) {
  try {
    const feedback = await agentFeedbackService.createFeedback({
      runId: req.body?.run_id == null ? null : Number(req.body.run_id),
      proposalId: req.body?.proposal_id == null ? null : Number(req.body.proposal_id),
      feedbackType: req.body?.feedback_type,
      rating: req.body?.rating == null ? null : Number(req.body.rating),
      notes: req.body?.notes || null,
      createdByUsuarioId: currentUserId(req),
    });
    return res.status(201).json(feedback);
  } catch (error) {
    return res.status(400).json({ error: error?.message || 'No se pudo registrar el feedback del agente.' });
  }
}

async function replayEvaluation(req, res) {
  try {
    const result = await agentEvaluationService.runReplaySuite({
      requestedByUsuarioId: currentUserId(req),
      requestedByRole: currentUserRole(req),
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'No se pudo correr la replay suite del agente.' });
  }
}

async function getStatus(req, res) {
  return res.json(governanceService.buildRuntimeStatus());
}

async function getOperationsOverview(req, res) {
  try {
    const result = await agentOperationsService.getOperationsOverview();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: 'No se pudo cargar el overview operativo del agente.' });
  }
}

module.exports = {
  runAgent,
  listSessions,
  getSession,
  continueSession,
  getRun,
  createFeedback,
  replayEvaluation,
  getStatus,
  getOperationsOverview,
};
