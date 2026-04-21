ALTER TABLE usuarios
  ADD COLUMN deleted_at DATETIME NULL AFTER actualizado_en,
  ADD COLUMN totp_secret TEXT NULL AFTER deleted_at,
  ADD COLUMN totp_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER totp_secret,
  ADD COLUMN totp_backup_codes JSON NULL AFTER totp_enabled;

ALTER TABLE clientes
  ADD COLUMN deleted_at DATETIME NULL AFTER tags;

ALTER TABLE productos
  ADD COLUMN deleted_at DATETIME NULL AFTER actualizado_en;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NULL,
  usuario_email VARCHAR(255) NULL,
  accion VARCHAR(100) NOT NULL,
  entidad VARCHAR(50) NULL,
  entidad_id BIGINT NULL,
  datos_anteriores JSON NULL,
  datos_nuevos JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  request_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_usuario_fecha (usuario_id, created_at),
  KEY idx_audit_entidad (entidad, entidad_id),
  KEY idx_audit_accion (accion, created_at),
  KEY idx_audit_request (request_id),
  CONSTRAINT fk_audit_log_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
