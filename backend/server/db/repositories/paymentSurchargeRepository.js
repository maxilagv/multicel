const { query, withTransaction } = require('../../db/pg');

const COLUMN_CACHE = new Map();

async function tableExists(tableName) {
  if (COLUMN_CACHE.has(`table:${tableName}`)) return COLUMN_CACHE.get(`table:${tableName}`);
  const { rows } = await query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = $1 LIMIT 1`,
    [tableName]
  );
  const exists = Boolean(rows?.length);
  COLUMN_CACHE.set(`table:${tableName}`, exists);
  return exists;
}

function serializeSurcharge(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    metodo_pago_id: Number(row.metodo_pago_id),
    metodo_pago_nombre: row.metodo_pago_nombre || null,
    lista_precio_id: row.lista_precio_id != null ? Number(row.lista_precio_id) : null,
    lista_precio_nombre: row.lista_precio_nombre || null,
    lista_precio_slug: row.lista_precio_slug || null,
    tipo: String(row.tipo || 'recargo'),
    valor_pct: Number(row.valor_pct || 0),
    activo: Number(row.activo) === 1,
    creado_en: row.creado_en || null,
    actualizado_en: row.actualizado_en || null,
  };
}

const SURCHARGE_SELECT = `
  SELECT mpr.id,
         mpr.metodo_pago_id,
         mpr.lista_precio_id,
         mpr.tipo,
         mpr.valor_pct::float AS valor_pct,
         mpr.activo,
         mpr.creado_en,
         mpr.actualizado_en,
         mp.nombre  AS metodo_pago_nombre,
         lp.nombre  AS lista_precio_nombre,
         lp.slug    AS lista_precio_slug
    FROM metodos_pago_recargo mpr
    JOIN metodos_pago mp ON mp.id = mpr.metodo_pago_id
LEFT JOIN listas_precio lp ON lp.id = mpr.lista_precio_id
`;

async function listSurcharges({ includeInactive = false } = {}) {
  if (!(await tableExists('metodos_pago_recargo'))) return [];
  const where = includeInactive ? '' : 'WHERE mpr.activo = 1';
  const { rows } = await query(
    `${SURCHARGE_SELECT} ${where} ORDER BY mp.nombre ASC, mpr.id ASC`
  );
  return (rows || []).map(serializeSurcharge);
}

async function getSurchargeById(id) {
  if (!(await tableExists('metodos_pago_recargo'))) return null;
  const { rows } = await query(
    `${SURCHARGE_SELECT} WHERE mpr.id = $1 LIMIT 1`,
    [Number(id)]
  );
  return serializeSurcharge(rows[0]);
}

async function createSurcharge({ metodo_pago_id, lista_precio_id = null, tipo = 'recargo', valor_pct, activo = true }) {
  if (!(await tableExists('metodos_pago_recargo'))) {
    const e = new Error('Tabla metodos_pago_recargo no existe — ejecutar migración V26');
    e.status = 503;
    throw e;
  }
  const metodoId = Number(metodo_pago_id);
  if (!Number.isInteger(metodoId) || metodoId <= 0) {
    const e = new Error('metodo_pago_id inválido');
    e.status = 400;
    throw e;
  }
  const tipoNorm = String(tipo || 'recargo').trim().toLowerCase();
  if (!['recargo', 'descuento'].includes(tipoNorm)) {
    const e = new Error('tipo debe ser recargo o descuento');
    e.status = 400;
    throw e;
  }
  const pct = Number(valor_pct);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    const e = new Error('valor_pct debe ser entre 0.01 y 100');
    e.status = 400;
    throw e;
  }

  const { rows } = await query(
    `INSERT INTO metodos_pago_recargo(metodo_pago_id, lista_precio_id, tipo, valor_pct, activo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      metodoId,
      lista_precio_id != null ? Number(lista_precio_id) : null,
      tipoNorm,
      pct,
      activo ? 1 : 0,
    ]
  );
  return getSurchargeById(rows[0]?.id);
}

async function updateSurcharge(id, payload = {}) {
  const current = await getSurchargeById(id);
  if (!current) {
    const e = new Error('Recargo no encontrado');
    e.status = 404;
    throw e;
  }

  const nextMetodoId =
    typeof payload.metodo_pago_id !== 'undefined'
      ? Number(payload.metodo_pago_id)
      : current.metodo_pago_id;
  const nextListaId =
    typeof payload.lista_precio_id !== 'undefined'
      ? payload.lista_precio_id != null ? Number(payload.lista_precio_id) : null
      : current.lista_precio_id;
  const nextTipo =
    typeof payload.tipo !== 'undefined'
      ? String(payload.tipo || 'recargo').trim().toLowerCase()
      : current.tipo;
  const nextPct =
    typeof payload.valor_pct !== 'undefined' ? Number(payload.valor_pct) : current.valor_pct;
  const nextActivo =
    typeof payload.activo !== 'undefined'
      ? Boolean(payload.activo)
      : current.activo;

  if (!['recargo', 'descuento'].includes(nextTipo)) {
    const e = new Error('tipo debe ser recargo o descuento');
    e.status = 400;
    throw e;
  }
  if (!Number.isFinite(nextPct) || nextPct <= 0 || nextPct > 100) {
    const e = new Error('valor_pct debe ser entre 0.01 y 100');
    e.status = 400;
    throw e;
  }

  await query(
    `UPDATE metodos_pago_recargo
        SET metodo_pago_id  = $1,
            lista_precio_id = $2,
            tipo            = $3,
            valor_pct       = $4,
            activo          = $5,
            actualizado_en  = CURRENT_TIMESTAMP
      WHERE id = $6`,
    [nextMetodoId, nextListaId, nextTipo, nextPct, nextActivo ? 1 : 0, Number(id)]
  );
  return getSurchargeById(id);
}

async function deleteSurcharge(id) {
  const current = await getSurchargeById(id);
  if (!current) {
    const e = new Error('Recargo no encontrado');
    e.status = 404;
    throw e;
  }
  await query('DELETE FROM metodos_pago_recargo WHERE id = $1', [Number(id)]);
  return { id: Number(id) };
}

/**
 * Devuelve el recargo aplicable para un método de pago + lista de precio.
 * Prioridad: coincidencia exacta con lista > global (lista_precio_id IS NULL).
 * Retorna null si no hay recargo configurado.
 */
async function getApplicableSurcharge(metodoPagoId, listaPrecioId = null) {
  if (!metodoPagoId) return null;
  if (!(await tableExists('metodos_pago_recargo'))) return null;

  const mpId = Number(metodoPagoId);
  if (!Number.isInteger(mpId) || mpId <= 0) return null;

  // 1. Coincidencia exacta con lista
  if (listaPrecioId) {
    const { rows: exactRows } = await query(
      `SELECT tipo, valor_pct::float AS valor_pct
         FROM metodos_pago_recargo
        WHERE metodo_pago_id = $1
          AND lista_precio_id = $2
          AND activo = 1
        LIMIT 1`,
      [mpId, Number(listaPrecioId)]
    );
    if (exactRows?.length) {
      return { tipo: exactRows[0].tipo, valor_pct: Number(exactRows[0].valor_pct) };
    }
  }

  // 2. Global (aplica a todas las listas)
  const { rows: globalRows } = await query(
    `SELECT tipo, valor_pct::float AS valor_pct
       FROM metodos_pago_recargo
      WHERE metodo_pago_id = $1
        AND lista_precio_id IS NULL
        AND activo = 1
      LIMIT 1`,
    [mpId]
  );
  if (globalRows?.length) {
    return { tipo: globalRows[0].tipo, valor_pct: Number(globalRows[0].valor_pct) };
  }

  return null;
}

/**
 * Aplica un recargo/descuento a un precio base.
 * Retorna { precio_final, precio_sin_recargo, recargo_pct }.
 * recargo_pct es positivo para recargo y negativo para descuento.
 */
function applySurcharge(basePrice, surcharge) {
  const base = Math.round(Number(basePrice || 0) * 100) / 100;
  if (!surcharge || !base) {
    return { precio_final: base, precio_sin_recargo: null, recargo_pct: 0 };
  }
  const pct = Number(surcharge.valor_pct || 0);
  const multiplier =
    String(surcharge.tipo).trim().toLowerCase() === 'descuento'
      ? 1 - pct / 100
      : 1 + pct / 100;
  const finalPrice = Math.round(base * multiplier * 100) / 100;
  const efectivePct =
    String(surcharge.tipo).trim().toLowerCase() === 'descuento' ? -pct : pct;
  return {
    precio_final: finalPrice,
    precio_sin_recargo: base,
    recargo_pct: efectivePct,
  };
}

module.exports = {
  listSurcharges,
  getSurchargeById,
  createSurcharge,
  updateSurcharge,
  deleteSurcharge,
  getApplicableSurcharge,
  applySurcharge,
};
