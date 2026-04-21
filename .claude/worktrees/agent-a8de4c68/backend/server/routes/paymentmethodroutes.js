const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/paymentmethodcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

router.get('/metodos-pago', auth, requireRole(['admin', 'gerente']), ctrl.list);
router.post('/metodos-pago', auth, requireRole(['admin', 'gerente']), ctrl.create);
router.put('/metodos-pago/:id', auth, requireRole(['admin', 'gerente']), ctrl.update);
router.delete('/metodos-pago/:id', auth, requireRole(['admin', 'gerente']), ctrl.remove);

module.exports = router;
