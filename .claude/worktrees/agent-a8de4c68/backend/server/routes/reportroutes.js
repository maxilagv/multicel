const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reportcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

router.get('/reportes/deudas', auth, ctrl.deudas);
router.get('/reportes/ganancias-mensuales', auth, ctrl.gananciasMensuales);
router.get('/reportes/movimientos', auth, ctrl.movimientos);
router.get('/reportes/movimientos-detalle', auth, requireRole(['admin']), ctrl.movimientosDetalle);
router.get('/reportes/movimientos-resumen', auth, requireRole(['admin']), ctrl.movimientosResumen);
router.get('/reportes/movimientos-ventas-excel', auth, requireRole(['admin','gerente','vendedor']), ctrl.movimientosVentasExcel);
router.get('/reportes/ranking-vendedores', auth, requireRole(['admin']), ctrl.rankingVendedores);
router.get('/reportes/movimientos-dia-productos', auth, requireRole(['admin','gerente']), ctrl.movimientosDiaProductos);
router.get('/reportes/ganancias', auth, ctrl.gananciasPdf);
router.get('/reportes/stock-bajo', auth, ctrl.stockBajo);
router.get('/reportes/top-clientes', auth, ctrl.topClientes);
router.get('/reportes/clientes/:id/top-productos', auth, ctrl.topProductosCliente);
// PDF remito de venta
router.get('/reportes/remito/:id.pdf', auth, requireRole(['admin', 'gerente', 'vendedor', 'fletero']), ctrl.remitoPdf);

module.exports = router;
