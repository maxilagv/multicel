const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inventorycontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const {
  requireDepositoAccessFromBody,
} = require('../middlewares/depositoAccessMiddleware');

router.get('/inventario', auth, ctrl.list);
router.get('/inventario/movimientos', auth, ctrl.movimientos);
router.post(
  '/inventario/ajustes',
  auth,
  requireRole(['admin', 'gerente']),
  requireDepositoAccessFromBody(['deposito_id']),
  ctrl.ajuste,
);
router.post(
  '/inventario/reservar',
  auth,
  requireRole(['admin', 'gerente', 'vendedor']),
  requireDepositoAccessFromBody(['deposito_id']),
  ctrl.reservar,
);
router.post(
  '/inventario/liberar',
  auth,
  requireRole(['admin', 'gerente', 'vendedor']),
  requireDepositoAccessFromBody(['deposito_id']),
  ctrl.liberar,
);
router.post(
  '/inventario/transferencias',
  auth,
  requireRole(['admin', 'gerente']),
  requireDepositoAccessFromBody(['deposito_origen_id', 'deposito_destino_id']),
  ctrl.transferir,
);

module.exports = router;
