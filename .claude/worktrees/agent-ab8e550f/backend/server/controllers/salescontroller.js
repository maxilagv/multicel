const { body, validationResult } = require('express-validator');
const repo = require('../db/repositories/salesRepository');

const validateCreate = [
  body('cliente_id').isInt({ gt: 0 }).withMessage('cliente_id requerido'),
  body('descuento').optional().isFloat({ min: 0 }),
  body('impuestos').optional().isFloat({ min: 0 }),
  body('deposito_id').optional().isInt({ gt: 0 }),
  body('items').isArray({ min: 1 }).withMessage('Debe enviar items'),
  body('items.*.producto_id').isInt({ gt: 0 }),
  body('items.*.cantidad').isInt({ gt: 0 }),
  body('items.*.precio_unitario').optional().isFloat({ gt: 0 }),
  body('es_reserva').optional().isBoolean(),
  body('caja_tipo').optional().isIn(['home_office', 'sucursal']),
  body('referido_codigo').optional().isString().isLength({ min: 4, max: 40 }).trim(),
  body('price_list_type').optional().isIn(['local', 'distribuidor', 'final']),
];

const validateCancel = [
  body('motivo').optional().isString().isLength({ max: 200 }),
];

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { cliente_id, fecha, descuento, impuestos, items, deposito_id, es_reserva, caja_tipo, price_list_type } = req.body;
    const referido_codigo = req.body?.referido_codigo;
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[ventas] create payload', { cliente_id, fecha, descuento, impuestos, items, deposito_id });
      }
    } catch {}
    const usuario_id = req.user?.sub ? Number(req.user.sub) : null;
    const r = await repo.createVenta({
      cliente_id,
      fecha,
      descuento,
      impuestos,
      items,
      deposito_id,
      es_reserva,
      usuario_id,
      referido_codigo,
      caja_tipo,
      price_list_type,
    });
    res.status(201).json(r);
  } catch (e) {
    const code = e.status || 500;
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[ventas] create error', e?.message || e);
    }
    res.status(code).json({ error: e.message || 'No se pudo crear la venta' });
  }
}

async function list(req, res) {
  try {
    const { limit, offset, cliente_id, view } = req.query || {};
    const rows = await repo.listarVentas({ limit, offset, cliente_id, view });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener las ventas' });
  }
}

async function detalle(req, res) {
  try {
    const rows = await repo.getVentaDetalle(Number(req.params.id));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el detalle de la venta' });
  }
}

async function entregar(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const info = await repo.getVentaEntregaInfo(id);
    if (!info) return res.status(404).json({ error: 'Venta no encontrada' });
    const role = req.authUser?.rol || req.user?.role || null;
    if (info.caja_tipo === 'home_office' && role !== 'admin') {
      return res.status(403).json({ error: 'Solo admin puede entregar ventas home office' });
    }
    const r = await repo.entregarVenta(id);
    res.json(r);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo marcar como entregado' });
  }
}

async function ocultar(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await repo.setOculto(id, true);
    if (!r) return res.status(404).json({ error: 'Venta no encontrada' });
    res.json({ message: 'Venta ocultada' });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo ocultar la venta' });
  }
}

async function cancelar(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invǭlido' });
    const motivo = req.body?.motivo;
    const r = await repo.cancelarVenta(id, motivo);
    res.json(r);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo cancelar la venta' });
  }
}

module.exports = {
  create: [...validateCreate, create],
  list,
  detalle,
  entregar,
  ocultar,
  cancelar: [...validateCancel, cancelar],
};
