const express = require('express');
const router = express.Router();
const productController = require('../controllers/productcontroller.js');
const authMiddleware = require('../middlewares/authmiddleware.js');
const { requireRole } = require('../middlewares/roleMiddleware');
const { requireApproval, productPriceChangeEvaluator } = require('../middlewares/approvalMiddleware');
const { uploadSingle } = require('../middlewares/uploadMiddleware');

// Obtener productos (no requiere autenticación para GET)
router.get('/productos', productController.getProducts);
router.get(
  '/productos/codigo/:codigo',
  authMiddleware,
  requireRole(['admin', 'gerente', 'vendedor']),
  productController.getProductByCodigo
);
router.get(
  '/productos/:id/historial',
  authMiddleware,
  requireRole(['admin', 'gerente']),
  productController.getProductHistory
);

// Agregar producto (requiere autenticación + rol)
router.post('/productos', authMiddleware, requireRole(['admin', 'gerente']), productController.createProduct);

// Importar productos desde Excel/CSV
router.post(
  '/productos/import',
  authMiddleware,
  requireRole(['admin', 'gerente']),
  uploadSingle('file'),
  productController.importProducts
);

// Editar producto (requiere autenticación + rol)
router.put(
  '/productos/:id',
  authMiddleware,
  requireRole(['admin', 'gerente']),
  requireApproval('product_price_update', productPriceChangeEvaluator),
  productController.updateProduct
);

// Eliminar producto (requiere autenticación + rol admin)
router.delete('/productos/:id', authMiddleware, requireRole(['admin']), productController.deleteProduct);

module.exports = router;
