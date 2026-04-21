CREATE TABLE IF NOT EXISTS ofertas_precios_productos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  oferta_id BIGINT UNSIGNED NOT NULL,
  producto_id BIGINT UNSIGNED NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_opp_oferta_producto (oferta_id, producto_id),
  KEY ix_opp_producto (producto_id),
  CONSTRAINT fk_opp_oferta FOREIGN KEY (oferta_id) REFERENCES ofertas_precios(id) ON DELETE CASCADE,
  CONSTRAINT fk_opp_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO ofertas_precios_productos(oferta_id, producto_id)
SELECT o.id, o.producto_id
  FROM ofertas_precios o
 WHERE o.producto_id IS NOT NULL
ON DUPLICATE KEY UPDATE oferta_id = VALUES(oferta_id);
