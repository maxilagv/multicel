import { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  Brain,
  CircleDollarSign,
  MessageSquareText,
  RefreshCw,
  TrendingUp,
  UsersRound,
} from 'lucide-react';
import Alert from '../components/Alert';
import { Api } from '../lib/api';
import Button from '../ui/Button';

type AssistantIntent = 'overview' | 'today' | 'cash' | 'clients' | 'stock';

type AssistantCard = {
  title: string;
  tone: 'estable' | 'atencion' | 'urgente' | string;
  summary: string;
  why_it_matters: string;
  next_step: string;
  impact?: string | null;
};

type AssistantAction = {
  id: number;
  title: string;
  summary?: string | null;
  next_step?: string | null;
  needs_approval?: boolean;
};

type AssistantResponse = {
  generated_at: string;
  question: string;
  intent: AssistantIntent;
  answer: string;
  used_llm: boolean;
  range?: { desde?: string; hasta?: string; dias?: number } | null;
  cards: AssistantCard[];
  priority_actions: AssistantAction[];
  evidence: { label: string; value: string }[];
};

const PRESETS: Array<{
  intent: AssistantIntent;
  label: string;
  helper: string;
  icon: typeof Brain;
}> = [
  {
    intent: 'overview',
    label: 'Como viene el negocio',
    helper: 'Panorama general para entender rapido si el negocio viene bien, con presion o con oportunidades.',
    icon: TrendingUp,
  },
  {
    intent: 'today',
    label: 'Que debo atender hoy',
    helper: 'Lo urgente del dia para no perder ventas, caja ni tiempo.',
    icon: Brain,
  },
  {
    intent: 'cash',
    label: 'Donde se me va la caja',
    helper: 'Entradas, salidas y focos donde conviene ordenar pagos o cobranzas.',
    icon: CircleDollarSign,
  },
  {
    intent: 'clients',
    label: 'Que clientes conviene recuperar',
    helper: 'Casos con chances reales de volver a comprar sin insistir de mas.',
    icon: UsersRound,
  },
  {
    intent: 'stock',
    label: 'Que mercaderia tengo que mirar ya',
    helper: 'Productos que pueden faltar o inmovilizar caja si no se revisan a tiempo.',
    icon: Boxes,
  },
];

const TONE_META = {
  estable: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
  atencion: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
  urgente: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
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

export default function AsistenteNegocio() {
  const [selectedPreset, setSelectedPreset] = useState<AssistantIntent>('overview');
  const [question, setQuestion] = useState('');
  const [data, setData] = useState<AssistantResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMeta = useMemo(
    () => PRESETS.find((item) => item.intent === selectedPreset) || PRESETS[0],
    [selectedPreset]
  );

  async function ask(preset: AssistantIntent, customQuestion?: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await Api.aiExecutiveAssistant({
        preset,
        question: customQuestion?.trim() || '',
      });
      setSelectedPreset(preset);
      setData(response as AssistantResponse);
    } catch (e: any) {
      setError(e?.message || 'No se pudo preparar la respuesta del asistente.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const introText = selectedMeta.helper;

  useEffect(() => {
    ask('overview', '');
  }, []);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),_transparent_28%),linear-gradient(135deg,_rgba(8,15,34,0.98),_rgba(16,24,44,0.94))] p-6 text-slate-100 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <div className="absolute inset-y-0 right-0 hidden w-56 bg-[radial-gradient(circle,_rgba(255,255,255,0.08),_transparent_70%)] md:block" />
        <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.95fr)]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100">
              <MessageSquareText size={14} />
              Asistente del negocio
            </div>
            <div className="space-y-3">
              <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Respuestas claras para decidir sin entrar en detalles tecnicos.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                Hace simple lo importante: que esta pasando, por que importa y que conviene hacer ahora.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {PRESETS.map((preset) => {
                const Icon = preset.icon;
                const active = preset.intent === selectedPreset;
                return (
                  <button
                    key={preset.intent}
                    type="button"
                    onClick={() => setSelectedPreset(preset.intent)}
                    className={[
                      'rounded-2xl border p-4 text-left transition',
                      active
                        ? 'border-cyan-300/40 bg-cyan-400/12 shadow-[0_18px_45px_rgba(56,189,248,0.18)]'
                        : 'border-white/10 bg-white/5 hover:bg-white/8',
                    ].join(' ')}
                  >
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-cyan-100">
                      <Icon size={18} />
                    </div>
                    <div className="text-sm font-medium text-white">{preset.label}</div>
                    <div className="mt-2 text-xs leading-5 text-slate-300">{preset.helper}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-slate-950/35 p-5 backdrop-blur">
            <div className="mb-3 text-sm font-medium text-white">{selectedMeta.label}</div>
            <p className="mb-4 text-sm leading-6 text-slate-300">{introText}</p>
            <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">
              Pregunta opcional
            </label>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={5}
              placeholder="Ejemplo: decime en palabras simples si tengo que preocuparme por la caja esta semana"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/20"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                onClick={() => ask(selectedPreset, question)}
                loading={loading}
                className="min-w-[180px]"
              >
                {loading ? 'Analizando...' : 'Preparar respuesta'}
              </Button>
              <Button
                variant="ghost"
                disabled={loading}
                onClick={() => {
                  setQuestion('');
                  ask(selectedPreset, '');
                }}
                className="min-w-[180px]"
              >
                <RefreshCw size={16} className="mr-2" />
                Usar solo el corte actual
              </Button>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-5 text-slate-300">
              Conviene preguntarle como se lo preguntarias a un socio: simple, directo y con foco en una decision.
            </div>
          </div>
        </div>
      </section>

      {error ? <Alert kind="error" message={error} /> : null}

      {loading ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-6">
            <div className="mb-4 h-4 w-36 animate-pulse rounded bg-white/10" />
            <div className="space-y-3">
              <div className="h-4 w-full animate-pulse rounded bg-white/10" />
              <div className="h-4 w-11/12 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-10/12 animate-pulse rounded bg-white/10" />
            </div>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-6">
            <div className="mb-4 h-4 w-28 animate-pulse rounded bg-white/10" />
            <div className="grid gap-3">
              <div className="h-20 animate-pulse rounded-2xl bg-white/10" />
              <div className="h-20 animate-pulse rounded-2xl bg-white/10" />
            </div>
          </div>
        </section>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <article className="rounded-[28px] border border-white/10 bg-slate-950/40 p-6 text-slate-100 shadow-[0_18px_60px_rgba(2,6,23,0.18)]">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-cyan-100">
                  Respuesta clara
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                  Ultima actualizacion: {formatDateTime(data.generated_at)}
                </span>
                {data.used_llm ? (
                  <span className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                    Redaccion asistida por IA
                  </span>
                ) : null}
              </div>
              <h2 className="mb-3 text-xl font-semibold text-white">{data.question}</h2>
              <div className="space-y-3 text-sm leading-7 text-slate-200">
                {data.answer
                  .split(/\n+/)
                  .filter(Boolean)
                  .map((paragraph, index) => (
                    <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>
                  ))}
              </div>
              {data.range ? (
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
                  Corte analizado: {data.range.desde || '-'} a {data.range.hasta || '-'}
                </div>
              ) : null}
            </article>

            <aside className="rounded-[28px] border border-white/10 bg-slate-950/40 p-6 text-slate-100 shadow-[0_18px_60px_rgba(2,6,23,0.18)]">
              <div className="mb-4 text-sm font-medium text-white">Numeros para ubicarte rapido</div>
              <div className="grid gap-3">
                {data.evidence.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      {item.label}
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">{item.value}</div>
                  </div>
                ))}
              </div>
            </aside>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.cards.map((card, index) => {
              const toneClass =
                TONE_META[card.tone as keyof typeof TONE_META] || TONE_META.atencion;
              return (
                <article
                  key={`${card.title}-${index}`}
                  className="rounded-[24px] border border-white/10 bg-slate-950/40 p-5 text-slate-100 shadow-[0_16px_50px_rgba(2,6,23,0.14)]"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-white">{card.title}</h3>
                    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${toneClass}`}>
                      {card.tone}
                    </span>
                  </div>
                  <div className="space-y-4 text-sm leading-6 text-slate-300">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Que pasa</div>
                      <p className="mt-2 text-slate-100">{card.summary}</p>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Por que importa</div>
                      <p className="mt-2">{card.why_it_matters}</p>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Que conviene hacer</div>
                      <p className="mt-2">{card.next_step}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="rounded-[28px] border border-white/10 bg-slate-950/40 p-6 text-slate-100 shadow-[0_18px_60px_rgba(2,6,23,0.18)]">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white">
              <Brain size={16} />
              Siguientes pasos sugeridos
            </div>
            {data.priority_actions.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {data.priority_actions.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">{item.title}</div>
                        {item.summary ? (
                          <p className="mt-2 text-sm leading-6 text-slate-300">{item.summary}</p>
                        ) : null}
                      </div>
                      {item.needs_approval ? (
                        <span className="rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-amber-100">
                          Requiere aprobacion
                        </span>
                      ) : null}
                    </div>
                    {item.next_step ? (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm text-slate-200">
                        {item.next_step}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-300">
                No aparecieron pasos urgentes nuevos en este corte.
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
