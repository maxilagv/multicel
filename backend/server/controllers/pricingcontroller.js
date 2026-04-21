const { body, check, validationResult } = require('express-validator');
const { query } = require('../db/pg');
const repo = require('../db/repositories/pricingRepository');
const priceListRepo = require('../db/repositories/priceListRepository');
const surchargeRepo = require('../db/repositories/paymentSurchargeRepository');

const OFFER_TYPES = ['cantidad', 'fecha'];
const QUANTITY_RULE_MODES = ['lista', 'lista_alternativa', 'descuento_pct', 'precio_fijo'];

function parseOptionalIds(rawList) {
  if (!Array.isArray(rawList)) return [];
  return Array.from(
    new Set(
      rawList
        .map((value) => Number(value))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
  );
}

function resolveOfferProductSelection(payload = {}, { requirePresence = false } = {}) {
  const hasArray = Object.prototype.hasOwnProperty.call(payload, 'producto_ids');
  const hasSingle = Object.prototype.hasOwnProperty.call(payload, 'producto_id');
  if (requirePresence && !hasArray && !hasSingle) {
    return { provided: false, ids: [] };
  }
  const raw = [];
  if (Array.isArray(payload.producto_ids)) raw.push(...payload.producto_ids);
  if (hasSingle && payload.producto_id != null && payload.producto_id !== '') {
    raw.push(payload.producto_id);
  }
  return {
    provided: hasArray || hasSingle || !requirePresence,
    ids: parseOptionalIds(raw),
  };
}

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

function getUsuarioId(req) {
  return Number.isInteger(Number(req.user?.sub)) ? Number(req.user.sub) : null;
}

async function ensureProductosExist(productoIds = []) {
  const ids = Array.from(
    new Set(
      (productoIds || [])
        .map((value) => Number(value))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
  );
  if (!ids.length) return true;
  const marks = ids.map((_, idx) => `$${idx + 1}`).join(', ');
  const { rows } = await query(`SELECT id FROM productos WHERE id IN (${marks})`, ids);
  return (rows || []).length === ids.length;
}

function validateQuantityRulePayload(payload = {}, { partial = false } = {}) {
  const modo = typeof payload.modo !== 'undefined' ? String(payload.modo || '').trim().toLowerCase() : null;
  const descuentoPct = Number(payload.descuento_pct);
  const precioFijo = Number(payload.precio_fijo);
  const listaAlternativaId = Number(payload.lista_precio_alternativa_id || 0);

  if (!partial || modo === 'lista_alternativa') {
    if (modo === 'lista_alternativa' && !(listaAlternativaId > 0)) {
      const error = new Error('La regla requiere una lista alternativa valida');
      error.status = 400;
      throw error;
    }
  }

  if (!partial || modo === 'descuento_pct') {
    if (modo === 'descuento_pct' && !(descuentoPct > 0 && descuentoPct <= 100)) {
      const error = new Error('La regla requiere un descuento porcentual valido');
      error.status = 400;
      throw error;
    }
  }

  if (!partial || modo === 'precio_fijo') {
    if (modo === 'precio_fijo' && !(precioFijo > 0)) {
      const error = new Error('La regla requiere un precio fijo valido');
      error.status = 400;
      throw error;
    }
  }
}

async function listPriceLists(req, res) {
  try {
    const rows = await priceListRepo.listPriceLists({
      includeInactive: String(req.query?.inactivas || '') === '1',
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener las listas de precio' });
  }
}

const validateCreatePriceList = [
  body('nombre').trim().notEmpty().isLength({ min: 2, max: 120 }),
  body('slug').optional({ nullable: true }).isString().isLength({ max: 60 }),
  body('descripcion').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('margen_ratio').optional().isFloat({ min: 0 }),
  body('activo').optional().isBoolean(),
  body('orden_visual').optional().isInt({ min: 0, max: 9999 }),
];

async function createPriceList(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const created = await priceListRepo.createPriceList({
      ...req.body,
      usuarioId: getUsuarioId(req),
    });
    res.status(201).json(created);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo crear la lista de precio' });
  }
}

const validateUpdatePriceList = [
  body('nombre').optional().trim().isLength({ min: 2, max: 120 }),
  body('slug').optional({ nullable: true }).isString().isLength({ max: 60 }),
  body('descripcion').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('margen_ratio').optional().isFloat({ min: 0 }),
  body('activo').optional().isBoolean(),
  body('orden_visual').optional().isInt({ min: 0, max: 9999 }),
];

async function updatePriceList(req, res) {
  if (!handleValidation(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID invalido' });
  try {
    const updated = await priceListRepo.updatePriceList(id, req.body || {}, {
      usuarioId: getUsuarioId(req),
    });
    res.json(updated);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo actualizar la lista de precio' });
  }
}

async function deletePriceList(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID invalido' });
  try {
    const updated = await priceListRepo.deactivatePriceList(id, {
      usuarioId: getUsuarioId(req),
    });
    res.json(updated);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo desactivar la lista de precio' });
  }
}

async function listPriceListQuantityRules(req, res) {
  const listId = Number(req.params.id);
  if (!Number.isInteger(listId) || listId <= 0) return res.status(400).json({ error: 'ID invalido' });
  try {
    const rows = await priceListRepo.listQuantityRules(listId);
    res.json(rows);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudieron obtener las reglas por cantidad' });
  }
}

const validateCreateQuantityRule = [
  body('cantidad_desde').isInt({ min: 1 }),
  body('cantidad_hasta').optional({ nullable: true }).isInt({ min: 1 }),
  body('modo').optional().isIn(QUANTITY_RULE_MODES),
  body('lista_precio_alternativa_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('descuento_pct').optional({ nullable: true }).isFloat({ gt: 0, max: 100 }),
  body('precio_fijo').optional({ nullable: true }).isFloat({ gt: 0 }),
  body('prioridad').optional().isInt({ min: -9999, max: 9999 }),
  body('activo').optional().isBoolean(),
];

async function createQuantityRule(req, res) {
  if (!handleValidation(req, res)) return;
  const listId = Number(req.params.id);
  if (!Number.isInteger(listId) || listId <= 0) return res.status(400).json({ error: 'ID invalido' });
  try {
    validateQuantityRulePayload(req.body || {}, { partial: false });
    const created = await priceListRepo.createQuantityRule(listId, req.body || {});
    res.status(201).json(created);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo crear la regla por cantidad' });
  }
}

const validateUpdateQuantityRule = [
  body('cantidad_desde').optional().isInt({ min: 1 }),
  body('cantidad_hasta').optional({ nullable: true }).isInt({ min: 1 }),
  body('modo').optional().isIn(QUANTITY_RULE_MODES),
  body('lista_precio_alternativa_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('descuento_pct').optional({ nullable: true }).isFloat({ gt: 0, max: 100 }),
  body('precio_fijo').optional({ nullable: true }).isFloat({ gt: 0 }),
  body('prioridad').optional().isInt({ min: -9999, max: 9999 }),
  body('activo').optional().isBoolean(),
];

async function updateQuantityRule(req, res) {
  if (!handleValidation(req, res)) return;
  const ruleId = Number(req.params.id);
  if (!Number.isInteger(ruleId) || ruleId <= 0) return res.status(400).json({ error: 'ID invalido' });
  try {
    validateQuantityRulePayload(req.body || {}, { partial: true });
    const updated = await priceListRepo.updateQuantityRule(ruleId, req.body || {});
    res.json(updated);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo actualizar la regla por cantidad' });
  }
}

async function deleteQuantityRule(req, res) {
  const ruleId = Number(req.params.id);
  if (!Number.isInteger(ruleId) || ruleId <= 0) return res.status(400).json({ error: 'ID invalido' });
  try {
    const deleted = await priceListRepo.deleteQuantityRule(ruleId);
    res.json(deleted);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo eliminar la regla por cantidad' });
  }
}

const validateResolveProductPrice = [
  body('producto_id').isInt({ gt: 0 }),
  body('cantidad').optional().isFloat({ gt: 0 }),
  body('lista_precio_id').optional().isInt({ gt: 0 }),
  body('lista_precio_codigo').optional().isString().isLength({ min: 1, max: 60 }),
  body('price_list_type').optional().isString().isLength({ min: 1, max: 60 }),
];

async function resolveProductPrice(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const resolved = await priceListRepo.resolveProductPrice({
      productId: Number(req.body?.producto_id),
      priceListId: req.body?.lista_precio_id,
      priceListCode:
        req.body?.lista_precio_codigo ||
        req.body?.price_list_type ||
        req.body?.lista_precio_objetivo ||
        null,
      quantity: req.body?.cantidad,
    });
    res.json(resolved);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo resolver el precio del producto' });
  }
}

async function listOffers(req, res) {
  try {
    const rows = await repo.listOffers({
      incluirInactivas: String(req.query?.inactivas || '') === '1',
      q: req.query?.q,
      tipo: req.query?.tipo,
      producto_id: req.query?.producto_id,
      lista_precio_id: req.query?.lista_precio_id,
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
  check('packaging_image_url').optional({ nullable: true }).isString().isLength({ max: 500 }),
  check('tipo_oferta').isIn(OFFER_TYPES),
  check('producto_id').optional({ nullable: true }).isInt({ gt: 0 }),
  check('producto_ids').optional().isArray({ max: 1000 }),
  check('producto_ids.*').optional().isInt({ gt: 0 }),
  check('lista_precio_objetivo').optional().isString().isLength({ min: 1, max: 60 }),
  check('lista_precio_id').optional({ nullable: true }).isInt({ gt: 0 }),
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
  const selection = resolveOfferProductSelection(payload);
  const productoIds = selection.ids;
  const fechaDesde = payload.fecha_desde || null;
  const fechaHasta = payload.fecha_hasta || null;

  if (!(await ensureProductosExist(productoIds))) {
    return res.status(400).json({ error: 'Uno o mas productos no existen para la oferta' });
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
      packaging_image_url: payload.packaging_image_url,
      tipo_oferta: tipoOferta,
      producto_ids: productoIds,
      lista_precio_objetivo: payload.lista_precio_objetivo || 'todas',
      lista_precio_id: payload.lista_precio_id,
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
  check('packaging_image_url').optional({ nullable: true }).isString().isLength({ max: 500 }),
  check('tipo_oferta').optional().isIn(OFFER_TYPES),
  check('producto_id').optional({ nullable: true }).isInt({ gt: 0 }),
  check('producto_ids').optional().isArray({ max: 1000 }),
  check('producto_ids.*').optional().isInt({ gt: 0 }),
  check('lista_precio_objetivo').optional().isString().isLength({ min: 1, max: 60 }),
  check('lista_precio_id').optional({ nullable: true }).isInt({ gt: 0 }),
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
  const selection = resolveOfferProductSelection(payload, { requirePresence: true });
  if (selection.provided) {
    if (!(await ensureProductosExist(selection.ids))) {
      return res.status(400).json({ error: 'Uno o mas productos no existen para la oferta' });
    }
    payload.producto_ids = selection.ids;
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
    res.status(code).json({ error: e.message || 'No se pudo actualizar la oferta de precios' });
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
  body('mode').optional().isIn(['lista', 'por_lista']),
  body('porcentajes').optional().isObject(),
  body('listas').optional().isArray({ max: 200 }),
  body('listas.*.lista_codigo').optional().isString().isLength({ min: 1, max: 60 }),
  body('listas.*.lista_nombre').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('listas.*.porcentaje').optional().isFloat({ min: 0, max: 100 }),
];

async function setCommissionConfig(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const data = await repo.setCommissionConfig({
      listas: Array.isArray(req.body?.listas) ? req.body.listas : [],
      porcentajes: req.body?.porcentajes || {},
      actorUserId: getUsuarioId(req),
    });
    res.json(data);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo guardar la configuracion de comisiones' });
  }
}

// ── Payment method surcharges ──────────────────────────────────────────────

async function listPaymentSurcharges(req, res) {
  try {
    const rows = await surchargeRepo.listSurcharges({
      includeInactive: String(req.query?.inactivos || '') === '1',
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener los recargos de pago' });
  }
}

const validateCreateSurcharge = [
  body('metodo_pago_id').isInt({ gt: 0 }),
  body('lista_precio_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('tipo').isIn(['recargo', 'descuento']),
  body('valor_pct').isFloat({ gt: 0, max: 100 }),
  body('activo').optional().isBoolean(),
];

async function createPaymentSurcharge(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const created = await surchargeRepo.createSurcharge(req.body || {});
    res.status(201).json(created);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo crear el recargo de pago' });
  }
}

const validateUpdateSurcharge = [
  body('metodo_pago_id').optional().isInt({ gt: 0 }),
  body('lista_precio_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('tipo').optional().isIn(['recargo', 'descuento']),
  body('valor_pct').optional().isFloat({ gt: 0, max: 100 }),
  body('activo').optional().isBoolean(),
];

async function updatePaymentSurcharge(req, res) {
  if (!handleValidation(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const updated = await surchargeRepo.updateSurcharge(id, req.body || {});
    res.json(updated);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo actualizar el recargo de pago' });
  }
}

async function deletePaymentSurcharge(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const deleted = await surchargeRepo.deleteSurcharge(id);
    res.json(deleted);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo eliminar el recargo de pago' });
  }
}

module.exports = {
  listPriceLists,
  createPriceList: [...validateCreatePriceList, createPriceList],
  updatePriceList: [...validateUpdatePriceList, updatePriceList],
  deletePriceList,
  listPriceListQuantityRules,
  createQuantityRule: [...validateCreateQuantityRule, createQuantityRule],
  updateQuantityRule: [...validateUpdateQuantityRule, updateQuantityRule],
  deleteQuantityRule,
  resolveProductPrice: [...validateResolveProductPrice, resolveProductPrice],
  listOffers,
  createOffer: [...validateCreateOffer, createOffer],
  updateOffer: [...validateUpdateOffer, updateOffer],
  getCommissionConfig,
  setCommissionConfig: [...validateSetCommissionConfig, setCommissionConfig],
  listPaymentSurcharges,
  createPaymentSurcharge: [...validateCreateSurcharge, createPaymentSurcharge],
  updatePaymentSurcharge: [...validateUpdateSurcharge, updatePaymentSurcharge],
  deletePaymentSurcharge,
};
