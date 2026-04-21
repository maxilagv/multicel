-- PostgreSQL schema for sistemas-de-gestion
-- Normalized relational model with referential integrity, auditing, and indexes

BEGIN;

-- Helper: updated_at trigger
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2.1 Usuarios y roles
CREATE TABLE IF NOT EXISTS roles (
  id           BIGSERIAL PRIMARY KEY,
  nombre       VARCHAR(50) NOT NULL UNIQUE,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
    id             BIGSERIAL PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL,
    email          VARCHAR(255) NOT NULL,
    password_hash  TEXT NOT NULL,
    rol_id         BIGINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    caja_tipo_default VARCHAR(20) NOT NULL DEFAULT 'sucursal' CHECK (caja_tipo_default IN ('home_office','sucursal')),
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

-- Case-insensitive unique email
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email_ci ON usuarios (LOWER(email));
CREATE INDEX IF NOT EXISTS ix_usuarios_rol ON usuarios(rol_id);

CREATE TRIGGER set_updated_at_usuarios
BEFORE UPDATE ON usuarios
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE IF NOT EXISTS logs (
  id              BIGSERIAL PRIMARY KEY,
  usuario_id      BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  accion          VARCHAR(50) NOT NULL,
  tabla_afectada  VARCHAR(100) NOT NULL,
  registro_id     BIGINT,
  descripcion     TEXT,
  fecha_hora      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
  CREATE INDEX IF NOT EXISTS ix_logs_usuario ON logs(usuario_id);
  CREATE INDEX IF NOT EXISTS ix_logs_fecha ON logs(fecha_hora);
  
  -- Permisos por depósitο (multidepósito)
  CREATE TABLE IF NOT EXISTS usuarios_depositos (
    usuario_id      BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    deposito_id     BIGINT NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
    rol_deposito    VARCHAR(20) NOT NULL DEFAULT 'operador'
                    CHECK (rol_deposito IN ('operador','visor','admin')),
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (usuario_id, deposito_id)
  );
  CREATE INDEX IF NOT EXISTS ix_usuarios_depositos_deposito ON usuarios_depositos(deposito_id);
  
-- 2.1.b Parámetros de sistema (incluye dólar blue)
CREATE TABLE IF NOT EXISTS parametros_sistema (
  clave          VARCHAR(100) PRIMARY KEY,
  valor_texto    TEXT,
  valor_num      DECIMAL(18,4),
  descripcion    TEXT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_id     BIGINT REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_parametros_sistema_usuario ON parametros_sistema(usuario_id);

-- 2.1.c Cola de sincronizacion (cloud)
CREATE TABLE IF NOT EXISTS sync_queue (
  id            BIGSERIAL PRIMARY KEY,
  entity        VARCHAR(80) NOT NULL,
  entity_id     BIGINT,
  action        VARCHAR(40) NOT NULL,
  payload       TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','error')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS ix_sync_queue_entity ON sync_queue(entity, entity_id);
CREATE INDEX IF NOT EXISTS ix_sync_queue_created ON sync_queue(created_at);

  -- 2.2 Clientes y proveedores
  -- Zonas de clientes
  CREATE TABLE IF NOT EXISTS zonas (
    id             BIGSERIAL PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL UNIQUE,
    color_hex      VARCHAR(16) NOT NULL DEFAULT '#64748B',
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS ix_zonas_activo ON zonas(activo);
  
  CREATE TABLE IF NOT EXISTS zonas_localidades (
    id          BIGSERIAL PRIMARY KEY,
    localidad   VARCHAR(120) NOT NULL,
    zona_id     BIGINT NOT NULL REFERENCES zonas(id) ON DELETE CASCADE,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (localidad, zona_id)
  );
  CREATE INDEX IF NOT EXISTS ix_zonas_localidad ON zonas_localidades(localidad);
  
  CREATE TABLE IF NOT EXISTS clientes (
    id              BIGSERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    apellido        VARCHAR(100),
    telefono        VARCHAR(50),
    email           VARCHAR(255),
    direccion       TEXT,
    cuit_cuil       VARCHAR(20),
    tipo_doc        VARCHAR(20),
    nro_doc         VARCHAR(30),
    condicion_iva   VARCHAR(40),
    domicilio_fiscal TEXT,
    provincia       VARCHAR(80),
    localidad       VARCHAR(80),
    codigo_postal   VARCHAR(20),
    zona_id         BIGINT REFERENCES zonas(id) ON DELETE SET NULL,
    fecha_registro  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    estado          VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo'))
  );
  CREATE INDEX IF NOT EXISTS ix_clientes_nombre ON clientes(nombre);
  CREATE INDEX IF NOT EXISTS ix_clientes_apellido ON clientes(apellido);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_cuit ON clientes(cuit_cuil) WHERE cuit_cuil IS NOT NULL;
  CREATE INDEX IF NOT EXISTS ix_clientes_zona ON clientes(zona_id);
  
-- Deudas iniciales (históricas) por cliente
CREATE TABLE IF NOT EXISTS clientes_deudas_iniciales (
  id          BIGSERIAL PRIMARY KEY,
  cliente_id  BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  monto       DECIMAL(12,2) NOT NULL CHECK (monto >= 0),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  descripcion TEXT
);
CREATE INDEX IF NOT EXISTS ix_clientes_deudas_cliente ON clientes_deudas_iniciales(cliente_id);
CREATE INDEX IF NOT EXISTS ix_clientes_deudas_fecha ON clientes_deudas_iniciales(fecha);

CREATE TABLE IF NOT EXISTS clientes_deudas_iniciales_pagos (
  id          BIGSERIAL PRIMARY KEY,
  cliente_id  BIGINT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  monto       DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  descripcion TEXT
);
CREATE INDEX IF NOT EXISTS ix_clientes_deudas_ini_pagos_cliente ON clientes_deudas_iniciales_pagos(cliente_id);
CREATE INDEX IF NOT EXISTS ix_clientes_deudas_ini_pagos_fecha ON clientes_deudas_iniciales_pagos(fecha);

CREATE TABLE IF NOT EXISTS proveedores (
  id              BIGSERIAL PRIMARY KEY,
  nombre          VARCHAR(150) NOT NULL,
  email           VARCHAR(255),
  telefono        VARCHAR(50),
  direccion       TEXT,
  cuit_cuil       VARCHAR(20),
  fecha_registro  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_proveedores_cuit ON proveedores(cuit_cuil) WHERE cuit_cuil IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_proveedores_nombre ON proveedores(nombre);

-- 2.3 Categorías de productos
CREATE TABLE IF NOT EXISTS categorias (
  id          BIGSERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  imagen_url  TEXT,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_categorias_activo ON categorias(activo);

-- 2.4 Productos e imágenes
CREATE TABLE IF NOT EXISTS productos (
  id             BIGSERIAL PRIMARY KEY,
  codigo         VARCHAR(50) NOT NULL,
  nombre         VARCHAR(200) NOT NULL,
  descripcion    TEXT,
  categoria_id   BIGINT NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  precio_costo   DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (precio_costo >= 0),
  precio_venta   DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (precio_venta >= 0),
  iva_alicuota   DECIMAL(5,2) NOT NULL DEFAULT 21.00 CHECK (iva_alicuota >= 0),
  precio_costo_pesos   DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (precio_costo_pesos >= 0),
  precio_costo_dolares DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (precio_costo_dolares >= 0),
  tipo_cambio          DECIMAL(12,4),
    margen_local         DECIMAL(5,2) NOT NULL DEFAULT 0.15 CHECK (margen_local >= 0),
    margen_distribuidor  DECIMAL(5,2) NOT NULL DEFAULT 0.45 CHECK (margen_distribuidor >= 0),
    precio_local         DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (precio_local >= 0),
    precio_distribuidor  DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (precio_distribuidor >= 0),
    comision_pct         DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (comision_pct >= 0 AND comision_pct <= 100),
    precio_modo          VARCHAR(10) NOT NULL DEFAULT 'auto' CHECK (precio_modo IN ('auto','manual')),
    proveedor_id         BIGINT REFERENCES proveedores(id) ON DELETE SET NULL,
  stock_minimo   INTEGER NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  stock_maximo   INTEGER CHECK (stock_maximo IS NULL OR stock_maximo >= 0),
  reorden        INTEGER NOT NULL DEFAULT 0 CHECK (reorden >= 0),
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_codigo ON productos(codigo);
CREATE INDEX IF NOT EXISTS ix_productos_nombre ON productos(nombre);
CREATE INDEX IF NOT EXISTS ix_productos_categoria ON productos(categoria_id);

CREATE TRIGGER set_updated_at_productos
BEFORE UPDATE ON productos
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE IF NOT EXISTS producto_imagenes (
  id           BIGSERIAL PRIMARY KEY,
  producto_id  BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  orden        INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_imagenes_orden ON producto_imagenes(producto_id, orden);

CREATE TABLE IF NOT EXISTS productos_historial (
  id                  BIGSERIAL PRIMARY KEY,
  producto_id         BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  proveedor_id        BIGINT REFERENCES proveedores(id) ON DELETE SET NULL,
  fecha               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  costo_pesos         DECIMAL(12,2) CHECK (costo_pesos >= 0),
  costo_dolares       DECIMAL(12,2) CHECK (costo_dolares >= 0),
  tipo_cambio         DECIMAL(12,4),
  margen_local        DECIMAL(5,2),
  margen_distribuidor DECIMAL(5,2),
  precio_local        DECIMAL(12,2),
  precio_distribuidor DECIMAL(12,2),
  usuario_id          BIGINT REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_productos_historial_producto ON productos_historial(producto_id);
CREATE INDEX IF NOT EXISTS ix_productos_historial_fecha ON productos_historial(fecha);

-- 2.5 Depósitos e inventario

CREATE TABLE IF NOT EXISTS depositos (
  id             BIGSERIAL PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL UNIQUE,
  codigo         VARCHAR(50) UNIQUE,
  direccion      TEXT,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_depositos_activo ON depositos(activo);

CREATE TABLE IF NOT EXISTS inventario (
  id                   BIGSERIAL PRIMARY KEY,
  producto_id          BIGINT NOT NULL UNIQUE REFERENCES productos(id) ON DELETE CASCADE,
  cantidad_disponible  INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_disponible >= 0),
  cantidad_reservada   INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_reservada >= 0),
  creado_en            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_inventario_producto ON inventario(producto_id);

CREATE TABLE IF NOT EXISTS inventario_depositos (
  id                   BIGSERIAL PRIMARY KEY,
  producto_id          BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  deposito_id          BIGINT NOT NULL REFERENCES depositos(id) ON DELETE RESTRICT,
  cantidad_disponible  INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_disponible >= 0),
  cantidad_reservada   INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_reservada >= 0),
  creado_en            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventario_depositos
  ADD CONSTRAINT uq_inventario_depositos_producto_deposito
  UNIQUE (producto_id, deposito_id);

CREATE INDEX IF NOT EXISTS ix_inv_dep_producto ON inventario_depositos(producto_id);
CREATE INDEX IF NOT EXISTS ix_inv_dep_deposito ON inventario_depositos(deposito_id);

-- Movimientos y ajustes de stock
CREATE TABLE IF NOT EXISTS movimientos_stock (
  id          BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  deposito_id BIGINT REFERENCES depositos(id) ON DELETE SET NULL,
  tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada','salida')),
  cantidad    INTEGER NOT NULL CHECK (cantidad > 0),
  motivo      VARCHAR(100) NOT NULL,
  referencia  VARCHAR(100),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_id  BIGINT REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_movimientos_producto ON movimientos_stock(producto_id);
CREATE INDEX IF NOT EXISTS ix_movimientos_fecha ON movimientos_stock(fecha);
CREATE INDEX IF NOT EXISTS ix_movimientos_tipo ON movimientos_stock(tipo);
CREATE INDEX IF NOT EXISTS ix_movimientos_deposito ON movimientos_stock(deposito_id);

CREATE TABLE IF NOT EXISTS stock_ajustes (
  id          BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad    INTEGER NOT NULL,
  motivo      TEXT NOT NULL,
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_ajustes_producto ON stock_ajustes(producto_id);
CREATE INDEX IF NOT EXISTS ix_ajustes_fecha ON stock_ajustes(fecha);

-- 2.6 Compras e importaciones
CREATE TABLE IF NOT EXISTS compras (
  id           BIGSERIAL PRIMARY KEY,
  proveedor_id BIGINT NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  fecha        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_costo  DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (total_costo >= 0),
  moneda       VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (moneda IN ('ARS','USD','CNY')),
  estado       VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','recibido','cancelado')),
  oc_numero    VARCHAR(100),
  adjunto_url  TEXT
);
CREATE INDEX IF NOT EXISTS ix_compras_fecha ON compras(fecha);
CREATE INDEX IF NOT EXISTS ix_compras_proveedor ON compras(proveedor_id);

CREATE TABLE IF NOT EXISTS compras_detalle (
  id             BIGSERIAL PRIMARY KEY,
  compra_id      BIGINT NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id    BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad       INTEGER NOT NULL CHECK (cantidad > 0),
  cantidad_recibida INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0),
  costo_unitario DECIMAL(12,2) NOT NULL CHECK (costo_unitario >= 0),
  costo_envio    DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (costo_envio >= 0),
  subtotal       DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0),
  moneda         VARCHAR(3) CHECK (moneda IN ('ARS','USD','CNY')),
  tipo_cambio    DECIMAL(12,4) CHECK (tipo_cambio IS NULL OR tipo_cambio > 0)
);
CREATE INDEX IF NOT EXISTS ix_compras_detalle_compra ON compras_detalle(compra_id);
CREATE INDEX IF NOT EXISTS ix_compras_detalle_producto ON compras_detalle(producto_id);

CREATE TABLE IF NOT EXISTS recepciones (
  id               BIGSERIAL PRIMARY KEY,
  compra_id        BIGINT NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  fecha_recepcion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observaciones    TEXT,
  deposito_id      BIGINT REFERENCES depositos(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_recepciones_compra ON recepciones(compra_id);
CREATE INDEX IF NOT EXISTS ix_recepciones_deposito ON recepciones(deposito_id);

CREATE TABLE IF NOT EXISTS recepciones_detalle (
  id            BIGSERIAL PRIMARY KEY,
  recepcion_id  BIGINT NOT NULL REFERENCES recepciones(id) ON DELETE CASCADE,
  producto_id   BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad      INTEGER NOT NULL CHECK (cantidad > 0)
);
CREATE INDEX IF NOT EXISTS ix_recepciones_detalle_recepcion ON recepciones_detalle(recepcion_id);
CREATE INDEX IF NOT EXISTS ix_recepciones_detalle_producto ON recepciones_detalle(producto_id);

-- 2.7 Ventas
CREATE TABLE IF NOT EXISTS ventas (
  id           BIGSERIAL PRIMARY KEY,
  cliente_id   BIGINT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  fecha        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total        DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  descuento    DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  impuestos    DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (impuestos >= 0),
  neto         DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (neto >= 0),
  estado_pago  VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente','pagada','cancelado')),
    estado_entrega VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado_entrega IN ('pendiente','entregado')),
    fecha_entrega TIMESTAMPTZ,
    observaciones TEXT,
    deposito_id   BIGINT REFERENCES depositos(id) ON DELETE SET NULL,
    caja_tipo     VARCHAR(20) NOT NULL DEFAULT 'sucursal' CHECK (caja_tipo IN ('home_office','sucursal')),
    usuario_id    BIGINT REFERENCES usuarios(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS ix_ventas_fecha ON ventas(fecha);
  CREATE INDEX IF NOT EXISTS ix_ventas_cliente ON ventas(cliente_id);
  CREATE INDEX IF NOT EXISTS ix_ventas_estado_entrega ON ventas(estado_entrega);
  CREATE INDEX IF NOT EXISTS ix_ventas_deposito ON ventas(deposito_id);
  CREATE INDEX IF NOT EXISTS ix_ventas_usuario ON ventas(usuario_id);
  CREATE INDEX IF NOT EXISTS ix_ventas_caja_tipo ON ventas(caja_tipo);

CREATE TABLE IF NOT EXISTS ventas_detalle (
  id              BIGSERIAL PRIMARY KEY,
  venta_id        BIGINT NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id     BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario DECIMAL(12,2) NOT NULL CHECK (precio_unitario >= 0),
    subtotal        DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0),
    base_sin_iva    DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (base_sin_iva >= 0),
    comision_pct    DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (comision_pct >= 0 AND comision_pct <= 100),
    comision_monto  DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (comision_monto >= 0),
    costo_unitario_pesos DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (costo_unitario_pesos >= 0)
  );
CREATE INDEX IF NOT EXISTS ix_ventas_detalle_venta ON ventas_detalle(venta_id);
CREATE INDEX IF NOT EXISTS ix_ventas_detalle_producto ON ventas_detalle(producto_id);

CREATE TABLE IF NOT EXISTS pagos (
  id          BIGSERIAL PRIMARY KEY,
  venta_id    BIGINT REFERENCES ventas(id) ON DELETE CASCADE,
  cliente_id  BIGINT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  monto       DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metodo      VARCHAR(20) NOT NULL DEFAULT 'efectivo' CHECK (metodo IN ('efectivo','transferencia','tarjeta','otro')),
  fecha_limite TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_pagos_venta ON pagos(venta_id);
CREATE INDEX IF NOT EXISTS ix_pagos_cliente ON pagos(cliente_id);
CREATE INDEX IF NOT EXISTS ix_pagos_fecha ON pagos(fecha);

-- Metodos de pago configurables + desglose por pago
CREATE TABLE IF NOT EXISTS metodos_pago (
  id            BIGSERIAL PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL UNIQUE,
  moneda        VARCHAR(5),
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  orden         INTEGER NOT NULL DEFAULT 0,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_metodos_pago_activo ON metodos_pago(activo);
CREATE INDEX IF NOT EXISTS ix_metodos_pago_orden ON metodos_pago(orden);

CREATE TABLE IF NOT EXISTS pagos_metodos (
  id         BIGSERIAL PRIMARY KEY,
  pago_id    BIGINT NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
  metodo_id  BIGINT NOT NULL REFERENCES metodos_pago(id) ON DELETE RESTRICT,
  monto      DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  moneda     VARCHAR(5)
);
CREATE INDEX IF NOT EXISTS ix_pagos_metodos_pago ON pagos_metodos(pago_id);
CREATE INDEX IF NOT EXISTS ix_pagos_metodos_metodo ON pagos_metodos(metodo_id);

CREATE TABLE IF NOT EXISTS pagos_proveedores (
  id            BIGSERIAL PRIMARY KEY,
  compra_id     BIGINT NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  proveedor_id  BIGINT NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  monto         DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metodo        VARCHAR(20) NOT NULL DEFAULT 'transferencia' CHECK (metodo IN ('efectivo','transferencia','tarjeta','otro'))
);
CREATE INDEX IF NOT EXISTS ix_pagos_proveedores_compra ON pagos_proveedores(compra_id);
CREATE INDEX IF NOT EXISTS ix_pagos_proveedores_proveedor ON pagos_proveedores(proveedor_id);
CREATE INDEX IF NOT EXISTS ix_pagos_proveedores_fecha ON pagos_proveedores(fecha);

-- 2.7.b Sueldos y comisiones de vendedores
CREATE TABLE IF NOT EXISTS vendedores_comisiones (
  id             BIGSERIAL PRIMARY KEY,
  usuario_id     BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  periodo        VARCHAR(10) NOT NULL CHECK (periodo IN ('dia','semana','mes')),
  porcentaje     DECIMAL(5,2) NOT NULL CHECK (porcentaje >= 0),
  base_tipo      VARCHAR(20) NOT NULL DEFAULT 'bruto' CHECK (base_tipo IN ('bruto','neto')),
  vigencia_desde DATE NOT NULL DEFAULT CURRENT_DATE,
  vigencia_hasta DATE,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_vendedores_comisiones_usuario ON vendedores_comisiones(usuario_id);
CREATE INDEX IF NOT EXISTS ix_vendedores_comisiones_periodo ON vendedores_comisiones(periodo);
CREATE INDEX IF NOT EXISTS ix_vendedores_comisiones_vigencia ON vendedores_comisiones(vigencia_desde, vigencia_hasta);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendedores_comisiones_activa ON vendedores_comisiones(usuario_id, periodo) WHERE activo = TRUE;

CREATE TRIGGER set_updated_at_vendedores_comisiones
BEFORE UPDATE ON vendedores_comisiones
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE IF NOT EXISTS vendedores_pagos (
  id             BIGSERIAL PRIMARY KEY,
  usuario_id     BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  periodo        VARCHAR(10) NOT NULL CHECK (periodo IN ('dia','semana','mes')),
  desde          DATE NOT NULL,
  hasta          DATE NOT NULL,
  ventas_total   DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (ventas_total >= 0),
  porcentaje     DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (porcentaje >= 0),
  monto_calculado DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (monto_calculado >= 0),
  monto_pagado   DECIMAL(12,2) NOT NULL CHECK (monto_pagado > 0),
  fecha_pago     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metodo         VARCHAR(20),
  notas          TEXT,
  usuario_registro BIGINT REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_vendedores_pagos_usuario ON vendedores_pagos(usuario_id);
CREATE INDEX IF NOT EXISTS ix_vendedores_pagos_periodo ON vendedores_pagos(periodo);
CREATE INDEX IF NOT EXISTS ix_vendedores_pagos_rango ON vendedores_pagos(desde, hasta);
CREATE INDEX IF NOT EXISTS ix_vendedores_pagos_fecha ON vendedores_pagos(fecha_pago);

CREATE TABLE IF NOT EXISTS facturas (
  id                  BIGSERIAL PRIMARY KEY,
  venta_id            BIGINT NOT NULL UNIQUE REFERENCES ventas(id) ON DELETE CASCADE,
  numero_factura      VARCHAR(50) NOT NULL UNIQUE,
  fecha_emision       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comprobante_pdf_url TEXT,
  tipo_comprobante    VARCHAR(20),
  punto_venta         INTEGER,
  cae                 VARCHAR(40),
  cae_vto             VARCHAR(20),
  estado              VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  error               TEXT,
  total               DECIMAL(12,2),
  moneda              VARCHAR(3) NOT NULL DEFAULT 'PES',
  qr_data             TEXT,
  response_json       JSONB,
  concepto            INTEGER,
  doc_tipo            INTEGER,
  doc_nro             VARCHAR(30),
  imp_neto            DECIMAL(12,2),
  imp_iva             DECIMAL(12,2),
  imp_op_ex           DECIMAL(12,2),
  imp_trib            DECIMAL(12,2),
  imp_tot_conc        DECIMAL(12,2),
  mon_id              VARCHAR(5),
  mon_cotiz           DECIMAL(12,6),
  fecha_serv_desde    DATE,
  fecha_serv_hasta    DATE,
  fecha_vto_pago      DATE,
  snapshot_json       JSONB,
  request_hash        VARCHAR(120),
  intentos            INTEGER NOT NULL DEFAULT 0,
  ultimo_intento      TIMESTAMPTZ,
  usuario_id          BIGINT REFERENCES usuarios(id) ON DELETE SET NULL
);

-- 2.7.b Configuracion ARCA
CREATE TABLE IF NOT EXISTS arca_config (
  id               BIGSERIAL PRIMARY KEY,
  cuit             VARCHAR(20) NOT NULL UNIQUE,
  razon_social     VARCHAR(200),
  condicion_iva    VARCHAR(40),
  domicilio_fiscal TEXT,
  provincia        VARCHAR(80),
  localidad        VARCHAR(80),
  codigo_postal    VARCHAR(20),
  ambiente         VARCHAR(20) NOT NULL DEFAULT 'homologacion' CHECK (ambiente IN ('homologacion','produccion')),
  certificado_pem  TEXT,
  clave_privada_pem TEXT,
  passphrase_enc   TEXT,
  certificado_vto  VARCHAR(30),
  permitir_sin_entrega BOOLEAN NOT NULL DEFAULT FALSE,
  permitir_sin_pago   BOOLEAN NOT NULL DEFAULT FALSE,
  precios_incluyen_iva BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activo           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS arca_puntos_venta (
  id             BIGSERIAL PRIMARY KEY,
  arca_config_id BIGINT REFERENCES arca_config(id) ON DELETE CASCADE,
  punto_venta    INTEGER NOT NULL,
  nombre         VARCHAR(120),
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (arca_config_id, punto_venta)
);

CREATE TABLE IF NOT EXISTS arca_puntos_venta_depositos (
  id             BIGSERIAL PRIMARY KEY,
  punto_venta_id BIGINT NOT NULL REFERENCES arca_puntos_venta(id) ON DELETE CASCADE,
  deposito_id    BIGINT NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (deposito_id),
  UNIQUE (punto_venta_id, deposito_id)
);

CREATE TABLE IF NOT EXISTS arca_tokens (
  id             BIGSERIAL PRIMARY KEY,
  arca_config_id BIGINT REFERENCES arca_config(id) ON DELETE CASCADE,
  servicio       VARCHAR(60) NOT NULL,
  token          TEXT NOT NULL,
  sign           TEXT NOT NULL,
  expira_en      TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (arca_config_id, servicio)
);

CREATE TABLE IF NOT EXISTS arca_padron_cache (
  id             BIGSERIAL PRIMARY KEY,
  cuit           VARCHAR(20) NOT NULL UNIQUE,
  data_json      JSONB NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.8 Marketplace de confianza local
CREATE TABLE IF NOT EXISTS pymes_aliadas (
  id             BIGSERIAL PRIMARY KEY,
  nombre         VARCHAR(200) NOT NULL,
  rubro          VARCHAR(120),
  contacto       VARCHAR(120),
  telefono       VARCHAR(50),
  email          VARCHAR(255),
  direccion      TEXT,
  localidad      VARCHAR(120),
  provincia      VARCHAR(120),
  notas          TEXT,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  external_id    VARCHAR(120),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pymes_aliadas_external ON pymes_aliadas(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_pymes_aliadas_nombre ON pymes_aliadas(nombre);
CREATE INDEX IF NOT EXISTS ix_pymes_aliadas_activo ON pymes_aliadas(activo);

CREATE TABLE IF NOT EXISTS alianzas (
  id              BIGSERIAL PRIMARY KEY,
  pyme_id         BIGINT NOT NULL REFERENCES pymes_aliadas(id) ON DELETE RESTRICT,
  nombre          VARCHAR(200),
  estado          VARCHAR(20) NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','pausada','vencida')),
  vigencia_desde  TIMESTAMPTZ,
  vigencia_hasta  TIMESTAMPTZ,
  comision_tipo   VARCHAR(20) NOT NULL DEFAULT 'porcentaje' CHECK (comision_tipo IN ('porcentaje','monto')),
  comision_valor  DECIMAL(10,2) NOT NULL DEFAULT 0,
  beneficio_tipo  VARCHAR(20) NOT NULL DEFAULT 'porcentaje' CHECK (beneficio_tipo IN ('porcentaje','monto')),
  beneficio_valor DECIMAL(10,2) NOT NULL DEFAULT 0,
  limite_usos     INTEGER NOT NULL DEFAULT 0 CHECK (limite_usos >= 0),
  notas           TEXT,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  external_id     VARCHAR(120),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alianzas_external ON alianzas(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_alianzas_pyme ON alianzas(pyme_id);
CREATE INDEX IF NOT EXISTS ix_alianzas_estado ON alianzas(estado);
CREATE INDEX IF NOT EXISTS ix_alianzas_activo ON alianzas(activo);

CREATE TABLE IF NOT EXISTS alianzas_ofertas (
  id             BIGSERIAL PRIMARY KEY,
  alianza_id     BIGINT NOT NULL REFERENCES alianzas(id) ON DELETE CASCADE,
  nombre         VARCHAR(200) NOT NULL,
  descripcion    TEXT,
  precio_fijo    DECIMAL(12,2),
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  external_id    VARCHAR(120),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alianzas_ofertas_external ON alianzas_ofertas(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_alianzas_ofertas_alianza ON alianzas_ofertas(alianza_id);
CREATE INDEX IF NOT EXISTS ix_alianzas_ofertas_activo ON alianzas_ofertas(activo);

CREATE TABLE IF NOT EXISTS alianzas_ofertas_items (
  id          BIGSERIAL PRIMARY KEY,
  oferta_id   BIGINT NOT NULL REFERENCES alianzas_ofertas(id) ON DELETE CASCADE,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad    INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0)
);
CREATE INDEX IF NOT EXISTS ix_ofertas_items_oferta ON alianzas_ofertas_items(oferta_id);
CREATE INDEX IF NOT EXISTS ix_ofertas_items_producto ON alianzas_ofertas_items(producto_id);

CREATE TABLE IF NOT EXISTS referidos (
  id               BIGSERIAL PRIMARY KEY,
  alianza_id       BIGINT NOT NULL REFERENCES alianzas(id) ON DELETE CASCADE,
  codigo           VARCHAR(50) NOT NULL UNIQUE,
  estado           VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo','agotado','vencido')),
  max_usos         INTEGER NOT NULL DEFAULT 0 CHECK (max_usos >= 0),
  usos_actuales    INTEGER NOT NULL DEFAULT 0 CHECK (usos_actuales >= 0),
  vigencia_desde   TIMESTAMPTZ,
  vigencia_hasta   TIMESTAMPTZ,
  beneficio_tipo   VARCHAR(20) CHECK (beneficio_tipo IN ('porcentaje','monto')),
  beneficio_valor  DECIMAL(10,2),
  notas            TEXT,
  external_id      VARCHAR(120),
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_referidos_external ON referidos(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_referidos_alianza ON referidos(alianza_id);
CREATE INDEX IF NOT EXISTS ix_referidos_codigo ON referidos(codigo);
CREATE INDEX IF NOT EXISTS ix_referidos_estado ON referidos(estado);

CREATE TABLE IF NOT EXISTS uso_referidos (
  id                 BIGSERIAL PRIMARY KEY,
  referido_id        BIGINT NOT NULL REFERENCES referidos(id) ON DELETE CASCADE,
  venta_id           BIGINT NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  fecha              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_venta        DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento_aplicado DECIMAL(12,2) NOT NULL DEFAULT 0,
  comision_monto     DECIMAL(12,2) NOT NULL DEFAULT 0,
  usuario_id         BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  notas              TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_uso_referidos_venta ON uso_referidos(venta_id);
CREATE INDEX IF NOT EXISTS ix_uso_referidos_referido ON uso_referidos(referido_id);
CREATE INDEX IF NOT EXISTS ix_uso_referidos_fecha ON uso_referidos(fecha);

-- 2.9 Gastos e inversiones
CREATE TABLE IF NOT EXISTS gastos (
  id          BIGSERIAL PRIMARY KEY,
  descripcion TEXT NOT NULL,
  monto       DECIMAL(12,2) NOT NULL CHECK (monto >= 0),
  categoria   VARCHAR(100),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_gastos_fecha ON gastos(fecha);

CREATE TABLE IF NOT EXISTS inversiones (
  id          BIGSERIAL PRIMARY KEY,
  descripcion TEXT NOT NULL,
  monto       DECIMAL(12,2) NOT NULL CHECK (monto >= 0),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo        VARCHAR(50) NOT NULL DEFAULT 'capex'
);

-- 2.11 Configuración
CREATE TABLE IF NOT EXISTS configuracion (
  id     BIGSERIAL PRIMARY KEY,
  clave  VARCHAR(100) NOT NULL UNIQUE,
  valor  TEXT NOT NULL
);

-- 2.12 Presupuestos financieros
CREATE TABLE IF NOT EXISTS presupuestos (
  id             BIGSERIAL PRIMARY KEY,
  anio           INTEGER NOT NULL CHECK (anio >= 2000),
  mes            INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  tipo           VARCHAR(20) NOT NULL CHECK (tipo IN ('ventas','gastos','otros')),
  categoria      VARCHAR(100) NOT NULL,
  monto          DECIMAL(14,2) NOT NULL CHECK (monto >= 0),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_presupuestos_mes ON presupuestos(anio, mes, tipo, categoria);

CREATE TRIGGER set_updated_at_presupuestos
BEFORE UPDATE ON presupuestos
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- Vistas (2.8, 2.10)
CREATE OR REPLACE VIEW vista_deudas AS
WITH ventas_pendientes AS (
  SELECT
    v.id           AS venta_id,
    v.cliente_id   AS cliente_id,
    v.fecha::date  AS fecha_venta,
    v.neto         AS neto,
    COALESCE(SUM(p.monto), 0)::DECIMAL(12,2) AS total_pagado,
    (v.neto - COALESCE(SUM(p.monto), 0))::DECIMAL(12,2) AS saldo
  FROM ventas v
  LEFT JOIN pagos p ON p.venta_id = v.id
  WHERE v.estado_pago <> 'cancelado'
  GROUP BY v.id, v.cliente_id, v.fecha::date, v.neto
),
vp_con_dias AS (
  SELECT
    cliente_id,
    saldo,
    GREATEST(0, (CURRENT_DATE - fecha_venta))::INT AS dias
  FROM ventas_pendientes
  WHERE saldo > 0
),
deudas_iniciales AS (
  SELECT
    d.cliente_id,
    d.monto::DECIMAL(12,2) AS saldo,
    GREATEST(0, (CURRENT_DATE - d.fecha::date))::INT AS dias
  FROM clientes_deudas_iniciales d
  WHERE d.monto > 0
),
pagos_deudas_iniciales AS (
  SELECT
    p.cliente_id,
    (p.monto * -1)::DECIMAL(12,2) AS saldo,
    GREATEST(0, (CURRENT_DATE - p.fecha::date))::INT AS dias
  FROM clientes_deudas_iniciales_pagos p
  WHERE p.monto > 0
),
pagos_cuenta_corriente AS (
  SELECT
    p.cliente_id,
    (p.monto * -1)::DECIMAL(12,2) AS saldo,
    GREATEST(0, (CURRENT_DATE - p.fecha::date))::INT AS dias
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
  GREATEST(COALESCE(SUM(td.saldo), 0), 0)::DECIMAL(12,2) AS deuda_pendiente,
  GREATEST(COALESCE(SUM(CASE WHEN td.dias BETWEEN 0 AND 30 THEN td.saldo ELSE 0 END), 0), 0)::DECIMAL(12,2) AS deuda_0_30,
  GREATEST(COALESCE(SUM(CASE WHEN td.dias BETWEEN 31 AND 60 THEN td.saldo ELSE 0 END), 0), 0)::DECIMAL(12,2) AS deuda_31_60,
  GREATEST(COALESCE(SUM(CASE WHEN td.dias BETWEEN 61 AND 90 THEN td.saldo ELSE 0 END), 0), 0)::DECIMAL(12,2) AS deuda_61_90,
  GREATEST(COALESCE(SUM(CASE WHEN td.dias > 90 THEN td.saldo ELSE 0 END), 0), 0)::DECIMAL(12,2) AS deuda_mas_90,
  CASE
    WHEN COUNT(CASE WHEN td.saldo > 0 THEN 1 END) > 0
      THEN ROUND(AVG(CASE WHEN td.saldo > 0 THEN td.dias::NUMERIC END), 2)
    ELSE NULL
  END AS dias_promedio_atraso
FROM clientes c
LEFT JOIN todas_deudas td ON td.cliente_id = c.id
GROUP BY c.id;

CREATE OR REPLACE VIEW vista_deudas_proveedores AS
WITH compras_resumen AS (
  SELECT
    proveedor_id,
    SUM(total_costo) FILTER (WHERE estado <> 'cancelado') AS total_compras
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
  COALESCE(c.total_compras, 0)::DECIMAL(12,2) - COALESCE(p.total_pagos, 0)::DECIMAL(12,2) AS deuda_pendiente
FROM proveedores pr
LEFT JOIN compras_resumen c ON c.proveedor_id = pr.id
LEFT JOIN pagos_resumen p ON p.proveedor_id = pr.id;

CREATE OR REPLACE VIEW vista_stock_bajo AS
SELECT pr.id AS producto_id,
       pr.codigo,
       pr.nombre,
       i.cantidad_disponible,
       pr.stock_minimo
FROM productos pr
JOIN inventario i ON i.producto_id = pr.id
WHERE i.cantidad_disponible < pr.stock_minimo
  AND pr.activo = TRUE;

CREATE OR REPLACE VIEW vista_top_clientes AS
SELECT c.id AS cliente_id,
       c.nombre,
       c.apellido,
       SUM(v.neto) AS total_comprado
FROM clientes c
JOIN ventas v ON v.cliente_id = c.id AND v.estado_pago <> 'cancelado'
GROUP BY c.id, c.nombre, c.apellido
ORDER BY total_comprado DESC;

CREATE OR REPLACE VIEW vista_ganancias_mensuales AS
WITH ventas_m AS (
  SELECT date_trunc('month', fecha) AS mes, SUM(neto) AS total_ventas
  FROM ventas
  WHERE estado_pago <> 'cancelado'
  GROUP BY 1
), gastos_m AS (
  SELECT date_trunc('month', fecha) AS mes, SUM(monto) AS total_gastos
  FROM gastos
  GROUP BY 1
)
SELECT COALESCE(ventas_m.mes, gastos_m.mes) AS mes,
       COALESCE(ventas_m.total_ventas, 0)::DECIMAL(12,2) AS total_ventas,
       COALESCE(gastos_m.total_gastos, 0)::DECIMAL(12,2) AS total_gastos,
       (COALESCE(ventas_m.total_ventas, 0) - COALESCE(gastos_m.total_gastos, 0))::DECIMAL(12,2) AS ganancia_neta
FROM ventas_m
FULL OUTER JOIN gastos_m ON ventas_m.mes = gastos_m.mes
ORDER BY mes;

-- 2.12 Finanzas: vistas base para costos y ventas por producto
CREATE OR REPLACE VIEW vista_costos_productos AS
SELECT
  c.id              AS compra_id,
  c.fecha::date     AS fecha,
  c.proveedor_id,
  pr.nombre         AS proveedor_nombre,
  cd.producto_id,
  p.codigo          AS producto_codigo,
  p.nombre          AS producto_nombre,
  p.categoria_id,
  cat.nombre        AS categoria_nombre,
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
  v.id              AS venta_id,
  v.fecha::date     AS fecha,
  v.cliente_id,
  c.nombre          AS cliente_nombre,
  COALESCE(c.apellido, '') AS cliente_apellido,
  v.neto,
  v.estado_pago,
  v.estado_entrega,
  vd.id             AS venta_detalle_id,
  vd.producto_id,
  p.codigo          AS producto_codigo,
  p.nombre          AS producto_nombre,
  p.categoria_id,
  cat.nombre        AS categoria_nombre,
  vd.cantidad,
  vd.precio_unitario,
  vd.subtotal
FROM ventas v
JOIN ventas_detalle vd ON vd.venta_id = v.id
JOIN productos p ON p.id = vd.producto_id
LEFT JOIN categorias cat ON cat.id = p.categoria_id
LEFT JOIN clientes c ON c.id = v.cliente_id
WHERE v.estado_pago <> 'cancelado';

COMMIT;
