const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/importjobcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

router.get('/import-jobs/:id', auth, requireRole(['admin', 'gerente', 'vendedor']), ctrl.getJob);
router.get('/import-jobs/:id/events', auth, requireRole(['admin', 'gerente', 'vendedor']), ctrl.streamJob);

module.exports = router;
