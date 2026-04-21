ALTER TABLE clientes
  ADD COLUMN deposito_principal_id BIGINT UNSIGNED NULL,
  ADD COLUMN responsable_usuario_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_clientes_deposito_principal
    FOREIGN KEY (deposito_principal_id) REFERENCES depositos(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_clientes_responsable_usuario
    FOREIGN KEY (responsable_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX ix_clientes_deposito_principal ON clientes(deposito_principal_id);
CREATE INDEX ix_clientes_responsable_usuario ON clientes(responsable_usuario_id);

UPDATE clientes c
   SET deposito_principal_id = (
     SELECT cd.deposito_id
       FROM clientes_depositos cd
      WHERE cd.cliente_id = c.id
      ORDER BY cd.creado_en ASC, cd.deposito_id ASC
      LIMIT 1
   )
 WHERE c.deposito_principal_id IS NULL;

UPDATE clientes c
   SET deposito_principal_id = (
     SELECT v.deposito_id
       FROM ventas v
      WHERE v.cliente_id = c.id
        AND v.deposito_id IS NOT NULL
      ORDER BY v.fecha DESC, v.id DESC
      LIMIT 1
   )
 WHERE c.deposito_principal_id IS NULL;

UPDATE clientes c
   SET responsable_usuario_id = (
     SELECT v.usuario_id
       FROM ventas v
      WHERE v.cliente_id = c.id
        AND v.usuario_id IS NOT NULL
      ORDER BY v.fecha DESC, v.id DESC
      LIMIT 1
   )
 WHERE c.responsable_usuario_id IS NULL;

INSERT IGNORE INTO clientes_depositos (cliente_id, deposito_id)
SELECT c.id, c.deposito_principal_id
  FROM clientes c
 WHERE c.deposito_principal_id IS NOT NULL;
