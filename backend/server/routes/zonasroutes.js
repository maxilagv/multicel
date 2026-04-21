const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/zonescontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

router.get('/zonas', auth, ctrl.list);
router.post('/zonas', auth, requireRole(['admin','gerente']), ctrl.create);
router.put('/zonas/:id', auth, requireRole(['admin','gerente']), ctrl.update);
router.delete('/zonas/:id', auth, requireRole(['admin']), ctrl.remove);

module.exports = router;
