CREATE TABLE IF NOT EXISTS reglas_aprobacion (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  clave VARCHAR(100) NOT NULL,
  descripcion TEXT NULL,
  condicion LONGTEXT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reglas_aprobacion_clave (clave),
  KEY ix_reglas_aprobacion_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aprobaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  regla_id BIGINT UNSIGNED NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  solicitado_por_usuario_id BIGINT UNSIGNED NULL,
  aprobado_por_usuario_id BIGINT UNSIGNED NULL,
  entidad VARCHAR(120) NULL,
  entidad_id BIGINT UNSIGNED NULL,
  motivo TEXT NULL,
  payload LONGTEXT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resuelto_en DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_aprobaciones_estado (estado),
  KEY ix_aprobaciones_regla (regla_id),
  KEY ix_aprobaciones_entidad (entidad, entidad_id),
  KEY ix_aprobaciones_usuario_solicita (solicitado_por_usuario_id),
  KEY ix_aprobaciones_usuario_aprueba (aprobado_por_usuario_id),
  CONSTRAINT fk_aprobaciones_regla FOREIGN KEY (regla_id) REFERENCES reglas_aprobacion(id) ON DELETE RESTRICT,
  CONSTRAINT fk_aprobaciones_usuario_solicita FOREIGN KEY (solicitado_por_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_aprobaciones_usuario_aprueba FOREIGN KEY (aprobado_por_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aprobaciones_historial (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  aprobacion_id BIGINT UNSIGNED NOT NULL,
  usuario_id BIGINT UNSIGNED NULL,
  accion VARCHAR(20) NOT NULL,
  notas TEXT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_aprob_hist_aprob (aprobacion_id),
  KEY ix_aprob_hist_usuario (usuario_id),
  CONSTRAINT fk_aprob_hist_aprobacion FOREIGN KEY (aprobacion_id) REFERENCES aprobaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_aprob_hist_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO reglas_aprobacion (clave, descripcion, condicion, activo)
VALUES (
  'product_price_update',
  'Aprobar cambios de precio de producto que superen el umbral porcentual',
  '{"percent_threshold":10}',
  1
);
