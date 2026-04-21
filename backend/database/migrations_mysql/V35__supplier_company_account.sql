SET @ddl_proveedores_whatsapp = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'proveedores'
         AND column_name = 'whatsapp'
    ),
    'SELECT 1',
    'ALTER TABLE proveedores ADD COLUMN whatsapp VARCHAR(50) NULL AFTER telefono'
  )
);
PREPARE stmt_proveedores_whatsapp FROM @ddl_proveedores_whatsapp;
EXECUTE stmt_proveedores_whatsapp;
DEALLOCATE PREPARE stmt_proveedores_whatsapp;

SET @ddl_proveedores_alias = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'proveedores'
         AND column_name = 'alias_cuenta'
    ),
    'SELECT 1',
    'ALTER TABLE proveedores ADD COLUMN alias_cuenta VARCHAR(120) NULL AFTER whatsapp'
  )
);
PREPARE stmt_proveedores_alias FROM @ddl_proveedores_alias;
EXECUTE stmt_proveedores_alias;
DEALLOCATE PREPARE stmt_proveedores_alias;

SET @ddl_proveedores_cbu = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'proveedores'
         AND column_name = 'cbu'
    ),
    'SELECT 1',
    'ALTER TABLE proveedores ADD COLUMN cbu VARCHAR(40) NULL AFTER alias_cuenta'
  )
);
PREPARE stmt_proveedores_cbu FROM @ddl_proveedores_cbu;
EXECUTE stmt_proveedores_cbu;
DEALLOCATE PREPARE stmt_proveedores_cbu;

SET @ddl_proveedores_banco = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'proveedores'
         AND column_name = 'banco'
    ),
    'SELECT 1',
    'ALTER TABLE proveedores ADD COLUMN banco VARCHAR(120) NULL AFTER cbu'
  )
);
PREPARE stmt_proveedores_banco FROM @ddl_proveedores_banco;
EXECUTE stmt_proveedores_banco;
DEALLOCATE PREPARE stmt_proveedores_banco;

SET @ddl_proveedores_activo = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'proveedores'
         AND column_name = 'activo'
    ),
    'SELECT 1',
    'ALTER TABLE proveedores ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1 AFTER cuit_cuil'
  )
);
PREPARE stmt_proveedores_activo FROM @ddl_proveedores_activo;
EXECUTE stmt_proveedores_activo;
DEALLOCATE PREPARE stmt_proveedores_activo;

SET @ddl_proveedores_notas = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'proveedores'
         AND column_name = 'notas_internas'
    ),
    'SELECT 1',
    'ALTER TABLE proveedores ADD COLUMN notas_internas TEXT NULL AFTER banco'
  )
);
PREPARE stmt_proveedores_notas FROM @ddl_proveedores_notas;
EXECUTE stmt_proveedores_notas;
DEALLOCATE PREPARE stmt_proveedores_notas;

SET @ddl_proveedores_tiempo_reposicion = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'proveedores'
         AND column_name = 'tiempo_reposicion_dias'
    ),
    'SELECT 1',
    'ALTER TABLE proveedores ADD COLUMN tiempo_reposicion_dias INT NULL AFTER notas_internas'
  )
);
PREPARE stmt_proveedores_tiempo_reposicion FROM @ddl_proveedores_tiempo_reposicion;
EXECUTE stmt_proveedores_tiempo_reposicion;
DEALLOCATE PREPARE stmt_proveedores_tiempo_reposicion;

SET @ddl_proveedores_actualizado = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'proveedores'
         AND column_name = 'actualizado_en'
    ),
    'SELECT 1',
    'ALTER TABLE proveedores ADD COLUMN actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER fecha_registro'
  )
);
PREPARE stmt_proveedores_actualizado FROM @ddl_proveedores_actualizado;
EXECUTE stmt_proveedores_actualizado;
DEALLOCATE PREPARE stmt_proveedores_actualizado;

SET @ddl_ventas_proveedor_cuenta = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas'
         AND column_name = 'proveedor_cuenta_id'
    ),
    'SELECT 1',
    'ALTER TABLE ventas ADD COLUMN proveedor_cuenta_id BIGINT UNSIGNED NULL AFTER metodo_pago_id'
  )
);
PREPARE stmt_ventas_proveedor_cuenta FROM @ddl_ventas_proveedor_cuenta;
EXECUTE stmt_ventas_proveedor_cuenta;
DEALLOCATE PREPARE stmt_ventas_proveedor_cuenta;

SET @ddl_ventas_proveedor_cuenta_key = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas'
         AND index_name = 'ix_ventas_proveedor_cuenta'
    ),
    'SELECT 1',
    'ALTER TABLE ventas ADD KEY ix_ventas_proveedor_cuenta (proveedor_cuenta_id)'
  )
);
PREPARE stmt_ventas_proveedor_cuenta_key FROM @ddl_ventas_proveedor_cuenta_key;
EXECUTE stmt_ventas_proveedor_cuenta_key;
DEALLOCATE PREPARE stmt_ventas_proveedor_cuenta_key;

SET @ddl_ventas_proveedor_cuenta_fk = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.table_constraints
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas'
         AND constraint_name = 'fk_ventas_proveedor_cuenta'
    ),
    'SELECT 1',
    'ALTER TABLE ventas ADD CONSTRAINT fk_ventas_proveedor_cuenta FOREIGN KEY (proveedor_cuenta_id) REFERENCES proveedores(id) ON DELETE SET NULL'
  )
);
PREPARE stmt_ventas_proveedor_cuenta_fk FROM @ddl_ventas_proveedor_cuenta_fk;
EXECUTE stmt_ventas_proveedor_cuenta_fk;
DEALLOCATE PREPARE stmt_ventas_proveedor_cuenta_fk;

CREATE TABLE IF NOT EXISTS cuenta_empresa_transacciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  proveedor_id BIGINT UNSIGNED NOT NULL,
  venta_id BIGINT UNSIGNED NULL,
  monto DECIMAL(18,2) NOT NULL DEFAULT 0,
  moneda VARCHAR(8) NOT NULL DEFAULT 'ARS',
  estado VARCHAR(30) NOT NULL DEFAULT 'pendiente',
  origen VARCHAR(30) NOT NULL DEFAULT 'manual',
  alias_cuenta_snapshot VARCHAR(120) NULL,
  banco_snapshot VARCHAR(120) NULL,
  comprobante_url TEXT NULL,
  comprobante_nombre VARCHAR(255) NULL,
  comprobante_hash VARCHAR(64) NULL,
  nota TEXT NULL,
  metadata_json LONGTEXT NULL,
  creado_por_usuario_id BIGINT UNSIGNED NULL,
  revisado_por_usuario_id BIGINT UNSIGNED NULL,
  revisado_en DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_cuenta_empresa_transacciones_proveedor (proveedor_id),
  KEY ix_cuenta_empresa_transacciones_venta (venta_id),
  KEY ix_cuenta_empresa_transacciones_estado (estado),
  KEY ix_cuenta_empresa_transacciones_origen (origen),
  KEY ix_cuenta_empresa_transacciones_hash (comprobante_hash),
  CONSTRAINT fk_cuenta_empresa_transacciones_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cuenta_empresa_transacciones_venta FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE SET NULL,
  CONSTRAINT fk_cuenta_empresa_transacciones_creado_por FOREIGN KEY (creado_por_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_cuenta_empresa_transacciones_revisado_por FOREIGN KEY (revisado_por_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proveedores_cuenta_corriente (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  proveedor_id BIGINT UNSIGNED NOT NULL,
  compra_id BIGINT UNSIGNED NULL,
  transaccion_id BIGINT UNSIGNED NULL,
  tipo_movimiento VARCHAR(40) NOT NULL,
  debito DECIMAL(18,2) NOT NULL DEFAULT 0,
  credito DECIMAL(18,2) NOT NULL DEFAULT 0,
  descripcion TEXT NULL,
  metadata_json LONGTEXT NULL,
  creado_por_usuario_id BIGINT UNSIGNED NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pcc_compra_tipo (compra_id, tipo_movimiento),
  UNIQUE KEY uq_pcc_transaccion_tipo (transaccion_id, tipo_movimiento),
  KEY ix_pcc_proveedor (proveedor_id),
  KEY ix_pcc_fecha (fecha),
  CONSTRAINT fk_pcc_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pcc_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE SET NULL,
  CONSTRAINT fk_pcc_transaccion FOREIGN KEY (transaccion_id) REFERENCES cuenta_empresa_transacciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_pcc_creado_por FOREIGN KEY (creado_por_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO metodos_pago (nombre, moneda, activo, orden)
VALUES ('Cuenta Empresa', 'ARS', 1, 90);
