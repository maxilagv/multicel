const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/clientcontroller');
const clientAuthCtrl = require('../controllers/clientauthcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

// Auth clientes (publico)
router.post('/clientes/registro', clientAuthCtrl.register);
router.post('/clientes/login', clientAuthCtrl.login);
router.post('/clientes/refresh', clientAuthCtrl.refreshToken);
router.post('/clientes/logout', clientAuthCtrl.logout);

router.get('/clientes', auth, ctrl.list);
router.post('/clientes', auth, requireRole(['admin','gerente','vendedor']), ctrl.create);
router.put('/clientes/:id', auth, requireRole(['admin','gerente','vendedor']), ctrl.update);
router.delete('/clientes/:id', auth, requireRole(['admin']), ctrl.remove);

// Credenciales de acceso de cliente (admin)
router.get('/clientes/:id/credenciales', auth, requireRole(['admin', 'gerente']), clientAuthCtrl.getAccessStatus);
router.post('/clientes/:id/credenciales', auth, requireRole(['admin', 'gerente']), clientAuthCtrl.setAccessPassword);

// Deudas iniciales de clientes (deuda anterior)
router.get('/clientes/:id/deudas-iniciales', auth, ctrl.listInitialDebts);
router.post(
  '/clientes/:id/deudas-iniciales',
  auth,
  requireRole(['admin', 'gerente', 'vendedor']),
  ctrl.addInitialDebt
);

router.get(
  '/clientes/:id/deudas-iniciales/pagos',
  auth,
  ctrl.listInitialDebtPayments
);
router.post(
  '/clientes/:id/deudas-iniciales/pagos',
  auth,
  requireRole(['admin', 'gerente', 'vendedor']),
  ctrl.addInitialDebtPayment
);
router.delete(
  '/clientes/:id/deudas-iniciales/pagos/:pagoId',
  auth,
  requireRole(['admin', 'gerente', 'vendedor']),
  ctrl.deleteInitialDebtPayment
);

router.get('/clientes/:id/historial-pagos', auth, ctrl.listPaymentHistory);
router.delete(
  '/clientes/:id/pagos/:pagoId',
  auth,
  requireRole(['admin', 'gerente', 'vendedor']),
  ctrl.deleteSalePayment
);

module.exports = router;
