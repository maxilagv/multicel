CREATE TABLE IF NOT EXISTS laboral_tipos_examen (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(40) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  periodicidad_dias INT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_laboral_tipos_codigo (codigo),
  KEY ix_laboral_tipos_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS laboral_tipos_examen_sectores (
  tipo_examen_id BIGINT UNSIGNED NOT NULL,
  sector_id BIGINT UNSIGNED NOT NULL,
  obligatorio TINYINT(1) NOT NULL DEFAULT 1,
  orden INT NOT NULL DEFAULT 0,
  PRIMARY KEY (tipo_examen_id, sector_id),
  KEY ix_laboral_tipo_sector_orden (orden),
  CONSTRAINT fk_laboral_tipo_sector_tipo FOREIGN KEY (tipo_examen_id) REFERENCES laboral_tipos_examen(id) ON DELETE CASCADE,
  CONSTRAINT fk_laboral_tipo_sector_sector FOREIGN KEY (sector_id) REFERENCES sectores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS laboral_nomencladores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_pagador_id BIGINT UNSIGNED NOT NULL,
  tipo_examen_id BIGINT UNSIGNED NULL,
  codigo VARCHAR(50) NOT NULL,
  descripcion VARCHAR(255) NOT NULL,
  precio_unitario DECIMAL(18,2) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_laboral_nomenclador_pagador_codigo (cliente_pagador_id, codigo),
  KEY ix_laboral_nomenclador_tipo (tipo_examen_id),
  KEY ix_laboral_nomenclador_activo (activo),
  CONSTRAINT fk_laboral_nomenclador_pagador FOREIGN KEY (cliente_pagador_id) REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_laboral_nomenclador_tipo FOREIGN KEY (tipo_examen_id) REFERENCES laboral_tipos_examen(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carpetas_laborales (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  numero_carpeta VARCHAR(40) NOT NULL,
  cliente_pagador_id BIGINT UNSIGNED NOT NULL,
  crm_cuenta_id BIGINT UNSIGNED NULL,
  tipo_carpeta VARCHAR(20) NOT NULL DEFAULT 'ingreso',
  tipo_examen_id BIGINT UNSIGNED NULL,
  empleado_nombre VARCHAR(180) NOT NULL,
  empleado_dni VARCHAR(30) NULL,
  empleado_legajo VARCHAR(60) NULL,
  empleado_email VARCHAR(255) NULL,
  fecha_apertura DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_turno DATETIME NULL,
  fecha_cierre DATETIME NULL,
  proximo_control_fecha DATE NULL,
  ausentismo_controlar TINYINT(1) NOT NULL DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'abierta',
  prioridad VARCHAR(20) NOT NULL DEFAULT 'normal',
  resumen_clinico LONGTEXT NULL,
  observaciones LONGTEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carpetas_numero (numero_carpeta),
  KEY ix_carpetas_pagador (cliente_pagador_id),
  KEY ix_carpetas_estado (estado),
  KEY ix_carpetas_tipo (tipo_carpeta),
  KEY ix_carpetas_control (proximo_control_fecha),
  CONSTRAINT fk_carpetas_pagador FOREIGN KEY (cliente_pagador_id) REFERENCES clientes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_carpetas_cuenta FOREIGN KEY (crm_cuenta_id) REFERENCES crm_cuentas(id) ON DELETE SET NULL,
  CONSTRAINT fk_carpetas_tipo_examen FOREIGN KEY (tipo_examen_id) REFERENCES laboral_tipos_examen(id) ON DELETE SET NULL,
  CONSTRAINT fk_carpetas_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carpetas_laborales_informes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  carpeta_id BIGINT UNSIGNED NOT NULL,
  sector_id BIGINT UNSIGNED NOT NULL,
  tipo_informe VARCHAR(80) NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  solicitado_a_usuario_id BIGINT UNSIGNED NULL,
  profesional_id BIGINT UNSIGNED NULL,
  fecha_solicitud DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_realizacion DATETIME NULL,
  fecha_firma DATETIME NULL,
  resumen TEXT NULL,
  hallazgos LONGTEXT NULL,
  aptitud_laboral VARCHAR(80) NULL,
  archivo_adjunto_id BIGINT UNSIGNED NULL,
  orden INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_carpetas_informes_carpeta (carpeta_id),
  KEY ix_carpetas_informes_estado (estado),
  KEY ix_carpetas_informes_sector (sector_id),
  CONSTRAINT fk_carpetas_informes_carpeta FOREIGN KEY (carpeta_id) REFERENCES carpetas_laborales(id) ON DELETE CASCADE,
  CONSTRAINT fk_carpetas_informes_sector FOREIGN KEY (sector_id) REFERENCES sectores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_carpetas_informes_solicitado FOREIGN KEY (solicitado_a_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_carpetas_informes_profesional FOREIGN KEY (profesional_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_carpetas_informes_adjunto FOREIGN KEY (archivo_adjunto_id) REFERENCES app_adjuntos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carpetas_laborales_practicas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  carpeta_id BIGINT UNSIGNED NOT NULL,
  nomenclador_id BIGINT UNSIGNED NULL,
  descripcion_manual VARCHAR(255) NULL,
  cantidad DECIMAL(18,2) NOT NULL DEFAULT 1,
  precio_unitario DECIMAL(18,2) NOT NULL DEFAULT 0,
  facturado TINYINT(1) NOT NULL DEFAULT 0,
  facturado_venta_id BIGINT UNSIGNED NULL,
  periodo_facturacion VARCHAR(7) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_carpetas_practicas_carpeta (carpeta_id),
  KEY ix_carpetas_practicas_facturado (facturado),
  CONSTRAINT fk_carpetas_practicas_carpeta FOREIGN KEY (carpeta_id) REFERENCES carpetas_laborales(id) ON DELETE CASCADE,
  CONSTRAINT fk_carpetas_practicas_nomenclador FOREIGN KEY (nomenclador_id) REFERENCES laboral_nomencladores(id) ON DELETE SET NULL,
  CONSTRAINT fk_carpetas_practicas_venta FOREIGN KEY (facturado_venta_id) REFERENCES ventas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carpetas_laborales_eventos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  carpeta_id BIGINT UNSIGNED NOT NULL,
  tipo_evento VARCHAR(40) NOT NULL,
  detalle TEXT NULL,
  user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_carpetas_eventos_carpeta (carpeta_id),
  KEY ix_carpetas_eventos_tipo (tipo_evento),
  CONSTRAINT fk_carpetas_eventos_carpeta FOREIGN KEY (carpeta_id) REFERENCES carpetas_laborales(id) ON DELETE CASCADE,
  CONSTRAINT fk_carpetas_eventos_user FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO laboral_tipos_examen (codigo, nombre, descripcion, periodicidad_dias) VALUES
  ('ingreso', 'Alta laboral', 'Examen preocupacional / ingreso laboral', NULL),
  ('periodico', 'Control periódico', 'Control periódico con vencimiento programado', 365),
  ('egreso', 'Baja laboral', 'Examen de egreso laboral', NULL),
  ('art', 'Seguimiento ART', 'Accidentes y evolución por ART', NULL);

INSERT IGNORE INTO laboral_tipos_examen_sectores (tipo_examen_id, sector_id, obligatorio, orden)
SELECT t.id, s.id, 1, 10
FROM laboral_tipos_examen t
JOIN sectores s ON s.codigo = 'recepcion'
WHERE t.codigo IN ('ingreso', 'periodico', 'egreso', 'art');

INSERT IGNORE INTO laboral_tipos_examen_sectores (tipo_examen_id, sector_id, obligatorio, orden)
SELECT t.id, s.id, 1, 20
FROM laboral_tipos_examen t
JOIN sectores s ON s.codigo = 'laboratorio'
WHERE t.codigo IN ('ingreso', 'periodico', 'egreso');

INSERT IGNORE INTO laboral_tipos_examen_sectores (tipo_examen_id, sector_id, obligatorio, orden)
SELECT t.id, s.id, 1, 30
FROM laboral_tipos_examen t
JOIN sectores s ON s.codigo = 'cardiologia'
WHERE t.codigo IN ('ingreso', 'periodico', 'egreso');

INSERT IGNORE INTO laboral_tipos_examen_sectores (tipo_examen_id, sector_id, obligatorio, orden)
SELECT t.id, s.id, 1, 40
FROM laboral_tipos_examen t
JOIN sectores s ON s.codigo = 'oftalmologia'
WHERE t.codigo IN ('ingreso', 'periodico');

INSERT IGNORE INTO laboral_tipos_examen_sectores (tipo_examen_id, sector_id, obligatorio, orden)
SELECT t.id, s.id, 1, 50
FROM laboral_tipos_examen t
JOIN sectores s ON s.codigo = 'clinica'
WHERE t.codigo IN ('ingreso', 'periodico', 'egreso', 'art');
