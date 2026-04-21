CREATE TABLE IF NOT EXISTS comision_listas_config (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope_tipo VARCHAR(20) NOT NULL DEFAULT 'global',
  scope_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  lista_codigo VARCHAR(60) NOT NULL,
  lista_nombre VARCHAR(120) NOT NULL,
  porcentaje DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_comision_listas_scope_codigo (scope_tipo, scope_id, lista_codigo),
  KEY ix_comision_listas_scope (scope_tipo, scope_id),
  KEY ix_comision_listas_codigo (lista_codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @ddl_vendedores_config_comision_tipo = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'vendedores_config'
         AND column_name = 'comision_tipo'
    ),
    'ALTER TABLE vendedores_config MODIFY COLUMN comision_tipo VARCHAR(30) NOT NULL DEFAULT ''por_producto''',
    'SELECT 1'
  )
);
PREPARE stmt_vendedores_config_comision_tipo FROM @ddl_vendedores_config_comision_tipo;
EXECUTE stmt_vendedores_config_comision_tipo;
DEALLOCATE PREPARE stmt_vendedores_config_comision_tipo;

UPDATE vendedores_config
   SET comision_tipo = 'por_lista'
 WHERE comision_tipo = 'mixto';

SET @ddl_vd_comision_tipo_calculo = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas_detalle'
         AND column_name = 'comision_tipo_calculo'
    ),
    'SELECT 1',
    'ALTER TABLE ventas_detalle ADD COLUMN comision_tipo_calculo VARCHAR(20) NULL AFTER comision_monto'
  )
);
PREPARE stmt_vd_comision_tipo_calculo FROM @ddl_vd_comision_tipo_calculo;
EXECUTE stmt_vd_comision_tipo_calculo;
DEALLOCATE PREPARE stmt_vd_comision_tipo_calculo;

SET @idx_vd_lista_precio_codigo = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'ventas_detalle'
         AND index_name = 'idx_vd_lista_precio_codigo'
    ),
    'SELECT 1',
    'CREATE INDEX idx_vd_lista_precio_codigo ON ventas_detalle(lista_precio_codigo)'
  )
);
PREPARE stmt_idx_vd_lista_precio_codigo FROM @idx_vd_lista_precio_codigo;
EXECUTE stmt_idx_vd_lista_precio_codigo;
DEALLOCATE PREPARE stmt_idx_vd_lista_precio_codigo;

INSERT INTO comision_listas_config (
  scope_tipo,
  scope_id,
  lista_codigo,
  lista_nombre,
  porcentaje,
  activo
)
SELECT
  'global',
  0,
  COALESCE(NULLIF(l.legacy_code, ''), l.slug),
  l.nombre,
  CASE COALESCE(NULLIF(l.legacy_code, ''), l.slug)
    WHEN 'local' THEN COALESCE((SELECT valor_num FROM parametros_sistema WHERE clave = 'comision_lista_local_pct' LIMIT 1), 0)
    WHEN 'distribuidor' THEN COALESCE((SELECT valor_num FROM parametros_sistema WHERE clave = 'comision_lista_distribuidor_pct' LIMIT 1), 0)
    WHEN 'final' THEN COALESCE((SELECT valor_num FROM parametros_sistema WHERE clave = 'comision_lista_final_pct' LIMIT 1), 0)
    ELSE 0
  END,
  COALESCE(l.activo, 1)
FROM listas_precio l
ON DUPLICATE KEY UPDATE
  lista_nombre = VALUES(lista_nombre),
  porcentaje = VALUES(porcentaje),
  activo = VALUES(activo),
  actualizado_en = CURRENT_TIMESTAMP;

INSERT INTO comision_listas_config (
  scope_tipo,
  scope_id,
  lista_codigo,
  lista_nombre,
  porcentaje,
  activo
)
VALUES (
  'global',
  0,
  'oferta',
  'Lista Oferta',
  COALESCE((SELECT valor_num FROM parametros_sistema WHERE clave = 'comision_lista_oferta_pct' LIMIT 1), 0),
  1
)
ON DUPLICATE KEY UPDATE
  lista_nombre = VALUES(lista_nombre),
  porcentaje = VALUES(porcentaje),
  activo = VALUES(activo),
  actualizado_en = CURRENT_TIMESTAMP;

UPDATE ventas_detalle d
JOIN ventas v ON v.id = d.venta_id
LEFT JOIN listas_precio ld ON ld.id = d.lista_precio_id
LEFT JOIN listas_precio lv ON lv.id = v.price_list_id
SET d.lista_precio_codigo = COALESCE(
  NULLIF(d.lista_precio_codigo, ''),
  NULLIF(ld.legacy_code, ''),
  NULLIF(ld.slug, ''),
  NULLIF(lv.legacy_code, ''),
  NULLIF(lv.slug, ''),
  NULLIF(v.price_list_type, '')
)
WHERE d.lista_precio_codigo IS NULL
   OR d.lista_precio_codigo = '';

UPDATE ventas_detalle d
JOIN ventas v ON v.id = d.venta_id
LEFT JOIN listas_precio l
  ON l.slug = d.lista_precio_codigo
 OR l.legacy_code = d.lista_precio_codigo
SET d.lista_precio_id = COALESCE(d.lista_precio_id, l.id, v.price_list_id)
WHERE d.lista_precio_id IS NULL;
