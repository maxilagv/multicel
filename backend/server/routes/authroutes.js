// authroutes.js
const express = require('express');
const router = express.Router();
const authcontroller = require('../controllers/authcontroller');
const authMiddleware = require('../middlewares/authmiddleware');
const {
  loginLimiter,
  otpLimiter,
  refreshLimiter,
} = require('../middlewares/security');
const { requireRole } = require('../middlewares/roleMiddleware');

router.post('/login', loginLimiter, authcontroller.login);
router.post('/login-step1', loginLimiter, authcontroller.loginStep1);
router.post('/login-step2', otpLimiter, authcontroller.loginStep2);
router.post('/refresh-token', refreshLimiter, authcontroller.refreshToken);
router.post('/logout', authMiddleware, authcontroller.logout);
router.get('/mfa/status', authMiddleware, requireRole(['admin']), authcontroller.mfaStatus);
router.post('/mfa/setup', authMiddleware, requireRole(['admin']), authcontroller.mfaSetup);
router.post('/mfa/confirm', authMiddleware, requireRole(['admin']), authcontroller.mfaConfirm);
router.post('/mfa/disable', authMiddleware, requireRole(['admin']), authcontroller.mfaDisable);

module.exports = router;
