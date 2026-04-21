const express = require('express');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/laboralcontroller');

const router = express.Router();
const STAFF = ['admin', 'gerente', 'vendedor'];

router.get('/laboral/tipos-examen', auth, requireRole(STAFF), ctrl.listTiposExamen);
router.get('/laboral/sectores', auth, requireRole(STAFF), ctrl.listSectores);

router.get('/laboral/nomencladores', auth, requireRole(STAFF), ctrl.listNomencladores);
router.post('/laboral/nomencladores', auth, requireRole(STAFF), ctrl.createNomenclador);
router.put('/laboral/nomencladores/:id', auth, requireRole(STAFF), ctrl.updateNomenclador);

router.get('/laboral/carpetas', auth, requireRole(STAFF), ctrl.listCarpetas);
router.post('/laboral/carpetas', auth, requireRole(STAFF), ctrl.createCarpeta);
router.get('/laboral/carpetas/:id', auth, requireRole(STAFF), ctrl.detalleCarpeta);
router.put('/laboral/carpetas/:id', auth, requireRole(STAFF), ctrl.updateCarpeta);
router.patch('/laboral/carpetas/:id/informes/:informeId', auth, requireRole(STAFF), ctrl.updateInforme);
router.post('/laboral/carpetas/:id/documentos', auth, requireRole(STAFF), ctrl.addDocumento);
router.get('/laboral/carpetas/:id/pdf', auth, requireRole(STAFF), ctrl.generarPdf);
router.post('/laboral/carpetas/:id/enviar-mail', auth, requireRole(STAFF), ctrl.enviarMail);

router.get('/laboral/ausentismo-pendiente', auth, requireRole(STAFF), ctrl.getAusentismoPendiente);
router.post('/laboral/ausentismo-recordatorios', auth, requireRole(STAFF), ctrl.enviarRecordatoriosAusentismo);
router.post('/laboral/facturar-lote', auth, requireRole(STAFF), ctrl.facturarLote);

module.exports = router;
