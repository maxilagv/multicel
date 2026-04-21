-- V17: Perfiles de vendedores para rankings y competencia entre vendedores
-- Permite que múltiples vendedores físicos compartan un mismo login
-- y se identifiquen al momento de registrar una venta.

CREATE TABLE IF NOT EXISTS vendedor_perfiles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
  emoji VARCHAR(10) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  usuario_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vp_activo (activo),
  CONSTRAINT fk_vp_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

ALTER TABLE ventas
  ADD COLUMN vendedor_perfil_id BIGINT UNSIGNED NULL,
  ADD COLUMN vendedor_nombre VARCHAR(100) NULL,
  ADD CONSTRAINT fk_ventas_vp FOREIGN KEY (vendedor_perfil_id) REFERENCES vendedor_perfiles(id) ON DELETE SET NULL;

CREATE INDEX idx_ventas_vendedor_perfil ON ventas(vendedor_perfil_id);
