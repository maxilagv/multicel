BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_auth_state (
  session_name TEXT NOT NULL DEFAULT 'default',
  category TEXT NOT NULL,
  item_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_name, category, item_key)
);
CREATE INDEX IF NOT EXISTS ix_whatsapp_auth_state_updated ON whatsapp_auth_state(updated_at);

CREATE TABLE IF NOT EXISTS whatsapp_session_meta (
  session_name TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'web',
  state TEXT NOT NULL DEFAULT 'disconnected',
  phone TEXT,
  last_error TEXT,
  qr_updated_at TEXT,
  last_connected_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_whatsapp_session_meta_state ON whatsapp_session_meta(state, updated_at);

COMMIT;
