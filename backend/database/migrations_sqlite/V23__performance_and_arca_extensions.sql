BEGIN;

ALTER TABLE ventas_agregadas_diarias ADD COLUMN margen_total REAL NOT NULL DEFAULT 0;

ALTER TABLE arca_config ADD COLUMN default_tipo_comprobante TEXT;
ALTER TABLE arca_config ADD COLUMN alicuotas_iva_json TEXT;
ALTER TABLE arca_config ADD COLUMN certificado_nombre_archivo TEXT;
ALTER TABLE arca_config ADD COLUMN p12_subido_en TEXT;

UPDATE arca_config
   SET default_tipo_comprobante = COALESCE(
         NULLIF(default_tipo_comprobante, ''),
         CASE
           WHEN LOWER(COALESCE(condicion_iva, '')) LIKE '%mono%' THEN 'C'
           WHEN LOWER(COALESCE(condicion_iva, '')) LIKE '%exento%' THEN 'C'
           ELSE 'B'
         END
       ),
       alicuotas_iva_json = COALESCE(NULLIF(alicuotas_iva_json, ''), '[0,10.5,21,27]');

COMMIT;
