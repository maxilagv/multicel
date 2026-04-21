const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/vendorPayrollController');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { requireFeature } = require('../middlewares/licenseMiddleware');

router.get('/vendedores/sueldos', auth, requireFeature('usuarios'), requireRole(['admin']), ctrl.listSueldos);
router.get('/vendedores/:id/ventas', auth, requireFeature('usuarios'), requireRole(['admin']), ctrl.ventasDetalle);
router.get('/vendedores/:id/comision', auth, requireFeature('usuarios'), requireRole(['admin']), ctrl.getComision);
router.put('/vendedores/:id/comision', auth, requireFeature('usuarios'), requireRole(['admin']), ctrl.setComision);
router.get('/vendedores/:id/pagos', auth, requireFeature('usuarios'), requireRole(['admin']), ctrl.listPagos);
router.post('/vendedores/:id/pagos', auth, requireFeature('usuarios'), requireRole(['admin']), ctrl.createPago);

module.exports = router;
