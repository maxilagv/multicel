const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/ordenesServicioController');
const auth    = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

// Roles que pueden operar con OS
const STAFF = ['admin', 'gerente', 'vendedor'];
const MGMT  = ['admin', 'gerente'];

// ─── Tipos de trabajo ─────────────────────────────────────────────────────────
router.get ('/os/tipos-trabajo',      auth, requireRole(STAFF), ctrl.listTiposTrabajo);
router.post('/os/tipos-trabajo',      auth, requireRole(MGMT),  ctrl.createTipoTrabajo);
router.put ('/os/tipos-trabajo/:id',  auth, requireRole(MGMT),  ctrl.updateTipoTrabajo);

// ─── Vista tablero (Kanban) ───────────────────────────────────────────────────
// ¡IMPORTANTE: esta ruta debe ir ANTES de /os/:id para no confundir "tablero" con un ID!
router.get('/os/tablero', auth, requireRole(STAFF), ctrl.tablero);

// ─── OS principales ───────────────────────────────────────────────────────────
router.get ('/os',      auth, requireRole(STAFF), ctrl.list);
router.post('/os',      auth, requireRole(STAFF), ctrl.create);
router.get ('/os/:id',  auth, requireRole(STAFF), ctrl.detalle);
router.put ('/os/:id',  auth, requireRole(STAFF), ctrl.update);

// ─── Cambio de estado ─────────────────────────────────────────────────────────
router.patch('/os/:id/estado', auth, requireRole(STAFF), ctrl.cambiarEstado);

// ─── Historial ────────────────────────────────────────────────────────────────
router.get('/os/:id/historial', auth, requireRole(STAFF), ctrl.getHistorial);

// ─── Insumos ──────────────────────────────────────────────────────────────────
router.get   ('/os/:id/insumos',              auth, requireRole(STAFF), ctrl.getInsumos);
router.post  ('/os/:id/insumos',              auth, requireRole(STAFF), ctrl.addInsumo);
router.put   ('/os/:id/insumos/:insumoId',    auth, requireRole(STAFF), ctrl.updateInsumo);
router.delete('/os/:id/insumos/:insumoId',    auth, requireRole(STAFF), ctrl.removeInsumo);

// ─── Documentos ───────────────────────────────────────────────────────────────
router.get   ('/os/:id/documentos',           auth, requireRole(STAFF), ctrl.getDocumentos);
router.post  ('/os/:id/documentos',           auth, requireRole(STAFF), ctrl.addDocumento);
router.delete('/os/:id/documentos/:docId',    auth, requireRole(STAFF), ctrl.removeDocumento);

// ─── Presupuesto ──────────────────────────────────────────────────────────────
router.get ('/os/:id/presupuesto', auth, requireRole(STAFF), ctrl.getPresupuesto);
router.post('/os/:id/presupuesto', auth, requireRole(STAFF), ctrl.setPresupuesto);

module.exports = router;
