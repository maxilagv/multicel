ALTER TABLE ventas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_ventas_usuario ON ventas(usuario_id);
