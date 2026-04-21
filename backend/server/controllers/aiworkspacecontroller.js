const workspaceService = require('../services/aiWorkspaceService');

function currentUserId(req) {
  return req?.user?.sub ? Number(req.user.sub) : null;
}

function currentUserRole(req) {
  return req?.authUser?.rol || req?.user?.role || null;
}

function isPolicyBlockedMessage(message) {
  const text = String(message || '').trim().toLowerCase();
  return (
    text.includes('horario comercial') ||
    text.includes('ventana horaria') ||
    text.includes('limite horario') ||
    text.includes('limite diario') ||
    text.includes('canal habilitado') ||
    text.includes('saturacion') ||
    text.includes('rol actual no tiene permiso') ||
    text.includes('deshabilitado por configuracion operativa')
  );
}

async function dashboard(req, res) {
  try {
    const forceRefresh =
      String(req.query.refresh || '').trim().toLowerCase() === '1' ||
      String(req.query.refresh || '').trim().toLowerCase() === 'true';

    const data = await workspaceService.getWorkspaceDashboard({
      requestedByUsuarioId: currentUserId(req),
      forceRefresh,
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'No se pudieron cargar las prioridades del negocio' });
  }
}

async function refresh(req, res) {
  try {
    const result = await workspaceService.refreshWorkspace({
      requestedByUsuarioId: currentUserId(req),
    });
    res.json({
      message: 'Analisis actualizado',
      run_id: result?.run?.id || null,
      summary: result?.summary || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo actualizar el analisis del dia' });
  }
}

async function updateProposalStatus(req, res) {
  try {
    const proposalId = Number(req.params.id);
    if (!Number.isFinite(proposalId) || proposalId <= 0) {
      return res.status(400).json({ error: 'Propuesta invalida' });
    }

    const status = req.body?.status;
    const note = req.body?.note;
    const proposal = await workspaceService.updateProposalStatus({
      proposalId,
      status,
      requestedByUsuarioId: currentUserId(req),
      note,
    });
    res.json({
      message: 'Estado actualizado',
      proposal,
    });
  } catch (error) {
    if (error?.message === 'Estado invalido para la propuesta') {
      return res.status(400).json({ error: error.message });
    }
    if (error?.message === 'Propuesta no encontrada') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'No se pudo actualizar la propuesta' });
  }
}

async function requestApproval(req, res) {
  try {
    const proposalId = Number(req.params.id);
    if (!Number.isFinite(proposalId) || proposalId <= 0) {
      return res.status(400).json({ error: 'Propuesta invalida' });
    }
    const result = await workspaceService.requestProposalApproval({
      proposalId,
      requestedByUsuarioId: currentUserId(req),
      requestedByRole: currentUserRole(req),
    });
    res.json(result);
  } catch (error) {
    if (error?.message === 'Propuesta no encontrada') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'No se pudo solicitar la aprobacion' });
  }
}

async function execute(req, res) {
  try {
    const proposalId = Number(req.params.id);
    if (!Number.isFinite(proposalId) || proposalId <= 0) {
      return res.status(400).json({ error: 'Propuesta invalida' });
    }
    const result = await workspaceService.executeApprovedProposal({
      proposalId,
      requestedByUsuarioId: currentUserId(req),
      requestedByRole: currentUserRole(req),
    });
    res.json(result);
  } catch (error) {
    if (error?.message === 'Propuesta no encontrada') {
      return res.status(404).json({ error: error.message });
    }
    if (
      error?.message === 'La propuesta necesita aprobacion antes de automatizarse' ||
      error?.message === 'La propuesta fue descartada y no puede ejecutarse' ||
      isPolicyBlockedMessage(error?.message)
    ) {
      return res.status(403).json({ error: error.message });
    }
    if (error?.message === 'Las automatizaciones todavia no estan configuradas') {
      return res.status(503).json({ error: error.message });
    }
    res.status(500).json({ error: 'No se pudo enviar la propuesta a automatizacion' });
  }
}

module.exports = {
  dashboard,
  refresh,
  updateProposalStatus,
  requestApproval,
  execute,
};
