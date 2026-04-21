const { query, withTransaction } = require('../../db/pg');
const configRepo = require('./configRepository');
const { normalizeStep } = require('../../lib/priceUtils');
const {
  buildResolvedPriceRows,
  deriveLegacyProductFields,
  normalizeSlug,
  normalizeMarginRatio,
  normalizeOptionalMarginRatio,
  resolveQuantityPrice,
  roundCurrency,
} = require('../../lib/pricingEngine');

const LEGACY_LIST_DEFAULTS = {
  local: {
    slug: 'local',
    nombre: 'Precio Local',
    descripcion: 'Lista legacy local / mostrador',
    margen_ratio: 0.15,
    activo: true,
    orden_visual: 10,
  },
  distribuidor: {
    slug: 'distribuidor',
    nombre: 'Precio Distribuidor',
    descripcion: 'Lista legacy distribuidor / mayorista',
    margen_ratio: 0.45,
    activo: true,
    orden_visual: 20,
  },
  final: {
    slug: 'final',
    nombre: 'Precio Final',
    descripcion: 'Lista legacy final / publico',
    margen_ratio: 0.15,
    activo: true,
    orden_visual: 30,
  },
};

const TABLE_CACHE = new Map();

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeActive(value, fallback = true) {
  if (typeof value === 'undefined' || value === null) return fallback;
  return !(value === false || value === 0 || value === '0');
}

function serializePriceList(row) {
  const legacyCode = row?.legacy_code ? String(row.legacy_code) : null;
  const slug = String(row?.slug || legacyCode || '').trim();
  return {
    id: Number(row?.id || 0),
    legacy_code: legacyCode,
    key: legacyCode || slug,
    slug,
    nombre: String(row?.nombre || legacyCode || slug),
    label: String(row?.nombre || legacyCode || slug),
    descripcion: row?.descripcion || null,
    margen_ratio: normalizeMarginRatio(row?.margen_ratio, 0),
    enabled: normalizeActive(row?.activo, true),
    activo: normalizeActive(row?.activo, true),
    orden_visual: Number(row?.orden_visual || 0),
    is_system: Boolean(legacyCode),
    can_disable: legacyCode !== 'final',
  };
}

async function tableExists(tableName, client = null) {
  const cacheKey = `${client ? 'tx' : 'pool'}:${tableName}`;
  if (TABLE_CACHE.has(cacheKey)) return TABLE_CACHE.get(cacheKey);
  const runner = client || { query };
  const { rows } = await runner.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = $1
      LIMIT 1`,
    [tableName]
  );
  const exists = Boolean(rows?.length);
  TABLE_CACHE.set(cacheKey, exists);
  return exists;
}

async function listLegacyFallbackPriceLists() {
  const [localLabel, distLabel, finalLabel, localEnabled, distEnabled] = await Promise.all([
    configRepo.getTextParam('price_label_local'),
    configRepo.getTextParam('price_label_distribuidor'),
    configRepo.getTextParam('price_label_final'),
    configRepo.getNumericParam('price_enabled_local'),
    configRepo.getNumericParam('price_enabled_distribuidor'),
  ]);
  return [
    serializePriceList({
      id: 1,
      legacy_code: 'local',
      slug: 'local',
      nombre: localLabel || LEGACY_LIST_DEFAULTS.local.nombre,
      descripcion: LEGACY_LIST_DEFAULTS.local.descripcion,
      margen_ratio: LEGACY_LIST_DEFAULTS.local.margen_ratio,
      activo: localEnabled !== 0,
      orden_visual: LEGACY_LIST_DEFAULTS.local.orden_visual,
    }),
    serializePriceList({
      id: 2,
      legacy_code: 'distribuidor',
      slug: 'distribuidor',
      nombre: distLabel || LEGACY_LIST_DEFAULTS.distribuidor.nombre,
      descripcion: LEGACY_LIST_DEFAULTS.distribuidor.descripcion,
      margen_ratio: LEGACY_LIST_DEFAULTS.distribuidor.margen_ratio,
      activo: distEnabled !== 0,
      orden_visual: LEGACY_LIST_DEFAULTS.distribuidor.orden_visual,
    }),
    serializePriceList({
      id: 3,
      legacy_code: 'final',
      slug: 'final',
      nombre: finalLabel || LEGACY_LIST_DEFAULTS.final.nombre,
      descripcion: LEGACY_LIST_DEFAULTS.final.descripcion,
      margen_ratio: LEGACY_LIST_DEFAULTS.final.margen_ratio,
      activo: true,
      orden_visual: LEGACY_LIST_DEFAULTS.final.orden_visual,
    }),
  ];
}

async function listPriceListsTx(client, { includeInactive = false } = {}) {
  if (!(await tableExists('listas_precio', client))) {
    return listLegacyFallbackPriceLists();
  }
  const where = includeInactive ? '' : 'WHERE activo = 1';
  const { rows } = await client.query(
    `SELECT id,
            legacy_code,
            slug,
            nombre,
            descripcion,
            margen_ratio,
            activo,
            orden_visual
       FROM listas_precio
      ${where}
      ORDER BY orden_visual ASC, id ASC`
  );
  return (rows || []).map(serializePriceList);
}

async function listPriceLists(opts = {}) {
  return withTransaction((client) => listPriceListsTx(client, opts));
}

async function getPriceListByIdTx(client, id) {
  const listId = Number(id);
  if (!Number.isInteger(listId) || listId <= 0) return null;
  const lists = await listPriceListsTx(client, { includeInactive: true });
  return lists.find((item) => Number(item.id) === listId) || null;
}

async function getPriceListByCodeTx(client, code) {
  const normalized = String(code || '').trim().toLowerCase();
  if (!normalized) return null;
  const lists = await listPriceListsTx(client, { includeInactive: true });
  return (
    lists.find((item) => item.slug === normalized) ||
    lists.find((item) => item.legacy_code === normalized) ||
    null
  );
}

async function getProductSnapshotTx(client, productId) {
  const { rows } = await client.query(
    `SELECT id,
            precio_venta::float AS price,
            precio_local::float AS price_local,
            precio_distribuidor::float AS price_distribuidor,
            precio_final::float AS precio_final,
            precio_modo,
            precio_costo_pesos::float AS costo_pesos,
            precio_costo_dolares::float AS costo_dolares,
            margen_local::float AS margen_local,
            margen_distribuidor::float AS margen_distribuidor
       FROM productos
      WHERE id = $1
      LIMIT 1`,
    [Number(productId)]
  );
  return rows[0] || null;
}

async function getProductPriceRowsTx(client, productId, { includeInactiveLists = true } = {}) {
  if (!(await tableExists('productos_precios', client))) return [];
  const where = includeInactiveLists ? '' : 'AND lp.activo = 1';
  const { rows } = await client.query(
    `SELECT pp.producto_id,
            pp.lista_precio_id,
            pp.precio::float AS precio,
            pp.modo,
            pp.margen_override_ratio::float AS margen_override_ratio,
            pp.actualizado_en,
            lp.legacy_code,
            lp.slug,
            lp.nombre,
            lp.descripcion,
            lp.margen_ratio::float AS margen_ratio,
            lp.activo,
            lp.orden_visual
       FROM productos_precios pp
       JOIN listas_precio lp ON lp.id = pp.lista_precio_id
      WHERE pp.producto_id = $1
        ${where}
      ORDER BY lp.orden_visual ASC, lp.id ASC`,
    [Number(productId)]
  );
  return (rows || []).map((row) => ({
    producto_id: Number(row.producto_id),
    lista_precio_id: Number(row.lista_precio_id),
    precio: roundCurrency(row.precio),
    modo: row.modo || 'auto',
    margen_override_ratio: normalizeOptionalMarginRatio(row.margen_override_ratio),
    actualizado_en: row.actualizado_en,
    list: serializePriceList(row),
  }));
}

async function recordProductPriceHistoryTx(client, productId, resolvedRows, { motivo = null, usuarioId = null } = {}) {
  if (!(await tableExists('productos_precios_historial', client))) return;
  for (const row of resolvedRows || []) {
    await client.query(
      `INSERT INTO productos_precios_historial(
         producto_id,
         lista_precio_id,
         precio,
         modo,
         margen_override_ratio,
         motivo,
         usuario_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        Number(productId),
        Number(row.lista_precio_id),
        roundCurrency(row.precio),
        row.modo || 'auto',
        row.margen_override_ratio,
        motivo || null,
        usuarioId || null,
      ]
    );
  }
}

async function upsertProductPriceRowsTx(client, productId, resolvedRows) {
  for (const row of resolvedRows || []) {
    await client.query(
      `INSERT INTO productos_precios(
         producto_id,
         lista_precio_id,
         precio,
         modo,
         margen_override_ratio
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (producto_id, lista_precio_id) DO UPDATE
         SET precio = EXCLUDED.precio,
             modo = EXCLUDED.modo,
             margen_override_ratio = EXCLUDED.margen_override_ratio,
             actualizado_en = CURRENT_TIMESTAMP`,
      [
        Number(productId),
        Number(row.lista_precio_id),
        roundCurrency(row.precio),
        row.modo || 'auto',
        row.margen_override_ratio,
      ]
    );
  }
}

async function syncLegacyConfigForList(list, usuarioId = null) {
  if (!list?.legacy_code) return;
  if (list.legacy_code === 'local') {
    await Promise.all([
      configRepo.setTextParam('price_label_local', list.nombre, usuarioId),
      configRepo.setNumericParam('price_enabled_local', list.enabled ? 1 : 0, usuarioId),
    ]);
    return;
  }
  if (list.legacy_code === 'distribuidor') {
    await Promise.all([
      configRepo.setTextParam('price_label_distribuidor', list.nombre, usuarioId),
      configRepo.setNumericParam('price_enabled_distribuidor', list.enabled ? 1 : 0, usuarioId),
    ]);
    return;
  }
  if (list.legacy_code === 'final') {
    await configRepo.setTextParam('price_label_final', list.nombre, usuarioId);
  }
}

async function syncProductPriceRowsTx(client, productId, opts = {}) {
  const product = await getProductSnapshotTx(client, productId);
  if (!product) {
    const error = new Error('Producto no encontrado');
    error.status = 404;
    throw error;
  }

  const [priceLists, existingRows, stepRaw] = await Promise.all([
    listPriceListsTx(client, { includeInactive: true }),
    getProductPriceRowsTx(client, productId, { includeInactiveLists: true }),
    configRepo.getPriceRoundingStep().catch(() => 1),
  ]);

  const roundingStep = normalizeStep(stepRaw);
  const resolvedRows = buildResolvedPriceRows({
    priceLists,
    product,
    requestedRows: opts.requestedRows || [],
    existingRows,
    roundingStep,
  });

  await upsertProductPriceRowsTx(client, productId, resolvedRows);

  const legacyFields = deriveLegacyProductFields({
    resolvedRows,
    priceLists,
    product,
  });

  await client.query(
    `UPDATE productos
        SET precio_local = $1,
            precio_distribuidor = $2,
            precio_final = $3,
            precio_venta = $4,
            precio_modo = $5,
            margen_local = $6,
            margen_distribuidor = $7,
            actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $8`,
    [
      legacyFields.precio_local,
      legacyFields.precio_distribuidor,
      legacyFields.precio_final,
      legacyFields.precio_venta,
      legacyFields.precio_modo,
      legacyFields.margen_local,
      legacyFields.margen_distribuidor,
      Number(productId),
    ]
  );

  if (opts.recordHistory !== false) {
    await recordProductPriceHistoryTx(client, productId, resolvedRows, {
      motivo: opts.motivo || null,
      usuarioId: opts.usuarioId || null,
    });
  }

  return getProductPriceRowsTx(client, productId, { includeInactiveLists: true });
}

async function syncAllProductPriceRowsTx(client, opts = {}) {
  const productIds = Array.isArray(opts.productIds) && opts.productIds.length
    ? opts.productIds
    : (
        await client.query(
          `SELECT id
             FROM productos
            WHERE activo = TRUE
              AND deleted_at IS NULL
            ORDER BY id ASC`
        )
      ).rows.map((row) => Number(row.id));

  for (const productId of productIds) {
    await syncProductPriceRowsTx(client, Number(productId), {
      motivo: opts.motivo || null,
      usuarioId: opts.usuarioId || null,
      recordHistory: opts.recordHistory !== false,
    });
  }
}

async function listProductPriceRows(productId, opts = {}) {
  return withTransaction((client) =>
    getProductPriceRowsTx(client, productId, {
      includeInactiveLists: opts.includeInactiveLists !== false,
    })
  );
}

async function updateProductPriceRows(productId, rows = [], { usuarioId = null, motivo = 'update_product_price_rows' } = {}) {
  return withTransaction((client) =>
    syncProductPriceRowsTx(client, Number(productId), {
      requestedRows: rows,
      usuarioId,
      motivo,
      recordHistory: true,
    })
  );
}

async function createPriceList({
  nombre,
  slug,
  descripcion = null,
  margen_ratio = 0,
  activo = true,
  orden_visual = null,
  usuarioId = null,
}) {
  return withTransaction(async (client) => {
    const existingLists = await listPriceListsTx(client, { includeInactive: true });
    const normalizedName = String(nombre || '').trim();
    if (!normalizedName) {
      const error = new Error('El nombre de la lista es obligatorio');
      error.status = 400;
      throw error;
    }

    const finalSlug = normalizeSlug(slug || normalizedName, 'lista');
    const slugConflict = existingLists.find((item) => item.slug === finalSlug);
    if (slugConflict) {
      const error = new Error('Ya existe una lista con ese slug');
      error.status = 400;
      throw error;
    }

    const nextOrder =
      Number.isInteger(Number(orden_visual))
        ? Number(orden_visual)
        : existingLists.length
        ? Math.max(...existingLists.map((item) => Number(item.orden_visual || 0))) + 10
        : 40;

    const { rows } = await client.query(
      `INSERT INTO listas_precio(
         legacy_code,
         slug,
         nombre,
         descripcion,
         margen_ratio,
         activo,
         orden_visual
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        null,
        finalSlug,
        normalizedName,
        descripcion ? String(descripcion).trim() : null,
        normalizeMarginRatio(margen_ratio, 0),
        activo ? 1 : 0,
        nextOrder,
      ]
    );

    await syncAllProductPriceRowsTx(client, {
      motivo: 'create_price_list',
      usuarioId,
      recordHistory: false,
    });

    return getPriceListByIdTx(client, rows[0]?.id);
  });
}

async function updatePriceList(id, payload = {}, { usuarioId = null } = {}) {
  const listId = Number(id);
  if (!Number.isInteger(listId) || listId <= 0) {
    const error = new Error('Lista invalida');
    error.status = 400;
    throw error;
  }

  const updatedList = await withTransaction(async (client) => {
    const current = await getPriceListByIdTx(client, listId);
    if (!current) {
      const error = new Error('Lista no encontrada');
      error.status = 404;
      throw error;
    }

    const nextName =
      typeof payload.nombre !== 'undefined' ? String(payload.nombre || '').trim() : current.nombre;
    if (!nextName) {
      const error = new Error('El nombre de la lista es obligatorio');
      error.status = 400;
      throw error;
    }

    const nextSlug =
      typeof payload.slug !== 'undefined'
        ? normalizeSlug(payload.slug || nextName, current.slug || 'lista')
        : current.slug;

    const allLists = await listPriceListsTx(client, { includeInactive: true });
    const slugConflict = allLists.find(
      (item) => Number(item.id) !== listId && item.slug === nextSlug
    );
    if (slugConflict) {
      const error = new Error('Ya existe una lista con ese slug');
      error.status = 400;
      throw error;
    }

    const nextEnabled =
      current.legacy_code === 'final'
        ? true
        : typeof payload.activo !== 'undefined'
        ? normalizeActive(payload.activo, current.enabled)
        : current.enabled;

    const activeCount = allLists.filter((item) =>
      Number(item.id) === listId ? nextEnabled : item.enabled
    ).length;
    if (activeCount <= 0) {
      const error = new Error('Debe quedar al menos una lista activa');
      error.status = 400;
      throw error;
    }

    await client.query(
      `UPDATE listas_precio
          SET slug = $1,
              nombre = $2,
              descripcion = $3,
              margen_ratio = $4,
              activo = $5,
              orden_visual = $6,
              actualizado_en = CURRENT_TIMESTAMP
        WHERE id = $7`,
      [
        nextSlug,
        nextName,
        typeof payload.descripcion !== 'undefined'
          ? payload.descripcion
            ? String(payload.descripcion).trim()
            : null
          : current.descripcion,
        typeof payload.margen_ratio !== 'undefined'
          ? normalizeMarginRatio(payload.margen_ratio, current.margen_ratio)
          : current.margen_ratio,
        nextEnabled ? 1 : 0,
        typeof payload.orden_visual !== 'undefined'
          ? Number(payload.orden_visual) || 0
          : current.orden_visual,
        listId,
      ]
    );

    if (typeof payload.margen_ratio !== 'undefined') {
      await syncAllProductPriceRowsTx(client, {
        motivo: 'update_price_list_margin',
        usuarioId,
        recordHistory: false,
      });
    }

    return getPriceListByIdTx(client, listId);
  });

  await syncLegacyConfigForList(updatedList, usuarioId);
  return updatedList;
}

async function deactivatePriceList(id, { usuarioId = null } = {}) {
  return updatePriceList(id, { activo: false }, { usuarioId });
}

async function listQuantityRulesTx(client, listId) {
  const targetList = await getPriceListByIdTx(client, listId);
  if (!targetList) {
    const error = new Error('Lista no encontrada');
    error.status = 404;
    throw error;
  }
  const { rows } = await client.query(
    `SELECT r.id,
            r.lista_precio_id,
            r.cantidad_desde,
            r.cantidad_hasta,
            r.modo,
            r.lista_precio_alternativa_id,
            r.descuento_pct::float AS descuento_pct,
            r.precio_fijo::float AS precio_fijo,
            r.prioridad,
            r.activo,
            alt.slug AS lista_precio_alternativa_slug,
            alt.nombre AS lista_precio_alternativa_nombre
       FROM reglas_precio_cantidad r
  LEFT JOIN listas_precio alt ON alt.id = r.lista_precio_alternativa_id
      WHERE r.lista_precio_id = $1
      ORDER BY r.cantidad_desde ASC, r.prioridad DESC, r.id ASC`,
    [Number(listId)]
  );
  return rows || [];
}

async function listQuantityRules(listId) {
  return withTransaction((client) => listQuantityRulesTx(client, listId));
}

async function assertNoOverlappingRuleTx(client, { listId, from, to, ignoreRuleId = null }) {
  const { rows } = await client.query(
    `SELECT id
       FROM reglas_precio_cantidad
      WHERE lista_precio_id = $1
        AND activo = 1
        AND ($2 IS NULL OR id <> $2)
        AND NOT (
          COALESCE(cantidad_hasta, 2147483647) < $3
          OR COALESCE($4, 2147483647) < cantidad_desde
        )
      LIMIT 1`,
    [Number(listId), ignoreRuleId ? Number(ignoreRuleId) : null, Number(from), to == null ? null : Number(to)]
  );
  if (rows?.length) {
    const error = new Error('La regla se superpone con otro rango existente');
    error.status = 400;
    throw error;
  }
}

async function createQuantityRule(listId, payload = {}) {
  return withTransaction(async (client) => {
    const targetList = await getPriceListByIdTx(client, listId);
    if (!targetList) {
      const error = new Error('Lista no encontrada');
      error.status = 404;
      throw error;
    }

    const modo = String(payload.modo || 'lista').trim().toLowerCase();
    const cantidadDesde = Math.max(1, Number(payload.cantidad_desde || 1));
    const cantidadHasta =
      payload.cantidad_hasta === null || payload.cantidad_hasta === '' || typeof payload.cantidad_hasta === 'undefined'
        ? null
        : Math.max(cantidadDesde, Number(payload.cantidad_hasta));

    await assertNoOverlappingRuleTx(client, {
      listId,
      from: cantidadDesde,
      to: cantidadHasta,
    });

    const { rows } = await client.query(
      `INSERT INTO reglas_precio_cantidad(
         lista_precio_id,
         cantidad_desde,
         cantidad_hasta,
         modo,
         lista_precio_alternativa_id,
         descuento_pct,
         precio_fijo,
         prioridad,
         activo
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        Number(listId),
        cantidadDesde,
        cantidadHasta,
        modo,
        payload.lista_precio_alternativa_id ? Number(payload.lista_precio_alternativa_id) : null,
        typeof payload.descuento_pct !== 'undefined' ? roundCurrency(payload.descuento_pct) : null,
        typeof payload.precio_fijo !== 'undefined' ? roundCurrency(payload.precio_fijo) : null,
        Number(payload.prioridad || 0),
        normalizeActive(payload.activo, true) ? 1 : 0,
      ]
    );
    const createdId = rows[0]?.id;
    const rules = await listQuantityRulesTx(client, listId);
    return rules.find((rule) => Number(rule.id) === Number(createdId)) || null;
  });
}

async function updateQuantityRule(ruleId, payload = {}) {
  return withTransaction(async (client) => {
    const { rows: currentRows } = await client.query(
      `SELECT id,
              lista_precio_id,
              cantidad_desde,
              cantidad_hasta,
              modo,
              lista_precio_alternativa_id,
              descuento_pct::float AS descuento_pct,
              precio_fijo::float AS precio_fijo,
              prioridad,
              activo
         FROM reglas_precio_cantidad
        WHERE id = $1
        LIMIT 1`,
      [Number(ruleId)]
    );
    const current = currentRows[0];
    if (!current) {
      const error = new Error('Regla no encontrada');
      error.status = 404;
      throw error;
    }

    const cantidadDesde =
      typeof payload.cantidad_desde !== 'undefined'
        ? Math.max(1, Number(payload.cantidad_desde || 1))
        : Number(current.cantidad_desde);
    const cantidadHasta =
      typeof payload.cantidad_hasta !== 'undefined'
        ? payload.cantidad_hasta === null || payload.cantidad_hasta === ''
          ? null
          : Math.max(cantidadDesde, Number(payload.cantidad_hasta))
        : current.cantidad_hasta == null
        ? null
        : Number(current.cantidad_hasta);

    await assertNoOverlappingRuleTx(client, {
      listId: current.lista_precio_id,
      from: cantidadDesde,
      to: cantidadHasta,
      ignoreRuleId: current.id,
    });

    await client.query(
      `UPDATE reglas_precio_cantidad
          SET cantidad_desde = $1,
              cantidad_hasta = $2,
              modo = $3,
              lista_precio_alternativa_id = $4,
              descuento_pct = $5,
              precio_fijo = $6,
              prioridad = $7,
              activo = $8,
              actualizado_en = CURRENT_TIMESTAMP
        WHERE id = $9`,
      [
        cantidadDesde,
        cantidadHasta,
        typeof payload.modo !== 'undefined' ? String(payload.modo || 'lista').trim().toLowerCase() : current.modo,
        typeof payload.lista_precio_alternativa_id !== 'undefined'
          ? payload.lista_precio_alternativa_id
            ? Number(payload.lista_precio_alternativa_id)
            : null
          : current.lista_precio_alternativa_id,
        typeof payload.descuento_pct !== 'undefined'
          ? roundCurrency(payload.descuento_pct)
          : current.descuento_pct,
        typeof payload.precio_fijo !== 'undefined'
          ? roundCurrency(payload.precio_fijo)
          : current.precio_fijo,
        typeof payload.prioridad !== 'undefined'
          ? Number(payload.prioridad || 0)
          : current.prioridad,
        typeof payload.activo !== 'undefined'
          ? (normalizeActive(payload.activo, true) ? 1 : 0)
          : current.activo,
        Number(ruleId),
      ]
    );

    const rules = await listQuantityRulesTx(client, current.lista_precio_id);
    return rules.find((rule) => Number(rule.id) === Number(ruleId)) || null;
  });
}

async function deleteQuantityRule(ruleId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT lista_precio_id FROM reglas_precio_cantidad WHERE id = $1 LIMIT 1',
      [Number(ruleId)]
    );
    const row = rows[0];
    if (!row) {
      const error = new Error('Regla no encontrada');
      error.status = 404;
      throw error;
    }
    await client.query('DELETE FROM reglas_precio_cantidad WHERE id = $1', [Number(ruleId)]);
    return { id: Number(ruleId), lista_precio_id: Number(row.lista_precio_id) };
  });
}

async function resolveProductPrice({
  productId,
  priceListId = null,
  priceListCode = null,
  quantity = 1,
}) {
  return withTransaction((client) =>
    resolveProductPriceTx(client, {
      productId,
      priceListId,
      priceListCode,
      quantity,
    })
  );
}

async function resolveProductPriceTx(
  client,
  { productId, priceListId = null, priceListCode = null, quantity = 1 }
) {
  const priceLists = await listPriceListsTx(client, { includeInactive: false });
  const selectedList =
    (priceListId ? await getPriceListByIdTx(client, priceListId) : null) ||
    (priceListCode ? await getPriceListByCodeTx(client, priceListCode) : null) ||
    priceLists.find((item) => item.legacy_code === 'local') ||
    priceLists[0] ||
    null;

  if (!selectedList) {
    const error = new Error('No hay listas de precio configuradas');
    error.status = 400;
    throw error;
  }
  if (selectedList.enabled === false || selectedList.activo === false) {
    const error = new Error('La lista de precio seleccionada esta inactiva');
    error.status = 400;
    throw error;
  }

  let rows = await getProductPriceRowsTx(client, productId, { includeInactiveLists: true });
  if (!rows.length) {
    rows = await syncProductPriceRowsTx(client, productId, {
      motivo: 'resolve_product_price_bootstrap',
      recordHistory: false,
    });
  }

  const rowsByListId = new Map((rows || []).map((row) => [Number(row.lista_precio_id), row]));
  const stepRaw = await configRepo.getPriceRoundingStep().catch(() => 1);
    const rules = await listQuantityRulesTx(client, selectedList.id);
  const resolved = resolveQuantityPrice({
    selectedList,
    listsById: new Map(priceLists.map((item) => [Number(item.id), item])),
    priceRowsByListId: rowsByListId,
    rules,
    quantity,
    roundingStep: normalizeStep(stepRaw),
  });

  if (!resolved) {
    const error = new Error('No se pudo resolver el precio del producto');
    error.status = 400;
    throw error;
  }

  return {
    ...resolved,
    product_id: Number(productId),
    quantity: Math.max(1, Number(quantity || 1)),
    selected_list: selectedList,
    applied_list:
      priceLists.find((item) => Number(item.id) === Number(resolved.applied_list_id)) ||
      selectedList,
  };
}

module.exports = {
  listPriceLists,
  listPriceListsTx,
  getPriceListByIdTx,
  getPriceListByCodeTx,
  createPriceList,
  updatePriceList,
  deactivatePriceList,
  listProductPriceRows,
  updateProductPriceRows,
  getProductPriceRowsTx,
  syncProductPriceRowsTx,
  syncAllProductPriceRowsTx,
  listQuantityRulesTx,
  listQuantityRules,
  createQuantityRule,
  updateQuantityRule,
  deleteQuantityRule,
  resolveProductPriceTx,
  resolveProductPrice,
  serializePriceList,
};
