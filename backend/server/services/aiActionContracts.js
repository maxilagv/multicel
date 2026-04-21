const { z } = require('zod');

const CONTRACT_VERSION = '2026-04-16.2';
const DELIVERY_CHANNEL = 'n8n';
const SAFETY_MODE = 'approval_first';

const CHANNELS = ['whatsapp', 'email', 'task'];
const ACTION_TYPES = [
  'customer_reactivation_review',
  'collections_followup_review',
  'price_review_workflow',
  'inventory_review_workflow',
  'operational_followup_review',
];
const CHANNEL_ENUM = z.enum(['whatsapp', 'email', 'task']);
const ACTION_TYPE_ENUM = z.enum([
  'customer_reactivation_review',
  'collections_followup_review',
  'price_review_workflow',
  'inventory_review_workflow',
  'operational_followup_review',
]);
const LOOSE_OBJECT_SCHEMA = z.record(z.string(), z.any());

const BUSINESS_SCOPE_SCHEMA = z.object({
  timezone: z.string().min(1),
  business_name: z.string().min(1),
  business_address: z.string().optional().default(''),
  business_logo_url: z.string().optional().default(''),
  depositos_visibles: z
    .array(
      z.object({
        id: z.number().int().positive(),
        nombre: z.string().min(1),
        codigo: z.string().nullable().optional(),
        rol: z.string().nullable().optional(),
      })
    )
    .default([]),
});

const ENTITY_SCHEMA = z.object({
  type: z.string().nullable().optional(),
  id: z.number().int().positive().nullable().optional(),
  name: z.string().nullable().optional(),
});

const ACTION_PAYLOAD_SCHEMA = z.object({
  proposal_id: z.number().int().positive(),
  proposal_key: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().nullable().optional(),
  why_text: z.string().nullable().optional(),
  recommended_action: z.string().nullable().optional(),
  expected_impact: z.string().nullable().optional(),
  entity: ENTITY_SCHEMA,
  evidence: LOOSE_OBJECT_SCHEMA.default({}),
  business_label: z.string().min(1),
  workflow_key: z.string().min(1),
  suggested_channels: z.array(CHANNEL_ENUM).min(1),
  customer_context: z
    .object({
      last_purchase_days: z.number().nullable().optional(),
      lead_score: z.number().nullable().optional(),
      total_spend: z.number().nullable().optional(),
      total_purchases: z.number().nullable().optional(),
      whatsapp_opt_in: z.boolean().optional(),
      email: z.string().nullable().optional(),
    })
    .optional(),
  collections_context: z
    .object({
      pending_balance: z.number().nullable().optional(),
      severity: z.string().nullable().optional(),
      raw_message: z.string().nullable().optional(),
    })
    .optional(),
  pricing_context: z
    .object({
      severity: z.string().nullable().optional(),
      raw_message: z.string().nullable().optional(),
      metrics: LOOSE_OBJECT_SCHEMA.default({}),
    })
    .optional(),
  inventory_context: z
    .object({
      days_until_break: z.number().nullable().optional(),
      severity: z.string().nullable().optional(),
      metrics: LOOSE_OBJECT_SCHEMA.default({}),
    })
    .optional(),
  review_context: z
    .object({
      severity: z.string().nullable().optional(),
      raw_message: z.string().nullable().optional(),
      metrics: LOOSE_OBJECT_SCHEMA.default({}),
    })
    .optional(),
});

const EXECUTION_CONTRACT_SCHEMA = z.object({
  contract_version: z.literal(CONTRACT_VERSION),
  action_type: ACTION_TYPE_ENUM,
  workflow_key: z.string().min(1),
  business_label: z.string().min(1),
  delivery_channel: z.literal(DELIVERY_CHANNEL),
  safety_mode: z.literal(SAFETY_MODE),
  requires_approval: z.boolean(),
  operator_user_id: z.number().int().positive().nullable(),
  business_scope: BUSINESS_SCOPE_SCHEMA,
  action_payload: ACTION_PAYLOAD_SCHEMA,
});

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function deriveActionType(proposal) {
  const sourceKey = String(proposal?.source_key || '').trim().toLowerCase();
  if (sourceKey.startsWith('cliente:')) return 'customer_reactivation_review';
  if (proposal?.category === 'cobranzas') return 'collections_followup_review';
  if (proposal?.category === 'rentabilidad') return 'price_review_workflow';
  if (proposal?.category === 'stock') return 'inventory_review_workflow';
  return 'operational_followup_review';
}

function getFallbackStatusForExecutionFailure(proposal) {
  const approvalState = String(proposal?.approval_estado || '').trim().toLowerCase();
  if (proposal?.requires_approval && approvalState === 'aprobado') return 'pendiente';
  return 'en_revision';
}

function buildSuggestedChannels(proposal, actionType) {
  if (actionType === 'customer_reactivation_review') {
    const channels = [];
    if (proposal?.evidence?.whatsapp_opt_in) channels.push('whatsapp');
    if (proposal?.evidence?.email) channels.push('email');
    channels.push('task');
    return Array.from(new Set(channels));
  }

  if (actionType === 'collections_followup_review') {
    const channels = [];
    if (proposal?.evidence?.whatsapp_opt_in) channels.push('whatsapp');
    if (proposal?.evidence?.email) channels.push('email');
    channels.push('task');
    return Array.from(new Set(channels));
  }

  return ['task'];
}

const ACTION_DEFINITIONS = {
  customer_reactivation_review: {
    businessLabel: 'Reactivar cliente',
    workflowKey: 'crm.reactivation.review',
    defaultRiskLevel: 'medium',
    approvalPolicy: 'supervised_auto',
    buildContext(proposal) {
      return {
        customer_context: {
          last_purchase_days: safeNumber(proposal?.evidence?.dias_desde_ultima_compra),
          lead_score: safeNumber(proposal?.evidence?.lead_score),
          total_spend: safeNumber(proposal?.evidence?.total_gastado),
          total_purchases: safeNumber(proposal?.evidence?.total_compras),
          whatsapp_opt_in: Boolean(proposal?.evidence?.whatsapp_opt_in),
          email: safeText(proposal?.evidence?.email),
        },
      };
    },
  },
  collections_followup_review: {
    businessLabel: 'Seguimiento de cobranza',
    workflowKey: 'finance.collections.followup',
    defaultRiskLevel: 'medium',
    approvalPolicy: 'approval_required',
    buildContext(proposal) {
      return {
        collections_context: {
          pending_balance: safeNumber(
            proposal?.evidence?.metrics?.saldo_pendiente || proposal?.evidence?.saldo_pendiente
          ),
          severity: safeText(proposal?.evidence?.severity),
          raw_message: safeText(proposal?.evidence?.raw_message),
        },
      };
    },
  },
  price_review_workflow: {
    businessLabel: 'Revision de precio',
    workflowKey: 'pricing.review',
    defaultRiskLevel: 'high',
    approvalPolicy: 'approval_required',
    buildContext(proposal) {
      return {
        pricing_context: {
          severity: safeText(proposal?.evidence?.severity),
          raw_message: safeText(proposal?.evidence?.raw_message),
          metrics: proposal?.evidence?.metrics || {},
        },
      };
    },
  },
  inventory_review_workflow: {
    businessLabel: 'Revision de stock',
    workflowKey: 'inventory.review',
    defaultRiskLevel: 'low',
    approvalPolicy: 'controlled_auto',
    buildContext(proposal) {
      return {
        inventory_context: {
          days_until_break: safeNumber(proposal?.evidence?.metrics?.dias_hasta_quiebre),
          severity: safeText(proposal?.evidence?.severity),
          metrics: proposal?.evidence?.metrics || {},
        },
      };
    },
  },
  operational_followup_review: {
    businessLabel: 'Revision operativa',
    workflowKey: 'operations.review',
    defaultRiskLevel: 'low',
    approvalPolicy: 'manual_review',
    buildContext(proposal) {
      return {
        review_context: {
          severity: safeText(proposal?.evidence?.severity),
          raw_message: safeText(proposal?.evidence?.raw_message),
          metrics: proposal?.evidence?.metrics || {},
        },
      };
    },
  },
};

const ACTION_CATALOG = Object.fromEntries(
  Object.entries(ACTION_DEFINITIONS).map(([key, value]) => [
    key,
    {
      action_type: key,
      business_label: value.businessLabel,
      workflow_key: value.workflowKey,
      default_risk_level: value.defaultRiskLevel,
      approval_policy: value.approvalPolicy,
    },
  ])
);

function buildProposalIdempotencyKey(proposal) {
  if (proposal?.proposal_key) return `proposal:${String(proposal.proposal_key).trim()}`;
  if (proposal?.source_key) return `proposal:${String(proposal.source_key).trim()}`;
  if (proposal?.id != null) return `proposal:id:${Number(proposal.id)}`;
  return 'proposal:unknown';
}

function buildExecutionIdempotencyKey(proposal) {
  return `execution:${buildProposalIdempotencyKey(proposal)}`;
}

function deriveApprovalPolicy(actionType, proposal) {
  const catalog = ACTION_CATALOG[actionType] || ACTION_CATALOG.operational_followup_review;
  if (proposal?.requires_approval) return 'approval_required';
  return catalog.approval_policy;
}

function buildProposalGovernance(proposal) {
  const actionType = deriveActionType(proposal);
  const catalog = ACTION_CATALOG[actionType] || ACTION_CATALOG.operational_followup_review;
  return {
    action_type: actionType,
    business_label: catalog.business_label,
    workflow_key: catalog.workflow_key,
    risk_level: catalog.default_risk_level,
    approval_policy: deriveApprovalPolicy(actionType, proposal),
    idempotency_key: buildProposalIdempotencyKey(proposal),
    decision_reason: {
      source_key: safeText(proposal?.source_key),
      category: safeText(proposal?.category),
      requires_approval: Boolean(proposal?.requires_approval),
      entity_type: safeText(proposal?.entity_type),
    },
  };
}

function buildExecutionContract({ proposal, businessScope, operatorUserId = null }) {
  const actionType = deriveActionType(proposal);
  const definition = ACTION_DEFINITIONS[actionType] || ACTION_DEFINITIONS.operational_followup_review;
  const suggestedChannels = buildSuggestedChannels(proposal, actionType);

  const contract = {
    contract_version: CONTRACT_VERSION,
    action_type: actionType,
    workflow_key: definition.workflowKey,
    business_label: definition.businessLabel,
    delivery_channel: DELIVERY_CHANNEL,
    safety_mode: SAFETY_MODE,
    requires_approval: Boolean(proposal?.requires_approval),
    operator_user_id: operatorUserId == null ? null : Number(operatorUserId),
    business_scope: {
      timezone: safeText(businessScope?.timezone) || 'America/Argentina/Buenos_Aires',
      business_name: safeText(businessScope?.business_name) || 'Mi Empresa',
      business_address: safeText(businessScope?.business_address) || '',
      business_logo_url: safeText(businessScope?.business_logo_url) || '',
      depositos_visibles: Array.isArray(businessScope?.depositos_visibles)
        ? businessScope.depositos_visibles.map((item) => ({
            id: Number(item.id),
            nombre: safeText(item.nombre) || 'Deposito',
            codigo: safeText(item.codigo),
            rol: safeText(item.rol),
          }))
        : [],
    },
    action_payload: {
      proposal_id: Number(proposal?.id),
      proposal_key: safeText(proposal?.proposal_key) || '',
      title: safeText(proposal?.title) || '',
      summary: safeText(proposal?.summary),
      why_text: safeText(proposal?.why_text),
      recommended_action: safeText(proposal?.recommended_action),
      expected_impact: safeText(proposal?.expected_impact),
      entity: {
        type: safeText(proposal?.entity_type),
        id: proposal?.entity_id == null ? null : Number(proposal.entity_id),
        name: safeText(proposal?.entity_name),
      },
      evidence: proposal?.evidence || {},
      business_label: definition.businessLabel,
      workflow_key: definition.workflowKey,
      suggested_channels: suggestedChannels,
      ...definition.buildContext(proposal),
    },
  };

  const parsed = EXECUTION_CONTRACT_SCHEMA.safeParse(contract);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' | ');
    throw new Error(`No se pudo construir un contrato valido para la automatizacion: ${detail}`);
  }

  return parsed.data;
}

function validateExecutionContract(contract) {
  const parsed = EXECUTION_CONTRACT_SCHEMA.safeParse(contract);
  if (parsed.success) {
    return { ok: true, contract: parsed.data, errors: [] };
  }
  return {
    ok: false,
    contract: null,
    errors: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

module.exports = {
  ACTION_TYPES,
  ACTION_CATALOG,
  ACTION_DEFINITIONS,
  CONTRACT_VERSION,
  DELIVERY_CHANNEL,
  SAFETY_MODE,
  deriveActionType,
  deriveApprovalPolicy,
  buildProposalGovernance,
  buildProposalIdempotencyKey,
  buildExecutionIdempotencyKey,
  buildExecutionContract,
  validateExecutionContract,
  getFallbackStatusForExecutionFailure,
};
