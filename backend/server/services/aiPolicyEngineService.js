const {
  deriveActionType,
  ACTION_CATALOG,
  deriveApprovalPolicy,
} = require('./aiActionContracts');
const { isStrictActionGatesEnabled } = require('./agentGovernanceService');

const BUSINESS_TIMEZONE =
  process.env.BUSINESS_TIMEZONE ||
  process.env.TZ ||
  'America/Argentina/Buenos_Aires';
const BUSINESS_HOUR_START = Math.min(
  23,
  Math.max(0, Number(process.env.AI_POLICY_BUSINESS_HOUR_START || 8))
);
const BUSINESS_HOUR_END = Math.min(
  23,
  Math.max(BUSINESS_HOUR_START, Number(process.env.AI_POLICY_BUSINESS_HOUR_END || 20))
);
const ENTITY_COOLDOWN_DAYS = Math.max(
  1,
  Number(process.env.AI_POLICY_ENTITY_COOLDOWN_DAYS || 7)
);
const MAX_AUTOMATIONS_PER_ENTITY = Math.max(
  1,
  Number(process.env.AI_POLICY_MAX_AUTOMATIONS_PER_ENTITY || 2)
);
const HIGH_BALANCE_THRESHOLD = Math.max(
  1,
  Number(process.env.AI_POLICY_HIGH_BALANCE_THRESHOLD || 250000)
);

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getBusinessHour(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: BUSINESS_TIMEZONE,
  });
  return Number(formatter.format(date));
}

function buildBaseDecision(actionType) {
  const catalog = ACTION_CATALOG[actionType] || ACTION_CATALOG.operational_followup_review;
  return {
    risk_level: catalog.default_risk_level || 'low',
    action_level:
      catalog.approval_policy === 'approval_required'
        ? 'preparacion_con_aprobacion'
        : catalog.approval_policy === 'controlled_auto' || catalog.approval_policy === 'supervised_auto'
        ? 'automatizacion_controlada'
        : 'recomendacion',
    approval_policy: catalog.approval_policy || 'manual_review',
    requires_approval: catalog.approval_policy === 'approval_required',
    can_queue_automation: true,
  };
}

function evaluateProposalPolicy({
  proposal,
  requesterRole = 'admin',
  recentExecutionCount = 0,
  now = new Date(),
} = {}) {
  const actionType = deriveActionType(proposal);
  const decision = buildBaseDecision(actionType);
  const reasons = [];
  const strictGates = isStrictActionGatesEnabled();

  const hour = getBusinessHour(now);
  const isCustomerFacing =
    actionType === 'customer_reactivation_review' ||
    actionType === 'collections_followup_review';

  if (isCustomerFacing && (hour < BUSINESS_HOUR_START || hour > BUSINESS_HOUR_END)) {
    decision.can_queue_automation = false;
    reasons.push('La accion cae fuera del horario comercial permitido.');
  }

  if (actionType === 'customer_reactivation_review') {
    const hasChannel = Boolean(proposal?.evidence?.whatsapp_opt_in) || Boolean(proposal?.evidence?.email);
    const leadScore = safeNumber(proposal?.evidence?.lead_score, 0);
    if (!hasChannel) {
      decision.can_queue_automation = false;
      reasons.push('El cliente no tiene un canal habilitado para contacto automatico.');
    }
    if (leadScore >= 90) {
      decision.requires_approval = true;
      decision.approval_policy = 'approval_required';
      reasons.push('El cliente tiene alto valor y conviene revisar el contacto antes de enviarlo.');
    }
  }

  if (actionType === 'collections_followup_review') {
    const balance = safeNumber(
      proposal?.evidence?.metrics?.saldo_pendiente || proposal?.evidence?.saldo_pendiente,
      0
    );
    const severity = String(proposal?.evidence?.severity || '').trim().toLowerCase();
    if (balance >= HIGH_BALANCE_THRESHOLD || severity === 'high') {
      decision.requires_approval = true;
      decision.risk_level = 'high';
      decision.approval_policy = 'approval_required';
      reasons.push('La cobranza tiene monto o severidad alta y requiere supervision.');
    }
  }

  if (recentExecutionCount >= MAX_AUTOMATIONS_PER_ENTITY) {
    decision.can_queue_automation = false;
    reasons.push('La entidad ya tuvo varias automatizaciones recientes y conviene evitar saturacion o conflicto.');
  }

  if (!['admin', 'gerente'].includes(String(requesterRole || '').trim().toLowerCase())) {
    decision.can_queue_automation = false;
    reasons.push('El rol actual no tiene permiso para enviar automatizaciones.');
  }

  if (proposal?.requires_approval) {
    decision.requires_approval = true;
    decision.approval_policy = 'approval_required';
  }

  if (strictGates && !proposal?.entity_type) {
    decision.can_queue_automation = false;
    reasons.push('La propuesta no identifica con precision la entidad afectada.');
  }

  return {
    action_type: actionType,
    decision_code:
      !decision.can_queue_automation ? 'blocked' : decision.requires_approval ? 'requires_approval' : 'allowed',
    ...decision,
    approval_policy: decision.approval_policy || deriveApprovalPolicy(actionType, proposal),
    recent_execution_count: recentExecutionCount,
    cooldown_window_days: ENTITY_COOLDOWN_DAYS,
    evaluated_at: now.toISOString(),
    reasons,
  };
}

module.exports = {
  BUSINESS_TIMEZONE,
  BUSINESS_HOUR_START,
  BUSINESS_HOUR_END,
  ENTITY_COOLDOWN_DAYS,
  MAX_AUTOMATIONS_PER_ENTITY,
  HIGH_BALANCE_THRESHOLD,
  evaluateProposalPolicy,
};
