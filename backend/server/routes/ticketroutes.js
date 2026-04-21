const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/ticketcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { requireFeature } = require('../middlewares/licenseMiddleware');

router.get('/tickets', auth, requireFeature('postventa'), ctrl.list);
router.post('/tickets', auth, requireFeature('postventa'), requireRole(['admin','gerente','vendedor']), ctrl.create);
router.put('/tickets/:id', auth, requireFeature('postventa'), requireRole(['admin','gerente','vendedor']), ctrl.update);
router.get('/tickets/:id/eventos', auth, requireFeature('postventa'), ctrl.listEventos);
router.post('/tickets/:id/eventos', auth, requireFeature('postventa'), requireRole(['admin','gerente','vendedor']), ctrl.crearEvento);

module.exports = router;
