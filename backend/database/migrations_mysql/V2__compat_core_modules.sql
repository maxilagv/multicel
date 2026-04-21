SET @ddl_stock_minimo = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'productos'
        AND column_name = 'stock_minimo'
    ),
    'SELECT 1',
    'ALTER TABLE productos ADD COLUMN stock_minimo INT NOT NULL DEFAULT 0'
  )
);
PREPARE stmt_stock_minimo FROM @ddl_stock_minimo;
EXECUTE stmt_stock_minimo;
DEALLOCATE PREPARE stmt_stock_minimo;

SET @ddl_stock_maximo = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'productos'
        AND column_name = 'stock_maximo'
    ),
    'SELECT 1',
    'ALTER TABLE productos ADD COLUMN stock_maximo INT NULL'
  )
);
PREPARE stmt_stock_maximo FROM @ddl_stock_maximo;
EXECUTE stmt_stock_maximo;
DEALLOCATE PREPARE stmt_stock_maximo;

SET @ddl_reorden = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'productos'
        AND column_name = 'reorden'
    ),
    'SELECT 1',
    'ALTER TABLE productos ADD COLUMN reorden INT NOT NULL DEFAULT 0'
  )
);
PREPARE stmt_reorden FROM @ddl_reorden;
EXECUTE stmt_reorden;
DEALLOCATE PREPARE stmt_reorden;

CREATE TABLE IF NOT EXISTS productos_historial (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id BIGINT UNSIGNED NOT NULL,
  proveedor_id BIGINT UNSIGNED NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  costo_pesos DECIMAL(18,2) NULL,
  costo_dolares DECIMAL(18,2) NULL,
  tipo_cambio DECIMAL(18,4) NULL,
  margen_local DECIMAL(10,4) NULL,
  margen_distribuidor DECIMAL(10,4) NULL,
  precio_local DECIMAL(18,2) NULL,
  precio_distribuidor DECIMAL(18,2) NULL,
  usuario_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_productos_historial_producto (producto_id),
  KEY ix_productos_historial_fecha (fecha),
  KEY ix_productos_historial_usuario (usuario_id),
  CONSTRAINT fk_productos_historial_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_productos_historial_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL,
  CONSTRAINT fk_productos_historial_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_ajustes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id BIGINT UNSIGNED NOT NULL,
  cantidad DECIMAL(18,2) NOT NULL DEFAULT 0,
  motivo TEXT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY ix_stock_ajustes_producto (producto_id),
  KEY ix_stock_ajustes_fecha (fecha),
  KEY ix_stock_ajustes_usuario (usuario_id),
  CONSTRAINT fk_stock_ajustes_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_ajustes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS compras (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  proveedor_id BIGINT UNSIGNED NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_costo DECIMAL(18,2) NOT NULL DEFAULT 0,
  moneda VARCHAR(8) NOT NULL DEFAULT 'USD',
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  oc_numero VARCHAR(100) NULL,
  adjunto_url TEXT NULL,
  PRIMARY KEY (id),
  KEY ix_compras_fecha (fecha),
  KEY ix_compras_proveedor (proveedor_id),
  KEY ix_compras_estado (estado),
  CONSTRAINT fk_compras_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS compras_detalle (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  compra_id BIGINT UNSIGNED NOT NULL,
  producto_id BIGINT UNSIGNED NOT NULL,
  cantidad DECIMAL(18,2) NOT NULL,
  cantidad_recibida DECIMAL(18,2) NOT NULL DEFAULT 0,
  costo_unitario DECIMAL(18,2) NOT NULL DEFAULT 0,
  costo_envio DECIMAL(18,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  moneda VARCHAR(8) NULL,
  tipo_cambio DECIMAL(18,4) NULL,
  PRIMARY KEY (id),
  KEY ix_compras_detalle_compra (compra_id),
  KEY ix_compras_detalle_producto (producto_id),
  CONSTRAINT fk_compras_detalle_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
  CONSTRAINT fk_compras_detalle_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recepciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  compra_id BIGINT UNSIGNED NOT NULL,
  fecha_recepcion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observaciones TEXT NULL,
  deposito_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_recepciones_compra (compra_id),
  KEY ix_recepciones_deposito (deposito_id),
  CONSTRAINT fk_recepciones_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
  CONSTRAINT fk_recepciones_deposito FOREIGN KEY (deposito_id) REFERENCES depositos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recepciones_detalle (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recepcion_id BIGINT UNSIGNED NOT NULL,
  producto_id BIGINT UNSIGNED NOT NULL,
  cantidad DECIMAL(18,2) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_recepciones_detalle_recepcion (recepcion_id),
  KEY ix_recepciones_detalle_producto (producto_id),
  CONSTRAINT fk_recepciones_detalle_recepcion FOREIGN KEY (recepcion_id) REFERENCES recepciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_recepciones_detalle_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pagos_proveedores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  compra_id BIGINT UNSIGNED NOT NULL,
  proveedor_id BIGINT UNSIGNED NOT NULL,
  monto DECIMAL(18,2) NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metodo VARCHAR(20) NOT NULL DEFAULT 'transferencia',
  PRIMARY KEY (id),
  KEY ix_pagos_proveedores_compra (compra_id),
  KEY ix_pagos_proveedores_proveedor (proveedor_id),
  KEY ix_pagos_proveedores_fecha (fecha),
  CONSTRAINT fk_pagos_proveedores_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
  CONSTRAINT fk_pagos_proveedores_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gastos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  descripcion TEXT NOT NULL,
  monto DECIMAL(18,2) NOT NULL DEFAULT 0,
  categoria VARCHAR(120) NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY ix_gastos_fecha (fecha),
  KEY ix_gastos_usuario (usuario_id),
  CONSTRAINT fk_gastos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inversiones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  descripcion TEXT NOT NULL,
  monto DECIMAL(18,2) NOT NULL DEFAULT 0,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tipo VARCHAR(30) NOT NULL DEFAULT 'capex',
  PRIMARY KEY (id),
  KEY ix_inversiones_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS configuracion (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  clave VARCHAR(120) NOT NULL,
  valor TEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_configuracion_clave (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS presupuestos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  anio INT NOT NULL,
  mes INT NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  categoria VARCHAR(120) NOT NULL,
  monto DECIMAL(18,2) NOT NULL DEFAULT 0,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_presupuestos_key (anio, mes, tipo, categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS facturas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  venta_id BIGINT UNSIGNED NOT NULL,
  numero_factura VARCHAR(50) NOT NULL,
  fecha_emision DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  comprobante_pdf_url TEXT NULL,
  tipo_comprobante VARCHAR(20) NULL,
  punto_venta INT NULL,
  cae VARCHAR(40) NULL,
  cae_vto VARCHAR(20) NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  error TEXT NULL,
  total DECIMAL(18,2) NULL,
  moneda VARCHAR(8) NOT NULL DEFAULT 'PES',
  qr_data TEXT NULL,
  response_json LONGTEXT NULL,
  concepto INT NULL,
  doc_tipo INT NULL,
  doc_nro VARCHAR(30) NULL,
  imp_neto DECIMAL(18,2) NULL,
  imp_iva DECIMAL(18,2) NULL,
  imp_op_ex DECIMAL(18,2) NULL,
  imp_trib DECIMAL(18,2) NULL,
  imp_tot_conc DECIMAL(18,2) NULL,
  mon_id VARCHAR(5) NULL,
  mon_cotiz DECIMAL(18,6) NULL,
  fecha_serv_desde DATE NULL,
  fecha_serv_hasta DATE NULL,
  fecha_vto_pago DATE NULL,
  snapshot_json LONGTEXT NULL,
  request_hash VARCHAR(120) NULL,
  intentos INT NOT NULL DEFAULT 0,
  ultimo_intento DATETIME NULL,
  usuario_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_facturas_venta (venta_id),
  UNIQUE KEY uq_facturas_numero (numero_factura),
  KEY ix_facturas_estado (estado),
  KEY ix_facturas_fecha (fecha_emision),
  KEY ix_facturas_usuario (usuario_id),
  CONSTRAINT fk_facturas_venta FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
  CONSTRAINT fk_facturas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS arca_config (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cuit VARCHAR(20) NOT NULL,
  razon_social VARCHAR(200) NULL,
  condicion_iva VARCHAR(40) NULL,
  domicilio_fiscal TEXT NULL,
  provincia VARCHAR(80) NULL,
  localidad VARCHAR(80) NULL,
  codigo_postal VARCHAR(20) NULL,
  ambiente VARCHAR(20) NOT NULL DEFAULT 'homologacion',
  certificado_pem TEXT NULL,
  clave_privada_pem TEXT NULL,
  passphrase_enc TEXT NULL,
  certificado_vto VARCHAR(30) NULL,
  permitir_sin_entrega TINYINT(1) NOT NULL DEFAULT 0,
  permitir_sin_pago TINYINT(1) NOT NULL DEFAULT 0,
  precios_incluyen_iva TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_arca_config_cuit (cuit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS arca_puntos_venta (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  arca_config_id BIGINT UNSIGNED NULL,
  punto_venta INT NOT NULL,
  nombre VARCHAR(120) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_arca_pv_unique (arca_config_id, punto_venta),
  KEY ix_arca_pv_config (arca_config_id),
  CONSTRAINT fk_arca_pv_config FOREIGN KEY (arca_config_id) REFERENCES arca_config(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS arca_puntos_venta_depositos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  punto_venta_id BIGINT UNSIGNED NOT NULL,
  deposito_id BIGINT UNSIGNED NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_arca_pv_deposito_unique (deposito_id),
  UNIQUE KEY uq_arca_pv_deposito_pair (punto_venta_id, deposito_id),
  CONSTRAINT fk_arca_pv_dep_pv FOREIGN KEY (punto_venta_id) REFERENCES arca_puntos_venta(id) ON DELETE CASCADE,
  CONSTRAINT fk_arca_pv_dep_deposito FOREIGN KEY (deposito_id) REFERENCES depositos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS arca_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  arca_config_id BIGINT UNSIGNED NOT NULL,
  servicio VARCHAR(60) NOT NULL,
  token TEXT NOT NULL,
  sign TEXT NOT NULL,
  expira_en DATETIME NOT NULL,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_arca_tokens_servicio (arca_config_id, servicio),
  CONSTRAINT fk_arca_tokens_config FOREIGN KEY (arca_config_id) REFERENCES arca_config(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS arca_padron_cache (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cuit VARCHAR(20) NOT NULL,
  data_json LONGTEXT NOT NULL,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_arca_padron_cuit (cuit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW vista_deudas AS
SELECT
  c.id AS cliente_id,
  GREATEST(COALESCE(SUM(td.saldo), 0), 0) AS deuda_pendiente,
  GREATEST(COALESCE(SUM(CASE WHEN td.dias BETWEEN 0 AND 30 THEN td.saldo ELSE 0 END), 0), 0) AS deuda_0_30,
  GREATEST(COALESCE(SUM(CASE WHEN td.dias BETWEEN 31 AND 60 THEN td.saldo ELSE 0 END), 0), 0) AS deuda_31_60,
  GREATEST(COALESCE(SUM(CASE WHEN td.dias BETWEEN 61 AND 90 THEN td.saldo ELSE 0 END), 0), 0) AS deuda_61_90,
  GREATEST(COALESCE(SUM(CASE WHEN td.dias > 90 THEN td.saldo ELSE 0 END), 0), 0) AS deuda_mas_90,
  CASE
    WHEN SUM(CASE WHEN td.saldo > 0 THEN 1 ELSE 0 END) > 0
      THEN ROUND(AVG(CASE WHEN td.saldo > 0 THEN td.dias END), 2)
    ELSE NULL
  END AS dias_promedio_atraso
FROM clientes c
LEFT JOIN (
  SELECT
    v.cliente_id,
    (v.neto - COALESCE(pv.total_pagado, 0)) AS saldo,
    GREATEST(0, DATEDIFF(CURDATE(), DATE(v.fecha))) AS dias
  FROM ventas v
  LEFT JOIN (
    SELECT venta_id, SUM(monto) AS total_pagado
    FROM pagos
    WHERE venta_id IS NOT NULL
    GROUP BY venta_id
  ) pv ON pv.venta_id = v.id
  WHERE v.estado_pago <> 'cancelado'
    AND (v.neto - COALESCE(pv.total_pagado, 0)) > 0

  UNION ALL

  SELECT
    d.cliente_id,
    d.monto AS saldo,
    GREATEST(0, DATEDIFF(CURDATE(), DATE(d.fecha))) AS dias
  FROM clientes_deudas_iniciales d
  WHERE d.monto > 0

  UNION ALL

  SELECT
    p.cliente_id,
    (p.monto * -1) AS saldo,
    GREATEST(0, DATEDIFF(CURDATE(), DATE(p.fecha))) AS dias
  FROM clientes_deudas_iniciales_pagos p
  WHERE p.monto > 0

  UNION ALL

  SELECT
    p.cliente_id,
    (p.monto * -1) AS saldo,
    GREATEST(0, DATEDIFF(CURDATE(), DATE(p.fecha))) AS dias
  FROM pagos p
  WHERE p.venta_id IS NULL
) td ON td.cliente_id = c.id
GROUP BY c.id;

CREATE OR REPLACE VIEW vista_deudas_proveedores AS
SELECT
  pr.id AS proveedor_id,
  (COALESCE(c.total_compras, 0) - COALESCE(p.total_pagos, 0)) AS deuda_pendiente
FROM proveedores pr
LEFT JOIN (
  SELECT proveedor_id, SUM(CASE WHEN estado <> 'cancelado' THEN total_costo ELSE 0 END) AS total_compras
  FROM compras
  GROUP BY proveedor_id
) c ON c.proveedor_id = pr.id
LEFT JOIN (
  SELECT proveedor_id, SUM(monto) AS total_pagos
  FROM pagos_proveedores
  GROUP BY proveedor_id
) p ON p.proveedor_id = pr.id;

CREATE OR REPLACE VIEW vista_stock_bajo AS
SELECT
  pr.id AS producto_id,
  pr.codigo,
  pr.nombre,
  i.cantidad_disponible,
  pr.stock_minimo
FROM productos pr
JOIN inventario i ON i.producto_id = pr.id
WHERE i.cantidad_disponible < pr.stock_minimo
  AND pr.activo = 1;

CREATE OR REPLACE VIEW vista_top_clientes AS
SELECT
  c.id AS cliente_id,
  c.nombre,
  c.apellido,
  SUM(v.neto) AS total_comprado
FROM clientes c
JOIN ventas v ON v.cliente_id = c.id AND v.estado_pago <> 'cancelado'
GROUP BY c.id, c.nombre, c.apellido;

CREATE OR REPLACE VIEW vista_ganancias_mensuales AS
SELECT
  m.mes AS mes,
  COALESCE(v.total_ventas, 0) AS total_ventas,
  COALESCE(g.total_gastos, 0) AS total_gastos,
  (COALESCE(v.total_ventas, 0) - COALESCE(g.total_gastos, 0)) AS ganancia_neta
FROM (
  SELECT DATE_FORMAT(fecha, '%Y-%m-01') AS mes FROM ventas WHERE estado_pago <> 'cancelado'
  UNION
  SELECT DATE_FORMAT(fecha, '%Y-%m-01') AS mes FROM gastos
) m
LEFT JOIN (
  SELECT DATE_FORMAT(fecha, '%Y-%m-01') AS mes, SUM(neto) AS total_ventas
  FROM ventas
  WHERE estado_pago <> 'cancelado'
  GROUP BY DATE_FORMAT(fecha, '%Y-%m-01')
) v ON v.mes = m.mes
LEFT JOIN (
  SELECT DATE_FORMAT(fecha, '%Y-%m-01') AS mes, SUM(monto) AS total_gastos
  FROM gastos
  GROUP BY DATE_FORMAT(fecha, '%Y-%m-01')
) g ON g.mes = m.mes;

CREATE OR REPLACE VIEW vista_costos_productos AS
SELECT
  c.id AS compra_id,
  DATE(c.fecha) AS fecha,
  c.proveedor_id,
  pr.nombre AS proveedor_nombre,
  cd.producto_id,
  p.codigo AS producto_codigo,
  p.nombre AS producto_nombre,
  p.categoria_id,
  cat.nombre AS categoria_nombre,
  cd.cantidad,
  cd.costo_unitario,
  cd.costo_envio,
  cd.subtotal,
  COALESCE(cd.moneda, c.moneda) AS moneda,
  cd.tipo_cambio
FROM compras c
JOIN compras_detalle cd ON cd.compra_id = c.id
JOIN productos p ON p.id = cd.producto_id
LEFT JOIN categorias cat ON cat.id = p.categoria_id
LEFT JOIN proveedores pr ON pr.id = c.proveedor_id
WHERE c.estado = 'recibido';

CREATE OR REPLACE VIEW vista_ventas_productos AS
SELECT
  v.id AS venta_id,
  DATE(v.fecha) AS fecha,
  v.cliente_id,
  c.nombre AS cliente_nombre,
  COALESCE(c.apellido, '') AS cliente_apellido,
  v.neto,
  v.estado_pago,
  v.estado_entrega,
  vd.id AS venta_detalle_id,
  vd.producto_id,
  p.codigo AS producto_codigo,
  p.nombre AS producto_nombre,
  p.categoria_id,
  cat.nombre AS categoria_nombre,
  vd.cantidad,
  vd.precio_unitario,
  vd.subtotal
FROM ventas v
JOIN ventas_detalle vd ON vd.venta_id = v.id
JOIN productos p ON p.id = vd.producto_id
LEFT JOIN categorias cat ON cat.id = p.categoria_id
LEFT JOIN clientes c ON c.id = v.cliente_id
WHERE v.estado_pago <> 'cancelado';
