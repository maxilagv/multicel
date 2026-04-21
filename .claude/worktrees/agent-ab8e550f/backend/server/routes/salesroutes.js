const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/salescontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const {
  requireDepositoAccessForVenta,
} = require('../middlewares/depositoAccessMiddleware');

router.get('/ventas', auth, requireRole(['admin', 'gerente', 'vendedor', 'fletero']), ctrl.list);
router.post('/ventas', auth, requireRole(['admin','gerente','vendedor']), ctrl.create);
router.get('/ventas/:id/detalle', auth, requireRole(['admin', 'gerente', 'vendedor']), ctrl.detalle);
router.post(
  '/ventas/:id/entregar',
  auth,
  requireRole(['admin','gerente','vendedor']),
  requireDepositoAccessForVenta,
  ctrl.entregar,
);
router.post('/ventas/:id/ocultar', auth, requireRole(['admin','gerente','vendedor']), ctrl.ocultar);
router.post('/ventas/:id/cancelar', auth, requireRole(['admin','gerente','vendedor']), ctrl.cancelar);

module.exports = router;
