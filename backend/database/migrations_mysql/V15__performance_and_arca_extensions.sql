SET @ddl_vad_margen_total = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'ventas_agregadas_diarias'
        AND column_name = 'margen_total'
    ),
    'SELECT 1',
    'ALTER TABLE ventas_agregadas_diarias ADD COLUMN margen_total DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER ticket_promedio'
  )
);
PREPARE stmt_vad_margen_total FROM @ddl_vad_margen_total;
EXECUTE stmt_vad_margen_total;
DEALLOCATE PREPARE stmt_vad_margen_total;

SET @ddl_arca_default_tipo = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'arca_config'
        AND column_name = 'default_tipo_comprobante'
    ),
    'SELECT 1',
    'ALTER TABLE arca_config ADD COLUMN default_tipo_comprobante VARCHAR(4) NULL'
  )
);
PREPARE stmt_arca_default_tipo FROM @ddl_arca_default_tipo;
EXECUTE stmt_arca_default_tipo;
DEALLOCATE PREPARE stmt_arca_default_tipo;

SET @ddl_arca_alicuotas = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'arca_config'
        AND column_name = 'alicuotas_iva_json'
    ),
    'SELECT 1',
    'ALTER TABLE arca_config ADD COLUMN alicuotas_iva_json TEXT NULL'
  )
);
PREPARE stmt_arca_alicuotas FROM @ddl_arca_alicuotas;
EXECUTE stmt_arca_alicuotas;
DEALLOCATE PREPARE stmt_arca_alicuotas;

SET @ddl_arca_cert_name = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'arca_config'
        AND column_name = 'certificado_nombre_archivo'
    ),
    'SELECT 1',
    'ALTER TABLE arca_config ADD COLUMN certificado_nombre_archivo VARCHAR(255) NULL'
  )
);
PREPARE stmt_arca_cert_name FROM @ddl_arca_cert_name;
EXECUTE stmt_arca_cert_name;
DEALLOCATE PREPARE stmt_arca_cert_name;

SET @ddl_arca_p12_subido = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'arca_config'
        AND column_name = 'p12_subido_en'
    ),
    'SELECT 1',
    'ALTER TABLE arca_config ADD COLUMN p12_subido_en DATETIME NULL'
  )
);
PREPARE stmt_arca_p12_subido FROM @ddl_arca_p12_subido;
EXECUTE stmt_arca_p12_subido;
DEALLOCATE PREPARE stmt_arca_p12_subido;

UPDATE arca_config
   SET default_tipo_comprobante = CASE
     WHEN default_tipo_comprobante IS NOT NULL AND default_tipo_comprobante <> '' THEN default_tipo_comprobante
     WHEN LOWER(COALESCE(condicion_iva, '')) LIKE '%mono%' THEN 'C'
     WHEN LOWER(COALESCE(condicion_iva, '')) LIKE '%exento%' THEN 'C'
     ELSE 'B'
   END,
       alicuotas_iva_json = COALESCE(NULLIF(alicuotas_iva_json, ''), '[0,10.5,21,27]');
