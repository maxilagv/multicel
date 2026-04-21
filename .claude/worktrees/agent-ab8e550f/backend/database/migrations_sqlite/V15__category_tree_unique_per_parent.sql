PRAGMA foreign_keys = OFF;

BEGIN;

DROP VIEW IF EXISTS vista_costos_productos;
DROP VIEW IF EXISTS vista_ventas_productos;

CREATE TABLE categorias_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  imagen_url TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  parent_id INTEGER REFERENCES categorias_new(id) ON DELETE SET NULL,
  depth INTEGER NOT NULL DEFAULT 0 CHECK (depth >= 0),
  path TEXT NOT NULL DEFAULT '/',
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO categorias_new (
  id,
  nombre,
  descripcion,
  imagen_url,
  activo,
  creado_en,
  parent_id,
  depth,
  path,
  sort_order
)
SELECT
  id,
  nombre,
  descripcion,
  imagen_url,
  activo,
  creado_en,
  parent_id,
  COALESCE(depth, 0),
  CASE
    WHEN path IS NULL OR TRIM(path) = '' OR path = '/' THEN ('/' || id || '/')
    ELSE path
  END,
  COALESCE(sort_order, 0)
FROM categorias;

DROP TABLE categorias;
ALTER TABLE categorias_new RENAME TO categorias;

CREATE INDEX IF NOT EXISTS ix_categorias_activo ON categorias(activo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_categorias_nombre_parent_ci
  ON categorias(LOWER(TRIM(nombre)), COALESCE(parent_id, 0));
CREATE INDEX IF NOT EXISTS ix_categorias_parent ON categorias(parent_id, activo, sort_order, nombre);
CREATE INDEX IF NOT EXISTS ix_categorias_depth ON categorias(depth);
CREATE INDEX IF NOT EXISTS ix_categorias_path ON categorias(path);

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

COMMIT;

PRAGMA foreign_keys = ON;
