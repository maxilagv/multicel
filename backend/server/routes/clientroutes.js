const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/clientcontroller');
const clientAuthCtrl = require('../controllers/clientauthcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { uploadSingle } = require('../middlewares/uploadMiddleware');
const { uploadLimiter } = require('../middlewares/security');
const { requireClienteAccessParam } = require('../middlewares/clientAccessMiddleware');

// Auth clientes (publico)
router.post('/clientes/registro', clientAuthCtrl.register);
router.post('/clientes/login', clientAuthCtrl.login);
router.post('/clientes/refresh', clientAuthCtrl.refreshToken);
router.post('/clientes/logout', clientAuthCtrl.logout);

router.get('/clientes', auth, ctrl.list);
router.get(
  '/clientes/responsables-visibles',
  auth,
  requireRole(['admin', 'gerente', 'gerente_sucursal', 'vendedor']),
  ctrl.listVisibleResponsables
);
router.post(
  '/clientes/recalcular-segmentos',
  auth,
  requireRole(['admin', 'gerente']),
  ctrl.recalculateSegments
);
router.post(
  '/clientes/importar-excel',
  uploadLimiter,
  auth,
  requireRole(['admin', 'gerente']),
  uploadSingle('file'),
  ctrl.importExcel
);
router.get('/clientes/papelera', auth, requireRole(['admin', 'gerente']), ctrl.listDeleted);
router.post('/clientes', auth, requireRole(['admin','gerente','gerente_sucursal','vendedor']), ctrl.create);
router.put(
  '/clientes/:id',
  auth,
  requireRole(['admin','gerente','gerente_sucursal','vendedor']),
  requireClienteAccessParam('id'),
  ctrl.update
);
router.delete('/clientes/:id', auth, requireRole(['admin']), ctrl.remove);
router.put('/clientes/:id/restaurar', auth, requireRole(['admin', 'gerente']), ctrl.restore);

// Credenciales de acceso de cliente (admin)
router.get('/clientes/:id/credenciales', auth, requireRole(['admin', 'gerente']), clientAuthCtrl.getAccessStatus);
router.post('/clientes/:id/credenciales', auth, requireRole(['admin', 'gerente']), clientAuthCtrl.setAccessPassword);

// Deudas iniciales de clientes (deuda anterior)
router.get('/clientes/:id/deudas-iniciales', auth, requireClienteAccessParam('id'), ctrl.listInitialDebts);
router.post(
  '/clientes/:id/deudas-iniciales',
  auth,
  requireRole(['admin', 'gerente', 'gerente_sucursal', 'vendedor']),
  requireClienteAccessParam('id'),
  ctrl.addInitialDebt
);

router.get(
  '/clientes/:id/deudas-iniciales/pagos',
  auth,
  requireClienteAccessParam('id'),
  ctrl.listInitialDebtPayments
);
router.post(
  '/clientes/:id/deudas-iniciales/pagos',
  auth,
  requireRole(['admin', 'gerente', 'gerente_sucursal', 'vendedor']),
  requireClienteAccessParam('id'),
  ctrl.addInitialDebtPayment
);
router.delete(
  '/clientes/:id/deudas-iniciales/pagos/:pagoId',
  auth,
  requireRole(['admin', 'gerente', 'gerente_sucursal', 'vendedor']),
  requireClienteAccessParam('id'),
  ctrl.deleteInitialDebtPayment
);

router.get('/clientes/:id/historial-pagos', auth, requireClienteAccessParam('id'), ctrl.listPaymentHistory);
router.delete(
  '/clientes/:id/pagos/:pagoId',
  auth,
  requireRole(['admin', 'gerente', 'gerente_sucursal', 'vendedor']),
  requireClienteAccessParam('id'),
  ctrl.deleteSalePayment
);

module.exports = router;
