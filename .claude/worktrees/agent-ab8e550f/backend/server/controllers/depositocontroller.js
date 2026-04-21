const { check, validationResult } = require('express-validator');
const repo = require('../db/repositories/depositoRepository');

async function list(req, res) {
  try {
    const includeInactive = String(req.query.inactivos || '').toLowerCase() === '1';
    const rows = await repo.list({ includeInactive });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener los depósitos' });
  }
}

const validateCreate = [
  check('nombre')
    .trim()
    .notEmpty()
    .withMessage('El nombre es obligatorio')
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  check('codigo')
    .optional({ nullable: true })
    .isLength({ max: 50 })
    .withMessage('El código debe tener hasta 50 caracteres'),
  check('direccion')
    .optional({ nullable: true })
    .isLength({ max: 500 })
    .withMessage('La dirección es demasiado larga'),
];

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { nombre, codigo, direccion } = req.body || {};

  try {
    const created = await repo.create({
      nombre: String(nombre || '').trim(),
      codigo: codigo ? String(codigo).trim() : null,
      direccion: direccion ? String(direccion).trim() : null,
    });
    return res.status(201).json({ id: created.id });
  } catch (e) {
    if (e && e.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un depósito con ese nombre o código' });
    }
    res.status(500).json({ error: 'No se pudo crear el depósito' });
  }
}

const validateUpdate = [
  check('nombre')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  check('codigo')
    .optional({ nullable: true })
    .isLength({ max: 50 })
    .withMessage('El código debe tener hasta 50 caracteres'),
  check('direccion')
    .optional({ nullable: true })
    .isLength({ max: 500 })
    .withMessage('La dirección es demasiado larga'),
  check('activo')
    .optional()
    .isBoolean()
    .withMessage('activo debe ser booleano'),
];

async function update(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const { nombre, codigo, direccion, activo } = req.body || {};

  try {
    const updated = await repo.update(id, {
      nombre: typeof nombre !== 'undefined' ? String(nombre).trim() : undefined,
      codigo: typeof codigo !== 'undefined' ? (codigo ? String(codigo).trim() : null) : undefined,
      direccion:
        typeof direccion !== 'undefined' ? (direccion ? String(direccion).trim() : null) : undefined,
      activo,
    });
    if (!updated) return res.status(404).json({ error: 'Depósito no encontrado' });
    res.json({ message: 'Depósito actualizado correctamente' });
  } catch (e) {
    if (e && e.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un depósito con ese nombre o código' });
    }
    res.status(500).json({ error: 'No se pudo actualizar el depósito' });
  }
}

async function deactivate(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const row = await repo.deactivate(id);
    if (!row) return res.status(404).json({ error: 'Depósito no encontrado' });
    res.json({ message: 'Depósito desactivado correctamente' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo desactivar el depósito' });
  }
}

module.exports = {
  list,
  create: [...validateCreate, create],
  update: [...validateUpdate, update],
  deactivate,
};

