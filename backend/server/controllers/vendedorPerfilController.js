const { check, validationResult } = require('express-validator');
const repo = require('../db/repositories/vendedorPerfilRepository');
const { buildSaleVisibility } = require('../lib/saleVisibility');

async function list(req, res) {
  try {
    const includeInactive = String(req.query.inactivos || '') === '1';
    const rows = await repo.list({ includeInactive });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener los perfiles de vendedor' });
  }
}

const validateCreate = [
  check('nombre').trim().notEmpty().withMessage('El nombre es obligatorio').isLength({ min: 1, max: 100 }),
  check('color').optional({ nullable: true }).matches(/^#[0-9a-fA-F]{6}$/).withMessage('Color inválido (formato #RRGGBB)'),
  check('emoji').optional({ nullable: true }).isLength({ max: 10 }),
  check('usuario_id').optional({ nullable: true }).isInt({ gt: 0 }),
];

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { nombre, color, emoji, usuario_id } = req.body || {};
  try {
    const row = await repo.create({
      nombre: String(nombre || '').trim(),
      color: color || '#6366f1',
      emoji: emoji || null,
      usuario_id: usuario_id ? Number(usuario_id) : null,
    });
    res.status(201).json({ id: row.id });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear el perfil' });
  }
}

const validateUpdate = [
  check('nombre').optional().trim().isLength({ min: 1, max: 100 }),
  check('color').optional({ nullable: true }).matches(/^#[0-9a-fA-F]{6}$/).withMessage('Color inválido'),
  check('emoji').optional({ nullable: true }).isLength({ max: 10 }),
  check('activo').optional().isBoolean(),
];

async function update(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

  const { nombre, color, emoji, activo } = req.body || {};
  try {
    const updated = await repo.update(id, { nombre, color, emoji, activo });
    if (!updated) return res.status(404).json({ error: 'Perfil no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar el perfil' });
  }
}

async function ranking(req, res) {
  try {
    const { desde, hasta } = req.query || {};
    const visibility = await buildSaleVisibility(req);
    const rows = await repo.ranking({
      desde: desde ? String(desde) : undefined,
      hasta: hasta ? String(hasta) : undefined,
      visibility,
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el ranking' });
  }
}

async function recentSales(req, res) {
  try {
    const limit = req.query.limit || 10;
    const visibility = await buildSaleVisibility(req);
    const rows = await repo.recentSales(limit, visibility);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener las ventas recientes' });
  }
}

module.exports = {
  list,
  create: [...validateCreate, create],
  update: [...validateUpdate, update],
  ranking,
  recentSales,
};
