const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categorycontroller');
const authMiddleware = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

// Lectura publica (compatibilidad)
router.get('/categorias', categoryController.getCategorias);
router.get('/categorias/tree', categoryController.getCategoriasTree);

// Gestion de categorias
router.post('/categorias', authMiddleware, requireRole(['admin', 'gerente']), categoryController.createCategoria);
router.put('/categorias/:id', authMiddleware, requireRole(['admin', 'gerente']), categoryController.updateCategoria);
router.patch('/categorias/:id/move', authMiddleware, requireRole(['admin', 'gerente']), categoryController.moveCategoria);
router.delete('/categorias/:id', authMiddleware, requireRole(['admin']), categoryController.deleteCategoria);

module.exports = router;
