CREATE TABLE IF NOT EXISTS agent_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_key VARCHAR(80) NOT NULL,
  usuario_id BIGINT UNSIGNED NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  primary_lane VARCHAR(50) NULL,
  current_objective VARCHAR(120) NULL,
  current_surface VARCHAR(50) NULL,
  summary_json JSON NULL,
  scope_json JSON NULL,
  metadata_json JSON NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agent_sessions_session_key (session_key),
  KEY ix_agent_sessions_user_status_last_activity (usuario_id, status, last_activity_at),
  KEY ix_agent_sessions_lane_last_activity (primary_lane, last_activity_at),
  CONSTRAINT fk_agent_sessions_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_session_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id BIGINT UNSIGNED NOT NULL,
  run_id BIGINT UNSIGNED NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'system',
  event_type VARCHAR(40) NOT NULL,
  input_json JSON NULL,
  output_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_agent_session_events_session_created (session_id, created_at),
  KEY ix_agent_session_events_run (run_id),
  CONSTRAINT fk_agent_session_events_session FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_session_events_run FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_session_memory (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id BIGINT UNSIGNED NOT NULL,
  memory_key VARCHAR(80) NOT NULL,
  memory_value_json JSON NULL,
  fresh_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agent_session_memory_key (session_id, memory_key),
  KEY ix_agent_session_memory_fresh_until (fresh_until),
  CONSTRAINT fk_agent_session_memory_session FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
