-- Payment methods + split payment details + price labels defaults

CREATE TABLE IF NOT EXISTS metodos_pago (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  moneda TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_metodos_pago_activo ON metodos_pago(activo);
CREATE INDEX IF NOT EXISTS ix_metodos_pago_orden ON metodos_pago(orden);

CREATE TABLE IF NOT EXISTS pagos_metodos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pago_id INTEGER NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
  metodo_id INTEGER NOT NULL REFERENCES metodos_pago(id) ON DELETE RESTRICT,
  monto REAL NOT NULL CHECK (monto > 0),
  moneda TEXT
);
CREATE INDEX IF NOT EXISTS ix_pagos_metodos_pago ON pagos_metodos(pago_id);
CREATE INDEX IF NOT EXISTS ix_pagos_metodos_metodo ON pagos_metodos(metodo_id);

-- Defaults for price labels (only if missing)
INSERT OR IGNORE INTO parametros_sistema(clave, valor_texto, descripcion)
VALUES ('price_label_local', 'Precio Distribuidor', 'Etiqueta para precio local (precio_local)');
INSERT OR IGNORE INTO parametros_sistema(clave, valor_texto, descripcion)
VALUES ('price_label_distribuidor', 'Precio Mayorista', 'Etiqueta para precio distribuidor (precio_distribuidor)');
INSERT OR IGNORE INTO parametros_sistema(clave, valor_texto, descripcion)
VALUES ('price_label_final', 'Precio Final', 'Etiqueta para precio final (precio_venta)');

-- Defaults for payment methods (only if table is empty)
INSERT INTO metodos_pago(nombre, moneda, activo, orden)
SELECT 'Efectivo', 'ARS', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM metodos_pago);
INSERT INTO metodos_pago(nombre, moneda, activo, orden)
SELECT 'Transferencia', 'ARS', 1, 2
WHERE NOT EXISTS (SELECT 1 FROM metodos_pago WHERE nombre = 'Transferencia');
INSERT INTO metodos_pago(nombre, moneda, activo, orden)
SELECT 'Tarjeta', 'ARS', 1, 3
WHERE NOT EXISTS (SELECT 1 FROM metodos_pago WHERE nombre = 'Tarjeta');
INSERT INTO metodos_pago(nombre, moneda, activo, orden)
SELECT 'USD', 'USD', 1, 4
WHERE NOT EXISTS (SELECT 1 FROM metodos_pago WHERE nombre = 'USD');
INSERT INTO metodos_pago(nombre, moneda, activo, orden)
SELECT 'Otro', NULL, 1, 9
WHERE NOT EXISTS (SELECT 1 FROM metodos_pago WHERE nombre = 'Otro');
