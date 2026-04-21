CREATE TABLE IF NOT EXISTS ventas_agregadas_diarias (
  fecha TEXT PRIMARY KEY,
  total_ventas REAL NOT NULL DEFAULT 0,
  total_deudas_iniciales REAL NOT NULL DEFAULT 0,
  total_gastos REAL NOT NULL DEFAULT 0,
  total_compras REAL NOT NULL DEFAULT 0,
  total_pagos_clientes REAL NOT NULL DEFAULT 0,
  total_pagos_proveedores REAL NOT NULL DEFAULT 0,
  cantidad_ventas INTEGER NOT NULL DEFAULT 0,
  ticket_promedio REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_vad_updated_at ON ventas_agregadas_diarias(updated_at DESC);
