const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/pricingcontroller');

router.get('/precios/listas', auth, requireRole(['admin', 'gerente', 'vendedor']), ctrl.listPriceLists);
router.post('/precios/listas', auth, requireRole(['admin', 'gerente']), ctrl.createPriceList);
router.put('/precios/listas/:id', auth, requireRole(['admin', 'gerente']), ctrl.updatePriceList);
router.delete('/precios/listas/:id', auth, requireRole(['admin', 'gerente']), ctrl.deletePriceList);

router.get(
  '/precios/listas/:id/reglas-cantidad',
  auth,
  requireRole(['admin', 'gerente', 'vendedor']),
  ctrl.listPriceListQuantityRules
);
router.post(
  '/precios/listas/:id/reglas-cantidad',
  auth,
  requireRole(['admin', 'gerente']),
  ctrl.createQuantityRule
);
router.put(
  '/precios/reglas-cantidad/:id',
  auth,
  requireRole(['admin', 'gerente']),
  ctrl.updateQuantityRule
);
router.delete(
  '/precios/reglas-cantidad/:id',
  auth,
  requireRole(['admin', 'gerente']),
  ctrl.deleteQuantityRule
);

router.post('/precios/resolver', auth, requireRole(['admin', 'gerente', 'vendedor']), ctrl.resolveProductPrice);

router.get('/precios/ofertas', auth, requireRole(['admin', 'gerente', 'vendedor']), ctrl.listOffers);
router.post('/precios/ofertas', auth, requireRole(['admin', 'gerente']), ctrl.createOffer);
router.put('/precios/ofertas/:id', auth, requireRole(['admin', 'gerente']), ctrl.updateOffer);

router.get('/precios/comisiones', auth, requireRole(['admin']), ctrl.getCommissionConfig);
router.put('/precios/comisiones', auth, requireRole(['admin']), ctrl.setCommissionConfig);

router.get('/precios/recargos-pago', auth, requireRole(['admin', 'gerente', 'vendedor']), ctrl.listPaymentSurcharges);
router.post('/precios/recargos-pago', auth, requireRole(['admin', 'gerente']), ctrl.createPaymentSurcharge);
router.put('/precios/recargos-pago/:id', auth, requireRole(['admin', 'gerente']), ctrl.updatePaymentSurcharge);
router.delete('/precios/recargos-pago/:id', auth, requireRole(['admin', 'gerente']), ctrl.deletePaymentSurcharge);

module.exports = router;
