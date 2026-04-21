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

function getAuthUserId(req) {
  const id = Number(req.authUser?.id || req.user?.sub || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getAuthRole(req) {
  return String(req.authUser?.rol || req.user?.role || '').trim().toLowerCase();
}

function canAccessVendor(req, usuarioId) {
  const role = getAuthRole(req);
  if (['admin', 'gerente'].includes(role)) return true;
  return role === 'vendedor' && getAuthUserId(req) === Number(usuarioId);
}

function ensureVendorAccess(req, res, usuarioId) {
  if (canAccessVendor(req, usuarioId)) return true;
  res.status(403).json({ error: 'Permisos insuficientes' });
  return false;
}

function buildDefaultVendorConfig(usuarioId) {
  return {
    usuario_id: Number(usuarioId),
    sueldo_fijo: 0,
    comision_tipo: 'por_producto',
    periodo_liquidacion: 'mes',
  };
}

async function loadVendorLiquidacion(usuarioId, { periodo, desde, hasta } = {}) {
  const userId = Number(usuarioId);
  const vendedor = await repo.getVendedorById(userId);
  if (!vendedor) {
    const error = new Error('Vendedor no encontrado');
    error.status = 404;
    throw error;
  }

  const config = (await repo.getVendorConfig(userId)) || buildDefaultVendorConfig(userId);
  const range = payroll.resolveRange({
    periodo: periodo || config.periodo_liquidacion || 'mes',
    desde,
    hasta,
  });

  const [fixedCommission, listConfig, lines, pagos, adelantos] = await Promise.all([
    repo.getComisionActiva({
      usuario_id: userId,
      periodo: range.periodo,
      fecha: range.toStr,
    }),
    pricingRepo
      .getCommissionConfig({ usuarioId: userId })
      .catch(() => ({
        mode: 'lista',
        comision_tipo: 'por_lista',
        usa_configuracion_global: true,
        global: [],
        overrides: [],
        listas: [],
        porcentajes: {},
      })),
    repo.listLiquidacionLines({
      usuario_id: userId,
      desde: range.fromStr,
      hasta: range.toStr,
    }),
    repo.listPagos({
      usuario_id: userId,
      periodo: range.periodo,
      desde: range.fromStr,
      hasta: range.toStr,
      limit: 500,
      offset: 0,
    }),
    repo.listAdelantos({
      usuario_id: userId,
      desde: range.fromStr,
      hasta: range.toStr,
      limit: 500,
      offset: 0,
    }),
  ]);

  const liquidacion = payroll.buildLiquidacion({
    vendedor,
    config,
    fixedCommission,
    listConfig,
    lines,
    pagos,
    adelantos,
    periodo: range.periodo,
    desde: range.fromStr,
    hasta: range.toStr,
  });

  return {
    vendedor,
    config,
    fixedCommission,
    listConfig,
    range,
    liquidacion,
  };
}

const validateComision = [
  body('periodo').optional().isIn(['dia', 'semana', 'mes']),
  body('porcentaje').isFloat({ min: 0, max: 100 }),
  body('vigencia_desde').optional({ nullable: true }).isISO8601(),
  body('vigencia_hasta').optional({ nullable: true }).isISO8601(),
  body('base_tipo').optional().isIn(['bruto', 'neto']),
];

const validatePago = [
  body('periodo').optional().isIn(['dia', 'semana', 'mes']),
  body('desde').isISO8601(),
  body('hasta').isISO8601(),
  body('monto_pagado').isFloat({ gt: 0 }),
  body('metodo').optional({ nullable: true }).isString().isLength({ max: 30 }),
  body('notas').optional({ nullable: true }).isString().isLength({ max: 300 }),
];

const validateAdelanto = [
  body('monto').isFloat({ gt: 0 }),
  body('fecha').isISO8601(),
  body('notas').optional({ nullable: true }).isString().isLength({ max: 300 }),
];

const validateVendorConfig = [
  body('sueldo_fijo').optional().isFloat({ min: 0 }),
  body('comision_tipo').optional().isIn(['por_lista', 'por_producto', 'por_total_venta', 'mixto']),
  body('periodo_liquidacion').optional().isIn(['dia', 'semana', 'mes']),
  body('comision_fija.porcentaje').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
  body('comision_fija.base_tipo').optional().isIn(['bruto', 'neto']),
  body('comision_fija.vigencia_desde').optional({ nullable: true }).isISO8601(),
  body('comision_fija.vigencia_hasta').optional({ nullable: true }).isISO8601(),
  body('comision_listas.useGlobal').optional().isBoolean(),
  body('comision_listas.listas').optional().isArray({ max: 200 }),
  body('comision_listas.listas.*.lista_codigo')
    .optional()
    .isString()
    .isLength({ min: 1, max: 60 }),
  body('comision_listas.listas.*.lista_nombre')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 120 }),
  body('comision_listas.listas.*.porcentaje').optional().isFloat({ min: 0, max: 100 }),
];

async function listSueldos(req, res) {
  try {
    const requestedPeriodo = payroll.normalizePeriodo(req.query.periodo || 'mes');
    const requestedRange = payroll.resolveRange({
      periodo: requestedPeriodo,
      desde: req.query.desde,
      hasta: req.query.hasta,
    });
    const vendedores = await repo.listVendedores();
    const items = [];

    for (const vendedor of vendedores) {
      const { liquidacion } = await loadVendorLiquidacion(vendedor.id, {
        periodo: requestedRange.periodo,
        desde: requestedRange.fromStr,
        hasta: requestedRange.toStr,
      });
      items.push({
        usuario_id: Number(vendedor.id),
        nombre: vendedor.nombre,
        email: vendedor.email,
        activo: vendedor.activo,
        periodo_liquidacion: liquidacion.configuracion.periodo_liquidacion,
        comision_tipo: liquidacion.configuracion.comision_tipo,
        ventas_count: liquidacion.resumen.ventas_count,
        ventas_total: liquidacion.resumen.ventas_total,
        ventas_base_comision_total: liquidacion.resumen.ventas_base_comision_total,
        comision_monto: liquidacion.resumen.comision_monto,
        sueldo_fijo: liquidacion.resumen.sueldo_fijo,
        pagado_total: liquidacion.resumen.pagado_total,
        adelantos_total: liquidacion.resumen.adelantos_total,
        total_devengado: liquidacion.resumen.total_devengado,
        saldo: liquidacion.resumen.saldo,
        modo_activo: liquidacion.resumen.modo_activo,
      });
    }

    const totals = items.reduce(
      (acc, item) => ({
        ventas_total: payroll.roundMoney(acc.ventas_total + Number(item.ventas_total || 0)),
        comision_monto: payroll.roundMoney(acc.comision_monto + Number(item.comision_monto || 0)),
        sueldo_fijo: payroll.roundMoney(acc.sueldo_fijo + Number(item.sueldo_fijo || 0)),
        adelantos_total: payroll.roundMoney(acc.adelantos_total + Number(item.adelantos_total || 0)),
        pagado_total: payroll.roundMoney(acc.pagado_total + Number(item.pagado_total || 0)),
        total_devengado: payroll.roundMoney(
          acc.total_devengado + Number(item.total_devengado || 0)
        ),
        saldo: payroll.roundMoney(acc.saldo + Number(item.saldo || 0)),
      }),
      {
        ventas_total: 0,
        comision_monto: 0,
        sueldo_fijo: 0,
        adelantos_total: 0,
        pagado_total: 0,
        total_devengado: 0,
        saldo: 0,
      }
    );

    res.json({
      periodo: requestedRange.periodo,
      desde: requestedRange.fromStr,
      hasta: requestedRange.toStr,
      items,
      totals,
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'No se pudieron calcular sueldos' });
  }
}

async function getLiquidacion(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  if (!ensureVendorAccess(req, res, userId)) return;
  try {
    const { liquidacion } = await loadVendorLiquidacion(userId, {
      periodo: req.query.periodo,
      desde: req.query.desde,
      hasta: req.query.hasta,
    });
    res.json(liquidacion);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'No se pudo obtener la liquidacion del vendedor',
    });
  }
}

async function ventasDetalle(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  if (!ensureVendorAccess(req, res, userId)) return;
  try {
    const { liquidacion } = await loadVendorLiquidacion(userId, {
      periodo: req.query.periodo,
      desde: req.query.desde,
      hasta: req.query.hasta,
    });
    res.json({
      periodo: liquidacion.periodo.periodo,
      desde: liquidacion.periodo.desde,
      hasta: liquidacion.periodo.hasta,
      resumen: liquidacion.resumen,
      ventas: liquidacion.ventas,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'No se pudieron obtener ventas del vendedor',
    });
  }
}

async function getComision(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  try {
    const vendorConfig = (await repo.getVendorConfig(userId)) || buildDefaultVendorConfig(userId);
    const periodo = payroll.normalizePeriodo(req.query.periodo || vendorConfig.periodo_liquidacion || 'mes');
    const fecha = req.query.fecha || req.query.hasta || payroll.resolveRange({ periodo }).toStr;
    const row = await repo.getComisionActiva({
      usuario_id: userId,
      periodo,
      fecha,
    });
    if (!row) {
      return res.json({
        usuario_id: userId,
        periodo,
        porcentaje: 0,
        base_tipo: 'bruto',
        vigencia_desde: null,
        vigencia_hasta: null,
        activo: false,
      });
    }
    res.json(row);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'No se pudo obtener comision' });
  }
}

async function setComision(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  if (!handleValidation(req, res)) return;
  try {
    const vendorConfig = (await repo.getVendorConfig(userId)) || buildDefaultVendorConfig(userId);
    const periodo = payroll.normalizePeriodo(
      req.body.periodo || vendorConfig.periodo_liquidacion || 'mes'
    );
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
    res.status(201).json({
      id: created?.id,
      usuario_id: userId,
      periodo,
      porcentaje: Number(req.body.porcentaje || 0),
      base_tipo: req.body.base_tipo || 'bruto',
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'No se pudo guardar comision' });
  }
}

async function listPagos(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  if (!ensureVendorAccess(req, res, userId)) return;
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
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'No se pudieron obtener pagos' });
  }
}

async function listHistorialPagos(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  if (!ensureVendorAccess(req, res, userId)) return;
  try {
    const rows = await repo.listHistorialPagos({
      usuario_id: userId,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ pagos: rows });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'No se pudo obtener el historial de pagos',
    });
  }
}

async function createPago(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  if (!handleValidation(req, res)) return;
  try {
    const { liquidacion } = await loadVendorLiquidacion(userId, {
      periodo: req.body.periodo,
      desde: req.body.desde,
      hasta: req.body.hasta,
    });
    const ventasTotal = Number(liquidacion.resumen.ventas_total || 0);
    const comisionMonto = Number(liquidacion.resumen.comision_monto || 0);
    const porcentaje = ventasTotal > 0 ? payroll.roundMoney((comisionMonto / ventasTotal) * 100) : 0;
    const montoCalculado = Number(liquidacion.resumen.saldo || 0);
    const montoPagado = Number(req.body.monto_pagado || 0);

    const created = await repo.createPago({
      usuario_id: userId,
      periodo: liquidacion.periodo.periodo,
      desde: liquidacion.periodo.desde,
      hasta: liquidacion.periodo.hasta,
      ventas_total: ventasTotal,
      porcentaje,
      monto_calculado: montoCalculado,
      monto_pagado: montoPagado,
      metodo: req.body.metodo,
      notas: req.body.notas,
      usuario_registro: getAuthUserId(req),
    });

    res.status(201).json({
      id: created?.id,
      usuario_id: userId,
      periodo: liquidacion.periodo.periodo,
      desde: liquidacion.periodo.desde,
      hasta: liquidacion.periodo.hasta,
      ventas_total: ventasTotal,
      porcentaje,
      monto_calculado: montoCalculado,
      monto_pagado: montoPagado,
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'No se pudo registrar pago' });
  }
}

async function getVendorConfig(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  try {
    const vendedor = await repo.getVendedorById(userId);
    if (!vendedor) return res.status(404).json({ error: 'Vendedor no encontrado' });

    const config = (await repo.getVendorConfig(userId)) || buildDefaultVendorConfig(userId);
    const fixedCommission = await repo.getComisionActiva({
      usuario_id: userId,
      periodo: config.periodo_liquidacion || 'mes',
      fecha: payroll.resolveRange({ periodo: config.periodo_liquidacion || 'mes' }).toStr,
    });
    const [listConfig, productStats] = await Promise.all([
      pricingRepo.getCommissionConfig({ usuarioId: userId }).catch(() => ({
        mode: 'lista',
        comision_tipo: 'por_lista',
        usa_configuracion_global: true,
        global: [],
        overrides: [],
        listas: [],
        porcentajes: {},
      })),
      repo.countProductCommissionStats(),
    ]);

    res.json({
      usuario_id: userId,
      vendedor,
      sueldo_fijo: Number(config.sueldo_fijo || 0),
      comision_tipo: config.comision_tipo || 'por_producto',
      periodo_liquidacion: config.periodo_liquidacion || 'mes',
      comision_fija: fixedCommission || {
        usuario_id: userId,
        periodo: config.periodo_liquidacion || 'mes',
        porcentaje: 0,
        base_tipo: 'bruto',
        vigencia_desde: null,
        vigencia_hasta: null,
        activo: false,
      },
      comision_listas: listConfig,
      productos: productStats,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'No se pudo obtener configuracion del vendedor',
    });
  }
}

async function setVendorConfigHandler(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  if (!handleValidation(req, res)) return;
  try {
    const currentConfig = (await repo.getVendorConfig(userId)) || buildDefaultVendorConfig(userId);
    const sueldoFijo =
      typeof req.body.sueldo_fijo !== 'undefined'
        ? Number(req.body.sueldo_fijo || 0)
        : Number(currentConfig.sueldo_fijo || 0);
    const comisionTipo = payroll.normalizeCommissionMode(
      req.body.comision_tipo || currentConfig.comision_tipo || 'por_producto'
    );
    const periodoLiquidacion = payroll.normalizePeriodo(
      req.body.periodo_liquidacion || currentConfig.periodo_liquidacion || 'mes'
    );

    await repo.setVendorConfig({
      usuario_id: userId,
      sueldo_fijo: sueldoFijo,
      comision_tipo: comisionTipo,
      periodo_liquidacion: periodoLiquidacion,
    });

    if (req.body.comision_fija) {
      const vigDesde = payroll.parseDateInput(req.body.comision_fija.vigencia_desde) || new Date();
      const vigHasta = payroll.parseDateInput(req.body.comision_fija.vigencia_hasta);
      await repo.deactivateComisiones({
        usuario_id: userId,
        periodo: periodoLiquidacion,
      });
      await repo.createComision({
        usuario_id: userId,
        periodo: periodoLiquidacion,
        porcentaje: Number(req.body.comision_fija.porcentaje || 0),
        base_tipo: req.body.comision_fija.base_tipo || 'bruto',
        vigencia_desde: payroll.toLocalDateString(vigDesde),
        vigencia_hasta: vigHasta ? payroll.toLocalDateString(vigHasta) : null,
        activo: 1,
      });
    }

    if (req.body.comision_listas) {
      await pricingRepo.setCommissionConfig({
        usuarioId: userId,
        useGlobal: req.body.comision_listas.useGlobal === true,
        listas: Array.isArray(req.body.comision_listas.listas)
          ? req.body.comision_listas.listas
          : [],
        actorUserId: getAuthUserId(req),
      });
    }

    const refreshed = await getVendorConfig(req, res);
    return refreshed;
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'No se pudo guardar configuracion del vendedor',
    });
  }
}

async function listAdelantos(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  if (!ensureVendorAccess(req, res, userId)) return;
  try {
    const periodo = payroll.normalizePeriodo(req.query.periodo || 'mes');
    const range = payroll.resolveRange({
      periodo,
      desde: req.query.desde,
      hasta: req.query.hasta,
    });
    const rows = await repo.listAdelantos({
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
      adelantos: rows,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'No se pudieron obtener adelantos',
    });
  }
}

async function createAdelanto(req, res) {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID invalido' });
  if (!handleValidation(req, res)) return;
  try {
    const created = await repo.createAdelanto({
      usuario_id: userId,
      monto: req.body.monto,
      fecha: req.body.fecha,
      notas: req.body.notas,
      usuario_registro: getAuthUserId(req),
    });
    res.status(201).json({ id: created?.id, usuario_id: userId });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'No se pudo registrar el adelanto',
    });
  }
}

async function miResumen(req, res) {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  try {
    const { liquidacion } = await loadVendorLiquidacion(userId, {
      periodo: req.query.periodo,
      desde: req.query.desde,
      hasta: req.query.hasta,
    });
    const historial = await repo.listHistorialPagos({
      usuario_id: userId,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({
      ...liquidacion,
      historial_pagos: historial,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'No se pudo obtener el resumen del vendedor',
    });
  }
}

module.exports = {
  listSueldos,
  getLiquidacion,
  ventasDetalle,
  getComision,
  setComision: [...validateComision, setComision],
  listPagos,
  listHistorialPagos,
  createPago: [...validatePago, createPago],
  getVendorConfig,
  getVendorCommissionConfig: getVendorConfig,
  setVendorConfig: [...validateVendorConfig, setVendorConfigHandler],
  setVendorCommissionConfig: [...validateVendorConfig, setVendorConfigHandler],
  listAdelantos,
  createAdelanto: [...validateAdelanto, createAdelanto],
  miResumen,
};
