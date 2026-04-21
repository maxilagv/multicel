CREATE OR REPLACE VIEW inventario AS
SELECT
  producto_id,
  SUM(cantidad_disponible) AS cantidad_disponible,
  SUM(cantidad_reservada) AS cantidad_reservada
FROM inventario_depositos
GROUP BY producto_id;
