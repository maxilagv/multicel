INSERT OR IGNORE INTO roles (nombre)
VALUES ('gerente_sucursal');

CREATE TABLE IF NOT EXISTS clientes_depositos (
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  deposito_id INTEGER NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cliente_id, deposito_id)
);

CREATE INDEX IF NOT EXISTS ix_clientes_depositos_deposito ON clientes_depositos(deposito_id);

INSERT OR IGNORE INTO clientes_depositos (cliente_id, deposito_id)
SELECT DISTINCT cliente_id, deposito_id
  FROM ventas
 WHERE deposito_id IS NOT NULL;
