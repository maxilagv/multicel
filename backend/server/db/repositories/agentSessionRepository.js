const { query } = require('../../db/pg');

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

function normalizeSession(row) {
  if (!row) return null;
  return {
    ...row,
    summary: decodeJson(row.summary_json, {}),
    scope: decodeJson(row.scope_json, {}),
    metadata: decodeJson(row.metadata_json, {}),
  };
}

function normalizeEvent(row) {
  if (!row) return null;
  return {
    ...row,
    input: decodeJson(row.input_json, {}),
    output: decodeJson(row.output_json, {}),
  };
}

function normalizeMemory(row) {
  if (!row) return null;
  return {
    ...row,
    value: decodeJson(row.memory_value_json, {}),
  };
}

function normalizeSessionRun(row) {
  if (!row) return null;
  return {
    ...row,
    degraded: Boolean(row.degraded),
    datasets: decodeJson(row.datasets_json, []),
    summary: decodeJson(row.summary_json, {}),
  };
}

async function createSession({
  sessionKey,
  usuarioId = null,
  status = 'active',
  primaryLane = null,
  currentObjective = null,
  currentSurface = null,
  summary = {},
  scope = {},
  metadata = {},
}) {
  const { rows } = await query(
    `INSERT INTO agent_sessions(
       session_key,
       usuario_id,
       status,
       primary_lane,
       current_objective,
       current_surface,
       summary_json,
       scope_json,
       metadata_json
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      String(sessionKey || '').trim(),
      usuarioId == null ? null : Number(usuarioId),
      String(status || 'active').trim(),
      primaryLane || null,
      currentObjective || null,
      currentSurface || null,
      encodeJson(summary || {}),
      encodeJson(scope || {}),
      encodeJson(metadata || {}),
    ]
  );
  return getSessionById(rows?.[0]?.id);
}

async function getSessionById(id) {
  const { rows } = await query(
    `SELECT id,
            session_key,
            usuario_id,
            status,
            primary_lane,
            current_objective,
            current_surface,
            summary_json,
            scope_json,
            metadata_json,
            started_at,
            last_activity_at,
            closed_at,
            created_at,
            updated_at
       FROM agent_sessions
      WHERE id = $1
      LIMIT 1`,
    [Number(id)]
  );
  return normalizeSession(rows?.[0] || null);
}

async function getSessionByKeyForUser({ sessionKey, usuarioId }) {
  const { rows } = await query(
    `SELECT id,
            session_key,
            usuario_id,
            status,
            primary_lane,
            current_objective,
            current_surface,
            summary_json,
            scope_json,
            metadata_json,
            started_at,
            last_activity_at,
            closed_at,
            created_at,
            updated_at
       FROM agent_sessions
      WHERE session_key = $1
        AND usuario_id <=> $2
      LIMIT 1`,
    [String(sessionKey || '').trim(), usuarioId == null ? null : Number(usuarioId)]
  );
  return normalizeSession(rows?.[0] || null);
}

async function updateSessionSnapshot({
  id,
  status = null,
  primaryLane = null,
  currentObjective = null,
  currentSurface = null,
  summary = null,
  scope = null,
  metadata = null,
  closedAt = null,
}) {
  await query(
    `UPDATE agent_sessions
        SET status = COALESCE($2, status),
            primary_lane = COALESCE($3, primary_lane),
            current_objective = COALESCE($4, current_objective),
            current_surface = COALESCE($5, current_surface),
            summary_json = COALESCE($6, summary_json),
            scope_json = COALESCE($7, scope_json),
            metadata_json = COALESCE($8, metadata_json),
            last_activity_at = CURRENT_TIMESTAMP,
            closed_at = COALESCE($9, closed_at),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [
      Number(id),
      status == null ? null : String(status).trim(),
      primaryLane == null ? null : String(primaryLane).trim(),
      currentObjective == null ? null : String(currentObjective).trim(),
      currentSurface == null ? null : String(currentSurface).trim(),
      summary == null ? null : encodeJson(summary),
      scope == null ? null : encodeJson(scope),
      metadata == null ? null : encodeJson(metadata),
      closedAt || null,
    ]
  );
  return getSessionById(id);
}

async function appendSessionEvent({
  sessionId,
  runId = null,
  role = 'system',
  eventType,
  input = {},
  output = {},
}) {
  const { rows } = await query(
    `INSERT INTO agent_session_events(
       session_id,
       run_id,
       role,
       event_type,
       input_json,
       output_json
     )
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      Number(sessionId),
      runId == null ? null : Number(runId),
      String(role || 'system').trim(),
      String(eventType || '').trim(),
      encodeJson(input || {}),
      encodeJson(output || {}),
    ]
  );
  return rows?.[0] || null;
}

async function listSessionEvents({ sessionId, limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT id,
            session_id,
            run_id,
            role,
            event_type,
            input_json,
            output_json,
            created_at
       FROM agent_session_events
      WHERE session_id = $1
      ORDER BY id DESC
      LIMIT $2`,
    [Number(sessionId), Math.min(Math.max(Number(limit) || 20, 1), 100)]
  );
  return (rows || []).map(normalizeEvent).reverse();
}

async function upsertSessionMemory({
  sessionId,
  memoryKey,
  value = {},
  freshUntil = null,
}) {
  await query(
    `INSERT INTO agent_session_memory(
       session_id,
       memory_key,
       memory_value_json,
       fresh_until
     )
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (session_id, memory_key) DO UPDATE SET
       memory_value_json = EXCLUDED.memory_value_json,
       fresh_until = EXCLUDED.fresh_until,
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(sessionId),
      String(memoryKey || '').trim(),
      encodeJson(value || {}),
      freshUntil || null,
    ]
  );
  return getSessionMemory({ sessionId, memoryKey });
}

async function getSessionMemory({ sessionId, memoryKey }) {
  const { rows } = await query(
    `SELECT id,
            session_id,
            memory_key,
            memory_value_json,
            fresh_until,
            created_at,
            updated_at
       FROM agent_session_memory
      WHERE session_id = $1
        AND memory_key = $2
      LIMIT 1`,
    [Number(sessionId), String(memoryKey || '').trim()]
  );
  return normalizeMemory(rows?.[0] || null);
}

async function listSessionMemory({ sessionId }) {
  const { rows } = await query(
    `SELECT id,
            session_id,
            memory_key,
            memory_value_json,
            fresh_until,
            created_at,
            updated_at
       FROM agent_session_memory
      WHERE session_id = $1
      ORDER BY memory_key ASC`,
    [Number(sessionId)]
  );
  return (rows || []).map(normalizeMemory);
}

async function linkSessionRun({
  sessionId,
  runId,
  laneKey,
  surfaceKey = null,
  objective = null,
  status = 'completed',
  degraded = false,
  datasets = [],
  summary = {},
}) {
  await query(
    `INSERT INTO agent_session_runs(
       session_id,
       run_id,
       lane_key,
       surface_key,
       objective,
       status,
       degraded,
       datasets_json,
       summary_json
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (session_id, run_id) DO UPDATE SET
       lane_key = EXCLUDED.lane_key,
       surface_key = EXCLUDED.surface_key,
       objective = EXCLUDED.objective,
       status = EXCLUDED.status,
       degraded = EXCLUDED.degraded,
       datasets_json = EXCLUDED.datasets_json,
       summary_json = EXCLUDED.summary_json,
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(sessionId),
      Number(runId),
      String(laneKey || '').trim(),
      surfaceKey == null ? null : String(surfaceKey).trim(),
      objective == null ? null : String(objective).trim(),
      String(status || 'completed').trim(),
      degraded ? 1 : 0,
      encodeJson(datasets || []),
      encodeJson(summary || {}),
    ]
  );
  return listSessionRuns({ sessionId, limit: 1 }).then((rows) => rows[0] || null);
}

async function listSessionRuns({ sessionId, limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT sr.id,
            sr.session_id,
            sr.run_id,
            sr.lane_key,
            sr.surface_key,
            sr.objective,
            sr.status,
            sr.degraded,
            sr.datasets_json,
            sr.summary_json,
            sr.created_at,
            sr.updated_at,
            r.started_at AS run_started_at,
            r.completed_at AS run_completed_at
       FROM agent_session_runs sr
       JOIN ai_runs r ON r.id = sr.run_id
      WHERE sr.session_id = $1
      ORDER BY sr.id DESC
      LIMIT $2`,
    [Number(sessionId), Math.min(Math.max(Number(limit) || 20, 1), 100)]
  );
  return (rows || []).map(normalizeSessionRun);
}

async function listSessionsForUser({ usuarioId, limit = 12 } = {}) {
  const { rows } = await query(
    `SELECT id,
            session_key,
            usuario_id,
            status,
            primary_lane,
            current_objective,
            current_surface,
            summary_json,
            scope_json,
            metadata_json,
            started_at,
            last_activity_at,
            closed_at,
            created_at,
            updated_at
       FROM agent_sessions
      WHERE usuario_id <=> $1
      ORDER BY last_activity_at DESC, id DESC
      LIMIT $2`,
    [usuarioId == null ? null : Number(usuarioId), Math.min(Math.max(Number(limit) || 12, 1), 100)]
  );
  return (rows || []).map(normalizeSession);
}

module.exports = {
  createSession,
  getSessionById,
  getSessionByKeyForUser,
  updateSessionSnapshot,
  appendSessionEvent,
  listSessionEvents,
  upsertSessionMemory,
  getSessionMemory,
  listSessionMemory,
  linkSessionRun,
  listSessionRuns,
  listSessionsForUser,
};
