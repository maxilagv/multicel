const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/companyaccountcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { uploadSingleWithOptions } = require('../middlewares/uploadMiddleware');

const allowedExts = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);
const allowedMimes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

router.get(
  '/cuenta-empresa/transacciones',
  auth,
  requireRole(['admin', 'gerente', 'vendedor']),
  ctrl.listTransactions
);
router.get(
  '/cuenta-empresa/transacciones/:id/comprobante',
  auth,
  requireRole(['admin', 'gerente', 'vendedor']),
  ctrl.downloadReceipt
);
router.post(
  '/cuenta-empresa/comprobante',
  auth,
  requireRole(['admin', 'gerente', 'vendedor']),
  uploadSingleWithOptions('file', {
    allowedExts,
    allowedMimes,
    maxFileMb: 12,
    errorMessage: 'Subi un PDF o una imagen del comprobante',
  }),
  ctrl.uploadReceipt
);
router.post(
  '/cuenta-empresa/transacciones/:id/confirmar',
  auth,
  requireRole(['admin', 'gerente']),
  ctrl.confirmar
);
router.post(
  '/cuenta-empresa/transacciones/:id/rechazar',
  auth,
  requireRole(['admin', 'gerente']),
  ctrl.rechazar
);
router.post(
  '/cuenta-empresa/transacciones/:id/acreditar',
  auth,
  requireRole(['admin', 'gerente']),
  ctrl.acreditar
);

module.exports = router;
