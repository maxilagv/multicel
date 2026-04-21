const { check, validationResult } = require('express-validator');
const approvals = require('../db/repositories/approvalsRepository');

async function list(req, res) {
  try {
    const { estado = 'pendiente', limit, offset } = req.query || {};
    const rows = await approvals.list({ estado, limit, offset });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener las aprobaciones' });
  }
}

const validateDecision = [
  check('notas').optional().isString().isLength({ max: 2000 }),
];

async function aprobar(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const id = Number(req.params.id);
    const notas = req.body?.notas;
    await approvals.updateStatus({ id, estado: 'aprobado', aprobado_por_usuario_id: req.user?.sub ? Number(req.user.sub) : null, notas });
    res.json({ message: 'Aprobación registrada' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo aprobar la solicitud' });
  }
}

async function rechazar(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const id = Number(req.params.id);
    const notas = req.body?.notas;
    await approvals.updateStatus({ id, estado: 'rechazado', aprobado_por_usuario_id: req.user?.sub ? Number(req.user.sub) : null, notas });
    res.json({ message: 'Solicitud rechazada' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo rechazar la solicitud' });
  }
}

module.exports = { list, aprobar: [...validateDecision, aprobar], rechazar: [...validateDecision, rechazar] };

