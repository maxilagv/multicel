-- ============================================================
--  V23 — Tipo de producto (estándar / insumo / servicio)
-- ============================================================

ALTER TABLE productos
  ADD COLUMN tipo_producto ENUM('estandar','insumo','servicio')
    NOT NULL DEFAULT 'estandar'
  AFTER activo;

CREATE INDEX idx_productos_tipo ON productos(tipo_producto);
