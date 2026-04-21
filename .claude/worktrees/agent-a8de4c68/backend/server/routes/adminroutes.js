const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/configcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

// Herramientas de administraciИn: limpiar datos del panel (solo admin)
router.post('/config/reset-panel', auth, requireRole(['admin']), ctrl.resetPanelData);

module.exports = router;

