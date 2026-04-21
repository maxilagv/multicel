const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/setupcontroller');
const { apiLimiter } = require('../middlewares/security');

router.get('/setup/status', apiLimiter, ctrl.status);
router.post('/setup/admin', apiLimiter, ctrl.createAdmin);

module.exports = router;
