const { check, validationResult } = require('express-validator');
const repo = require('../db/repositories/depositoRepository');
const { buildDepositoVisibility } = require('../lib/depositoScope');

async function list(req, res) {
  try {
    const includeInactive = String(req.query.inactivos || '').toLowerCase() === '1';
    let rows = await repo.list({ includeInactive });
    const visibility = await buildDepositoVisibility(req);
    if (visibility.mode === 'restricted') {
      const allowedSet = new Set(visibility.ids);
      rows = rows.filter((row) => allowedSet.has(Number(row.id)));
    }
    res.json(rows);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudieron obtener los depositos' });
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
    .withMessage('El codigo debe tener hasta 50 caracteres'),
  check('direccion')
    .optional({ nullable: true })
    .isLength({ max: 500 })
    .withMessage('La direccion es demasiado larga'),
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
      return res.status(409).json({ error: 'Ya existe un deposito con ese nombre o codigo' });
    }
    res.status(500).json({ error: 'No se pudo crear el deposito' });
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
    .withMessage('El codigo debe tener hasta 50 caracteres'),
  check('direccion')
    .optional({ nullable: true })
    .isLength({ max: 500 })
    .withMessage('La direccion es demasiado larga'),
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
    return res.status(400).json({ error: 'ID invalido' });
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
    if (!updated) return res.status(404).json({ error: 'Deposito no encontrado' });
    res.json({ message: 'Deposito actualizado correctamente' });
  } catch (e) {
    if (e && e.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un deposito con ese nombre o codigo' });
    }
    res.status(500).json({ error: 'No se pudo actualizar el deposito' });
  }
}

async function deactivate(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }

  try {
    const row = await repo.deactivate(id);
    if (!row) return res.status(404).json({ error: 'Deposito no encontrado' });
    res.json({ message: 'Deposito desactivado correctamente' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo desactivar el deposito' });
  }
}

async function getUsuarios(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    const rows = await repo.getUsuariosDeposito(id);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener los usuarios del deposito' });
  }
}

async function setUsuarios(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  const items = Array.isArray(req.body?.usuarios) ? req.body.usuarios : [];
  try {
    await repo.setUsuariosDeposito(id, items);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron actualizar los usuarios del deposito' });
  }
}

module.exports = {
  list,
  create: [...validateCreate, create],
  update: [...validateUpdate, update],
  deactivate,
  getUsuarios,
  setUsuarios,
};
