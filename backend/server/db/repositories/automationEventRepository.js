const { query } = require('../../db/pg');

function encodeJson(value) {
  try {
    return JSON.stringify(value == null ? {} : value);
  } catch {
    return '{}';
  }
}

function decodeJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeDatetime(value) {
  if (!(value instanceof Date)) return null;
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeEventRow(row) {
  if (!row) return null;
  return {
    ...row,
    aggregate_id: row.aggregate_id != null ? Number(row.aggregate_id) : null,
    attempts: Number(row.attempts || 0),
    max_attempts: Number(row.max_attempts || 0),
    payload: decodeJson(row.payload_json, {}),
  };
}

async function enqueueTx(
  client,
  {
    eventName,
    aggregateType,
    aggregateId = null,
    idempotencyKey,
    payload = {},
    maxAttempts = 8,
  }
) {
  const target = client || { query };
  const { rows } = await target.query(
    `INSERT INTO automation_events(
       event_name,
       aggregate_type,
       aggregate_id,
       idempotency_key,
       payload_json,
       max_attempts
     )
     VALUES ($1,$2,$3,$4,$5,$6)
     ON DUPLICATE KEY UPDATE
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      String(eventName || '').trim(),
      String(aggregateType || '').trim(),
      aggregateId == null ? null : Number(aggregateId),
      String(idempotencyKey || '').trim(),
      encodeJson(payload || {}),
      Math.max(1, Number(maxAttempts) || 8),
    ]
  );
  return rows[0] || null;
}

async function listPending({ limit = 20 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const { rows } = await query(
    `SELECT id,
            event_name,
            aggregate_type,
            aggregate_id,
            idempotency_key,
            payload_json,
            status,
            attempts,
            max_attempts,
            next_attempt_at,
            last_error,
            created_at,
            updated_at
       FROM automation_events
      WHERE status = 'pending'
        AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)
      ORDER BY id ASC
      LIMIT $1`,
    [lim]
  );

  return (rows || []).map(normalizeEventRow);
}

async function claimPending(id) {
  const { rows } = await query(
    `UPDATE automation_events
        SET status = 'sending',
            attempts = attempts + 1,
            locked_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND status = 'pending'
      RETURNING id,
                attempts,
                max_attempts,
                event_name,
                aggregate_type,
                aggregate_id,
                idempotency_key,
                payload_json`,
    [Number(id)]
  );

  return normalizeEventRow(rows[0] || null);
}

async function markSent(id, { responseStatus = null } = {}) {
  await query(
    `UPDATE automation_events
        SET status = 'sent',
            locked_at = NULL,
            delivered_at = CURRENT_TIMESTAMP,
            response_status = $2,
            last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [Number(id), responseStatus == null ? null : Number(responseStatus)]
  );
}

async function markPending(id, { errorMessage = null, nextAttemptAt = null } = {}) {
  await query(
    `UPDATE automation_events
        SET status = 'pending',
            locked_at = NULL,
            next_attempt_at = $3,
            last_error = $2,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [Number(id), errorMessage || null, normalizeDatetime(nextAttemptAt)]
  );
}

async function markFailed(id, { errorMessage = null, responseStatus = null } = {}) {
  await query(
    `UPDATE automation_events
        SET status = 'failed',
            locked_at = NULL,
            response_status = $3,
            last_error = $2,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [Number(id), errorMessage || null, responseStatus == null ? null : Number(responseStatus)]
  );
}

async function recoverOrphaned({ lockMinutes = 5 } = {}) {
  const minutes = Math.max(1, Number(lockMinutes) || 5);
  await query(
    `UPDATE automation_events
        SET status = 'pending',
            locked_at = NULL,
            next_attempt_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE status = 'sending'
        AND locked_at IS NOT NULL
        AND locked_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL $1 MINUTE)`,
    [minutes]
  );
}

async function getById(id) {
  const { rows } = await query(
    `SELECT id,
            event_name,
            aggregate_type,
            aggregate_id,
            idempotency_key,
            payload_json,
            status,
            attempts,
            max_attempts,
            next_attempt_at,
            last_error,
            delivered_at,
            response_status,
            created_at,
            updated_at
       FROM automation_events
      WHERE id = $1
      LIMIT 1`,
    [Number(id)]
  );
  return normalizeEventRow(rows[0] || null);
}

async function listRecent({ limit = 50, status = null, aggregateType = null } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const params = [];
  const where = [];
  if (status) {
    params.push(String(status).trim());
    where.push(`status = $${params.length}`);
  }
  if (aggregateType) {
    params.push(String(aggregateType).trim());
    where.push(`aggregate_type = $${params.length}`);
  }
  params.push(lim);

  const { rows } = await query(
    `SELECT id,
            event_name,
            aggregate_type,
            aggregate_id,
            idempotency_key,
            status,
            attempts,
            max_attempts,
            next_attempt_at,
            last_error,
            delivered_at,
            response_status,
            created_at,
            updated_at
       FROM automation_events
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY id DESC
      LIMIT $${params.length}`,
    params
  );

  return (rows || []).map(normalizeEventRow);
}

async function requeue(id) {
  const { rows } = await query(
    `UPDATE automation_events
        SET status = 'pending',
            locked_at = NULL,
            next_attempt_at = CURRENT_TIMESTAMP,
            last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id`,
    [Number(id)]
  );
  return rows[0] || null;
}

module.exports = {
  enqueueTx,
  listPending,
  claimPending,
  markSent,
  markPending,
  markFailed,
  recoverOrphaned,
  getById,
  listRecent,
  requeue,
};
