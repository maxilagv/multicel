-- Configuración de compensación por vendedor (sueldo fijo + tipo de comisión)
CREATE TABLE IF NOT EXISTS vendedores_config (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id           BIGINT UNSIGNED NOT NULL,
  sueldo_fijo          DECIMAL(18,2) NOT NULL DEFAULT 0,
  comision_tipo        VARCHAR(30) NOT NULL DEFAULT 'por_producto',
  periodo_liquidacion  VARCHAR(10) NOT NULL DEFAULT 'mes',
  activo               TINYINT(1) NOT NULL DEFAULT 1,
  creado_en            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vendedores_config_usuario (usuario_id),
  CONSTRAINT fk_vendedores_config_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Adelantos de sueldo
CREATE TABLE IF NOT EXISTS vendedores_adelantos (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id       BIGINT UNSIGNED NOT NULL,
  monto            DECIMAL(18,2) NOT NULL,
  fecha            DATE NOT NULL,
  notas            TEXT NULL,
  usuario_registro BIGINT UNSIGNED NULL,
  creado_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_vendedores_adelantos_usuario (usuario_id),
  KEY ix_vendedores_adelantos_fecha (fecha),
  CONSTRAINT fk_vendedores_adelantos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_vendedores_adelantos_registro FOREIGN KEY (usuario_registro) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
