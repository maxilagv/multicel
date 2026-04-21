BEGIN;

-- Clientes: datos fiscales
ALTER TABLE clientes ADD COLUMN tipo_doc TEXT;
ALTER TABLE clientes ADD COLUMN nro_doc TEXT;
ALTER TABLE clientes ADD COLUMN condicion_iva TEXT;
ALTER TABLE clientes ADD COLUMN domicilio_fiscal TEXT;
ALTER TABLE clientes ADD COLUMN provincia TEXT;
ALTER TABLE clientes ADD COLUMN localidad TEXT;
ALTER TABLE clientes ADD COLUMN codigo_postal TEXT;

-- Productos: alicuota IVA (por defecto 21%)
ALTER TABLE productos ADD COLUMN iva_alicuota REAL NOT NULL DEFAULT 21.0;

-- Facturas: extensiones ARCA
ALTER TABLE facturas ADD COLUMN tipo_comprobante TEXT;
ALTER TABLE facturas ADD COLUMN punto_venta INTEGER;
ALTER TABLE facturas ADD COLUMN cae TEXT;
ALTER TABLE facturas ADD COLUMN cae_vto TEXT;
ALTER TABLE facturas ADD COLUMN estado TEXT NOT NULL DEFAULT 'pendiente';
ALTER TABLE facturas ADD COLUMN error TEXT;
ALTER TABLE facturas ADD COLUMN total REAL;
ALTER TABLE facturas ADD COLUMN moneda TEXT NOT NULL DEFAULT 'PES';
ALTER TABLE facturas ADD COLUMN qr_data TEXT;
ALTER TABLE facturas ADD COLUMN response_json TEXT;
ALTER TABLE facturas ADD COLUMN request_hash TEXT;
ALTER TABLE facturas ADD COLUMN intentos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE facturas ADD COLUMN ultimo_intento TEXT;
ALTER TABLE facturas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS arca_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuit TEXT NOT NULL,
  razon_social TEXT,
  condicion_iva TEXT,
  domicilio_fiscal TEXT,
  provincia TEXT,
  localidad TEXT,
  codigo_postal TEXT,
  ambiente TEXT NOT NULL DEFAULT 'homologacion',
  certificado_pem TEXT,
  clave_privada_pem TEXT,
  passphrase_enc TEXT,
  certificado_vto TEXT,
  permitir_sin_entrega INTEGER NOT NULL DEFAULT 0,
  permitir_sin_pago INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activo INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_arca_config_cuit ON arca_config(cuit);

CREATE TABLE IF NOT EXISTS arca_puntos_venta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  arca_config_id INTEGER REFERENCES arca_config(id) ON DELETE CASCADE,
  punto_venta INTEGER NOT NULL,
  nombre TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (arca_config_id, punto_venta)
);

CREATE TABLE IF NOT EXISTS arca_puntos_venta_depositos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  punto_venta_id INTEGER NOT NULL REFERENCES arca_puntos_venta(id) ON DELETE CASCADE,
  deposito_id INTEGER NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (deposito_id),
  UNIQUE (punto_venta_id, deposito_id)
);

CREATE TABLE IF NOT EXISTS arca_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  arca_config_id INTEGER REFERENCES arca_config(id) ON DELETE CASCADE,
  servicio TEXT NOT NULL,
  token TEXT NOT NULL,
  sign TEXT NOT NULL,
  expira_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (arca_config_id, servicio)
);

CREATE TABLE IF NOT EXISTS arca_padron_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuit TEXT NOT NULL UNIQUE,
  data_json TEXT NOT NULL,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;

