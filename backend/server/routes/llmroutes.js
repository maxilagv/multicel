const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/llmcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { requireFeature } = require('../middlewares/licenseMiddleware');
const { aiLimiter } = require('../middlewares/security');

router.post(
  '/ai/crm-suggestion',
  aiLimiter,
  auth,
  requireFeature('ai'),
  requireRole(['admin', 'gerente', 'vendedor']),
  ctrl.crmSuggestion
);

router.post(
  '/ai/ticket-reply',
  aiLimiter,
  auth,
  requireFeature('ai'),
  requireRole(['admin', 'gerente', 'vendedor']),
  ctrl.ticketReply
);

router.post(
  '/ai/explain-forecast',
  aiLimiter,
  auth,
  requireFeature('ai'),
  requireRole(['admin', 'gerente']),
  ctrl.explainForecast
);

module.exports = router;
