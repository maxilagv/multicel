const { query } = require('../../db/pg');
const {
  deriveActionType,
  buildProposalGovernance,
  buildExecutionIdempotencyKey,
} = require('../../services/aiActionContracts');

function encodeJson(value) {
  try {
    return JSON.stringify(value == null ? {} : value);
  } catch {
    return '{}';
  }
}

function decodeJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeRun(row) {
  if (!row) return null;
  return {
    ...row,
    scope: decodeJson(row.scope_json, {}),
    summary: decodeJson(row.summary_json, {}),
  };
}

function resolveProposalStatus(row) {
  const baseStatus = String(row.status || 'pendiente').trim().toLowerCase();
  const approvalStatus = String(row.approval_estado || '').trim().toLowerCase();
  if (
    baseStatus === 'programada' ||
    baseStatus === 'ejecutada' ||
    baseStatus === 'descartada' ||
    baseStatus === 'vencida'
  ) {
    return baseStatus;
  }
  if (approvalStatus === 'pendiente') return 'aprobacion_pendiente';
  if (approvalStatus === 'aprobado') return 'aprobada';
  if (approvalStatus === 'rechazado') return 'descartada';
  return baseStatus;
}

function normalizeProposal(row) {
  if (!row) return null;
  return {
    ...row,
    evidence: decodeJson(row.evidence_json, {}),
    decision_reason: decodeJson(row.decision_reason_json, {}),
    policy_snapshot: decodeJson(row.policy_snapshot_json, null),
    requires_approval: Boolean(row.requires_approval),
    effective_status: resolveProposalStatus(row),
    execution_payload: decodeJson(row.execution_payload_json, null),
    execution_result: decodeJson(row.execution_result_json, null),
    automation_event_status: row.automation_event_status || null,
    automation_event_error: row.automation_event_error || null,
  };
}

function isExecutionCompletedStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  return value === 'entregada' || value === 'fallida' || value === 'ejecutada';
}

function buildStatusWhere(statuses, startIndex = 1) {
  if (!Array.isArray(statuses) || !statuses.length) {
    return { clause: '', params: [] };
  }
  const clean = statuses
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (!clean.length) return { clause: '', params: [] };
  const marks = clean.map((_, index) => `$${startIndex + index}`).join(', ');
  return {
    clause: `AND p.status IN (${marks})`,
    params: clean,
  };
}

async function createRun({
  agent,
  agentVersion = null,
  objective,
  status = 'running',
  requestedByUsuarioId = null,
  scope = {},
  summary = {},
}) {
  const { rows } = await query(
    `INSERT INTO ai_runs(
       agent,
       agent_version,
       objective,
       status,
       requested_by_usuario_id,
       scope_json,
       summary_json
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      String(agent || '').trim(),
      agentVersion || null,
      String(objective || '').trim(),
      String(status || 'running').trim(),
      requestedByUsuarioId == null ? null : Number(requestedByUsuarioId),
      encodeJson(scope || {}),
      encodeJson(summary || {}),
    ]
  );
  return getRunById(rows[0]?.id);
}

async function addRunStep({
  runId,
  stepOrder,
  stepKey,
  title,
  status = 'ok',
  details = {},
}) {
  const { rows } = await query(
    `INSERT INTO ai_run_steps(
       run_id,
       step_order,
       step_key,
       title,
       status,
       details_json,
       completed_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)
     RETURNING id`,
    [
      Number(runId),
      Math.max(1, Number(stepOrder) || 1),
      String(stepKey || '').trim(),
      String(title || '').trim(),
      String(status || 'ok').trim(),
      encodeJson(details || {}),
    ]
  );
  return rows[0] || null;
}

async function completeRun({ id, status = 'completed', summary = {} }) {
  await query(
    `UPDATE ai_runs
        SET status = $2,
            summary_json = $3,
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [Number(id), String(status || 'completed').trim(), encodeJson(summary || {})]
  );
  return getRunById(id);
}

async function getRunById(id) {
  const { rows } = await query(
    `SELECT id,
            agent,
            agent_version,
            objective,
            status,
            requested_by_usuario_id,
            scope_json,
            summary_json,
            started_at,
            completed_at,
            created_at,
            updated_at
       FROM ai_runs
      WHERE id = $1
      LIMIT 1`,
    [Number(id)]
  );
  return normalizeRun(rows[0] || null);
}

async function findLatestRunForDay({ objective, day }) {
  const { rows } = await query(
    `SELECT id,
            agent,
            agent_version,
            objective,
            status,
            requested_by_usuario_id,
            scope_json,
            summary_json,
            started_at,
            completed_at,
            created_at,
            updated_at
       FROM ai_runs
      WHERE objective = $1
        AND DATE(started_at) = DATE($2)
      ORDER BY id DESC
      LIMIT 1`,
    [String(objective || '').trim(), day]
  );
  return normalizeRun(rows[0] || null);
}

async function listRuns({ objective = null, limit = 10 } = {}) {
  const params = [];
  const where = [];
  if (objective) {
    params.push(String(objective).trim());
    where.push(`objective = $${params.length}`);
  }
  params.push(Math.min(Math.max(Number(limit) || 10, 1), 100));
  const { rows } = await query(
    `SELECT id,
            agent,
            agent_version,
            objective,
            status,
            requested_by_usuario_id,
            scope_json,
            summary_json,
            started_at,
            completed_at,
            created_at,
            updated_at
       FROM ai_runs
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY id DESC
      LIMIT $${params.length}`,
    params
  );
  return (rows || []).map(normalizeRun);
}

async function upsertProposal({
  runId = null,
  proposalKey,
  sourceType,
  sourceKey,
  category,
  actionType = null,
  priorityLevel = 'media',
  title,
  summary = null,
  whyText = null,
  recommendedAction = null,
  expectedImpact = null,
  evidence = {},
  entityType = null,
  entityId = null,
  entityName = null,
  requiresApproval = false,
  riskLevel = null,
  approvalPolicy = null,
  idempotencyKey = null,
  decisionReason = {},
  policySnapshot = null,
}) {
  const syntheticProposal = {
    id: entityId == null ? null : Number(entityId),
    proposal_key: proposalKey,
    source_key: sourceKey,
    category,
    title,
    summary,
    why_text: whyText,
    recommended_action: recommendedAction,
    expected_impact: expectedImpact,
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    requires_approval: requiresApproval,
    evidence,
  };
  const governance = buildProposalGovernance(syntheticProposal);
  const { rows } = await query(
    `INSERT INTO ai_action_proposals(
       run_id,
       proposal_key,
       idempotency_key,
       source_type,
       source_key,
       category,
       action_type,
       priority_level,
       risk_level,
       title,
       summary,
       why_text,
       recommended_action,
       expected_impact,
       evidence_json,
       decision_reason_json,
       policy_snapshot_json,
       entity_type,
       entity_id,
       entity_name,
       requires_approval,
       approval_policy,
       last_seen_at
     )
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,CURRENT_TIMESTAMP
     )
     ON CONFLICT (proposal_key) DO UPDATE SET
       run_id = EXCLUDED.run_id,
       idempotency_key = EXCLUDED.idempotency_key,
       source_type = EXCLUDED.source_type,
       source_key = EXCLUDED.source_key,
       category = EXCLUDED.category,
       action_type = EXCLUDED.action_type,
       priority_level = EXCLUDED.priority_level,
        risk_level = EXCLUDED.risk_level,
       title = EXCLUDED.title,
       summary = EXCLUDED.summary,
       why_text = EXCLUDED.why_text,
       recommended_action = EXCLUDED.recommended_action,
       expected_impact = EXCLUDED.expected_impact,
       evidence_json = EXCLUDED.evidence_json,
       decision_reason_json = EXCLUDED.decision_reason_json,
       policy_snapshot_json = EXCLUDED.policy_snapshot_json,
       entity_type = EXCLUDED.entity_type,
       entity_id = EXCLUDED.entity_id,
       entity_name = EXCLUDED.entity_name,
       requires_approval = EXCLUDED.requires_approval,
       approval_policy = EXCLUDED.approval_policy,
       status = CASE
         WHEN ai_action_proposals.status = 'vencida' THEN 'pendiente'
         ELSE ai_action_proposals.status
       END,
       resolved_note = CASE
         WHEN ai_action_proposals.status = 'vencida' THEN NULL
         ELSE ai_action_proposals.resolved_note
       END,
       last_seen_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      runId == null ? null : Number(runId),
      String(proposalKey || '').trim(),
      idempotencyKey || governance.idempotency_key || null,
      String(sourceType || '').trim(),
      String(sourceKey || '').trim(),
      String(category || '').trim(),
      actionType || deriveActionType(syntheticProposal),
      String(priorityLevel || 'media').trim(),
      riskLevel || governance.risk_level || null,
      String(title || '').trim(),
      summary || null,
      whyText || null,
      recommendedAction || null,
      expectedImpact || null,
      encodeJson(evidence || {}),
      encodeJson(decisionReason || governance.decision_reason || {}),
      encodeJson(policySnapshot || null),
      entityType || null,
      entityId == null ? null : Number(entityId),
      entityName || null,
      requiresApproval ? 1 : 0,
      approvalPolicy || governance.approval_policy || null,
    ]
  );
  return getProposalById(rows[0]?.id);
}

async function getProposalById(id) {
  const { rows } = await query(
    `SELECT p.id,
            p.run_id,
            p.proposal_key,
            p.idempotency_key,
            p.source_type,
            p.source_key,
            p.category,
            p.action_type,
            p.priority_level,
            p.risk_level,
            p.title,
            p.summary,
            p.why_text,
            p.recommended_action,
            p.expected_impact,
            p.evidence_json,
            p.decision_reason_json,
            p.policy_snapshot_json,
            p.entity_type,
            p.entity_id,
            p.entity_name,
            p.status,
            p.requires_approval,
            p.approval_policy,
            p.approval_id,
            p.approval_requested_at,
            p.resolved_by_usuario_id,
            p.resolved_note,
            p.last_seen_at,
            p.created_at,
            p.updated_at,
            a.estado AS approval_estado,
            e.id AS execution_id,
            e.status AS execution_status,
            e.channel AS execution_channel,
            e.payload_json AS execution_payload_json,
            e.result_json AS execution_result_json,
            e.automation_event_id,
            e.completed_at AS execution_completed_at,
            ae.status AS automation_event_status,
            ae.last_error AS automation_event_error
       FROM ai_action_proposals p
       LEFT JOIN aprobaciones a ON a.id = p.approval_id
       LEFT JOIN ai_action_executions e ON e.proposal_id = p.id
       LEFT JOIN automation_events ae ON ae.id = e.automation_event_id
      WHERE p.id = $1
      LIMIT 1`,
    [Number(id)]
  );
  return normalizeProposal(rows[0] || null);
}

async function listProposals({
  statuses = ['pendiente', 'en_revision', 'aprobacion_pendiente', 'aprobada'],
  category = null,
  limit = 40,
  recentDays = 30,
} = {}) {
  const params = [];
  let statusWhere = '';
  if (Array.isArray(statuses) && statuses.length) {
    const cleanStatuses = statuses
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .map((item) => {
        if (item === 'aprobacion_pendiente') return 'pendiente';
        if (item === 'aprobada') return 'pendiente';
        return item;
      });
    const built = buildStatusWhere(cleanStatuses, params.length + 1);
    statusWhere = built.clause;
    params.push(...built.params);
  }

  let categoryWhere = '';
  if (category) {
    params.push(String(category).trim());
    categoryWhere = `AND p.category = $${params.length}`;
  }

  params.push(Math.max(1, Number(recentDays) || 30));
  params.push(Math.min(Math.max(Number(limit) || 40, 1), 200));

  const { rows } = await query(
    `SELECT p.id,
            p.run_id,
            p.proposal_key,
            p.idempotency_key,
            p.source_type,
            p.source_key,
            p.category,
            p.action_type,
            p.priority_level,
            p.risk_level,
            p.title,
            p.summary,
            p.why_text,
            p.recommended_action,
            p.expected_impact,
            p.evidence_json,
            p.decision_reason_json,
            p.policy_snapshot_json,
            p.entity_type,
            p.entity_id,
            p.entity_name,
            p.status,
            p.requires_approval,
            p.approval_policy,
            p.approval_id,
            p.approval_requested_at,
            p.resolved_by_usuario_id,
            p.resolved_note,
            p.last_seen_at,
            p.created_at,
            p.updated_at,
            a.estado AS approval_estado,
            e.id AS execution_id,
            e.status AS execution_status,
            e.channel AS execution_channel,
            e.payload_json AS execution_payload_json,
            e.result_json AS execution_result_json,
            e.automation_event_id,
            e.completed_at AS execution_completed_at,
            ae.status AS automation_event_status,
            ae.last_error AS automation_event_error
       FROM ai_action_proposals p
       LEFT JOIN aprobaciones a ON a.id = p.approval_id
       LEFT JOIN ai_action_executions e ON e.proposal_id = p.id
       LEFT JOIN automation_events ae ON ae.id = e.automation_event_id
      WHERE p.last_seen_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL $${params.length - 1} DAY)
        ${statusWhere}
        ${categoryWhere}
      ORDER BY
        CASE p.priority_level
          WHEN 'alta' THEN 3
          WHEN 'media' THEN 2
          ELSE 1
        END DESC,
        p.last_seen_at DESC,
        p.id DESC
      LIMIT $${params.length}`,
    params
  );

  const normalized = (rows || []).map(normalizeProposal);
  return normalized.filter((item) => {
    if (!statuses || !statuses.length) return true;
    return statuses.includes(item.effective_status);
  });
}

async function updateProposalStatus({
  id,
  status,
  resolvedByUsuarioId = null,
  resolvedNote = null,
}) {
  await query(
    `UPDATE ai_action_proposals
        SET status = $2,
            resolved_by_usuario_id = $3,
            resolved_note = $4,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [
      Number(id),
      String(status || '').trim(),
      resolvedByUsuarioId == null ? null : Number(resolvedByUsuarioId),
      resolvedNote || null,
    ]
  );
  return getProposalById(id);
}

async function updateProposalStatusTx(
  client,
  { id, status, resolvedByUsuarioId = null, resolvedNote = null }
) {
  const target = client || { query };
  await target.query(
    `UPDATE ai_action_proposals
        SET status = $2,
            resolved_by_usuario_id = $3,
            resolved_note = $4,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [
      Number(id),
      String(status || '').trim(),
      resolvedByUsuarioId == null ? null : Number(resolvedByUsuarioId),
      resolvedNote || null,
    ]
  );
}

async function attachApproval({ id, approvalId }) {
  await query(
    `UPDATE ai_action_proposals
        SET approval_id = $2,
            approval_requested_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [Number(id), Number(approvalId)]
  );
  return getProposalById(id);
}

async function getExecutionByProposalId(proposalId) {
  const { rows } = await query(
    `SELECT id,
            proposal_id,
            idempotency_key,
            status,
            channel,
            payload_json,
            result_json,
            policy_snapshot_json,
            approval_snapshot_json,
            outcome_status,
            outcome_summary,
            automation_event_id,
            ae.status AS automation_event_status,
            ae.last_error AS automation_event_error,
            requested_by_usuario_id,
            executed_by_usuario_id,
            started_at,
            completed_at,
            created_at,
            updated_at
       FROM ai_action_executions
       LEFT JOIN automation_events ae ON ae.id = ai_action_executions.automation_event_id
      WHERE proposal_id = $1
      LIMIT 1`,
    [Number(proposalId)]
  );
  const row = rows[0] || null;
  if (!row) return null;
  return {
    ...row,
    payload: decodeJson(row.payload_json, {}),
    result: decodeJson(row.result_json, {}),
    policy_snapshot: decodeJson(row.policy_snapshot_json, null),
    approval_snapshot: decodeJson(row.approval_snapshot_json, null),
  };
}

async function listRecentExecutions({ limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT e.id,
            e.proposal_id,
            e.idempotency_key,
            e.status,
            e.channel,
            e.payload_json,
            e.result_json,
            e.policy_snapshot_json,
            e.approval_snapshot_json,
            e.outcome_status,
            e.outcome_summary,
            e.automation_event_id,
            ae.status AS automation_event_status,
            ae.last_error AS automation_event_error,
            ae.updated_at AS automation_event_updated_at,
            p.title AS proposal_title,
            p.category AS proposal_category,
            p.entity_name AS proposal_entity_name,
            e.started_at,
            e.completed_at,
            e.created_at,
            e.updated_at
       FROM ai_action_executions e
       JOIN ai_action_proposals p ON p.id = e.proposal_id
       LEFT JOIN automation_events ae ON ae.id = e.automation_event_id
      ORDER BY e.id DESC
      LIMIT $1`,
    [Math.min(Math.max(Number(limit) || 20, 1), 100)]
  );
  return (rows || []).map((row) => ({
    ...row,
    payload: decodeJson(row.payload_json, {}),
    result: decodeJson(row.result_json, {}),
    policy_snapshot: decodeJson(row.policy_snapshot_json, null),
    approval_snapshot: decodeJson(row.approval_snapshot_json, null),
  }));
}

async function countRecentExecutionsForEntity({
  entityType,
  entityId,
  days = 7,
} = {}) {
  if (!entityType || entityId == null) return 0;
  const { rows } = await query(
    `SELECT COUNT(*) AS total
       FROM ai_action_executions e
       JOIN ai_action_proposals p ON p.id = e.proposal_id
      WHERE p.entity_type = $1
        AND p.entity_id = $2
        AND e.created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL $3 DAY)
        AND e.status IN ('programada', 'en_proceso', 'reintentando', 'entregada', 'ejecutada')`,
    [String(entityType), Number(entityId), Math.max(1, Number(days) || 7)]
  );
  return Number(rows?.[0]?.total || 0);
}

async function countExecutionsSince({
  amount = 24,
  unit = 'HOUR',
  actionType = null,
  statuses = ['programada', 'en_proceso', 'reintentando', 'entregada', 'ejecutada', 'shadowed'],
} = {}) {
  const safeUnit = String(unit || 'HOUR').trim().toUpperCase() === 'DAY' ? 'DAY' : 'HOUR';
  const params = [];
  const cleanStatuses = (Array.isArray(statuses) ? statuses : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const statusMarks = cleanStatuses.map((_, index) => `$${index + 1}`).join(', ');
  if (cleanStatuses.length) {
    params.push(...cleanStatuses);
  }

  let actionTypeWhere = '';
  if (actionType) {
    params.push(String(actionType).trim());
    actionTypeWhere = `AND p.action_type = $${params.length}`;
  }

  params.push(Math.max(1, Number(amount) || 1));
  const { rows } = await query(
    `SELECT COUNT(*) AS total
       FROM ai_action_executions e
       JOIN ai_action_proposals p ON p.id = e.proposal_id
      WHERE e.created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL $${params.length} ${safeUnit})
        ${cleanStatuses.length ? `AND e.status IN (${statusMarks})` : ''}
        ${actionTypeWhere}`,
    params
  );
  return Number(rows?.[0]?.total || 0);
}

async function createOrUpdateExecutionTx(
  client,
  {
    proposalId,
    status = 'programada',
    channel = 'n8n',
    payload = {},
    result = {},
    idempotencyKey = null,
    policySnapshot = null,
    approvalSnapshot = null,
    outcomeStatus = null,
    outcomeSummary = null,
    automationEventId = null,
    requestedByUsuarioId = null,
    executedByUsuarioId = null,
  }
) {
  const target = client || { query };
  const normalizedStatus = String(status || 'programada').trim();
  const completedAt = isExecutionCompletedStatus(normalizedStatus) ? new Date() : null;
  const { rows } = await target.query(
    `INSERT INTO ai_action_executions(
       proposal_id,
       idempotency_key,
       status,
       channel,
       payload_json,
       result_json,
       policy_snapshot_json,
       approval_snapshot_json,
       outcome_status,
       outcome_summary,
       automation_event_id,
       requested_by_usuario_id,
       executed_by_usuario_id,
       completed_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (proposal_id) DO UPDATE SET
       idempotency_key = EXCLUDED.idempotency_key,
       status = EXCLUDED.status,
       channel = EXCLUDED.channel,
       payload_json = EXCLUDED.payload_json,
       result_json = EXCLUDED.result_json,
       policy_snapshot_json = EXCLUDED.policy_snapshot_json,
       approval_snapshot_json = EXCLUDED.approval_snapshot_json,
       outcome_status = EXCLUDED.outcome_status,
       outcome_summary = EXCLUDED.outcome_summary,
       automation_event_id = EXCLUDED.automation_event_id,
       requested_by_usuario_id = EXCLUDED.requested_by_usuario_id,
       executed_by_usuario_id = EXCLUDED.executed_by_usuario_id,
       completed_at = EXCLUDED.completed_at,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      Number(proposalId),
      idempotencyKey || buildExecutionIdempotencyKey({ proposal_id: proposalId, proposal_key: `proposal:${proposalId}` }),
      normalizedStatus,
      String(channel || 'n8n').trim(),
      encodeJson(payload || {}),
      encodeJson(result || {}),
      encodeJson(policySnapshot || null),
      encodeJson(approvalSnapshot || null),
      outcomeStatus || null,
      outcomeSummary || null,
      automationEventId == null ? null : Number(automationEventId),
      requestedByUsuarioId == null ? null : Number(requestedByUsuarioId),
      executedByUsuarioId == null ? null : Number(executedByUsuarioId),
      completedAt,
    ]
  );
  return rows[0] || null;
}

function normalizeFeedback(row) {
  if (!row) return null;
  return {
    ...row,
  };
}

async function createFeedback({
  proposalId = null,
  runId = null,
  feedbackType,
  rating = null,
  notes = null,
  createdByUsuarioId = null,
}) {
  const { rows } = await query(
    `INSERT INTO ai_feedback(
       proposal_id,
       run_id,
       feedback_type,
       rating,
       notes,
       created_by_usuario_id
     )
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      proposalId == null ? null : Number(proposalId),
      runId == null ? null : Number(runId),
      String(feedbackType || '').trim(),
      rating == null ? null : Number(rating),
      notes || null,
      createdByUsuarioId == null ? null : Number(createdByUsuarioId),
    ]
  );
  return getFeedbackById(rows?.[0]?.id);
}

async function getFeedbackById(id) {
  const { rows } = await query(
    `SELECT id,
            proposal_id,
            run_id,
            feedback_type,
            rating,
            notes,
            created_by_usuario_id,
            created_at
       FROM ai_feedback
      WHERE id = $1
      LIMIT 1`,
    [Number(id)]
  );
  return normalizeFeedback(rows?.[0] || null);
}

async function listFeedbackForRun({ runId, limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT id,
            proposal_id,
            run_id,
            feedback_type,
            rating,
            notes,
            created_by_usuario_id,
            created_at
       FROM ai_feedback
      WHERE run_id = $1
      ORDER BY id DESC
      LIMIT $2`,
    [Number(runId), Math.min(Math.max(Number(limit) || 20, 1), 100)]
  );
  return (rows || []).map(normalizeFeedback);
}

async function getFeedbackSummary({ days = 30 } = {}) {
  const { rows } = await query(
    `SELECT feedback_type,
            COUNT(*) AS total,
            AVG(rating) AS avg_rating
       FROM ai_feedback
      WHERE created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL $1 DAY)
      GROUP BY feedback_type
      ORDER BY feedback_type ASC`,
    [Math.max(1, Number(days) || 30)]
  );
  return {
    days: Math.max(1, Number(days) || 30),
    items: (rows || []).map((row) => ({
      feedback_type: row.feedback_type,
      total: Number(row.total || 0),
      avg_rating: row.avg_rating == null ? null : Number(row.avg_rating),
    })),
  };
}

async function getFeedbackScorecard({ days = 30 } = {}) {
  const normalizedDays = Math.max(1, Number(days) || 30);
  const { rows } = await query(
    `SELECT COALESCE(p.category, 'sin_categoria') AS category,
            f.feedback_type,
            COUNT(*) AS total,
            AVG(f.rating) AS avg_rating
       FROM ai_feedback f
       LEFT JOIN ai_action_proposals p ON p.id = f.proposal_id
      WHERE f.created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL $1 DAY)
      GROUP BY COALESCE(p.category, 'sin_categoria'), f.feedback_type
      ORDER BY category ASC, f.feedback_type ASC`,
    [normalizedDays]
  );
  return {
    days: normalizedDays,
    items: (rows || []).map((row) => ({
      category: row.category,
      feedback_type: row.feedback_type,
      total: Number(row.total || 0),
      avg_rating: row.avg_rating == null ? null : Number(row.avg_rating),
    })),
  };
}

async function getExecutionScorecard({ days = 30 } = {}) {
  const normalizedDays = Math.max(1, Number(days) || 30);
  const { rows } = await query(
    `SELECT COALESCE(p.action_type, 'unknown') AS action_type,
            e.status,
            COUNT(*) AS total
       FROM ai_action_executions e
       JOIN ai_action_proposals p ON p.id = e.proposal_id
      WHERE e.created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL $1 DAY)
      GROUP BY COALESCE(p.action_type, 'unknown'), e.status
      ORDER BY action_type ASC, e.status ASC`,
    [normalizedDays]
  );
  return {
    days: normalizedDays,
    items: (rows || []).map((row) => ({
      action_type: row.action_type,
      status: row.status,
      total: Number(row.total || 0),
    })),
  };
}

async function countRunsByStatus({ hours = 24 } = {}) {
  const normalizedHours = Math.max(1, Number(hours) || 24);
  const { rows } = await query(
    `SELECT status,
            COUNT(*) AS total
       FROM ai_runs
      WHERE started_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL $1 HOUR)
      GROUP BY status
      ORDER BY status ASC`,
    [normalizedHours]
  );
  return {
    hours: normalizedHours,
    items: (rows || []).map((row) => ({
      status: row.status,
      total: Number(row.total || 0),
    })),
  };
}

async function listStaleProposals({
  olderThanDays = 7,
  statuses = ['pendiente', 'en_revision', 'programada'],
} = {}) {
  const params = [];
  const built = buildStatusWhere(statuses, 1);
  params.push(...built.params);
  params.push(Math.max(1, Number(olderThanDays) || 7));
  const { rows } = await query(
    `SELECT p.id,
            p.status,
            p.approval_id,
            a.estado AS approval_estado
       FROM ai_action_proposals p
       LEFT JOIN aprobaciones a ON a.id = p.approval_id
      WHERE p.last_seen_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL $${params.length} DAY)
        ${built.clause}`,
    params
  );
  return rows || [];
}

module.exports = {
  createRun,
  addRunStep,
  completeRun,
  getRunById,
  findLatestRunForDay,
  listRuns,
  upsertProposal,
  getProposalById,
  listProposals,
  updateProposalStatus,
  updateProposalStatusTx,
  attachApproval,
  getExecutionByProposalId,
  listRecentExecutions,
  countRecentExecutionsForEntity,
  countExecutionsSince,
  createOrUpdateExecutionTx,
  listStaleProposals,
  createFeedback,
  getFeedbackById,
  listFeedbackForRun,
  getFeedbackSummary,
  getFeedbackScorecard,
  getExecutionScorecard,
  countRunsByStatus,
};
