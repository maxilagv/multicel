BEGIN;

ALTER TABLE categorias ADD COLUMN parent_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL;
ALTER TABLE categorias ADD COLUMN depth INTEGER NOT NULL DEFAULT 0 CHECK (depth >= 0);
ALTER TABLE categorias ADD COLUMN path TEXT NOT NULL DEFAULT '/';
ALTER TABLE categorias ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE categorias
   SET depth = 0
 WHERE depth IS NULL;

UPDATE categorias
   SET path = ('/' || id || '/')
 WHERE path IS NULL
    OR TRIM(path) = ''
    OR path = '/';

UPDATE categorias
   SET sort_order = 0
 WHERE sort_order IS NULL;

CREATE INDEX IF NOT EXISTS ix_categorias_parent ON categorias(parent_id, activo, sort_order, nombre);
CREATE INDEX IF NOT EXISTS ix_categorias_depth ON categorias(depth);
CREATE INDEX IF NOT EXISTS ix_categorias_path ON categorias(path);

COMMIT;
