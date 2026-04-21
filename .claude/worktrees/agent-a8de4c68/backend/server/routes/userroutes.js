const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/usercontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

// Admin only
router.get('/usuarios', auth, requireRole(['admin']), ctrl.list);
router.get('/usuarios/vendedores', auth, requireRole(['admin']), ctrl.listVendedores);
router.get('/usuarios/rendimiento', auth, requireRole(['admin']), ctrl.sellerPerformance);
router.post('/usuarios', auth, requireRole(['admin']), ctrl.create);
router.put('/usuarios/:id', auth, requireRole(['admin']), ctrl.update);
router.get('/roles', auth, requireRole(['admin']), ctrl.roles);
router.get('/usuarios/:id/depositos', auth, requireRole(['admin']), ctrl.getUserDepositos);
router.put('/usuarios/:id/depositos', auth, requireRole(['admin']), ctrl.setUserDepositos);

module.exports = router;
