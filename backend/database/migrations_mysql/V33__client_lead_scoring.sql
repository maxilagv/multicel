ALTER TABLE clientes
  ADD COLUMN lead_score INT NOT NULL DEFAULT 0 AFTER segmento,
  ADD COLUMN lead_segmento VARCHAR(20) NOT NULL DEFAULT 'inactivo' AFTER lead_score,
  ADD COLUMN lead_score_updated_at DATETIME NULL AFTER lead_segmento,
  ADD COLUMN fecha_nacimiento DATE NULL AFTER lead_score_updated_at;

ALTER TABLE clientes
  ADD INDEX idx_clientes_lead_segmento (lead_segmento),
  ADD INDEX idx_clientes_lead_score (lead_score),
  ADD INDEX idx_clientes_fecha_nacimiento (fecha_nacimiento);
