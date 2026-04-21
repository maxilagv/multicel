ALTER TABLE clientes
  ADD COLUMN deposito_principal_id INTEGER REFERENCES depositos(id) ON DELETE SET NULL;

ALTER TABLE clientes
  ADD COLUMN responsable_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_clientes_deposito_principal ON clientes(deposito_principal_id);
CREATE INDEX IF NOT EXISTS ix_clientes_responsable_usuario ON clientes(responsable_usuario_id);

UPDATE clientes
   SET deposito_principal_id = (
     SELECT cd.deposito_id
       FROM clientes_depositos cd
      WHERE cd.cliente_id = clientes.id
      ORDER BY cd.creado_en ASC, cd.deposito_id ASC
      LIMIT 1
   )
 WHERE deposito_principal_id IS NULL;

UPDATE clientes
   SET deposito_principal_id = (
     SELECT v.deposito_id
       FROM ventas v
      WHERE v.cliente_id = clientes.id
        AND v.deposito_id IS NOT NULL
      ORDER BY v.fecha DESC, v.id DESC
      LIMIT 1
   )
 WHERE deposito_principal_id IS NULL;

UPDATE clientes
   SET responsable_usuario_id = (
     SELECT v.usuario_id
       FROM ventas v
      WHERE v.cliente_id = clientes.id
        AND v.usuario_id IS NOT NULL
      ORDER BY v.fecha DESC, v.id DESC
      LIMIT 1
   )
 WHERE responsable_usuario_id IS NULL;

INSERT OR IGNORE INTO clientes_depositos (cliente_id, deposito_id)
SELECT id, deposito_principal_id
  FROM clientes
 WHERE deposito_principal_id IS NOT NULL;
