const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/ownercontroller');
const {
  requireClienteAccessQuery,
  requireClienteAccessBody,
} = require('../middlewares/clientAccessMiddleware');

router.get(
  '/duenio/cobranzas/ranking-riesgo',
  auth,
  requireRole(['admin', 'gerente', 'gerente_sucursal', 'vendedor']),
  ctrl.riskRanking
);
router.post('/duenio/cobranzas/recordatorios/auto', auth, requireRole(['admin', 'gerente']), ctrl.autoReminders);
router.get(
  '/duenio/cobranzas/recordatorios',
  auth,
  requireRole(['admin', 'gerente', 'gerente_sucursal', 'vendedor']),
  requireClienteAccessQuery('cliente_id'),
  ctrl.listReminders
);
router.post(
  '/duenio/cobranzas/recordatorios',
  auth,
  requireRole(['admin', 'gerente', 'gerente_sucursal', 'vendedor']),
  requireClienteAccessBody('cliente_id', { required: true }),
  ctrl.createReminder
);
router.get(
  '/duenio/cobranzas/promesas',
  auth,
  requireRole(['admin', 'gerente', 'gerente_sucursal', 'vendedor']),
  requireClienteAccessQuery('cliente_id'),
  ctrl.listPromises
);
router.post(
  '/duenio/cobranzas/promesas',
  auth,
  requireRole(['admin', 'gerente', 'gerente_sucursal', 'vendedor']),
  requireClienteAccessBody('cliente_id', { required: true }),
  ctrl.createPromise
);
router.put(
  '/duenio/cobranzas/promesas/:id/estado',
  auth,
  requireRole(['admin', 'gerente', 'gerente_sucursal', 'vendedor']),
  ctrl.updatePromiseStatus
);

router.get('/duenio/margenes/tiempo-real', auth, requireRole(['admin', 'gerente']), ctrl.marginsRealtime);

router.get('/duenio/repricing/reglas', auth, requireRole(['admin', 'gerente']), ctrl.listRepricingRules);
router.post('/duenio/repricing/reglas', auth, requireRole(['admin', 'gerente']), ctrl.createRepricingRule);
router.put('/duenio/repricing/reglas/:id', auth, requireRole(['admin', 'gerente']), ctrl.updateRepricingRule);
router.post('/duenio/repricing/preview', auth, requireRole(['admin', 'gerente']), ctrl.repricingPreview);
router.post('/duenio/repricing/aplicar', auth, requireRole(['admin', 'gerente']), ctrl.repricingApply);
router.post('/duenio/precios-masivos/preview', auth, requireRole(['admin', 'gerente']), ctrl.bulkPricePreview);
router.post('/duenio/precios-masivos/aplicar', auth, requireRole(['admin', 'gerente']), ctrl.bulkPriceApply);

router.get('/duenio/centro-mando', auth, requireRole(['admin', 'gerente']), ctrl.commandCenter);
router.get('/duenio/alertas', auth, requireRole(['admin', 'gerente']), ctrl.listAlerts);
router.post('/duenio/alertas/:id/dismiss', auth, requireRole(['admin', 'gerente']), ctrl.dismissAlert);

router.get('/duenio/fiscal-ar/reglas', auth, requireRole(['admin', 'gerente']), ctrl.listFiscalRules);
router.post('/duenio/fiscal-ar/reglas', auth, requireRole(['admin', 'gerente']), ctrl.createFiscalRule);
router.put('/duenio/fiscal-ar/reglas/:id', auth, requireRole(['admin', 'gerente']), ctrl.updateFiscalRule);
router.post('/duenio/fiscal-ar/simular', auth, requireRole(['admin', 'gerente']), ctrl.simulateFiscal);

router.get('/duenio/listas-precios', auth, requireRole(['admin', 'gerente']), ctrl.listPriceLists);
router.post('/duenio/listas-precios', auth, requireRole(['admin', 'gerente']), ctrl.createPriceList);
router.put('/duenio/listas-precios/:id', auth, requireRole(['admin', 'gerente']), ctrl.updatePriceList);
router.get('/duenio/listas-precios/:id/reglas', auth, requireRole(['admin', 'gerente']), ctrl.listPriceListRules);
router.post('/duenio/listas-precios/:id/reglas', auth, requireRole(['admin', 'gerente']), ctrl.createPriceListRule);
router.put('/duenio/listas-precios/reglas/:ruleId', auth, requireRole(['admin', 'gerente']), ctrl.updatePriceListRule);
router.post('/duenio/listas-precios/:id/preview', auth, requireRole(['admin', 'gerente']), ctrl.previewPriceList);

router.get('/duenio/integraciones/canales', auth, requireRole(['admin', 'gerente']), ctrl.listChannelIntegrations);
router.put('/duenio/integraciones/canales/:canal', auth, requireRole(['admin', 'gerente']), ctrl.upsertChannelIntegration);
router.post('/duenio/integraciones/canales/:canal/sync', auth, requireRole(['admin', 'gerente']), ctrl.queueChannelSync);
router.get('/duenio/integraciones/jobs', auth, requireRole(['admin', 'gerente']), ctrl.listChannelJobs);

router.get('/duenio/beta/empresas', auth, requireRole(['admin', 'gerente']), ctrl.listBetaCompanies);
router.post('/duenio/beta/empresas', auth, requireRole(['admin', 'gerente']), ctrl.createBetaCompany);
router.post('/duenio/beta/empresas/:id/feedback', auth, requireRole(['admin', 'gerente']), ctrl.createBetaFeedback);
router.get('/duenio/beta/metricas', auth, requireRole(['admin', 'gerente']), ctrl.betaMetrics);

router.get('/duenio/release-train/ciclos', auth, requireRole(['admin', 'gerente']), ctrl.listReleaseCycles);
router.post('/duenio/release-train/ciclos', auth, requireRole(['admin', 'gerente']), ctrl.createReleaseCycle);
router.post('/duenio/release-train/ciclos/:id/entries', auth, requireRole(['admin', 'gerente']), ctrl.addReleaseEntry);
router.post('/duenio/release-train/ciclos/:id/cerrar', auth, requireRole(['admin', 'gerente']), ctrl.closeReleaseCycle);

module.exports = router;
