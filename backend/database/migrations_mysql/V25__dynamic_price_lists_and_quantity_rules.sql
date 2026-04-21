CREATE TABLE IF NOT EXISTS listas_precio (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legacy_code VARCHAR(20) NULL,
  slug VARCHAR(60) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion VARCHAR(255) NULL,
  margen_ratio DECIMAL(10,4) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  orden_visual INT NOT NULL DEFAULT 0,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_listas_precio_slug (slug),
  UNIQUE KEY uq_listas_precio_legacy_code (legacy_code),
  KEY ix_listas_precio_activo_orden (activo, orden_visual)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS productos_precios (
  producto_id BIGINT UNSIGNED NOT NULL,
  lista_precio_id BIGINT UNSIGNED NOT NULL,
  precio DECIMAL(18,2) NOT NULL DEFAULT 0,
  modo VARCHAR(20) NOT NULL DEFAULT 'auto',
  margen_override_ratio DECIMAL(10,4) NULL,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (producto_id, lista_precio_id),
  KEY ix_productos_precios_lista (lista_precio_id),
  CONSTRAINT fk_productos_precios_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_productos_precios_lista FOREIGN KEY (lista_precio_id) REFERENCES listas_precio(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reglas_precio_cantidad (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lista_precio_id BIGINT UNSIGNED NOT NULL,
  cantidad_desde INT NOT NULL DEFAULT 1,
  cantidad_hasta INT NULL,
  modo VARCHAR(30) NOT NULL DEFAULT 'lista',
  lista_precio_alternativa_id BIGINT UNSIGNED NULL,
  descuento_pct DECIMAL(10,4) NULL,
  precio_fijo DECIMAL(18,2) NULL,
  prioridad INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_reglas_precio_cantidad_lista (lista_precio_id, activo, cantidad_desde, cantidad_hasta),
  KEY ix_reglas_precio_cantidad_alt (lista_precio_alternativa_id),
  CONSTRAINT fk_reglas_precio_cantidad_lista FOREIGN KEY (lista_precio_id) REFERENCES listas_precio(id) ON DELETE CASCADE,
  CONSTRAINT fk_reglas_precio_cantidad_alt FOREIGN KEY (lista_precio_alternativa_id) REFERENCES listas_precio(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS productos_precios_historial (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id BIGINT UNSIGNED NOT NULL,
  lista_precio_id BIGINT UNSIGNED NOT NULL,
  precio DECIMAL(18,2) NOT NULL DEFAULT 0,
  modo VARCHAR(20) NOT NULL DEFAULT 'auto',
  margen_override_ratio DECIMAL(10,4) NULL,
  motivo VARCHAR(60) NULL,
  usuario_id BIGINT UNSIGNED NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_productos_precios_historial_producto (producto_id, creado_en),
  KEY ix_productos_precios_historial_lista (lista_precio_id),
  CONSTRAINT fk_productos_precios_historial_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_productos_precios_historial_lista FOREIGN KEY (lista_precio_id) REFERENCES listas_precio(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @ddl_ventas_price_list_type_expand = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas'
         AND column_name = 'price_list_type'
    ),
    'ALTER TABLE ventas MODIFY COLUMN price_list_type VARCHAR(60) NOT NULL DEFAULT ''local''',
    'SELECT 1'
  )
);
PREPARE stmt_ventas_price_list_type_expand FROM @ddl_ventas_price_list_type_expand;
EXECUTE stmt_ventas_price_list_type_expand;
DEALLOCATE PREPARE stmt_ventas_price_list_type_expand;

SET @ddl_ventas_price_list_id = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas'
         AND column_name = 'price_list_id'
    ),
    'SELECT 1',
    'ALTER TABLE ventas ADD COLUMN price_list_id BIGINT UNSIGNED NULL AFTER price_list_type'
  )
);
PREPARE stmt_ventas_price_list_id FROM @ddl_ventas_price_list_id;
EXECUTE stmt_ventas_price_list_id;
DEALLOCATE PREPARE stmt_ventas_price_list_id;

SET @idx_ventas_price_list_id = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas'
         AND index_name = 'ix_ventas_price_list_id'
    ),
    'SELECT 1',
    'CREATE INDEX ix_ventas_price_list_id ON ventas(price_list_id)'
  )
);
PREPARE stmt_idx_ventas_price_list_id FROM @idx_ventas_price_list_id;
EXECUTE stmt_idx_ventas_price_list_id;
DEALLOCATE PREPARE stmt_idx_ventas_price_list_id;

SET @fk_ventas_price_list_id = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.table_constraints
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas'
         AND constraint_name = 'fk_ventas_price_list_id'
         AND constraint_type = 'FOREIGN KEY'
    ),
    'SELECT 1',
    'ALTER TABLE ventas ADD CONSTRAINT fk_ventas_price_list_id FOREIGN KEY (price_list_id) REFERENCES listas_precio(id) ON DELETE SET NULL'
  )
);
PREPARE stmt_fk_ventas_price_list_id FROM @fk_ventas_price_list_id;
EXECUTE stmt_fk_ventas_price_list_id;
DEALLOCATE PREPARE stmt_fk_ventas_price_list_id;

SET @ddl_vd_lista_precio_codigo_expand = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas_detalle'
         AND column_name = 'lista_precio_codigo'
    ),
    'ALTER TABLE ventas_detalle MODIFY COLUMN lista_precio_codigo VARCHAR(60) NULL',
    'SELECT 1'
  )
);
PREPARE stmt_vd_lista_precio_codigo_expand FROM @ddl_vd_lista_precio_codigo_expand;
EXECUTE stmt_vd_lista_precio_codigo_expand;
DEALLOCATE PREPARE stmt_vd_lista_precio_codigo_expand;

SET @ddl_vd_lista_precio_id = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas_detalle'
         AND column_name = 'lista_precio_id'
    ),
    'SELECT 1',
    'ALTER TABLE ventas_detalle ADD COLUMN lista_precio_id BIGINT UNSIGNED NULL AFTER lista_precio_codigo'
  )
);
PREPARE stmt_vd_lista_precio_id FROM @ddl_vd_lista_precio_id;
EXECUTE stmt_vd_lista_precio_id;
DEALLOCATE PREPARE stmt_vd_lista_precio_id;

SET @ddl_vd_regla_precio_cantidad_id = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas_detalle'
         AND column_name = 'regla_precio_cantidad_id'
    ),
    'SELECT 1',
    'ALTER TABLE ventas_detalle ADD COLUMN regla_precio_cantidad_id BIGINT UNSIGNED NULL AFTER oferta_precio_id'
  )
);
PREPARE stmt_vd_regla_precio_cantidad_id FROM @ddl_vd_regla_precio_cantidad_id;
EXECUTE stmt_vd_regla_precio_cantidad_id;
DEALLOCATE PREPARE stmt_vd_regla_precio_cantidad_id;

SET @idx_vd_lista_precio_id = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas_detalle'
         AND index_name = 'ix_vd_lista_precio_id'
    ),
    'SELECT 1',
    'CREATE INDEX ix_vd_lista_precio_id ON ventas_detalle(lista_precio_id)'
  )
);
PREPARE stmt_idx_vd_lista_precio_id FROM @idx_vd_lista_precio_id;
EXECUTE stmt_idx_vd_lista_precio_id;
DEALLOCATE PREPARE stmt_idx_vd_lista_precio_id;

SET @idx_vd_regla_precio_cantidad_id = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas_detalle'
         AND index_name = 'ix_vd_regla_precio_cantidad_id'
    ),
    'SELECT 1',
    'CREATE INDEX ix_vd_regla_precio_cantidad_id ON ventas_detalle(regla_precio_cantidad_id)'
  )
);
PREPARE stmt_idx_vd_regla_precio_cantidad_id FROM @idx_vd_regla_precio_cantidad_id;
EXECUTE stmt_idx_vd_regla_precio_cantidad_id;
DEALLOCATE PREPARE stmt_idx_vd_regla_precio_cantidad_id;

SET @fk_vd_lista_precio_id = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.table_constraints
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas_detalle'
         AND constraint_name = 'fk_vd_lista_precio_id'
         AND constraint_type = 'FOREIGN KEY'
    ),
    'SELECT 1',
    'ALTER TABLE ventas_detalle ADD CONSTRAINT fk_vd_lista_precio_id FOREIGN KEY (lista_precio_id) REFERENCES listas_precio(id) ON DELETE SET NULL'
  )
);
PREPARE stmt_fk_vd_lista_precio_id FROM @fk_vd_lista_precio_id;
EXECUTE stmt_fk_vd_lista_precio_id;
DEALLOCATE PREPARE stmt_fk_vd_lista_precio_id;

SET @fk_vd_regla_precio_cantidad_id = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.table_constraints
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas_detalle'
         AND constraint_name = 'fk_vd_regla_precio_cantidad_id'
         AND constraint_type = 'FOREIGN KEY'
    ),
    'SELECT 1',
    'ALTER TABLE ventas_detalle ADD CONSTRAINT fk_vd_regla_precio_cantidad_id FOREIGN KEY (regla_precio_cantidad_id) REFERENCES reglas_precio_cantidad(id) ON DELETE SET NULL'
  )
);
PREPARE stmt_fk_vd_regla_precio_cantidad_id FROM @fk_vd_regla_precio_cantidad_id;
EXECUTE stmt_fk_vd_regla_precio_cantidad_id;
DEALLOCATE PREPARE stmt_fk_vd_regla_precio_cantidad_id;

SET @ddl_ofertas_lista_precio_objetivo_expand = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ofertas_precios'
         AND column_name = 'lista_precio_objetivo'
    ),
    'ALTER TABLE ofertas_precios MODIFY COLUMN lista_precio_objetivo VARCHAR(60) NOT NULL DEFAULT ''todas''',
    'SELECT 1'
  )
);
PREPARE stmt_ofertas_lista_precio_objetivo_expand FROM @ddl_ofertas_lista_precio_objetivo_expand;
EXECUTE stmt_ofertas_lista_precio_objetivo_expand;
DEALLOCATE PREPARE stmt_ofertas_lista_precio_objetivo_expand;

SET @ddl_ofertas_lista_precio_id = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ofertas_precios'
         AND column_name = 'lista_precio_id'
    ),
    'SELECT 1',
    'ALTER TABLE ofertas_precios ADD COLUMN lista_precio_id BIGINT UNSIGNED NULL AFTER lista_precio_objetivo'
  )
);
PREPARE stmt_ofertas_lista_precio_id FROM @ddl_ofertas_lista_precio_id;
EXECUTE stmt_ofertas_lista_precio_id;
DEALLOCATE PREPARE stmt_ofertas_lista_precio_id;

SET @idx_ofertas_lista_precio_id = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'ofertas_precios'
         AND index_name = 'ix_ofertas_lista_precio_id'
    ),
    'SELECT 1',
    'CREATE INDEX ix_ofertas_lista_precio_id ON ofertas_precios(lista_precio_id)'
  )
);
PREPARE stmt_idx_ofertas_lista_precio_id FROM @idx_ofertas_lista_precio_id;
EXECUTE stmt_idx_ofertas_lista_precio_id;
DEALLOCATE PREPARE stmt_idx_ofertas_lista_precio_id;

SET @fk_ofertas_lista_precio_id = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.table_constraints
       WHERE table_schema = DATABASE()
         AND table_name = 'ofertas_precios'
         AND constraint_name = 'fk_ofertas_lista_precio_id'
         AND constraint_type = 'FOREIGN KEY'
    ),
    'SELECT 1',
    'ALTER TABLE ofertas_precios ADD CONSTRAINT fk_ofertas_lista_precio_id FOREIGN KEY (lista_precio_id) REFERENCES listas_precio(id) ON DELETE SET NULL'
  )
);
PREPARE stmt_fk_ofertas_lista_precio_id FROM @fk_ofertas_lista_precio_id;
EXECUTE stmt_fk_ofertas_lista_precio_id;
DEALLOCATE PREPARE stmt_fk_ofertas_lista_precio_id;

INSERT INTO listas_precio(legacy_code, slug, nombre, descripcion, margen_ratio, activo, orden_visual)
SELECT
  'local',
  'local',
  COALESCE(
    (SELECT valor_texto FROM parametros_sistema WHERE clave = 'price_label_local' LIMIT 1),
    'Precio Local'
  ),
  'Lista legacy local / mostrador',
  0.1500,
  COALESCE(
    (SELECT CASE WHEN valor_num = 0 THEN 0 ELSE 1 END FROM parametros_sistema WHERE clave = 'price_enabled_local' LIMIT 1),
    1
  ),
  10
WHERE NOT EXISTS (
  SELECT 1 FROM listas_precio WHERE legacy_code = 'local'
);

INSERT INTO listas_precio(legacy_code, slug, nombre, descripcion, margen_ratio, activo, orden_visual)
SELECT
  'distribuidor',
  'distribuidor',
  COALESCE(
    (SELECT valor_texto FROM parametros_sistema WHERE clave = 'price_label_distribuidor' LIMIT 1),
    'Precio Distribuidor'
  ),
  'Lista legacy distribuidor / mayorista',
  0.4500,
  COALESCE(
    (SELECT CASE WHEN valor_num = 0 THEN 0 ELSE 1 END FROM parametros_sistema WHERE clave = 'price_enabled_distribuidor' LIMIT 1),
    1
  ),
  20
WHERE NOT EXISTS (
  SELECT 1 FROM listas_precio WHERE legacy_code = 'distribuidor'
);

INSERT INTO listas_precio(legacy_code, slug, nombre, descripcion, margen_ratio, activo, orden_visual)
SELECT
  'final',
  'final',
  COALESCE(
    (SELECT valor_texto FROM parametros_sistema WHERE clave = 'price_label_final' LIMIT 1),
    'Precio Final'
  ),
  'Lista legacy final / publico',
  0.1500,
  1,
  30
WHERE NOT EXISTS (
  SELECT 1 FROM listas_precio WHERE legacy_code = 'final'
);

INSERT INTO productos_precios(producto_id, lista_precio_id, precio, modo, margen_override_ratio)
SELECT
  p.id,
  l.id,
  COALESCE(p.precio_local, 0),
  COALESCE(NULLIF(p.precio_modo, ''), 'auto'),
  p.margen_local
FROM productos p
JOIN listas_precio l ON l.legacy_code = 'local'
ON DUPLICATE KEY UPDATE
  precio = VALUES(precio),
  modo = VALUES(modo),
  margen_override_ratio = VALUES(margen_override_ratio),
  actualizado_en = CURRENT_TIMESTAMP;

INSERT INTO productos_precios(producto_id, lista_precio_id, precio, modo, margen_override_ratio)
SELECT
  p.id,
  l.id,
  COALESCE(p.precio_distribuidor, 0),
  COALESCE(NULLIF(p.precio_modo, ''), 'auto'),
  p.margen_distribuidor
FROM productos p
JOIN listas_precio l ON l.legacy_code = 'distribuidor'
ON DUPLICATE KEY UPDATE
  precio = VALUES(precio),
  modo = VALUES(modo),
  margen_override_ratio = VALUES(margen_override_ratio),
  actualizado_en = CURRENT_TIMESTAMP;

INSERT INTO productos_precios(producto_id, lista_precio_id, precio, modo, margen_override_ratio)
SELECT
  p.id,
  l.id,
  CASE
    WHEN COALESCE(p.precio_final, 0) > 0 THEN p.precio_final
    ELSE COALESCE(NULLIF(p.precio_venta, 0), NULLIF(p.precio_local, 0), NULLIF(p.precio_distribuidor, 0), 0)
  END,
  CASE
    WHEN COALESCE(p.precio_final, 0) > 0 THEN 'manual'
    ELSE 'auto'
  END,
  COALESCE(NULLIF(p.margen_local, 0), l.margen_ratio)
FROM productos p
JOIN listas_precio l ON l.legacy_code = 'final'
ON DUPLICATE KEY UPDATE
  precio = VALUES(precio),
  modo = VALUES(modo),
  margen_override_ratio = VALUES(margen_override_ratio),
  actualizado_en = CURRENT_TIMESTAMP;

UPDATE ventas v
JOIN listas_precio l
  ON l.slug = v.price_list_type
   OR l.legacy_code = v.price_list_type
SET v.price_list_id = l.id
WHERE v.price_list_id IS NULL
  AND v.price_list_type IS NOT NULL
  AND v.price_list_type <> '';

UPDATE ventas_detalle d
JOIN listas_precio l
  ON l.slug = d.lista_precio_codigo
   OR l.legacy_code = d.lista_precio_codigo
SET d.lista_precio_id = l.id
WHERE d.lista_precio_id IS NULL
  AND d.lista_precio_codigo IS NOT NULL
  AND d.lista_precio_codigo <> ''
  AND d.lista_precio_codigo <> 'oferta';

UPDATE ofertas_precios o
JOIN listas_precio l
  ON l.slug = o.lista_precio_objetivo
   OR l.legacy_code = o.lista_precio_objetivo
SET o.lista_precio_id = l.id
WHERE o.lista_precio_id IS NULL
  AND o.lista_precio_objetivo IS NOT NULL
  AND o.lista_precio_objetivo <> ''
  AND o.lista_precio_objetivo <> 'todas';
