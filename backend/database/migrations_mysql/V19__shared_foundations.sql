CREATE TABLE IF NOT EXISTS sectores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(50) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  color_hex VARCHAR(16) NOT NULL DEFAULT '#6366F1',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sectores_codigo (codigo),
  UNIQUE KEY uq_sectores_nombre (nombre),
  KEY ix_sectores_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sectores_usuarios (
  sector_id BIGINT UNSIGNED NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  rol_sector VARCHAR(30) NOT NULL DEFAULT 'profesional',
  es_responsable TINYINT(1) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (sector_id, usuario_id),
  KEY ix_sector_usuario_usuario (usuario_id),
  KEY ix_sector_usuario_activo (activo),
  CONSTRAINT fk_sector_usuario_sector FOREIGN KEY (sector_id) REFERENCES sectores(id) ON DELETE CASCADE,
  CONSTRAINT fk_sector_usuario_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_adjuntos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(60) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  storage_provider VARCHAR(30) NOT NULL DEFAULT 'external_url',
  resource_type VARCHAR(20) NOT NULL DEFAULT 'raw',
  nombre_archivo VARCHAR(255) NOT NULL,
  url_archivo TEXT NOT NULL,
  mime_type VARCHAR(120) NULL,
  extension VARCHAR(20) NULL,
  size_bytes BIGINT UNSIGNED NULL,
  descripcion TEXT NULL,
  visibility_scope VARCHAR(20) NOT NULL DEFAULT 'private',
  visibility_roles JSON NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_adjuntos_entity (entity_type, entity_id),
  KEY ix_adjuntos_provider (storage_provider),
  KEY ix_adjuntos_activo (activo),
  KEY ix_adjuntos_user (uploaded_by),
  CONSTRAINT fk_adjuntos_user FOREIGN KEY (uploaded_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  subject_template VARCHAR(255) NOT NULL,
  body_template LONGTEXT NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_templates_code (code),
  KEY ix_email_templates_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_code VARCHAR(80) NULL,
  entity_type VARCHAR(60) NULL,
  entity_id BIGINT UNSIGNED NULL,
  destinatario_email VARCHAR(255) NOT NULL,
  destinatario_nombre VARCHAR(180) NULL,
  asunto VARCHAR(255) NOT NULL,
  cuerpo_preview TEXT NULL,
  provider VARCHAR(40) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  error_message TEXT NULL,
  payload_json JSON NULL,
  sent_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_email_log_status (status),
  KEY ix_email_log_entity (entity_type, entity_id),
  KEY ix_email_log_created_by (created_by),
  CONSTRAINT fk_email_log_user FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_cuentas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo VARCHAR(20) NOT NULL DEFAULT 'cliente',
  origen VARCHAR(20) NOT NULL DEFAULT 'cliente',
  nombre VARCHAR(180) NOT NULL,
  cliente_id BIGINT UNSIGNED NULL,
  proveedor_id BIGINT UNSIGNED NULL,
  email VARCHAR(255) NULL,
  telefono VARCHAR(60) NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'activo',
  owner_usuario_id BIGINT UNSIGNED NULL,
  notas TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crm_cuenta_cliente (cliente_id),
  UNIQUE KEY uq_crm_cuenta_proveedor (proveedor_id),
  KEY ix_crm_cuenta_tipo (tipo),
  KEY ix_crm_cuenta_estado (estado),
  KEY ix_crm_cuenta_owner (owner_usuario_id),
  CONSTRAINT fk_crm_cuenta_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_cuenta_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_cuenta_owner FOREIGN KEY (owner_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_contactos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  crm_cuenta_id BIGINT UNSIGNED NOT NULL,
  cliente_id BIGINT UNSIGNED NULL,
  proveedor_id BIGINT UNSIGNED NULL,
  nombre VARCHAR(140) NOT NULL,
  cargo VARCHAR(120) NULL,
  email VARCHAR(255) NULL,
  telefono VARCHAR(60) NULL,
  whatsapp VARCHAR(60) NULL,
  es_principal TINYINT(1) NOT NULL DEFAULT 0,
  notas TEXT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_crm_contactos_cuenta (crm_cuenta_id),
  KEY ix_crm_contactos_cliente (cliente_id),
  KEY ix_crm_contactos_proveedor (proveedor_id),
  KEY ix_crm_contactos_activo (activo),
  CONSTRAINT fk_crm_contactos_cuenta FOREIGN KEY (crm_cuenta_id) REFERENCES crm_cuentas(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_contactos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_contactos_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE crm_oportunidades
  MODIFY COLUMN cliente_id BIGINT UNSIGNED NULL;

SET @crm_op_add_cuenta = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'crm_oportunidades'
         AND column_name = 'crm_cuenta_id'
    ),
    'SELECT 1',
    'ALTER TABLE crm_oportunidades ADD COLUMN crm_cuenta_id BIGINT UNSIGNED NULL AFTER cliente_id'
  )
);
PREPARE stmt FROM @crm_op_add_cuenta;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @crm_act_add_cuenta = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'crm_actividades'
         AND column_name = 'crm_cuenta_id'
    ),
    'SELECT 1',
    'ALTER TABLE crm_actividades ADD COLUMN crm_cuenta_id BIGINT UNSIGNED NULL AFTER cliente_id'
  )
);
PREPARE stmt FROM @crm_act_add_cuenta;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @crm_act_add_prioridad = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'crm_actividades'
         AND column_name = 'prioridad'
    ),
    'SELECT 1',
    'ALTER TABLE crm_actividades ADD COLUMN prioridad VARCHAR(20) NOT NULL DEFAULT ''media'' AFTER estado'
  )
);
PREPARE stmt FROM @crm_act_add_prioridad;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @crm_act_add_fecha_fin = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'crm_actividades'
         AND column_name = 'fecha_fin'
    ),
    'SELECT 1',
    'ALTER TABLE crm_actividades ADD COLUMN fecha_fin DATETIME NULL AFTER fecha_hora'
  )
);
PREPARE stmt FROM @crm_act_add_fecha_fin;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @crm_act_add_resultado = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'crm_actividades'
         AND column_name = 'resultado'
    ),
    'SELECT 1',
    'ALTER TABLE crm_actividades ADD COLUMN resultado TEXT NULL AFTER descripcion'
  )
);
PREPARE stmt FROM @crm_act_add_resultado;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @crm_act_add_metadata = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'crm_actividades'
         AND column_name = 'metadata_json'
    ),
    'SELECT 1',
    'ALTER TABLE crm_actividades ADD COLUMN metadata_json JSON NULL AFTER resultado'
  )
);
PREPARE stmt FROM @crm_act_add_metadata;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @crm_act_add_completado = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'crm_actividades'
         AND column_name = 'completado_en'
    ),
    'SELECT 1',
    'ALTER TABLE crm_actividades ADD COLUMN completado_en DATETIME NULL AFTER fecha_fin'
  )
);
PREPARE stmt FROM @crm_act_add_completado;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS crm_oportunidad_historial (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  oportunidad_id BIGINT UNSIGNED NOT NULL,
  crm_cuenta_id BIGINT UNSIGNED NULL,
  estado_anterior VARCHAR(20) NULL,
  estado_nuevo VARCHAR(20) NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NULL,
  notas TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_crm_op_hist_oportunidad (oportunidad_id),
  KEY ix_crm_op_hist_cuenta (crm_cuenta_id),
  KEY ix_crm_op_hist_fecha (created_at),
  CONSTRAINT fk_crm_op_hist_oportunidad FOREIGN KEY (oportunidad_id) REFERENCES crm_oportunidades(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_op_hist_cuenta FOREIGN KEY (crm_cuenta_id) REFERENCES crm_cuentas(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_op_hist_user FOREIGN KEY (changed_by_user_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO sectores (codigo, nombre, descripcion, color_hex) VALUES
  ('recepcion', 'Recepción', 'Ingreso administrativo y seguimiento de carpetas', '#2563EB'),
  ('laboratorio', 'Laboratorio', 'Resultados de laboratorio y bioquímica', '#0EA5E9'),
  ('cardiologia', 'Cardiología', 'Informes y aptitud cardiológica', '#DC2626'),
  ('oftalmologia', 'Oftalmología', 'Controles visuales y de aptitud', '#7C3AED'),
  ('radiologia', 'Radiología', 'Informes radiológicos', '#EA580C'),
  ('clinica', 'Clínica', 'Conclusión médica y aptitud laboral final', '#16A34A');

INSERT IGNORE INTO email_templates (code, nombre, subject_template, body_template) VALUES
  (
    'laboral_informe',
    'Envio de informe laboral',
    'Informe laboral {{numero_carpeta}} - {{empleado_nombre}}',
    'Hola {{destinatario_nombre}},\n\nAdjuntamos el informe laboral de {{empleado_nombre}} correspondiente a la carpeta {{numero_carpeta}}.\n\nQuedamos a disposición.\n\n{{empresa_nombre}}'
  ),
  (
    'laboral_recordatorio_ausentismo',
    'Recordatorio de control de ausentismo',
    'Recordatorio de control pendiente - {{empleado_nombre}}',
    'Hola {{destinatario_nombre}},\n\nTe recordamos que el control de ausentismo de {{empleado_nombre}} vence el {{proximo_control_fecha}}.\n\nPor favor coordiná el seguimiento.\n\n{{empresa_nombre}}'
  );

INSERT IGNORE INTO crm_cuentas (tipo, origen, nombre, cliente_id, email, telefono, estado)
SELECT
  'cliente',
  'cliente',
  TRIM(CONCAT(c.nombre, IFNULL(CONCAT(' ', c.apellido), ''))),
  c.id,
  c.email,
  c.telefono,
  c.estado
FROM clientes c
WHERE c.deleted_at IS NULL;

INSERT IGNORE INTO crm_cuentas (tipo, origen, nombre, proveedor_id, email, telefono, estado)
SELECT
  'proveedor',
  'proveedor',
  p.nombre,
  p.id,
  p.email,
  p.telefono,
  'activo'
FROM proveedores p;

UPDATE crm_oportunidades o
JOIN crm_cuentas cc ON cc.cliente_id = o.cliente_id
SET o.crm_cuenta_id = cc.id
WHERE o.crm_cuenta_id IS NULL
  AND o.cliente_id IS NOT NULL;

UPDATE crm_actividades a
JOIN crm_cuentas cc ON cc.cliente_id = a.cliente_id
SET a.crm_cuenta_id = cc.id
WHERE a.crm_cuenta_id IS NULL
  AND a.cliente_id IS NOT NULL;

INSERT INTO crm_oportunidad_historial (oportunidad_id, crm_cuenta_id, estado_anterior, estado_nuevo, created_at)
SELECT o.id, o.crm_cuenta_id, NULL, o.fase, COALESCE(o.creado_en, CURRENT_TIMESTAMP)
FROM crm_oportunidades o
LEFT JOIN crm_oportunidad_historial h ON h.oportunidad_id = o.id
WHERE h.id IS NULL;
