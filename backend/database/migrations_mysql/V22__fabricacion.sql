-- ============================================================
--  V22 — Módulo de Fabricación / Producción
-- ============================================================

-- Recetas de fabricación (Bill of Materials)
CREATE TABLE recetas_fabricacion (
  id                      INT           NOT NULL AUTO_INCREMENT,
  nombre                  VARCHAR(255)  NOT NULL,
  descripcion             TEXT,
  producto_terminado_id   INT           NULL,           -- producto que se fabrica
  rendimiento             DECIMAL(10,3) NOT NULL DEFAULT 1,
  unidad_rendimiento      VARCHAR(50)   NOT NULL DEFAULT 'unidad',
  tiempo_produccion_horas DECIMAL(6,2)  NULL,
  activa                  TINYINT(1)    NOT NULL DEFAULT 1,
  version                 INT           NOT NULL DEFAULT 1,
  costo_calculado         DECIMAL(12,2) NULL,
  costo_calculado_en      TIMESTAMP     NULL,
  notas                   TEXT,
  created_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_rf_producto (producto_terminado_id),
  INDEX idx_rf_activa   (activa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Items de receta (insumos necesarios)
CREATE TABLE recetas_fabricacion_items (
  id          INT           NOT NULL AUTO_INCREMENT,
  receta_id   INT           NOT NULL,
  producto_id INT           NOT NULL,
  cantidad    DECIMAL(10,4) NOT NULL,
  unidad      VARCHAR(50)   NULL,
  notas       VARCHAR(255)  NULL,
  PRIMARY KEY (id),
  INDEX idx_rfi_receta   (receta_id),
  INDEX idx_rfi_producto (producto_id),
  FOREIGN KEY (receta_id) REFERENCES recetas_fabricacion(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Órdenes de fabricación
CREATE TABLE ordenes_fabricacion (
  id                       INT           NOT NULL AUTO_INCREMENT,
  numero_of                VARCHAR(20)   NOT NULL,
  receta_id                INT           NOT NULL,
  producto_terminado_id    INT           NULL,
  cantidad_planificada     DECIMAL(10,3) NOT NULL,
  cantidad_producida       DECIMAL(10,3) NULL,
  estado                   ENUM('PLANIFICADA','ABASTECIENDO','EN_PRODUCCION','FINALIZADA','CANCELADA')
                             NOT NULL DEFAULT 'PLANIFICADA',
  fecha_inicio_planificada DATE          NULL,
  fecha_fin_planificada    DATE          NULL,
  fecha_inicio_real        DATETIME      NULL,
  fecha_fin_real           DATETIME      NULL,
  responsable_usuario_id   INT           NULL,
  deposito_destino_id      INT           NULL,
  notas                    TEXT,
  costo_total_calculado    DECIMAL(12,2) NULL,
  created_by               INT           NULL,
  created_at               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_of_numero    (numero_of),
  INDEX idx_of_estado        (estado),
  INDEX idx_of_receta        (receta_id),
  INDEX idx_of_responsable   (responsable_usuario_id),
  FOREIGN KEY (receta_id) REFERENCES recetas_fabricacion(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insumos requeridos por orden (calculados al crear la OF)
CREATE TABLE of_insumos_requeridos (
  id                 INT           NOT NULL AUTO_INCREMENT,
  of_id              INT           NOT NULL,
  producto_id        INT           NOT NULL,
  cantidad_requerida DECIMAL(10,4) NOT NULL,
  cantidad_reservada DECIMAL(10,4) NOT NULL DEFAULT 0,
  cantidad_consumida DECIMAL(10,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_ofir_of       (of_id),
  INDEX idx_ofir_producto (producto_id),
  FOREIGN KEY (of_id) REFERENCES ordenes_fabricacion(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historial de estados de cada orden de fabricación
CREATE TABLE of_historial (
  id              INT          NOT NULL AUTO_INCREMENT,
  of_id           INT          NOT NULL,
  estado_anterior VARCHAR(30)  NULL,
  estado_nuevo    VARCHAR(30)  NOT NULL,
  usuario_id      INT          NULL,
  usuario_nombre  VARCHAR(100) NULL,
  observacion     TEXT,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ofh_of (of_id),
  FOREIGN KEY (of_id) REFERENCES ordenes_fabricacion(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
