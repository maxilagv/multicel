-- Modo de precio manual/automatico para productos
ALTER TABLE productos ADD COLUMN precio_modo TEXT NOT NULL DEFAULT 'auto';

UPDATE productos
   SET precio_modo = 'auto'
 WHERE precio_modo IS NULL;
