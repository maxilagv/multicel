import { useMemo } from 'react';
import { BellRing, ExternalLink, Siren, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Api } from '../lib/api';
import { useToast } from '../context/ToastContext';

type OwnerAlertRow = {
  id: number;
  alert_code: string;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  detail?: string;
  action_label?: string;
  action_path?: string;
  status: 'open' | 'dismissed';
  detected_at?: string;
};

function severityClasses(severity?: string) {
  if (severity === 'critical') {
    return {
      badge: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
      accent: 'bg-rose-400',
      label: 'Critica',
    };
  }
  if (severity === 'warn') {
    return {
      badge: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
      accent: 'bg-amber-300',
      label: 'Atencion',
    };
  }
  return {
    badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
    accent: 'bg-emerald-300',
    label: 'Info',
  };
}

export default function OwnerAlertsPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['owner-alerts', 'sidebar', 'open'],
    queryFn: async () => (await Api.ownerAlerts({ status: 'open', limit: 5 })) as OwnerAlertRow[],
    staleTime: 30_000,
  });

  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  async function dismissAlert(id: number) {
    try {
      await Api.ownerDismissAlert(id);
      toast.success('La alerta se marco como revisada.');
      queryClient.invalidateQueries({ queryKey: ['owner-alerts'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la alerta.');
    }
  }

  return (
    <section className="mx-3 mb-3 rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-500">
            <Siren size={14} />
            Radar operativo
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-100">
            Alertas para actuar antes del problema
          </div>
        </div>
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
          <BellRing size={18} />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {isLoading && (
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
            Cargando alertas operativas...
          </div>
        )}

        {isError && !isLoading && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            No pudimos cargar las alertas del sistema.
          </div>
        )}

        {!isLoading && !rows.length && !isError && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Sin alertas abiertas. La operacion esta estable.
          </div>
        )}

        {rows.map((alert) => {
          const severity = severityClasses(alert.severity);
          return (
            <article
              key={alert.id}
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3"
            >
              <div className={`absolute left-0 top-0 h-full w-1 ${severity.accent}`} />
              <div className="pl-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${severity.badge}`}
                    >
                      {severity.label}
                    </div>
                    <div className="mt-2 text-sm font-medium text-slate-100">
                      {alert.title}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Descartar alerta ${alert.title}`}
                    onClick={() => dismissAlert(alert.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
                  >
                    <X size={14} />
                  </button>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {alert.detail || 'Revisa esta alerta desde el panel operativo.'}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>
                    {alert.detected_at
                      ? new Date(alert.detected_at).toLocaleString('es-AR')
                      : 'Detectada recientemente'}
                  </span>
                  <Link
                    to={alert.action_path || '/app/finanzas'}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-slate-200 transition hover:bg-white/10"
                  >
                    {alert.action_label || 'Ver detalle'}
                    <ExternalLink size={12} />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
