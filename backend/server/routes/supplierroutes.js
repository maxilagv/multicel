const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/suppliercontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

router.get('/proveedores', auth, requireRole(['admin','gerente']), ctrl.list);
router.get('/proveedores/:id/compras', auth, requireRole(['admin','gerente']), ctrl.compras);
router.get('/proveedores/cuenta-empresa/activas', auth, requireRole(['admin','gerente','vendedor']), ctrl.cuentasEmpresaActivas);
router.get('/proveedores/:id/cuenta-corriente', auth, requireRole(['admin','gerente']), ctrl.cuentaCorriente);
router.post('/proveedores', auth, requireRole(['admin','gerente']), ctrl.create);
router.put('/proveedores/:id', auth, requireRole(['admin','gerente']), ctrl.update);

module.exports = router;
