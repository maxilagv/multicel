const { check, validationResult } = require('express-validator');
const repo = require('../db/repositories/categoryRepository');

function parseOptionalPositiveInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseOptionalInteger(value, fallback = undefined) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

function sendKnownCategoryError(err, res, fallbackMessage) {
  if (err && err.code === '23505') {
    return res.status(409).json({ error: 'El nombre de la categoria ya existe para el mismo nivel' });
  }
  if (err && err.code === 'CATEGORY_PARENT_NOT_FOUND') {
    return res.status(400).json({ error: 'Categoria padre invalida o inactiva' });
  }
  if (err && err.code === 'CATEGORY_CYCLE') {
    return res.status(400).json({ error: err.message || 'Movimiento invalido de categoria' });
  }
  if (err && (err.code === 'CATEGORY_NOT_FOUND' || err.status === 404)) {
    return res.status(404).json({ error: 'Categoria no encontrada' });
  }
  console.error(fallbackMessage, err);
  return res.status(500).json({ error: fallbackMessage });
}

async function getCategorias(req, res) {
  try {
    const rows = await repo.getAllActive();
    res.json(rows);
  } catch (err) {
    return sendKnownCategoryError(err, res, 'No se pudo obtener categorias');
  }
}

async function getCategoriasTree(req, res) {
  try {
    const rows = await repo.getAllActiveTree();
    res.json(rows);
  } catch (err) {
    return sendKnownCategoryError(err, res, 'No se pudo obtener el arbol de categorias');
  }
}

const validateCategory = [
  check('name')
    .trim()
    .notEmpty().withMessage('El nombre es obligatorio')
    .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  check('image_url').optional().trim(),
  check('description')
    .optional()
    .isLength({ max: 2000 }).withMessage('La descripcion es demasiado larga'),
  check('parent_id')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === '' || value === null || typeof value === 'undefined') return true;
      const n = Number(value);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error('parent_id debe ser un entero >= 1');
      }
      return true;
    }),
  check('sort_order')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === '' || value === null || typeof value === 'undefined') return true;
      const n = Number(value);
      if (!Number.isInteger(n)) {
        throw new Error('sort_order debe ser un entero');
      }
      return true;
    }),
];

const validateCategoryUpdate = [
  check('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  check('image_url').optional().trim(),
  check('description')
    .optional()
    .isLength({ max: 2000 }).withMessage('La descripcion es demasiado larga'),
];

const validateCategoryMove = [
  check('parent_id')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === '' || value === null || typeof value === 'undefined') return true;
      const n = Number(value);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error('parent_id debe ser un entero >= 1 o null');
      }
      return true;
    }),
  check('sort_order')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === '' || value === null || typeof value === 'undefined') return true;
      const n = Number(value);
      if (!Number.isInteger(n)) {
        throw new Error('sort_order debe ser un entero');
      }
      return true;
    }),
];

async function createCategoria(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.error('Validacion fallida en createCategoria:', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, image_url, description } = req.body || {};
  const parentId = parseOptionalPositiveInt(req.body?.parent_id);
  const sortOrder = parseOptionalInteger(req.body?.sort_order, 0);

  try {
    const result = await repo.restoreOrInsert({
      name: String(name || '').trim(),
      image_url: String(image_url || '').trim() || null,
      description,
      parent_id: parentId,
      sort_order: sortOrder,
    });
    if (result.restored) {
      return res.status(200).json({ id: result.id, restored: true });
    }
    return res.status(201).json({ id: result.id, restored: false });
  } catch (err) {
    return sendKnownCategoryError(err, res, 'No se pudo crear la categoria');
  }
}

async function updateCategoria(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.error('Validacion fallida en updateCategoria:', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  const idNum = Number(req.params?.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }

  const { name, image_url, description } = req.body || {};
  try {
    const updated = await repo.updateCategory(idNum, { name, image_url, description });
    if (!updated) return res.status(404).json({ error: 'Categoria no encontrada' });
    return res.json({ message: 'Categoria actualizada correctamente' });
  } catch (err) {
    return sendKnownCategoryError(err, res, 'No se pudo actualizar la categoria');
  }
}

async function moveCategoria(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.error('Validacion fallida en moveCategoria:', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  const idNum = Number(req.params?.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }

  const parentId = parseOptionalPositiveInt(req.body?.parent_id);
  const sortOrder = parseOptionalInteger(req.body?.sort_order, undefined);

  try {
    const moved = await repo.moveCategory(idNum, {
      parent_id: parentId,
      sort_order: sortOrder,
    });
    return res.json({
      message: 'Categoria movida correctamente',
      data: moved,
    });
  } catch (err) {
    return sendKnownCategoryError(err, res, 'No se pudo mover la categoria');
  }
}

async function deleteCategoria(req, res) {
  const idNum = Number(req.params?.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }

  try {
    await repo.deactivateCascade(idNum);
    return res.json({ message: 'Categoria eliminada correctamente' });
  } catch (err) {
    return sendKnownCategoryError(err, res, 'No se pudo eliminar la categoria');
  }
}

module.exports = {
  getCategorias,
  getCategoriasTree,
  createCategoria: [...validateCategory, createCategoria],
  updateCategoria: [...validateCategoryUpdate, updateCategoria],
  moveCategoria: [...validateCategoryMove, moveCategoria],
  deleteCategoria,
};
