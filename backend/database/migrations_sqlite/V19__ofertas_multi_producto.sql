BEGIN;

CREATE TABLE IF NOT EXISTS ofertas_precios_productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oferta_id INTEGER NOT NULL REFERENCES ofertas_precios(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(oferta_id, producto_id)
);

CREATE INDEX IF NOT EXISTS ix_opp_producto ON ofertas_precios_productos(producto_id);

INSERT OR IGNORE INTO ofertas_precios_productos(oferta_id, producto_id)
SELECT id, producto_id
  FROM ofertas_precios
 WHERE producto_id IS NOT NULL;

COMMIT;
