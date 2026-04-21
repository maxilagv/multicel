const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/configcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

// Configuración de parámetros del sistema
router.get('/config/dolar-blue', auth, ctrl.getDolarBlue);
router.put('/config/dolar-blue', auth, ctrl.setDolarBlue);
router.get('/config/deuda-umbral', auth, ctrl.getDebtThreshold);
router.put('/config/deuda-umbral', auth, ctrl.setDebtThreshold);
router.get('/config/price-labels', auth, requireRole(['admin', 'gerente']), ctrl.getPriceLabels);
router.put('/config/price-labels', auth, requireRole(['admin', 'gerente']), ctrl.setPriceLabels);
router.get('/config/ranking-vendedores', auth, requireRole(['admin']), ctrl.getRankingMetric);
router.put('/config/ranking-vendedores', auth, requireRole(['admin']), ctrl.setRankingMetric);

module.exports = router;
