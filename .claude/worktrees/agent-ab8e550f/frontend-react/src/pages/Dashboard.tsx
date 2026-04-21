import { useEffect, useMemo, useState } from 'react';
import { Users, Package, DollarSign, AlertTriangle, Printer } from 'lucide-react';
import { motion } from 'framer-motion';
import MetricCard from '../ui/MetricCard';
import ChartCard from '../ui/ChartCard';
import Skeleton from '../ui/Skeleton';
import { useLicense } from '../context/LicenseContext';
import { hasFeature } from '../lib/features';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Api } from '../lib/api';

type PeriodKey = 'today' | '7d' | '30d' | 'custom';
type ChartKind = 'line' | 'bar' | 'area';

type MovimientoFinanciero = {
  fecha: string;
  totalVentas: number;
  totalGastos: number;
  gananciaNeta: number;
};

type Operacion = {
  fecha: string;
  tipo: string;
  detalle: string;
  monto: number;
};

type InsightSeverity = 'high' | 'medium' | 'low';

type InsightItem = {
  id: string;
  type: string;
  severity: InsightSeverity;
  title: string;
  message: string;
  entity?: { type: string; id: number | string; name: string };
  metrics?: Record<string, any>;
};

type InsightsResponse = {
  generated_at: string;
  summary: { total: number; high: number; medium: number; low: number };
  items: InsightItem[];
};

export default function Dashboard() {
  const { status: licenseStatus } = useLicense();
  const aiEnabled = hasFeature(licenseStatus, 'ai');
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [customDesde, setCustomDesde] = useState<string>('');
  const [customHasta, setCustomHasta] = useState<string>('');
  const [chartType, setChartType] = useState<ChartKind>('line');

  const [movimientos, setMovimientos] = useState<MovimientoFinanciero[]>([]);
  const [movLoading, setMovLoading] = useState<boolean>(true);
  const [movError, setMovError] = useState<string | null>(null);

  const [deudas, setDeudas] = useState<number>(0);
  const [clientesCount, setClientesCount] = useState<number>(0);
  const [stockItems, setStockItems] = useState<number>(0);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState<boolean>(true);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const [ops, setOps] = useState<Operacion[]>([]);
  const [opsLoading, setOpsLoading] = useState<boolean>(true);
  const [opsError, setOpsError] = useState<string | null>(null);

  function toLocalDateString(d: Date) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function computeRange(p: PeriodKey, desde: string, hasta: string): { desde: string; hasta: string } | null {
    const today = new Date();
    const todayStr = toLocalDateString(today);
    if (p === 'today') {
      return { desde: todayStr, hasta: todayStr };
    }
    if (p === '7d') {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      return { desde: toLocalDateString(d), hasta: todayStr };
    }
    if (p === '30d') {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      return { desde: toLocalDateString(d), hasta: todayStr };
    }
    if (!desde || !hasta) return null;
    return { desde, hasta };
  }

  useEffect(() => {
    (async () => {
      try {
        const [d, c, inv, ventas, compras] = await Promise.all([
          Api.deudas(),
          Api.clientes({ estado: 'activo' }),
          Api.inventario(),
          Api.ventas(),
          Api.compras(),
        ]);
        setDeudas(d.reduce((acc: number, r: any) => acc + Number(r.deuda_pendiente || 0), 0));
        setClientesCount(c.length);
        setStockItems(inv.reduce((acc: number, r: any) => acc + Number(r.cantidad_disponible || 0), 0));

        const opsList: Operacion[] = [];
        (ventas || []).filter((v: any) => !v.oculto).forEach((v: any) => {
          opsList.push({
            fecha: v.fecha,
            tipo: 'Venta',
            detalle: v.cliente_nombre ? `Venta a ${v.cliente_nombre}` : `Venta #${v.id}`,
            monto: Number(v.neto ?? v.total ?? 0),
          });
        });
        (compras || []).forEach((cRow: any) => {
          opsList.push({
            fecha: cRow.fecha,
            tipo: 'Compra',
            detalle: cRow.proveedor_nombre ? `Compra a ${cRow.proveedor_nombre}` : `Compra #${cRow.id}`,
            monto: Number(cRow.total_costo ?? 0),
          });
        });
        opsList.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
        setOps(opsList.slice(0, 5));
      } catch (e) {
        setOpsError('No se pudieron cargar mÃ©tricas y operaciones');
      } finally {
        setOpsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!aiEnabled) {
      setInsights(null);
      setInsightsLoading(false);
      setInsightsError('Modulo de IA no habilitado en la licencia.');
      return;
    }
    (async () => {
      setInsightsLoading(true);
      setInsightsError(null);
      try {
        const data = await Api.aiInsights({ days: 14, history: 90, limit: 9 });
        setInsights(data as InsightsResponse);
      } catch (e) {
        setInsightsError('No se pudieron cargar recomendaciones y alertas');
        setInsights(null);
      } finally {
        setInsightsLoading(false);
      }
    })();
  }, [aiEnabled]);

  useEffect(() => {
    (async () => {
      const range = computeRange(period, customDesde, customHasta);
      if (!range) {
        setMovimientos([]);
        return;
      }
      setMovLoading(true);
      setMovError(null);
      try {
        const data = await Api.movimientosFinancieros({ ...range, agregado: 'dia' });
        setMovimientos((data || []).map((r: any) => ({
          fecha: r.fecha,
          totalVentas: Number(r.totalVentas || 0),
          totalGastos: Number(r.totalGastos || 0),
          gananciaNeta: Number(r.gananciaNeta || 0),
        })));
      } catch (e) {
        setMovError('No se pudieron obtener datos');
        setMovimientos([]);
      } finally {
        setMovLoading(false);
      }
    })();
  }, [period, customDesde, customHasta]);

  const chartData = useMemo(
    () =>
      movimientos.map((r) => ({
        label: new Date(r.fecha).toLocaleDateString(undefined, { month: 'short', day: '2-digit' }),
        ventas: r.totalVentas,
        gastos: r.totalGastos,
        neto: r.gananciaNeta,
      })),
    [movimientos]
  );

  const gananciaPeriodo = useMemo(
    () => movimientos.reduce((acc, r) => acc + r.gananciaNeta, 0),
    [movimientos]
  );

  const canPrint =
    !movLoading &&
    !!computeRange(period, customDesde, customHasta);

  const insightSummary = insights?.summary || { total: 0, high: 0, medium: 0, low: 0 };
  const insightItems = insights?.items || [];
  const severityLabels: Record<InsightSeverity, string> = {
    high: 'Alta',
    medium: 'Media',
    low: 'Baja',
  };
  const severityStyles: Record<InsightSeverity, { card: string; badge: string }> = {
    high: {
      card: 'border border-rose-500/30 border-l-[3px] border-l-rose-500/70 bg-rose-500/10 shadow-[0_14px_30px_rgba(244,63,94,0.18)]',
      badge: 'border-rose-500/30 bg-rose-500/20 text-rose-100',
    },
    medium: {
      card: 'border border-amber-500/30 border-l-[3px] border-l-amber-500/70 bg-amber-500/10 shadow-[0_14px_30px_rgba(245,158,11,0.16)]',
      badge: 'border-amber-500/30 bg-amber-500/20 text-amber-100',
    },
    low: {
      card: 'border border-cyan-500/30 border-l-[3px] border-l-cyan-500/70 bg-cyan-500/10 shadow-[0_14px_30px_rgba(34,211,238,0.16)]',
      badge: 'border-cyan-500/30 bg-cyan-500/20 text-cyan-100',
    },
  };
  const typeLabels: Record<string, string> = {
    stockout: 'Stockout',
    stock_low: 'Stock bajo',
    overstock: 'Sobre stock',
    price: 'Precio',
    debt: 'Deuda',
    anomaly: 'AnomalÃ­a',
  };

  async function handlePrint() {
    const range = computeRange(period, customDesde, customHasta);
    if (!range) return;
    try {
      const blob = await Api.descargarInformeGanancias({ ...range, agregado: 'dia' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      // En un futuro se puede mostrar un toast de error
    }
  }

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="app-card p-4 relative overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#ff0080] via-[#00f5ff] to-[#8b5cf6] animate-[sweep_3s_linear_infinite]" />
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">
              Recomendaciones y alertas
            </div>
            <div className="text-sm text-slate-200">
              Radar inteligente de stock, precios y finanzas recientes.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="app-badge border border-rose-500/40 bg-rose-500/15 text-rose-100">
              Altas {insightSummary.high}
            </span>
            <span className="app-badge border border-amber-500/40 bg-amber-500/15 text-amber-100">
              Medias {insightSummary.medium}
            </span>
            <span className="app-badge border border-cyan-500/40 bg-cyan-500/15 text-cyan-100">
              Bajas {insightSummary.low}
            </span>
          </div>
        </div>

        <div className="mt-4">
          {insightsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="app-panel p-3">
                  <Skeleton className="h-3 w-24 mb-2" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          ) : insightsError ? (
            <div className="text-sm text-rose-300">{insightsError}</div>
          ) : !insightItems.length ? (
            <div className="text-sm text-slate-400">Sin recomendaciones por ahora.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {insightItems.map((item) => {
                const palette = severityStyles[item.severity] || severityStyles.low;
                const label = typeLabels[item.type] || 'Alerta';
                const sevLabel = severityLabels[item.severity] || 'Media';
                return (
                  <div key={item.id} className={`rounded-xl border px-3 py-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(0,0,0,0.35)] ${palette.card}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-slate-300">
                          {label}
                        </div>
                        <div className="text-sm font-semibold text-slate-100">
                          {item.title}
                        </div>
                      </div>
                      <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${palette.badge}`}>
                        {sevLabel}
                      </span>
                    </div>
                    <div className="text-xs text-slate-200 mt-1">{item.message}</div>
                    {item.entity?.name && (
                      <div className="text-[11px] text-slate-400 mt-1">
                        {item.entity.name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        initial="hidden"
        animate="show"
        variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }}
      >
        {[
          { t: 'Total clientes', v: clientesCount, i: <Users size={22} />, tone: 'pink' },
          { t: 'Productos en stock', v: stockItems, i: <Package size={22} />, tone: 'purple' },
          { t: 'Ganancia neta (periodo)', v: `$${gananciaPeriodo.toFixed(0)}`, i: <DollarSign size={22} />, tone: 'cyan' },
          { t: 'Deudas pendientes', v: `$${deudas.toFixed(0)}`, i: <AlertTriangle size={22} />, tone: 'green' },
        ].map((m, idx) => (
          <motion.div key={idx} variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
            <MetricCard title={m.t} value={m.v} icon={m.i} tone={m.tone as any} />
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="lg:col-span-2">
          <ChartCard
            title="Ventas, gastos y ganancia neta"
            right={
              <div className="flex items-center gap-2 text-xs">
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as PeriodKey)}
                  className="select-modern text-xs"
                >
                  <option value="today">Hoy</option>
                  <option value="7d">7 dÃ­as</option>
                  <option value="30d">30 dÃ­as</option>
                  <option value="custom">Rango personalizado</option>
                </select>
                {period === 'custom' && (
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={customDesde}
                      onChange={(e) => setCustomDesde(e.target.value)}
                      className="input-modern text-xs"
                    />
                    <span className="text-slate-400">a</span>
                    <input
                      type="date"
                      value={customHasta}
                      onChange={(e) => setCustomHasta(e.target.value)}
                      className="input-modern text-xs"
                    />
                  </div>
                )}
                <select
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value as ChartKind)}
                  className="select-modern text-xs"
                >
                  <option value="line">LÃ­nea</option>
                  <option value="bar">Barras</option>
                  <option value="area">Ãreas</option>
                </select>
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={!canPrint}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs ${
                    canPrint
                      ? 'bg-white/10 border-white/20 hover:bg-white/20 text-slate-100'
                      : 'bg-white/5 border-white/10 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <Printer size={14} />
                  <span>Imprimir</span>
                </button>
              </div>
            }
          >
            <div className="h-64">
              {movLoading ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
              ) : movError ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">{movError}</div>
              ) : !chartData.length ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  No hay registros para el perÃ­odo seleccionado
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <>
                    {chartType === 'line' && (
                      <LineChart data={chartData}>
                        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#334155' }} tickLine={{ stroke: '#334155' }} />
                        <YAxis tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#334155' }} tickLine={{ stroke: '#334155' }} />
                        <Tooltip
                          wrapperStyle={{ outline: 'none' }}
                          contentStyle={{
                            background: 'rgba(2,6,23,0.92)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 8,
                            color: '#e2e8f0',
                          }}
                          cursor={{ stroke: '#334155' }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="ventas" name="Ventas" stroke="#22d3ee" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="gastos" name="Gastos" stroke="#f97316" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="neto" name="Ganancia neta" stroke="#a855f7" strokeWidth={2} dot={false} />
                      </LineChart>
                    )}
                    {chartType === 'bar' && (
                      <BarChart data={chartData}>
                        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#334155' }} tickLine={{ stroke: '#334155' }} />
                        <YAxis tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#334155' }} tickLine={{ stroke: '#334155' }} />
                        <Tooltip
                          wrapperStyle={{ outline: 'none' }}
                          contentStyle={{
                            background: 'rgba(2,6,23,0.92)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 8,
                            color: '#e2e8f0',
                          }}
                          cursor={{ fill: 'rgba(15,23,42,0.6)' }}
                        />
                        <Legend />
                        <Bar dataKey="ventas" name="Ventas" fill="#22d3ee" />
                        <Bar dataKey="gastos" name="Gastos" fill="#f97316" />
                      </BarChart>
                    )}
                    {chartType === 'area' && (
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.1} />
                          </linearGradient>
                          <linearGradient id="gradGastos" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f97316" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#f97316" stopOpacity={0.1} />
                          </linearGradient>
                          <linearGradient id="gradNeto" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a855f7" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity={0.1} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#334155' }} tickLine={{ stroke: '#334155' }} />
                        <YAxis tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#334155' }} tickLine={{ stroke: '#334155' }} />
                        <Tooltip
                          wrapperStyle={{ outline: 'none' }}
                          contentStyle={{
                            background: 'rgba(2,6,23,0.92)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 8,
                            color: '#e2e8f0',
                          }}
                          cursor={{ stroke: '#334155' }}
                        />
                        <Legend />
                        <Area type="monotone" dataKey="ventas" name="Ventas" stroke="#22d3ee" fill="url(#gradVentas)" />
                        <Area type="monotone" dataKey="gastos" name="Gastos" stroke="#f97316" fill="url(#gradGastos)" />
                        <Area type="monotone" dataKey="neto" name="Ganancia neta" stroke="#a855f7" fill="url(#gradNeto)" />
                      </AreaChart>
                    )}
                  </>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="app-card p-4"
        >
          <div className="text-sm font-semibold text-slate-200 mb-3">Radar</div>
          {insightsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="app-panel p-2">
                  <Skeleton className="h-3 w-24 mb-2" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : insightsError ? (
            <div className="text-sm text-rose-300">{insightsError}</div>
          ) : !insightItems.length ? (
            <div className="text-sm text-slate-400">Sin alertas destacadas</div>
          ) : (
            <ul className="space-y-2">
              {insightItems.slice(0, 5).map((item) => {
                const palette = severityStyles[item.severity] || severityStyles.low;
                const sevLabel = severityLabels[item.severity] || 'Media';
                return (
                  <li key={item.id} className={`rounded-lg border px-2 py-2 transition-all duration-300 hover:translate-x-1 ${palette.card}`}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate pr-2 text-slate-100">{item.title}</span>
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] ${palette.badge}`}>
                        {sevLabel}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-200 mt-1 truncate">{item.message}</div>
                    {item.entity?.name && (
                      <div className="text-[11px] text-slate-400 mt-1 truncate">
                        {item.entity.name}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </motion.div>
      </div>

      <div className="app-card p-4">
        <div className="text-sm text-slate-300 mb-3">Ultimas operaciones</div>
        <div className="overflow-x-auto">
          {opsLoading ? (
            <div className="py-6 text-center text-slate-400 text-sm">Cargando...</div>
          ) : opsError ? (
            <div className="py-6 text-center text-slate-400 text-sm">{opsError}</div>
          ) : !ops.length ? (
            <div className="py-6 text-center text-slate-400 text-sm">No hay operaciones recientes</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-400">
                <tr>
                  <th className="py-2">Fecha</th>
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Detalle</th>
                  <th className="py-2">Monto</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {ops.map((r, i) => (
                  <tr key={i} className="border-t border-white/10 hover:bg-white/5">
                    <td className="py-2">{new Date(r.fecha).toLocaleString()}</td>
                    <td className="py-2">{r.tipo}</td>
                    <td className="py-2">{r.detalle}</td>
                    <td className="py-2">${r.monto.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}


