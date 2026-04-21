const { roundPrice } = require('./priceUtils');

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundCurrency(value) {
  return Math.round(toNumber(value, 0) * 100) / 100;
}

function isPositiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function normalizePriceMode(raw) {
  return String(raw || '').trim().toLowerCase() === 'manual' ? 'manual' : 'auto';
}

function normalizeMarginRatio(raw, fallback = 0) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeOptionalMarginRatio(raw) {
  if (raw === null || typeof raw === 'undefined' || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizeSlug(raw, fallback = 'lista') {
  const base = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || fallback;
}

function pickFirstPositive(...values) {
  for (const value of values) {
    if (isPositiveNumber(value)) return roundCurrency(value);
  }
  return 0;
}

function computeAutoPrice({ costPesos, marginRatio = 0, roundingStep = 1, fallbackPrice = 0 }) {
  const cost = toNumber(costPesos, 0);
  const margin = normalizeMarginRatio(marginRatio, 0);
  if (cost > 0) {
    return roundPrice(cost * (1 + margin), roundingStep);
  }
  const fallback = toNumber(fallbackPrice, 0);
  if (fallback > 0) {
    return roundPrice(fallback, roundingStep);
  }
  return 0;
}

function getLegacyMarginForList(list, product = {}) {
  if (list?.legacy_code === 'local') {
    return normalizeOptionalMarginRatio(product.margen_local);
  }
  if (list?.legacy_code === 'distribuidor') {
    return normalizeOptionalMarginRatio(product.margen_distribuidor);
  }
  if (list?.legacy_code === 'final') {
    return normalizeOptionalMarginRatio(product.margen_local);
  }
  return null;
}

function getLegacyPriceForList(list, product = {}) {
  if (list?.legacy_code === 'local') {
    return pickFirstPositive(product.price_local, product.price, product.precio_local);
  }
  if (list?.legacy_code === 'distribuidor') {
    return pickFirstPositive(product.price_distribuidor, product.precio_distribuidor, product.price_local, product.price);
  }
  if (list?.legacy_code === 'final') {
    return pickFirstPositive(
      product.precio_final,
      product.price,
      product.price_local,
      product.price_distribuidor,
      product.precio_local,
      product.precio_distribuidor
    );
  }
  return 0;
}

function getDefaultModeForList(list, product = {}) {
  if (list?.legacy_code === 'final' && isPositiveNumber(product.precio_final)) {
    return 'manual';
  }
  if (list?.legacy_code === 'local' || list?.legacy_code === 'distribuidor') {
    return normalizePriceMode(product.precio_modo);
  }
  return 'auto';
}

function buildRequestedRowsMap(requestedRows = []) {
  const map = new Map();
  for (const row of requestedRows || []) {
    const listId = Number(row?.lista_precio_id ?? row?.list_id ?? row?.id);
    if (!Number.isInteger(listId) || listId <= 0) continue;
    map.set(listId, row);
  }
  return map;
}

function buildExistingRowsMap(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    const listId = Number(row?.lista_precio_id ?? row?.list_id ?? row?.id);
    if (!Number.isInteger(listId) || listId <= 0) continue;
    map.set(listId, row);
  }
  return map;
}

function buildResolvedPriceRows({
  priceLists = [],
  product = {},
  requestedRows = [],
  existingRows = [],
  roundingStep = 1,
}) {
  const requestedByListId = buildRequestedRowsMap(requestedRows);
  const existingByListId = buildExistingRowsMap(existingRows);

  return (priceLists || []).map((list) => {
    const requested = requestedByListId.get(Number(list.id)) || {};
    const existing = existingByListId.get(Number(list.id)) || {};

    const defaultMode = getDefaultModeForList(list, product);
    const defaultLegacyMargin = getLegacyMarginForList(list, product);
    const effectiveMode = normalizePriceMode(
      requested.modo ?? requested.mode ?? existing.modo ?? existing.mode ?? defaultMode
    );

    const marginOverrideRatio =
      normalizeOptionalMarginRatio(
        requested.margen_override_ratio ?? requested.margin_override_ratio
      ) ??
      normalizeOptionalMarginRatio(
        existing.margen_override_ratio ?? existing.margin_override_ratio
      ) ??
      defaultLegacyMargin;

    const listMarginRatio = normalizeMarginRatio(list.margen_ratio, 0);
    const autoMarginRatio =
      marginOverrideRatio !== null ? marginOverrideRatio : listMarginRatio;

    const manualCandidate = pickFirstPositive(
      requested.precio,
      requested.price,
      existing.precio,
      existing.price,
      getLegacyPriceForList(list, product)
    );

    const autoFallback = pickFirstPositive(
      existing.precio,
      existing.price,
      requested.precio,
      requested.price,
      getLegacyPriceForList(list, product),
      product.price
    );

    const price =
      effectiveMode === 'manual'
        ? roundCurrency(manualCandidate)
        : computeAutoPrice({
            costPesos: product.costo_pesos ?? product.precio_costo_pesos ?? 0,
            marginRatio: autoMarginRatio,
            roundingStep,
            fallbackPrice: autoFallback,
          });

    return {
      lista_precio_id: Number(list.id),
      legacy_code: list.legacy_code || null,
      slug: list.slug || null,
      nombre: list.nombre || null,
      precio: roundCurrency(price),
      modo: effectiveMode,
      margen_override_ratio: marginOverrideRatio,
    };
  });
}

function deriveLegacyProductFields({ resolvedRows = [], priceLists = [], product = {} }) {
  const rowsByLegacyCode = new Map();
  for (const row of resolvedRows || []) {
    const list = (priceLists || []).find((item) => Number(item.id) === Number(row.lista_precio_id));
    if (list?.legacy_code) {
      rowsByLegacyCode.set(String(list.legacy_code), row);
    }
  }

  const localRow = rowsByLegacyCode.get('local');
  const distribuidorRow = rowsByLegacyCode.get('distribuidor');
  const finalRow = rowsByLegacyCode.get('final');

  const precioLocal = roundCurrency(localRow?.precio ?? product.price_local ?? product.precio_local ?? 0);
  const precioDistribuidor = roundCurrency(
    distribuidorRow?.precio ?? product.price_distribuidor ?? product.precio_distribuidor ?? 0
  );
  const precioFinal = roundCurrency(
    finalRow?.precio ??
      product.precio_final ??
      product.price ??
      product.price_local ??
      product.price_distribuidor ??
      0
  );

  return {
    precio_local: precioLocal,
    precio_distribuidor: precioDistribuidor,
    precio_final: precioFinal,
    precio_venta: precioLocal > 0 ? precioLocal : pickFirstPositive(precioDistribuidor, precioFinal, product.price),
    precio_modo:
      localRow?.modo === 'manual' || distribuidorRow?.modo === 'manual' ? 'manual' : 'auto',
    margen_local:
      normalizeOptionalMarginRatio(localRow?.margen_override_ratio) ??
      normalizeOptionalMarginRatio(product.margen_local) ??
      0.15,
    margen_distribuidor:
      normalizeOptionalMarginRatio(distribuidorRow?.margen_override_ratio) ??
      normalizeOptionalMarginRatio(product.margen_distribuidor) ??
      0.45,
  };
}

function matchesQuantityRule(rule, quantity) {
  const qty = Math.max(1, Number(quantity || 1));
  const from = Math.max(1, Number(rule?.cantidad_desde || 1));
  const to = rule?.cantidad_hasta == null ? null : Number(rule.cantidad_hasta);
  if (qty < from) return false;
  if (to !== null && Number.isFinite(to) && qty > to) return false;
  return true;
}

function selectQuantityRule(rules = [], quantity) {
  const candidates = (rules || [])
    .filter((rule) => Number(rule?.activo ?? 1) !== 0)
    .filter((rule) => matchesQuantityRule(rule, quantity))
    .sort((a, b) => {
      const prioDiff = Number(b?.prioridad || 0) - Number(a?.prioridad || 0);
      if (prioDiff !== 0) return prioDiff;
      const fromDiff = Number(b?.cantidad_desde || 0) - Number(a?.cantidad_desde || 0);
      if (fromDiff !== 0) return fromDiff;
      return Number(b?.id || 0) - Number(a?.id || 0);
    });

  return candidates[0] || null;
}

function buildQuantityRuleSummary(rule, appliedList) {
  if (!rule) return null;
  const from = Math.max(1, Number(rule.cantidad_desde || 1));
  const to =
    rule.cantidad_hasta == null || rule.cantidad_hasta === ''
      ? '+'
      : Number(rule.cantidad_hasta);
  const rangeText = to === '+' ? `${from}+` : `${from}-${to}`;
  const mode = String(rule.modo || 'lista').trim().toLowerCase();
  if (mode === 'lista_alternativa') {
    return `${rangeText}: usa ${appliedList?.nombre || 'otra lista'}`;
  }
  if (mode === 'descuento_pct') {
    return `${rangeText}: ${roundCurrency(rule.descuento_pct)}% off`;
  }
  if (mode === 'precio_fijo') {
    return `${rangeText}: precio fijo $${roundCurrency(rule.precio_fijo)}`;
  }
  return `${rangeText}: misma lista`;
}

function resolveQuantityPrice({
  selectedList,
  listsById = new Map(),
  priceRowsByListId = new Map(),
  rules = [],
  quantity = 1,
  roundingStep = 1,
}) {
  if (!selectedList || !Number.isInteger(Number(selectedList.id))) return null;
  const selectedRow = priceRowsByListId.get(Number(selectedList.id)) || null;
  if (!selectedRow) return null;

  const basePrice = roundCurrency(selectedRow.precio ?? selectedRow.price ?? 0);
  let appliedList = selectedList;
  let appliedPrice = basePrice;
  const matchedRule = selectQuantityRule(rules, quantity);

  if (matchedRule) {
    const mode = String(matchedRule.modo || 'lista').trim().toLowerCase();
    if (mode === 'lista_alternativa') {
      const altListId = Number(matchedRule.lista_precio_alternativa_id || 0);
      const altList = listsById.get(altListId) || null;
      const altRow = priceRowsByListId.get(altListId) || null;
      if (altList && altRow) {
        appliedList = altList;
        appliedPrice = roundCurrency(altRow.precio ?? altRow.price ?? 0);
      }
    } else if (mode === 'descuento_pct') {
      const pct = Math.max(0, toNumber(matchedRule.descuento_pct, 0));
      appliedPrice = roundPrice(basePrice * (1 - pct / 100), roundingStep);
    } else if (mode === 'precio_fijo') {
      appliedPrice = roundCurrency(matchedRule.precio_fijo);
    }
  }

  return {
    selected_list_id: Number(selectedList.id),
    selected_list_code: selectedList.legacy_code || selectedList.slug || null,
    selected_list_name: selectedList.nombre || null,
    applied_list_id: Number(appliedList.id),
    applied_list_code: appliedList.legacy_code || appliedList.slug || null,
    applied_list_name: appliedList.nombre || null,
    unit_price: roundCurrency(appliedPrice),
    base_unit_price: roundCurrency(basePrice),
    rule_id: matchedRule ? Number(matchedRule.id) : null,
    rule_summary: buildQuantityRuleSummary(matchedRule, appliedList),
  };
}

module.exports = {
  toNumber,
  roundCurrency,
  isPositiveNumber,
  normalizePriceMode,
  normalizeMarginRatio,
  normalizeOptionalMarginRatio,
  normalizeSlug,
  pickFirstPositive,
  computeAutoPrice,
  buildResolvedPriceRows,
  deriveLegacyProductFields,
  matchesQuantityRule,
  selectQuantityRule,
  resolveQuantityPrice,
};
