BEGIN;

ALTER TABLE clientes ADD COLUMN entre_calles TEXT;

INSERT OR IGNORE INTO parametros_sistema(clave, valor_texto, descripcion)
VALUES ('remito_titulo', 'Grupo kaisen', 'Titulo principal del remito PDF');

INSERT OR IGNORE INTO parametros_sistema(clave, valor_texto, descripcion)
VALUES ('remito_subtitulo', '', 'Subtitulo opcional del remito PDF');

COMMIT;
