CREATE TABLE IF NOT EXISTS ventas_agregadas_diarias (
  fecha DATE NOT NULL,
  total_ventas DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_deudas_iniciales DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_gastos DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_compras DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_pagos_clientes DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_pagos_proveedores DECIMAL(15,2) NOT NULL DEFAULT 0,
  cantidad_ventas INT NOT NULL DEFAULT 0,
  ticket_promedio DECIMAL(15,2) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (fecha),
  KEY ix_vad_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
