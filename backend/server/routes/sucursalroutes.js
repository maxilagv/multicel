const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/sucursalcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { requireFeature } = require('../middlewares/licenseMiddleware');

router.get(
  '/mi-sucursal/dashboard',
  auth,
  requireFeature('multideposito'),
  requireRole(['admin', 'gerente', 'gerente_sucursal']),
  ctrl.dashboard
);

module.exports = router;
