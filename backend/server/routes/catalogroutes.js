const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/catalogcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { exportLimiter, publicLimiter } = require('../middlewares/security');

// Catálogo público
router.get('/catalogo', publicLimiter, ctrl.getCatalogPublic);
router.get('/catalogo/public/:slug', publicLimiter, ctrl.getCatalogPublicBySlug);

// Configuración de catálogo (admin)
router.get('/catalogo/config', auth, requireRole(['admin', 'gerente']), ctrl.getCatalogConfig);
router.put('/catalogo/config', auth, requireRole(['admin', 'gerente']), ctrl.updateCatalogConfig);
router.post('/catalogo/emitir', auth, requireRole(['admin', 'gerente']), ctrl.emitCatalog);
router.get('/catalogo/excel', exportLimiter, auth, requireRole(['admin', 'gerente']), ctrl.exportCatalogExcel);
router.get('/catalogo/pdf', exportLimiter, auth, requireRole(['admin', 'gerente']), ctrl.exportCatalogPdf);
router.post(
  '/catalogo/whatsapp/campanias/enviar',
  exportLimiter,
  auth,
  requireRole(['admin', 'gerente']),
  ctrl.sendCatalogWhatsappCampaign
);
router.get(
  '/catalogo/whatsapp/campanias',
  auth,
  requireRole(['admin', 'gerente']),
  ctrl.listCatalogWhatsappCampaigns
);
router.get(
  '/catalogo/whatsapp/campanias/:id',
  auth,
  requireRole(['admin', 'gerente']),
  ctrl.getCatalogWhatsappCampaign
);

module.exports = router;
