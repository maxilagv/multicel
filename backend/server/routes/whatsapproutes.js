const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/whatsappcontroller');
const auth = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { whatsappLimiter } = require('../middlewares/security');

router.get('/whatsapp/status', auth, requireRole(['admin']), ctrl.getStatus);
router.post('/whatsapp/connect', whatsappLimiter, auth, requireRole(['admin']), ctrl.connect);
router.get('/whatsapp/qr', auth, requireRole(['admin']), ctrl.getQr);
router.post('/whatsapp/disconnect', whatsappLimiter, auth, requireRole(['admin']), ctrl.disconnect);
router.post('/webhooks/twilio/whatsapp', express.urlencoded({ extended: false }), ctrl.twilioIncomingWebhook);
router.post('/webhooks/twilio/status', express.urlencoded({ extended: false }), ctrl.twilioStatusWebhook);

module.exports = router;
