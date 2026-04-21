ALTER TABLE compras ADD COLUMN oc_numero TEXT;
ALTER TABLE compras ADD COLUMN adjunto_url TEXT;

ALTER TABLE compras_detalle ADD COLUMN cantidad_recibida INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS recepciones_detalle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recepcion_id INTEGER NOT NULL REFERENCES recepciones(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0)
);
CREATE INDEX IF NOT EXISTS ix_recepciones_detalle_recepcion ON recepciones_detalle(recepcion_id);
CREATE INDEX IF NOT EXISTS ix_recepciones_detalle_producto ON recepciones_detalle(producto_id);
