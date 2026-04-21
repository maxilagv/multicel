ALTER TABLE usuarios ADD COLUMN deleted_at TEXT;
ALTER TABLE usuarios ADD COLUMN totp_secret TEXT;
ALTER TABLE usuarios ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN totp_backup_codes TEXT;

ALTER TABLE clientes ADD COLUMN deleted_at TEXT;
ALTER TABLE productos ADD COLUMN deleted_at TEXT;

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_email TEXT,
  accion TEXT NOT NULL,
  entidad TEXT,
  entidad_id INTEGER,
  datos_anteriores TEXT,
  datos_nuevos TEXT,
  ip_address TEXT,
  user_agent TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_usuario_fecha ON audit_log(usuario_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entidad ON audit_log(entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_audit_accion ON audit_log(accion, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_log(request_id);
