-- Minimal seed data
BEGIN;

-- Roles base
INSERT INTO roles (nombre)
VALUES ('admin'), ('vendedor'), ('gerente')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO depositos (nombre, codigo, activo)
VALUES ('Principal', 'MAIN', 1)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO parametros_sistema (clave, valor_num, descripcion)
SELECT 'deposito_default_id', id, 'Deposito por defecto' FROM depositos WHERE codigo = 'MAIN'
ON CONFLICT (clave) DO UPDATE SET valor_num = excluded.valor_num;

INSERT INTO parametros_sistema (clave, valor_num, descripcion)
VALUES ('deuda_umbral_rojo', 1000000, 'Umbral deuda rojo')
ON CONFLICT (clave) DO UPDATE SET valor_num = excluded.valor_num;

COMMIT;
