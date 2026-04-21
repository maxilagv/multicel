const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/configcontroller');
const adminCtrl = require('../controllers/admincontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

router.post('/config/reset-panel', auth, requireRole(['admin']), ctrl.resetPanelData);
router.get('/admin/audit-log', auth, requireRole(['admin']), adminCtrl.listAuditLog);

module.exports = router;
