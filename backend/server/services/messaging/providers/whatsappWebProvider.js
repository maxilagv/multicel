const QRCode = require('qrcode');
const sessionRepo = require('../../../db/repositories/whatsappSessionRepository');

const SESSION_NAME = String(process.env.WHATSAPP_WEB_SESSION_NAME || 'default').trim() || 'default';
const QR_SCALE = Math.max(2, Number(process.env.WHATSAPP_QR_SCALE || 6));
const RECONNECT_BASE_MS = Math.max(2000, Number(process.env.WHATSAPP_RECONNECT_BASE_MS || 5000));
const RECONNECT_MAX_MS = Math.max(RECONNECT_BASE_MS, Number(process.env.WHATSAPP_RECONNECT_MAX_MS || 60000));

let baileysModuleCache;
let sock = null;
let connectPromise = null;
let reconnectTimer = null;
let reconnectAttempts = 0;

let runtimeState = 'disconnected';
let runtimePhone = null;
let latestQr = null;
let qrUpdatedAt = null;
let lastError = null;

function loadBaileysModule() {
  if (baileysModuleCache) return baileysModuleCache;
  try {
    baileysModuleCache = require('@whiskeysockets/baileys');
    return baileysModuleCache;
  } catch {
    return null;
  }
}

function getName() {
  return 'web';
}

function getCapabilities() {
  return {
    supportsMediaUrl: false,
    supportsDocumentBuffer: true,
    requiresConnection: true,
    supportsTemplates: false,
  };
}

function clearReconnectTimer() {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function toJid(toE164) {
  const digits = String(toE164 || '').replace(/\D+/g, '');
  if (!digits) return '';
  return `${digits}@s.whatsapp.net`;
}

function jidToPhone(jid) {
  const base = String(jid || '').split('@')[0].split(':')[0];
  const digits = base.replace(/\D+/g, '');
  return digits ? `+${digits}` : null;
}

function cloneWithBufferJSON(value, BufferJSON) {
  if (value == null) return value;
  try {
    return JSON.parse(
      JSON.stringify(value, BufferJSON?.replacer),
      BufferJSON?.reviver
    );
  } catch {
    return value;
  }
}

async function buildDbAuthState(mod) {
  const { initAuthCreds, BufferJSON, proto } = mod;
  const storedCreds = await sessionRepo.loadCreds(SESSION_NAME);
  const creds = cloneWithBufferJSON(storedCreds, BufferJSON) || initAuthCreds();

  return {
    creds,
    state: {
      creds,
      keys: {
        get: async (category, ids) => {
          const raw = await sessionRepo.getKeys(SESSION_NAME, category, ids);
          const out = {};
          for (const id of ids || []) {
            const key = String(id);
            let value = cloneWithBufferJSON(raw[key], BufferJSON);
            if (
              value &&
              category === 'app-state-sync-key' &&
              proto?.Message?.AppStateSyncKeyData?.fromObject
            ) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            out[key] = value || null;
          }
          return out;
        },
        set: async (data) => {
          const entries = [];
          const deletions = [];
          for (const category of Object.keys(data || {})) {
            for (const [id, value] of Object.entries(data[category] || {})) {
              if (value) {
                const serializable =
                  typeof value?.toJSON === 'function' ? value.toJSON() : value;
                entries.push({
                  category,
                  itemKey: String(id),
                  value: cloneWithBufferJSON(serializable, BufferJSON),
                });
              } else {
                deletions.push({
                  category,
                  itemKey: String(id),
                });
              }
            }
          }
          await sessionRepo.setKeys(SESSION_NAME, entries, deletions);
        },
      },
    },
    saveCreds: async () => {
      await sessionRepo.saveCreds(
        SESSION_NAME,
        cloneWithBufferJSON(creds, BufferJSON)
      );
    },
  };
}

async function persistMeta(fields = {}) {
  try {
    await sessionRepo.upsertSessionMeta(SESSION_NAME, {
      provider: getName(),
      state: fields.state || runtimeState,
      phone:
        Object.prototype.hasOwnProperty.call(fields, 'phone')
          ? fields.phone
          : runtimePhone,
      last_error:
        Object.prototype.hasOwnProperty.call(fields, 'last_error')
          ? fields.last_error
          : lastError,
      qr_updated_at:
        Object.prototype.hasOwnProperty.call(fields, 'qr_updated_at')
          ? fields.qr_updated_at
          : qrUpdatedAt,
      last_connected_at: fields.last_connected_at,
    });
  } catch (err) {
    console.error('[whatsapp-web] persist meta error', err?.message || err);
  }
}

async function getStatus() {
  const configured = Boolean(loadBaileysModule());
  const meta = await sessionRepo.getSessionMeta(SESSION_NAME).catch(() => null);
  const state =
    runtimeState && runtimeState !== 'disconnected'
      ? runtimeState
      : meta?.state || runtimeState || 'disconnected';
  return {
    provider: getName(),
    configured,
    ready: configured && state === 'connected' && Boolean(sock),
    state,
    phone: runtimePhone || meta?.phone || null,
    qrAvailable: Boolean(latestQr),
    qrUpdatedAt: qrUpdatedAt || meta?.qr_updated_at || null,
    lastConnectedAt: meta?.last_connected_at || null,
    lastError: lastError || meta?.last_error || (configured ? null : 'Baileys no instalado'),
    capabilities: getCapabilities(),
  };
}

async function isConfigured() {
  const status = await getStatus();
  return status.configured;
}

async function scheduleReconnect() {
  const hasSession = await sessionRepo.hasSession(SESSION_NAME).catch(() => false);
  if (!hasSession) return;
  clearReconnectTimer();
  reconnectAttempts += 1;
  runtimeState = 'reconnecting';
  await persistMeta({ state: 'reconnecting' });
  const delay = Math.min(
    RECONNECT_BASE_MS * 2 ** Math.max(0, reconnectAttempts - 1),
    RECONNECT_MAX_MS
  );
  reconnectTimer = setTimeout(() => {
    connect({ force: true }).catch((err) => {
      console.error('[whatsapp-web] reconnect error', err?.message || err);
    });
  }, delay);
  if (typeof reconnectTimer.unref === 'function') reconnectTimer.unref();
}

async function handleConnectionUpdate(mod, currentSock, update = {}) {
  if (currentSock !== sock) return;

  if (update.qr) {
    latestQr = await QRCode.toDataURL(update.qr, { margin: 1, scale: QR_SCALE });
    qrUpdatedAt = new Date().toISOString();
    runtimeState = 'scanning';
    lastError = null;
    await persistMeta({
      state: 'scanning',
      qr_updated_at: qrUpdatedAt,
      last_error: null,
    });
  }

  if (update.connection === 'open') {
    reconnectAttempts = 0;
    latestQr = null;
    qrUpdatedAt = null;
    runtimeState = 'connected';
    runtimePhone = jidToPhone(currentSock?.user?.id);
    lastError = null;
    await persistMeta({
      state: 'connected',
      phone: runtimePhone,
      qr_updated_at: null,
      last_error: null,
      last_connected_at: new Date().toISOString(),
    });
    return;
  }

  if (update.connection === 'close') {
    const loggedOut =
      Number(update?.lastDisconnect?.error?.output?.statusCode || 0) ===
      Number(mod?.DisconnectReason?.loggedOut || 401);
    const reason =
      update?.lastDisconnect?.error?.message || 'Sesion WhatsApp cerrada';
    sock = null;
    latestQr = null;
    qrUpdatedAt = null;
    runtimeState = 'disconnected';
    lastError = reason;
    await persistMeta({
      state: 'disconnected',
      qr_updated_at: null,
      last_error: reason,
    });
    if (loggedOut) {
      runtimePhone = null;
      reconnectAttempts = 0;
      await sessionRepo.clearSession(SESSION_NAME).catch(() => {});
      return;
    }
    await scheduleReconnect();
  }
}

async function openSocket({ force = false } = {}) {
  const mod = loadBaileysModule();
  if (!mod) {
    runtimeState = 'error';
    lastError = 'Baileys no instalado';
    await persistMeta({ state: 'error', last_error: lastError });
    return getStatus();
  }

  if (sock && !force && runtimeState === 'connected') {
    return getStatus();
  }

  clearReconnectTimer();
  if (force && sock) {
    try {
      sock.end(new Error('reconnect'));
    } catch {
      // ignore close errors
    }
    sock = null;
  }

  runtimeState = 'connecting';
  lastError = null;
  latestQr = null;
  qrUpdatedAt = null;
  await persistMeta({
    state: 'connecting',
    last_error: null,
    qr_updated_at: null,
  });

  const authState = await buildDbAuthState(mod);
  let version;
  try {
    const latest = await mod.fetchLatestBaileysVersion();
    version = latest?.version;
  } catch {
    version = undefined;
  }

  const nextSock = mod.makeWASocket({
    auth: authState.state,
    browser: mod.Browsers?.windows
      ? mod.Browsers.windows('Kaisen ERP')
      : ['Kaisen ERP', 'Desktop', '1.0.0'],
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    version,
  });

  sock = nextSock;
  nextSock.ev.on('creds.update', authState.saveCreds);
  nextSock.ev.on('connection.update', (update) => {
    handleConnectionUpdate(mod, nextSock, update).catch((err) => {
      console.error('[whatsapp-web] connection update error', err?.message || err);
    });
  });

  return getStatus();
}

async function boot() {
  if (!loadBaileysModule()) return getStatus();
  const hasSession = await sessionRepo.hasSession(SESSION_NAME).catch(() => false);
  if (!hasSession) return getStatus();
  return connect();
}

async function connect({ force = false } = {}) {
  if (connectPromise) return connectPromise;
  connectPromise = openSocket({ force }).finally(() => {
    connectPromise = null;
  });
  return connectPromise;
}

async function disconnect() {
  clearReconnectTimer();
  const currentSock = sock;
  sock = null;
  latestQr = null;
  qrUpdatedAt = null;
  runtimeState = 'disconnected';
  runtimePhone = null;
  lastError = null;
  reconnectAttempts = 0;
  await sessionRepo.clearSession(SESSION_NAME).catch(() => {});
  await persistMeta({
    state: 'disconnected',
    phone: null,
    last_error: null,
    qr_updated_at: null,
  });
  if (currentSock) {
    try {
      currentSock.end(new Error('manual_disconnect'));
    } catch {
      // ignore close errors
    }
  }
  return getStatus();
}

async function sendTextMessage({ toE164, body }) {
  if (!sock || runtimeState !== 'connected') {
    return {
      ok: false,
      retryable: true,
      status: 'disconnected',
      errorMessage: 'WhatsApp Web no conectado',
      providerStatus: 'disconnected',
      providerMessageId: null,
    };
  }

  const jid = toJid(toE164);
  if (!jid) {
    return {
      ok: false,
      retryable: false,
      status: 'failed',
      errorMessage: 'Destino WhatsApp invalido',
      providerStatus: 'failed',
      providerMessageId: null,
    };
  }

  try {
    const out = await sock.sendMessage(jid, {
      text: String(body || '').trim() || 'Mensaje de Kaisen',
    });
    return {
      ok: true,
      retryable: false,
      sid: out?.key?.id || null,
      status: 'sent',
      raw: out,
      providerStatus: 'sent',
      providerMessageId: out?.key?.id || null,
    };
  } catch (err) {
    return {
      ok: false,
      retryable: true,
      status: 'failed',
      errorMessage: err?.message || 'Error de envio WhatsApp Web',
      raw: { error: err?.message || String(err) },
      providerStatus: 'failed',
      providerMessageId: null,
    };
  }
}

async function sendDocumentMessage({
  toE164,
  body,
  documentBuffer,
  filename,
  mimeType = 'application/pdf',
}) {
  if (!Buffer.isBuffer(documentBuffer) || !documentBuffer.length) {
    return {
      ok: false,
      retryable: false,
      status: 'failed',
      errorMessage: 'Documento WhatsApp invalido o ausente',
      providerStatus: 'failed',
      providerMessageId: null,
    };
  }

  if (!sock || runtimeState !== 'connected') {
    return {
      ok: false,
      retryable: true,
      status: 'disconnected',
      errorMessage: 'WhatsApp Web no conectado',
      providerStatus: 'disconnected',
      providerMessageId: null,
    };
  }

  const jid = toJid(toE164);
  if (!jid) {
    return {
      ok: false,
      retryable: false,
      status: 'failed',
      errorMessage: 'Destino WhatsApp invalido',
      providerStatus: 'failed',
      providerMessageId: null,
    };
  }

  try {
    const out = await sock.sendMessage(jid, {
      document: documentBuffer,
      mimetype: mimeType,
      fileName: String(filename || 'catalogo.pdf'),
      caption: String(body || '').trim() || undefined,
    });
    return {
      ok: true,
      retryable: false,
      sid: out?.key?.id || null,
      status: 'sent',
      raw: out,
      providerStatus: 'sent',
      providerMessageId: out?.key?.id || null,
    };
  } catch (err) {
    return {
      ok: false,
      retryable: true,
      status: 'failed',
      errorMessage: err?.message || 'Error enviando documento por WhatsApp Web',
      raw: { error: err?.message || String(err) },
      providerStatus: 'failed',
      providerMessageId: null,
    };
  }
}

async function sendTemplateMessage() {
  return {
    ok: false,
    retryable: false,
    status: 'failed',
    errorMessage: 'WhatsApp Web no soporta plantillas oficiales',
    providerStatus: 'failed',
    providerMessageId: null,
  };
}

async function getLatestQR() {
  return latestQr;
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
  __test__: {
    toJid,
    jidToPhone,
  },
};
