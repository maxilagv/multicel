INSERT INTO roles(nombre) VALUES ('fletero')
ON DUPLICATE KEY UPDATE nombre = nombre;

CREATE TABLE IF NOT EXISTS ofertas_precios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(160) NOT NULL,
  descripcion TEXT NULL,
  tipo_oferta VARCHAR(20) NOT NULL DEFAULT 'cantidad',
  producto_id BIGINT UNSIGNED NULL,
  lista_precio_objetivo VARCHAR(20) NOT NULL DEFAULT 'todas',
  cantidad_minima INT NOT NULL DEFAULT 1,
  descuento_pct DECIMAL(7,2) NOT NULL DEFAULT 0,
  fecha_desde DATETIME NULL,
  fecha_hasta DATETIME NULL,
  prioridad INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_ofertas_precios_activo (activo),
  KEY ix_ofertas_precios_tipo (tipo_oferta),
  KEY ix_ofertas_precios_producto (producto_id),
  KEY ix_ofertas_precios_fechas (fecha_desde, fecha_hasta),
  CONSTRAINT fk_ofertas_precios_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @ddl_ventas_price_list_type = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'ventas'
        AND column_name = 'price_list_type'
    ),
    'SELECT 1',
    "ALTER TABLE ventas ADD COLUMN price_list_type VARCHAR(20) NOT NULL DEFAULT 'local' AFTER caja_tipo"
  )
);
PREPARE stmt_ventas_price_list_type FROM @ddl_ventas_price_list_type;
EXECUTE stmt_ventas_price_list_type;
DEALLOCATE PREPARE stmt_ventas_price_list_type;

SET @ddl_vd_lista_precio_codigo = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'ventas_detalle'
        AND column_name = 'lista_precio_codigo'
    ),
    'SELECT 1',
    "ALTER TABLE ventas_detalle ADD COLUMN lista_precio_codigo VARCHAR(20) NULL AFTER costo_unitario_pesos"
  )
);
PREPARE stmt_vd_lista_precio_codigo FROM @ddl_vd_lista_precio_codigo;
EXECUTE stmt_vd_lista_precio_codigo;
DEALLOCATE PREPARE stmt_vd_lista_precio_codigo;

SET @ddl_vd_oferta_precio_id = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'ventas_detalle'
        AND column_name = 'oferta_precio_id'
    ),
    'SELECT 1',
    "ALTER TABLE ventas_detalle ADD COLUMN oferta_precio_id BIGINT UNSIGNED NULL AFTER lista_precio_codigo"
  )
);
PREPARE stmt_vd_oferta_precio_id FROM @ddl_vd_oferta_precio_id;
EXECUTE stmt_vd_oferta_precio_id;
DEALLOCATE PREPARE stmt_vd_oferta_precio_id;

SET @ddl_vd_descuento_oferta = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'ventas_detalle'
        AND column_name = 'descuento_oferta'
    ),
    'SELECT 1',
    "ALTER TABLE ventas_detalle ADD COLUMN descuento_oferta DECIMAL(18,2) NOT NULL DEFAULT 0 AFTER oferta_precio_id"
  )
);
PREPARE stmt_vd_descuento_oferta FROM @ddl_vd_descuento_oferta;
EXECUTE stmt_vd_descuento_oferta;
DEALLOCATE PREPARE stmt_vd_descuento_oferta;

SET @ddl_vd_descuento_oferta_pct = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'ventas_detalle'
        AND column_name = 'descuento_oferta_pct'
    ),
    'SELECT 1',
    "ALTER TABLE ventas_detalle ADD COLUMN descuento_oferta_pct DECIMAL(7,2) NOT NULL DEFAULT 0 AFTER descuento_oferta"
  )
);
PREPARE stmt_vd_descuento_oferta_pct FROM @ddl_vd_descuento_oferta_pct;
EXECUTE stmt_vd_descuento_oferta_pct;
DEALLOCATE PREPARE stmt_vd_descuento_oferta_pct;

SET @idx_vd_oferta_precio = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'ventas_detalle'
        AND index_name = 'ix_vd_oferta_precio'
    ),
    'SELECT 1',
    'CREATE INDEX ix_vd_oferta_precio ON ventas_detalle(oferta_precio_id)'
  )
);
PREPARE stmt_idx_vd_oferta_precio FROM @idx_vd_oferta_precio;
EXECUTE stmt_idx_vd_oferta_precio;
DEALLOCATE PREPARE stmt_idx_vd_oferta_precio;

SET @fk_vd_oferta_precio = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = DATABASE()
        AND table_name = 'ventas_detalle'
        AND constraint_name = 'fk_vd_oferta_precio'
        AND constraint_type = 'FOREIGN KEY'
    ),
    'SELECT 1',
    'ALTER TABLE ventas_detalle ADD CONSTRAINT fk_vd_oferta_precio FOREIGN KEY (oferta_precio_id) REFERENCES ofertas_precios(id) ON DELETE SET NULL'
  )
);
PREPARE stmt_fk_vd_oferta_precio FROM @fk_vd_oferta_precio;
EXECUTE stmt_fk_vd_oferta_precio;
DEALLOCATE PREPARE stmt_fk_vd_oferta_precio;

INSERT INTO parametros_sistema(clave, valor_texto, descripcion)
VALUES ('comision_vendedores_modo', 'producto', 'Modo de comision: producto o lista')
ON DUPLICATE KEY UPDATE clave = clave;

INSERT INTO parametros_sistema(clave, valor_num, descripcion)
VALUES ('comision_lista_local_pct', 0, 'Comision porcentual para lista local')
ON DUPLICATE KEY UPDATE clave = clave;

INSERT INTO parametros_sistema(clave, valor_num, descripcion)
VALUES ('comision_lista_distribuidor_pct', 0, 'Comision porcentual para lista distribuidor')
ON DUPLICATE KEY UPDATE clave = clave;

INSERT INTO parametros_sistema(clave, valor_num, descripcion)
VALUES ('comision_lista_final_pct', 0, 'Comision porcentual para lista final')
ON DUPLICATE KEY UPDATE clave = clave;

INSERT INTO parametros_sistema(clave, valor_num, descripcion)
VALUES ('comision_lista_oferta_pct', 0, 'Comision porcentual para productos en oferta')
ON DUPLICATE KEY UPDATE clave = clave;
