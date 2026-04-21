const clientRepo = require('../../../db/repositories/clientRepository');
const messageRepo = require('../../../db/repositories/whatsappMessageRepository');

let twilioModuleCache;

function loadTwilioModule() {
  if (twilioModuleCache) return twilioModuleCache;
  try {
    twilioModuleCache = require('twilio');
    return twilioModuleCache;
  } catch {
    return null;
  }
}

function getName() {
  return 'twilio';
}

function getCapabilities() {
  return {
    supportsMediaUrl: false,
    supportsDocumentBuffer: false,
    requiresConnection: false,
    supportsTemplates: true,
  };
}

function getConfig() {
  return {
    accountSid: String(process.env.TWILIO_ACCOUNT_SID || '').trim(),
    authToken: String(process.env.TWILIO_AUTH_TOKEN || '').trim(),
    from: String(process.env.TWILIO_WHATSAPP_FROM || '').trim(),
  };
}

function buildClient() {
  const twilio = loadTwilioModule();
  if (!twilio) return null;
  const config = getConfig();
  if (!config.accountSid || !config.authToken) return null;
  return twilio(config.accountSid, config.authToken);
}

async function isConfigured() {
  const config = getConfig();
  return Boolean(loadTwilioModule() && config.accountSid && config.authToken && config.from);
}

async function getStatus() {
  const configured = await isConfigured();
  const config = getConfig();
  return {
    provider: getName(),
    configured,
    ready: configured,
    state: configured ? 'connected' : 'disabled',
    phone: config.from || null,
    qrAvailable: false,
    qrUpdatedAt: null,
    lastConnectedAt: null,
    lastError: configured ? null : 'Configura TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_WHATSAPP_FROM',
    capabilities: getCapabilities(),
  };
}

async function boot() {
  return getStatus();
}

async function connect() {
  return getStatus();
}

async function disconnect() {
  return getStatus();
}

async function resolveClienteId(telefonoE164, explicitClientId = null) {
  if (explicitClientId != null) return Number(explicitClientId);
  const cliente = await clientRepo.findByPhoneE164(telefonoE164).catch(() => null);
  return cliente?.id ? Number(cliente.id) : null;
}

async function persistOutgoingMessage({
  toE164,
  body = null,
  type = 'texto',
  mediaUrl = null,
  providerMessageSid = null,
  providerStatus = null,
  plantillaCodigo = null,
  plantillaVariables = null,
  automatizado = false,
  automatizacionNombre = null,
  campaignId = null,
  payload = null,
  clientId = null,
}) {
  const clienteId = await resolveClienteId(toE164, clientId);
  await messageRepo.createMessage({
    clienteId,
    telefonoE164: toE164,
    direccion: 'enviado',
    tipo: type,
    contenido: body,
    plantillaCodigo,
    plantillaVariables,
    mediaUrl,
    provider: getName(),
    providerMessageSid,
    providerStatus,
    campaignId,
    automatizado,
    automatizacionNombre,
    payload,
  });
}

async function sendTextMessage({
  toE164,
  body,
  automatizado = false,
  automatizacionNombre = null,
  campaignId = null,
  clientId = null,
}) {
  const client = buildClient();
  const config = getConfig();
  if (!client || !config.from) {
    return {
      ok: false,
      retryable: false,
      status: 'disabled',
      errorMessage: 'Twilio no esta configurado',
      providerStatus: 'disabled',
      providerMessageId: null,
    };
  }

  try {
    const message = await client.messages.create({
      from: config.from,
      to: `whatsapp:${String(toE164 || '').trim()}`,
      body: String(body || '').trim() || 'Mensaje',
    });

    await persistOutgoingMessage({
      toE164,
      body,
      type: 'texto',
      providerMessageSid: message.sid,
      providerStatus: message.status || 'queued',
      automatizado,
      automatizacionNombre,
      campaignId,
      clientId,
      payload: { sid: message.sid, status: message.status || null },
    }).catch(() => {});

    return {
      ok: true,
      retryable: false,
      sid: message.sid,
      status: message.status || 'queued',
      providerStatus: message.status || 'queued',
      providerMessageId: message.sid,
      raw: message,
    };
  } catch (error) {
    return {
      ok: false,
      retryable: false,
      status: 'failed',
      errorMessage: error?.message || 'No se pudo enviar el mensaje por WhatsApp oficial',
      providerStatus: 'failed',
      providerMessageId: null,
      raw: { error: error?.message || String(error) },
    };
  }
}

async function sendTemplateMessage({
  toE164,
  templateSid,
  variables = {},
  body = null,
  automatizado = true,
  automatizacionNombre = null,
  campaignId = null,
  clientId = null,
}) {
  const client = buildClient();
  const config = getConfig();
  if (!client || !config.from) {
    return {
      ok: false,
      retryable: false,
      status: 'disabled',
      errorMessage: 'Twilio no esta configurado',
      providerStatus: 'disabled',
      providerMessageId: null,
    };
  }
  if (!templateSid) {
    return {
      ok: false,
      retryable: false,
      status: 'failed',
      errorMessage: 'Falta el identificador de la plantilla aprobada',
      providerStatus: 'failed',
      providerMessageId: null,
    };
  }

  try {
    const message = await client.messages.create({
      from: config.from,
      to: `whatsapp:${String(toE164 || '').trim()}`,
      contentSid: String(templateSid).trim(),
      contentVariables: JSON.stringify(variables || {}),
      ...(body ? { body: String(body) } : {}),
    });

    await persistOutgoingMessage({
      toE164,
      body,
      type: 'plantilla',
      providerMessageSid: message.sid,
      providerStatus: message.status || 'queued',
      plantillaCodigo: String(templateSid).trim(),
      plantillaVariables: variables || {},
      automatizado,
      automatizacionNombre,
      campaignId,
      clientId,
      payload: { sid: message.sid, status: message.status || null },
    }).catch(() => {});

    return {
      ok: true,
      retryable: false,
      sid: message.sid,
      status: message.status || 'queued',
      providerStatus: message.status || 'queued',
      providerMessageId: message.sid,
      raw: message,
    };
  } catch (error) {
    return {
      ok: false,
      retryable: false,
      status: 'failed',
      errorMessage: error?.message || 'No se pudo enviar la plantilla por WhatsApp oficial',
      providerStatus: 'failed',
      providerMessageId: null,
      raw: { error: error?.message || String(error) },
    };
  }
}

async function sendDocumentMessage() {
  return {
    ok: false,
    retryable: false,
    status: 'failed',
    errorMessage: 'El canal oficial necesita plantillas aprobadas o una conversacion abierta para este envio',
    providerStatus: 'failed',
    providerMessageId: null,
  };
}

async function getLatestQR() {
  return null;
}

module.exports = {
  getName,
  getCapabilities,
  isConfigured,
  getStatus,
  boot,
  connect,
  disconnect,
  sendTextMessage,
  sendTemplateMessage,
  sendDocumentMessage,
  getLatestQR,
};
