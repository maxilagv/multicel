const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/catalogcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

// Catálogo público
router.get('/catalogo', ctrl.getCatalogPublic);
router.get('/catalogo/public/:slug', ctrl.getCatalogPublicBySlug);

// Configuración de catálogo (admin)
router.get('/catalogo/config', auth, requireRole(['admin', 'gerente']), ctrl.getCatalogConfig);
router.put('/catalogo/config', auth, requireRole(['admin', 'gerente']), ctrl.updateCatalogConfig);
router.post('/catalogo/emitir', auth, requireRole(['admin', 'gerente']), ctrl.emitCatalog);
router.get('/catalogo/excel', auth, requireRole(['admin', 'gerente']), ctrl.exportCatalogExcel);

module.exports = router;
