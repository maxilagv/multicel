const { withTransaction, query } = require('../pg');

function encodeJson(value) {
  try {
    return JSON.stringify(value == null ? null : value);
  } catch {
    return 'null';
  }
}

function decodeJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function inMarks(start, count) {
  return Array.from({ length: count }, (_, idx) => `$${start + idx}`).join(', ');
}

async function loadCreds(sessionName = 'default') {
  const { rows } = await query(
    `SELECT value_json
       FROM whatsapp_auth_state
      WHERE session_name = $1
        AND category = 'creds'
        AND item_key = 'creds'
      LIMIT 1`,
    [String(sessionName || 'default')]
  );
  return decodeJson(rows?.[0]?.value_json, null);
}

async function saveCreds(sessionName = 'default', creds) {
  await query(
    `INSERT INTO whatsapp_auth_state(session_name, category, item_key, value_json)
     VALUES ($1, 'creds', 'creds', $2)
     ON CONFLICT (session_name, category, item_key) DO UPDATE
       SET value_json = EXCLUDED.value_json,
           updated_at = CURRENT_TIMESTAMP`,
    [String(sessionName || 'default'), encodeJson(creds)]
  );
}

async function getKeys(sessionName = 'default', category, ids = []) {
  const cleanIds = Array.from(
    new Set(
      (ids || [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
  if (!cleanIds.length) return {};

  const params = [String(sessionName || 'default'), String(category || '').trim(), ...cleanIds];
  const { rows } = await query(
    `SELECT item_key, value_json
       FROM whatsapp_auth_state
      WHERE session_name = $1
        AND category = $2
        AND item_key IN (${inMarks(3, cleanIds.length)})`,
    params
  );

  const out = {};
  for (const row of rows || []) {
    out[String(row.item_key)] = decodeJson(row.value_json, null);
  }
  return out;
}

async function setKeys(sessionName = 'default', entries = [], deletions = []) {
  const cleanEntries = Array.isArray(entries) ? entries : [];
  const cleanDeletions = Array.isArray(deletions) ? deletions : [];
  const name = String(sessionName || 'default');

  await withTransaction(async (client) => {
    for (const entry of cleanEntries) {
      const category = String(entry?.category || '').trim();
      const itemKey = String(entry?.itemKey || '').trim();
      if (!category || !itemKey) continue;
      await client.query(
        `INSERT INTO whatsapp_auth_state(session_name, category, item_key, value_json)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (session_name, category, item_key) DO UPDATE
           SET value_json = EXCLUDED.value_json,
               updated_at = CURRENT_TIMESTAMP`,
        [name, category, itemKey, encodeJson(entry.value)]
      );
    }

    for (const deletion of cleanDeletions) {
      const category = String(deletion?.category || '').trim();
      const itemKey = String(deletion?.itemKey || '').trim();
      if (!category || !itemKey) continue;
      await client.query(
        `DELETE FROM whatsapp_auth_state
          WHERE session_name = $1
            AND category = $2
            AND item_key = $3`,
        [name, category, itemKey]
      );
    }
  });
}

async function hasSession(sessionName = 'default') {
  const { rows } = await query(
    `SELECT 1
       FROM whatsapp_auth_state
      WHERE session_name = $1
        AND category = 'creds'
        AND item_key = 'creds'
      LIMIT 1`,
    [String(sessionName || 'default')]
  );
  return Boolean(rows?.length);
}

async function clearSession(sessionName = 'default') {
  const name = String(sessionName || 'default');
  await withTransaction(async (client) => {
    await client.query('DELETE FROM whatsapp_auth_state WHERE session_name = $1', [name]);
    await client.query('DELETE FROM whatsapp_session_meta WHERE session_name = $1', [name]);
  });
}

async function getSessionMeta(sessionName = 'default') {
  const { rows } = await query(
    `SELECT session_name,
            provider,
            state,
            phone,
            last_error,
            qr_updated_at,
            last_connected_at,
            created_at,
            updated_at
       FROM whatsapp_session_meta
      WHERE session_name = $1
      LIMIT 1`,
    [String(sessionName || 'default')]
  );
  return rows?.[0] || null;
}

async function upsertSessionMeta(sessionName = 'default', fields = {}) {
  const prev = await getSessionMeta(sessionName);
  const payload = {
    provider: String(fields.provider || prev?.provider || 'web'),
    state: String(fields.state || prev?.state || 'disconnected'),
    phone:
      Object.prototype.hasOwnProperty.call(fields, 'phone')
        ? fields.phone || null
        : prev?.phone || null,
    last_error:
      Object.prototype.hasOwnProperty.call(fields, 'last_error')
        ? fields.last_error || null
        : prev?.last_error || null,
    qr_updated_at:
      Object.prototype.hasOwnProperty.call(fields, 'qr_updated_at')
        ? fields.qr_updated_at || null
        : prev?.qr_updated_at || null,
    last_connected_at:
      Object.prototype.hasOwnProperty.call(fields, 'last_connected_at')
        ? fields.last_connected_at || null
        : prev?.last_connected_at || null,
  };

  await query(
    `INSERT INTO whatsapp_session_meta(
       session_name, provider, state, phone, last_error, qr_updated_at, last_connected_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (session_name) DO UPDATE
       SET provider = EXCLUDED.provider,
           state = EXCLUDED.state,
           phone = EXCLUDED.phone,
           last_error = EXCLUDED.last_error,
           qr_updated_at = EXCLUDED.qr_updated_at,
           last_connected_at = EXCLUDED.last_connected_at,
           updated_at = CURRENT_TIMESTAMP`,
    [
      String(sessionName || 'default'),
      payload.provider,
      payload.state,
      payload.phone,
      payload.last_error,
      payload.qr_updated_at,
      payload.last_connected_at,
    ]
  );

  return getSessionMeta(sessionName);
}

module.exports = {
  loadCreds,
  saveCreds,
  getKeys,
  setKeys,
  hasSession,
  clearSession,
  getSessionMeta,
  upsertSessionMeta,
};
