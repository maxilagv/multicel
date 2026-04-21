const { body, validationResult } = require('express-validator');
const repo = require('../db/repositories/paymentRepository');

const validateCreate = [
  body('venta_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('cliente_id').isInt({ gt: 0 }),
  body('monto').optional().isFloat({ gt: 0 }),
  body('metodo').optional().isIn(['efectivo', 'transferencia', 'tarjeta', 'otro']),
  body('metodos').optional().isArray({ min: 1 }),
  body('metodos.*.metodo_id').optional().isInt({ gt: 0 }),
  body('metodos.*.monto').optional().isFloat({ gt: 0 }),
  body('metodos.*.moneda').optional().isString().isLength({ max: 5 }),
  body('fecha').optional().isISO8601(),
  body('fecha_limite').optional().isISO8601(),
  body().custom((_, { req }) => {
    const hasMonto = Number(req.body?.monto) > 0;
    const hasMetodos = Array.isArray(req.body?.metodos) && req.body.metodos.length > 0;
    if (!hasMonto && !hasMetodos) {
      throw new Error('monto o metodos es requerido');
    }
    return true;
  }),
];

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const r = await repo.crearPago(req.body);
    res.status(201).json(r);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo registrar el pago' });
  }
}

async function list(req, res) {
  try {
    const rows = await repo.listarPagos({
      venta_id: req.query.venta_id,
      cliente_id: req.query.cliente_id,
      limit: req.query.limit,
      offset: req.query.offset,
      include_metodos: String(req.query.include_metodos || '') === '1',
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener pagos' });
  }
}

module.exports = { create: [...validateCreate, create], list };
