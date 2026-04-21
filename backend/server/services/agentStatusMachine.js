const RUN_STATUSES = ['running', 'completed', 'failed', 'degraded', 'cancelled'];
const SESSION_STATUSES = ['active', 'idle', 'closed', 'archived', 'stateless'];

function normalizeStatus(status, allowed, fallback) {
  const value = String(status || '').trim().toLowerCase();
  return allowed.includes(value) ? value : fallback;
}

function normalizeRunStatus(status, fallback = 'running') {
  return normalizeStatus(status, RUN_STATUSES, fallback);
}

function normalizeSessionStatus(status, fallback = 'active') {
  return normalizeStatus(status, SESSION_STATUSES, fallback);
}

function isTerminalRunStatus(status) {
  const value = normalizeRunStatus(status, 'running');
  return value === 'completed' || value === 'failed' || value === 'degraded' || value === 'cancelled';
}

module.exports = {
  RUN_STATUSES,
  SESSION_STATUSES,
  normalizeRunStatus,
  normalizeSessionStatus,
  isTerminalRunStatus,
};
