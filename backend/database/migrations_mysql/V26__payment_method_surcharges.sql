-- ============================================================
-- V26: Payment method surcharges + ventas columns
-- ============================================================

-- 1. Tabla principal de recargos/descuentos por método de pago
CREATE TABLE IF NOT EXISTS metodos_pago_recargo (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  metodo_pago_id  BIGINT UNSIGNED NOT NULL,
  lista_precio_id BIGINT UNSIGNED NULL,                    -- NULL = aplica a todas las listas
  tipo            ENUM('recargo','descuento') NOT NULL DEFAULT 'recargo',
  valor_pct       DECIMAL(5,2) NOT NULL,
  activo          TINYINT(1) NOT NULL DEFAULT 1,
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_mpr_metodo_activo (metodo_pago_id, activo),
  KEY ix_mpr_lista         (lista_precio_id),
  CONSTRAINT fk_mpr_metodo FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago(id)   ON DELETE CASCADE,
  CONSTRAINT fk_mpr_lista  FOREIGN KEY (lista_precio_id) REFERENCES listas_precio(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. metodo_pago_id en ventas
SET @ddl_ventas_metodo_pago_id = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name   = 'ventas'
         AND column_name  = 'metodo_pago_id'
    ),
    'SELECT 1',
    'ALTER TABLE ventas ADD COLUMN metodo_pago_id BIGINT UNSIGNED NULL AFTER price_list_id'
  )
);
PREPARE stmt_ventas_metodo_pago_id FROM @ddl_ventas_metodo_pago_id;
EXECUTE stmt_ventas_metodo_pago_id;
DEALLOCATE PREPARE stmt_ventas_metodo_pago_id;

-- FK ventas.metodo_pago_id
SET @fk_ventas_metodo_pago_id = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema    = DATABASE()
         AND table_name      = 'ventas'
         AND constraint_name = 'fk_ventas_metodo_pago_id'
         AND constraint_type = 'FOREIGN KEY'
    ),
    'SELECT 1',
    'ALTER TABLE ventas ADD CONSTRAINT fk_ventas_metodo_pago_id FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago(id) ON DELETE SET NULL'
  )
);
PREPARE stmt_fk_ventas_metodo_pago_id FROM @fk_ventas_metodo_pago_id;
EXECUTE stmt_fk_ventas_metodo_pago_id;
DEALLOCATE PREPARE stmt_fk_ventas_metodo_pago_id;

-- 3. recargo_pago_pct en ventas (total global para cálculos)
SET @ddl_ventas_recargo_pago_pct = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name   = 'ventas'
         AND column_name  = 'recargo_pago_pct'
    ),
    'SELECT 1',
    'ALTER TABLE ventas ADD COLUMN recargo_pago_pct DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER metodo_pago_id'
  )
);
PREPARE stmt_ventas_recargo_pago_pct FROM @ddl_ventas_recargo_pago_pct;
EXECUTE stmt_ventas_recargo_pago_pct;
DEALLOCATE PREPARE stmt_ventas_recargo_pago_pct;

-- 4. recargo_pago_pct en ventas_detalle
SET @ddl_vd_recargo_pago_pct = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name   = 'ventas_detalle'
         AND column_name  = 'recargo_pago_pct'
    ),
    'SELECT 1',
    'ALTER TABLE ventas_detalle ADD COLUMN recargo_pago_pct DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER descuento_oferta_pct'
  )
);
PREPARE stmt_vd_recargo_pago_pct FROM @ddl_vd_recargo_pago_pct;
EXECUTE stmt_vd_recargo_pago_pct;
DEALLOCATE PREPARE stmt_vd_recargo_pago_pct;

-- 5. precio_sin_recargo en ventas_detalle
SET @ddl_vd_precio_sin_recargo = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name   = 'ventas_detalle'
         AND column_name  = 'precio_sin_recargo'
    ),
    'SELECT 1',
    'ALTER TABLE ventas_detalle ADD COLUMN precio_sin_recargo DECIMAL(18,2) NULL AFTER recargo_pago_pct'
  )
);
PREPARE stmt_vd_precio_sin_recargo FROM @ddl_vd_precio_sin_recargo;
EXECUTE stmt_vd_precio_sin_recargo;
DEALLOCATE PREPARE stmt_vd_precio_sin_recargo;
