-- Sueldos y comisiones de vendedores

CREATE TABLE IF NOT EXISTS vendedores_comisiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  periodo TEXT NOT NULL CHECK (periodo IN ('dia','semana','mes')),
  porcentaje REAL NOT NULL CHECK (porcentaje >= 0),
  base_tipo TEXT NOT NULL DEFAULT 'bruto' CHECK (base_tipo IN ('bruto','neto')),
  vigencia_desde TEXT NOT NULL DEFAULT CURRENT_DATE,
  vigencia_hasta TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_vendedores_comisiones_usuario ON vendedores_comisiones(usuario_id);
CREATE INDEX IF NOT EXISTS ix_vendedores_comisiones_periodo ON vendedores_comisiones(periodo);
CREATE INDEX IF NOT EXISTS ix_vendedores_comisiones_vigencia ON vendedores_comisiones(vigencia_desde, vigencia_hasta);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendedores_comisiones_activa ON vendedores_comisiones(usuario_id, periodo) WHERE activo = 1;

CREATE TABLE IF NOT EXISTS vendedores_pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  periodo TEXT NOT NULL CHECK (periodo IN ('dia','semana','mes')),
  desde TEXT NOT NULL,
  hasta TEXT NOT NULL,
  ventas_total REAL NOT NULL DEFAULT 0 CHECK (ventas_total >= 0),
  porcentaje REAL NOT NULL DEFAULT 0 CHECK (porcentaje >= 0),
  monto_calculado REAL NOT NULL DEFAULT 0 CHECK (monto_calculado >= 0),
  monto_pagado REAL NOT NULL CHECK (monto_pagado > 0),
  fecha_pago TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metodo TEXT,
  notas TEXT,
  usuario_registro INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_vendedores_pagos_usuario ON vendedores_pagos(usuario_id);
CREATE INDEX IF NOT EXISTS ix_vendedores_pagos_periodo ON vendedores_pagos(periodo);
CREATE INDEX IF NOT EXISTS ix_vendedores_pagos_rango ON vendedores_pagos(desde, hasta);
CREATE INDEX IF NOT EXISTS ix_vendedores_pagos_fecha ON vendedores_pagos(fecha_pago);
