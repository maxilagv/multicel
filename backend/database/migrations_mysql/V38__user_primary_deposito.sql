ALTER TABLE usuarios
  ADD COLUMN deposito_principal_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_usuarios_deposito_principal
    FOREIGN KEY (deposito_principal_id) REFERENCES depositos(id) ON DELETE SET NULL;

CREATE INDEX ix_usuarios_deposito_principal ON usuarios(deposito_principal_id);

UPDATE usuarios u
   SET deposito_principal_id = (
     SELECT ud.deposito_id
       FROM usuarios_depositos ud
      WHERE ud.usuario_id = u.id
      ORDER BY ud.deposito_id ASC
      LIMIT 1
   )
 WHERE u.deposito_principal_id IS NULL;

INSERT IGNORE INTO usuarios_depositos (usuario_id, deposito_id, rol_deposito)
SELECT u.id, u.deposito_principal_id, 'operador'
  FROM usuarios u
 WHERE u.deposito_principal_id IS NOT NULL;
