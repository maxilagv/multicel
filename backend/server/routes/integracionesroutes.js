'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/integracionescontroller');
const auth    = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

const adminOrGerente = [auth, requireRole(['admin', 'gerente'])];

// ─── MercadoPago — rutas autenticadas ─────────────────────────────────────────
router.get   ('/integraciones/mp/status',              ...adminOrGerente, ctrl.getMercadoPagoStatus);
router.put   ('/integraciones/mp/token',               ...adminOrGerente, ctrl.saveMercadoPagoToken);
router.delete('/integraciones/mp/disconnect',          ...adminOrGerente, ctrl.disconnectMercadoPago);
router.post  ('/integraciones/mp/payment-link',        ...adminOrGerente, ctrl.createMercadoPagoPaymentLink);
router.get   ('/integraciones/mp/payment-link/:ventaId',...adminOrGerente, ctrl.getMercadoPagoPaymentLink);

// ─── MercadoPago — webhook público (validado internamente por firma HMAC) ──────
router.post  ('/integraciones/mp/webhook',             ctrl.mercadoPagoWebhook);

// ─── MercadoLibre — rutas autenticadas ───────────────────────────────────────
router.get   ('/integraciones/ml/status',              ...adminOrGerente, ctrl.getMercadoLibreStatus);
router.get   ('/integraciones/ml/auth-url',            ...adminOrGerente, ctrl.getMercadoLibreAuthUrl);
router.delete('/integraciones/ml/disconnect',          ...adminOrGerente, ctrl.disconnectMercadoLibre);
router.post  ('/integraciones/ml/sync-product',        ...adminOrGerente, ctrl.syncMercadoLibreProduct);
router.get   ('/integraciones/ml/synced-products',     ...adminOrGerente, ctrl.listMercadoLibreSyncedProducts);
router.put   ('/integraciones/ml/products/:id/pause',       ...adminOrGerente, ctrl.pauseMercadoLibreProduct);
router.put   ('/integraciones/ml/products/:id/reactivate',  ...adminOrGerente, ctrl.reactivateMercadoLibreProduct);
router.put   ('/integraciones/ml/products/:id/close',       ...adminOrGerente, ctrl.closeMercadoLibreProduct);
router.post  ('/integraciones/ml/import-orders',       ...adminOrGerente, ctrl.importMercadoLibreOrders);

// ─── MercadoLibre — OAuth callback público (validado por JWT state) ───────────
router.get   ('/integraciones/ml/callback',            ctrl.mercadoLibreCallback);

// ─── MercadoLibre — webhook público (validado internamente por firma HMAC) ────
router.post  ('/integraciones/ml/webhook',             ctrl.mercadoLibreWebhook);

module.exports = router;
