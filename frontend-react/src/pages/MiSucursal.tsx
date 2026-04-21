import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  Building2,
  Clock3,
  CreditCard,
  ReceiptText,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';
import ChartCard from '../ui/ChartCard';
import { useAuth } from '../context/AuthContext';
import { Api } from '../lib/api';
import { getDepositoIdFromToken, getRoleFromToken } from '../lib/auth';

type DashboardData = {
  deposito: {
    id: number;
    nombre: string;
    codigo?: string | null;
    direccion?: string | null;
  };
  resumen: {
    ventas_hoy: number;
    ingresos_hoy: number;
    ticket_promedio: number;
    pendientes_entrega: number;
    reservas_pendientes: number;
    clientes_vinculados: number;
    productos_bajo_stock: number;
  };
  alertas_stock: Array<{
    producto_id: number;
    nombre: string;
    codigo?: string | null;
    cantidad_disponible: number;
    stock_minimo: number;
  }>;
  actividad_reciente: Array<{
    id: number;
    fecha: string;
    neto: number;
    estado_pago: string;
    estado_entrega: string;
    es_reserva: boolean;
    cliente_nombre: string;
  }>;
};

type DepositoOption = {
  id: number;
  nombre: string;
  codigo?: string | null;
  direccion?: string | null;
};

function parsePositiveInt(value: string | null): number | null {
  const id = Number(value || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function MiSucursal() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { accessToken } = useAuth();
  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const tokenDepositoId = useMemo(() => getDepositoIdFromToken(accessToken), [accessToken]);
  const requestedDepositoId = useMemo(
    () => parsePositiveInt(searchParams.get('deposito_id')),
    [searchParams]
  );
  const isGlobalSupervisor = role === 'admin' || role === 'gerente';

  const [data, setData] = useState<DashboardData | null>(null);
  const [depositos, setDepositos] = useState<DepositoOption[]>([]);
  const [selectedDepositoId, setSelectedDepositoId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isGlobalSupervisor) {
      setDepositos([]);
      setSelectedDepositoId(tokenDepositoId);
      return;
    }

    let active = true;
    (async () => {
      try {
        const rows = ((await Api.misDepositos()) as DepositoOption[]).map((row) => ({
          id: Number(row.id),
          nombre: row.nombre,
          codigo: row.codigo ?? null,
          direccion: row.direccion ?? null,
        }));
        if (!active) return;
        setDepositos(rows);
        const requestedExists =
          requestedDepositoId != null &&
          rows.some((row) => Number(row.id) === Number(requestedDepositoId));
        setSelectedDepositoId(requestedExists ? requestedDepositoId : rows[0]?.id ?? null);
      } catch {
        if (!active) return;
        setDepositos([]);
        setSelectedDepositoId(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [isGlobalSupervisor, requestedDepositoId, tokenDepositoId]);

  useEffect(() => {
    if (!isGlobalSupervisor) return;
    if (!depositos.length && selectedDepositoId == null) return;
    if (requestedDepositoId === selectedDepositoId) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (selectedDepositoId) next.set('deposito_id', String(selectedDepositoId));
      else next.delete('deposito_id');
      return next;
    }, { replace: true });
  }, [depositos.length, isGlobalSupervisor, requestedDepositoId, selectedDepositoId, setSearchParams]);

  const effectiveDepositoId = isGlobalSupervisor ? selectedDepositoId : tokenDepositoId;

  useEffect(() => {
    let active = true;
    if (!effectiveDepositoId) {
      setData(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = (await Api.miSucursalDashboard({
          deposito_id: effectiveDepositoId,
        })) as DashboardData;
        if (!active) return;
        setData(response);
      } catch (e: any) {
        if (!active) return;
        setData(null);
        setError(e?.message || 'No se pudo cargar la sucursal');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [effectiveDepositoId]);

  const summaryCards = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: 'Ventas de hoy',
        value: String(data.resumen.ventas_hoy || 0),
        tone: 'from-cyan-500/15 via-cyan-500/5 to-transparent',
        icon: ReceiptText,
      },
      {
        label: 'Ingresos de hoy',
        value: formatMoney(data.resumen.ingresos_hoy || 0),
        tone: 'from-emerald-500/15 via-emerald-500/5 to-transparent',
        icon: CreditCard,
      },
      {
        label: 'Pendientes de entrega',
        value: String(data.resumen.pendientes_entrega || 0),
        tone: 'from-amber-500/15 via-amber-500/5 to-transparent',
        icon: Clock3,
      },
      {
        label: 'Clientes vinculados',
        value: String(data.resumen.clientes_vinculados || 0),
        tone: 'from-fuchsia-500/15 via-fuchsia-500/5 to-transparent',
        icon: UsersRound,
      },
    ];
  }, [data]);

  const quickActions = useMemo(() => {
    if (!effectiveDepositoId) return [];

    if (isGlobalSupervisor) {
      return [
        {
          title: 'Ventas filtradas',
          description: 'Abrir ventas con esta sucursal ya aplicada como contexto.',
          action: () => navigate(`/app/ventas?deposito_id=${effectiveDepositoId}`),
          icon: ReceiptText,
        },
        {
          title: 'Caja rapida',
          description: 'Cobrar con la sucursal elegida ya resuelta en el flujo.',
          action: () => navigate(`/app/caja?deposito_id=${effectiveDepositoId}`),
          icon: CreditCard,
        },
        {
          title: 'Revisar stock',
          description: 'Ver movimientos y alertas solo para esta sucursal.',
          action: () => navigate(`/app/stock?deposito_id=${effectiveDepositoId}`),
          icon: Boxes,
        },
        {
          title: 'Gestionar depositos',
          description: 'Volver a la vista global para transferencias y configuracion.',
          action: () => navigate('/app/multideposito'),
          icon: Building2,
        },
      ];
    }

    return [
      {
        title: 'Nueva venta',
        description: 'Abrir el flujo de cobro o reserva con la sucursal ya elegida.',
        action: () => navigate(`/app/ventas?open=1&deposito_id=${effectiveDepositoId}`),
        icon: ReceiptText,
      },
      {
        title: 'Ver clientes',
        description: 'Trabajar solo con la cartera vinculada a esta sucursal.',
        action: () => navigate('/app/clientes'),
        icon: UsersRound,
      },
      {
        title: 'Revisar stock',
        description: 'Ver movimientos y alertas sin mezclar otras sedes.',
        action: () => navigate(`/app/stock?deposito_id=${effectiveDepositoId}`),
        icon: Boxes,
      },
      {
        title: 'Caja rapida',
        description: 'Cobrar en mostrador con el deposito resuelto por contexto.',
        action: () => navigate(`/app/caja?deposito_id=${effectiveDepositoId}`),
        icon: CreditCard,
      },
    ];
  }, [effectiveDepositoId, isGlobalSupervisor, navigate]);

  if (loading) {
    return <div className="app-card p-4 text-sm text-slate-300">Cargando tablero de sucursal...</div>;
  }

  if (!effectiveDepositoId) {
    return (
      <div className="app-card p-4 text-sm text-slate-300">
        No hay una sucursal disponible para mostrar en este momento.
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-card p-4 text-sm text-rose-200">
        {error || 'No se pudo cargar la sucursal.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(15,23,42,0.78))] p-5 sm:p-6 text-slate-100 shadow-[0_20px_80px_rgba(2,8,23,0.35)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100">
              <Building2 size={14} />
              {isGlobalSupervisor ? 'Vista operativa' : 'Mi sucursal'}
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{data.deposito.nombre}</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                {isGlobalSupervisor
                  ? 'Elegi una sucursal y revisa su operacion con el mismo contexto que despues usan ventas, caja y stock.'
                  : 'Todo lo que ves aca ya esta filtrado por tu sucursal. El objetivo es simple: operar rapido sin cargar con la complejidad del sistema completo.'}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {isGlobalSupervisor ? 'Sucursal observada' : 'Contexto activo'}
            </div>
            {isGlobalSupervisor ? (
              <>
                <select
                  value={selectedDepositoId || ''}
                  onChange={(event) =>
                    setSelectedDepositoId(event.target.value ? Number(event.target.value) : null)
                  }
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
                >
                  {depositos.map((deposito) => (
                    <option key={deposito.id} value={deposito.id}>
                      {deposito.codigo ? `${deposito.nombre} (${deposito.codigo})` : deposito.nombre}
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-slate-400">
                  El tablero y los accesos rapidos siguen esta seleccion.
                </div>
              </>
            ) : (
              <>
                <div className="mt-2 font-medium">
                  {data.deposito.codigo ? `${data.deposito.nombre} (${data.deposito.codigo})` : data.deposito.nombre}
                </div>
                {data.deposito.direccion ? (
                  <div className="mt-1 text-xs text-slate-400">{data.deposito.direccion}</div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br ${card.tone} p-5 shadow-[0_18px_48px_rgba(15,23,42,0.24)]`}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-300">{card.label}</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-2 text-slate-200">
                  <Icon size={18} />
                </div>
              </div>
              <div className="mt-4 text-3xl font-semibold tracking-tight text-white">{card.value}</div>
              {card.label === 'Ingresos de hoy' ? (
                <div className="mt-2 text-xs text-slate-400">
                  Ticket promedio: {formatMoney(data.resumen.ticket_promedio || 0)}
                </div>
              ) : null}
              {card.label === 'Pendientes de entrega' ? (
                <div className="mt-2 text-xs text-slate-400">
                  Reservas pendientes: {data.resumen.reservas_pendientes || 0}
                </div>
              ) : null}
              {card.label === 'Clientes vinculados' ? (
                <div className="mt-2 text-xs text-slate-400">
                  Productos con alerta: {data.resumen.productos_bajo_stock || 0}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ChartCard title="Acciones rapidas">
          <div className="grid gap-3 md:grid-cols-2">
            {quickActions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={item.action}
                  className="group rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-left transition hover:bg-white/[0.06]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-100">
                      <Icon size={18} />
                    </div>
                    <ArrowRight
                      size={16}
                      className="mt-1 text-slate-500 transition group-hover:translate-x-1 group-hover:text-slate-200"
                    />
                  </div>
                  <div className="mt-4 text-base font-semibold text-slate-100">{item.title}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                </button>
              );
            })}
          </div>
        </ChartCard>

        <ChartCard title="Alertas de stock">
          {data.alertas_stock.length ? (
            <div className="space-y-3">
              {data.alertas_stock.map((item) => (
                <div
                  key={item.producto_id}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-amber-400/15 bg-amber-400/5 p-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-100">
                      <TriangleAlert size={16} />
                      <span className="truncate">{item.nombre}</span>
                    </div>
                    <div className="mt-1 text-xs text-amber-50/70">
                      {item.codigo ? `${item.codigo} - ` : ''}
                      Disponible {item.cantidad_disponible} / Minimo {item.stock_minimo}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/app/stock?deposito_id=${effectiveDepositoId}`)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
                  >
                    Ver
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4 text-sm text-emerald-100">
              No hay alertas de stock en este momento.
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Actividad reciente">
        {data.actividad_reciente.length ? (
          <div className="space-y-3">
            {data.actividad_reciente.map((venta) => (
              <div
                key={venta.id}
                className="flex flex-col gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-100">
                    Venta #{venta.id} - {venta.cliente_nombre}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {formatDate(venta.fecha)} - Pago {venta.estado_pago} - Entrega {venta.estado_entrega}
                    {venta.es_reserva ? ' - Reserva' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-100">{formatMoney(venta.neto)}</div>
                    <div className="text-xs text-slate-500">Neto</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/app/ventas?deposito_id=${effectiveDepositoId}`)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
                  >
                    Abrir ventas
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            Todavia no hay actividad registrada para mostrar.
          </div>
        )}
      </ChartCard>
    </div>
  );
}
