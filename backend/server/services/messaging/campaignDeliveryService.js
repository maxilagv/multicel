const { getActiveProvider } = require('./providerRegistry');
const { readCatalogPdfBuffer } = require('../catalogPdfStorageService');

function buildProviderOfflineResult(status) {
  return {
    ok: false,
    retryable: Boolean(status?.capabilities?.requiresConnection),
    providerMessageId: null,
    providerStatus: status?.state || 'disconnected',
    errorMessage:
      status?.capabilities?.requiresConnection && status?.state !== 'connected'
        ? 'WhatsApp Web no conectado'
        : 'Proveedor WhatsApp no configurado',
    raw: status || null,
  };
}

async function getProviderReadiness() {
  const provider = getActiveProvider();
  const status = await provider.getStatus();
  const configured = Boolean(status?.configured);
  const ready =
    configured &&
    (!status?.capabilities?.requiresConnection || status?.state === 'connected');

  return { provider, status, configured, ready };
}

async function sendCampaignRecipient(item = {}) {
  const { provider, status, configured, ready } = await getProviderReadiness();
  if (!configured || !ready) {
    return buildProviderOfflineResult(status);
  }

  const destination = item.destino_e164 || item.destino_input || null;
  const body =
    item.mensaje_texto ||
    `Catalogo de ofertas - ${item.campaign_name || 'Kaisen'}`;

  if (status?.capabilities?.supportsDocumentBuffer) {
    if (!item.pdf_file_name) {
      return {
        ok: false,
        retryable: false,
        providerMessageId: null,
        providerStatus: 'failed',
        errorMessage: 'El PDF de la campana no tiene archivo asociado',
        raw: { recipientId: item.id || null },
      };
    }

    try {
      const documentBuffer = await readCatalogPdfBuffer(item.pdf_file_name);
      return provider.sendDocumentMessage({
        toE164: destination,
        body,
        documentBuffer,
        filename: item.pdf_file_name,
        mimeType: 'application/pdf',
      });
    } catch (err) {
      return {
        ok: false,
        retryable: false,
        providerMessageId: null,
        providerStatus: 'failed',
        errorMessage: err?.message || 'No se pudo leer el PDF de la campana',
        raw: { recipientId: item.id || null },
      };
    }
  }

  if (status?.capabilities?.supportsMediaUrl) {
    if (!item.pdf_url) {
      return {
        ok: false,
        retryable: false,
        providerMessageId: null,
        providerStatus: 'failed',
        errorMessage: 'El proveedor requiere una URL publica del PDF',
        raw: { recipientId: item.id || null },
      };
    }
    return provider.sendDocumentMessage({
      toE164: destination,
      body,
      mediaUrl: item.pdf_url,
    });
  }

  return {
    ok: false,
    retryable: false,
    providerMessageId: null,
    providerStatus: 'failed',
    errorMessage: 'El proveedor activo no soporta envio de documentos',
    raw: { provider: status?.provider || provider.getName?.() || 'unknown' },
  };
}

module.exports = {
  getProviderReadiness,
  sendCampaignRecipient,
};
