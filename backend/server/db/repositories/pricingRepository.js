const { query, withTransaction } = require('../../db/pg');
const configRepo = require('./configRepository');
const priceListRepo = require('./priceListRepository');

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

function normalizeListCode(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePercentage(value) {
  return Math.max(0, Math.min(100, toNumber(value, 0)));
}

function normalizeScope(scopeTipo, scopeId) {
  const normalizedScope = String(scopeTipo || 'global').trim().toLowerCase() === 'vendedor'
    ? 'vendedor'
    : 'global';
  const normalizedScopeId =
    normalizedScope === 'vendedor' && Number.isInteger(Number(scopeId)) && Number(scopeId) > 0
      ? Number(scopeId)
      : 0;
  return {
    scopeTipo: normalizedScope,
    scopeId: normalizedScopeId,
  };
}

function buildCommissionPercentages(rows = []) {
  return (rows || []).reduce((acc, row) => {
    const key = normalizeListCode(row?.lista_codigo);
    if (!key) return acc;
    acc[key] = normalizePercentage(row?.porcentaje);
    return acc;
  }, {});
}

async function listCommissionConfigRowsTx(client, { scopeTipo = 'global', scopeId = 0 } = {}) {
  const scope = normalizeScope(scopeTipo, scopeId);
  const { rows } = await client.query(
    `SELECT id,
            scope_tipo,
            scope_id,
            lista_codigo,
            lista_nombre,
            porcentaje,
            activo
       FROM comision_listas_config
      WHERE scope_tipo = $1
        AND scope_id = $2
      ORDER BY lista_nombre ASC, lista_codigo ASC`,
    [scope.scopeTipo, scope.scopeId]
  );
  return rows || [];
}

async function getLegacyCommissionRows() {
  const [local, distribuidor, finalPct, oferta] = await Promise.all([
    configRepo.getNumericParam(COMMISSION_KEYS.local),
    configRepo.getNumericParam(COMMISSION_KEYS.distribuidor),
    configRepo.getNumericParam(COMMISSION_KEYS.final),
    configRepo.getNumericParam(COMMISSION_KEYS.oferta),
  ]);
  return [
    { lista_codigo: 'local', lista_nombre: 'Precio Local', porcentaje: normalizePercentage(local), activo: 1 },
    {
      lista_codigo: 'distribuidor',
      lista_nombre: 'Precio Distribuidor',
      porcentaje: normalizePercentage(distribuidor),
      activo: 1,
    },
    { lista_codigo: 'final', lista_nombre: 'Precio Final', porcentaje: normalizePercentage(finalPct), activo: 1 },
    { lista_codigo: 'oferta', lista_nombre: 'Lista Oferta', porcentaje: normalizePercentage(oferta), activo: 1 },
  ];
}

function buildCommissionRowsFromPriceLists(priceLists = [], configRows = []) {
  const normalizedPriceLists = Array.isArray(priceLists) ? priceLists : [];
  const rowsByCode = new Map();
  for (const row of configRows || []) {
    const code = normalizeListCode(row?.lista_codigo);
    if (!code) continue;
    rowsByCode.set(code, row);
  }

  const output = normalizedPriceLists.map((list) => {
    const code = normalizeListCode(list?.legacy_code || list?.slug || list?.key);
    const stored = rowsByCode.get(code);
    return {
      lista_codigo: code,
      lista_nombre: String(stored?.lista_nombre || list?.nombre || code || 'Sin nombre'),
      porcentaje: normalizePercentage(stored?.porcentaje),
      activo: stored?.activo == null ? (list?.activo !== false ? 1 : 0) : Number(stored.activo) ? 1 : 0,
      source: stored ? 'persistido' : 'default',
    };
  });

  if (!output.some((row) => row.lista_codigo === 'oferta')) {
    const storedOffer = rowsByCode.get('oferta');
    output.push({
      lista_codigo: 'oferta',
      lista_nombre: String(storedOffer?.lista_nombre || 'Lista Oferta'),
      porcentaje: normalizePercentage(storedOffer?.porcentaje),
      activo: storedOffer?.activo == null ? 1 : Number(storedOffer.activo) ? 1 : 0,
      source: storedOffer ? 'persistido' : 'default',
    });
  }

  for (const [code, row] of rowsByCode.entries()) {
    if (output.some((item) => item.lista_codigo === code)) continue;
    output.push({
      lista_codigo: code,
      lista_nombre: String(row?.lista_nombre || code),
      porcentaje: normalizePercentage(row?.porcentaje),
      activo: Number(row?.activo) ? 1 : 0,
      source: 'persistido',
    });
  }

  return output.sort((a, b) => String(a.lista_nombre || '').localeCompare(String(b.lista_nombre || '')));
}

function normalizeCommissionInputRows({ listas, porcentajes, referenceRows = [] }) {
  const referenceByCode = new Map(
    (referenceRows || []).map((row) => [normalizeListCode(row?.lista_codigo), row])
  );

  if (Array.isArray(listas) && listas.length) {
    return listas
      .map((row) => {
        const code = normalizeListCode(row?.lista_codigo);
        if (!code) return null;
        const ref = referenceByCode.get(code);
        return {
          lista_codigo: code,
          lista_nombre: String(row?.lista_nombre || ref?.lista_nombre || code),
          porcentaje: normalizePercentage(row?.porcentaje),
          activo: row?.activo === false || row?.activo === 0 || row?.activo === '0' ? 0 : 1,
        };
      })
      .filter(Boolean);
  }

  const entries = Object.entries(porcentajes || {});
  return entries
    .map(([rawCode, rawPct]) => {
      const code = normalizeListCode(rawCode);
      if (!code) return null;
      const ref = referenceByCode.get(code);
      return {
        lista_codigo: code,
        lista_nombre: String(ref?.lista_nombre || code),
        porcentaje: normalizePercentage(rawPct),
        activo: 1,
      };
    })
    .filter(Boolean);
}

async function syncLegacyCommissionParams(rows = [], usuarioId = null) {
  const pctByCode = buildCommissionPercentages(rows);
  await Promise.all([
    configRepo.setTextParam(COMMISSION_MODE_KEY, 'lista', usuarioId),
    configRepo.setNumericParam(COMMISSION_KEYS.local, pctByCode.local || 0, usuarioId),
    configRepo.setNumericParam(COMMISSION_KEYS.distribuidor, pctByCode.distribuidor || 0, usuarioId),
    configRepo.setNumericParam(COMMISSION_KEYS.final, pctByCode.final || 0, usuarioId),
    configRepo.setNumericParam(COMMISSION_KEYS.oferta, pctByCode.oferta || 0, usuarioId),
  ]);
}

function normalizeOfferProductIds(rawList = []) {
  if (!Array.isArray(rawList)) return [];
  return Array.from(
    new Set(
      rawList
        .map((value) => Number(value))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
  );
}

function extractOfferProductSelection(payload = {}, { requirePresence = false } = {}) {
  const hasArray = Object.prototype.hasOwnProperty.call(payload, 'producto_ids');
  const hasSingle = Object.prototype.hasOwnProperty.call(payload, 'producto_id');
  if (requirePresence && !hasArray && !hasSingle) {
    return { provided: false, ids: [] };
  }
  const raw = [];
  if (Array.isArray(payload.producto_ids)) raw.push(...payload.producto_ids);
  if (hasSingle && payload.producto_id != null && payload.producto_id !== '') {
    raw.push(payload.producto_id);
  }
  return {
    provided: hasArray || hasSingle || !requirePresence,
    ids: normalizeOfferProductIds(raw),
  };
}

async function resolveOfferTargetListTx(client, payload = {}) {
  const rawCode = String(payload.lista_precio_objetivo || '').trim().toLowerCase();
  const rawListId = Number(payload.lista_precio_id || 0);

  if ((rawCode === 'todas' && rawListId <= 0) || (!rawCode && rawListId <= 0)) {
    return {
      lista_precio_id: null,
      lista_precio_objetivo: 'todas',
    };
  }

  const resolvedList =
    (rawListId > 0 ? await priceListRepo.getPriceListByIdTx(client, rawListId) : null) ||
    (rawCode ? await priceListRepo.getPriceListByCodeTx(client, rawCode) : null);

  if (!resolvedList) {
    const error = new Error('Lista de precio objetivo invalida');
    error.status = 400;
    throw error;
  }

  return {
    lista_precio_id: Number(resolvedList.id),
    lista_precio_objetivo: resolvedList.legacy_code || resolvedList.slug,
  };
}

async function replaceOfferProductsTx(client, offerId, productIds = []) {
  const ids = normalizeOfferProductIds(productIds);
  await client.query('DELETE FROM ofertas_precios_productos WHERE oferta_id = $1', [Number(offerId)]);
  for (const productId of ids) {
    await client.query(
      `INSERT INTO ofertas_precios_productos(oferta_id, producto_id)
       VALUES ($1, $2)`,
      [Number(offerId), Number(productId)]
    );
  }
}

async function fetchOfferProductsByOfferIds(offerIds = []) {
  const ids = Array.from(
    new Set(
      (offerIds || [])
        .map((value) => Number(value))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
  );
  if (!ids.length) return new Map();
  const marks = ids.map((_, idx) => `$${idx + 1}`).join(', ');
  const { rows } = await query(
    `SELECT op.oferta_id,
            op.producto_id,
            p.nombre AS producto_nombre
       FROM ofertas_precios_productos op
  LEFT JOIN productos p ON p.id = op.producto_id
      WHERE op.oferta_id IN (${marks})
      ORDER BY op.oferta_id ASC, op.producto_id ASC`,
    ids
  );

  const out = new Map();
  for (const row of rows || []) {
    const offerId = Number(row.oferta_id);
    const productId = Number(row.producto_id);
    if (!Number.isInteger(offerId) || offerId <= 0) continue;
    if (!Number.isInteger(productId) || productId <= 0) continue;
    if (!out.has(offerId)) {
      out.set(offerId, { ids: [], names: [] });
    }
    const entry = out.get(offerId);
    if (!entry.ids.includes(productId)) entry.ids.push(productId);
    if (row.producto_nombre) entry.names.push(String(row.producto_nombre));
  }
  return out;
}

async function listOffers({
  incluirInactivas = false,
  q,
  tipo,
  producto_id,
  lista_precio_id,
  lista_precio_objetivo,
} = {}) {
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
      where.push(
        `(o.producto_id = $${params.length}
          OR EXISTS (
            SELECT 1
              FROM ofertas_precios_productos opf
             WHERE opf.oferta_id = o.id
               AND opf.producto_id = $${params.length}
          ))`
      );
    }
  }
  if (lista_precio_id != null) {
    const listId = Number(lista_precio_id);
    if (Number.isInteger(listId) && listId > 0) {
      params.push(listId);
      where.push(`o.lista_precio_id = $${params.length}`);
    }
  }
  if (lista_precio_objetivo) {
    params.push(String(lista_precio_objetivo).trim().toLowerCase());
    where.push(
      `(LOWER(o.lista_precio_objetivo) = $${params.length}
        OR EXISTS (
          SELECT 1
            FROM listas_precio lpo
           WHERE lpo.id = o.lista_precio_id
             AND (
               LOWER(COALESCE(lpo.legacy_code, '')) = $${params.length}
               OR LOWER(lpo.slug) = $${params.length}
             )
        ))`
    );
  }

  const { rows } = await query(
    `SELECT o.id,
            o.nombre,
            o.descripcion,
            o.packaging_image_url,
            o.tipo_oferta,
            o.producto_id,
            p.nombre AS producto_nombre,
            o.lista_precio_id,
            o.lista_precio_objetivo,
            lp.slug AS lista_precio_slug,
            lp.nombre AS lista_precio_nombre,
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
  LEFT JOIN listas_precio lp ON lp.id = o.lista_precio_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY o.activo DESC, o.prioridad DESC, o.id DESC`,
    params
  );

  let productsByOffer = new Map();
  try {
    productsByOffer = await fetchOfferProductsByOfferIds((rows || []).map((row) => row.id));
  } catch {
    productsByOffer = new Map();
  }

  return (rows || []).map((row) => {
    const offerId = Number(row.id);
    const mapped = productsByOffer.get(offerId);
    const fallbackIds =
      row.producto_id && Number.isInteger(Number(row.producto_id)) ? [Number(row.producto_id)] : [];
    const fallbackNames = row.producto_nombre ? [String(row.producto_nombre)] : [];
    const producto_ids = mapped?.ids?.length ? mapped.ids : fallbackIds;
    const producto_nombres = mapped?.names?.length ? mapped.names : fallbackNames;
    return {
      ...row,
      producto_ids,
      producto_nombres,
    };
  });
}

async function createOffer(payload) {
  const {
    nombre,
    descripcion,
    packaging_image_url,
    tipo_oferta,
    producto_id,
    cantidad_minima,
    descuento_pct,
    fecha_desde,
    fecha_hasta,
    prioridad,
    activo,
  } = payload || {};
  const selection = extractOfferProductSelection(payload);
  const primaryProductId =
    selection.ids.length === 1
      ? Number(selection.ids[0])
      : producto_id
      ? Number(producto_id)
      : null;

  return withTransaction(async (client) => {
    const targetList = await resolveOfferTargetListTx(client, payload);
    const { rows } = await client.query(
      `INSERT INTO ofertas_precios(
         nombre, descripcion, packaging_image_url, tipo_oferta, producto_id, lista_precio_id, lista_precio_objetivo,
         cantidad_minima, descuento_pct, fecha_desde, fecha_hasta, prioridad, activo
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        String(nombre || '').trim(),
        descripcion ? String(descripcion).trim() : null,
        packaging_image_url ? String(packaging_image_url).trim() : null,
        String(tipo_oferta || '').trim().toLowerCase(),
        Number.isInteger(primaryProductId) && primaryProductId > 0 ? primaryProductId : null,
        targetList.lista_precio_id,
        targetList.lista_precio_objetivo,
        Math.max(1, Math.trunc(Number(cantidad_minima || 1))),
        toNumber(descuento_pct, 0),
        fecha_desde || null,
        fecha_hasta || null,
        Math.trunc(Number(prioridad || 0)),
        activo === false ? 0 : 1,
      ]
    );
    const created = rows[0] || null;
    if (created?.id) {
      await replaceOfferProductsTx(client, created.id, selection.ids);
    }
    return created;
  });
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
  if (Object.prototype.hasOwnProperty.call(payload, 'packaging_image_url')) {
    add(
      'packaging_image_url',
      payload.packaging_image_url ? String(payload.packaging_image_url).trim() : null
    );
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'tipo_oferta')) {
    add('tipo_oferta', String(payload.tipo_oferta || '').trim().toLowerCase());
  }
  const selection = extractOfferProductSelection(payload, { requirePresence: true });
  if (selection.provided) {
    const primaryProductId =
      selection.ids.length === 1
        ? Number(selection.ids[0])
        : payload.producto_id
        ? Number(payload.producto_id)
        : null;
    add(
      'producto_id',
      Number.isInteger(primaryProductId) && primaryProductId > 0 ? primaryProductId : null
    );
  } else if (Object.prototype.hasOwnProperty.call(payload, 'producto_id')) {
    add('producto_id', payload.producto_id ? Number(payload.producto_id) : null);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'lista_precio_objetivo')) {
    // Se resuelve dentro de la transaccion para mantener lista_precio_id y codigo sincronizados.
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

  return withTransaction(async (client) => {
    if (
      Object.prototype.hasOwnProperty.call(payload, 'lista_precio_objetivo') ||
      Object.prototype.hasOwnProperty.call(payload, 'lista_precio_id')
    ) {
      const targetList = await resolveOfferTargetListTx(client, payload);
      add('lista_precio_id', targetList.lista_precio_id);
      add('lista_precio_objetivo', targetList.lista_precio_objetivo);
    }
    if (!sets.length) return { id };
    sets.push('actualizado_en = CURRENT_TIMESTAMP');
    params.push(id);
    const { rows } = await client.query(
      `UPDATE ofertas_precios
          SET ${sets.join(', ')}
        WHERE id = $${p}
        RETURNING id`,
      params
    );
    const updated = rows[0] || null;
    if (!updated) return null;
    if (selection.provided) {
      await replaceOfferProductsTx(client, id, selection.ids);
    }
    return updated;
  });
}

async function getCommissionConfigTx(client, { usuarioId = null } = {}) {
  const priceLists = await priceListRepo.listPriceListsTx(client, { includeInactive: true });
  let globalRows = await listCommissionConfigRowsTx(client, { scopeTipo: 'global', scopeId: 0 });
  if (!globalRows.length) {
    globalRows = await getLegacyCommissionRows();
  }

  const vendorRows =
    Number.isInteger(Number(usuarioId)) && Number(usuarioId) > 0
      ? await listCommissionConfigRowsTx(client, {
          scopeTipo: 'vendedor',
          scopeId: Number(usuarioId),
        })
      : [];

  const global = buildCommissionRowsFromPriceLists(priceLists, globalRows);
  const overrideByCode = new Map(
    (vendorRows || []).map((row) => [normalizeListCode(row?.lista_codigo), row])
  );
  const listas = global.map((row) => {
    const override = overrideByCode.get(normalizeListCode(row.lista_codigo));
    return override
      ? {
          ...row,
          lista_nombre: String(override?.lista_nombre || row.lista_nombre || row.lista_codigo),
          porcentaje: normalizePercentage(override?.porcentaje),
          activo: override?.activo == null ? row.activo : Number(override.activo) ? 1 : 0,
          source: 'vendedor',
        }
      : {
          ...row,
          source: 'global',
        };
  });

  for (const [code, row] of overrideByCode.entries()) {
    if (listas.some((item) => item.lista_codigo === code)) continue;
    listas.push({
      lista_codigo: code,
      lista_nombre: String(row?.lista_nombre || code),
      porcentaje: normalizePercentage(row?.porcentaje),
      activo: Number(row?.activo) ? 1 : 0,
      source: 'vendedor',
    });
  }

  const overrides = vendorRows.length
    ? buildCommissionRowsFromPriceLists(priceLists, vendorRows)
    : [];
  const porcentajes = buildCommissionPercentages(listas);

  return {
    mode: 'lista',
    comision_tipo: 'por_lista',
    usuario_id:
      Number.isInteger(Number(usuarioId)) && Number(usuarioId) > 0 ? Number(usuarioId) : null,
    usa_configuracion_global: vendorRows.length === 0,
    global,
    overrides,
    listas: listas.sort((a, b) => String(a.lista_nombre || '').localeCompare(String(b.lista_nombre || ''))),
    porcentajes,
    porcentajes_globales: buildCommissionPercentages(global),
    porcentajes_personalizados: buildCommissionPercentages(overrides),
  };
}

async function getCommissionConfig({ usuarioId = null } = {}) {
  return withTransaction((client) => getCommissionConfigTx(client, { usuarioId }));
}

async function setCommissionConfig({
  usuarioId = null,
  listas = [],
  porcentajes = {},
  useGlobal = false,
  actorUserId = null,
} = {}) {
  return withTransaction(async (client) => {
    const scope = normalizeScope(
      Number.isInteger(Number(usuarioId)) && Number(usuarioId) > 0 ? 'vendedor' : 'global',
      usuarioId
    );
    const current = await getCommissionConfigTx(client, {
      usuarioId: scope.scopeTipo === 'vendedor' ? scope.scopeId : null,
    });
    const normalizedRows = normalizeCommissionInputRows({
      listas,
      porcentajes,
      referenceRows: scope.scopeTipo === 'vendedor' ? current.listas : current.global,
    });

    if (scope.scopeTipo === 'vendedor' && useGlobal) {
      await client.query(
        `DELETE FROM comision_listas_config
          WHERE scope_tipo = 'vendedor'
            AND scope_id = $1`,
        [scope.scopeId]
      );
      return getCommissionConfigTx(client, { usuarioId: scope.scopeId });
    }

    await client.query(
      `DELETE FROM comision_listas_config
        WHERE scope_tipo = $1
          AND scope_id = $2`,
      [scope.scopeTipo, scope.scopeId]
    );

    for (const row of normalizedRows) {
      await client.query(
        `INSERT INTO comision_listas_config(
           scope_tipo,
           scope_id,
           lista_codigo,
           lista_nombre,
           porcentaje,
           activo
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          scope.scopeTipo,
          scope.scopeId,
          normalizeListCode(row.lista_codigo),
          String(row.lista_nombre || row.lista_codigo),
          normalizePercentage(row.porcentaje),
          row.activo === 0 ? 0 : 1,
        ]
      );
    }

    if (scope.scopeTipo === 'global') {
      const persisted = await getCommissionConfigTx(client, { usuarioId: null });
      await syncLegacyCommissionParams(persisted.global, actorUserId);
      return persisted;
    }

    return getCommissionConfigTx(client, { usuarioId: scope.scopeId });
  });
}

module.exports = {
  COMMISSION_MODE_KEY,
  COMMISSION_KEYS,
  listOffers,
  createOffer,
  updateOffer,
  getCommissionConfigTx,
  getCommissionConfig,
  setCommissionConfig,
};
