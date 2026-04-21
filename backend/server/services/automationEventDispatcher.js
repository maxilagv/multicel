const logger = require('../lib/logger');
const automationEventRepo = require('../db/repositories/automationEventRepository');
const n8nService = require('./n8nService');
const aiAutomationSyncService = require('./aiAutomationSyncService');

let timer = null;
let running = false;

const DEFAULT_INTERVAL_MS = Math.max(
  2000,
  Number(process.env.AUTOMATION_EVENTS_INTERVAL_MS || 10000)
);
const DEFAULT_BATCH_SIZE = Math.min(
  Math.max(Number(process.env.AUTOMATION_EVENTS_BATCH_SIZE || 20), 1),
  200
);
const ORPHAN_LOCK_MINUTES = Math.max(
  1,
  Number(process.env.AUTOMATION_EVENTS_ORPHAN_LOCK_MINUTES || 5)
);

async function syncAiExecutionSafely(automationEventId) {
  try {
    await aiAutomationSyncService.syncAutomationEventToAiExecution({
      automationEventId,
    });
  } catch (error) {
    logger.warn(
      { err: error, automationEventId },
      '[automation-events] ai execution sync failed'
    );
  }
}

function isDispatcherEnabled() {
  const raw = String(process.env.AUTOMATION_EVENTS_ENABLED || 'true').trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'off');
}

function nextAttemptDate(attempt) {
  const baseSeconds = [30, 120, 600, 1800, 3600, 7200];
  const index = Math.min(Math.max(Number(attempt || 1) - 1, 0), baseSeconds.length - 1);
  return new Date(Date.now() + baseSeconds[index] * 1000);
}

async function processBatch({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  if (running) return;
  if (!n8nService.isEnabled()) return;
  running = true;

  try {
    await automationEventRepo.recoverOrphaned({ lockMinutes: ORPHAN_LOCK_MINUTES });
    const pending = await automationEventRepo.listPending({ limit: batchSize });
    if (!pending.length) return;

    for (const item of pending) {
      const claimed = await automationEventRepo.claimPending(item.id);
      if (!claimed) continue;

      const result = await n8nService.deliverEvent({
        eventName: claimed.event_name,
        idempotencyKey: claimed.idempotency_key,
        payload: claimed.payload || {},
      });

      if (result.ok) {
        await automationEventRepo.markSent(claimed.id, {
          responseStatus: result.status,
        });
        await syncAiExecutionSafely(claimed.id);
        continue;
      }

      const attempts = Number(claimed.attempts || 0);
      const maxAttempts = Number(claimed.max_attempts || 0);

      if ((result.retryable || result.skipped === 'n8n_not_configured') && attempts < maxAttempts) {
        await automationEventRepo.markPending(claimed.id, {
          errorMessage: result.errorMessage || result.body || result.skipped || 'Entrega pendiente',
          nextAttemptAt: nextAttemptDate(attempts),
        });
        await syncAiExecutionSafely(claimed.id);
      } else {
        await automationEventRepo.markFailed(claimed.id, {
          errorMessage: result.errorMessage || result.body || 'No se pudo entregar el evento',
          responseStatus: result.status,
        });
        await syncAiExecutionSafely(claimed.id);
      }
    }
  } catch (error) {
    logger.error({ err: error }, '[automation-events] dispatcher error');
  } finally {
    running = false;
  }
}

function startAutomationEventDispatcher({
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
  setImmediate(() => {
    processBatch({ batchSize }).catch(() => {});
  });
}

function stopAutomationEventDispatcher() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = {
  isDispatcherEnabled,
  processBatch,
  startAutomationEventDispatcher,
  stopAutomationEventDispatcher,
  nextAttemptDate,
};
