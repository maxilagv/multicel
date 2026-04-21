const logger = require('../lib/logger');
const aiWorkspaceService = require('./aiWorkspaceService');
const aiAutomationSyncService = require('./aiAutomationSyncService');

const BUSINESS_TIMEZONE =
  process.env.BUSINESS_TIMEZONE ||
  process.env.TZ ||
  'America/Argentina/Buenos_Aires';

const TICK_MS = Math.max(60_000, Number(process.env.AI_WORKSPACE_SCHEDULER_TICK_MS || 300_000));
const DAILY_REFRESH_HOUR = Math.min(
  23,
  Math.max(0, Number(process.env.AI_WORKSPACE_DAILY_REFRESH_HOUR || 8))
);

let timer = null;
let running = false;
let lastRefreshDay = null;

function isSchedulerEnabled() {
  const raw = String(process.env.AI_WORKSPACE_SCHEDULER_ENABLED || 'true').trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'off');
}

function getBusinessNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  })
    .formatToParts(now)
    .reduce((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour || 0),
  };
}

async function runMaintenanceCycle() {
  if (running) return;
  running = true;

  try {
    await aiAutomationSyncService.reconcileRecentAiEvents({ limit: 80 });
    await aiWorkspaceService.expireStaleProposals();

    const now = getBusinessNow();
    if (now.hour >= DAILY_REFRESH_HOUR && lastRefreshDay !== now.dayKey) {
      await aiWorkspaceService.refreshWorkspace({ requestedByUsuarioId: null });
      lastRefreshDay = now.dayKey;
      logger.info(
        { day: now.dayKey, hour: now.hour },
        '[ai-workspace-scheduler] daily workspace refresh completed'
      );
    }
  } catch (error) {
    logger.error({ err: error }, '[ai-workspace-scheduler] maintenance cycle failed');
  } finally {
    running = false;
  }
}

function startAiWorkspaceScheduler() {
  if (!isSchedulerEnabled()) {
    logger.info('[ai-workspace-scheduler] disabled by environment');
    return;
  }
  if (timer) return;

  timer = setInterval(() => {
    runMaintenanceCycle().catch(() => {});
  }, TICK_MS);

  if (typeof timer.unref === 'function') timer.unref();
  setImmediate(() => {
    runMaintenanceCycle().catch(() => {});
  });

  logger.info(
    { tick_ms: TICK_MS, refresh_hour: DAILY_REFRESH_HOUR, timezone: BUSINESS_TIMEZONE },
    '[ai-workspace-scheduler] started'
  );
}

function stopAiWorkspaceScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  logger.info('[ai-workspace-scheduler] stopped');
}

module.exports = {
  startAiWorkspaceScheduler,
  stopAiWorkspaceScheduler,
  runMaintenanceCycle,
};
