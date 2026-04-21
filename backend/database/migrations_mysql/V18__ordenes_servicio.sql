-- ============================================================
-- V18: Módulo de Órdenes de Servicio / Servicio Técnico
-- ------------------------------------------------------------
-- Permite gestionar trabajos técnicos completos:
-- recepción → presupuesto → aceptación → ejecución →
-- entrega (con baja de stock) → facturación.
-- ============================================================

-- ─── 1. Tipos de trabajo (configurables por el administrador) ─────────────────
CREATE TABLE IF NOT EXISTS os_tipos_trabajo (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255) NULL,
  color       VARCHAR(7)   NOT NULL DEFAULT '#6366f1',
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_os_tipos_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO os_tipos_trabajo (nombre, descripcion, color) VALUES
  ('Reparación',    'Reparación de equipos o componentes',     '#ef4444'),
  ('Instalación',   'Instalación de nuevos equipos o insumos', '#3b82f6'),
  ('Mantenimiento', 'Mantenimiento preventivo o correctivo',   '#f59e0b'),
  ('Garantía',      'Trabajo cubierto por garantía',           '#10b981');

-- ─── 2. Tabla principal de órdenes de servicio ────────────────────────────────
CREATE TABLE IF NOT EXISTS ordenes_servicio (
  id                     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  -- Número legible, ej: OS-2024-0001. Generado por la aplicación.
  numero_os              VARCHAR(25)  NOT NULL UNIQUE,
  cliente_id             BIGINT UNSIGNED NOT NULL,
  tipo_trabajo_id        BIGINT UNSIGNED NULL,
  estado                 ENUM(
                           'recibido',
                           'presupuestado',
                           'aceptado',
                           'en_proceso',
                           'terminado',
                           'entregado',
                           'facturado',
                           'cancelado'
                         ) NOT NULL DEFAULT 'recibido',
  -- Descripción del problema reportado por el cliente
  descripcion_problema   TEXT         NOT NULL,
  -- Notas solo visibles para el equipo interno
  observaciones_internas TEXT         NULL,
  -- Mensaje para el cliente (ej. en el comprobante)
  observaciones_cliente  TEXT         NULL,
  -- Técnico/empleado responsable del trabajo
  tecnico_id             BIGINT UNSIGNED NULL,
  fecha_recepcion        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_estimada_entrega DATE         NULL,
  fecha_entrega_real     TIMESTAMP    NULL,
  -- Totales calculados al guardar insumos / presupuesto
  total_mano_obra        DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_insumos          DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_os               DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  -- Si el presupuesto fue comunicado y aceptado por el cliente
  presupuesto_aprobado   TINYINT(1)   NOT NULL DEFAULT 0,
  -- Venta generada al facturar (NULL hasta que se factura)
  venta_id               BIGINT UNSIGNED NULL,
  -- Usuario que creó la OS
  created_by             BIGINT UNSIGNED NULL,
  created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_os_cliente   (cliente_id),
  INDEX idx_os_estado    (estado),
  INDEX idx_os_tecnico   (tecnico_id),
  INDEX idx_os_fecha     (fecha_recepcion),
  INDEX idx_os_numero    (numero_os),

  CONSTRAINT fk_os_cliente    FOREIGN KEY (cliente_id)     REFERENCES clientes(id)         ON DELETE RESTRICT,
  CONSTRAINT fk_os_tipo       FOREIGN KEY (tipo_trabajo_id) REFERENCES os_tipos_trabajo(id) ON DELETE SET NULL,
  CONSTRAINT fk_os_tecnico    FOREIGN KEY (tecnico_id)      REFERENCES usuarios(id)         ON DELETE SET NULL,
  CONSTRAINT fk_os_creador    FOREIGN KEY (created_by)      REFERENCES usuarios(id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 3. Historial inmutable de cambios de estado ─────────────────────────────
-- Solo se insertan filas, nunca se modifican ni borran.
CREATE TABLE IF NOT EXISTS os_historial_estados (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  os_id           BIGINT UNSIGNED NOT NULL,
  estado_anterior ENUM(
                    'recibido','presupuestado','aceptado','en_proceso',
                    'terminado','entregado','facturado','cancelado'
                  ) NULL,
  estado_nuevo    ENUM(
                    'recibido','presupuestado','aceptado','en_proceso',
                    'terminado','entregado','facturado','cancelado'
                  ) NOT NULL,
  usuario_id      BIGINT UNSIGNED NULL,
  usuario_nombre  VARCHAR(150)    NULL,
  observacion     TEXT            NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_osh_os (os_id),
  CONSTRAINT fk_osh_os      FOREIGN KEY (os_id)      REFERENCES ordenes_servicio(id) ON DELETE CASCADE,
  CONSTRAINT fk_osh_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 4. Insumos y materiales utilizados en la orden ──────────────────────────
CREATE TABLE IF NOT EXISTS os_insumos_usados (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  os_id           BIGINT UNSIGNED NOT NULL,
  producto_id     BIGINT UNSIGNED NOT NULL,
  cantidad        DECIMAL(10,2)   NOT NULL DEFAULT 1.00,
  precio_unitario DECIMAL(14,2)   NOT NULL DEFAULT 0.00,
  subtotal        DECIMAL(14,2)   NOT NULL DEFAULT 0.00,
  notas           VARCHAR(255)    NULL,
  created_by      BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_osins_os      (os_id),
  INDEX idx_osins_prod    (producto_id),
  CONSTRAINT fk_osins_os      FOREIGN KEY (os_id)       REFERENCES ordenes_servicio(id) ON DELETE CASCADE,
  CONSTRAINT fk_osins_prod    FOREIGN KEY (producto_id)  REFERENCES productos(id)        ON DELETE RESTRICT,
  CONSTRAINT fk_osins_user    FOREIGN KEY (created_by)   REFERENCES usuarios(id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 5. Documentos adjuntos a la orden ───────────────────────────────────────
-- URL almacenada tras subir a Cloudinary (o cualquier storage externo).
CREATE TABLE IF NOT EXISTS os_documentos (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  os_id           BIGINT UNSIGNED NOT NULL,
  nombre_archivo  VARCHAR(255)    NOT NULL,
  tipo_mime       VARCHAR(100)    NULL,
  url_archivo     TEXT            NOT NULL,
  descripcion     VARCHAR(255)    NULL,
  -- JSON: ["admin","gerente"] → solo esos roles pueden ver el doc.
  -- NULL → visible para todos los roles con acceso a la OS.
  acceso_roles    JSON            NULL,
  uploaded_by     BIGINT UNSIGNED NULL,
  -- Soft-delete para no perder la URL accidentalmente
  activo          TINYINT(1)      NOT NULL DEFAULT 1,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_osdoc_os (os_id),
  CONSTRAINT fk_osdoc_os   FOREIGN KEY (os_id)       REFERENCES ordenes_servicio(id) ON DELETE CASCADE,
  CONSTRAINT fk_osdoc_user FOREIGN KEY (uploaded_by) REFERENCES usuarios(id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 6. Líneas del presupuesto presentado al cliente ─────────────────────────
CREATE TABLE IF NOT EXISTS os_presupuesto_items (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  os_id           BIGINT UNSIGNED NOT NULL,
  descripcion     VARCHAR(500)    NOT NULL,
  cantidad        DECIMAL(10,2)   NOT NULL DEFAULT 1.00,
  precio_unitario DECIMAL(14,2)   NOT NULL DEFAULT 0.00,
  subtotal        DECIMAL(14,2)   NOT NULL DEFAULT 0.00,
  -- Para mostrar en el orden correcto en el presupuesto impreso
  orden           SMALLINT        NOT NULL DEFAULT 0,

  INDEX idx_ospres_os (os_id),
  CONSTRAINT fk_ospres_os FOREIGN KEY (os_id) REFERENCES ordenes_servicio(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
