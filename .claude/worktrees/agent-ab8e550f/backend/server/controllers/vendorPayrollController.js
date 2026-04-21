const { body, validationResult } = require('express-validator');
const repo = require('../db/repositories/vendorPayrollRepository');
const payroll = require('../services/vendorPayrollService');
const pricingRepo = require('../db/repositories/pricingRepository');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const validateComision = [
  body('periodo').isIn(['dia', 'semana', 'mes']),
  body('porcentaje').isFloat({ min: 0, max: 100 }),
  body('vigencia_desde').optional().isISO8601(),
  body('vigencia_hasta').optional().isISO8601(),
  body('base_tipo').optional().isIn(['bruto', 'neto']),
];

const validatePago = [
  body('periodo').isIn(['dia', 'semana', 'mes']),
  body('desde').isISO8601(),
  body('hasta').isISO8601(),
  body('monto_pagado').isFloat({ gt: 0 }),
  body('metodo').optional().isString().isLength({ max: 30 }),
  body('notas').optional().isString().isLength({ max: 300 }),
];

async function listSueldos(req, res) {
  try {
    const periodo = payroll.normalizePeriodo(req.query.periodo || 'mes');
    const range = payroll.resolveRange({
      periodo,
      desde: req.query.desde,
      hasta: req.query.hasta,
    });

    const [ventasRows, pagosRows, commissionConfig] = await Promise.all([
      repo.ventasResumenPorVendedor({ desde: range.fromStr, hasta: range.toStr }),
      repo.pagosSumPorVendedor({ periodo: range.periodo, desde: range.fromStr, hasta: range.toStr }),
      pricingRepo.getCommissionConfig().catch(() => ({ mode: 'producto' })),
    ]);

    const pagosByUser = new Map();
    for (const row of pagosRows) {
      pagosByUser.set(Number(row.usuario_id), Number(row.pagado_total || 0));
    }

    const items = ventasRows.map((row) => {
      const userId = Number(row.usuario_id);
      const ventasTotal = Number(row.ventas_total || 0);
      const comisionMonto = payroll.roundMoney(Number(row.comision_total || 0));
      const pagadoTotal = Number(pagosByUser.get(userId) || 0);
      const saldo = payroll.roundMoney(comisionMonto - pagadoTotal);
      return {
        usuario_id: userId,
        nombre: row.nombre,
        email: row.email,
        activo: row.activo,
        ventas_count: Number(row.ventas_count || 0),
        ventas_total: ventasTotal,
        comision_porcentaje: 0,
        comision_base: commissionConfig?.mode === 'lista' ? 'lista' : 'producto',
        comision_monto: comisionMonto,
        pagado_total: pagadoTotal,
        saldo,
      };
    });

    res.json({
      periodo: range.periodo,
      desde: range.fromStr,
      hasta: range.toStr,
      items,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron calcular sueldos' });
  }
}

async function ventasDetalle(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  try {
    const periodo = payroll.normalizePeriodo(req.query.periodo || 'mes');
    const range = payroll.resolveRange({
      periodo,
      desde: req.query.desde,
      hasta: req.query.hasta,
    });
    const rows = await repo.ventasDetallePorVendedor({
      usuario_id: userId,
      desde: range.fromStr,
      hasta: range.toStr,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({
      periodo: range.periodo,
      desde: range.fromStr,
      hasta: range.toStr,
      ventas: rows,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener ventas del vendedor' });
  }
}

async function getComision(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  try {
    const periodo = payroll.normalizePeriodo(req.query.periodo || 'mes');
    const range = payroll.resolveRange({
      periodo,
      desde: req.query.desde,
      hasta: req.query.hasta,
    });
    const row = await repo.getComisionActiva({
      usuario_id: userId,
      periodo: range.periodo,
      fecha: range.toStr,
    });
    if (!row) {
      return res.json({
        usuario_id: userId,
        periodo: range.periodo,
        porcentaje: 0,
        base_tipo: 'bruto',
        vigencia_desde: null,
        vigencia_hasta: null,
        activo: false,
      });
    }
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener comision' });
  }
}

async function setComision(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  if (!handleValidation(req, res)) return;
  try {
    const periodo = payroll.normalizePeriodo(req.body.periodo);
    const vigDesde = payroll.parseDateInput(req.body.vigencia_desde) || new Date();
    const vigHasta = payroll.parseDateInput(req.body.vigencia_hasta);

    await repo.deactivateComisiones({ usuario_id: userId, periodo });
    const created = await repo.createComision({
      usuario_id: userId,
      periodo,
      porcentaje: req.body.porcentaje,
      base_tipo: req.body.base_tipo || 'bruto',
      vigencia_desde: payroll.toLocalDateString(vigDesde),
      vigencia_hasta: vigHasta ? payroll.toLocalDateString(vigHasta) : null,
      activo: 1,
    });
    res.status(201).json({ id: created?.id, usuario_id: userId, periodo });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo guardar comision' });
  }
}

async function listPagos(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  try {
    const periodo = payroll.normalizePeriodo(req.query.periodo || 'mes');
    const range = payroll.resolveRange({
      periodo,
      desde: req.query.desde,
      hasta: req.query.hasta,
    });
    const rows = await repo.listPagos({
      usuario_id: userId,
      periodo: range.periodo,
      desde: range.fromStr,
      hasta: range.toStr,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({
      periodo: range.periodo,
      desde: range.fromStr,
      hasta: range.toStr,
      pagos: rows,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener pagos' });
  }
}

async function createPago(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  if (!handleValidation(req, res)) return;
  try {
    const periodo = payroll.normalizePeriodo(req.body.periodo);
    const range = payroll.resolveRange({
      periodo,
      desde: req.body.desde,
      hasta: req.body.hasta,
    });

    const ventasRes = await repo.ventasResumen({
      usuario_id: userId,
      desde: range.fromStr,
      hasta: range.toStr,
    });

    const ventasTotal = Number(ventasRes?.ventas_total || 0);
    const porcentaje = 0;
    const montoCalculado = payroll.roundMoney(Number(ventasRes?.comision_total || 0));
    const montoPagado = Number(req.body.monto_pagado || 0);

    const created = await repo.createPago({
      usuario_id: userId,
      periodo: range.periodo,
      desde: range.fromStr,
      hasta: range.toStr,
      ventas_total: ventasTotal,
      porcentaje,
      monto_calculado: montoCalculado,
      monto_pagado: montoPagado,
      metodo: req.body.metodo,
      notas: req.body.notas,
      usuario_registro: req.user?.sub ? Number(req.user.sub) : null,
    });

    res.status(201).json({
      id: created?.id,
      usuario_id: userId,
      periodo: range.periodo,
      desde: range.fromStr,
      hasta: range.toStr,
      ventas_total: ventasTotal,
      porcentaje,
      monto_calculado: montoCalculado,
      monto_pagado: montoPagado,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo registrar pago' });
  }
}

module.exports = {
  listSueldos,
  ventasDetalle,
  getComision,
  setComision: [...validateComision, setComision],
  listPagos,
  createPago: [...validatePago, createPago],
};
