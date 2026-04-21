const DEFAULT_DISABLED_LANES = [];
const DEFAULT_DISABLED_ACTION_TYPES = [];

function normalizeBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (['1', 'true', 'on', 'yes', 'si'].includes(normalized)) return true;
  if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  return fallback;
}

function parseCsvList(value, fallback = []) {
  const raw = String(value || '').trim();
  if (!raw) return [...fallback];
  return raw
    .split(',')
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
}

function isKillSwitchEnabled() {
  return normalizeBool(process.env.AI_AGENT_KILL_SWITCH, false);
}

function isStrictActionGatesEnabled() {
  return normalizeBool(process.env.AI_AGENT_ACTION_GATES_STRICT, true);
}

function isShadowModeEnabled() {
  return normalizeBool(process.env.AI_AGENT_SHADOW_MODE, false);
}

function getDisabledLanes() {
  return parseCsvList(process.env.AI_AGENT_DISABLED_LANES, DEFAULT_DISABLED_LANES);
}

function getDisabledActionTypes() {
  return parseCsvList(process.env.AI_AGENT_DISABLED_ACTION_TYPES, DEFAULT_DISABLED_ACTION_TYPES);
}

function isLaneEnabled(laneKey) {
  const key = String(laneKey || '').trim().toLowerCase();
  if (!key) return true;
  return !getDisabledLanes().includes(key);
}

function isActionTypeEnabled(actionType) {
  const key = String(actionType || '').trim().toLowerCase();
  if (!key) return true;
  return !getDisabledActionTypes().includes(key);
}

function getAutomationWindow() {
  const raw = String(process.env.AI_AGENT_AUTOMATION_HOURS || '').trim();
  if (!raw) return null;
  const [startText, endText] = raw.split('-').map((item) => String(item || '').trim());
  const startHour = Number(startText);
  const endHour = Number(endText);
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) return null;
  if (startHour < 0 || startHour > 23 || endHour < 1 || endHour > 24) return null;
  return {
    raw,
    start_hour: startHour,
    end_hour: endHour,
  };
}

function getOperationalLimits() {
  return {
    max_automations_per_hour: Math.max(1, Number(process.env.AI_AGENT_MAX_AUTOMATIONS_PER_HOUR || 25)),
    max_automations_per_day: Math.max(1, Number(process.env.AI_AGENT_MAX_AUTOMATIONS_PER_DAY || 120)),
    max_automations_per_action_per_day: Math.max(
      1,
      Number(process.env.AI_AGENT_MAX_AUTOMATIONS_PER_ACTION_PER_DAY || 40)
    ),
  };
}

function getAlertThresholds() {
  return {
    degraded_runs_last_24h: Math.max(1, Number(process.env.AI_AGENT_ALERT_DEGRADED_RUNS_24H || 8)),
    failed_executions_last_24h: Math.max(
      1,
      Number(process.env.AI_AGENT_ALERT_FAILED_EXECUTIONS_24H || 5)
    ),
    pending_executions_last_24h: Math.max(
      1,
      Number(process.env.AI_AGENT_ALERT_PENDING_EXECUTIONS_24H || 12)
    ),
  };
}

function getBusinessHour(date = new Date()) {
  const timezone =
    process.env.BUSINESS_TIMEZONE || process.env.TZ || 'America/Argentina/Buenos_Aires';
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).format(date);
  const hour = Number(formatted);
  return Number.isInteger(hour) ? hour : null;
}

function isWithinAutomationWindow(date = new Date()) {
  const window = getAutomationWindow();
  if (!window) return true;
  const hour = getBusinessHour(date);
  if (hour == null) return true;
  return hour >= window.start_hour && hour < window.end_hour;
}

function assertRuntimeAccess({ laneKey = null } = {}) {
  if (isKillSwitchEnabled()) {
    throw new Error('El agente esta deshabilitado temporalmente por un kill switch operativo.');
  }
  if (laneKey && !isLaneEnabled(laneKey)) {
    throw new Error(`El lane "${laneKey}" esta deshabilitado por configuracion operativa.`);
  }
}

function evaluateActionExecution({
  actionType = null,
  executionCountLastHour = 0,
  executionCountLastDay = 0,
  executionCountForActionLastDay = 0,
  date = new Date(),
} = {}) {
  const reasons = [];
  const limits = getOperationalLimits();
  const actionEnabled = isActionTypeEnabled(actionType);
  const withinWindow = isWithinAutomationWindow(date);

  if (!actionEnabled) {
    reasons.push(`El action type "${actionType}" esta deshabilitado por configuracion operativa.`);
  }

  if (!withinWindow) {
    const window = getAutomationWindow();
    reasons.push(
      window
        ? `La automatizacion solo puede ejecutarse entre ${window.start_hour}:00 y ${window.end_hour}:00.`
        : 'La automatizacion esta fuera de la ventana horaria permitida.'
    );
  }

  if (executionCountLastHour >= limits.max_automations_per_hour) {
    reasons.push('Se alcanzo el limite horario de automatizaciones del agente.');
  }

  if (executionCountLastDay >= limits.max_automations_per_day) {
    reasons.push('Se alcanzo el limite diario de automatizaciones del agente.');
  }

  if (executionCountForActionLastDay >= limits.max_automations_per_action_per_day) {
    reasons.push(`Se alcanzo el limite diario para el action type "${actionType}".`);
  }

  return {
    can_execute: reasons.length === 0,
    shadow_mode: isShadowModeEnabled(),
    reasons,
    limits,
    disabled_action_types: getDisabledActionTypes(),
    automation_window: getAutomationWindow(),
    execution_counts: {
      last_hour: Number(executionCountLastHour || 0),
      last_day: Number(executionCountLastDay || 0),
      action_last_day: Number(executionCountForActionLastDay || 0),
    },
  };
}

function assertActionExecutionAllowed(input = {}) {
  const decision = evaluateActionExecution(input);
  if (!decision.can_execute) {
    throw new Error(decision.reasons[0] || 'La configuracion operativa bloqueo la automatizacion.');
  }
  return decision;
}

function buildRuntimeStatus() {
  return {
    runtime_enabled: !isKillSwitchEnabled(),
    kill_switch_enabled: isKillSwitchEnabled(),
    strict_action_gates: isStrictActionGatesEnabled(),
    shadow_mode_enabled: isShadowModeEnabled(),
    disabled_lanes: getDisabledLanes(),
    disabled_action_types: getDisabledActionTypes(),
    automation_window: getAutomationWindow(),
    operational_limits: getOperationalLimits(),
    alert_thresholds: getAlertThresholds(),
    chat_bridge_enabled: normalizeBool(process.env.AI_AGENT_CHAT_BRIDGE_ENABLED, true),
    session_enabled: normalizeBool(process.env.AI_AGENT_SESSION_ENABLED, true),
    surfaces_enabled: normalizeBool(process.env.AI_AGENT_SURFACES_ENABLED, true),
  };
}

module.exports = {
  normalizeBool,
  isKillSwitchEnabled,
  isStrictActionGatesEnabled,
  isShadowModeEnabled,
  getDisabledLanes,
  getDisabledActionTypes,
  isLaneEnabled,
  isActionTypeEnabled,
  getAutomationWindow,
  getOperationalLimits,
  getAlertThresholds,
  isWithinAutomationWindow,
  assertRuntimeAccess,
  evaluateActionExecution,
  assertActionExecutionAllowed,
  buildRuntimeStatus,
};
