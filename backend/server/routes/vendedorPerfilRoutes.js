const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/vendedorPerfilController');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

// Todos los roles autenticados pueden ver perfiles y rankings
router.get('/vendedor-perfiles', auth, ctrl.list);
router.get('/vendedor-perfiles/ranking', auth, ctrl.ranking);
router.get('/vendedor-perfiles/recientes', auth, ctrl.recentSales);

// Solo admin crea y edita perfiles
router.post('/vendedor-perfiles', auth, requireRole(['admin']), ctrl.create);
router.put('/vendedor-perfiles/:id', auth, requireRole(['admin']), ctrl.update);

module.exports = router;
