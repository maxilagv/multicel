const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/aicontroller');
const reportCtrl = require('../controllers/reportaicontroller');
const auth = require('../middlewares/authmiddleware');
const { requireFeature } = require('../middlewares/licenseMiddleware');

router.get('/ai/forecast', auth, requireFeature('ai'), ctrl.forecast);
router.get('/ai/forecast/:id/serie', auth, requireFeature('ai'), ctrl.forecastDetail);
router.get('/ai/stockouts', auth, requireFeature('ai'), ctrl.stockouts);
router.get('/ai/anomalias', auth, requireFeature('ai'), ctrl.anomalias);
router.get('/ai/precios', auth, requireFeature('ai'), ctrl.precios);
router.get('/ai/insights', auth, requireFeature('ai'), ctrl.insights);
router.get('/ai/report-data', auth, requireFeature('ai'), reportCtrl.reportData);
router.post('/ai/report-summary', auth, requireFeature('ai'), reportCtrl.reportSummary);
router.post('/ai/predictions-summary', auth, requireFeature('ai'), ctrl.predictionsSummary);

module.exports = router;
