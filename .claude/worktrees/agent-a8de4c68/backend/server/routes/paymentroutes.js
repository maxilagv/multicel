const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/paymentcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

router.get('/pagos', auth, ctrl.list);
router.post('/pagos', auth, requireRole(['admin','gerente','vendedor']), ctrl.create);

module.exports = router;
