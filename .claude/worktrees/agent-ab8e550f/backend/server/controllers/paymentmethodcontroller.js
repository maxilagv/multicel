const { body, validationResult, param } = require('express-validator');
const { query } = require('../db/pg');
const repo = require('../db/repositories/paymentMethodRepository');

const validateCreate = [
  body('nombre').isString().isLength({ min: 1, max: 120 }).withMessage('nombre requerido'),
  body('moneda').optional({ nullable: true }).isString().isLength({ max: 5 }),
  body('activo').optional().isBoolean(),
  body('orden').optional().isInt({ min: 0, max: 9999 }),
];

const validateUpdate = [
  param('id').isInt({ gt: 0 }),
  body('nombre').optional().isString().isLength({ min: 1, max: 120 }),
  body('moneda').optional({ nullable: true }).isString().isLength({ max: 5 }),
  body('activo').optional().isBoolean(),
  body('orden').optional().isInt({ min: 0, max: 9999 }),
];

async function list(req, res) {
  try {
    const includeInactive = String(req.query.inactivos || '') === '1';
    const rows = await repo.list({ includeInactive });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener los metodos de pago' });
  }
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { nombre, moneda, activo, orden } = req.body || {};
    const { rows } = await query(
      'SELECT id FROM metodos_pago WHERE LOWER(nombre) = LOWER($1) LIMIT 1',
      [String(nombre)]
    );
    if (rows.length) {
      return res.status(409).json({ error: 'Ya existe un metodo con ese nombre' });
    }
    const created = await repo.create({
      nombre: String(nombre).trim(),
      moneda: moneda != null ? String(moneda).trim().toUpperCase() : null,
      activo: typeof activo === 'boolean' ? activo : true,
      orden: Number.isFinite(Number(orden)) ? Number(orden) : 0,
    });
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear el metodo de pago' });
  }
}

async function update(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const id = Number(req.params.id);
    const current = await repo.findById(id);
    if (!current) return res.status(404).json({ error: 'Metodo no encontrado' });
    if (typeof req.body?.nombre !== 'undefined') {
      const { rows } = await query(
        'SELECT id FROM metodos_pago WHERE LOWER(nombre) = LOWER($1) AND id <> $2 LIMIT 1',
        [String(req.body.nombre), id]
      );
      if (rows.length) {
        return res.status(409).json({ error: 'Ya existe un metodo con ese nombre' });
      }
    }
    const updated = await repo.update(id, {
      nombre: typeof req.body?.nombre !== 'undefined' ? String(req.body.nombre).trim() : undefined,
      moneda:
        typeof req.body?.moneda !== 'undefined'
          ? req.body.moneda
            ? String(req.body.moneda).trim().toUpperCase()
            : null
          : undefined,
      activo: typeof req.body?.activo !== 'undefined' ? Boolean(req.body.activo) : undefined,
      orden: typeof req.body?.orden !== 'undefined' ? Number(req.body.orden) : undefined,
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar el metodo de pago' });
  }
}

async function remove(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    const current = await repo.findById(id);
    if (!current) return res.status(404).json({ error: 'Metodo no encontrado' });
    const updated = await repo.deactivate(id);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo desactivar el metodo de pago' });
  }
}

module.exports = {
  list,
  create: [...validateCreate, create],
  update: [...validateUpdate, update],
  remove,
};
