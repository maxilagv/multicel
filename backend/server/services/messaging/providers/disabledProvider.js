function getName() {
  return 'off';
}

function getCapabilities() {
  return {
    supportsMediaUrl: false,
    supportsDocumentBuffer: false,
    requiresConnection: false,
    supportsTemplates: false,
  };
}

async function isConfigured() {
  return false;
}

async function getStatus() {
  return {
    provider: getName(),
    configured: false,
    ready: false,
    state: 'disabled',
    phone: null,
    qrAvailable: false,
    lastError: null,
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

async function sendTextMessage() {
  return {
    ok: false,
    retryable: false,
    status: 'disabled',
    errorMessage: 'Proveedor WhatsApp deshabilitado',
  };
}

async function sendDocumentMessage() {
  return {
    ok: false,
    retryable: false,
    status: 'disabled',
    errorMessage: 'Proveedor WhatsApp deshabilitado',
  };
}

async function sendTemplateMessage() {
  return {
    ok: false,
    retryable: false,
    status: 'disabled',
    errorMessage: 'Proveedor WhatsApp deshabilitado',
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
