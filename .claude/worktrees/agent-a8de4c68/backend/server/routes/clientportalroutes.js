const express = require('express');
const router = express.Router();
const clientAuth = require('../middlewares/clientAuthMiddleware');
const ctrl = require('../controllers/clientportalcontroller');

router.get('/cliente/me', clientAuth, ctrl.me);
router.get('/cliente/deuda', clientAuth, ctrl.deuda);
router.get('/cliente/compras', clientAuth, ctrl.compras);
router.get('/cliente/compras/:id', clientAuth, ctrl.compraDetalle);

module.exports = router;
