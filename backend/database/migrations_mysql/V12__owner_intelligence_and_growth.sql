CREATE TABLE IF NOT EXISTS cobranza_promesas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id BIGINT UNSIGNED NOT NULL,
  monto_prometido DECIMAL(18,2) NOT NULL,
  fecha_promesa DATE NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  canal_preferido VARCHAR(20) NOT NULL DEFAULT 'manual',
  notas TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_cobranza_promesas_cliente (cliente_id),
  KEY ix_cobranza_promesas_estado (estado, fecha_promesa),
  CONSTRAINT fk_cobranza_promesas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_cobranza_promesas_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_cobranza_promesas_updated_by FOREIGN KEY (updated_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cobranza_recordatorios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id BIGINT UNSIGNED NOT NULL,
  canal VARCHAR(20) NOT NULL,
  destino VARCHAR(255) NULL,
  template_code VARCHAR(100) NOT NULL DEFAULT 'deuda_pendiente',
  payload_json JSON NULL,
  scheduled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_cobranza_recordatorios_status (status, scheduled_at),
  KEY ix_cobranza_recordatorios_cliente (cliente_id),
  CONSTRAINT fk_cobranza_recordatorios_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_cobranza_recordatorios_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cobranza_riesgo_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id BIGINT UNSIGNED NOT NULL,
  score INT NOT NULL,
  bucket VARCHAR(20) NOT NULL,
  factores_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_cobranza_riesgo_cliente_fecha (cliente_id, created_at),
  CONSTRAINT fk_cobranza_riesgo_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS repricing_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'global',
  scope_ref_id BIGINT UNSIGNED NULL,
  channel VARCHAR(20) NULL,
  margin_min DECIMAL(10,4) NOT NULL DEFAULT 0.1500,
  margin_target DECIMAL(10,4) NOT NULL DEFAULT 0.3000,
  usd_pass_through DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
  rounding_step DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  prioridad INT NOT NULL DEFAULT 100,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_repricing_rules_active (status, prioridad),
  CONSTRAINT fk_repricing_rules_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS owner_alerts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  alert_code VARCHAR(80) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  detail TEXT NULL,
  action_label VARCHAR(120) NULL,
  action_path VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  metadata_json JSON NULL,
  detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_owner_alerts_status (status, detected_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fiscal_ar_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo VARCHAR(20) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  impuesto VARCHAR(40) NOT NULL DEFAULT 'iibb',
  jurisdiccion VARCHAR(80) NOT NULL DEFAULT 'nacional',
  scope VARCHAR(20) NOT NULL DEFAULT 'global',
  scope_ref_id BIGINT UNSIGNED NULL,
  alicuota DECIMAL(10,4) NOT NULL,
  monto_minimo DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  vigencia_desde DATE NULL,
  vigencia_hasta DATE NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  prioridad INT NOT NULL DEFAULT 100,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_fiscal_ar_rules_active (activo, tipo, prioridad)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS price_lists (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  moneda_base VARCHAR(8) NOT NULL DEFAULT 'ARS',
  canal VARCHAR(40) NULL,
  estrategia_actualizacion VARCHAR(20) NOT NULL DEFAULT 'manual',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_price_lists_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS price_list_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  price_list_id BIGINT UNSIGNED NOT NULL,
  tipo_regla VARCHAR(30) NOT NULL,
  prioridad INT NOT NULL DEFAULT 100,
  parametros_json JSON NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_price_list_rules_list (price_list_id, activo, prioridad),
  CONSTRAINT fk_price_list_rules_list FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS channel_integrations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  canal VARCHAR(40) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'disconnected',
  config_json JSON NULL,
  secret_ref VARCHAR(255) NULL,
  last_sync_at DATETIME NULL,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_channel_integrations_canal (canal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS channel_sync_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  canal VARCHAR(40) NOT NULL,
  job_type VARCHAR(60) NOT NULL,
  payload_json JSON NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  scheduled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  error_message TEXT NULL,
  PRIMARY KEY (id),
  KEY ix_channel_sync_jobs_status (status, scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS beta_program_companies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(160) NOT NULL,
  cuit VARCHAR(32) NULL,
  segmento VARCHAR(80) NULL,
  tamano_equipo INT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'invited',
  onboarded_at DATETIME NULL,
  last_feedback_at DATETIME NULL,
  nps_score INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_beta_program_companies_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS beta_feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  modulo VARCHAR(80) NOT NULL,
  impacto_score INT NOT NULL,
  comentario TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_beta_feedback_company (company_id, created_at),
  CONSTRAINT fk_beta_feedback_company FOREIGN KEY (company_id) REFERENCES beta_program_companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS release_train_cycles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(80) NOT NULL,
  mes VARCHAR(16) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'open',
  objetivos_json JSON NULL,
  changelog_resumen TEXT NULL,
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_release_train_cycles_codigo (codigo),
  KEY ix_release_train_cycles_estado (estado, mes)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS release_changelog_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cycle_id BIGINT UNSIGNED NOT NULL,
  categoria VARCHAR(80) NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  impacto_negocio TEXT NOT NULL,
  kpi_target VARCHAR(120) NULL,
  released_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_release_changelog_cycle (cycle_id, released_at),
  CONSTRAINT fk_release_changelog_cycle FOREIGN KEY (cycle_id) REFERENCES release_train_cycles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
