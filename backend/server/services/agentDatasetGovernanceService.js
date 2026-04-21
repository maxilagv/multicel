const { getDatasetMeta } = require('./agentDataRegistry');

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function computeFreshnessState({ generatedAt = null, freshnessSeconds = null, now = new Date() } = {}) {
  if (!generatedAt || !freshnessSeconds) return 'unknown';
  const generated = new Date(generatedAt);
  if (Number.isNaN(generated.getTime())) return 'unknown';
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - generated.getTime()) / 1000));
  return ageSeconds <= freshnessSeconds ? 'fresh' : 'stale';
}

function buildDatasetDescriptor(key, details = {}) {
  const meta = getDatasetMeta(key);
  const generatedAt = normalizeTimestamp(details.generated_at || details.generatedAt || null);
  const freshnessState = computeFreshnessState({
    generatedAt,
    freshnessSeconds: meta?.freshness_seconds || null,
    now: details.now || new Date(),
  });

  return {
    key,
    label: meta?.label || key,
    source: meta?.source || null,
    owner_technical: meta?.owner_technical || null,
    owner_business: meta?.owner_business || null,
    scope: meta?.scope || null,
    freshness_seconds: meta?.freshness_seconds || null,
    freshness_state: freshnessState,
    generated_at: generatedAt,
    fallback_mode: meta?.fallback_mode || null,
    used_fallback: Boolean(details.used_fallback),
    degraded: Boolean(details.degraded),
    reason: details.reason || null,
  };
}

function summarizeDatasets(datasets = []) {
  const list = Array.isArray(datasets) ? datasets : [];
  const degradedCount = list.filter((item) => item?.degraded || item?.used_fallback).length;
  const staleCount = list.filter((item) => item?.freshness_state === 'stale').length;
  return {
    total: list.length,
    degraded_count: degradedCount,
    stale_count: staleCount,
    healthy: degradedCount === 0 && staleCount === 0,
  };
}

module.exports = {
  buildDatasetDescriptor,
  summarizeDatasets,
  computeFreshnessState,
};
