CREATE TABLE IF NOT EXISTS whatsapp_auth_state (
  session_name VARCHAR(80) NOT NULL DEFAULT 'default',
  category VARCHAR(80) NOT NULL,
  item_key VARCHAR(255) NOT NULL,
  value_json LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (session_name, category, item_key),
  KEY ix_whatsapp_auth_state_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_session_meta (
  session_name VARCHAR(80) NOT NULL,
  provider VARCHAR(20) NOT NULL DEFAULT 'web',
  state VARCHAR(24) NOT NULL DEFAULT 'disconnected',
  phone VARCHAR(40) NULL,
  last_error TEXT NULL,
  qr_updated_at DATETIME NULL,
  last_connected_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (session_name),
  KEY ix_whatsapp_session_meta_state (state, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
