import { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  TrendingUp,
  UsersRound,
} from 'lucide-react';
import Button from '../ui/Button';
import Alert from '../components/Alert';
import { useAuth } from '../context/AuthContext';
import { getRoleFromToken } from '../lib/auth';
import { Api } from '../lib/api';

type Proposal = {
  id: number;
  category: 'ventas' | 'cobranzas' | 'stock' | 'rentabilidad' | 'seguimiento';
  priority_level: 'alta' | 'media' | 'baja';
  title: string;
  summary?: string | null;
  why_text?: string | null;
  recommended_action?: string | null;
  expected_impact?: string | null;
  entity_name?: string | null;
  effective_status:
    | 'pendiente'
    | 'en_revision'
    | 'aprobacion_pendiente'
    | 'aprobada'
    | 'programada'
    | 'descartada'
    | 'ejecutada'
    | 'vencida';
  requires_approval: boolean;
  approval_id?: number | null;
  last_seen_at: string;
  automation_event_status?: string | null;
  automation_event_error?: string | null;
};

type RunItem = {
  id: number;
  status: string;
  started_at: string;
  completed_at?: string | null;
  summary?: {
    proposals_created?: number;
    dashboard?: {
      total_abiertas?: number;
    };
  } | null;
};

type ExecutionItem = {
  id: number;
  status: string;
  proposal_title?: string | null;
  proposal_category?: Proposal['category'] | null;
  proposal_entity_name?: string | null;
  automation_event_status?: string | null;
  automation_event_error?: string | null;
  automation_event_updated_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  result?: {
    message?: string | null;
  } | null;
};

type DashboardResponse = {
  generated_at: string;
  automation_enabled: boolean;
  summary: {
    total_abiertas: number;
    por_area: Record<string, number>;
    por_prioridad: Record<string, number>;
    pendientes_aprobacion: number;
    en_revision: number;
  };
  proposals: Proposal[];
  recent_runs: RunItem[];
  recent_executions: ExecutionItem[];
};

const AREA_META = {
  ventas: {
    title: 'Para vender mas',
    subtitle: 'Clientes con buena chance de volver a comprar.',
    icon: UsersRound,
    accent: 'text-cyan-200',
    badge: 'bg-cyan-500/15 border-cyan-400/30 text-cyan-100',
  },
  cobranzas: {
    title: 'Para cuidar la caja',
    subtitle: 'Saldos pendientes que conviene ordenar.',
    icon: CircleDollarSign,
    accent: 'text-emerald-200',
    badge: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-100',
  },
  stock: {
    title: 'Para no quedarse sin mercaderia',
    subtitle: 'Productos que piden reposicion o revision de compra.',
    icon: Boxes,
    accent: 'text-amber-200',
    badge: 'bg-amber-500/15 border-amber-400/30 text-amber-100',
  },
  rentabilidad: {
    title: 'Para cuidar el margen',
    subtitle: 'Precios que conviene revisar con criterio.',
    icon: TrendingUp,
    accent: 'text-fuchsia-200',
    badge: 'bg-fuchsia-500/15 border-fuchsia-400/30 text-fuchsia-100',
  },
  seguimiento: {
    title: 'Para mirar con calma',
    subtitle: 'Situaciones fuera de lo habitual que merecen revision.',
    icon: SearchCheck,
    accent: 'text-slate-200',
    badge: 'bg-slate-500/15 border-slate-400/30 text-slate-100',
  },
} as const;

const STATUS_META: Record<
  Proposal['effective_status'],
  { label: string; className: string }
> = {
  pendiente: {
    label: 'Pendiente',
    className: 'bg-slate-500/15 border-slate-400/30 text-slate-100',
  },
  en_revision: {
    label: 'En revision',
    className: 'bg-cyan-500/15 border-cyan-400/30 text-cyan-100',
  },
  aprobacion_pendiente: {
    label: 'Esperando aprobacion',
    className: 'bg-amber-500/15 border-amber-400/30 text-amber-100',
  },
  aprobada: {
    label: 'Aprobada',
    className: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-100',
  },
  programada: {
    label: 'Enviada a automatizacion',
    className: 'bg-indigo-500/15 border-indigo-400/30 text-indigo-100',
  },
  descartada: {
    label: 'Descartada',
    className: 'bg-rose-500/15 border-rose-400/30 text-rose-100',
  },
  ejecutada: {
    label: 'Ejecutada',
    className: 'bg-indigo-500/15 border-indigo-400/30 text-indigo-100',
  },
  vencida: {
    label: 'Vencida',
    className: 'bg-slate-500/15 border-slate-400/30 text-slate-100',
  },
};

const PRIORITY_META = {
  alta: 'bg-rose-500/15 border-rose-400/30 text-rose-100',
  media: 'bg-amber-500/15 border-amber-400/30 text-amber-100',
  baja: 'bg-cyan-500/15 border-cyan-400/30 text-cyan-100',
} as const;

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getExecutionMeta(item: ExecutionItem) {
  const eventStatus = String(item.automation_event_status || '').trim().toLowerCase();
  const executionStatus = String(item.status || '').trim().toLowerCase();

  if (eventStatus === 'sent' || executionStatus === 'entregada') {
    return {
      label: 'Entregada al flujo automatico',
      className: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100',
      description:
        item.result?.message ||
        'El pedido ya salio correctamente hacia la automatizacion.',
    };
  }

  if (eventStatus === 'failed' || executionStatus === 'fallida') {
    return {
      label: 'No se pudo enviar',
      className: 'border-rose-400/30 bg-rose-500/15 text-rose-100',
      description:
        item.automation_event_error ||
        item.result?.message ||
        'La accion no pudo salir. Conviene revisarla antes de intentar otra vez.',
    };
  }

  if (eventStatus === 'pending' || executionStatus === 'reintentando') {
    return {
      label: 'Esperando nuevo intento',
      className: 'border-amber-400/30 bg-amber-500/15 text-amber-100',
      description:
        item.result?.message ||
        'El sistema la va a volver a intentar sin que tengas que repetir el paso.',
    };
  }

  if (eventStatus === 'sending' || executionStatus === 'en_proceso') {
    return {
      label: 'En proceso de envio',
      className: 'border-cyan-400/30 bg-cyan-500/15 text-cyan-100',
      description:
        item.result?.message ||
        'La automatizacion esta intentando entregarla ahora mismo.',
    };
  }

  return {
    label: 'Programada',
    className: 'border-slate-400/30 bg-slate-500/15 text-slate-100',
    description:
      item.result?.message ||
      'La accion ya esta registrada y esperando su turno dentro del flujo automatico.',
  };
}

export default function PrioridadesNegocio() {
  const { accessToken } = useAuth();
  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const canSendToAutomation = role === 'admin';
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyProposalId, setBusyProposalId] = useState<number | null>(null);

  async function load(opts: { refresh?: boolean } = {}) {
    setError(null);
    if (!opts.refresh) setLoading(true);
    try {
      const response = await Api.aiPrioridades({ refresh: opts.refresh });
      setData(response as DashboardResponse);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar las prioridades.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function refreshAnalysis() {
    setRefreshing(true);
    setActionMessage(null);
    setError(null);
    try {
      const response: any = await Api.aiActualizarPrioridades();
      setActionMessage(response?.message || 'Analisis actualizado.');
      await load();
    } catch (e: any) {
      setError(e?.message || 'No se pudo actualizar el analisis.');
    } finally {
      setRefreshing(false);
    }
  }

  async function moveProposal(id: number, status: 'en_revision' | 'descartada') {
    setBusyProposalId(id);
    setActionMessage(null);
    setError(null);
    try {
      const response: any = await Api.aiCambiarEstadoPropuesta(id, { status });
      setActionMessage(response?.message || 'Estado actualizado.');
      await load();
    } catch (e: any) {
      setError(e?.message || 'No se pudo actualizar el estado.');
    } finally {
      setBusyProposalId(null);
    }
  }

  async function requestApproval(id: number) {
    setBusyProposalId(id);
    setActionMessage(null);
    setError(null);
    try {
      const response: any = await Api.aiSolicitarAprobacionPropuesta(id);
      setActionMessage(response?.message || 'Solicitud enviada.');
      await load();
    } catch (e: any) {
      setError(e?.message || 'No se pudo pedir la aprobacion.');
    } finally {
      setBusyProposalId(null);
    }
  }

  async function executeProposal(id: number) {
    setBusyProposalId(id);
    setActionMessage(null);
    setError(null);
    try {
      const response: any = await Api.aiEjecutarPropuesta(id);
      setActionMessage(response?.message || 'La propuesta fue enviada a automatizacion.');
      await load();
    } catch (e: any) {
      setError(e?.message || 'No se pudo enviar la propuesta a automatizacion.');
    } finally {
      setBusyProposalId(null);
    }
  }

  const grouped = useMemo(() => {
    const groups = Object.keys(AREA_META).map((key) => ({
      key,
      items: (data?.proposals || []).filter((item) => item.category === key),
    }));
    return groups.filter((group) => group.items.length > 0);
  }, [data?.proposals]);

  const summaryCards = useMemo(
    () => [
      {
        key: 'ventas',
        title: 'Para vender mas',
        value: data?.summary?.por_area?.ventas || 0,
        icon: UsersRound,
      },
      {
        key: 'cobranzas',
        title: 'Para cuidar la caja',
        value: data?.summary?.por_area?.cobranzas || 0,
        icon: CircleDollarSign,
      },
      {
        key: 'stock',
        title: 'Para no quedarse sin mercaderia',
        value: data?.summary?.por_area?.stock || 0,
        icon: Boxes,
      },
      {
        key: 'rentabilidad',
        title: 'Para cuidar el margen',
        value: data?.summary?.por_area?.rentabilidad || 0,
        icon: TrendingUp,
      },
      {
        key: 'aprobaciones',
        title: 'Esperando aprobacion',
        value: data?.summary?.pendientes_aprobacion || 0,
        icon: ShieldCheck,
      },
    ],
    [data?.summary]
  );

  return (
    <div className="space-y-6">
      <section className="app-card relative overflow-hidden p-5 sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_30%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.26em] text-cyan-200/70">
              Centro operativo
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-50">
              Prioridades del negocio
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Este panel resume que conviene revisar hoy. Cada tarjeta explica que
              pasa, por que importa y cual es el siguiente paso, sin lenguaje tecnico.
            </p>
            <div className="mt-4 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
              El sistema detecta y ordena. No ejecuta nada solo.
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <Button onClick={refreshAnalysis} loading={refreshing} className="min-w-[190px]">
              <span className="inline-flex items-center gap-2">
                <RefreshCw size={16} />
                Actualizar analisis
              </span>
            </Button>
            <div className="text-xs text-slate-400">
              Ultima lectura: {formatDateTime(data?.generated_at)}
            </div>
          </div>
        </div>
      </section>

      {error && <Alert kind="error" message={error} />}
      {actionMessage && <Alert kind="info" message={actionMessage} />}
      {data && !data.automation_enabled && (
        <Alert
          kind="warning"
          message="La automatizacion todavia no esta conectada. Ya dejamos lista la base segura, pero el envio automatico se habilitara cuando configuremos n8n."
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map(({ key, title, value, icon: Icon }) => (
          <div key={key} className="app-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-slate-400">{title}</div>
                <div className="mt-2 text-3xl font-semibold text-slate-50">{value}</div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200">
                <Icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(300px,0.9fr)]">
        <div className="space-y-4">
          {loading && (
            <div className="app-card p-5 text-sm text-slate-400">
              Cargando prioridades del dia...
            </div>
          )}

          {!loading && grouped.length === 0 && (
            <div className="app-card p-8 text-center">
              <div className="text-lg font-semibold text-slate-100">No hay tareas abiertas por ahora</div>
              <p className="mt-2 text-sm text-slate-400">
                Cuando el sistema detecte algo importante para revisar, va a aparecer aca.
              </p>
            </div>
          )}

          {!loading &&
            grouped.map((group) => {
              const meta = AREA_META[group.key as keyof typeof AREA_META];
              const Icon = meta.icon;
              return (
                <section key={group.key} className="app-card p-4 sm:p-5">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 ${meta.accent}`}>
                        <Icon size={20} />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-slate-50">{meta.title}</div>
                        <div className="text-sm text-slate-400">{meta.subtitle}</div>
                      </div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                      {group.items.length} prioridades
                    </div>
                  </div>

                  <div className="space-y-3">
                    {group.items.map((item) => {
                      const statusMeta = STATUS_META[item.effective_status];
                      const priorityClass = PRIORITY_META[item.priority_level];
                      const waitingApproval = item.effective_status === 'aprobacion_pendiente';
                      const approved = item.effective_status === 'aprobada';
                      const canAutomate =
                        Boolean(data?.automation_enabled) &&
                        canSendToAutomation &&
                        (!item.requires_approval || approved);

                      return (
                        <article
                          key={item.id}
                          className="rounded-2xl border border-white/10 bg-white/5 p-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] ${meta.badge}`}>
                                  {meta.title}
                                </span>
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] ${priorityClass}`}>
                                  Prioridad {item.priority_level}
                                </span>
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] ${statusMeta.className}`}>
                                  {statusMeta.label}
                                </span>
                              </div>
                              <h2 className="mt-3 text-lg font-semibold text-slate-50">
                                {item.title}
                              </h2>
                              <p className="mt-2 text-sm leading-6 text-slate-300">
                                {item.summary || 'Hay una situacion que conviene revisar.'}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">
                              <div>Visto por ultima vez</div>
                              <div className="mt-1 text-slate-200">{formatDateTime(item.last_seen_at)}</div>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                Que pasa
                              </div>
                              <div className="mt-2 text-sm text-slate-200">
                                {item.summary || 'Sin detalle adicional.'}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                Por que lo vemos
                              </div>
                              <div className="mt-2 text-sm text-slate-200">
                                {item.why_text || 'El sistema detecto una senal para revisar.'}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                Proximo paso
                              </div>
                              <div className="mt-2 text-sm text-slate-200">
                                {item.recommended_action || 'Abrir el detalle y decidir el siguiente movimiento.'}
                              </div>
                            </div>
                          </div>

                          {item.expected_impact && (
                            <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                              Impacto esperado: {item.expected_impact}
                            </div>
                          )}

                          {item.automation_event_error && (
                            <div className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                              La automatizacion anterior no pudo salir. Conviene revisar el caso y
                              volver a intentarlo solo cuando quede claro el motivo.
                              <div className="mt-2 text-rose-50/90">
                                Motivo: {item.automation_event_error}
                              </div>
                            </div>
                          )}

                          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="text-xs text-slate-400">
                              {waitingApproval && item.approval_id
                                ? `Aprobacion #${item.approval_id} pendiente`
                                : approved && item.approval_id
                                ? `Aprobacion #${item.approval_id} concedida`
                                : item.requires_approval
                                ? 'Si se quiere automatizar, primero necesita aprobacion.'
                                : Boolean(data?.automation_enabled) && !canSendToAutomation
                                ? 'La automatizacion la habilita un usuario administrador.'
                                : 'Puede revisarse sin pedir aprobacion previa.'}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {!waitingApproval && !approved && (
                                <Button
                                  variant="ghost"
                                  onClick={() => moveProposal(item.id, 'en_revision')}
                                  loading={busyProposalId === item.id}
                                >
                                  Marcar en revision
                                </Button>
                              )}
                              {item.requires_approval && !waitingApproval && !approved && (
                                <Button
                                  variant="outline"
                                  onClick={() => requestApproval(item.id)}
                                  loading={busyProposalId === item.id}
                                >
                                  Pedir aprobacion
                                </Button>
                              )}
                              {canAutomate && (
                                <Button
                                  onClick={() => executeProposal(item.id)}
                                  loading={busyProposalId === item.id}
                                >
                                  Enviar a automatizacion
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                onClick={() => moveProposal(item.id, 'descartada')}
                                loading={busyProposalId === item.id}
                              >
                                Descartar
                              </Button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
        </div>

        <div className="space-y-4">
          <section className="app-card p-5">
            <div className="text-lg font-semibold text-slate-50">Como usar este panel</div>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                1. Mirar primero las prioridades altas y las que esperan aprobacion.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                2. Revisar cada tarjeta como una recomendacion, no como una orden automatica.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                3. Pedir aprobacion solo cuando se quiera avanzar con una accion sensible.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                4. Si una automatizacion falla, el caso vuelve a revision para evitar errores en cadena.
              </div>
            </div>
          </section>

          <section className="app-card p-5">
            <div className="flex items-center gap-2">
              <RefreshCw size={18} className="text-slate-300" />
              <div className="text-lg font-semibold text-slate-50">Seguimiento automatico</div>
            </div>
            <div className="mt-4 space-y-3">
              {(data?.recent_executions || []).length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                  Todavia no hay acciones enviadas a automatizacion.
                </div>
              )}
              {(data?.recent_executions || []).map((item) => {
                const meta = getExecutionMeta(item);
                const areaTitle =
                  AREA_META[item.proposal_category || 'seguimiento']?.title || 'Seguimiento general';

                return (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-100">
                          {item.proposal_title || 'Accion automatizada'}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {areaTitle}
                          {item.proposal_entity_name ? ` · ${item.proposal_entity_name}` : ''}
                        </div>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] ${meta.className}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-slate-300">{meta.description}</div>
                    <div className="mt-3 text-xs text-slate-500">
                      Ultimo movimiento: {formatDateTime(item.automation_event_updated_at || item.updated_at || item.created_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="app-card p-5">
            <div className="flex items-center gap-2">
              <Clock3 size={18} className="text-slate-300" />
              <div className="text-lg font-semibold text-slate-50">Ultimas revisiones</div>
            </div>
            <div className="mt-4 space-y-3">
              {(data?.recent_runs || []).length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                  Todavia no hay revisiones guardadas.
                </div>
              )}
              {(data?.recent_runs || []).map((run) => (
                <div key={run.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-100">
                        Revision #{run.id}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        Inicio: {formatDateTime(run.started_at)}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        Cierre: {formatDateTime(run.completed_at)}
                      </div>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] ${
                        run.status === 'completed'
                          ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100'
                          : run.status === 'failed'
                          ? 'border-rose-400/30 bg-rose-500/15 text-rose-100'
                          : 'border-slate-400/30 bg-slate-500/15 text-slate-100'
                      }`}
                    >
                      {run.status === 'completed'
                        ? 'Completa'
                        : run.status === 'failed'
                        ? 'Con error'
                        : 'En curso'}
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-slate-300">
                    {run.summary?.proposals_created != null
                      ? `${run.summary.proposals_created} prioridades detectadas en esa revision.`
                      : 'Revision registrada.'}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
