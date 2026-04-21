CREATE TABLE IF NOT EXISTS pymes_aliadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  rubro TEXT,
  contacto TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  localidad TEXT,
  provincia TEXT,
  notas TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  external_id TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pymes_aliadas_external ON pymes_aliadas(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_pymes_aliadas_nombre ON pymes_aliadas(nombre);
CREATE INDEX IF NOT EXISTS ix_pymes_aliadas_activo ON pymes_aliadas(activo);

CREATE TABLE IF NOT EXISTS alianzas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pyme_id INTEGER NOT NULL REFERENCES pymes_aliadas(id) ON DELETE RESTRICT,
  nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','pausada','vencida')),
  vigencia_desde TEXT,
  vigencia_hasta TEXT,
  comision_tipo TEXT NOT NULL DEFAULT 'porcentaje' CHECK (comision_tipo IN ('porcentaje','monto')),
  comision_valor REAL NOT NULL DEFAULT 0,
  beneficio_tipo TEXT NOT NULL DEFAULT 'porcentaje' CHECK (beneficio_tipo IN ('porcentaje','monto')),
  beneficio_valor REAL NOT NULL DEFAULT 0,
  limite_usos INTEGER NOT NULL DEFAULT 0 CHECK (limite_usos >= 0),
  notas TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  external_id TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alianzas_external ON alianzas(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_alianzas_pyme ON alianzas(pyme_id);
CREATE INDEX IF NOT EXISTS ix_alianzas_estado ON alianzas(estado);
CREATE INDEX IF NOT EXISTS ix_alianzas_activo ON alianzas(activo);

CREATE TABLE IF NOT EXISTS alianzas_ofertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alianza_id INTEGER NOT NULL REFERENCES alianzas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio_fijo REAL,
  activo INTEGER NOT NULL DEFAULT 1,
  external_id TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alianzas_ofertas_external ON alianzas_ofertas(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_alianzas_ofertas_alianza ON alianzas_ofertas(alianza_id);
CREATE INDEX IF NOT EXISTS ix_alianzas_ofertas_activo ON alianzas_ofertas(activo);

CREATE TABLE IF NOT EXISTS alianzas_ofertas_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oferta_id INTEGER NOT NULL REFERENCES alianzas_ofertas(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0)
);
CREATE INDEX IF NOT EXISTS ix_ofertas_items_oferta ON alianzas_ofertas_items(oferta_id);
CREATE INDEX IF NOT EXISTS ix_ofertas_items_producto ON alianzas_ofertas_items(producto_id);

CREATE TABLE IF NOT EXISTS referidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alianza_id INTEGER NOT NULL REFERENCES alianzas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL UNIQUE,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo','agotado','vencido')),
  max_usos INTEGER NOT NULL DEFAULT 0 CHECK (max_usos >= 0),
  usos_actuales INTEGER NOT NULL DEFAULT 0 CHECK (usos_actuales >= 0),
  vigencia_desde TEXT,
  vigencia_hasta TEXT,
  beneficio_tipo TEXT CHECK (beneficio_tipo IN ('porcentaje','monto')),
  beneficio_valor REAL,
  notas TEXT,
  external_id TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_referidos_external ON referidos(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_referidos_alianza ON referidos(alianza_id);
CREATE INDEX IF NOT EXISTS ix_referidos_codigo ON referidos(codigo);
CREATE INDEX IF NOT EXISTS ix_referidos_estado ON referidos(estado);

CREATE TABLE IF NOT EXISTS uso_referidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referido_id INTEGER NOT NULL REFERENCES referidos(id) ON DELETE CASCADE,
  venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_venta REAL NOT NULL DEFAULT 0,
  descuento_aplicado REAL NOT NULL DEFAULT 0,
  comision_monto REAL NOT NULL DEFAULT 0,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  notas TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_uso_referidos_venta ON uso_referidos(venta_id);
CREATE INDEX IF NOT EXISTS ix_uso_referidos_referido ON uso_referidos(referido_id);
CREATE INDEX IF NOT EXISTS ix_uso_referidos_fecha ON uso_referidos(fecha);
