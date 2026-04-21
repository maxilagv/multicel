const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/pricingcontroller');

router.get('/precios/ofertas', auth, requireRole(['admin', 'gerente', 'vendedor']), ctrl.listOffers);
router.post('/precios/ofertas', auth, requireRole(['admin', 'gerente']), ctrl.createOffer);
router.put('/precios/ofertas/:id', auth, requireRole(['admin', 'gerente']), ctrl.updateOffer);

router.get('/precios/comisiones', auth, requireRole(['admin']), ctrl.getCommissionConfig);
router.put('/precios/comisiones', auth, requireRole(['admin']), ctrl.setCommissionConfig);

module.exports = router;
