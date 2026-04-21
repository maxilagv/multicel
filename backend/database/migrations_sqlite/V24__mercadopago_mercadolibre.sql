BEGIN;

CREATE TABLE IF NOT EXISTS integraciones_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proveedor TEXT NOT NULL UNIQUE,
  estado TEXT NOT NULL DEFAULT 'desconectado',
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  token_type TEXT,
  scope TEXT,
  external_user_id TEXT,
  external_user_name TEXT,
  token_expires_at TEXT,
  refresh_token_expires_at TEXT,
  webhook_secret_enc TEXT,
  metadata_json TEXT,
  ultimo_sync_en TEXT,
  ultimo_error TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_integraciones_config_estado ON integraciones_config(estado);
CREATE INDEX IF NOT EXISTS ix_integraciones_config_activo ON integraciones_config(activo);
CREATE INDEX IF NOT EXISTS ix_integraciones_config_expira ON integraciones_config(token_expires_at);

CREATE TABLE IF NOT EXISTS mp_payment_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL,
  integracion_config_id INTEGER,
  mp_preference_id TEXT NOT NULL UNIQUE,
  mp_payment_id TEXT UNIQUE,
  external_reference TEXT,
  init_point TEXT NOT NULL,
  sandbox_init_point TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  payment_status_detail TEXT,
  local_pago_id INTEGER UNIQUE,
  expires_at TEXT,
  last_seen_at TEXT,
  payload_json TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
  FOREIGN KEY (integracion_config_id) REFERENCES integraciones_config(id) ON DELETE SET NULL,
  FOREIGN KEY (local_pago_id) REFERENCES pagos(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_payment_links_venta ON mp_payment_links(venta_id);
CREATE INDEX IF NOT EXISTS ix_mp_payment_links_estado ON mp_payment_links(estado);
CREATE INDEX IF NOT EXISTS ix_mp_payment_links_last_seen ON mp_payment_links(last_seen_at);

CREATE TABLE IF NOT EXISTS ml_product_sync (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL,
  integracion_config_id INTEGER,
  ml_item_id TEXT NOT NULL UNIQUE,
  ml_permalink TEXT,
  estado_publicacion TEXT NOT NULL DEFAULT 'active',
  precio_publicado REAL,
  stock_publicado INTEGER,
  ultimo_sync_en TEXT,
  ultimo_error TEXT,
  payload_json TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  FOREIGN KEY (integracion_config_id) REFERENCES integraciones_config(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ml_product_sync_producto ON ml_product_sync(producto_id);
CREATE INDEX IF NOT EXISTS ix_ml_product_sync_estado ON ml_product_sync(estado_publicacion);
CREATE INDEX IF NOT EXISTS ix_ml_product_sync_sync ON ml_product_sync(ultimo_sync_en);

CREATE TABLE IF NOT EXISTS ml_orders_import (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ml_order_id TEXT NOT NULL UNIQUE,
  integracion_config_id INTEGER,
  venta_id INTEGER UNIQUE,
  ml_buyer_id TEXT,
  ml_shipping_id TEXT,
  ml_pack_id TEXT,
  estado_orden TEXT,
  estado_importacion TEXT NOT NULL DEFAULT 'pendiente',
  total_order REAL,
  fecha_orden TEXT,
  importado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_error TEXT,
  payload_json TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (integracion_config_id) REFERENCES integraciones_config(id) ON DELETE SET NULL,
  FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_ml_orders_import_buyer ON ml_orders_import(ml_buyer_id);
CREATE INDEX IF NOT EXISTS ix_ml_orders_import_pack ON ml_orders_import(ml_pack_id);
CREATE INDEX IF NOT EXISTS ix_ml_orders_import_estado_orden ON ml_orders_import(estado_orden);
CREATE INDEX IF NOT EXISTS ix_ml_orders_import_estado_importacion ON ml_orders_import(estado_importacion);
CREATE INDEX IF NOT EXISTS ix_ml_orders_import_fecha ON ml_orders_import(fecha_orden);

COMMIT;
