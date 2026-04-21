const express = require('express');
const router = express.Router();
const order = require('../controllers/ordercontroller');
const { publicLimiter } = require('../middlewares/security');

// Checkout público
router.post('/checkout', publicLimiter, order.validateCheckout, order.createOrderV2);

module.exports = router;
