const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/arcacontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { requireFeature } = require('../middlewares/licenseMiddleware');
const { uploadSingleWithOptions } = require('../middlewares/uploadMiddleware');

router.get('/arca/config', auth, requireFeature('arca'), requireRole(['admin', 'gerente']), ctrl.getConfig);
router.put('/arca/config', auth, requireFeature('arca'), requireRole(['admin', 'gerente']), ctrl.setConfig);
router.post('/arca/test', auth, requireFeature('arca'), requireRole(['admin', 'gerente']), ctrl.testConnection);
router.post(
  '/arca/config/p12',
  auth,
  requireFeature('arca'),
  requireRole(['admin', 'gerente']),
  uploadSingleWithOptions('file', {
    allowedExts: new Set(['.p12', '.pfx']),
    allowedMimes: new Set([
      'application/x-pkcs12',
      'application/pkcs12',
      'application/octet-stream',
    ]),
    errorMessage: 'Formato no soportado. Usa un archivo .p12 o .pfx',
  }),
  ctrl.uploadP12
);

router.get('/arca/puntos-venta', auth, requireFeature('arca'), requireRole(['admin', 'gerente']), ctrl.listPuntosVenta);
router.post('/arca/puntos-venta', auth, requireFeature('arca'), requireRole(['admin', 'gerente']), ctrl.createPuntoVenta);
router.put('/arca/puntos-venta/:id', auth, requireFeature('arca'), requireRole(['admin', 'gerente']), ctrl.updatePuntoVenta);
router.delete('/arca/puntos-venta/:id', auth, requireFeature('arca'), requireRole(['admin', 'gerente']), ctrl.deletePuntoVenta);

router.post('/arca/puntos-venta/asignar', auth, requireFeature('arca'), requireRole(['admin', 'gerente']), ctrl.asignarDeposito);
router.get('/arca/depositos', auth, requireFeature('arca'), requireRole(['admin', 'gerente']), ctrl.listDepositos);

router.post('/arca/clientes/:id/padron', auth, requireFeature('arca'), requireRole(['admin', 'gerente', 'vendedor']), ctrl.padronCliente);

router.get('/arca/facturas/:ventaId', auth, requireFeature('arca'), requireRole(['admin', 'gerente', 'vendedor']), ctrl.getFactura);
router.get('/arca/facturas/:ventaId/pdf', auth, requireFeature('arca'), requireRole(['admin', 'gerente', 'vendedor']), ctrl.facturaPdf);

router.post('/arca/emitir', auth, requireFeature('arca'), requireRole(['admin', 'gerente', 'vendedor']), ctrl.emitirFactura);

module.exports = router;

