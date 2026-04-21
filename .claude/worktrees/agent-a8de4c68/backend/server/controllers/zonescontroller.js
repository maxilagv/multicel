const { body, validationResult } = require('express-validator');
const repo = require('../db/repositories/zonesRepository');

const validateCreateOrUpdate = [
  body('nombre').optional().isString().isLength({ min: 2, max: 120 }),
  body('color_hex').optional().isString().isLength({ min: 4, max: 16 }),
  body('activo').optional().isBoolean(),
];

async function list(req, res) {
  try {
    const includeInactive = String(req.query?.inactivos || '') === '1';
    const rows = await repo.list({ includeInactive });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener zonas' });
  }
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { nombre, color_hex, activo } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const created = await repo.create({
      nombre: String(nombre).trim(),
      color_hex: (color_hex && String(color_hex).trim()) || '#64748B',
      activo: activo !== false,
    });
    res.status(201).json({ id: created?.id });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear la zona' });
  }
}

async function update(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID invalido' });
  try {
    const payload = { ...req.body };
    if (typeof payload.nombre === 'string') payload.nombre = payload.nombre.trim();
    if (typeof payload.color_hex === 'string') payload.color_hex = payload.color_hex.trim();
    const updated = await repo.update(id, payload);
    if (!updated) return res.status(404).json({ error: 'Zona no encontrada' });
    res.json({ message: 'Zona actualizada' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar la zona' });
  }
}

async function remove(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID invalido' });
  try {
    const updated = await repo.deactivate(id);
    if (!updated) return res.status(404).json({ error: 'Zona no encontrada' });
    res.json({ message: 'Zona desactivada' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo desactivar la zona' });
  }
}

module.exports = {
  list,
  create: [...validateCreateOrUpdate, create],
  update: [...validateCreateOrUpdate, update],
  remove,
};
