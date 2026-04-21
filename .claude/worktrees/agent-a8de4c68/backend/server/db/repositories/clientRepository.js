const { query } = require('../../db/pg');

async function list({
  q,
  estado,
  tipo_cliente,
  segmento,
  limit = 50,
  offset = 0,
  allowAll = false,
  view,
} = {}) {
  const where = [];
  const params = [];
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(
      `(LOWER(nombre) LIKE $${params.length} OR LOWER(apellido) LIKE $${params.length} OR LOWER(CONCAT(nombre, ' ', COALESCE(apellido, ''))) LIKE $${params.length})`
    );
  }
  if (estado) {
    params.push(estado);
    where.push(`estado = $${params.length}`);
  }
  if (tipo_cliente) {
    params.push(tipo_cliente);
    where.push(`tipo_cliente = $${params.length}`);
  }
  if (segmento) {
    params.push(segmento);
    where.push(`segmento = $${params.length}`);
  }
  const maxLimit = allowAll ? 10000 : 200;
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), maxLimit);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);
  const viewMode = String(view || '').trim().toLowerCase();
  const selectColumns =
    viewMode === 'mobile'
      ? `id, nombre, apellido, telefono, email, direccion, entre_calles, cuit_cuil,
         tipo_doc, nro_doc, condicion_iva, domicilio_fiscal, provincia, localidad, codigo_postal,
         zona_id, estado, tipo_cliente, segmento, tags`
      : `id, nombre, apellido, telefono, email, direccion, entre_calles, cuit_cuil,
         tipo_doc, nro_doc, condicion_iva, domicilio_fiscal, provincia, localidad, codigo_postal,
         zona_id, fecha_registro, estado, tipo_cliente, segmento, tags`;

  const sql = `SELECT ${selectColumns}
                 FROM clientes
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY id DESC
                LIMIT $${params.length - 1}
               OFFSET $${params.length}`;
  const { rows } = await query(sql, params);
  return rows;
}

async function create({
  nombre,
  apellido,
  telefono,
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
  zona_id,
  estado = 'activo',
  tipo_cliente = 'minorista',
  segmento = null,
  tags = null,
}) {
  const { rows } = await query(
    `INSERT INTO clientes(
        nombre, apellido, telefono, email, direccion, entre_calles, cuit_cuil,
        tipo_doc, nro_doc, condicion_iva, domicilio_fiscal, provincia, localidad, codigo_postal,
        zona_id, estado, tipo_cliente, segmento, tags
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING id`,
    [
      nombre,
      apellido || null,
      telefono || null,
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
      zona_id || null,
      estado,
      tipo_cliente || 'minorista',
      segmento || null,
      tags || null,
    ]
  );
  return rows[0];
}

async function findByEmail(email) {
  const { rows } = await query(
    `SELECT id, nombre, apellido, email, estado
       FROM clientes
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT id, nombre, apellido, email, estado
       FROM clientes
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function update(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  for (const [key, col] of Object.entries({
    nombre: 'nombre',
    apellido: 'apellido',
    telefono: 'telefono',
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
    tags: 'tags',
  })) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${p++}`);
      params.push(fields[key] ?? null);
    }
  }
  if (!sets.length) return { id };
  params.push(id);
  const { rows } = await query(`UPDATE clientes SET ${sets.join(', ')} WHERE id = $${p} RETURNING id`, params);
  return rows[0] || null;
}

async function remove(id) {
  const { rows } = await query('SELECT estado FROM clientes WHERE id = $1', [id]);
  if (!rows.length) {
    return null;
  }
  const current = rows[0];
  if (current.estado !== 'inactivo') {
    const e = new Error('El cliente debe estar inactivo antes de poder eliminarlo');
    e.status = 400;
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
    e.deudaPendiente = deudaPendiente;
    throw e;
  }

  const deleted = await query('DELETE FROM clientes WHERE id = $1 RETURNING id', [id]);
  return deleted.rows[0] || null;
}

module.exports = { list, create, update, remove, findByEmail, findById };
