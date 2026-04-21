SET @ddl_clientes_entre_calles = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'clientes'
        AND column_name = 'entre_calles'
    ),
    'SELECT 1',
    'ALTER TABLE clientes ADD COLUMN entre_calles TEXT NULL AFTER direccion'
  )
);
PREPARE stmt_clientes_entre_calles FROM @ddl_clientes_entre_calles;
EXECUTE stmt_clientes_entre_calles;
DEALLOCATE PREPARE stmt_clientes_entre_calles;

INSERT INTO parametros_sistema(clave, valor_texto, descripcion)
VALUES ('remito_titulo', 'Grupo kaisen', 'Titulo principal del remito PDF')
ON DUPLICATE KEY UPDATE clave = clave;

INSERT INTO parametros_sistema(clave, valor_texto, descripcion)
VALUES ('remito_subtitulo', '', 'Subtitulo opcional del remito PDF')
ON DUPLICATE KEY UPDATE clave = clave;
