BEGIN;

ALTER TABLE ofertas_precios ADD COLUMN packaging_image_url TEXT;

ALTER TABLE clientes ADD COLUMN telefono_e164 TEXT;
ALTER TABLE clientes ADD COLUMN whatsapp_opt_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clientes ADD COLUMN whatsapp_opt_in_at TEXT;
ALTER TABLE clientes ADD COLUMN whatsapp_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE clientes ADD COLUMN whatsapp_last_error TEXT;

CREATE INDEX IF NOT EXISTS ix_clientes_telefono_e164 ON clientes(telefono_e164);
CREATE INDEX IF NOT EXISTS ix_clientes_whatsapp_status ON clientes(whatsapp_status);

UPDATE clientes
   SET telefono_e164 = CASE
     WHEN telefono_e164 IS NOT NULL AND TRIM(telefono_e164) <> '' THEN TRIM(telefono_e164)
     WHEN telefono IS NULL OR TRIM(telefono) = '' THEN NULL
     WHEN TRIM(telefono) LIKE '+%' THEN TRIM(telefono)
     ELSE NULL
   END;

UPDATE clientes
   SET whatsapp_status = CASE
     WHEN telefono_e164 IS NULL OR TRIM(telefono_e164) = '' THEN 'unknown'
     ELSE 'pending_validation'
   END
 WHERE whatsapp_status IS NULL
    OR TRIM(whatsapp_status) = ''
    OR whatsapp_status = 'unknown';

CREATE TABLE IF NOT EXISTS catalog_pdf_exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modo TEXT NOT NULL DEFAULT 'precios',
  price_type TEXT,
  file_name TEXT,
  file_url TEXT,
  file_size_bytes INTEGER,
  checksum_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'generated',
  metadata_json TEXT,
  created_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_catalog_pdf_exports_generated ON catalog_pdf_exports(generated_at);
CREATE INDEX IF NOT EXISTS ix_catalog_pdf_exports_status ON catalog_pdf_exports(status);

CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  canal TEXT NOT NULL DEFAULT 'whatsapp',
  estado TEXT NOT NULL DEFAULT 'draft',
  pdf_export_id INTEGER REFERENCES catalog_pdf_exports(id) ON DELETE SET NULL,
  pdf_url TEXT,
  plantilla_codigo TEXT,
  mensaje_texto TEXT,
  metadata_json TEXT,
  created_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_whatsapp_campaigns_estado ON whatsapp_campaigns(estado);
CREATE INDEX IF NOT EXISTS ix_whatsapp_campaigns_created ON whatsapp_campaigns(created_at);

CREATE TABLE IF NOT EXISTS whatsapp_campaign_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  destino_input TEXT,
  destino_e164 TEXT,
  estado TEXT NOT NULL DEFAULT 'pending',
  provider_message_sid TEXT,
  sent_at TEXT,
  error_message TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_wcr_campaign_estado ON whatsapp_campaign_recipients(campaign_id, estado);
CREATE INDEX IF NOT EXISTS ix_wcr_destino_e164 ON whatsapp_campaign_recipients(destino_e164);
CREATE INDEX IF NOT EXISTS ix_wcr_cliente ON whatsapp_campaign_recipients(cliente_id);

CREATE TABLE IF NOT EXISTS whatsapp_delivery_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_recipient_id INTEGER NOT NULL REFERENCES whatsapp_campaign_recipients(id) ON DELETE CASCADE,
  provider_event_id TEXT,
  provider_status TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_wde_recipient_created ON whatsapp_delivery_events(campaign_recipient_id, created_at);

COMMIT;
