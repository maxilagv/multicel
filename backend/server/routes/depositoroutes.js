const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/depositocontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { requireFeature } = require('../middlewares/licenseMiddleware');
const depositoRepo = require('../db/repositories/depositoRepository');
const { buildDepositoVisibility } = require('../lib/depositoScope');

router.get('/depositos', auth, ctrl.list);

// Depositos visibles para el usuario actual segun el mismo scope del resto del backend.
router.get('/mis-depositos', auth, async (req, res) => {
  try {
    const visibility = await buildDepositoVisibility(req);
    let rows = await depositoRepo.list({ includeInactive: false });
    if (visibility.mode === 'restricted') {
      const allowedSet = new Set(visibility.ids);
      rows = rows.filter((row) => allowedSet.has(Number(row.id)));
    }
    res.json(rows);
  } catch (e) {
    res
      .status(e.status || 500)
      .json({ error: e.message || 'No se pudieron obtener los depositos del usuario' });
  }
});

router.post('/depositos', auth, requireFeature('multideposito'), requireRole(['admin', 'gerente']), ctrl.create);
router.put('/depositos/:id', auth, requireFeature('multideposito'), requireRole(['admin', 'gerente']), ctrl.update);
router.delete('/depositos/:id', auth, requireFeature('multideposito'), requireRole(['admin']), ctrl.deactivate);

// Usuarios asignados a un deposito especifico
router.get('/depositos/:id/usuarios', auth, requireFeature('multideposito'), requireRole(['admin', 'gerente']), ctrl.getUsuarios);
router.put('/depositos/:id/usuarios', auth, requireFeature('multideposito'), requireRole(['admin']), ctrl.setUsuarios);

module.exports = router;
