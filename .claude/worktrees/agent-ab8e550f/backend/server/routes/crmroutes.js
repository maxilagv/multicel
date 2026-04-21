const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/crmcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { requireFeature } = require('../middlewares/licenseMiddleware');

// Oportunidades
router.get('/crm/oportunidades', auth, requireFeature('crm'), ctrl.listOportunidades);
router.post('/crm/oportunidades', auth, requireFeature('crm'), requireRole(['admin','gerente','vendedor']), ctrl.crearOportunidad);
router.put('/crm/oportunidades/:id', auth, requireFeature('crm'), requireRole(['admin','gerente','vendedor']), ctrl.actualizarOportunidad);

// Actividades
router.get('/crm/actividades', auth, requireFeature('crm'), ctrl.listActividades);
router.post('/crm/actividades', auth, requireFeature('crm'), requireRole(['admin','gerente','vendedor']), ctrl.crearActividad);
router.put('/crm/actividades/:id', auth, requireFeature('crm'), requireRole(['admin','gerente','vendedor']), ctrl.actualizarActividad);

// Análisis CRM
router.get('/crm/analisis', auth, requireFeature('crm'), ctrl.analisis);

module.exports = router;
