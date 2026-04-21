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

SET @ddl_v39_proposals_action_type = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ai_action_proposals'
         AND column_name = 'action_type'
    ),
    'SELECT 1',
    'ALTER TABLE ai_action_proposals ADD COLUMN action_type VARCHAR(80) NULL AFTER category'
  )
);
PREPARE stmt_v39_proposals_action_type FROM @ddl_v39_proposals_action_type;
EXECUTE stmt_v39_proposals_action_type;
DEALLOCATE PREPARE stmt_v39_proposals_action_type;

SET @ddl_v39_proposals_idempotency = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ai_action_proposals'
         AND column_name = 'idempotency_key'
    ),
    'SELECT 1',
    'ALTER TABLE ai_action_proposals ADD COLUMN idempotency_key VARCHAR(190) NULL AFTER proposal_key'
  )
);
PREPARE stmt_v39_proposals_idempotency FROM @ddl_v39_proposals_idempotency;
EXECUTE stmt_v39_proposals_idempotency;
DEALLOCATE PREPARE stmt_v39_proposals_idempotency;

SET @ddl_v39_proposals_risk = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ai_action_proposals'
         AND column_name = 'risk_level'
    ),
    'SELECT 1',
    'ALTER TABLE ai_action_proposals ADD COLUMN risk_level VARCHAR(20) NULL AFTER priority_level'
  )
);
PREPARE stmt_v39_proposals_risk FROM @ddl_v39_proposals_risk;
EXECUTE stmt_v39_proposals_risk;
DEALLOCATE PREPARE stmt_v39_proposals_risk;

SET @ddl_v39_proposals_approval_policy = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ai_action_proposals'
         AND column_name = 'approval_policy'
    ),
    'SELECT 1',
    'ALTER TABLE ai_action_proposals ADD COLUMN approval_policy VARCHAR(40) NULL AFTER requires_approval'
  )
);
PREPARE stmt_v39_proposals_approval_policy FROM @ddl_v39_proposals_approval_policy;
EXECUTE stmt_v39_proposals_approval_policy;
DEALLOCATE PREPARE stmt_v39_proposals_approval_policy;

SET @ddl_v39_proposals_decision_reason = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ai_action_proposals'
         AND column_name = 'decision_reason_json'
    ),
    'SELECT 1',
    'ALTER TABLE ai_action_proposals ADD COLUMN decision_reason_json JSON NULL AFTER evidence_json'
  )
);
PREPARE stmt_v39_proposals_decision_reason FROM @ddl_v39_proposals_decision_reason;
EXECUTE stmt_v39_proposals_decision_reason;
DEALLOCATE PREPARE stmt_v39_proposals_decision_reason;

SET @ddl_v39_proposals_policy_snapshot = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ai_action_proposals'
         AND column_name = 'policy_snapshot_json'
    ),
    'SELECT 1',
    'ALTER TABLE ai_action_proposals ADD COLUMN policy_snapshot_json JSON NULL AFTER decision_reason_json'
  )
);
PREPARE stmt_v39_proposals_policy_snapshot FROM @ddl_v39_proposals_policy_snapshot;
EXECUTE stmt_v39_proposals_policy_snapshot;
DEALLOCATE PREPARE stmt_v39_proposals_policy_snapshot;

SET @ddl_v39_proposals_idempotency_uk = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'ai_action_proposals'
         AND index_name = 'uq_ai_action_proposals_idempotency'
    ),
    'SELECT 1',
    'ALTER TABLE ai_action_proposals ADD UNIQUE KEY uq_ai_action_proposals_idempotency (idempotency_key)'
  )
);
PREPARE stmt_v39_proposals_idempotency_uk FROM @ddl_v39_proposals_idempotency_uk;
EXECUTE stmt_v39_proposals_idempotency_uk;
DEALLOCATE PREPARE stmt_v39_proposals_idempotency_uk;

SET @ddl_v39_executions_idempotency = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ai_action_executions'
         AND column_name = 'idempotency_key'
    ),
    'SELECT 1',
    'ALTER TABLE ai_action_executions ADD COLUMN idempotency_key VARCHAR(190) NULL AFTER proposal_id'
  )
);
PREPARE stmt_v39_executions_idempotency FROM @ddl_v39_executions_idempotency;
EXECUTE stmt_v39_executions_idempotency;
DEALLOCATE PREPARE stmt_v39_executions_idempotency;

SET @ddl_v39_executions_policy_snapshot = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ai_action_executions'
         AND column_name = 'policy_snapshot_json'
    ),
    'SELECT 1',
    'ALTER TABLE ai_action_executions ADD COLUMN policy_snapshot_json JSON NULL AFTER result_json'
  )
);
PREPARE stmt_v39_executions_policy_snapshot FROM @ddl_v39_executions_policy_snapshot;
EXECUTE stmt_v39_executions_policy_snapshot;
DEALLOCATE PREPARE stmt_v39_executions_policy_snapshot;

SET @ddl_v39_executions_approval_snapshot = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ai_action_executions'
         AND column_name = 'approval_snapshot_json'
    ),
    'SELECT 1',
    'ALTER TABLE ai_action_executions ADD COLUMN approval_snapshot_json JSON NULL AFTER policy_snapshot_json'
  )
);
PREPARE stmt_v39_executions_approval_snapshot FROM @ddl_v39_executions_approval_snapshot;
EXECUTE stmt_v39_executions_approval_snapshot;
DEALLOCATE PREPARE stmt_v39_executions_approval_snapshot;

SET @ddl_v39_executions_outcome_status = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ai_action_executions'
         AND column_name = 'outcome_status'
    ),
    'SELECT 1',
    'ALTER TABLE ai_action_executions ADD COLUMN outcome_status VARCHAR(40) NULL AFTER approval_snapshot_json'
  )
);
PREPARE stmt_v39_executions_outcome_status FROM @ddl_v39_executions_outcome_status;
EXECUTE stmt_v39_executions_outcome_status;
DEALLOCATE PREPARE stmt_v39_executions_outcome_status;

SET @ddl_v39_executions_outcome_summary = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ai_action_executions'
         AND column_name = 'outcome_summary'
    ),
    'SELECT 1',
    'ALTER TABLE ai_action_executions ADD COLUMN outcome_summary TEXT NULL AFTER outcome_status'
  )
);
PREPARE stmt_v39_executions_outcome_summary FROM @ddl_v39_executions_outcome_summary;
EXECUTE stmt_v39_executions_outcome_summary;
DEALLOCATE PREPARE stmt_v39_executions_outcome_summary;

SET @ddl_v39_executions_idempotency_uk = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'ai_action_executions'
         AND index_name = 'uq_ai_action_executions_idempotency'
    ),
    'SELECT 1',
    'ALTER TABLE ai_action_executions ADD UNIQUE KEY uq_ai_action_executions_idempotency (idempotency_key)'
  )
);
PREPARE stmt_v39_executions_idempotency_uk FROM @ddl_v39_executions_idempotency_uk;
EXECUTE stmt_v39_executions_idempotency_uk;
DEALLOCATE PREPARE stmt_v39_executions_idempotency_uk;

CREATE TABLE IF NOT EXISTS agent_session_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id BIGINT UNSIGNED NOT NULL,
  run_id BIGINT UNSIGNED NOT NULL,
  lane_key VARCHAR(60) NOT NULL,
  surface_key VARCHAR(60) NULL,
  objective VARCHAR(180) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  degraded TINYINT(1) NOT NULL DEFAULT 0,
  datasets_json JSON NULL,
  summary_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agent_session_runs_session_run (session_id, run_id),
  KEY ix_agent_session_runs_session_created (session_id, created_at),
  KEY ix_agent_session_runs_run (run_id),
  CONSTRAINT fk_agent_session_runs_session FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_session_runs_run FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
