SET @ddl_ofertas_packaging_image = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'ofertas_precios'
        AND column_name = 'packaging_image_url'
    ),
    'SELECT 1',
    'ALTER TABLE ofertas_precios ADD COLUMN packaging_image_url TEXT NULL AFTER descripcion'
  )
);
PREPARE stmt_ofertas_packaging_image FROM @ddl_ofertas_packaging_image;
EXECUTE stmt_ofertas_packaging_image;
DEALLOCATE PREPARE stmt_ofertas_packaging_image;

SET @ddl_clientes_tel_e164 = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'clientes'
        AND column_name = 'telefono_e164'
    ),
    'SELECT 1',
    'ALTER TABLE clientes ADD COLUMN telefono_e164 VARCHAR(20) NULL AFTER telefono'
  )
);
PREPARE stmt_clientes_tel_e164 FROM @ddl_clientes_tel_e164;
EXECUTE stmt_clientes_tel_e164;
DEALLOCATE PREPARE stmt_clientes_tel_e164;

SET @ddl_clientes_opt_in = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'clientes'
        AND column_name = 'whatsapp_opt_in'
    ),
    'SELECT 1',
    'ALTER TABLE clientes ADD COLUMN whatsapp_opt_in TINYINT(1) NOT NULL DEFAULT 0 AFTER telefono_e164'
  )
);
PREPARE stmt_clientes_opt_in FROM @ddl_clientes_opt_in;
EXECUTE stmt_clientes_opt_in;
DEALLOCATE PREPARE stmt_clientes_opt_in;

SET @ddl_clientes_opt_in_at = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'clientes'
        AND column_name = 'whatsapp_opt_in_at'
    ),
    'SELECT 1',
    'ALTER TABLE clientes ADD COLUMN whatsapp_opt_in_at DATETIME NULL AFTER whatsapp_opt_in'
  )
);
PREPARE stmt_clientes_opt_in_at FROM @ddl_clientes_opt_in_at;
EXECUTE stmt_clientes_opt_in_at;
DEALLOCATE PREPARE stmt_clientes_opt_in_at;

SET @ddl_clientes_status = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'clientes'
        AND column_name = 'whatsapp_status'
    ),
    'SELECT 1',
    'ALTER TABLE clientes ADD COLUMN whatsapp_status VARCHAR(24) NOT NULL DEFAULT ''unknown'' AFTER whatsapp_opt_in_at'
  )
);
PREPARE stmt_clientes_status FROM @ddl_clientes_status;
EXECUTE stmt_clientes_status;
DEALLOCATE PREPARE stmt_clientes_status;

SET @ddl_clientes_last_error = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'clientes'
        AND column_name = 'whatsapp_last_error'
    ),
    'SELECT 1',
    'ALTER TABLE clientes ADD COLUMN whatsapp_last_error TEXT NULL AFTER whatsapp_status'
  )
);
PREPARE stmt_clientes_last_error FROM @ddl_clientes_last_error;
EXECUTE stmt_clientes_last_error;
DEALLOCATE PREPARE stmt_clientes_last_error;

SET @idx_clientes_telefono_e164 = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'clientes'
        AND index_name = 'ix_clientes_telefono_e164'
    ),
    'SELECT 1',
    'CREATE INDEX ix_clientes_telefono_e164 ON clientes(telefono_e164)'
  )
);
PREPARE stmt_idx_clientes_telefono_e164 FROM @idx_clientes_telefono_e164;
EXECUTE stmt_idx_clientes_telefono_e164;
DEALLOCATE PREPARE stmt_idx_clientes_telefono_e164;

SET @idx_clientes_whatsapp_status = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'clientes'
        AND index_name = 'ix_clientes_whatsapp_status'
    ),
    'SELECT 1',
    'CREATE INDEX ix_clientes_whatsapp_status ON clientes(whatsapp_status)'
  )
);
PREPARE stmt_idx_clientes_whatsapp_status FROM @idx_clientes_whatsapp_status;
EXECUTE stmt_idx_clientes_whatsapp_status;
DEALLOCATE PREPARE stmt_idx_clientes_whatsapp_status;

UPDATE clientes
   SET telefono_e164 = CASE
     WHEN telefono_e164 IS NOT NULL AND TRIM(telefono_e164) <> '' THEN TRIM(telefono_e164)
     WHEN telefono IS NULL OR TRIM(telefono) = '' THEN NULL
     WHEN TRIM(telefono) REGEXP '^[+][0-9]{8,15}$' THEN TRIM(telefono)
     WHEN TRIM(telefono) REGEXP '^[0-9]{8,15}$' THEN CONCAT('+', TRIM(telefono))
     ELSE telefono_e164
   END
 WHERE telefono IS NOT NULL
   AND TRIM(telefono) <> '';

UPDATE clientes
   SET whatsapp_status = CASE
     WHEN telefono_e164 IS NULL OR TRIM(telefono_e164) = '' THEN 'unknown'
     ELSE 'pending_validation'
   END
 WHERE whatsapp_status IS NULL
    OR TRIM(whatsapp_status) = ''
    OR whatsapp_status = 'unknown';

CREATE TABLE IF NOT EXISTS catalog_pdf_exports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  modo VARCHAR(20) NOT NULL DEFAULT 'precios',
  price_type VARCHAR(20) NULL,
  file_name VARCHAR(255) NULL,
  file_url TEXT NULL,
  file_size_bytes BIGINT UNSIGNED NULL,
  checksum_sha256 VARCHAR(128) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'generated',
  metadata_json JSON NULL,
  created_by BIGINT UNSIGNED NULL,
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_catalog_pdf_exports_generated (generated_at),
  KEY ix_catalog_pdf_exports_status (status),
  CONSTRAINT fk_catalog_pdf_exports_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(160) NOT NULL,
  descripcion TEXT NULL,
  canal VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  estado VARCHAR(20) NOT NULL DEFAULT 'draft',
  pdf_export_id BIGINT UNSIGNED NULL,
  pdf_url TEXT NULL,
  plantilla_codigo VARCHAR(100) NULL,
  mensaje_texto TEXT NULL,
  metadata_json JSON NULL,
  created_by BIGINT UNSIGNED NULL,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_whatsapp_campaigns_estado (estado),
  KEY ix_whatsapp_campaigns_created (created_at),
  CONSTRAINT fk_whatsapp_campaigns_pdf_export FOREIGN KEY (pdf_export_id) REFERENCES catalog_pdf_exports(id) ON DELETE SET NULL,
  CONSTRAINT fk_whatsapp_campaigns_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_campaign_recipients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NOT NULL,
  cliente_id BIGINT UNSIGNED NULL,
  destino_input VARCHAR(120) NULL,
  destino_e164 VARCHAR(20) NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pending',
  provider_message_sid VARCHAR(120) NULL,
  sent_at DATETIME NULL,
  error_message TEXT NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_wcr_campaign_estado (campaign_id, estado),
  KEY ix_wcr_destino_e164 (destino_e164),
  KEY ix_wcr_cliente (cliente_id),
  CONSTRAINT fk_wcr_campaign FOREIGN KEY (campaign_id) REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_wcr_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_delivery_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_recipient_id BIGINT UNSIGNED NOT NULL,
  provider_event_id VARCHAR(160) NULL,
  provider_status VARCHAR(60) NULL,
  payload_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_wde_recipient_created (campaign_recipient_id, created_at),
  CONSTRAINT fk_wde_recipient FOREIGN KEY (campaign_recipient_id) REFERENCES whatsapp_campaign_recipients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
