const { query, withTransaction } = require('../../db/pg');
const automationEventRepo = require('./automationEventRepository');
const clientDepositoRepo = require('./clientDepositoRepository');
const {
  buildClientVisibilityClause,
  resolveClientVisibilityCapabilities,
} = require('../../lib/clientVisibility');

function buildDepositoMatchClause(clientAlias, paramRef, capabilities) {
  const clauses = [];
  if (capabilities.hasDepositoPrincipal) {
    clauses.push(`${clientAlias}.deposito_principal_id = ${paramRef}`);
  }
  if (capabilities.hasClientesDepositos) {
    clauses.push(`EXISTS (
      SELECT 1
        FROM clientes_depositos cd
       WHERE cd.cliente_id = ${clientAlias}.id
         AND cd.deposito_id = ${paramRef}
    )`);
  }
  clauses.push(`EXISTS (
    SELECT 1
      FROM ventas cv
     WHERE cv.cliente_id = ${clientAlias}.id
       AND cv.deposito_id = ${paramRef}
  )`);
  return clauses.length === 1 ? clauses[0] : `(${clauses.join('\n    OR ')})`;
}

function buildResponsableMatchClause(clientAlias, paramRef, capabilities) {
  if (capabilities.hasResponsableUsuario) {
    return `${clientAlias}.responsable_usuario_id = ${paramRef}`;
  }
  return `EXISTS (
    SELECT 1
      FROM ventas cv
     WHERE cv.cliente_id = ${clientAlias}.id
       AND cv.usuario_id = ${paramRef}
  )`;
}

async function list({
  q,
  estado,
  tipo_cliente,
  segmento,
  deposito_id,
  responsable_usuario_id,
  clientVisibility,
  limit = 50,
  offset = 0,
  allowAll = false,
  view,
  includeDeleted = false,
  onlyDeleted = false,
} = {}) {
  const capabilities = await resolveClientVisibilityCapabilities();
  const where = [];
  const params = [];
  if (onlyDeleted) where.push('clientes.deleted_at IS NOT NULL');
  else if (!includeDeleted) where.push('clientes.deleted_at IS NULL');
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(
      `(LOWER(clientes.nombre) LIKE $${params.length} OR LOWER(clientes.apellido) LIKE $${params.length} OR LOWER(CONCAT(clientes.nombre, ' ', COALESCE(clientes.apellido, ''))) LIKE $${params.length})`
    );
  }
  if (estado) {
    params.push(estado);
    where.push(`clientes.estado = $${params.length}`);
  }
  if (tipo_cliente) {
    params.push(tipo_cliente);
    where.push(`clientes.tipo_cliente = $${params.length}`);
  }
  if (segmento) {
    params.push(segmento);
    where.push(`clientes.segmento = $${params.length}`);
  }
  if (responsable_usuario_id != null) {
    const responsableId = Number(responsable_usuario_id);
    if (Number.isInteger(responsableId) && responsableId > 0) {
      params.push(responsableId);
      where.push(
        buildResponsableMatchClause('clientes', `$${params.length}`, capabilities)
      );
    }
  }
  if (deposito_id != null) {
    const depositoId = Number(deposito_id);
    if (Number.isInteger(depositoId) && depositoId > 0) {
      params.push(depositoId);
      where.push(buildDepositoMatchClause('clientes', `$${params.length}`, capabilities));
    }
  }
  const visibilityClause = buildClientVisibilityClause(
    params,
    clientVisibility,
    'clientes',
    capabilities
  );
  if (visibilityClause) {
    where.push(visibilityClause);
  }
  const maxLimit = allowAll ? 10000 : 200;
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), maxLimit);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);
  const viewMode = String(view || '').trim().toLowerCase();
  const selectColumns = [
    'clientes.id',
    'clientes.nombre',
    'clientes.apellido',
    'clientes.telefono',
    'clientes.telefono_e164',
    'clientes.whatsapp_opt_in',
    'clientes.whatsapp_opt_in_at',
    'clientes.whatsapp_status',
    'clientes.whatsapp_last_error',
    'clientes.email',
    'clientes.direccion',
    'clientes.entre_calles',
    'clientes.cuit_cuil',
    'clientes.tipo_doc',
    'clientes.nro_doc',
    'clientes.condicion_iva',
    'clientes.domicilio_fiscal',
    'clientes.provincia',
    'clientes.localidad',
    'clientes.codigo_postal',
    'clientes.zona_id',
  ];
  if (viewMode !== 'mobile') {
    selectColumns.push('clientes.fecha_registro');
  }
  selectColumns.push(
    'clientes.estado',
    'clientes.tipo_cliente',
    'clientes.segmento',
    'clientes.lead_score',
    'clientes.lead_segmento',
    'clientes.lead_score_updated_at',
    'clientes.fecha_nacimiento',
    'clientes.tags',
    'clientes.deleted_at'
  );
  if (capabilities.hasDepositoPrincipal) {
    selectColumns.push(
      'clientes.deposito_principal_id',
      'd.nombre AS deposito_principal_nombre',
      'd.codigo AS deposito_principal_codigo'
    );
  } else {
    selectColumns.push(
      'NULL AS deposito_principal_id',
      'NULL AS deposito_principal_nombre',
      'NULL AS deposito_principal_codigo'
    );
  }
  if (capabilities.hasResponsableUsuario) {
    selectColumns.push(
      'clientes.responsable_usuario_id',
      'ru.nombre AS responsable_nombre',
      'rr.nombre AS responsable_rol'
    );
  } else {
    selectColumns.push(
      'NULL AS responsable_usuario_id',
      'NULL AS responsable_nombre',
      'NULL AS responsable_rol'
    );
  }

  const joins = [];
  if (capabilities.hasDepositoPrincipal) {
    joins.push('LEFT JOIN depositos d ON d.id = clientes.deposito_principal_id');
  }
  if (capabilities.hasResponsableUsuario) {
    joins.push('LEFT JOIN usuarios ru ON ru.id = clientes.responsable_usuario_id');
    joins.push('LEFT JOIN roles rr ON rr.id = ru.rol_id');
  }

  const sql = `SELECT ${selectColumns.join(', ')}
                 FROM clientes
                ${joins.join('\n            ')}
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY clientes.id DESC
                LIMIT $${params.length - 1}
               OFFSET $${params.length}`;
  const { rows } = await query(sql, params);
  return rows;
}

async function create({
  nombre,
  apellido,
  telefono,
  telefono_e164,
  whatsapp_opt_in = 0,
  whatsapp_opt_in_at,
  whatsapp_status = 'unknown',
  whatsapp_last_error,
  email,
  direccion,
  entre_calles,
  cuit_cuil,
  tipo_doc,
  nro_doc,
  condicion_iva,
  domicilio_fiscal,
  provincia,
  localidad,
  codigo_postal,
  fecha_nacimiento,
  zona_id,
  estado = 'activo',
  tipo_cliente = 'minorista',
  segmento = null,
  tags = null,
  deposito_principal_id = null,
  responsable_usuario_id = null,
}) {
  return withTransaction(async (client) => {
    const capabilities = await resolveClientVisibilityCapabilities(client);
    const columns = [
      'nombre',
      'apellido',
      'telefono',
      'telefono_e164',
      'whatsapp_opt_in',
      'whatsapp_opt_in_at',
      'whatsapp_status',
      'whatsapp_last_error',
      'email',
      'direccion',
      'entre_calles',
      'cuit_cuil',
      'tipo_doc',
      'nro_doc',
      'condicion_iva',
      'domicilio_fiscal',
      'provincia',
      'localidad',
      'codigo_postal',
      'fecha_nacimiento',
      'zona_id',
    ];
    const values = [
      nombre,
      apellido || null,
      telefono || null,
      telefono_e164 || null,
      whatsapp_opt_in ? 1 : 0,
      whatsapp_opt_in_at || null,
      whatsapp_status || 'unknown',
      whatsapp_last_error || null,
      email || null,
      direccion || null,
      entre_calles || null,
      cuit_cuil || null,
      tipo_doc || null,
      nro_doc || null,
      condicion_iva || null,
      domicilio_fiscal || null,
      provincia || null,
      localidad || null,
      codigo_postal || null,
      fecha_nacimiento || null,
      zona_id || null,
    ];

    if (capabilities.hasDepositoPrincipal) {
      columns.push('deposito_principal_id');
      values.push(deposito_principal_id || null);
    }
    if (capabilities.hasResponsableUsuario) {
      columns.push('responsable_usuario_id');
      values.push(responsable_usuario_id || null);
    }

    columns.push(
      'estado',
      'tipo_cliente',
      'segmento',
      'lead_score',
      'lead_segmento',
      'lead_score_updated_at',
      'tags',
      'deleted_at'
    );
    values.push(
      estado,
      tipo_cliente || 'minorista',
      segmento || null,
      0,
      'inactivo',
      null,
      tags || null,
      null
    );

    const placeholders = values.map((_, index) => `$${index + 1}`).join(',');
    const { rows } = await client.query(
      `INSERT INTO clientes(${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING id`,
      values
    );

    const created = rows[0] || null;
    if (created?.id) {
      await clientDepositoRepo.linkClienteDepositoTx(client, created.id, deposito_principal_id);
      await automationEventRepo.enqueueTx(client, {
        eventName: 'cliente_creado',
        aggregateType: 'cliente',
        aggregateId: created.id,
        idempotencyKey: `cliente:${created.id}:creado`,
        payload: {
          cliente_id: created.id,
          nombre,
          apellido: apellido || null,
          telefono,
          telefono_e164: telefono_e164 || null,
          whatsapp_opt_in: Boolean(whatsapp_opt_in),
          email: email || null,
          tipo_cliente: tipo_cliente || 'minorista',
          segmento: segmento || null,
        },
      });
    }

    return created;
  });
}

async function findByEmail(email) {
  const { rows } = await query(
    `SELECT id, nombre, apellido, email, estado
       FROM clientes
      WHERE LOWER(email) = LOWER($1)
        AND deleted_at IS NULL
      LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const capabilities = await resolveClientVisibilityCapabilities();
  const columns = [
    'id',
    'nombre',
    'apellido',
    'email',
    'estado',
    'deleted_at',
  ];
  columns.push(
    capabilities.hasDepositoPrincipal
      ? 'deposito_principal_id'
      : 'NULL AS deposito_principal_id'
  );
  columns.push(
    capabilities.hasResponsableUsuario
      ? 'responsable_usuario_id'
      : 'NULL AS responsable_usuario_id'
  );
  const { rows } = await query(
    `SELECT ${columns.join(',\n            ')}
       FROM clientes
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findByPhoneE164(telefonoE164) {
  const normalized = String(telefonoE164 || '').trim();
  if (!normalized) return null;
  const { rows } = await query(
    `SELECT id,
            nombre,
            apellido,
            telefono,
            telefono_e164,
            whatsapp_opt_in,
            whatsapp_status,
            lead_score,
            lead_segmento,
            email,
            estado
       FROM clientes
      WHERE telefono_e164 = $1
        AND deleted_at IS NULL
      LIMIT 1`,
    [normalized]
  );
  return rows[0] || null;
}

async function update(id, fields) {
  return withTransaction(async (client) => {
    const capabilities = await resolveClientVisibilityCapabilities(client);
    const optionalColumns = {
      ...(capabilities.hasDepositoPrincipal
        ? { deposito_principal_id: 'deposito_principal_id' }
        : {}),
      ...(capabilities.hasResponsableUsuario
        ? { responsable_usuario_id: 'responsable_usuario_id' }
        : {}),
    };
    const sets = [];
    const params = [];
    let p = 1;
    for (const [key, col] of Object.entries({
      nombre: 'nombre',
      apellido: 'apellido',
      telefono: 'telefono',
      telefono_e164: 'telefono_e164',
      whatsapp_opt_in: 'whatsapp_opt_in',
      whatsapp_opt_in_at: 'whatsapp_opt_in_at',
      whatsapp_status: 'whatsapp_status',
      whatsapp_last_error: 'whatsapp_last_error',
      email: 'email',
      direccion: 'direccion',
      entre_calles: 'entre_calles',
      cuit_cuil: 'cuit_cuil',
      tipo_doc: 'tipo_doc',
      nro_doc: 'nro_doc',
      condicion_iva: 'condicion_iva',
      domicilio_fiscal: 'domicilio_fiscal',
      provincia: 'provincia',
      localidad: 'localidad',
      codigo_postal: 'codigo_postal',
      zona_id: 'zona_id',
      estado: 'estado',
      tipo_cliente: 'tipo_cliente',
      segmento: 'segmento',
      fecha_nacimiento: 'fecha_nacimiento',
      tags: 'tags',
      deleted_at: 'deleted_at',
      ...optionalColumns,
    })) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        sets.push(`${col} = $${p++}`);
        params.push(fields[key] ?? null);
      }
    }
    if (!sets.length) return { id };
    params.push(id);
    const { rows } = await client.query(
      `UPDATE clientes
          SET ${sets.join(', ')}
        WHERE id = $${p}
          AND deleted_at IS NULL
        RETURNING id`,
      params
    );
    const updated = rows[0] || null;
    if (updated?.id && fields.deposito_principal_id) {
      await clientDepositoRepo.linkClienteDepositoTx(
        client,
        updated.id,
        fields.deposito_principal_id
      );
    }
    return updated;
  });
}

async function remove(id) {
  const { rows } = await query(
    'SELECT estado, deleted_at FROM clientes WHERE id = $1 LIMIT 1',
    [id]
  );
  if (!rows.length) {
    return null;
  }
  const current = rows[0];
  if (current.deleted_at) {
    return { id };
  }
  if (current.estado !== 'inactivo') {
    const e = new Error('El cliente debe estar inactivo antes de poder eliminarlo');
    e.status = 400;
    e.code = 'CLIENTE_DEBE_INACTIVARSE';
    throw e;
  }

  // Calcular deuda pendiente usando la vista_deudas
  const { rows: deudaRows } = await query(
    'SELECT deuda_pendiente FROM vista_deudas WHERE cliente_id = $1',
    [id]
  );
  const deudaPendiente =
    deudaRows.length && deudaRows[0].deuda_pendiente != null
      ? Number(deudaRows[0].deuda_pendiente)
      : 0;

  if (deudaPendiente > 0.0001) {
    const e = new Error(
      `No se puede eliminar el cliente porque tiene una deuda pendiente de $${deudaPendiente.toFixed(
        2
      )}`
    );
    e.status = 400;
    e.code = 'CLIENTE_CON_DEUDA';
    e.deudaPendiente = deudaPendiente;
    throw e;
  }

  const deleted = await query(
    `UPDATE clientes
        SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP)
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING id`,
    [id]
  );
  return deleted.rows[0] || null;
}

async function restore(id) {
  const { rows } = await query(
    `UPDATE clientes
        SET deleted_at = NULL,
            estado = CASE WHEN estado = 'inactivo' THEN 'activo' ELSE estado END
      WHERE id = $1
        AND deleted_at IS NOT NULL
      RETURNING id`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Historial unificado de pagos de un cliente:
 * pagos de ventas, pagos de cuenta, pagos de deudas iniciales y entregas.
 *
 * Query en MySQL puro — no mezclar sintaxis SQLite/PostgreSQL aquí.
 */
async function listPaymentHistory(clienteId, { limit = 200, offset = 0, deposito_id = null } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const depositoId = Number(deposito_id);
  const hasDepositoScope = Number.isInteger(depositoId) && depositoId > 0;
  const params = hasDepositoScope ? [clienteId, depositoId, lim, off] : [clienteId, lim, off];
  const depositoFilterPagoVenta = hasDepositoScope ? ' AND v.deposito_id = $2' : '';
  const depositoFilterEntrega = hasDepositoScope ? ' AND v.deposito_id = $2' : '';
  const pagoCuentaClause = hasDepositoScope ? ' AND p.venta_id IS NOT NULL' : '';
  const deudaInicialClause = hasDepositoScope ? ' AND 1 = 0' : '';

  const { rows } = await query(
    `SELECT id, tipo, venta_id, monto, fecha, detalle
       FROM (
         SELECT
           p.id                                              AS id,
           CASE
             WHEN p.venta_id IS NULL THEN 'pago_cuenta'
             ELSE 'pago_venta'
           END                                              AS tipo,
           p.venta_id                                       AS venta_id,
           p.monto                                          AS monto,
           p.fecha                                          AS fecha,
           NULL                                             AS detalle
         FROM pagos p
         LEFT JOIN ventas v ON v.id = p.venta_id
        WHERE p.cliente_id = $1
          AND (p.venta_id IS NULL OR v.estado_pago <> 'cancelado')
          ${depositoFilterPagoVenta}
          ${pagoCuentaClause}

         UNION ALL

         SELECT
           p.id                                             AS id,
           'pago_deuda_inicial'                             AS tipo,
           NULL                                             AS venta_id,
           p.monto                                          AS monto,
           p.fecha                                          AS fecha,
           p.descripcion                                    AS detalle
         FROM clientes_deudas_iniciales_pagos p
        WHERE p.cliente_id = $1
          ${deudaInicialClause}

         UNION ALL

         SELECT
           v.id                                             AS id,
           'entrega_venta'                                  AS tipo,
           v.id                                             AS venta_id,
           NULL                                             AS monto,
           v.fecha_entrega                                  AS fecha,
           COALESCE(
             GROUP_CONCAT(
               CONCAT(pr.nombre, ' x', vd.cantidad)
               ORDER BY pr.nombre
               SEPARATOR ', '
             ),
             ''
           )                                               AS detalle
        FROM ventas v
        JOIN ventas_detalle vd ON vd.venta_id = v.id
        JOIN productos pr      ON pr.id = vd.producto_id
        WHERE v.cliente_id = $1
          AND v.estado_entrega = 'entregado'
          ${depositoFilterEntrega}
        GROUP BY v.id, v.fecha_entrega
       ) AS historial
      ORDER BY (fecha IS NULL) ASC, fecha DESC, id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

module.exports = {
  list,
  create,
  update,
  remove,
  restore,
  findByEmail,
  findById,
  findByPhoneE164,
  listPaymentHistory,
};
