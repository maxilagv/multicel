BEGIN;

-- Usuarios: tipo de caja por defecto
ALTER TABLE usuarios ADD COLUMN caja_tipo_default TEXT NOT NULL DEFAULT 'sucursal';

-- Zonas de clientes
CREATE TABLE IF NOT EXISTS zonas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  color_hex TEXT NOT NULL DEFAULT '#64748B',
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_zonas_activo ON zonas(activo);

CREATE TABLE IF NOT EXISTS zonas_localidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  localidad TEXT NOT NULL,
  zona_id INTEGER NOT NULL REFERENCES zonas(id) ON DELETE CASCADE,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (localidad, zona_id)
);
CREATE INDEX IF NOT EXISTS ix_zonas_localidad ON zonas_localidades(localidad);

ALTER TABLE clientes ADD COLUMN zona_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_clientes_zona ON clientes(zona_id);

-- Productos: comision por producto (%)
ALTER TABLE productos ADD COLUMN comision_pct REAL NOT NULL DEFAULT 0;

-- Ventas: tipo de caja
ALTER TABLE ventas ADD COLUMN caja_tipo TEXT NOT NULL DEFAULT 'sucursal';
CREATE INDEX IF NOT EXISTS ix_ventas_caja_tipo ON ventas(caja_tipo);

-- Ventas detalle: base sin IVA, comision y costo unitario
ALTER TABLE ventas_detalle ADD COLUMN base_sin_iva REAL NOT NULL DEFAULT 0;
ALTER TABLE ventas_detalle ADD COLUMN comision_pct REAL NOT NULL DEFAULT 0;
ALTER TABLE ventas_detalle ADD COLUMN comision_monto REAL NOT NULL DEFAULT 0;
ALTER TABLE ventas_detalle ADD COLUMN costo_unitario_pesos REAL NOT NULL DEFAULT 0;

-- Defaults segun nuevas columnas
UPDATE usuarios SET caja_tipo_default = 'sucursal' WHERE caja_tipo_default IS NULL OR caja_tipo_default = '';
UPDATE ventas SET caja_tipo = 'sucursal' WHERE caja_tipo IS NULL OR caja_tipo = '';
UPDATE productos SET comision_pct = 0 WHERE comision_pct IS NULL;

-- Backfill: base sin IVA, comision y costo unitario por linea
WITH venta_base AS (
  SELECT v.id AS venta_id,
         SUM(d.subtotal) AS total_subtotal,
         v.descuento AS descuento,
         COALESCE((
           SELECT SUM(ur.descuento_aplicado) FROM uso_referidos ur WHERE ur.venta_id = v.id
         ), 0) AS desc_ref,
         (SUM(d.subtotal) - v.descuento - COALESCE((
           SELECT SUM(ur.descuento_aplicado) FROM uso_referidos ur WHERE ur.venta_id = v.id
         ), 0)) AS base_calc
    FROM ventas v
    JOIN ventas_detalle d ON d.venta_id = v.id
   GROUP BY v.id
)
UPDATE ventas_detalle
   SET base_sin_iva = (
         SELECT ROUND(
           CASE
             WHEN vb.total_subtotal > 0 THEN
               (ventas_detalle.subtotal / vb.total_subtotal) * CASE WHEN vb.base_calc > 0 THEN vb.base_calc ELSE 0 END
             ELSE 0
           END,
         2)
         FROM venta_base vb
        WHERE vb.venta_id = ventas_detalle.venta_id
       ),
       comision_pct = (
         SELECT COALESCE(p.comision_pct, 0)
           FROM productos p
          WHERE p.id = ventas_detalle.producto_id
       ),
       comision_monto = (
         SELECT ROUND(
           CASE
             WHEN vb.total_subtotal > 0 THEN
               ((ventas_detalle.subtotal / vb.total_subtotal) * CASE WHEN vb.base_calc > 0 THEN vb.base_calc ELSE 0 END)
               * COALESCE(p.comision_pct, 0) / 100
             ELSE 0
           END,
         2)
           FROM venta_base vb
           JOIN productos p ON p.id = ventas_detalle.producto_id
          WHERE vb.venta_id = ventas_detalle.venta_id
       ),
       costo_unitario_pesos = (
         SELECT CASE
           WHEN COALESCE(p.precio_costo_pesos, 0) > 0 THEN p.precio_costo_pesos
           WHEN COALESCE(p.precio_costo_dolares, 0) > 0 AND COALESCE(p.tipo_cambio, 0) > 0 THEN p.precio_costo_dolares * p.tipo_cambio
           ELSE 0
         END
           FROM productos p
          WHERE p.id = ventas_detalle.producto_id
       );

COMMIT;
