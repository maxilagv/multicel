const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/suppliercontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

router.get('/proveedores', auth, ctrl.list);
router.get('/proveedores/:id/compras', auth, ctrl.compras);
router.post('/proveedores', auth, requireRole(['admin','gerente']), ctrl.create);
router.put('/proveedores/:id', auth, requireRole(['admin','gerente']), ctrl.update);

module.exports = router;
