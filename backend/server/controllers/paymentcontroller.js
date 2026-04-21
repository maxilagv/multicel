const { body, validationResult } = require('express-validator');
const repo = require('../db/repositories/paymentRepository');
const { query } = require('../db/pg');
const { buildDepositoVisibility, resolveScopedDepositoId } = require('../lib/depositoScope');
const { filterVisibleClientIds } = require('../lib/clientVisibility');
const { buildSaleVisibility } = require('../lib/saleVisibility');

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
    const clienteId = Number(req.body?.cliente_id || 0);
    if (Number.isInteger(clienteId) && clienteId > 0) {
      const visibleClients = await filterVisibleClientIds(req, [clienteId]);
      if (!visibleClients.length) {
        return res.status(403).json({
          error: 'No tienes permisos para registrar pagos sobre este cliente',
          code: 'CLIENT_FORBIDDEN',
        });
      }
    }

    const visibility = await buildDepositoVisibility(req);
    if (visibility.mode === 'restricted') {
      const ventaId = Number(req.body?.venta_id || 0);
      if (!Number.isInteger(ventaId) || ventaId <= 0) {
        return res.status(403).json({
          error: 'Los pagos fuera de una venta no estan habilitados para esta sucursal',
          code: 'DEPOSITO_FORBIDDEN',
        });
      }
      const { rows } = await query(
        `SELECT v.deposito_id,
                v.usuario_id,
                v.vendedor_perfil_id,
                vp.usuario_id AS vendedor_usuario_id
           FROM ventas v
      LEFT JOIN vendedor_perfiles vp ON vp.id = v.vendedor_perfil_id
          WHERE v.id = $1`,
        [ventaId]
      );
      if (!rows.length) {
        return res.status(404).json({ error: 'Venta no encontrada' });
      }
      const sale = rows[0];
      const saleVisibility = await buildSaleVisibility(req);
      if (
        saleVisibility.mode === 'owner' &&
        Number(sale.usuario_id || 0) !== Number(saleVisibility.userId || 0) &&
        Number(sale.vendedor_usuario_id || 0) !== Number(saleVisibility.userId || 0)
      ) {
        return res.status(403).json({
          error: 'No tienes permisos para registrar pagos sobre esta venta',
          code: 'SALE_FORBIDDEN',
        });
      }
      if (
        saleVisibility.mode === 'deposit' &&
        !saleVisibility.depositIds.includes(Number(sale.deposito_id || 0))
      ) {
        return res.status(403).json({
          error: 'No tienes permisos para registrar pagos sobre esta venta',
          code: 'DEPOSITO_FORBIDDEN',
        });
      }
    }
    const r = await repo.crearPago(req.body);
    res.status(201).json(r);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo registrar el pago' });
  }
}

async function list(req, res) {
  try {
    const depositoId = await resolveScopedDepositoId(req, req.query?.deposito_id, {
      preferSingle: false,
    });
    const rows = await repo.listarPagos({
      venta_id: req.query.venta_id,
      cliente_id: req.query.cliente_id,
      deposito_id: depositoId,
      limit: req.query.limit,
      offset: req.query.offset,
      include_metodos: String(req.query.include_metodos || '') === '1',
    });
    res.json(rows);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudieron obtener pagos' });
  }
}

module.exports = { create: [...validateCreate, create], list };
