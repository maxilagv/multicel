BEGIN;

-- (Opcional) Ver cómo están hoy los “cargadores”
SELECT id, nombre,
       precio_costo_pesos, margen_local, margen_distribuidor,
       precio_local, precio_distribuidor,
       precio_venta, precio_final
FROM productos
WHERE LOWER(nombre) LIKE '%cargador%';

-- 1) Asegurar márgenes por defecto si estuvieran en NULL
UPDATE productos
SET
  margen_local        = COALESCE(margen_local, 0.15),
  margen_distribuidor = COALESCE(margen_distribuidor, 0.45)
WHERE margen_local IS NULL
   OR margen_distribuidor IS NULL;

-- 2) Productos con costo en pesos y precios sin inicializar:
--    recalcular precios desde costo + márgenes
UPDATE productos
SET
  precio_local        = ROUND(precio_costo_pesos * (1 + margen_local), 2),
  precio_distribuidor = ROUND(precio_costo_pesos * (1 + margen_distribuidor), 2),
  precio_venta        = ROUND(precio_costo_pesos * (1 + margen_local), 2)
WHERE
  precio_costo_pesos > 0
  AND (
    precio_local IS NULL OR precio_local = 0
    OR precio_distribuidor IS NULL OR precio_distribuidor = 0
    OR precio_venta IS NULL OR precio_venta = 0
  );

-- 3) Productos sin costo pero con precio_venta > 0 y precios sin inicializar:
--    usar precio_venta para rellenar local/distribuidor
UPDATE productos
SET
  precio_local = COALESCE(NULLIF(precio_local, 0), precio_venta),
  precio_distribuidor = COALESCE(NULLIF(precio_distribuidor, 0), precio_venta)
WHERE
  precio_venta > 0
  AND (
    precio_local IS NULL OR precio_local = 0
    OR precio_distribuidor IS NULL OR precio_distribuidor = 0
  );

-- 4) Precio final por defecto: primero local, luego base
UPDATE productos
SET
  precio_final = COALESCE(
    NULLIF(precio_local, 0),
    NULLIF(precio_venta, 0),
    precio_final
  )
WHERE
  (precio_final IS NULL OR precio_final = 0)
  AND (precio_local IS NOT NULL OR precio_venta IS NOT NULL);

COMMIT;

