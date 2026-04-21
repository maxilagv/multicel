INSERT IGNORE INTO roles (nombre)
VALUES ('gerente_sucursal');

CREATE TABLE IF NOT EXISTS clientes_depositos (
  cliente_id BIGINT UNSIGNED NOT NULL,
  deposito_id BIGINT UNSIGNED NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cliente_id, deposito_id),
  CONSTRAINT fk_clientes_depositos_cliente
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_clientes_depositos_deposito
    FOREIGN KEY (deposito_id) REFERENCES depositos(id) ON DELETE CASCADE
);

CREATE INDEX ix_clientes_depositos_deposito ON clientes_depositos(deposito_id);

INSERT IGNORE INTO clientes_depositos (cliente_id, deposito_id)
SELECT DISTINCT v.cliente_id, v.deposito_id
  FROM ventas v
 WHERE v.deposito_id IS NOT NULL;
