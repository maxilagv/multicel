const { check, validationResult } = require('express-validator');
const repo = require('../db/repositories/ticketRepository');

async function list(req, res) {
  try {
    const { q, estado, prioridad, cliente_id, limit, offset } = req.query || {};
    const rows = await repo.list({ q, estado, prioridad, cliente_id, limit, offset });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener los tickets' });
  }
}

const validateTicket = [
  check('asunto').trim().notEmpty().withMessage('asunto requerido'),
  check('cliente_id').optional().isInt({ gt: 0 }),
  check('estado').optional().isIn(['abierto','en_progreso','resuelto','cerrado']),
  check('prioridad').optional().isIn(['baja','media','alta','critica']),
  check('tipo').optional().isIn(['reclamo','garantia','devolucion','soporte']),
  check('asignado_a_usuario_id').optional().isInt({ gt: 0 }),
  check('venta_id').optional().isInt({ gt: 0 }),
];

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const r = await repo.create(req.body);
    res.status(201).json({ id: r.id });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear el ticket' });
  }
}

async function update(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const r = await repo.update(Number(req.params.id), req.body);
    if (!r) return res.status(404).json({ error: 'Ticket no encontrado' });
    res.json({ message: 'Ticket actualizado' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar el ticket' });
  }
}

async function listEventos(req, res) {
  try {
    const { id } = req.params;
    const rows = await repo.listEvents(Number(id));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el historial del ticket' });
  }
}

const validateEvento = [
  check('tipo').isIn(['comentario','cambio_estado','asignacion','adjunto']).withMessage('tipo invÃ¡lido'),
  check('detalle').optional().isString(),
  check('usuario_id').optional().isInt({ gt: 0 }),
];

async function crearEvento(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const r = await repo.addEvent({ ticket_id: Number(req.params.id), usuario_id: req.body.usuario_id || (req.user?.sub ? Number(req.user.sub) : null), tipo: req.body.tipo, detalle: req.body.detalle });
    res.status(201).json({ id: r.id });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo registrar el evento' });
  }
}

module.exports = {
  list,
  create: [...validateTicket, create],
  update: [...validateTicket, update],
  listEventos,
  crearEvento: [...validateEvento, crearEvento],
};

