const { body, param, query, validationResult } = require('express-validator');
const mercadopagoService = require('../services/mercadopagoService');
const mercadolibreService = require('../services/mercadolibreService');
const integracionesRepo = require('../db/repositories/integracionesRepository');
const logger = require('../lib/logger');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return null;
  return res.status(400).json({ errors: errors.array() });
}

function sendServiceError(res, error, fallbackMessage) {
  const status = error?.status || 500;
  return res.status(status).json({
    error: error?.message || fallbackMessage,
  });
}

function dispatchWebhook(processor, payload, context) {
  setImmediate(() => {
    processor(payload).catch((error) => {
      logger.error({ err: error, ...context }, 'integraciones webhook async failed');
    });
  });
}

async function getMercadoPagoStatus(req, res) {
  try {
    const status = await mercadopagoService.getStatus();
    return res.json(status);
  } catch (error) {
    return sendServiceError(res, error, 'No se pudo obtener el estado de MercadoPago');
  }
}

const validateMercadoPagoToken = [
  body('access_token').isString().trim().notEmpty().isLength({ max: 4096 }),
  body('webhook_secret').optional({ nullable: true }).isString().isLength({ max: 4096 }),
];

async function saveMercadoPagoToken(req, res) {
  if (handleValidation(req, res)) return;
  try {
    const result = await mercadopagoService.saveAccessToken({
      accessToken: String(req.body.access_token).trim(),
      webhookSecret: req.body.webhook_secret
        ? String(req.body.webhook_secret).trim()
        : undefined,
    });

    return res.json({
      message: 'MercadoPago conectado',
      status: await mercadopagoService.getStatus(),
      verified: result.verified,
    });
  } catch (error) {
    return sendServiceError(res, error, 'No se pudo conectar MercadoPago');
  }
}

async function disconnectMercadoPago(req, res) {
  try {
    const status = await mercadopagoService.disconnect();
    return res.json({
      message: 'MercadoPago desconectado',
      status,
    });
  } catch (error) {
    return sendServiceError(res, error, 'No se pudo desconectar MercadoPago');
  }
}

const validateMpPaymentLink = [
  body('venta_id').isInt({ gt: 0 }),
];

async function createMercadoPagoPaymentLink(req, res) {
  if (handleValidation(req, res)) return;
  try {
    const link = await mercadopagoService.generatePaymentLinkForVenta(Number(req.body.venta_id));
    return res.json(link);
  } catch (error) {
    return sendServiceError(res, error, 'No se pudo generar el link de pago');
  }
}

const validateVentaIdParam = [
  param('ventaId').isInt({ gt: 0 }),
];

async function getMercadoPagoPaymentLink(req, res) {
  if (handleValidation(req, res)) return;
  try {
    const link = await mercadopagoService.getPaymentLink(Number(req.params.ventaId));
    if (!link) return res.status(404).json({ error: 'No existe un link de pago para esa venta' });
    return res.json(link);
  } catch (error) {
    return sendServiceError(res, error, 'No se pudo obtener el link de pago');
  }
}

async function mercadoPagoWebhook(req, res) {
  try {
    const valid = await mercadopagoService.validateWebhookSignature({
      headers: req.headers,
      query: req.query,
      body: req.body,
    });
    if (!valid) {
      return res.status(401).json({ error: 'Firma de webhook inválida' });
    }

    res.status(200).json({ ok: true });
    dispatchWebhook(
      mercadopagoService.processWebhookNotification,
      {
        headers: req.headers,
        query: req.query,
        body: req.body,
      },
      {
        provider: 'mercadopago',
        path: req.originalUrl,
      }
    );
  } catch (error) {
    return sendServiceError(res, error, 'No se pudo validar el webhook de MercadoPago');
  }
}

async function getMercadoLibreStatus(req, res) {
  try {
    const status = await mercadolibreService.getStatus();
    return res.json(status);
  } catch (error) {
    return sendServiceError(res, error, 'No se pudo obtener el estado de MercadoLibre');
  }
}

async function getMercadoLibreAuthUrl(req, res) {
  try {
    const stateToken = mercadolibreService.createOAuthStateToken({
      user_id: req.user?.sub ? String(req.user.sub) : null,
    });

    return res.json({
      url: mercadolibreService.buildAuthorizationUrl(stateToken),
      state: stateToken,
    });
  } catch (error) {
    return sendServiceError(res, error, 'No se pudo generar la URL de autorización');
  }
}

async function mercadoLibreCallback(req, res) {
  const redirectWithError = (message) =>
    res.redirect(mercadolibreService.resolveFrontendIntegracionesUrl('error', message));

  try {
    if (req.query?.error) {
      const description =
        req.query.error_description || req.query.error || 'MercadoLibre canceló la autorización';
      return redirectWithError(description);
    }

    const code = String(req.query?.code || '').trim();
    const state = String(req.query?.state || '').trim();
    if (!code || !state) {
      return redirectWithError('Faltan code o state en el callback OAuth');
    }

    mercadolibreService.verifyOAuthStateToken(state);
    await mercadolibreService.connectFromAuthorizationCode(code);
    return res.redirect(mercadolibreService.resolveFrontendIntegracionesUrl('connected'));
  } catch (error) {
    logger.error({ err: error }, 'mercadolibre callback failed');
    return redirectWithError(error?.message || 'No se pudo conectar MercadoLibre');
  }
}

async function disconnectMercadoLibre(req, res) {
  try {
    const status = await mercadolibreService.disconnect();
    return res.json({
      message: 'MercadoLibre desconectado',
      status,
    });
  } catch (error) {
    return sendServiceError(res, error, 'No se pudo desconectar MercadoLibre');
  }
}

const validateSyncMercadoLibreProduct = [
  body('producto_id').isInt({ gt: 0 }),
  body('category_id').optional().isString().isLength({ max: 120 }),
  body('title').optional().isString().isLength({ max: 255 }),
  body('price').optional().isFloat({ gt: 0 }),
  body('available_quantity').optional().isInt({ min: 0 }),
  body('currency_id').optional().isString().isLength({ max: 10 }),
  body('listing_type_id').optional().isString().isLength({ max: 120 }),
  body('condition').optional().isString().isLength({ max: 40 }),
  body('buying_mode').optional().isString().isLength({ max: 40 }),
  body('pictures').optional().isArray(),
  body('attributes').optional().isArray(),
];

async function syncMercadoLibreProduct(req, res) {
  if (handleValidation(req, res)) return;
  try {
    const { producto_id, ...config } = req.body || {};
    const synced = await mercadolibreService.syncProduct(Number(producto_id), config);
    return res.json(synced);
  } catch (error) {
    return sendServiceError(res, error, 'No se pudo sincronizar el producto con MercadoLibre');
  }
}

const validateListSyncedProducts = [
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('offset').optional().isInt({ min: 0 }),
];

async function listMercadoLibreSyncedProducts(req, res) {
  if (handleValidation(req, res)) return;
  try {
    const rows = await integracionesRepo.listMlProductSync({
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json(rows);
  } catch (error) {
    return sendServiceError(res, error, 'No se pudieron obtener los productos sincronizados');
  }
}

const validateProductoIdParam = [
  param('id').isInt({ gt: 0 }),
];

async function runMlPublicationAction(req, res, action) {
  if (handleValidation(req, res)) return;
  try {
    const productoId = Number(req.params.id);
    const syncRow = await integracionesRepo.getMlProductSyncByProductoId(productoId);
    if (!syncRow?.ml_item_id) {
      return res.status(404).json({ error: 'El producto no está sincronizado con MercadoLibre' });
    }

    let result;
    if (action === 'pause') result = await mercadolibreService.pauseItem(syncRow.ml_item_id);
    if (action === 'reactivate') result = await mercadolibreService.reactivateItem(syncRow.ml_item_id);
    if (action === 'close') result = await mercadolibreService.closeItem(syncRow.ml_item_id);

    return res.json(result);
  } catch (error) {
    return sendServiceError(res, error, 'No se pudo actualizar el estado de la publicación');
  }
}

async function pauseMercadoLibreProduct(req, res) {
  return runMlPublicationAction(req, res, 'pause');
}

async function reactivateMercadoLibreProduct(req, res) {
  return runMlPublicationAction(req, res, 'reactivate');
}

async function closeMercadoLibreProduct(req, res) {
  return runMlPublicationAction(req, res, 'close');
}

const validateImportMercadoLibreOrders = [
  body('from').optional().isISO8601(),
  body('to').optional().isISO8601(),
  body('desde').optional().isISO8601(),
  body('hasta').optional().isISO8601(),
  body('status').optional().isString().isLength({ max: 40 }),
  body('limit').optional().isInt({ min: 1, max: 50 }),
  body('offset').optional().isInt({ min: 0 }),
];

async function importMercadoLibreOrders(req, res) {
  if (handleValidation(req, res)) return;
  try {
    const result = await mercadolibreService.importOrders(req.body || {});
    return res.json(result);
  } catch (error) {
    return sendServiceError(res, error, 'No se pudieron importar las órdenes de MercadoLibre');
  }
}

async function mercadoLibreWebhook(req, res) {
  try {
    const valid = await mercadolibreService.validateWebhookSignature({
      headers: req.headers,
      query: req.query,
      body: req.body,
    });
    if (!valid) {
      return res.status(401).json({ error: 'Firma de webhook inválida' });
    }

    res.status(200).json({ ok: true });
    dispatchWebhook(
      mercadolibreService.processWebhookNotification,
      {
        headers: req.headers,
        query: req.query,
        body: req.body,
      },
      {
        provider: 'mercadolibre',
        path: req.originalUrl,
      }
    );
  } catch (error) {
    return sendServiceError(res, error, 'No se pudo validar el webhook de MercadoLibre');
  }
}

module.exports = {
  getMercadoPagoStatus,
  saveMercadoPagoToken: [...validateMercadoPagoToken, saveMercadoPagoToken],
  disconnectMercadoPago,
  createMercadoPagoPaymentLink: [...validateMpPaymentLink, createMercadoPagoPaymentLink],
  getMercadoPagoPaymentLink: [...validateVentaIdParam, getMercadoPagoPaymentLink],
  mercadoPagoWebhook,
  getMercadoLibreStatus,
  getMercadoLibreAuthUrl,
  mercadoLibreCallback,
  disconnectMercadoLibre,
  syncMercadoLibreProduct: [...validateSyncMercadoLibreProduct, syncMercadoLibreProduct],
  listMercadoLibreSyncedProducts: [...validateListSyncedProducts, listMercadoLibreSyncedProducts],
  pauseMercadoLibreProduct: [...validateProductoIdParam, pauseMercadoLibreProduct],
  reactivateMercadoLibreProduct: [...validateProductoIdParam, reactivateMercadoLibreProduct],
  closeMercadoLibreProduct: [...validateProductoIdParam, closeMercadoLibreProduct],
  importMercadoLibreOrders: [...validateImportMercadoLibreOrders, importMercadoLibreOrders],
  mercadoLibreWebhook,
};
