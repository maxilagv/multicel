CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(50) NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  rol_id BIGINT UNSIGNED NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  caja_tipo_default VARCHAR(20) NOT NULL DEFAULT 'sucursal',
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email),
  KEY ix_usuarios_rol (rol_id),
  CONSTRAINT fk_usuarios_rol FOREIGN KEY (rol_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token TEXT NOT NULL,
  jti VARCHAR(128) NOT NULL,
  user_agent TEXT NULL,
  ip VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_refresh_token_jti (jti),
  KEY ix_auth_rt_user (user_id),
  KEY ix_auth_rt_expires (expires_at),
  CONSTRAINT fk_auth_rt_user FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS jwt_blacklist (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  jti VARCHAR(128) NOT NULL,
  token TEXT NOT NULL,
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_jwt_bl_jti (jti),
  KEY ix_jwt_bl_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NULL,
  accion VARCHAR(80) NOT NULL,
  tabla_afectada VARCHAR(120) NOT NULL,
  registro_id BIGINT NULL,
  descripcion TEXT NULL,
  fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_logs_usuario (usuario_id),
  KEY ix_logs_fecha (fecha_hora),
  CONSTRAINT fk_logs_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parametros_sistema (
  clave VARCHAR(100) NOT NULL,
  valor_texto LONGTEXT NULL,
  valor_num DECIMAL(18,4) NULL,
  descripcion TEXT NULL,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  usuario_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (clave),
  KEY ix_parametros_usuario (usuario_id),
  CONSTRAINT fk_parametros_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS depositos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  codigo VARCHAR(50) NULL,
  direccion TEXT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_depositos_codigo (codigo),
  UNIQUE KEY uq_depositos_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios_depositos (
  usuario_id BIGINT UNSIGNED NOT NULL,
  deposito_id BIGINT UNSIGNED NOT NULL,
  rol_deposito VARCHAR(20) NOT NULL DEFAULT 'operador',
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, deposito_id),
  KEY ix_usuarios_depositos_deposito (deposito_id),
  CONSTRAINT fk_ud_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_ud_deposito FOREIGN KEY (deposito_id) REFERENCES depositos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS zonas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  color_hex VARCHAR(16) NOT NULL DEFAULT '#64748B',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_zonas_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clientes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NULL,
  telefono VARCHAR(50) NULL,
  email VARCHAR(255) NULL,
  direccion TEXT NULL,
  cuit_cuil VARCHAR(20) NULL,
  tipo_doc VARCHAR(20) NULL,
  nro_doc VARCHAR(30) NULL,
  condicion_iva VARCHAR(40) NULL,
  domicilio_fiscal TEXT NULL,
  provincia VARCHAR(80) NULL,
  localidad VARCHAR(80) NULL,
  codigo_postal VARCHAR(20) NULL,
  zona_id BIGINT UNSIGNED NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado VARCHAR(20) NOT NULL DEFAULT 'activo',
  tipo_cliente VARCHAR(30) NOT NULL DEFAULT 'minorista',
  segmento VARCHAR(80) NULL,
  tags TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clientes_email (email),
  UNIQUE KEY uq_clientes_cuit (cuit_cuil),
  KEY ix_clientes_nombre (nombre),
  KEY ix_clientes_apellido (apellido),
  KEY ix_clientes_zona (zona_id),
  CONSTRAINT fk_clientes_zona FOREIGN KEY (zona_id) REFERENCES zonas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clientes_deudas_iniciales (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id BIGINT UNSIGNED NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  descripcion TEXT NULL,
  PRIMARY KEY (id),
  KEY ix_cdi_cliente (cliente_id),
  KEY ix_cdi_fecha (fecha),
  CONSTRAINT fk_cdi_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clientes_deudas_iniciales_pagos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id BIGINT UNSIGNED NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  descripcion TEXT NULL,
  PRIMARY KEY (id),
  KEY ix_cdip_cliente (cliente_id),
  KEY ix_cdip_fecha (fecha),
  CONSTRAINT fk_cdip_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proveedores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(255) NULL,
  telefono VARCHAR(50) NULL,
  direccion TEXT NULL,
  cuit_cuil VARCHAR(20) NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_proveedores_cuit (cuit_cuil),
  KEY ix_proveedores_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categorias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT NULL,
  imagen_url TEXT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  parent_id BIGINT UNSIGNED NULL,
  depth INT NOT NULL DEFAULT 0,
  path VARCHAR(255) NOT NULL DEFAULT '/',
  sort_order INT NOT NULL DEFAULT 0,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_categorias_parent (parent_id),
  KEY ix_categorias_path (path),
  KEY ix_categorias_activo (activo),
  CONSTRAINT fk_categorias_parent FOREIGN KEY (parent_id) REFERENCES categorias(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS productos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(120) NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT NULL,
  categoria_id BIGINT UNSIGNED NOT NULL,
  precio_venta DECIMAL(18,2) NOT NULL DEFAULT 0,
  precio_costo DECIMAL(18,2) NOT NULL DEFAULT 0,
  precio_costo_pesos DECIMAL(18,2) NOT NULL DEFAULT 0,
  precio_costo_dolares DECIMAL(18,2) NOT NULL DEFAULT 0,
  tipo_cambio DECIMAL(18,4) NULL,
  margen_local DECIMAL(10,4) NOT NULL DEFAULT 0,
  margen_distribuidor DECIMAL(10,4) NOT NULL DEFAULT 0,
  precio_local DECIMAL(18,2) NOT NULL DEFAULT 0,
  precio_distribuidor DECIMAL(18,2) NOT NULL DEFAULT 0,
  comision_pct DECIMAL(10,4) NOT NULL DEFAULT 0,
  precio_modo VARCHAR(20) NOT NULL DEFAULT 'auto',
  precio_final DECIMAL(18,2) NOT NULL DEFAULT 0,
  marca VARCHAR(120) NULL,
  modelo VARCHAR(120) NULL,
  procesador VARCHAR(120) NULL,
  ram_gb INT NULL,
  almacenamiento_gb INT NULL,
  pantalla_pulgadas DECIMAL(6,2) NULL,
  camara_mp DECIMAL(8,2) NULL,
  bateria_mah INT NULL,
  proveedor_id BIGINT UNSIGNED NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_productos_codigo (codigo),
  KEY ix_productos_categoria (categoria_id),
  KEY ix_productos_activo (activo),
  KEY ix_productos_nombre (nombre),
  CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id),
  CONSTRAINT fk_productos_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS producto_imagenes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id BIGINT UNSIGNED NOT NULL,
  url TEXT NOT NULL,
  orden INT NOT NULL DEFAULT 0,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_producto_imagen_orden (producto_id, orden),
  KEY ix_producto_imagen_producto (producto_id),
  CONSTRAINT fk_producto_imagen_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventario_depositos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id BIGINT UNSIGNED NOT NULL,
  deposito_id BIGINT UNSIGNED NOT NULL,
  cantidad_disponible DECIMAL(18,2) NOT NULL DEFAULT 0,
  cantidad_reservada DECIMAL(18,2) NOT NULL DEFAULT 0,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inventario_dep (producto_id, deposito_id),
  KEY ix_inv_dep_producto (producto_id),
  KEY ix_inv_dep_deposito (deposito_id),
  CONSTRAINT fk_inv_dep_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_dep_deposito FOREIGN KEY (deposito_id) REFERENCES depositos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS movimientos_stock (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id BIGINT UNSIGNED NOT NULL,
  deposito_id BIGINT UNSIGNED NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  cantidad DECIMAL(18,2) NOT NULL,
  motivo VARCHAR(120) NULL,
  referencia VARCHAR(160) NULL,
  usuario_id BIGINT UNSIGNED NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_mov_stock_producto (producto_id),
  KEY ix_mov_stock_deposito (deposito_id),
  CONSTRAINT fk_mov_stock_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
  CONSTRAINT fk_mov_stock_deposito FOREIGN KEY (deposito_id) REFERENCES depositos(id),
  CONSTRAINT fk_mov_stock_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ventas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id BIGINT UNSIGNED NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total DECIMAL(18,2) NOT NULL DEFAULT 0,
  descuento DECIMAL(18,2) NOT NULL DEFAULT 0,
  impuestos DECIMAL(18,2) NOT NULL DEFAULT 0,
  neto DECIMAL(18,2) NOT NULL DEFAULT 0,
  estado_pago VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  estado_entrega VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  deposito_id BIGINT UNSIGNED NULL,
  es_reserva TINYINT(1) NOT NULL DEFAULT 0,
  usuario_id BIGINT UNSIGNED NULL,
  caja_tipo VARCHAR(20) NOT NULL DEFAULT 'sucursal',
  observaciones TEXT NULL,
  oculto TINYINT(1) NOT NULL DEFAULT 0,
  fecha_entrega DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_ventas_cliente (cliente_id),
  KEY ix_ventas_usuario (usuario_id),
  KEY ix_ventas_fecha (fecha),
  CONSTRAINT fk_ventas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  CONSTRAINT fk_ventas_deposito FOREIGN KEY (deposito_id) REFERENCES depositos(id) ON DELETE SET NULL,
  CONSTRAINT fk_ventas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ventas_detalle (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  venta_id BIGINT UNSIGNED NOT NULL,
  producto_id BIGINT UNSIGNED NOT NULL,
  cantidad DECIMAL(18,2) NOT NULL,
  precio_unitario DECIMAL(18,2) NOT NULL,
  subtotal DECIMAL(18,2) NOT NULL,
  base_sin_iva DECIMAL(18,2) NULL,
  comision_pct DECIMAL(10,4) NULL,
  comision_monto DECIMAL(18,2) NULL,
  costo_unitario_pesos DECIMAL(18,2) NULL,
  PRIMARY KEY (id),
  KEY ix_ventas_detalle_venta (venta_id),
  KEY ix_ventas_detalle_producto (producto_id),
  CONSTRAINT fk_vd_venta FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
  CONSTRAINT fk_vd_producto FOREIGN KEY (producto_id) REFERENCES productos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pagos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  venta_id BIGINT UNSIGNED NULL,
  cliente_id BIGINT UNSIGNED NOT NULL,
  monto DECIMAL(18,2) NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metodo VARCHAR(40) NOT NULL DEFAULT 'efectivo',
  fecha_limite DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_pagos_venta (venta_id),
  KEY ix_pagos_cliente (cliente_id),
  CONSTRAINT fk_pagos_venta FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
  CONSTRAINT fk_pagos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS metodos_pago (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(80) NOT NULL,
  moneda VARCHAR(10) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  orden INT NOT NULL DEFAULT 0,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_metodos_pago_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pagos_metodos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pago_id BIGINT UNSIGNED NOT NULL,
  metodo_id BIGINT UNSIGNED NOT NULL,
  monto DECIMAL(18,2) NOT NULL,
  moneda VARCHAR(10) NULL,
  PRIMARY KEY (id),
  KEY ix_pagos_metodos_pago (pago_id),
  KEY ix_pagos_metodos_metodo (metodo_id),
  CONSTRAINT fk_pm_pago FOREIGN KEY (pago_id) REFERENCES pagos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_metodo FOREIGN KEY (metodo_id) REFERENCES metodos_pago(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW inventario AS
SELECT
  producto_id,
  SUM(cantidad_disponible) AS cantidad_disponible
FROM inventario_depositos
GROUP BY producto_id;

CREATE OR REPLACE VIEW vista_deudas AS
SELECT
  c.id AS cliente_id,
  GREATEST(
    COALESCE((
      SELECT SUM(v.neto)
      FROM ventas v
      WHERE v.cliente_id = c.id
        AND v.estado_pago <> 'cancelado'
        AND COALESCE(v.oculto, 0) = 0
    ), 0)
    - COALESCE((
      SELECT SUM(p.monto)
      FROM pagos p
      WHERE p.cliente_id = c.id
    ), 0)
    + COALESCE((
      SELECT SUM(d.monto)
      FROM clientes_deudas_iniciales d
      WHERE d.cliente_id = c.id
    ), 0)
    - COALESCE((
      SELECT SUM(dp.monto)
      FROM clientes_deudas_iniciales_pagos dp
      WHERE dp.cliente_id = c.id
    ), 0),
    0
  ) AS deuda_pendiente
FROM clientes c;

INSERT IGNORE INTO roles (nombre) VALUES ('admin');
INSERT IGNORE INTO roles (nombre) VALUES ('gerente');
INSERT IGNORE INTO roles (nombre) VALUES ('vendedor');

INSERT IGNORE INTO depositos (nombre, codigo, direccion, activo)
VALUES ('Deposito Principal', 'MAIN', NULL, 1);

INSERT IGNORE INTO metodos_pago (nombre, moneda, activo, orden) VALUES ('efectivo', 'ARS', 1, 0);
INSERT IGNORE INTO metodos_pago (nombre, moneda, activo, orden) VALUES ('transferencia', 'ARS', 1, 1);
INSERT IGNORE INTO metodos_pago (nombre, moneda, activo, orden) VALUES ('tarjeta', 'ARS', 1, 2);
INSERT IGNORE INTO metodos_pago (nombre, moneda, activo, orden) VALUES ('otro', NULL, 1, 99);
