CREATE TABLE IF NOT EXISTS cobranza_promesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  monto_prometido REAL NOT NULL CHECK (monto_prometido > 0),
  fecha_promesa TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','cumplida','incumplida','cancelada')),
  canal_preferido TEXT NOT NULL DEFAULT 'manual' CHECK (canal_preferido IN ('whatsapp','email','telefono','manual')),
  notas TEXT,
  created_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_cobranza_promesas_cliente ON cobranza_promesas(cliente_id);
CREATE INDEX IF NOT EXISTS ix_cobranza_promesas_estado ON cobranza_promesas(estado, fecha_promesa);

CREATE TABLE IF NOT EXISTS cobranza_recordatorios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp','email','manual')),
  destino TEXT,
  template_code TEXT NOT NULL DEFAULT 'deuda_pendiente',
  payload_json TEXT,
  scheduled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  error_message TEXT,
  created_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_cobranza_recordatorios_status ON cobranza_recordatorios(status, scheduled_at);
CREATE INDEX IF NOT EXISTS ix_cobranza_recordatorios_cliente ON cobranza_recordatorios(cliente_id);

CREATE TABLE IF NOT EXISTS cobranza_riesgo_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  bucket TEXT NOT NULL CHECK (bucket IN ('low','medium','high','critical')),
  factores_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_cobranza_riesgo_cliente_fecha ON cobranza_riesgo_snapshots(cliente_id, created_at DESC);

CREATE TABLE IF NOT EXISTS repricing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global','categoria','proveedor','producto')),
  scope_ref_id INTEGER,
  channel TEXT CHECK (channel IN ('local','distribuidor','final') OR channel IS NULL),
  margin_min REAL NOT NULL DEFAULT 0.15 CHECK (margin_min >= 0),
  margin_target REAL NOT NULL DEFAULT 0.3 CHECK (margin_target >= 0),
  usd_pass_through REAL NOT NULL DEFAULT 1 CHECK (usd_pass_through >= 0),
  rounding_step REAL NOT NULL DEFAULT 1 CHECK (rounding_step > 0),
  prioridad INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_repricing_rules_active ON repricing_rules(status, prioridad);

CREATE TABLE IF NOT EXISTS owner_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warn','critical')),
  title TEXT NOT NULL,
  detail TEXT,
  action_label TEXT,
  action_path TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed')),
  metadata_json TEXT,
  detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_owner_alerts_status ON owner_alerts(status, detected_at DESC);

CREATE TABLE IF NOT EXISTS fiscal_ar_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('retencion','percepcion')),
  nombre TEXT NOT NULL,
  impuesto TEXT NOT NULL DEFAULT 'iibb',
  jurisdiccion TEXT NOT NULL DEFAULT 'nacional',
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global','cliente','proveedor','producto')),
  scope_ref_id INTEGER,
  alicuota REAL NOT NULL CHECK (alicuota >= 0),
  monto_minimo REAL NOT NULL DEFAULT 0 CHECK (monto_minimo >= 0),
  vigencia_desde TEXT,
  vigencia_hasta TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  prioridad INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_fiscal_ar_rules_active ON fiscal_ar_rules(activo, tipo, prioridad);

CREATE TABLE IF NOT EXISTS price_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  moneda_base TEXT NOT NULL DEFAULT 'ARS',
  canal TEXT,
  estrategia_actualizacion TEXT NOT NULL DEFAULT 'manual' CHECK (estrategia_actualizacion IN ('manual','usd','ipc','proveedor','mixta')),
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_list_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  tipo_regla TEXT NOT NULL CHECK (tipo_regla IN ('usd','ipc','proveedor','canal','markup_fijo','markup_pct')),
  prioridad INTEGER NOT NULL DEFAULT 100,
  parametros_json TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_price_list_rules_list ON price_list_rules(price_list_id, activo, prioridad);

CREATE TABLE IF NOT EXISTS channel_integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canal TEXT NOT NULL UNIQUE CHECK (canal IN ('mercadolibre','tiendanube','whatsapp_catalog')),
  estado TEXT NOT NULL DEFAULT 'disconnected' CHECK (estado IN ('disconnected','connected','error')),
  config_json TEXT,
  secret_ref TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS channel_sync_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canal TEXT NOT NULL,
  job_type TEXT NOT NULL,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS ix_channel_sync_jobs_status ON channel_sync_jobs(status, scheduled_at);

CREATE TABLE IF NOT EXISTS beta_program_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  cuit TEXT,
  segmento TEXT,
  tamano_equipo INTEGER,
  estado TEXT NOT NULL DEFAULT 'invited' CHECK (estado IN ('invited','active','paused','churned')),
  onboarded_at TEXT,
  last_feedback_at TEXT,
  nps_score INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_beta_program_companies_estado ON beta_program_companies(estado);

CREATE TABLE IF NOT EXISTS beta_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES beta_program_companies(id) ON DELETE CASCADE,
  modulo TEXT NOT NULL,
  impacto_score INTEGER NOT NULL CHECK (impacto_score >= 1 AND impacto_score <= 5),
  comentario TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_beta_feedback_company ON beta_feedback(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS release_train_cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  mes TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'open' CHECK (estado IN ('open','closed')),
  objetivos_json TEXT,
  changelog_resumen TEXT,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_release_train_cycles_estado ON release_train_cycles(estado, mes DESC);

CREATE TABLE IF NOT EXISTS release_changelog_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL REFERENCES release_train_cycles(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  titulo TEXT NOT NULL,
  impacto_negocio TEXT NOT NULL,
  kpi_target TEXT,
  released_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_release_changelog_cycle ON release_changelog_entries(cycle_id, released_at DESC);

