const { body, validationResult } = require('express-validator');
const repo = require('../db/repositories/purchaseRepository');
const audit = require('../services/auditService');

const validateCreate = [
  body('proveedor_id').isInt({ gt: 0 }).withMessage('proveedor_id requerido'),
  body('moneda').optional().isIn(['ARS','USD','CNY']).withMessage('moneda inválida'),
  body('detalle').isArray({ min: 1 }).withMessage('detalle requerido'),
  body('detalle.*.producto_id').isInt({ gt: 0 }),
  body('detalle.*.cantidad').isInt({ gt: 0 }),
  body('detalle.*.costo_unitario').isFloat({ gt: 0 }),
  body('detalle.*.costo_envio').optional().isFloat({ min: 0 }),
  body('detalle.*.moneda').optional().isIn(['ARS','USD','CNY']).withMessage('moneda de detalle inválida'),
  body('detalle.*.tipo_cambio').optional({ nullable: true }).isFloat({ gt: 0 }).withMessage('tipo_cambio debe ser > 0'),
  body('oc_numero').optional().isString().isLength({ max: 100 }),
  body('adjunto_url').optional().isString().isLength({ max: 500 }),
];

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { proveedor_id, fecha, moneda, detalle, oc_numero, adjunto_url } = req.body;
    const seen = new Set();
    for (const item of detalle || []) {
      const pid = Number(item?.producto_id);
      if (!pid) continue;
      if (seen.has(pid)) {
        return res.status(400).json({ error: 'Producto duplicado en la compra' });
      }
      seen.add(pid);
    }
    const r = await repo.createCompra({ proveedor_id, fecha, moneda, detalle, oc_numero, adjunto_url });
    const usuarioId = req.user?.sub ? Number(req.user.sub) : null;
    await audit.log({
      usuario_id: usuarioId,
      accion: 'compra_creada',
      tabla_afectada: 'compras',
      registro_id: r.id,
      descripcion: `Compra creada para proveedor ${proveedor_id}`,
    });
    res.status(201).json(r);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo crear la compra' });
  }
}

async function list(req, res) {
  try {
    const { limit, offset } = req.query || {};
    const rows = await repo.listarCompras({ limit, offset });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener las compras' });
  }
}

async function detalle(req, res) {
  try {
    const rows = await repo.getCompraDetalle(Number(req.params.id));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el detalle' });
  }
}

const validateRecepcion = [
  body('fecha_recepcion').optional().isISO8601(),
  body('observaciones').optional().isString(),
  body('detalle').optional().isArray({ min: 1 }),
  body('detalle.*.producto_id').optional().isInt({ gt: 0 }),
  body('detalle.*.cantidad').optional().isInt({ gt: 0 }),
];

async function recibir(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const compra_id = Number(req.params.id);
    const usuario_id = req.user?.sub ? Number(req.user.sub) : null;
    const r = await repo.recibirCompra({
      compra_id,
      fecha_recepcion: req.body.fecha_recepcion,
      observaciones: req.body.observaciones,
      usuario_id,
      deposito_id: req.body.deposito_id,
      detalle: req.body.detalle,
    });
    await audit.log({
      usuario_id: usuario_id || null,
      accion: r.received ? 'compra_recepcion_total' : 'compra_recepcion_parcial',
      tabla_afectada: 'compras',
      registro_id: compra_id,
      descripcion: r.received ? 'Recepcion completa' : 'Recepcion parcial',
    });
    res.json(r);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo registrar la recepción' });
  }
}

module.exports = { create: [...validateCreate, create], list, detalle, recibir: [...validateRecepcion, recibir] };
