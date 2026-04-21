const { query } = require('../../db/pg');

function getExecutor(client) {
  if (client && typeof client.query === 'function') {
    return client.query.bind(client);
  }
  return query;
}

function normalizeCodigo(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function genReferidoCodigo() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = (n) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `REF-${rand(3)}${Date.now().toString(36).toUpperCase().slice(-3)}`;
}

async function listPymes({ q, limit = 50, offset = 0, incluirInactivos = false } = {}) {
  const where = [];
  const params = [];
  if (!incluirInactivos) {
    where.push('p.activo = 1');
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(
      `(LOWER(p.nombre) LIKE $${params.length} OR LOWER(p.rubro) LIKE $${params.length} OR LOWER(p.contacto) LIKE $${params.length} OR LOWER(p.email) LIKE $${params.length} OR LOWER(p.telefono) LIKE $${params.length} OR LOWER(p.localidad) LIKE $${params.length})`
    );
  }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);
  const sql = `SELECT p.id, p.nombre, p.rubro, p.contacto, p.telefono, p.email, p.direccion, p.localidad, p.provincia,
                      p.notas, p.activo, p.external_id, p.creado_en, p.actualizado_en
                 FROM pymes_aliadas p
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY p.id DESC
                LIMIT $${params.length - 1}
               OFFSET $${params.length}`;
  const { rows } = await query(sql, params);
  return rows;
}

async function getPymeById(id) {
  const { rows } = await query(
    `SELECT id, nombre, activo FROM pymes_aliadas WHERE id = $1 LIMIT 1`,
    [Number(id)]
  );
  return rows[0] || null;
}

async function createPyme({ nombre, rubro, contacto, telefono, email, direccion, localidad, provincia, notas, activo, external_id }) {
  const { rows } = await query(
    `INSERT INTO pymes_aliadas(
        nombre, rubro, contacto, telefono, email, direccion, localidad, provincia, notas, activo, external_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      nombre,
      rubro || null,
      contacto || null,
      telefono || null,
      email || null,
      direccion || null,
      localidad || null,
      provincia || null,
      notas || null,
      typeof activo === 'boolean' ? activo : true,
      external_id || null,
    ]
  );
  return rows[0];
}

async function getAlianzaById(id) {
  const { rows } = await query(
    `SELECT id, pyme_id, nombre, estado, activo FROM alianzas WHERE id = $1 LIMIT 1`,
    [Number(id)]
  );
  return rows[0] || null;
}

async function updatePyme(id, fields = {}) {
  const sets = [];
  const params = [];
  let p = 1;
  const mapping = {
    nombre: 'nombre',
    rubro: 'rubro',
    contacto: 'contacto',
    telefono: 'telefono',
    email: 'email',
    direccion: 'direccion',
    localidad: 'localidad',
    provincia: 'provincia',
    notas: 'notas',
    activo: 'activo',
    external_id: 'external_id',
  };
  for (const [key, col] of Object.entries(mapping)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${p++}`);
      params.push(fields[key] ?? null);
    }
  }
  if (!sets.length) return { id };
  params.push(id);
  const { rows } = await query(
    `UPDATE pymes_aliadas SET ${sets.join(', ')}, actualizado_en = CURRENT_TIMESTAMP WHERE id = $${p} RETURNING id`,
    params
  );
  return rows[0] || null;
}

async function listAlianzas({ q, estado, pyme_id, limit = 50, offset = 0, incluirInactivas = false } = {}) {
  const where = [];
  const params = [];
  if (!incluirInactivas) {
    where.push('a.activo = 1');
  }
  if (estado) {
    params.push(estado);
    where.push(`a.estado = $${params.length}`);
  }
  if (pyme_id != null) {
    params.push(Number(pyme_id));
    where.push(`a.pyme_id = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(LOWER(a.nombre) LIKE $${params.length} OR LOWER(p.nombre) LIKE $${params.length})`);
  }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);
  const sql = `SELECT a.id, a.pyme_id, p.nombre AS pyme_nombre, a.nombre, a.estado, a.vigencia_desde, a.vigencia_hasta,
                      a.comision_tipo, a.comision_valor, a.beneficio_tipo, a.beneficio_valor, a.limite_usos,
                      a.notas, a.activo, a.external_id, a.creado_en, a.actualizado_en
                 FROM alianzas a
                 JOIN pymes_aliadas p ON p.id = a.pyme_id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY a.id DESC
                LIMIT $${params.length - 1}
               OFFSET $${params.length}`;
  const { rows } = await query(sql, params);
  return rows;
}

async function createAlianza({
  pyme_id,
  nombre,
  estado,
  vigencia_desde,
  vigencia_hasta,
  comision_tipo,
  comision_valor,
  beneficio_tipo,
  beneficio_valor,
  limite_usos,
  notas,
  activo,
  external_id,
}) {
  const { rows } = await query(
    `INSERT INTO alianzas(
        pyme_id, nombre, estado, vigencia_desde, vigencia_hasta,
        comision_tipo, comision_valor, beneficio_tipo, beneficio_valor, limite_usos, notas, activo, external_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      Number(pyme_id),
      nombre || null,
      estado || 'activa',
      vigencia_desde || null,
      vigencia_hasta || null,
      comision_tipo || 'porcentaje',
      Number(comision_valor || 0),
      beneficio_tipo || 'porcentaje',
      Number(beneficio_valor || 0),
      Number(limite_usos || 0),
      notas || null,
      typeof activo === 'boolean' ? activo : true,
      external_id || null,
    ]
  );
  return rows[0];
}

async function updateAlianza(id, fields = {}) {
  const sets = [];
  const params = [];
  let p = 1;
  const mapping = {
    pyme_id: 'pyme_id',
    nombre: 'nombre',
    estado: 'estado',
    vigencia_desde: 'vigencia_desde',
    vigencia_hasta: 'vigencia_hasta',
    comision_tipo: 'comision_tipo',
    comision_valor: 'comision_valor',
    beneficio_tipo: 'beneficio_tipo',
    beneficio_valor: 'beneficio_valor',
    limite_usos: 'limite_usos',
    notas: 'notas',
    activo: 'activo',
    external_id: 'external_id',
  };
  for (const [key, col] of Object.entries(mapping)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${p++}`);
      params.push(fields[key] ?? null);
    }
  }
  if (!sets.length) return { id };
  params.push(id);
  const { rows } = await query(
    `UPDATE alianzas SET ${sets.join(', ')}, actualizado_en = CURRENT_TIMESTAMP WHERE id = $${p} RETURNING id`,
    params
  );
  return rows[0] || null;
}

async function listOfertas(alianzaId, { incluirInactivas = false } = {}) {
  const where = ['o.alianza_id = $1'];
  const params = [Number(alianzaId)];
  if (!incluirInactivas) {
    where.push('o.activo = 1');
  }
  const sql = `SELECT o.id, o.alianza_id, o.nombre, o.descripcion, o.precio_fijo, o.activo, o.external_id, o.creado_en, o.actualizado_en
                 FROM alianzas_ofertas o
                WHERE ${where.join(' AND ')}
                ORDER BY o.id DESC`;
  const { rows } = await query(sql, params);
  return rows;
}

async function createOferta(alianzaId, { nombre, descripcion, precio_fijo, activo, external_id }) {
  const { rows } = await query(
    `INSERT INTO alianzas_ofertas(alianza_id, nombre, descripcion, precio_fijo, activo, external_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      Number(alianzaId),
      nombre,
      descripcion || null,
      precio_fijo != null ? Number(precio_fijo) : null,
      typeof activo === 'boolean' ? activo : true,
      external_id || null,
    ]
  );
  return rows[0];
}

async function updateOferta(id, fields = {}) {
  const sets = [];
  const params = [];
  let p = 1;
  const mapping = {
    nombre: 'nombre',
    descripcion: 'descripcion',
    precio_fijo: 'precio_fijo',
    activo: 'activo',
    external_id: 'external_id',
  };
  for (const [key, col] of Object.entries(mapping)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${p++}`);
      params.push(fields[key] ?? null);
    }
  }
  if (!sets.length) return { id };
  params.push(id);
  const { rows } = await query(
    `UPDATE alianzas_ofertas SET ${sets.join(', ')}, actualizado_en = CURRENT_TIMESTAMP WHERE id = $${p} RETURNING id`,
    params
  );
  return rows[0] || null;
}

async function listReferidos({ q, estado, alianza_id, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (estado) {
    params.push(estado);
    where.push(`r.estado = $${params.length}`);
  }
  if (alianza_id != null) {
    params.push(Number(alianza_id));
    where.push(`r.alianza_id = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`LOWER(r.codigo) LIKE $${params.length}`);
  }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);
  const sql = `SELECT r.id, r.alianza_id, a.nombre AS alianza_nombre, r.codigo, r.estado, r.max_usos, r.usos_actuales,
                      r.vigencia_desde, r.vigencia_hasta, r.beneficio_tipo, r.beneficio_valor, r.notas, r.external_id,
                      r.creado_en, r.actualizado_en
                 FROM referidos r
                 JOIN alianzas a ON a.id = r.alianza_id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY r.id DESC
                LIMIT $${params.length - 1}
               OFFSET $${params.length}`;
  const { rows } = await query(sql, params);
  return rows;
}

async function ensureCodigoDisponible(codigo, executor) {
  const { rows } = await executor('SELECT 1 FROM referidos WHERE codigo = $1 LIMIT 1', [codigo]);
  if (rows && rows.length) {
    const e = new Error('Codigo de referido ya existe');
    e.status = 409;
    throw e;
  }
}

async function createReferido(
  { alianza_id, codigo, estado, max_usos, vigencia_desde, vigencia_hasta, beneficio_tipo, beneficio_valor, notas, external_id },
  client
) {
  const exec = getExecutor(client);
  let finalCodigo = normalizeCodigo(codigo);
  if (finalCodigo) {
    await ensureCodigoDisponible(finalCodigo, exec);
  } else {
    let tries = 0;
    while (tries < 6) {
      const candidate = genReferidoCodigo();
      const { rows } = await exec('SELECT 1 FROM referidos WHERE codigo = $1 LIMIT 1', [candidate]);
      if (!rows || !rows.length) {
        finalCodigo = candidate;
        break;
      }
      tries += 1;
    }
    if (!finalCodigo) {
      const e = new Error('No se pudo generar un codigo unico');
      e.status = 500;
      throw e;
    }
  }
  const { rows } = await exec(
    `INSERT INTO referidos(
        alianza_id, codigo, estado, max_usos, vigencia_desde, vigencia_hasta, beneficio_tipo, beneficio_valor, notas, external_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, codigo`,
    [
      Number(alianza_id),
      finalCodigo,
      estado || 'activo',
      Number(max_usos || 0),
      vigencia_desde || null,
      vigencia_hasta || null,
      beneficio_tipo || null,
      beneficio_valor != null ? Number(beneficio_valor) : null,
      notas || null,
      external_id || null,
    ]
  );
  return rows[0];
}

async function updateReferido(id, fields = {}) {
  const sets = [];
  const params = [];
  let p = 1;
  const mapping = {
    codigo: 'codigo',
    estado: 'estado',
    max_usos: 'max_usos',
    usos_actuales: 'usos_actuales',
    vigencia_desde: 'vigencia_desde',
    vigencia_hasta: 'vigencia_hasta',
    beneficio_tipo: 'beneficio_tipo',
    beneficio_valor: 'beneficio_valor',
    notas: 'notas',
    external_id: 'external_id',
  };
  for (const [key, col] of Object.entries(mapping)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${p++}`);
      params.push(fields[key] ?? null);
    }
  }
  if (!sets.length) return { id };
  params.push(id);
  const { rows } = await query(
    `UPDATE referidos SET ${sets.join(', ')}, actualizado_en = CURRENT_TIMESTAMP WHERE id = $${p} RETURNING id`,
    params
  );
  return rows[0] || null;
}

async function getReferidoByCodigo(codigo, client) {
  const exec = getExecutor(client);
  const { rows } = await exec(
    `SELECT r.id AS referido_id,
            r.codigo,
            r.estado,
            r.max_usos,
            r.usos_actuales,
            r.vigencia_desde,
            r.vigencia_hasta,
            r.beneficio_tipo AS referido_beneficio_tipo,
            r.beneficio_valor AS referido_beneficio_valor,
            r.external_id AS referido_external_id,
            a.id AS alianza_id,
            a.nombre AS alianza_nombre,
            a.estado AS alianza_estado,
            a.activo AS alianza_activo,
            a.vigencia_desde AS alianza_vigencia_desde,
            a.vigencia_hasta AS alianza_vigencia_hasta,
            a.comision_tipo,
            a.comision_valor,
            a.beneficio_tipo AS alianza_beneficio_tipo,
            a.beneficio_valor AS alianza_beneficio_valor,
            a.limite_usos AS alianza_limite_usos,
            p.id AS pyme_id,
            p.nombre AS pyme_nombre,
            p.activo AS pyme_activo
       FROM referidos r
       JOIN alianzas a ON a.id = r.alianza_id
       JOIN pymes_aliadas p ON p.id = a.pyme_id
      WHERE r.codigo = $1
      LIMIT 1`,
    [normalizeCodigo(codigo)]
  );
  return rows[0] || null;
}

async function countUsosByAlianza(alianzaId, client) {
  const exec = getExecutor(client);
  const { rows } = await exec(
    `SELECT COUNT(*) AS total
       FROM uso_referidos u
       JOIN referidos r ON r.id = u.referido_id
      WHERE r.alianza_id = $1`,
    [Number(alianzaId)]
  );
  return Number(rows[0]?.total || 0);
}

async function reportAlianzas({ desde, hasta, alianza_id, pyme_id } = {}) {
  const where = [];
  const params = [];
  if (alianza_id != null) {
    params.push(Number(alianza_id));
    where.push(`a.id = $${params.length}`);
  }
  if (pyme_id != null) {
    params.push(Number(pyme_id));
    where.push(`a.pyme_id = $${params.length}`);
  }
  if (desde) {
    params.push(desde);
    where.push(`u.fecha >= $${params.length}`);
  }
  if (hasta) {
    params.push(hasta);
    where.push(`u.fecha <= $${params.length}`);
  }
  const sql = `SELECT a.id AS alianza_id,
                      a.nombre AS alianza_nombre,
                      p.id AS pyme_id,
                      p.nombre AS pyme_nombre,
                      COUNT(u.id) AS usos,
                      COALESCE(SUM(u.total_venta), 0)::float AS total_venta,
                      COALESCE(SUM(u.descuento_aplicado), 0)::float AS descuento_total,
                      COALESCE(SUM(u.comision_monto), 0)::float AS comision_total
                 FROM alianzas a
                 JOIN pymes_aliadas p ON p.id = a.pyme_id
            LEFT JOIN referidos r ON r.alianza_id = a.id
            LEFT JOIN uso_referidos u ON u.referido_id = r.id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                GROUP BY a.id, a.nombre, p.id, p.nombre
                ORDER BY comision_total DESC`;
  const { rows } = await query(sql, params);
  return rows;
}

async function ensureExternalIds(instanceId, client) {
  const exec = getExecutor(client);
  const pymePrefix = `PYME-${instanceId}-`;
  const alianzaPrefix = `ALIANZA-${instanceId}-`;
  const ofertaPrefix = `OFERTA-${instanceId}-`;
  const referidoPrefix = `REF-${instanceId}-`;
  await exec(
    'UPDATE pymes_aliadas SET external_id = $1 || id WHERE external_id IS NULL',
    [pymePrefix]
  );
  await exec(
    'UPDATE alianzas SET external_id = $1 || id WHERE external_id IS NULL',
    [alianzaPrefix]
  );
  await exec(
    'UPDATE alianzas_ofertas SET external_id = $1 || id WHERE external_id IS NULL',
    [ofertaPrefix]
  );
  await exec(
    'UPDATE referidos SET external_id = $1 || id WHERE external_id IS NULL',
    [referidoPrefix]
  );
}

async function exportSnapshot(client) {
  const exec = getExecutor(client);
  const pymes = await exec(
    `SELECT id, nombre, rubro, contacto, telefono, email, direccion, localidad, provincia, notas, activo, external_id,
            creado_en, actualizado_en
       FROM pymes_aliadas`
  );
  const alianzas = await exec(
    `SELECT id, pyme_id, nombre, estado, vigencia_desde, vigencia_hasta, comision_tipo, comision_valor,
            beneficio_tipo, beneficio_valor, limite_usos, notas, activo, external_id, creado_en, actualizado_en,
            (SELECT external_id FROM pymes_aliadas p WHERE p.id = alianzas.pyme_id) AS pyme_external_id
       FROM alianzas`
  );
  const ofertas = await exec(
    `SELECT o.id, o.alianza_id, o.nombre, o.descripcion, o.precio_fijo, o.activo, o.external_id, o.creado_en, o.actualizado_en,
            (SELECT external_id FROM alianzas a WHERE a.id = o.alianza_id) AS alianza_external_id
       FROM alianzas_ofertas o`
  );
  const referidos = await exec(
    `SELECT r.id, r.alianza_id, r.codigo, r.estado, r.max_usos, r.usos_actuales, r.vigencia_desde, r.vigencia_hasta,
            r.beneficio_tipo, r.beneficio_valor, r.notas, r.external_id, r.creado_en, r.actualizado_en,
            (SELECT external_id FROM alianzas a WHERE a.id = r.alianza_id) AS alianza_external_id
       FROM referidos r`
  );
  return {
    pymes: pymes.rows || pymes,
    alianzas: alianzas.rows || alianzas,
    ofertas: ofertas.rows || ofertas,
    referidos: referidos.rows || referidos,
  };
}

module.exports = {
  listPymes,
  getPymeById,
  createPyme,
  updatePyme,
  listAlianzas,
  getAlianzaById,
  createAlianza,
  updateAlianza,
  listOfertas,
  createOferta,
  updateOferta,
  listReferidos,
  createReferido,
  updateReferido,
  getReferidoByCodigo,
  countUsosByAlianza,
  reportAlianzas,
  normalizeCodigo,
  ensureExternalIds,
  exportSnapshot,
};
