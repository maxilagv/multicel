const DATASET_REGISTRY = {
  executive_summary_input: {
    label: 'Resumen ejecutivo canonico',
    source: '/internal/ai/executive-summary-input',
    owner_technical: 'backend/reportExecutiveService',
    owner_business: 'gerencia',
    scope: 'tenant_reporting',
    freshness_seconds: 600,
    timeout_seconds: 8,
    fallback_mode: 'summary_only',
  },
  workspace_dashboard: {
    label: 'Workspace diario del agente',
    source: 'aiWorkspaceService.getWorkspaceDashboard',
    owner_technical: 'backend/aiWorkspaceService',
    owner_business: 'operaciones',
    scope: 'tenant_priority_workspace',
    freshness_seconds: 600,
    timeout_seconds: 8,
    fallback_mode: 'cached_or_empty',
  },
  forecast: {
    label: 'Forecast por producto',
    source: 'aiService.forecastByProduct',
    owner_technical: 'ai-python/forecast_engine',
    owner_business: 'compras',
    scope: 'tenant_inventory',
    freshness_seconds: 3600,
    timeout_seconds: 8,
    fallback_mode: 'partial_read_only',
  },
  stockouts: {
    label: 'Riesgo de quiebre de stock',
    source: 'aiService.stockouts',
    owner_technical: 'backend/aiService.stockouts',
    owner_business: 'compras',
    scope: 'tenant_inventory',
    freshness_seconds: 900,
    timeout_seconds: 8,
    fallback_mode: 'partial_read_only',
  },
  anomalies: {
    label: 'Anomalias operativas',
    source: 'aiService.anomalies',
    owner_technical: 'backend/aiService.anomalies',
    owner_business: 'gerencia',
    scope: 'tenant_reporting',
    freshness_seconds: 1800,
    timeout_seconds: 8,
    fallback_mode: 'partial_read_only',
  },
  pricing: {
    label: 'Revision de precios',
    source: 'aiService.pricingRecommendations',
    owner_technical: 'ai-python/pricing_engine',
    owner_business: 'rentabilidad',
    scope: 'tenant_pricing',
    freshness_seconds: 3600,
    timeout_seconds: 8,
    fallback_mode: 'partial_read_only',
  },
  policy_engine: {
    label: 'Decision de policy',
    source: 'aiPolicyEngineService.evaluateProposalPolicy',
    owner_technical: 'backend/aiPolicyEngineService',
    owner_business: 'gobierno',
    scope: 'tenant_governance',
    freshness_seconds: 60,
    timeout_seconds: 2,
    fallback_mode: 'block_action',
  },
  session_history: {
    label: 'Historial de sesiones del agente',
    source: 'agentSessionRepository.listSessionRuns',
    owner_technical: 'backend/agentSessionRepository',
    owner_business: 'gobierno',
    scope: 'user_session_history',
    freshness_seconds: 60,
    timeout_seconds: 2,
    fallback_mode: 'empty_history',
  },
};

function getDatasetMeta(key) {
  return DATASET_REGISTRY[key] || null;
}

function listDatasets() {
  return Object.entries(DATASET_REGISTRY).map(([key, value]) => ({
    key,
    ...value,
  }));
}

module.exports = {
  DATASET_REGISTRY,
  getDatasetMeta,
  listDatasets,
};
