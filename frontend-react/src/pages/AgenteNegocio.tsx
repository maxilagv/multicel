import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Brain,
  History,
  ListTodo,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import Alert from '../components/Alert';
import { useTenantModules } from '../context/TenantModulesContext';
import { useAgentRuntime } from '../hooks/useAgentRuntime';
import type { AgentAction, AgentDatasetMeta, AgentEnvelope, AgentSurface } from '../types/agent';
import Button from '../ui/Button';

type AgentTab = 'today' | 'ask' | 'priorities' | 'analyze' | 'history';

const TAB_META: Array<{
  id: AgentTab;
  label: string;
  helper: string;
  icon: typeof Brain;
}> = [
  {
    id: 'today',
    label: 'Hoy',
    helper: 'Entende rapido como viene el negocio y que conviene atender primero.',
    icon: TrendingUp,
  },
  {
    id: 'ask',
    label: 'Preguntar',
    helper: 'Hace una pregunta corta y el agente la baja a datos, focos y proximos pasos.',
    icon: Brain,
  },
  {
    id: 'priorities',
    label: 'Prioridades',
    helper: 'Revisa acciones, aprobaciones y estados sin salir del mismo agente.',
    icon: ListTodo,
  },
  {
    id: 'analyze',
    label: 'Analizar',
    helper: 'Profundiza stock, forecast, precios y anomalias cuando haga falta detalle.',
    icon: SearchCheck,
  },
  {
    id: 'history',
    label: 'Historial',
    helper: 'Retoma corridas recientes, sesiones activas y trazabilidad del agente.',
    icon: History,
  },
];

const PRESETS: Array<{
  preset: 'overview' | 'today' | 'cash' | 'clients' | 'stock';
  label: string;
}> = [
  { preset: 'overview', label: 'Como viene el negocio' },
  { preset: 'today', label: 'Que debo atender hoy' },
  { preset: 'cash', label: 'Como esta la caja' },
  { preset: 'clients', label: 'Que clientes conviene mirar' },
  { preset: 'stock', label: 'Que stock revisar ya' },
];

function getSurface<T extends AgentSurface = AgentSurface>(data: AgentEnvelope | null, type: string) {
  return (data?.surfaces || []).find((item) => item.type === type) as T | undefined;
}

function actionLabel(item: AgentAction) {
  if (item.recommended_intent === 'execute') return 'Ejecutar';
  if (item.recommended_intent === 'request_approval') return 'Pedir aprobacion';
  return 'Revisar';
}

function toneClass(tone?: string | null) {
  const normalized = String(tone || '').trim().toLowerCase();
  if (normalized === 'urgente') return 'border-rose-400/30 bg-rose-500/12 text-rose-100';
  if (normalized === 'atencion') return 'border-amber-400/30 bg-amber-500/12 text-amber-100';
  return 'border-emerald-400/30 bg-emerald-500/12 text-emerald-100';
}

export default function AgenteNegocio() {
  const [searchParams] = useSearchParams();
  const { isModuleEnabled } = useTenantModules();
  const [activeTab, setActiveTab] = useState<AgentTab>('today');
  const [question, setQuestion] = useState('');
  const { data, status, loading, error, runAgent, continueSession, refreshCurrentSurface, triggerAction, submitFeedback } =
    useAgentRuntime();
  const predictiveEnabled = isModuleEnabled('predicciones');
  const visibleTabs = TAB_META.filter((tab) => tab.id !== 'analyze' || predictiveEnabled);

  useEffect(() => {
    const requestedView = String(searchParams.get('view') || '').trim().toLowerCase();
    const requestedPreset = String(searchParams.get('preset') || '').trim().toLowerCase();
    const requestedTab: AgentTab =
      requestedView === 'ask' || requestedView === 'priorities' || requestedView === 'analyze' || requestedView === 'history'
        ? (requestedView as AgentTab)
        : 'today';
    const nextTab: AgentTab =
      requestedTab === 'analyze' && !predictiveEnabled ? 'today' : requestedTab;

    setActiveTab(nextTab);

    if (nextTab === 'priorities') {
      continueSession({ surface: 'priorities' }).catch(() => {});
      return;
    }

    if (nextTab === 'analyze') {
      continueSession({ surface: 'analyze' }).catch(() => {});
      return;
    }

    if (nextTab === 'history') {
      continueSession({ surface: 'history' }).catch(() => {});
      return;
    }

    if (nextTab === 'ask') {
      const preset =
        requestedPreset === 'today' ||
        requestedPreset === 'cash' ||
        requestedPreset === 'clients' ||
        requestedPreset === 'stock'
          ? (requestedPreset as 'today' | 'cash' | 'clients' | 'stock')
          : 'overview';
      continueSession({ surface: 'ask', preset }).catch(() => {});
      return;
    }

    runAgent({ surface: 'today', preset: 'overview' }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictiveEnabled]);

  async function openTab(tab: AgentTab) {
    if (tab === 'analyze' && !predictiveEnabled) {
      setActiveTab('today');
      await continueSession({ surface: 'today', preset: 'overview' }).catch(() => {});
      return;
    }
    setActiveTab(tab);
    if (tab === 'today') {
      await continueSession({ surface: 'today', preset: 'overview' }).catch(() => {});
      return;
    }
    if (tab === 'priorities') {
      await continueSession({ surface: 'priorities' }).catch(() => {});
      return;
    }
    if (tab === 'analyze') {
      await continueSession({ surface: 'analyze' }).catch(() => {});
      return;
    }
    if (tab === 'history') {
      await continueSession({ surface: 'history' }).catch(() => {});
    }
  }

  async function askPreset(preset: 'overview' | 'today' | 'cash' | 'clients' | 'stock') {
    setActiveTab('ask');
    await continueSession({ surface: 'ask', preset }).catch(() => {});
  }

  async function askQuestion() {
    if (!question.trim()) return;
    setActiveTab('ask');
    await continueSession({
      surface: 'ask',
      question: question.trim(),
    }).catch(() => {});
  }

  async function handleFollowUp(item: Record<string, any>) {
    if (item.surface) {
      await openTab(item.surface as AgentTab);
      return;
    }
    if (item.action_intent === 'refresh') {
      await refreshCurrentSurface().catch(() => {});
    }
  }

  const hero = getSurface<any>(data, 'hero_summary');
  const focusCards = getSurface<any>(data, 'focus_cards')?.items || [];
  const actionItems =
    getSurface<any>(data, 'action_list')?.items || data?.actions || [];
  const evidenceItems = getSurface<any>(data, 'evidence_block')?.items || data?.evidence || [];
  const detailPanel = getSurface<any>(data, 'detail_panel');
  const approvalPanel = getSurface<any>(data, 'approval_panel');
  const executionStatus = getSurface<any>(data, 'execution_status');
  const historyPanel = getSurface<any>(data, 'session_history');
  const askHighlightsPanel = getSurface<any>(data, 'ask_highlights');
  const metricStripPanel = getSurface<any>(data, 'metric_strip');
  const datasets = (data?.meta?.datasets || []) as AgentDatasetMeta[];
  const isAskExperience = activeTab === 'ask';
  const askHighlights = Array.isArray(askHighlightsPanel?.items)
    ? askHighlightsPanel.items
    : focusCards.slice(0, 3);
  const askMetrics = Array.isArray(metricStripPanel?.items)
    ? metricStripPanel.items
    : evidenceItems.slice(0, 4);
  const heroEyebrow = isAskExperience ? 'Pregunta del negocio' : hero?.title;
  const heroHeading = isAskExperience ? 'Respuesta del agente' : data?.response?.title;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.16),_transparent_28%),linear-gradient(135deg,_rgba(8,15,34,0.98),_rgba(16,24,44,0.94))] p-6 text-slate-100 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <div className="absolute inset-y-0 right-0 hidden w-64 bg-[radial-gradient(circle,_rgba(255,255,255,0.08),_transparent_70%)] md:block" />
        <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.95fr)]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-emerald-100">
              <Sparkles size={14} />
              Agente del negocio
            </div>
            <div className="space-y-3">
              <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Una sola entrada para entender, decidir y actuar.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                El motor del agente hace el trabajo pesado por dentro. Vos ves focos claros,
                evidencia concreta y el siguiente paso correcto.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                const active = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => openTab(tab.id)}
                    className={[
                      'rounded-2xl border p-4 text-left transition',
                      active
                        ? 'border-emerald-300/40 bg-emerald-400/12 shadow-[0_18px_45px_rgba(16,185,129,0.16)]'
                        : 'border-white/10 bg-white/5 hover:bg-white/8',
                    ].join(' ')}
                  >
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-emerald-100">
                      <Icon size={18} />
                    </div>
                    <div className="text-sm font-medium text-white">{tab.label}</div>
                    <div className="mt-2 text-xs leading-5 text-slate-300">{tab.helper}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-slate-950/35 p-5 backdrop-blur">
            <div className="mb-3 text-sm font-medium text-white">Preguntar sin friccion</div>
            <p className="mb-4 text-sm leading-6 text-slate-300">
              Usa una pregunta corta o elegi un preset. El agente baja todo a lenguaje de negocio.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESETS.map((item) => (
                <button
                  key={item.preset}
                  type="button"
                  onClick={() => askPreset(item.preset)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-white/8"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="mt-4 mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">
              Pregunta libre
            </label>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={4}
              placeholder="Ejemplo: decime si tengo un riesgo real de stock esta semana"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-300/40 focus:ring-2 focus:ring-emerald-400/20"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={askQuestion} loading={loading} className="min-w-[170px]">
                {loading ? 'Analizando...' : 'Preguntar al agente'}
              </Button>
              <Button variant="ghost" onClick={() => refreshCurrentSurface()} disabled={loading}>
                <RefreshCw size={16} className="mr-2" />
                Actualizar vista
              </Button>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-5 text-slate-300">
              No hace falta escribir prompts largos. Con una pregunta simple alcanza.
            </div>
          </div>
        </div>
      </section>

      <Alert kind="error" message={error} />

      {status?.kill_switch_enabled && (
        <Alert
          kind="warning"
          message="El agente esta temporalmente pausado por un kill switch operativo. La vista puede seguir mostrando historial, pero no deberia confiarse nueva ejecucion."
        />
      )}

      {status?.shadow_mode_enabled && (
        <Alert
          kind="warning"
          message="El agente esta en shadow mode: las automatizaciones se validan y auditan, pero no generan side effects reales."
        />
      )}

      {Array.isArray(status?.disabled_lanes) && status.disabled_lanes.length > 0 && (
        <Alert
          kind="warning"
          message={`Hay lanes deshabilitados por operacion: ${status.disabled_lanes.join(', ')}`}
        />
      )}

      {data?.meta?.degraded && (
        <Alert
          kind="warning"
          message={data.meta.degradation_reason || 'El agente respondio con datos parciales o un fallback seguro.'}
        />
      )}

      {hero && (
        <section className="rounded-[24px] border border-slate-200/10 bg-slate-950/40 p-5 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.18)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-300">
                {heroEyebrow}
              </div>
              <h2 className="text-2xl font-semibold text-white">{heroHeading}</h2>
              {isAskExperience && data?.response?.title && (
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  {data.response.title}
                </p>
              )}
              <p className="max-w-3xl text-sm leading-6 text-slate-300">{hero.summary || data?.response?.message}</p>
            </div>
            <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClass(hero.status_tone)}`}>
              <div className="font-medium">Proximo paso</div>
              <div className="mt-1 text-xs leading-5 opacity-90">{hero.next_step || data?.response?.next_best_step || 'Seguir el foco principal.'}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="ghost"
              onClick={() =>
                submitFeedback({
                  runId: data?.run?.id || null,
                  feedbackType: 'run_helpful',
                  rating: 1,
                })
              }
              disabled={!data?.run?.id || loading}
            >
              Me sirvio
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                submitFeedback({
                  runId: data?.run?.id || null,
                  feedbackType: 'run_not_helpful',
                  rating: -1,
                })
              }
              disabled={!data?.run?.id || loading}
            >
              No me sirvio
            </Button>
          </div>
        </section>
      )}

      {isAskExperience && (askHighlights.length > 0 || askMetrics.length > 0) && (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <article className="rounded-[24px] border border-slate-200/10 bg-slate-950/40 p-5 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.18)]">
            <div className="mb-4 text-lg font-semibold text-white">En simple</div>
            <div className="space-y-3">
              {askHighlights.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  El agente no encontro focos adicionales para resumir en esta pregunta.
                </div>
              )}
              {askHighlights.map((item: any, index: number) => (
                <article
                  key={`${item.title || 'ask'}_${index}`}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${toneClass(item.tone)}`}
                    >
                      {item.tone || 'estable'}
                    </span>
                    <span className="text-sm font-medium text-white">{item.title}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{item.summary}</p>
                  {item.why_it_matters && (
                    <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-xs leading-5 text-slate-300">
                      {item.why_it_matters}
                    </div>
                  )}
                  {item.next_step && (
                    <div className="mt-3 text-xs leading-5 text-emerald-200">
                      {item.next_step}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </article>

          <article className="rounded-[24px] border border-slate-200/10 bg-slate-950/40 p-5 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.18)]">
            <div className="mb-4 text-lg font-semibold text-white">Metricas clave</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {askMetrics.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  No hay metricas concretas para esta pregunta.
                </div>
              )}
              {askMetrics.map((item: any, index: number) => (
                <div
                  key={`${item.label}_${index}`}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                >
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{item.label}</div>
                  <div className="mt-2 text-xl font-semibold text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {datasets.length > 0 && !isAskExperience && (
        <section className="rounded-[24px] border border-slate-200/10 bg-slate-950/40 p-5 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.18)]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-white">Calidad de datos y gobierno</div>
              <div className="mt-1 text-sm text-slate-300">
                {data?.meta?.data_quality?.healthy
                  ? 'La corrida uso datasets frescos y sin degradaciones visibles.'
                  : 'La corrida tuvo degradaciones, fallbacks o datos que conviene revisar.'}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs uppercase tracking-[0.18em] text-slate-300">
              lane {data?.lane?.key || 'n/a'}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {datasets.map((item) => (
              <article key={item.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                    {item.label || item.key}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${toneClass(item.degraded ? 'atencion' : item.freshness_state === 'stale' ? 'atencion' : 'estable')}`}>
                    {item.degraded ? 'degradado' : item.freshness_state || 'unknown'}
                  </span>
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  <div>Fuente: {item.source || 'sin fuente visible'}</div>
                  <div>Owner negocio: {item.owner_business || 'no definido'}</div>
                  <div>Fallback: {item.fallback_mode || 'sin fallback'}</div>
                  {item.reason && <div className="text-amber-200">{item.reason}</div>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {focusCards.length > 0 && !isAskExperience && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {focusCards.map((card: any) => (
            <article
              key={card.id || card.title}
              className="rounded-[22px] border border-slate-200/10 bg-[linear-gradient(145deg,_rgba(15,23,42,0.96),_rgba(30,41,59,0.88))] p-5 text-slate-100 shadow-[0_18px_50px_rgba(2,6,23,0.16)]"
            >
              <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${toneClass(card.tone)}`}>
                {card.tone || 'estable'}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{card.summary}</p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-slate-300">
                <div className="font-medium text-slate-100">Por que importa</div>
                <div className="mt-1">{card.why_it_matters}</div>
              </div>
              <div className="mt-3 text-xs leading-5 text-emerald-200">
                {card.next_step}
              </div>
            </article>
          ))}
        </section>
      )}

      {actionItems.length > 0 && !isAskExperience && (
        <section className="rounded-[24px] border border-slate-200/10 bg-slate-950/40 p-5 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.18)]">
          <div className="mb-4 flex items-center gap-2 text-white">
            <ShieldCheck size={18} />
            <h2 className="text-lg font-semibold">Acciones y decisiones</h2>
          </div>
          <div className="grid gap-3">
            {actionItems.map((item: AgentAction) => (
              <article key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                        {item.status}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${toneClass(item.risk_level === 'high' ? 'urgente' : item.risk_level === 'medium' ? 'atencion' : 'estable')}`}>
                        Riesgo {item.risk_level}
                      </span>
                    </div>
                    <div className="text-base font-medium text-white">{item.title}</div>
                    {item.summary && <div className="text-sm leading-6 text-slate-300">{item.summary}</div>}
                    {Array.isArray(item.blocked_reasons) && item.blocked_reasons.length > 0 && (
                      <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
                        {item.blocked_reasons[0]}
                      </div>
                    )}
                    {item.approval_policy && (
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Policy: {item.approval_policy}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={() => item.proposal_id && item.recommended_intent && triggerAction(item.recommended_intent, item.proposal_id)}
                      disabled={!item.proposal_id || !item.recommended_intent || loading}
                      className="min-w-[180px]"
                    >
                      {actionLabel(item)}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        submitFeedback({
                          proposalId: item.proposal_id || null,
                          feedbackType: 'proposal_useful',
                          rating: 1,
                        })
                      }
                      disabled={!item.proposal_id || loading}
                    >
                      Marcar util
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {detailPanel && !isAskExperience && (
        <section className="rounded-[24px] border border-slate-200/10 bg-slate-950/40 p-5 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.18)]">
          <div className="mb-4 flex items-center gap-2 text-white">
            <SearchCheck size={18} />
            <h2 className="text-lg font-semibold">{detailPanel.title || 'Analisis'}</h2>
          </div>
          <p className="text-sm leading-6 text-slate-300">{detailPanel.summary}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {(detailPanel.sections || []).map((section: any) => (
              <div key={section.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-medium text-white">{section.title}</div>
                <div className="mt-3 space-y-2">
                  {(section.rows || []).map((row: any, index: number) => (
                    <div key={`${section.title}_${index}`} className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{row.label}</div>
                      <div className="mt-1 text-sm text-slate-200">{row.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(approvalPanel || executionStatus) && !isAskExperience && (
        <section className="grid gap-4 lg:grid-cols-2">
          {approvalPanel && (
            <article className="rounded-[24px] border border-slate-200/10 bg-slate-950/40 p-5 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.18)]">
              <div className="text-lg font-semibold text-white">Revision y aprobacion</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">{approvalPanel.reason || approvalPanel.title}</div>
              <div className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-400">
                Estado: {approvalPanel.approval_status || 'sin aprobacion'}
              </div>
            </article>
          )}
          {executionStatus && (
            <article className="rounded-[24px] border border-slate-200/10 bg-slate-950/40 p-5 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.18)]">
              <div className="text-lg font-semibold text-white">Estado de ejecucion</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">{executionStatus.message}</div>
              <div className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-400">
                Estado: {executionStatus.status || 'sin ejecucion'}
              </div>
            </article>
          )}
        </section>
      )}

      {evidenceItems.length > 0 && !isAskExperience && (
        <section className="grid gap-3 md:grid-cols-3">
          {evidenceItems.map((item: any, index: number) => (
            <div
              key={`${item.label}_${index}`}
              className="rounded-2xl border border-slate-200/10 bg-white/5 px-4 py-4 text-slate-100"
            >
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{item.label}</div>
              <div className="mt-2 text-xl font-semibold text-white">{item.value}</div>
            </div>
          ))}
        </section>
      )}

      {historyPanel && (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <article className="rounded-[24px] border border-slate-200/10 bg-slate-950/40 p-5 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.18)]">
            <div className="mb-4 text-lg font-semibold text-white">Corridas de esta sesion</div>
            <div className="space-y-3">
              {(historyPanel.runs || []).length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  Todavia no hay corridas trazables para esta sesion.
                </div>
              )}
              {(historyPanel.runs || []).map((item: any) => (
                <div key={`run_${item.run_id}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">{item.summary?.title || item.objective || `Run ${item.run_id}`}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                        {item.lane_key} | {item.surface_key || 'surface'} | {item.status}
                      </div>
                    </div>
                    <div className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${toneClass(item.degraded ? 'atencion' : 'estable')}`}>
                      {item.degraded ? 'degradado' : 'estable'}
                    </div>
                  </div>
                  {item.summary?.message && (
                    <div className="mt-3 text-sm leading-6 text-slate-300">{item.summary.message}</div>
                  )}
                </div>
              ))}
            </div>
          </article>
          <article className="rounded-[24px] border border-slate-200/10 bg-slate-950/40 p-5 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.18)]">
            <div className="mb-4 text-lg font-semibold text-white">Sesiones recientes</div>
            <div className="space-y-3">
              {(historyPanel.recent_sessions || []).length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  No hay otras sesiones recientes para mostrar.
                </div>
              )}
              {(historyPanel.recent_sessions || []).map((item: any) => (
                <div key={item.session_key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-medium text-white">{item.current_objective || 'Sesion del agente'}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                    {item.primary_lane || 'sin lane'} | {item.current_surface || 'surface'}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {Array.isArray(data?.response?.follow_ups) && data.response.follow_ups.length > 0 && (
        <section className="rounded-[24px] border border-slate-200/10 bg-slate-950/40 p-5 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.18)]">
          <div className="mb-4 text-lg font-semibold text-white">Seguir sin friccion</div>
          <div className="flex flex-wrap gap-3">
            {data.response.follow_ups.map((item: any, index: number) => (
              <Button key={`followup_${index}`} variant="ghost" onClick={() => handleFollowUp(item)} disabled={loading}>
                {item.label}
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
