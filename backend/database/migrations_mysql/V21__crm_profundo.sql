CREATE TABLE IF NOT EXISTS crm_proyectos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  crm_cuenta_id BIGINT UNSIGNED NULL,
  cliente_id BIGINT UNSIGNED NULL,
  nombre VARCHAR(180) NOT NULL,
  descripcion LONGTEXT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'proyecto',
  estado VARCHAR(20) NOT NULL DEFAULT 'planificado',
  prioridad VARCHAR(20) NOT NULL DEFAULT 'media',
  responsable_usuario_id BIGINT UNSIGNED NULL,
  fecha_inicio DATE NULL,
  fecha_fin DATE NULL,
  progreso_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  presupuesto_estimado DECIMAL(18,2) NULL,
  color_hex VARCHAR(16) NOT NULL DEFAULT '#6366F1',
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_crm_proyectos_cuenta (crm_cuenta_id),
  KEY ix_crm_proyectos_cliente (cliente_id),
  KEY ix_crm_proyectos_estado (estado),
  KEY ix_crm_proyectos_responsable (responsable_usuario_id),
  CONSTRAINT fk_crm_proyectos_cuenta FOREIGN KEY (crm_cuenta_id) REFERENCES crm_cuentas(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_proyectos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_proyectos_responsable FOREIGN KEY (responsable_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_proyectos_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_tareas_proyecto (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  proyecto_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  nombre VARCHAR(180) NOT NULL,
  descripcion LONGTEXT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  prioridad VARCHAR(20) NOT NULL DEFAULT 'media',
  responsable_usuario_id BIGINT UNSIGNED NULL,
  fecha_inicio DATE NULL,
  fecha_fin DATE NULL,
  progreso_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  orden INT NOT NULL DEFAULT 0,
  requiere_agenda TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_crm_tareas_proyecto (proyecto_id),
  KEY ix_crm_tareas_parent (parent_id),
  KEY ix_crm_tareas_responsable (responsable_usuario_id),
  KEY ix_crm_tareas_estado (estado),
  CONSTRAINT fk_crm_tareas_proyecto FOREIGN KEY (proyecto_id) REFERENCES crm_proyectos(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_tareas_parent FOREIGN KEY (parent_id) REFERENCES crm_tareas_proyecto(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_tareas_responsable FOREIGN KEY (responsable_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_tareas_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @crm_act_add_proyecto = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'crm_actividades'
         AND column_name = 'proyecto_id'
    ),
    'SELECT 1',
    'ALTER TABLE crm_actividades ADD COLUMN proyecto_id BIGINT UNSIGNED NULL AFTER crm_cuenta_id'
  )
);
PREPARE stmt FROM @crm_act_add_proyecto;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @crm_act_add_origen_tipo = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'crm_actividades'
         AND column_name = 'origen_tipo'
    ),
    'SELECT 1',
    'ALTER TABLE crm_actividades ADD COLUMN origen_tipo VARCHAR(30) NULL AFTER proyecto_id'
  )
);
PREPARE stmt FROM @crm_act_add_origen_tipo;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @crm_act_add_origen_id = (
  SELECT IF(
    EXISTS(
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'crm_actividades'
         AND column_name = 'origen_id'
    ),
    'SELECT 1',
    'ALTER TABLE crm_actividades ADD COLUMN origen_id BIGINT UNSIGNED NULL AFTER origen_tipo'
  )
);
PREPARE stmt FROM @crm_act_add_origen_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
