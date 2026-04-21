const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/financecontroller');
const auth = require('../middlewares/authmiddleware');

// Finanzas: costos, ganancias y rentabilidad por producto
router.get('/finanzas/costos-productos', auth, ctrl.costosProductos);
router.get('/finanzas/ganancia-bruta', auth, ctrl.gananciaBruta);
router.get('/finanzas/ganancia-neta', auth, ctrl.gananciaNeta);
router.get('/finanzas/ganancia-por-producto', auth, ctrl.gananciaPorProducto);
router.get('/finanzas/rentabilidad-por-categoria', auth, ctrl.rentabilidadPorCategoria);
router.get('/finanzas/rentabilidad-por-cliente', auth, ctrl.rentabilidadPorCliente);
router.get('/finanzas/deudas-clientes', auth, ctrl.deudasClientes);
router.get('/finanzas/deudas-proveedores', auth, ctrl.deudasProveedores);
router.get('/finanzas/cashflow', auth, ctrl.cashflow);
router.get('/finanzas/presupuestos', auth, ctrl.listarPresupuestos);
router.post('/finanzas/presupuestos', auth, ctrl.guardarPresupuesto);
router.delete('/finanzas/presupuestos/:id', auth, ctrl.eliminarPresupuesto);
router.get('/finanzas/presupuesto-categorias', auth, ctrl.presupuestoCategorias);
router.get('/finanzas/presupuesto-vs-real', auth, ctrl.presupuestoVsReal);
router.post('/finanzas/simulador', auth, ctrl.simuladorFinanciero);
router.get('/finanzas/debug', auth, ctrl.debugFinanzas);

module.exports = router;
