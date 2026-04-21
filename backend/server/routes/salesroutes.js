const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/salescontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const {
  requireDepositoAccessForVenta,
} = require('../middlewares/depositoAccessMiddleware');

/**
 * @swagger
 * /api/ventas:
 *   get:
 *     summary: Listar ventas
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Listado de ventas
 */
router.get('/ventas', auth, requireRole(['admin', 'gerente', 'gerente_sucursal', 'vendedor', 'fletero']), ctrl.list);

/**
 * @swagger
 * /api/ventas:
 *   post:
 *     summary: Crear una nueva venta
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NuevaVenta'
 *     responses:
 *       201:
 *         description: Venta creada correctamente
 *       400:
 *         description: Datos invalidos
 *       409:
 *         description: Stock insuficiente
 */
router.post('/ventas', auth, requireRole(['admin','gerente','gerente_sucursal','vendedor']), ctrl.create);
router.get(
  '/ventas/:id/detalle',
  auth,
  requireRole(['admin', 'gerente', 'gerente_sucursal', 'vendedor']),
  requireDepositoAccessForVenta,
  ctrl.detalle
);
router.post(
  '/ventas/:id/entregar',
  auth,
  requireRole(['admin','gerente','gerente_sucursal','vendedor']),
  requireDepositoAccessForVenta,
  ctrl.entregar,
);
router.post(
  '/ventas/:id/ocultar',
  auth,
  requireRole(['admin','gerente','gerente_sucursal','vendedor']),
  requireDepositoAccessForVenta,
  ctrl.ocultar
);
router.post(
  '/ventas/:id/cancelar',
  auth,
  requireRole(['admin','gerente','gerente_sucursal','vendedor']),
  requireDepositoAccessForVenta,
  ctrl.cancelar
);

module.exports = router;
