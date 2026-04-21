const { check, validationResult } = require('express-validator');
const { query } = require('../db/pg');
const repo = require('../db/repositories/clientRepository');
const debtRepo = require('../db/repositories/clientDebtRepository');
const paymentRepo = require('../db/repositories/paymentRepository');

const validateCreateOrUpdate = [
  check('nombre').trim().notEmpty().withMessage('Nombre requerido'),
  check('apellido').optional().isString(),
  check('telefono').optional().isString(),
  check('email').optional().isEmail(),
  check('direccion').optional().isString(),
  check('entre_calles').optional().isString().isLength({ max: 255 }),
  check('cuit_cuil').optional().isString(),
  check('tipo_doc').optional().isString(),
  check('nro_doc').optional().isString(),
  check('condicion_iva').optional().isString(),
  check('domicilio_fiscal').optional().isString(),
  check('provincia').optional().isString(),
  check('localidad').optional().isString(),
  check('codigo_postal').optional().isString(),
  check('zona_id').optional({ nullable: true }).isInt({ min: 1 }),
  check('tipo_cliente').optional().isIn(['minorista','mayorista','distribuidor']),
  check('segmento').optional().isString(),
  check('tags').optional().isString(),
  check('estado').optional().isIn(['activo', 'inactivo']),
];

const validateCreateInitialDebt = [
  check('monto').isFloat({ gt: 0 }).withMessage('Monto de deuda requerido'),
  check('fecha').optional().isISO8601().withMessage('Fecha inválida'),
  check('descripcion').optional().isString(),
];

const validateCreateInitialDebtPayment = [
  check('monto').isFloat({ gt: 0 }).withMessage('Monto de pago requerido'),
  check('fecha').optional().isISO8601().withMessage('Fecha invǭlida'),
  check('descripcion').optional().isString(),
];

async function list(req, res) {
  try {
    const { q, estado, tipo_cliente, segmento, limit, offset, all, view } = req.query || {};
    const allowAll = String(all || '') === '1';
    const effectiveLimit = allowAll && (limit == null || limit === '') ? 10000 : limit;
    const rows = await repo.list({
      q,
      estado,
      tipo_cliente,
      segmento,
      limit: effectiveLimit,
      offset,
      allowAll,
      view,
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener clientes' });
  }
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const r = await repo.create(req.body);
    res.status(201).json({ id: r.id });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear el cliente' });
  }
}

async function update(req, res) {
  const { id } = req.params;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const r = await repo.update(Number(id), req.body);
    if (!r) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ message: 'Cliente actualizado' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar el cliente' });
  }
}

async function remove(req, res) {
  const { id } = req.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de cliente inválido' });
  }

  try {
    const r = await repo.remove(idNum);
    if (!r) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    res.json({ message: 'Cliente eliminado' });
  } catch (e) {
    const status = e.status || 500;
    const message = e.message || 'No se pudo eliminar el cliente';
    res.status(status).json({ error: message });
  }
}

async function listInitialDebts(req, res) {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de cliente inválido' });
  }

  try {
    const rows = await debtRepo.listByClient(idNum);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener las deudas iniciales del cliente' });
  }
}

async function addInitialDebt(req, res) {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de cliente inválido' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { monto, fecha, descripcion } = req.body || {};
    const created = await debtRepo.createForClient(idNum, {
      monto: Number(monto),
      fecha: fecha || null,
      descripcion: descripcion || null,
    });
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo registrar la deuda inicial del cliente' });
  }
}

module.exports = {
  list,
  create: [...validateCreateOrUpdate, create],
  update: [...validateCreateOrUpdate, update],
  remove,
  listInitialDebts,
  addInitialDebt: [...validateCreateInitialDebt, addInitialDebt],
};

async function listInitialDebtPayments(req, res) {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de cliente invǭlido' });
  }

  try {
    const rows = await debtRepo.listPaymentsByClient(idNum);
    res.json(rows);
  } catch (e) {
    res
      .status(500)
      .json({ error: 'No se pudieron obtener los pagos de deuda inicial del cliente' });
  }
}

async function addInitialDebtPayment(req, res) {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de cliente invǭlido' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { monto, fecha, descripcion } = req.body || {};
    const created = await debtRepo.createPaymentForClient(idNum, {
      monto: Number(monto),
      fecha: fecha || null,
      descripcion: descripcion || null,
    });
    res.status(201).json(created);
  } catch (e) {
    res
      .status(500)
      .json({ error: 'No se pudo registrar el pago de deuda inicial del cliente' });
  }
}

async function listPaymentHistory(req, res) {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de cliente invalido' });
  }

  const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 200);
  const off = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  try {
    const { rows } = await query(
      `SELECT id, tipo, venta_id, monto, fecha, detalle
         FROM (
           SELECT
             p.id AS id,
             CASE
               WHEN p.venta_id IS NULL THEN 'pago_cuenta'
               ELSE 'pago_venta'
             END AS tipo,
             p.venta_id AS venta_id,
             p.monto::float AS monto,
             p.fecha AS fecha,
             NULL::text AS detalle
           FROM pagos p
           LEFT JOIN ventas v ON v.id = p.venta_id
          WHERE p.cliente_id = $1
            AND (p.venta_id IS NULL OR v.estado_pago <> 'cancelado')
           UNION ALL
           SELECT
             p.id AS id,
             'pago_deuda_inicial' AS tipo,
             NULL::bigint AS venta_id,
             p.monto::float AS monto,
             p.fecha AS fecha,
             p.descripcion AS detalle
           FROM clientes_deudas_iniciales_pagos p
          WHERE p.cliente_id = $1
           UNION ALL
           SELECT
             v.id AS id,
             'entrega_venta' AS tipo,
             v.id AS venta_id,
             NULL::float AS monto,
             v.fecha_entrega AS fecha,
             COALESCE(group_concat(pr.nombre || ' x' || vd.cantidad, ', '), '') AS detalle
           FROM ventas v
           JOIN ventas_detalle vd ON vd.venta_id = v.id
           JOIN productos pr ON pr.id = vd.producto_id
          WHERE v.cliente_id = $1
            AND v.estado_entrega = 'entregado'
          GROUP BY v.id, v.fecha_entrega
         ) AS historial
        ORDER BY (fecha IS NULL) ASC, fecha DESC, id DESC
        LIMIT $2 OFFSET $3`,
      [idNum, lim, off]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el historial de pagos' });
  }
}

async function deleteSalePayment(req, res) {
  const clienteId = Number(req.params.id);
  const pagoId = Number(req.params.pagoId);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(400).json({ error: 'ID de cliente invalido' });
  }
  if (!Number.isInteger(pagoId) || pagoId <= 0) {
    return res.status(400).json({ error: 'ID de pago invalido' });
  }

  try {
    const pago = await paymentRepo.findById(pagoId);
    if (!pago || Number(pago.cliente_id) !== clienteId) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    await paymentRepo.eliminarPago(pagoId);
    res.json({ message: 'Pago eliminado' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo eliminar el pago' });
  }
}

async function deleteInitialDebtPayment(req, res) {
  const clienteId = Number(req.params.id);
  const pagoId = Number(req.params.pagoId);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(400).json({ error: 'ID de cliente invalido' });
  }
  if (!Number.isInteger(pagoId) || pagoId <= 0) {
    return res.status(400).json({ error: 'ID de pago invalido' });
  }
  try {
    const deleted = await debtRepo.deletePaymentForClient(clienteId, pagoId);
    if (!deleted) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    res.json({ message: 'Pago eliminado' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo eliminar el pago' });
  }
}

module.exports.listInitialDebtPayments = listInitialDebtPayments;
module.exports.addInitialDebtPayment = [
  ...validateCreateInitialDebtPayment,
  addInitialDebtPayment,
];
module.exports.listPaymentHistory = listPaymentHistory;
module.exports.deleteSalePayment = deleteSalePayment;
module.exports.deleteInitialDebtPayment = deleteInitialDebtPayment;
