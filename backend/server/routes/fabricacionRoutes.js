'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/fabricacionController');
const auth    = require('../middlewares/authmiddleware');
const { requireRole }    = require('../middlewares/roleMiddleware');
const { requireFeature } = require('../middlewares/licenseMiddleware');

const STAFF = ['admin', 'gerente'];
const ALL   = ['admin', 'gerente', 'vendedor'];

// ─── Tablero (before /ordenes/:id to avoid route collision) ───────────────────
router.get('/fabricacion/ordenes/tablero', auth, requireFeature('fabricacion'), ctrl.tablero);

// ─── Recetas ──────────────────────────────────────────────────────────────────
router.get ('/fabricacion/recetas',                auth, requireFeature('fabricacion'), ctrl.listRecetas);
router.post('/fabricacion/recetas',                auth, requireFeature('fabricacion'), requireRole(STAFF), ctrl.createReceta);
router.get ('/fabricacion/recetas/:id',            auth, requireFeature('fabricacion'), ctrl.getReceta);
router.put ('/fabricacion/recetas/:id',            auth, requireFeature('fabricacion'), requireRole(STAFF), ctrl.updateReceta);
router.post('/fabricacion/recetas/:id/calcular-costo', auth, requireFeature('fabricacion'), ctrl.calcularCosto);

// ─── Órdenes ──────────────────────────────────────────────────────────────────
router.get ('/fabricacion/ordenes',                              auth, requireFeature('fabricacion'), ctrl.listOrdenes);
router.post('/fabricacion/ordenes',                              auth, requireFeature('fabricacion'), requireRole(STAFF), ctrl.createOrden);
router.get ('/fabricacion/ordenes/:id',                         auth, requireFeature('fabricacion'), ctrl.getOrden);
router.get ('/fabricacion/ordenes/:id/analisis-abastecimiento', auth, requireFeature('fabricacion'), ctrl.getAnalisisAbastecimiento);
router.post('/fabricacion/ordenes/:id/reservar-insumos',        auth, requireFeature('fabricacion'), requireRole(STAFF), ctrl.reservarInsumos);
router.post('/fabricacion/ordenes/:id/generar-pedido-compra',   auth, requireFeature('fabricacion'), requireRole(STAFF), ctrl.generarPedidoCompra);
router.patch('/fabricacion/ordenes/:id/iniciar',                auth, requireFeature('fabricacion'), requireRole(STAFF), ctrl.iniciarProduccion);
router.post('/fabricacion/ordenes/:id/finalizar',               auth, requireFeature('fabricacion'), requireRole(STAFF), ctrl.finalizarOrden);
router.post('/fabricacion/ordenes/:id/planilla',                auth, requireFeature('fabricacion'), requireRole(STAFF), ctrl.cargarPlanilla);
router.post('/fabricacion/ordenes/:id/cancelar',                auth, requireFeature('fabricacion'), requireRole(STAFF), ctrl.cancelarOrden);

module.exports = router;
