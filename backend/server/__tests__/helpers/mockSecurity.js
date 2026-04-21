/**
 * Mock completo de middlewares/security.js para tests de integración.
 * Todos los rate limiters son pass-through (no limitan en tests).
 *
 * Uso:
 *   jest.mock('../../middlewares/security.js', () => require('../helpers/mockSecurity'));
 */

const passThrough = (req, res, next) => next();

module.exports = {
  // Rate limiters — todos pass-through en tests
  apiGlobalLimiter: passThrough,
  apiLimiter: passThrough,
  loginLimiter: passThrough,
  otpLimiter: passThrough,
  refreshLimiter: passThrough,

  // Logging y protecciones — pass-through en tests
  loggingMiddleware: passThrough,
  pathTraversalProtection: passThrough,

  // Notificaciones — silenciadas en tests
  sendSMSNotification: jest.fn(),

  // Estado de intentos fallidos — Map vacío para tests aislados
  failedLoginAttempts: new Map(),
  FAILED_LOGIN_THRESHOLD: 5,
};
