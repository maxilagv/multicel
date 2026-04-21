const express = require('express');
const router = express.Router();
const productController = require('../controllers/productcontroller.js');
const authMiddleware = require('../middlewares/authmiddleware.js');
const authOptional = authMiddleware.optional;
const { requireRole } = require('../middlewares/roleMiddleware');
const { requireApproval, productPriceChangeEvaluator } = require('../middlewares/approvalMiddleware');
const { uploadSingle } = require('../middlewares/uploadMiddleware');
const { uploadLimiter } = require('../middlewares/security');

// Obtener productos (no requiere autenticación para GET)
router.get('/productos', authOptional, productController.getProducts);

// Generar PDF de pedido a proveedor
router.post(
  '/productos/pedido-proveedor/pdf',
  authMiddleware,
  requireRole(['admin', 'gerente']),
  productController.generarPedidoProveedorPdf
);
router.get(
  '/productos/papelera',
  authMiddleware,
  requireRole(['admin', 'gerente']),
  productController.listDeletedProducts
);
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
router.get(
  '/productos/:id/proveedor',
  authMiddleware,
  requireRole(['admin', 'gerente']),
  productController.getProductSupplier
);
router.get(
  '/productos/:id/precios',
  authMiddleware,
  requireRole(['admin', 'gerente', 'vendedor']),
  productController.getProductPriceRows
);
router.get(
  '/productos/:id/comision-preview',
  authMiddleware,
  requireRole(['admin', 'gerente', 'vendedor']),
  productController.getProductCommissionPreview
);

// Agregar producto (requiere autenticación + rol)
router.post('/productos', authMiddleware, requireRole(['admin', 'gerente']), productController.createProduct);

// Importar productos desde Excel/CSV
router.post(
  '/productos/import',
  uploadLimiter,
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
router.put(
  '/productos/:id/precios',
  authMiddleware,
  requireRole(['admin', 'gerente']),
  productController.setProductPriceRows
);

// Eliminar producto (requiere autenticación + rol admin)
router.delete('/productos/:id', authMiddleware, requireRole(['admin']), productController.deleteProduct);
router.put(
  '/productos/:id/restaurar',
  authMiddleware,
  requireRole(['admin', 'gerente']),
  productController.restoreProduct
);

module.exports = router;
