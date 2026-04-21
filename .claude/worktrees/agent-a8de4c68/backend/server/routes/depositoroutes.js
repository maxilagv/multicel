const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/depositocontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { requireFeature } = require('../middlewares/licenseMiddleware');
const userDeps = require('../db/repositories/usuarioDepositoRepository');
const depositoRepo = require('../db/repositories/depositoRepository');

router.get('/depositos', auth, ctrl.list);

// Depósitos visibles para el usuario actual (según permisos de usuarios_depositos)
router.get('/mis-depositos', auth, async (req, res) => {
  try {
    const userId = req.user?.sub ? Number(req.user.sub) : null;
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    const allowedIds = await userDeps.getUserDepositoIds(userId);
    let rows = await depositoRepo.list({ includeInactive: false });
    if (allowedIds.length) {
      const allowedSet = new Set(allowedIds);
      rows = rows.filter((d) => allowedSet.has(Number(d.id)));
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener los depósitos del usuario' });
  }
});

router.post('/depositos', auth, requireFeature('multideposito'), requireRole(['admin', 'gerente']), ctrl.create);
router.put('/depositos/:id', auth, requireFeature('multideposito'), requireRole(['admin', 'gerente']), ctrl.update);
router.delete('/depositos/:id', auth, requireFeature('multideposito'), requireRole(['admin']), ctrl.deactivate);

module.exports = router;
