ALTER TABLE usuarios
  ADD COLUMN deposito_principal_id INTEGER REFERENCES depositos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_usuarios_deposito_principal ON usuarios(deposito_principal_id);

UPDATE usuarios
   SET deposito_principal_id = (
     SELECT ud.deposito_id
       FROM usuarios_depositos ud
      WHERE ud.usuario_id = usuarios.id
      ORDER BY ud.deposito_id ASC
      LIMIT 1
   )
 WHERE deposito_principal_id IS NULL;

INSERT OR IGNORE INTO usuarios_depositos (usuario_id, deposito_id, rol_deposito)
SELECT id, deposito_principal_id, 'operador'
  FROM usuarios
 WHERE deposito_principal_id IS NOT NULL;
