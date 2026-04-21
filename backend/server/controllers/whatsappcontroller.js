const logger = require('../lib/logger');
const {
  getActiveProvider,
  getActiveProviderStatus,
  resolveProviderName,
} = require('../services/messaging/providerRegistry');
const clientRepo = require('../db/repositories/clientRepository');
const messageRepo = require('../db/repositories/whatsappMessageRepository');
const campaignRepo = require('../db/repositories/whatsappCampaignRepository');
const automationEventRepo = require('../db/repositories/automationEventRepository');
const { verifyTwilioWebhook } = require('../services/messaging/twilioWebhookVerifier');

function isWebProvider() {
  return resolveProviderName() === 'web';
}

function providerNotSupportedResponse(res, operation) {
  return res.status(400).json({
    error: 'Esta accion solo esta disponible cuando la linea se maneja desde un telefono vinculado.',
    hint: 'Si usas la linea oficial, el estado se revisa desde el panel sin QR.',
  });
}

async function getStatus(req, res) {
  try {
    const status = await getActiveProviderStatus();
    res.json(status);
  } catch (err) {
    logger.error({ err: err?.message || err }, '[whatsapp:status]');
    res.status(500).json({ error: 'No se pudo obtener el estado de WhatsApp' });
  }
}

async function connect(req, res) {
  if (!isWebProvider()) return providerNotSupportedResponse(res, 'connect');
  const force = req.body != null && req.body.force === true;
  try {
    const provider = getActiveProvider();
    const current = await provider.getStatus();
    if (current.state === 'connected' && !force) return res.json(current);
    await provider.connect({ force });
    const status = await provider.getStatus();
    res.json(status);
  } catch (err) {
    logger.error({ err: err?.message || err }, '[whatsapp:connect]');
    res.status(500).json({ error: err?.message || 'No se pudo iniciar la conexion de WhatsApp' });
  }
}

async function getQr(req, res) {
  if (!isWebProvider()) return providerNotSupportedResponse(res, 'qr');
  try {
    const provider = getActiveProvider();
    const status = await provider.getStatus();
    if (status.state === 'connected') {
      return res.status(409).json({ error: 'WhatsApp ya esta conectado. No hay QR disponible.', state: status.state, phone: status.phone || null });
    }
    const qr = await provider.getLatestQR();
    if (!qr) return res.status(404).json({ error: 'No hay un QR disponible. Inicia la conexion primero.', state: status.state });
    res.json({ qr, state: status.state, qrUpdatedAt: status.qrUpdatedAt || null });
  } catch (err) {
    logger.error({ err: err?.message || err }, '[whatsapp:qr]');
    res.status(500).json({ error: 'No se pudo obtener el QR de WhatsApp' });
  }
}

async function disconnect(req, res) {
  if (!isWebProvider()) return providerNotSupportedResponse(res, 'disconnect');
  try {
    const provider = getActiveProvider();
    await provider.disconnect();
    const status = await provider.getStatus();
    res.json(status);
  } catch (err) {
    logger.error({ err: err?.message || err }, '[whatsapp:disconnect]');
    res.status(500).json({ error: err?.message || 'No se pudo desconectar WhatsApp' });
  }
}

async function twilioIncomingWebhook(req, res) {
  try {
    if (!verifyTwilioWebhook(req)) {
      return res.status(403).send('Forbidden');
    }

    const from = String(req.body?.From || '').replace(/^whatsapp:/i, '').trim();
    const body = String(req.body?.Body || '').trim() || null;
    const mediaUrl = req.body?.MediaUrl0 ? String(req.body.MediaUrl0).trim() : null;
    const messageSid = String(req.body?.MessageSid || '').trim() || null;

    if (!from) {
      return res.status(400).send('<Response></Response>');
    }

    const cliente = await clientRepo.findByPhoneE164(from).catch(() => null);
    await messageRepo.createMessage({
      clienteId: cliente?.id || null,
      telefonoE164: from,
      direccion: 'recibido',
      tipo: mediaUrl ? 'documento' : 'texto',
      contenido: body,
      mediaUrl,
      provider: 'twilio',
      providerMessageSid: messageSid,
      providerStatus: 'received',
      automatizado: false,
      payload: req.body || {},
    });

    if (messageSid) {
      await automationEventRepo.enqueueTx(null, {
        eventName: 'whatsapp_mensaje_recibido',
        aggregateType: 'whatsapp_mensaje',
        aggregateId: null,
        idempotencyKey: `whatsapp:incoming:${messageSid}`,
        payload: {
          telefono_e164: from,
          cliente_id: cliente?.id || null,
          body,
          media_url: mediaUrl,
          message_sid: messageSid,
        },
      });
    }

    res.status(200).type('text/xml').send('<Response></Response>');
  } catch (err) {
    logger.error({ err: err?.message || err }, '[whatsapp:twilio:incoming]');
    res.status(500).type('text/xml').send('<Response></Response>');
  }
}

async function twilioStatusWebhook(req, res) {
  try {
    if (!verifyTwilioWebhook(req)) {
      return res.status(403).send('Forbidden');
    }

    const messageSid = String(req.body?.MessageSid || '').trim() || null;
    const messageStatus = String(req.body?.MessageStatus || '').trim() || null;
    const errorCode = req.body?.ErrorCode ? String(req.body.ErrorCode).trim() : null;

    if (messageSid) {
      await messageRepo.updateStatusByProviderSid('twilio', messageSid, messageStatus, errorCode, req.body || {});
      await campaignRepo.updateRecipientStatusByProviderSid(
        messageSid,
        messageStatus,
        req.body || {},
        errorCode ? `Error ${errorCode}` : null
      );
    }

    res.status(200).send('OK');
  } catch (err) {
    logger.error({ err: err?.message || err }, '[whatsapp:twilio:status]');
    res.status(500).send('ERROR');
  }
}

module.exports = {
  getStatus,
  connect,
  getQr,
  disconnect,
  twilioIncomingWebhook,
  twilioStatusWebhook,
};
