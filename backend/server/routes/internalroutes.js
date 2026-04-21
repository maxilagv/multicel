const express = require('express');
const router = express.Router();
const internalAuth = require('../middlewares/internalApiKeyMiddleware');
const { requireInternalPermission } = require('../middlewares/internalPermissionMiddleware');
const ctrl = require('../controllers/internalcontroller');

router.post('/internal/crm/actividades', internalAuth, ctrl.createActivity);
router.post('/internal/whatsapp/texto', internalAuth, ctrl.sendText);
router.post('/internal/whatsapp/plantilla', internalAuth, ctrl.sendTemplate);
router.get(
  '/internal/ai/datasets',
  internalAuth,
  requireInternalPermission('ai_data_gateway'),
  ctrl.getAiDatasetCatalog
);
router.get(
  '/internal/ai/datasets/:dataset',
  internalAuth,
  requireInternalPermission('ai_data_gateway'),
  ctrl.getAiDataset
);
router.get(
  '/internal/ai/executive-summary-input',
  internalAuth,
  requireInternalPermission('ai_data_gateway'),
  ctrl.getExecutiveSummaryInput
);

module.exports = router;
