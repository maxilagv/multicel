const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/purchasecontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const {
  requireDepositoAccessFromBody,
} = require('../middlewares/depositoAccessMiddleware');
const { uploadSingle } = require('../middlewares/uploadMiddleware');
const { uploadLimiter } = require('../middlewares/security');

router.get('/compras', auth, ctrl.list);

// Plantilla Excel de compra de fundas (genera + descarga)
router.get(
  '/compras/plantilla-fundas',
  auth,
  requireRole(['admin', 'gerente']),
  ctrl.descargarPlantillaFundas
);
// Importar plantilla Excel de fundas completada por el cliente
router.post(
  '/compras/importar-plantilla-fundas',
  uploadLimiter,
  auth,
  requireRole(['admin', 'gerente']),
  uploadSingle('file'),
  ctrl.importarPlantillaFundas
);

router.post(
  '/compras/importar-excel',
  uploadLimiter,
  auth,
  requireRole(['admin', 'gerente']),
  uploadSingle('file'),
  ctrl.importExcel
);
router.post('/compras', auth, requireRole(['admin','gerente']), ctrl.create);
router.get('/compras/:id/detalle', auth, ctrl.detalle);
router.post(
  '/compras/:id/recibir',
  auth,
  requireRole(['admin','gerente']),
  requireDepositoAccessFromBody(['deposito_id']),
  ctrl.recibir,
);

module.exports = router;
