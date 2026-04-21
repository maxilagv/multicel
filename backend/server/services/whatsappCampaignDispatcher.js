const logger = require('../lib/logger');
﻿const campaignRepo = require('../db/repositories/whatsappCampaignRepository');
const {
  getProviderReadiness,
  sendCampaignRecipient,
} = require('./messaging/campaignDeliveryService');
const { resolveProviderName } = require('./messaging/providerRegistry');

let timer = null;
let running = false;

const DEFAULT_INTERVAL_MS = Math.max(
  2000,
  Number(process.env.WHATSAPP_DISPATCHER_INTERVAL_MS || 10000)
);
const DEFAULT_BATCH_SIZE = Math.max(
  1,
  Number(process.env.WHATSAPP_DISPATCHER_BATCH_SIZE || 20)
);
const MAX_ATTEMPTS = Math.max(1, Number(process.env.WHATSAPP_MAX_ATTEMPTS || 5));
const ORPHAN_LOCK_MINUTES = Math.max(1, Number(process.env.WHATSAPP_ORPHAN_LOCK_MINUTES || 5));

// Backoff delays por numero de intento (1-indexed):
// intento 1 -> 60 s, 2 -> 5 min, 3 -> 15 min, 4 -> 60 min, 5+ -> 120 min
const BACKOFF_SECONDS = [60, 300, 900, 3600, 7200];

function nextAttemptDate(attempt) {
  const idx = Math.min(Math.max(attempt - 1, 0), BACKOFF_SECONDS.length - 1);
  return new Date(Date.now() + BACKOFF_SECONDS[idx] * 1000);
}

function isDispatcherEnabled() {
  const raw = String(process.env.WHATSAPP_DISPATCHER_ENABLED || 'true').trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'off');
}

async function processBatch({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  if (running) return;
  running = true;
  try {
    // Recuperar filas huerfanas antes de procesar nuevas.
    await campaignRepo.recoverOrphanedRecipients({ lockMinutes: ORPHAN_LOCK_MINUTES });

    const readiness = await getProviderReadiness();
    if (!readiness.configured || !readiness.ready) return;

    const providerName = resolveProviderName();
    const pending = await campaignRepo.listPendingRecipients({ limit: batchSize });
    if (!pending.length) return;

    for (const item of pending) {
      // Claim atomico: si affectedRows = 0 otro worker ya lo reclaimo.
      const claimed = await campaignRepo.setRecipientSending(item.id, providerName);
      if (!claimed) continue;

      const currentAttempts = Number(claimed.attempts || 1);
      const effectiveMax = Number(claimed.max_attempts || MAX_ATTEMPTS);

      try {
        const out = await sendCampaignRecipient(item);

        if (out.ok) {
          await campaignRepo.markRecipientSent(
            item.id,
            out.sid || out.providerMessageSid || null,
            out.providerMessageId || null
          );
          await campaignRepo.addDeliveryEvent({
            campaignRecipientId: item.id,
            providerEventId: out.providerMessageId || out.sid || null,
            providerStatus: out.providerStatus || out.status || 'sent',
            payload: out.raw || {},
          });
        } else if (out.retryable && currentAttempts < effectiveMax) {
          // Fallo transitorio con reintentos disponibles: backoff exponencial.
          await campaignRepo.setRecipientPending(
            item.id,
            out.errorMessage || 'Error transitorio de envio',
            nextAttemptDate(currentAttempts),
            out.errorCode || null
          );
          await campaignRepo.addDeliveryEvent({
            campaignRecipientId: item.id,
            providerEventId: out.providerMessageId || out.sid || null,
            providerStatus: out.providerStatus || out.status || 'retry',
            payload: out.raw || {},
          });
        } else {
          // No reintentable O se agotaron los intentos.
          await campaignRepo.markRecipientFailed(
            item.id,
            out.errorMessage || 'Error de envio',
            out.errorCode || null
          );
          await campaignRepo.addDeliveryEvent({
            campaignRecipientId: item.id,
            providerEventId: out.providerMessageId || out.sid || null,
            providerStatus: out.providerStatus || out.status || 'failed',
            payload: out.raw || {},
          });
        }
      } catch (e) {
        // Error inesperado al enviar: backoff si quedan intentos, sino fallo permanente.
        if (currentAttempts < effectiveMax) {
          await campaignRepo.setRecipientPending(
            item.id,
            e.message || 'Error inesperado de envio',
            nextAttemptDate(currentAttempts),
            'EXCEPTION'
          );
        } else {
          await campaignRepo.markRecipientFailed(
            item.id,
            e.message || 'Error inesperado de envio',
            'EXCEPTION'
          );
        }
      }
    }

    // Actualizar estado de las campanas tocadas en este batch.
    const touchedIds = Array.from(
      new Set(
        pending
          .map((p) => Number(p.campaign_id))
          .filter((n) => Number.isInteger(n) && n > 0)
      )
    );
    for (const campaignId of touchedIds) {
      const summary = await campaignRepo.getCampaignStatusSummary(campaignId);
      const pendingCount = Number(summary.pending || 0) + Number(summary.sending || 0);
      const sent = Number(summary.sent || 0);
      const failed = Number(summary.failed || 0);
      const total = Number(summary.total || 0);
      let status = 'sending';
      if (pendingCount === 0) {
        if (sent > 0 && failed > 0) status = 'partial';
        else if (sent === total && total > 0) status = 'sent';
        else status = 'failed';
      }
      await campaignRepo.setCampaignStatus(campaignId, status);
    }
  } catch (e) {
    // Mantener el dispatcher vivo ante errores transitorios (DB, red, etc.).
    logger.error({ err: e }, '[whatsapp-dispatcher] error');
  } finally {
    running = false;
  }
}

function startWhatsappDispatcher({
  intervalMs = DEFAULT_INTERVAL_MS,
  batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
  if (!isDispatcherEnabled()) return;
  if (timer) return;
  const resolvedInterval = Math.max(2000, Number(intervalMs) || DEFAULT_INTERVAL_MS);
  timer = setInterval(() => {
    processBatch({ batchSize }).catch(() => {});
  }, resolvedInterval);
  if (typeof timer.unref === 'function') timer.unref();
}

function stopWhatsappDispatcher() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = {
  startWhatsappDispatcher,
  stopWhatsappDispatcher,
  processBatch,
  isDispatcherEnabled,
  nextAttemptDate,
  DEFAULT_INTERVAL_MS,
  DEFAULT_BATCH_SIZE,
  MAX_ATTEMPTS,
  ORPHAN_LOCK_MINUTES,
};