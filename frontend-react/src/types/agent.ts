export type AgentEvidenceItem = {
  label: string;
  value: string;
  tone?: string | null;
};

export type AgentDatasetMeta = {
  key: string;
  label?: string | null;
  source?: string | null;
  owner_technical?: string | null;
  owner_business?: string | null;
  scope?: string | null;
  freshness_seconds?: number | null;
  freshness_state?: 'fresh' | 'stale' | 'unknown' | string;
  generated_at?: string | null;
  fallback_mode?: string | null;
  used_fallback?: boolean;
  degraded?: boolean;
  reason?: string | null;
};

export type AgentSessionRun = {
  id?: number;
  run_id: number;
  lane_key: string;
  surface_key?: string | null;
  objective?: string | null;
  status: string;
  degraded: boolean;
  created_at?: string | null;
  run_started_at?: string | null;
  run_completed_at?: string | null;
  datasets?: AgentDatasetMeta[];
  summary?: Record<string, any>;
};

export type AgentAction = {
  id: string;
  title: string;
  summary?: string | null;
  action_type: string;
  risk_level: 'low' | 'medium' | 'high' | string;
  requires_approval: boolean;
  can_execute: boolean;
  status: string;
  blocked_reasons?: string[];
  proposal_id?: number | null;
  recommended_intent?: string | null;
  approval_status?: string | null;
  approval_policy?: string | null;
  decision_code?: string | null;
};

export type AgentSurface = {
  id?: string;
  type: string;
  [key: string]: any;
};

export type AgentEnvelope = {
  run: {
    id: number | null;
    status: string;
    degraded: boolean;
    started_at?: string | null;
    completed_at?: string | null;
  };
  session: {
    id: string | null;
    status: string;
    primary_lane?: string | null;
    current_surface?: string | null;
    summary?: Record<string, any>;
    runs?: AgentSessionRun[];
  };
  lane: {
    key: string | null;
    confidence: number;
    reason?: string | null;
    continued_from_session?: boolean;
  };
  response: {
    title: string;
    message: string;
    next_best_step?: string | null;
    follow_ups?: Array<Record<string, any>>;
  };
  surfaces: AgentSurface[];
  actions: AgentAction[];
  evidence: AgentEvidenceItem[];
  meta: {
    requires_clarification?: boolean;
    degraded?: boolean;
    used_fallback?: boolean;
    degradation_reason?: string | null;
    range?: any;
    freshness?: string | null;
    datasets?: AgentDatasetMeta[];
    data_quality?: {
      total: number;
      degraded_count: number;
      stale_count: number;
      healthy: boolean;
    };
  };
};

export type AgentRunInput = {
  surface?: 'today' | 'ask' | 'priorities' | 'analyze' | 'history' | 'widget';
  question?: string;
  preset?: 'overview' | 'today' | 'cash' | 'clients' | 'stock';
  session_id?: string | null;
  context?: {
    range?: { desde?: string | null; hasta?: string | null };
    filters?: Record<string, any>;
    active_entity?: Record<string, any> | null;
    detail_target?: string | null;
  };
  action?: {
    intent?: string | null;
    proposal_id?: number | null;
    execution_id?: number | null;
  };
};

export type AgentRuntimeStatus = {
  runtime_enabled: boolean;
  kill_switch_enabled: boolean;
  strict_action_gates: boolean;
  shadow_mode_enabled?: boolean;
  disabled_lanes?: string[];
  disabled_action_types?: string[];
  automation_window?: {
    raw?: string | null;
    start_hour?: number;
    end_hour?: number;
  } | null;
  operational_limits?: {
    max_automations_per_hour: number;
    max_automations_per_day: number;
    max_automations_per_action_per_day: number;
  };
  alert_thresholds?: {
    degraded_runs_last_24h: number;
    failed_executions_last_24h: number;
    pending_executions_last_24h: number;
  };
  chat_bridge_enabled?: boolean;
  session_enabled?: boolean;
  surfaces_enabled?: boolean;
};
