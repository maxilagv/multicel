const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/vendorPayrollController');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { requireFeature } = require('../middlewares/licenseMiddleware');

router.get(
  '/vendedores/sueldos',
  auth,
  requireFeature('usuarios'),
  requireRole(['admin', 'gerente']),
  ctrl.listSueldos
);
router.get(
  '/vendedores/mi-resumen',
  auth,
  requireFeature('usuarios'),
  requireRole(['vendedor']),
  ctrl.miResumen
);
router.get(
  '/vendedores/:id/liquidacion',
  auth,
  requireFeature('usuarios'),
  requireRole(['admin', 'gerente', 'vendedor']),
  ctrl.getLiquidacion
);
router.get(
  '/vendedores/:id/ventas',
  auth,
  requireFeature('usuarios'),
  requireRole(['admin', 'gerente', 'vendedor']),
  ctrl.ventasDetalle
);
router.get(
  '/vendedores/:id/comision',
  auth,
  requireFeature('usuarios'),
  requireRole(['admin', 'gerente']),
  ctrl.getComision
);
router.put(
  '/vendedores/:id/comision',
  auth,
  requireFeature('usuarios'),
  requireRole(['admin', 'gerente']),
  ctrl.setComision
);
router.get(
  '/vendedores/:id/pagos',
  auth,
  requireFeature('usuarios'),
  requireRole(['admin', 'gerente', 'vendedor']),
  ctrl.listPagos
);
router.get(
  '/vendedores/:id/historial-pagos',
  auth,
  requireFeature('usuarios'),
  requireRole(['admin', 'gerente', 'vendedor']),
  ctrl.listHistorialPagos
);
router.post(
  '/vendedores/:id/pagos',
  auth,
  requireFeature('usuarios'),
  requireRole(['admin', 'gerente']),
  ctrl.createPago
);
router.get(
  '/vendedores/:id/config',
  auth,
  requireFeature('usuarios'),
  requireRole(['admin', 'gerente']),
  ctrl.getVendorConfig
);
router.put(
  '/vendedores/:id/config',
  auth,
  requireFeature('usuarios'),
  requireRole(['admin', 'gerente']),
  ctrl.setVendorConfig
);
router.get(
  '/vendedores/:id/configuracion-comision',
  auth,
  requireFeature('usuarios'),
  requireRole(['admin', 'gerente']),
  ctrl.getVendorCommissionConfig
);
router.put(
  '/vendedores/:id/configuracion-comision',
  auth,
  requireFeature('usuarios'),
  requireRole(['admin', 'gerente']),
  ctrl.setVendorCommissionConfig
);
router.get(
  '/vendedores/:id/adelantos',
  auth,
  requireFeature('usuarios'),
  requireRole(['admin', 'gerente', 'vendedor']),
  ctrl.listAdelantos
);
router.post(
  '/vendedores/:id/adelantos',
  auth,
  requireFeature('usuarios'),
  requireRole(['admin', 'gerente']),
  ctrl.createAdelanto
);

module.exports = router;
