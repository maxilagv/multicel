const { query } = require('../../db/pg');
const configRepo = require('./configRepository');

const COMMISSION_MODE_KEY = 'comision_vendedores_modo';
const COMMISSION_KEYS = {
  local: 'comision_lista_local_pct',
  distribuidor: 'comision_lista_distribuidor_pct',
  final: 'comision_lista_final_pct',
  oferta: 'comision_lista_oferta_pct',
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function listOffers({ incluirInactivas = false, q, tipo, producto_id, lista_precio_objetivo } = {}) {
  const where = [];
  const params = [];
  if (!incluirInactivas) {
    where.push('o.activo = 1');
  }
  if (q) {
    params.push(`%${String(q).trim().toLowerCase()}%`);
    where.push(
      `(LOWER(o.nombre) LIKE $${params.length} OR LOWER(COALESCE(o.descripcion, '')) LIKE $${params.length})`
    );
  }
  if (tipo) {
    params.push(String(tipo).trim().toLowerCase());
    where.push(`LOWER(o.tipo_oferta) = $${params.length}`);
  }
  if (producto_id != null) {
    const pid = Number(producto_id);
    if (Number.isInteger(pid) && pid > 0) {
      params.push(pid);
      where.push(`o.producto_id = $${params.length}`);
    }
  }
  if (lista_precio_objetivo) {
    params.push(String(lista_precio_objetivo).trim().toLowerCase());
    where.push(`LOWER(o.lista_precio_objetivo) = $${params.length}`);
  }

  const { rows } = await query(
    `SELECT o.id,
            o.nombre,
            o.descripcion,
            o.tipo_oferta,
            o.producto_id,
            p.nombre AS producto_nombre,
            o.lista_precio_objetivo,
            o.cantidad_minima,
            o.descuento_pct::float AS descuento_pct,
            o.fecha_desde,
            o.fecha_hasta,
            o.prioridad,
            o.activo,
            o.creado_en,
            o.actualizado_en
       FROM ofertas_precios o
  LEFT JOIN productos p ON p.id = o.producto_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY o.activo DESC, o.prioridad DESC, o.id DESC`,
    params
  );
  return rows;
}

async function createOffer(payload) {
  const {
    nombre,
    descripcion,
    tipo_oferta,
    producto_id,
    lista_precio_objetivo,
    cantidad_minima,
    descuento_pct,
    fecha_desde,
    fecha_hasta,
    prioridad,
    activo,
  } = payload || {};
  const { rows } = await query(
    `INSERT INTO ofertas_precios(
       nombre, descripcion, tipo_oferta, producto_id, lista_precio_objetivo, cantidad_minima,
       descuento_pct, fecha_desde, fecha_hasta, prioridad, activo
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      String(nombre || '').trim(),
      descripcion ? String(descripcion).trim() : null,
      String(tipo_oferta || '').trim().toLowerCase(),
      producto_id ? Number(producto_id) : null,
      String(lista_precio_objetivo || '').trim().toLowerCase() || 'todas',
      Math.max(1, Math.trunc(Number(cantidad_minima || 1))),
      toNumber(descuento_pct, 0),
      fecha_desde || null,
      fecha_hasta || null,
      Math.trunc(Number(prioridad || 0)),
      activo === false ? 0 : 1,
    ]
  );
  return rows[0] || null;
}

async function updateOffer(id, payload) {
  const sets = [];
  const params = [];
  let p = 1;

  const add = (field, value) => {
    sets.push(`${field} = $${p++}`);
    params.push(value);
  };

  if (Object.prototype.hasOwnProperty.call(payload, 'nombre')) {
    add('nombre', String(payload.nombre || '').trim());
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'descripcion')) {
    add('descripcion', payload.descripcion ? String(payload.descripcion).trim() : null);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'tipo_oferta')) {
    add('tipo_oferta', String(payload.tipo_oferta || '').trim().toLowerCase());
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'producto_id')) {
    add('producto_id', payload.producto_id ? Number(payload.producto_id) : null);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'lista_precio_objetivo')) {
    add(
      'lista_precio_objetivo',
      String(payload.lista_precio_objetivo || '').trim().toLowerCase() || 'todas'
    );
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'cantidad_minima')) {
    add('cantidad_minima', Math.max(1, Math.trunc(Number(payload.cantidad_minima || 1))));
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'descuento_pct')) {
    add('descuento_pct', toNumber(payload.descuento_pct, 0));
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'fecha_desde')) {
    add('fecha_desde', payload.fecha_desde || null);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'fecha_hasta')) {
    add('fecha_hasta', payload.fecha_hasta || null);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'prioridad')) {
    add('prioridad', Math.trunc(Number(payload.prioridad || 0)));
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'activo')) {
    add('activo', payload.activo ? 1 : 0);
  }

  if (!sets.length) return { id };
  sets.push('actualizado_en = CURRENT_TIMESTAMP');
  params.push(id);
  const { rows } = await query(
    `UPDATE ofertas_precios
        SET ${sets.join(', ')}
      WHERE id = $${p}
      RETURNING id`,
    params
  );
  return rows[0] || null;
}

async function getCommissionConfig() {
  const [modeRaw, local, distribuidor, finalPct, oferta] = await Promise.all([
    configRepo.getTextParam(COMMISSION_MODE_KEY),
    configRepo.getNumericParam(COMMISSION_KEYS.local),
    configRepo.getNumericParam(COMMISSION_KEYS.distribuidor),
    configRepo.getNumericParam(COMMISSION_KEYS.final),
    configRepo.getNumericParam(COMMISSION_KEYS.oferta),
  ]);
  const mode = String(modeRaw || 'producto').trim().toLowerCase() === 'lista' ? 'lista' : 'producto';
  return {
    mode,
    porcentajes: {
      local: toNumber(local, 0),
      distribuidor: toNumber(distribuidor, 0),
      final: toNumber(finalPct, 0),
      oferta: toNumber(oferta, 0),
    },
  };
}

async function setCommissionConfig({ mode, porcentajes = {}, usuarioId = null }) {
  const finalMode = String(mode || '').trim().toLowerCase() === 'lista' ? 'lista' : 'producto';
  await configRepo.setTextParam(COMMISSION_MODE_KEY, finalMode, usuarioId);
  const tasks = [];
  for (const [key, paramKey] of Object.entries(COMMISSION_KEYS)) {
    if (Object.prototype.hasOwnProperty.call(porcentajes, key)) {
      const value = Math.max(0, Math.min(100, toNumber(porcentajes[key], 0)));
      tasks.push(configRepo.setNumericParam(paramKey, value, usuarioId));
    }
  }
  await Promise.all(tasks);
  return getCommissionConfig();
}

module.exports = {
  COMMISSION_MODE_KEY,
  COMMISSION_KEYS,
  listOffers,
  createOffer,
  updateOffer,
  getCommissionConfig,
  setCommissionConfig,
};
