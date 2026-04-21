BEGIN;

INSERT OR IGNORE INTO roles(nombre) VALUES ('fletero');

CREATE TABLE IF NOT EXISTS ofertas_precios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  tipo_oferta TEXT NOT NULL DEFAULT 'cantidad',
  producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  lista_precio_objetivo TEXT NOT NULL DEFAULT 'todas',
  cantidad_minima INTEGER NOT NULL DEFAULT 1,
  descuento_pct REAL NOT NULL DEFAULT 0,
  fecha_desde TEXT,
  fecha_hasta TEXT,
  prioridad INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ofertas_precios_activo ON ofertas_precios(activo);
CREATE INDEX IF NOT EXISTS ix_ofertas_precios_tipo ON ofertas_precios(tipo_oferta);
CREATE INDEX IF NOT EXISTS ix_ofertas_precios_producto ON ofertas_precios(producto_id);

ALTER TABLE ventas ADD COLUMN price_list_type TEXT NOT NULL DEFAULT 'local';

ALTER TABLE ventas_detalle ADD COLUMN lista_precio_codigo TEXT;
ALTER TABLE ventas_detalle ADD COLUMN oferta_precio_id INTEGER;
ALTER TABLE ventas_detalle ADD COLUMN descuento_oferta REAL NOT NULL DEFAULT 0;
ALTER TABLE ventas_detalle ADD COLUMN descuento_oferta_pct REAL NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO parametros_sistema(clave, valor_texto, descripcion)
VALUES ('comision_vendedores_modo', 'producto', 'Modo de comision: producto o lista');

INSERT OR IGNORE INTO parametros_sistema(clave, valor_num, descripcion)
VALUES ('comision_lista_local_pct', 0, 'Comision porcentual para lista local');

INSERT OR IGNORE INTO parametros_sistema(clave, valor_num, descripcion)
VALUES ('comision_lista_distribuidor_pct', 0, 'Comision porcentual para lista distribuidor');

INSERT OR IGNORE INTO parametros_sistema(clave, valor_num, descripcion)
VALUES ('comision_lista_final_pct', 0, 'Comision porcentual para lista final');

INSERT OR IGNORE INTO parametros_sistema(clave, valor_num, descripcion)
VALUES ('comision_lista_oferta_pct', 0, 'Comision porcentual para productos en oferta');

COMMIT;
