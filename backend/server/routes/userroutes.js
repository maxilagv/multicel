const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/usercontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

router.get('/usuarios', auth, requireRole(['admin', 'gerente_sucursal']), ctrl.list);
router.get('/usuarios/papelera', auth, requireRole(['admin', 'gerente_sucursal']), ctrl.listDeleted);
router.get('/usuarios/vendedores', auth, requireRole(['admin', 'gerente_sucursal']), ctrl.listVendedores);
router.get('/usuarios/rendimiento', auth, requireRole(['admin', 'gerente_sucursal']), ctrl.sellerPerformance);
router.post('/usuarios', auth, requireRole(['admin', 'gerente_sucursal']), ctrl.create);
router.put('/usuarios/:id', auth, requireRole(['admin', 'gerente_sucursal']), ctrl.update);
router.delete('/usuarios/:id', auth, requireRole(['admin', 'gerente_sucursal']), ctrl.remove);
router.put('/usuarios/:id/restaurar', auth, requireRole(['admin', 'gerente_sucursal']), ctrl.restore);
router.get('/roles', auth, requireRole(['admin', 'gerente_sucursal']), ctrl.roles);
router.get('/usuarios/:id/depositos', auth, requireRole(['admin', 'gerente_sucursal']), ctrl.getUserDepositos);
router.put('/usuarios/:id/depositos', auth, requireRole(['admin', 'gerente_sucursal']), ctrl.setUserDepositos);

module.exports = router;
