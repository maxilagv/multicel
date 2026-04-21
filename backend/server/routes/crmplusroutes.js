const express = require('express');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { requireFeature } = require('../middlewares/licenseMiddleware');
const ctrl = require('../controllers/crmPlusController');

const router = express.Router();
const STAFF = ['admin', 'gerente', 'vendedor'];

router.get('/crm/cuentas', auth, requireFeature('crm'), ctrl.listCuentas);
router.post('/crm/cuentas', auth, requireFeature('crm'), requireRole(STAFF), ctrl.createCuenta);
router.put('/crm/cuentas/:id', auth, requireFeature('crm'), requireRole(STAFF), ctrl.updateCuenta);

router.get('/crm/contactos', auth, requireFeature('crm'), ctrl.listContactos);
router.post('/crm/contactos', auth, requireFeature('crm'), requireRole(STAFF), ctrl.createContacto);
router.put('/crm/contactos/:id', auth, requireFeature('crm'), requireRole(STAFF), ctrl.updateContacto);

router.get('/crm/clientes/:id/ficha', auth, requireFeature('crm'), ctrl.getFichaCliente);
router.get('/crm/mensajes', auth, requireFeature('crm'), ctrl.listMensajesCliente);

router.get('/crm/proyectos', auth, requireFeature('crm'), ctrl.listProyectos);
router.post('/crm/proyectos', auth, requireFeature('crm'), requireRole(STAFF), ctrl.createProyecto);
router.get('/crm/proyectos/:id', auth, requireFeature('crm'), ctrl.detalleProyecto);
router.put('/crm/proyectos/:id', auth, requireFeature('crm'), requireRole(STAFF), ctrl.updateProyecto);
router.post('/crm/proyectos/:id/tareas', auth, requireFeature('crm'), requireRole(STAFF), ctrl.createTarea);
router.put('/crm/tareas/:id', auth, requireFeature('crm'), requireRole(STAFF), ctrl.updateTarea);

module.exports = router;
