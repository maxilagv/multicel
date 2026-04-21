ALTER TABLE alianzas ADD COLUMN external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_alianzas_external ON alianzas(external_id) WHERE external_id IS NOT NULL;

ALTER TABLE alianzas_ofertas ADD COLUMN external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_alianzas_ofertas_external ON alianzas_ofertas(external_id) WHERE external_id IS NOT NULL;
