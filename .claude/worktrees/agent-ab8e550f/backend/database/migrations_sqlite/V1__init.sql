CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email_ci ON usuarios (LOWER(email));
CREATE INDEX IF NOT EXISTS ix_usuarios_rol ON usuarios(rol_id);

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  jti TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_auth_rt_user ON auth_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS ix_auth_rt_expires ON auth_refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS jwt_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jti TEXT NOT NULL,
  token TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_jwt_bl_jti ON jwt_blacklist(jti);
CREATE INDEX IF NOT EXISTS ix_jwt_bl_expires ON jwt_blacklist(expires_at);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  accion TEXT NOT NULL,
  tabla_afectada TEXT NOT NULL,
  registro_id INTEGER,
  descripcion TEXT,
  fecha_hora TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_logs_usuario ON logs(usuario_id);
CREATE INDEX IF NOT EXISTS ix_logs_fecha ON logs(fecha_hora);

CREATE TABLE IF NOT EXISTS parametros_sistema (
  clave TEXT PRIMARY KEY,
  valor_texto TEXT,
  valor_num REAL,
  descripcion TEXT,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_parametros_sistema_usuario ON parametros_sistema(usuario_id);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellido TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  cuit_cuil TEXT,
  fecha_registro TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
  tipo_cliente TEXT DEFAULT 'minorista' CHECK (tipo_cliente IN ('minorista','mayorista','distribuidor')),
  segmento TEXT,
  tags TEXT
);
CREATE INDEX IF NOT EXISTS ix_clientes_nombre ON clientes(nombre);
CREATE INDEX IF NOT EXISTS ix_clientes_apellido ON clientes(apellido);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_cuit ON clientes(cuit_cuil);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_email_ci ON clientes(LOWER(email));

CREATE TABLE IF NOT EXISTS clientes_auth (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL UNIQUE REFERENCES clientes(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  password_set_at TEXT,
  last_login_at TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_auth_email_ci ON clientes_auth (LOWER(email));
CREATE INDEX IF NOT EXISTS ix_clientes_auth_cliente ON clientes_auth (cliente_id);

CREATE TABLE IF NOT EXISTS clientes_refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  jti TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_clientes_rt_cliente ON clientes_refresh_tokens(cliente_id);
CREATE INDEX IF NOT EXISTS ix_clientes_rt_expires ON clientes_refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS clientes_deudas_iniciales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  monto REAL NOT NULL CHECK (monto >= 0),
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  descripcion TEXT
);
CREATE INDEX IF NOT EXISTS ix_clientes_deudas_cliente ON clientes_deudas_iniciales(cliente_id);
CREATE INDEX IF NOT EXISTS ix_clientes_deudas_fecha ON clientes_deudas_iniciales(fecha);

CREATE TABLE IF NOT EXISTS clientes_deudas_iniciales_pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  monto REAL NOT NULL CHECK (monto > 0),
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  descripcion TEXT
);
CREATE INDEX IF NOT EXISTS ix_clientes_deudas_ini_pagos_cliente ON clientes_deudas_iniciales_pagos(cliente_id);
CREATE INDEX IF NOT EXISTS ix_clientes_deudas_ini_pagos_fecha ON clientes_deudas_iniciales_pagos(fecha);

CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  cuit_cuil TEXT,
  fecha_registro TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_proveedores_cuit ON proveedores(cuit_cuil);
CREATE INDEX IF NOT EXISTS ix_proveedores_nombre ON proveedores(nombre);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  imagen_url TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_categorias_activo ON categorias(activo);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  precio_costo REAL NOT NULL DEFAULT 0 CHECK (precio_costo >= 0),
  precio_venta REAL NOT NULL DEFAULT 0 CHECK (precio_venta >= 0),
  precio_costo_pesos REAL NOT NULL DEFAULT 0 CHECK (precio_costo_pesos >= 0),
  precio_costo_dolares REAL NOT NULL DEFAULT 0 CHECK (precio_costo_dolares >= 0),
  tipo_cambio REAL,
  margen_local REAL NOT NULL DEFAULT 0.15 CHECK (margen_local >= 0),
  margen_distribuidor REAL NOT NULL DEFAULT 0.45 CHECK (margen_distribuidor >= 0),
  precio_local REAL NOT NULL DEFAULT 0 CHECK (precio_local >= 0),
  precio_distribuidor REAL NOT NULL DEFAULT 0 CHECK (precio_distribuidor >= 0),
  precio_final REAL NOT NULL DEFAULT 0 CHECK (precio_final >= 0),
  proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
  stock_minimo INTEGER NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  stock_maximo INTEGER CHECK (stock_maximo IS NULL OR stock_maximo >= 0),
  reorden INTEGER NOT NULL DEFAULT 0 CHECK (reorden >= 0),
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  marca TEXT,
  modelo TEXT,
  procesador TEXT,
  ram_gb INTEGER,
  almacenamiento_gb INTEGER,
  pantalla_pulgadas REAL,
  camara_mp INTEGER,
  bateria_mah INTEGER
);
CREATE INDEX IF NOT EXISTS ix_productos_nombre ON productos(nombre);
CREATE INDEX IF NOT EXISTS ix_productos_categoria ON productos(categoria_id);

CREATE TABLE IF NOT EXISTS producto_imagenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_imagenes_orden ON producto_imagenes(producto_id, orden);

CREATE TABLE IF NOT EXISTS productos_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  costo_pesos REAL,
  costo_dolares REAL,
  tipo_cambio REAL,
  margen_local REAL,
  margen_distribuidor REAL,
  precio_local REAL,
  precio_distribuidor REAL,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_productos_historial_producto ON productos_historial(producto_id);
CREATE INDEX IF NOT EXISTS ix_productos_historial_fecha ON productos_historial(fecha);

CREATE TABLE IF NOT EXISTS depositos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  codigo TEXT UNIQUE,
  direccion TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_depositos_activo ON depositos(activo);

CREATE TABLE IF NOT EXISTS usuarios_depositos (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  deposito_id INTEGER NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
  rol_deposito TEXT NOT NULL DEFAULT 'operador' CHECK (rol_deposito IN ('operador','visor','admin')),
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, deposito_id)
);
CREATE INDEX IF NOT EXISTS ix_usuarios_depositos_deposito ON usuarios_depositos(deposito_id);

CREATE TABLE IF NOT EXISTS inventario_depositos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  deposito_id INTEGER NOT NULL REFERENCES depositos(id) ON DELETE RESTRICT,
  cantidad_disponible INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_disponible >= 0),
  cantidad_reservada INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_reservada >= 0),
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (producto_id, deposito_id)
);
CREATE INDEX IF NOT EXISTS ix_inv_dep_producto ON inventario_depositos(producto_id);
CREATE INDEX IF NOT EXISTS ix_inv_dep_deposito ON inventario_depositos(deposito_id);

CREATE VIEW IF NOT EXISTS inventario AS
SELECT
  producto_id,
  SUM(cantidad_disponible) AS cantidad_disponible,
  SUM(cantidad_reservada) AS cantidad_reservada
FROM inventario_depositos
GROUP BY producto_id;

CREATE TABLE IF NOT EXISTS movimientos_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  deposito_id INTEGER REFERENCES depositos(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','salida')),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  motivo TEXT NOT NULL,
  referencia TEXT,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_movimientos_producto ON movimientos_stock(producto_id);
CREATE INDEX IF NOT EXISTS ix_movimientos_fecha ON movimientos_stock(fecha);
CREATE INDEX IF NOT EXISTS ix_movimientos_tipo ON movimientos_stock(tipo);
CREATE INDEX IF NOT EXISTS ix_movimientos_deposito ON movimientos_stock(deposito_id);

CREATE TABLE IF NOT EXISTS stock_ajustes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL,
  motivo TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_ajustes_producto ON stock_ajustes(producto_id);
CREATE INDEX IF NOT EXISTS ix_ajustes_fecha ON stock_ajustes(fecha);

CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_costo REAL NOT NULL DEFAULT 0 CHECK (total_costo >= 0),
  moneda TEXT NOT NULL DEFAULT 'USD' CHECK (moneda IN ('ARS','USD','CNY')),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','recibido','cancelado'))
);
CREATE INDEX IF NOT EXISTS ix_compras_fecha ON compras(fecha);
CREATE INDEX IF NOT EXISTS ix_compras_proveedor ON compras(proveedor_id);

CREATE TABLE IF NOT EXISTS compras_detalle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  costo_unitario REAL NOT NULL CHECK (costo_unitario >= 0),
  costo_envio REAL NOT NULL DEFAULT 0 CHECK (costo_envio >= 0),
  subtotal REAL NOT NULL CHECK (subtotal >= 0),
  moneda TEXT CHECK (moneda IN ('ARS','USD','CNY')),
  tipo_cambio REAL CHECK (tipo_cambio IS NULL OR tipo_cambio > 0)
);
CREATE INDEX IF NOT EXISTS ix_compras_detalle_compra ON compras_detalle(compra_id);
CREATE INDEX IF NOT EXISTS ix_compras_detalle_producto ON compras_detalle(producto_id);

CREATE TABLE IF NOT EXISTS recepciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  fecha_recepcion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observaciones TEXT,
  deposito_id INTEGER REFERENCES depositos(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_recepciones_compra ON recepciones(compra_id);
CREATE INDEX IF NOT EXISTS ix_recepciones_deposito ON recepciones(deposito_id);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
  descuento REAL NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  impuestos REAL NOT NULL DEFAULT 0 CHECK (impuestos >= 0),
  neto REAL NOT NULL DEFAULT 0 CHECK (neto >= 0),
  estado_pago TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente','pagada','cancelado')),
  estado_entrega TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_entrega IN ('pendiente','entregado')),
  fecha_entrega TEXT,
  observaciones TEXT,
  deposito_id INTEGER REFERENCES depositos(id) ON DELETE SET NULL,
  oculto INTEGER NOT NULL DEFAULT 0,
  es_reserva INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_ventas_fecha ON ventas(fecha);
CREATE INDEX IF NOT EXISTS ix_ventas_cliente ON ventas(cliente_id);
CREATE INDEX IF NOT EXISTS ix_ventas_estado_entrega ON ventas(estado_entrega);
CREATE INDEX IF NOT EXISTS ix_ventas_deposito ON ventas(deposito_id);
CREATE INDEX IF NOT EXISTS ix_ventas_oculto ON ventas(oculto);

CREATE TABLE IF NOT EXISTS ventas_detalle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario REAL NOT NULL CHECK (precio_unitario >= 0),
  subtotal REAL NOT NULL CHECK (subtotal >= 0)
);
CREATE INDEX IF NOT EXISTS ix_ventas_detalle_venta ON ventas_detalle(venta_id);
CREATE INDEX IF NOT EXISTS ix_ventas_detalle_producto ON ventas_detalle(producto_id);

CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER REFERENCES ventas(id) ON DELETE CASCADE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  monto REAL NOT NULL CHECK (monto > 0),
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metodo TEXT NOT NULL DEFAULT 'efectivo' CHECK (metodo IN ('efectivo','transferencia','tarjeta','otro')),
  fecha_limite TEXT
);
CREATE INDEX IF NOT EXISTS ix_pagos_venta ON pagos(venta_id);
CREATE INDEX IF NOT EXISTS ix_pagos_cliente ON pagos(cliente_id);
CREATE INDEX IF NOT EXISTS ix_pagos_fecha ON pagos(fecha);

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

CREATE TABLE IF NOT EXISTS pagos_proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  monto REAL NOT NULL CHECK (monto > 0),
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metodo TEXT NOT NULL DEFAULT 'transferencia' CHECK (metodo IN ('efectivo','transferencia','tarjeta','otro'))
);
CREATE INDEX IF NOT EXISTS ix_pagos_proveedores_compra ON pagos_proveedores(compra_id);
CREATE INDEX IF NOT EXISTS ix_pagos_proveedores_proveedor ON pagos_proveedores(proveedor_id);
CREATE INDEX IF NOT EXISTS ix_pagos_proveedores_fecha ON pagos_proveedores(fecha);

CREATE TABLE IF NOT EXISTS facturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL UNIQUE REFERENCES ventas(id) ON DELETE CASCADE,
  numero_factura TEXT NOT NULL UNIQUE,
  fecha_emision TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  comprobante_pdf_url TEXT
);

CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descripcion TEXT NOT NULL,
  monto REAL NOT NULL CHECK (monto >= 0),
  categoria TEXT,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_gastos_fecha ON gastos(fecha);

CREATE TABLE IF NOT EXISTS inversiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descripcion TEXT NOT NULL,
  monto REAL NOT NULL CHECK (monto >= 0),
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tipo TEXT NOT NULL DEFAULT 'capex'
);

CREATE TABLE IF NOT EXISTS configuracion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT NOT NULL UNIQUE,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS presupuestos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anio INTEGER NOT NULL CHECK (anio >= 2000),
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  tipo TEXT NOT NULL CHECK (tipo IN ('ventas','gastos','otros')),
  categoria TEXT NOT NULL,
  monto REAL NOT NULL CHECK (monto >= 0),
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_presupuestos_mes ON presupuestos(anio, mes, tipo, categoria);

CREATE TABLE IF NOT EXISTS crm_oportunidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  titulo TEXT NOT NULL,
  fase TEXT NOT NULL DEFAULT 'lead' CHECK (fase IN ('lead','contacto','propuesta','negociacion','ganado','perdido')),
  valor_estimado REAL DEFAULT 0 CHECK (valor_estimado >= 0),
  probabilidad INTEGER DEFAULT 0 CHECK (probabilidad BETWEEN 0 AND 100),
  fecha_cierre_estimada TEXT,
  owner_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  notas TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  oculto INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_crm_op_cliente ON crm_oportunidades(cliente_id);
CREATE INDEX IF NOT EXISTS ix_crm_op_fase ON crm_oportunidades(fase);
CREATE INDEX IF NOT EXISTS ix_crm_op_owner ON crm_oportunidades(owner_usuario_id);
CREATE INDEX IF NOT EXISTS ix_crm_op_oculto ON crm_oportunidades(oculto);

CREATE TABLE IF NOT EXISTS crm_actividades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  oportunidad_id INTEGER REFERENCES crm_oportunidades(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('llamada','reunion','tarea')),
  asunto TEXT NOT NULL,
  descripcion TEXT,
  fecha_hora TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','completado','cancelado')),
  asignado_a_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_crm_act_cliente ON crm_actividades(cliente_id);
CREATE INDEX IF NOT EXISTS ix_crm_act_oportunidad ON crm_actividades(oportunidad_id);
CREATE INDEX IF NOT EXISTS ix_crm_act_estado ON crm_actividades(estado);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  asunto TEXT NOT NULL,
  descripcion TEXT,
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','en_progreso','resuelto','cerrado')),
  prioridad TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta','critica')),
  tipo TEXT NOT NULL DEFAULT 'soporte' CHECK (tipo IN ('reclamo','garantia','devolucion','soporte')),
  asignado_a_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  venta_id INTEGER REFERENCES ventas(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrado_en TEXT
);
CREATE INDEX IF NOT EXISTS ix_tickets_cliente ON tickets(cliente_id);
CREATE INDEX IF NOT EXISTS ix_tickets_estado ON tickets(estado);
CREATE INDEX IF NOT EXISTS ix_tickets_prioridad ON tickets(prioridad);

CREATE TABLE IF NOT EXISTS ticket_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('comentario','cambio_estado','asignacion','adjunto')),
  detalle TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ticket_eventos_ticket ON ticket_eventos(ticket_id);

CREATE TABLE IF NOT EXISTS reglas_aprobacion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  condicion TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aprobaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regla_id INTEGER NOT NULL REFERENCES reglas_aprobacion(id) ON DELETE RESTRICT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado')),
  solicitado_por_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  aprobado_por_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  entidad TEXT,
  entidad_id INTEGER,
  motivo TEXT,
  payload TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resuelto_en TEXT
);
CREATE INDEX IF NOT EXISTS ix_aprobaciones_estado ON aprobaciones(estado);
CREATE INDEX IF NOT EXISTS ix_aprobaciones_regla ON aprobaciones(regla_id);
CREATE INDEX IF NOT EXISTS ix_aprobaciones_entidad ON aprobaciones(entidad, entidad_id);

CREATE TABLE IF NOT EXISTS aprobaciones_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aprobacion_id INTEGER NOT NULL REFERENCES aprobaciones(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  accion TEXT NOT NULL CHECK (accion IN ('creado','aprobado','rechazado','comentario')),
  notas TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_aprob_hist_aprob ON aprobaciones_historial(aprobacion_id);

INSERT OR IGNORE INTO reglas_aprobacion(clave, descripcion, condicion, activo)
VALUES ('product_price_update', 'Aprobar cambios de precio de producto que superen el umbral porcentual', '{"percent_threshold": 10}', 1);

CREATE TABLE IF NOT EXISTS Products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  order_number TEXT UNIQUE,
  buyer_code TEXT,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT,
  buyer_phone TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PAID',
  order_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS OrderItems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES Orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES Products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0)
);

CREATE VIEW IF NOT EXISTS vista_deudas AS
WITH ventas_pendientes AS (
  SELECT
    v.id AS venta_id,
    v.cliente_id AS cliente_id,
    date(v.fecha) AS fecha_venta,
    v.neto AS neto,
    COALESCE(SUM(p.monto), 0) AS total_pagado,
    (v.neto - COALESCE(SUM(p.monto), 0)) AS saldo
  FROM ventas v
  LEFT JOIN pagos p ON p.venta_id = v.id
  WHERE v.estado_pago <> 'cancelado'
  GROUP BY v.id, v.cliente_id, date(v.fecha), v.neto
),
vp_con_dias AS (
  SELECT
    cliente_id,
    saldo,
    CAST(MAX(0, julianday('now') - julianday(fecha_venta)) AS INTEGER) AS dias
  FROM ventas_pendientes
  WHERE saldo > 0
),
deudas_iniciales AS (
  SELECT
    d.cliente_id,
    d.monto AS saldo,
    CAST(MAX(0, julianday('now') - julianday(date(d.fecha))) AS INTEGER) AS dias
  FROM clientes_deudas_iniciales d
  WHERE d.monto > 0
),
pagos_deudas_iniciales AS (
  SELECT
    p.cliente_id,
    (p.monto * -1) AS saldo,
    CAST(MAX(0, julianday('now') - julianday(date(p.fecha))) AS INTEGER) AS dias
  FROM clientes_deudas_iniciales_pagos p
  WHERE p.monto > 0
),
pagos_cuenta_corriente AS (
  SELECT
    p.cliente_id,
    (p.monto * -1) AS saldo,
    CAST(MAX(0, julianday('now') - julianday(date(p.fecha))) AS INTEGER) AS dias
  FROM pagos p
  WHERE p.venta_id IS NULL
),
todas_deudas AS (
  SELECT * FROM vp_con_dias
  UNION ALL
  SELECT * FROM deudas_iniciales
  UNION ALL
  SELECT * FROM pagos_deudas_iniciales
  UNION ALL
  SELECT * FROM pagos_cuenta_corriente
)
SELECT
  c.id AS cliente_id,
  CASE WHEN COALESCE(SUM(td.saldo), 0) < 0 THEN 0 ELSE COALESCE(SUM(td.saldo), 0) END AS deuda_pendiente,
  CASE WHEN COALESCE(SUM(CASE WHEN td.dias BETWEEN 0 AND 30 THEN td.saldo ELSE 0 END), 0) < 0
    THEN 0 ELSE COALESCE(SUM(CASE WHEN td.dias BETWEEN 0 AND 30 THEN td.saldo ELSE 0 END), 0) END AS deuda_0_30,
  CASE WHEN COALESCE(SUM(CASE WHEN td.dias BETWEEN 31 AND 60 THEN td.saldo ELSE 0 END), 0) < 0
    THEN 0 ELSE COALESCE(SUM(CASE WHEN td.dias BETWEEN 31 AND 60 THEN td.saldo ELSE 0 END), 0) END AS deuda_31_60,
  CASE WHEN COALESCE(SUM(CASE WHEN td.dias BETWEEN 61 AND 90 THEN td.saldo ELSE 0 END), 0) < 0
    THEN 0 ELSE COALESCE(SUM(CASE WHEN td.dias BETWEEN 61 AND 90 THEN td.saldo ELSE 0 END), 0) END AS deuda_61_90,
  CASE WHEN COALESCE(SUM(CASE WHEN td.dias > 90 THEN td.saldo ELSE 0 END), 0) < 0
    THEN 0 ELSE COALESCE(SUM(CASE WHEN td.dias > 90 THEN td.saldo ELSE 0 END), 0) END AS deuda_mas_90,
  CASE
    WHEN SUM(CASE WHEN td.saldo > 0 THEN 1 ELSE 0 END) > 0
      THEN ROUND(AVG(CASE WHEN td.saldo > 0 THEN td.dias END), 2)
    ELSE NULL
  END AS dias_promedio_atraso
FROM clientes c
LEFT JOIN todas_deudas td ON td.cliente_id = c.id
GROUP BY c.id;

CREATE VIEW IF NOT EXISTS vista_deudas_proveedores AS
WITH compras_resumen AS (
  SELECT
    proveedor_id,
    SUM(CASE WHEN estado <> 'cancelado' THEN total_costo ELSE 0 END) AS total_compras
  FROM compras
  GROUP BY proveedor_id
), pagos_resumen AS (
  SELECT
    proveedor_id,
    SUM(monto) AS total_pagos
  FROM pagos_proveedores
  GROUP BY proveedor_id
)
SELECT
  pr.id AS proveedor_id,
  COALESCE(c.total_compras, 0) - COALESCE(p.total_pagos, 0) AS deuda_pendiente
FROM proveedores pr
LEFT JOIN compras_resumen c ON c.proveedor_id = pr.id
LEFT JOIN pagos_resumen p ON p.proveedor_id = pr.id;

CREATE VIEW IF NOT EXISTS vista_stock_bajo AS
SELECT pr.id AS producto_id,
       pr.codigo,
       pr.nombre,
       i.cantidad_disponible,
       pr.stock_minimo
FROM productos pr
JOIN inventario i ON i.producto_id = pr.id
WHERE i.cantidad_disponible < pr.stock_minimo
  AND pr.activo = 1;

CREATE VIEW IF NOT EXISTS vista_top_clientes AS
SELECT c.id AS cliente_id,
       c.nombre,
       c.apellido,
       SUM(v.neto) AS total_comprado
FROM clientes c
JOIN ventas v ON v.cliente_id = c.id AND v.estado_pago <> 'cancelado'
GROUP BY c.id, c.nombre, c.apellido
ORDER BY total_comprado DESC;

CREATE VIEW IF NOT EXISTS vista_ganancias_mensuales AS
WITH ventas_m AS (
  SELECT strftime('%Y-%m-01', fecha) AS mes, SUM(neto) AS total_ventas
  FROM ventas
  WHERE estado_pago <> 'cancelado'
  GROUP BY 1
), gastos_m AS (
  SELECT strftime('%Y-%m-01', fecha) AS mes, SUM(monto) AS total_gastos
  FROM gastos
  GROUP BY 1
), meses AS (
  SELECT mes FROM ventas_m
  UNION
  SELECT mes FROM gastos_m
)
SELECT m.mes AS mes,
       COALESCE(v.total_ventas, 0) AS total_ventas,
       COALESCE(g.total_gastos, 0) AS total_gastos,
       COALESCE(v.total_ventas, 0) - COALESCE(g.total_gastos, 0) AS ganancia_neta
FROM meses m
LEFT JOIN ventas_m v ON v.mes = m.mes
LEFT JOIN gastos_m g ON g.mes = m.mes
ORDER BY m.mes;

CREATE VIEW IF NOT EXISTS vista_costos_productos AS
SELECT
  c.id AS compra_id,
  date(c.fecha) AS fecha,
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

CREATE VIEW IF NOT EXISTS vista_ventas_productos AS
SELECT
  v.id AS venta_id,
  date(v.fecha) AS fecha,
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
