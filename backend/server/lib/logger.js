/**
 * Logger estructurado con Pino
 *
 * Ventajas vs console.log:
 * - Logs en JSON → indexables en cualquier servicio (Datadog, Logtail, etc.)
 * - Niveles: trace, debug, info, warn, error, fatal
 * - Serialización automática de objetos y errores
 * - Timestamp ISO en cada línea
 * - requestId propagado cuando se pasa como contexto
 *
 * Uso:
 *   const logger = require('./lib/logger');
 *   logger.info('mensaje');
 *   logger.error({ err, requestId: req.id }, 'fallo al procesar venta');
 *   logger.warn({ userId: 5, ip: req.ip }, 'intento de login fallido');
 */

const pino = require('pino');

const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

// pino-pretty solo en desarrollo interactivo (no en tests ni producción)
function buildTransport() {
  if (!isDev) return undefined;
  try {
    require.resolve('pino-pretty');
    return {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
    };
  } catch {
    return undefined;
  }
}

const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : isDev ? 'debug' : 'info'),

  // En desarrollo: formato legible si pino-pretty disponible. En producción: JSON puro.
  transport: buildTransport(),

  // Serializers estándar para objetos comunes
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },

  base: {
    service: 'kaisen-api',
    version: process.env.APP_VERSION || 'dev',
  },

  // Timestamp en ISO 8601
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
