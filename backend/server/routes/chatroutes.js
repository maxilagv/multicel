'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/chatcontroller');
const auth    = require('../middlewares/authmiddleware');
const { aiLimiter } = require('../middlewares/security');

/**
 * POST /api/chat/message
 * Entrada conversacional del agente con datos reales del negocio.
 * Rate limited por aiLimiter (30 req/min).
 */
router.post('/chat/message', aiLimiter, auth, ctrl.sendMessage);
router.get('/chat/models',  auth, ctrl.listModels);

module.exports = router;
