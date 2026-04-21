const { body, check, validationResult } = require('express-validator');
const { query } = require('../db/pg');
const repo = require('../db/repositories/pricingRepository');

const OFFER_TYPES = ['cantidad', 'fecha'];
const OFFER_PRICE_LISTS = ['local', 'distribuidor', 'final', 'todas'];

function parseOptionalId(raw) {
  if (raw == null || raw === '') return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

async function ensureProductoExists(productoId) {
  if (!productoId) return true;
  const { rows } = await query('SELECT id FROM productos WHERE id = $1 LIMIT 1', [productoId]);
  return rows.length > 0;
}

async function listOffers(req, res) {
  try {
    const rows = await repo.listOffers({
      incluirInactivas: String(req.query?.inactivas || '') === '1',
      q: req.query?.q,
      tipo: req.query?.tipo,
      producto_id: req.query?.producto_id,
      lista_precio_objetivo: req.query?.lista_precio_objetivo,
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener las ofertas de precios' });
  }
}

const validateCreateOffer = [
  check('nombre').trim().notEmpty().isLength({ min: 2, max: 160 }),
  check('descripcion').optional().isString().isLength({ max: 2000 }),
  check('tipo_oferta').isIn(OFFER_TYPES),
  check('producto_id').optional({ nullable: true }).isInt({ gt: 0 }),
  check('lista_precio_objetivo').optional().isIn(OFFER_PRICE_LISTS),
  check('cantidad_minima').optional().isInt({ min: 1 }),
  check('descuento_pct').isFloat({ gt: 0, max: 100 }),
  check('fecha_desde').optional({ nullable: true }).isISO8601(),
  check('fecha_hasta').optional({ nullable: true }).isISO8601(),
  check('prioridad').optional().isInt({ min: -9999, max: 9999 }),
  check('activo').optional().isBoolean(),
];

async function createOffer(req, res) {
  if (!handleValidation(req, res)) return;
  const payload = req.body || {};
  const tipoOferta = String(payload.tipo_oferta || '').trim().toLowerCase();
  const productoId = parseOptionalId(payload.producto_id);
  const fechaDesde = payload.fecha_desde || null;
  const fechaHasta = payload.fecha_hasta || null;

  if (productoId && !(await ensureProductoExists(productoId))) {
    return res.status(400).json({ error: 'Producto no encontrado para la oferta' });
  }
  if (tipoOferta === 'fecha' && (!fechaDesde || !fechaHasta)) {
    return res.status(400).json({ error: 'Las ofertas por fecha requieren fecha_desde y fecha_hasta' });
  }
  if (fechaDesde && fechaHasta && new Date(fechaHasta) < new Date(fechaDesde)) {
    return res.status(400).json({ error: 'fecha_hasta no puede ser menor a fecha_desde' });
  }

  try {
    const created = await repo.createOffer({
      nombre: payload.nombre,
      descripcion: payload.descripcion,
      tipo_oferta: tipoOferta,
      producto_id: productoId,
      lista_precio_objetivo: payload.lista_precio_objetivo || 'todas',
      cantidad_minima: payload.cantidad_minima,
      descuento_pct: payload.descuento_pct,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      prioridad: payload.prioridad,
      activo: payload.activo,
    });
    res.status(201).json(created);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo crear la oferta de precios' });
  }
}

const validateUpdateOffer = [
  check('nombre').optional().trim().isLength({ min: 2, max: 160 }),
  check('descripcion').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  check('tipo_oferta').optional().isIn(OFFER_TYPES),
  check('producto_id').optional({ nullable: true }).isInt({ gt: 0 }),
  check('lista_precio_objetivo').optional().isIn(OFFER_PRICE_LISTS),
  check('cantidad_minima').optional().isInt({ min: 1 }),
  check('descuento_pct').optional().isFloat({ gt: 0, max: 100 }),
  check('fecha_desde').optional({ nullable: true }).isISO8601(),
  check('fecha_hasta').optional({ nullable: true }).isISO8601(),
  check('prioridad').optional().isInt({ min: -9999, max: 9999 }),
  check('activo').optional().isBoolean(),
];

async function updateOffer(req, res) {
  if (!handleValidation(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID invalido' });

  const payload = { ...(req.body || {}) };
  if (Object.prototype.hasOwnProperty.call(payload, 'producto_id')) {
    payload.producto_id = parseOptionalId(payload.producto_id);
    if (payload.producto_id && !(await ensureProductoExists(payload.producto_id))) {
      return res.status(400).json({ error: 'Producto no encontrado para la oferta' });
    }
  }
  if (payload.fecha_desde && payload.fecha_hasta && new Date(payload.fecha_hasta) < new Date(payload.fecha_desde)) {
    return res.status(400).json({ error: 'fecha_hasta no puede ser menor a fecha_desde' });
  }

  try {
    const updated = await repo.updateOffer(id, payload);
    if (!updated) return res.status(404).json({ error: 'Oferta no encontrada' });
    res.json({ message: 'Oferta actualizada' });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo actualizar la oferta' });
  }
}

async function getCommissionConfig(req, res) {
  try {
    const data = await repo.getCommissionConfig();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener la configuracion de comisiones' });
  }
}

const validateSetCommissionConfig = [
  body('mode').isIn(['producto', 'lista']),
  body('porcentajes').optional().isObject(),
  body('porcentajes.local').optional().isFloat({ min: 0, max: 100 }),
  body('porcentajes.distribuidor').optional().isFloat({ min: 0, max: 100 }),
  body('porcentajes.final').optional().isFloat({ min: 0, max: 100 }),
  body('porcentajes.oferta').optional().isFloat({ min: 0, max: 100 }),
];

async function setCommissionConfig(req, res) {
  if (!handleValidation(req, res)) return;
  const usuarioId = Number.isInteger(Number(req.user?.sub)) ? Number(req.user.sub) : null;
  try {
    const data = await repo.setCommissionConfig({
      mode: req.body?.mode,
      porcentajes: req.body?.porcentajes || {},
      usuarioId,
    });
    res.json(data);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo guardar la configuracion de comisiones' });
  }
}

module.exports = {
  listOffers,
  createOffer: [...validateCreateOffer, createOffer],
  updateOffer: [...validateUpdateOffer, updateOffer],
  getCommissionConfig,
  setCommissionConfig: [...validateSetCommissionConfig, setCommissionConfig],
};
