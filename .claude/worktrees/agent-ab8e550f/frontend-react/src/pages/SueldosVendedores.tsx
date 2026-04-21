import { useEffect, useMemo, useState } from 'react';
import ChartCard from '../ui/ChartCard';
import Button from '../ui/Button';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import { Api } from '../lib/api';

type SueldoItem = {
  usuario_id: number;
  nombre: string;
  email?: string;
  activo?: boolean;
  ventas_count: number;
  ventas_total: number;
  comision_porcentaje: number;
  comision_base: string;
  comision_monto: number;
  pagado_total: number;
  saldo: number;
};

type VentaRow = {
  id: number;
  fecha: string;
  total: number;
  neto: number;
  estado_pago: string;
  estado_entrega?: string;
  cliente_nombre?: string;
  cliente_apellido?: string;
};

type PagoRow = {
  id: number;
  fecha_pago: string;
  periodo: string;
  desde: string;
  hasta: string;
  ventas_total: number;
  porcentaje: number;
  monto_calculado: number;
  monto_pagado: number;
  metodo?: string | null;
  notas?: string | null;
};

type ComisionRow = {
  id?: number;
  porcentaje: number;
  base_tipo: string;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
  activo?: boolean;
};

type Periodo = 'dia' | 'semana' | 'mes';

type RankingItem = {
  id: number;
  nombre?: string | null;
  email?: string | null;
  activo?: boolean;
  ventas_count: number;
  ventas_total: number;
  comision_total: number;
  margen_total: number;
};

type RankingResponse = {
  metric: 'cantidad_ventas' | 'margen_venta';
  items: RankingItem[];
};

type ComisionListConfig = {
  mode: 'producto' | 'lista';
  porcentajes: {
    local: number;
    distribuidor: number;
    final: number;
    oferta: number;
  };
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDate(value?: string) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('es-AR');
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('es-AR');
}

function toDateInput(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function rangeFor(periodo: Periodo) {
  const base = new Date();
  if (periodo === 'dia') {
    const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    return { desde: toDateInput(today), hasta: toDateInput(today) };
  }
  if (periodo === 'semana') {
    const dow = base.getDay();
    const daysSinceMonday = (dow + 6) % 7;
    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate() - daysSinceMonday);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 5);
    return { desde: toDateInput(start), hasta: toDateInput(end) };
  }
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { desde: toDateInput(start), hasta: toDateInput(end) };
}

export default function SueldosVendedores() {
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [desde, setDesde] = useState(() => rangeFor('mes').desde);
  const [hasta, setHasta] = useState(() => rangeFor('mes').hasta);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ periodo: Periodo; desde: string; hasta: string; items: SueldoItem[] } | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [comision, setComision] = useState<ComisionRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [ranking, setRanking] = useState<RankingResponse | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const [comisionConfig, setComisionConfig] = useState<ComisionListConfig>({
    mode: 'producto',
    porcentajes: { local: 0, distribuidor: 0, final: 0, oferta: 0 },
  });
  const [comisionConfigLoading, setComisionConfigLoading] = useState(false);
  const [comisionConfigSaving, setComisionConfigSaving] = useState(false);
  const [comisionConfigError, setComisionConfigError] = useState<string | null>(null);
  const [comisionConfigSuccess, setComisionConfigSuccess] = useState<string | null>(null);

  const [comisionForm, setComisionForm] = useState({
    porcentaje: '',
    vigencia_desde: '',
    vigencia_hasta: '',
  });
  const [comisionSaving, setComisionSaving] = useState(false);
  const [comisionMessage, setComisionMessage] = useState<string | null>(null);

  const [pagoForm, setPagoForm] = useState({
    monto_pagado: '',
    metodo: '',
    notas: '',
  });
  const [pagoSaving, setPagoSaving] = useState(false);
  const [pagoMessage, setPagoMessage] = useState<string | null>(null);

  useEffect(() => {
    const r = rangeFor(periodo);
    setDesde(r.desde);
    setHasta(r.hasta);
  }, [periodo]);

  const effectivePeriodo = data?.periodo || periodo;
  const effectiveDesde = data?.desde || desde;
  const effectiveHasta = data?.hasta || hasta;

  const selectedItem = useMemo(() => {
    if (!data?.items || !selectedId) return null;
    return data.items.find((i) => i.usuario_id === selectedId) || null;
  }, [data, selectedId]);

  const rankingMetricLabel =
    ranking?.metric === 'margen_venta' ? 'Margen de venta' : 'Cantidad de ventas';

  async function loadRanking(desdeRange: string, hastaRange: string) {
    setRankingLoading(true);
    setRankingError(null);
    try {
      const res: any = await Api.rankingVendedores({ desde: desdeRange, hasta: hastaRange });
      setRanking({
        metric: res?.metric === 'margen_venta' ? 'margen_venta' : 'cantidad_ventas',
        items: Array.isArray(res?.items) ? (res.items as RankingItem[]) : [],
      });
    } catch (e) {
      setRankingError(e instanceof Error ? e.message : 'No se pudo cargar el ranking');
      setRanking(null);
    } finally {
      setRankingLoading(false);
    }
  }

  async function loadSueldos() {
    setLoading(true);
    setError(null);
    try {
      const res: any = await Api.vendedoresSueldos({ periodo, desde, hasta });
      const desdeRes = res?.desde || desde;
      const hastaRes = res?.hasta || hasta;
      setData({
        periodo: (res?.periodo || periodo) as Periodo,
        desde: desdeRes,
        hasta: hastaRes,
        items: Array.isArray(res?.items) ? (res.items as SueldoItem[]) : [],
      });
      if (selectedId && Array.isArray(res?.items)) {
        const exists = res.items.some((i: SueldoItem) => Number(i.usuario_id) === selectedId);
        if (!exists) setSelectedId(null);
      }
      await loadRanking(desdeRes, hastaRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los sueldos');
      setRanking(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetalle(userId: number) {
    setDetailLoading(true);
    setDetailError(null);
    setComisionMessage(null);
    setPagoMessage(null);
    try {
      const [ventasRes, pagosRes, comisionRes] = await Promise.all([
        Api.vendedorVentas(userId, { periodo: effectivePeriodo, desde: effectiveDesde, hasta: effectiveHasta, limit: 200 }),
        Api.vendedorPagos(userId, { periodo: effectivePeriodo, desde: effectiveDesde, hasta: effectiveHasta, limit: 200 }),
        Api.vendedorComision(userId, effectivePeriodo),
      ]);
      const ventasData = (ventasRes?.ventas || ventasRes || []) as VentaRow[];
      const pagosData = (pagosRes?.pagos || pagosRes || []) as PagoRow[];
      setVentas(Array.isArray(ventasData) ? ventasData : []);
      setPagos(Array.isArray(pagosData) ? pagosData : []);
      const c = (comisionRes || null) as ComisionRow | null;
      setComision(c);
      setComisionForm({
        porcentaje: c?.porcentaje != null ? String(c.porcentaje) : '',
        vigencia_desde: c?.vigencia_desde || '',
        vigencia_hasta: c?.vigencia_hasta || '',
      });
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'No se pudo cargar el detalle');
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadSueldos();
  }, []);

  useEffect(() => {
    (async () => {
      setComisionConfigLoading(true);
      setComisionConfigError(null);
      try {
        const data: any = await Api.getComisionListasConfig();
        setComisionConfig({
          mode: data?.mode === 'lista' ? 'lista' : 'producto',
          porcentajes: {
            local: Number(data?.porcentajes?.local || 0),
            distribuidor: Number(data?.porcentajes?.distribuidor || 0),
            final: Number(data?.porcentajes?.final || 0),
            oferta: Number(data?.porcentajes?.oferta || 0),
          },
        });
      } catch (e) {
        setComisionConfigError(
          e instanceof Error ? e.message : 'No se pudo cargar la configuracion de comisiones'
        );
      } finally {
        setComisionConfigLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadDetalle(selectedId);
    }
  }, [selectedId, data?.periodo, data?.desde, data?.hasta]);

  async function saveComision() {
    if (!selectedId) return;
    const pct = Number(comisionForm.porcentaje);
    if (!Number.isFinite(pct) || pct < 0) {
      setComisionMessage('Porcentaje invalido');
      return;
    }
    setComisionSaving(true);
    setComisionMessage(null);
    try {
      await Api.setVendedorComision(selectedId, {
        periodo: effectivePeriodo,
        porcentaje: pct,
        vigencia_desde: comisionForm.vigencia_desde || undefined,
        vigencia_hasta: comisionForm.vigencia_hasta || undefined,
        base_tipo: 'bruto',
      });
      setComisionMessage('Comision guardada');
      await loadSueldos();
      await loadDetalle(selectedId);
    } catch (e) {
      setComisionMessage(e instanceof Error ? e.message : 'No se pudo guardar la comision');
    } finally {
      setComisionSaving(false);
    }
  }

  async function registrarPago() {
    if (!selectedId) return;
    const monto = Number(pagoForm.monto_pagado);
    if (!Number.isFinite(monto) || monto <= 0) {
      setPagoMessage('Monto invalido');
      return;
    }
    setPagoSaving(true);
    setPagoMessage(null);
    try {
      await Api.crearVendedorPago(selectedId, {
        periodo: effectivePeriodo,
        desde: effectiveDesde,
        hasta: effectiveHasta,
        monto_pagado: monto,
        metodo: pagoForm.metodo || undefined,
        notas: pagoForm.notas || undefined,
      });
      setPagoForm({ monto_pagado: '', metodo: '', notas: '' });
      setPagoMessage('Pago registrado');
      await loadSueldos();
      await loadDetalle(selectedId);
    } catch (e) {
      setPagoMessage(e instanceof Error ? e.message : 'No se pudo registrar el pago');
    } finally {
      setPagoSaving(false);
    }
  }

  async function guardarConfigComisionListas() {
    setComisionConfigSaving(true);
    setComisionConfigError(null);
    setComisionConfigSuccess(null);
    try {
      const payload = {
        mode: comisionConfig.mode,
        porcentajes: {
          local: Number(comisionConfig.porcentajes.local || 0),
          distribuidor: Number(comisionConfig.porcentajes.distribuidor || 0),
          final: Number(comisionConfig.porcentajes.final || 0),
          oferta: Number(comisionConfig.porcentajes.oferta || 0),
        },
      };
      const saved: any = await Api.setComisionListasConfig(payload);
      setComisionConfig({
        mode: saved?.mode === 'lista' ? 'lista' : 'producto',
        porcentajes: {
          local: Number(saved?.porcentajes?.local || 0),
          distribuidor: Number(saved?.porcentajes?.distribuidor || 0),
          final: Number(saved?.porcentajes?.final || 0),
          oferta: Number(saved?.porcentajes?.oferta || 0),
        },
      });
      setComisionConfigSuccess('Configuracion de comisiones guardada');
      await loadSueldos();
      if (selectedId) await loadDetalle(selectedId);
    } catch (e) {
      setComisionConfigError(
        e instanceof Error ? e.message : 'No se pudo guardar la configuracion de comisiones'
      );
    } finally {
      setComisionConfigSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-100">Sueldo a vendedores</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            className="input-modern h-11 text-sm"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as Periodo)}
          >
            <option value="dia">Dia</option>
            <option value="semana">Semana</option>
            <option value="mes">Mes</option>
          </select>
          <input
            type="date"
            className="input-modern h-11 text-sm"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
          <input
            type="date"
            className="input-modern h-11 text-sm"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
          <Button type="button" onClick={loadSueldos} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </Button>
        </div>
      </div>

      {error && <Alert kind="error" message={error} />}

      <ChartCard
        title="Configuracion de comisiones"
        right={comisionConfigLoading ? <Spinner /> : null}
      >
        {comisionConfigError && <Alert kind="error" message={comisionConfigError} />}
        {comisionConfigSuccess && <Alert kind="info" message={comisionConfigSuccess} />}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <label className="text-sm text-slate-200">
            Modo
            <select
              className="input-modern mt-2 w-full"
              value={comisionConfig.mode}
              onChange={(e) =>
                setComisionConfig((prev) => ({
                  ...prev,
                  mode: e.target.value === 'lista' ? 'lista' : 'producto',
                }))
              }
              disabled={comisionConfigLoading || comisionConfigSaving}
            >
              <option value="producto">Por producto</option>
              <option value="lista">Por lista de precios</option>
            </select>
          </label>
          <label className="text-sm text-slate-200">
            Lista local (%)
            <input
              className="input-modern mt-2 w-full"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={comisionConfig.porcentajes.local}
              onChange={(e) =>
                setComisionConfig((prev) => ({
                  ...prev,
                  porcentajes: { ...prev.porcentajes, local: Number(e.target.value || 0) },
                }))
              }
              disabled={comisionConfigLoading || comisionConfigSaving}
            />
          </label>
          <label className="text-sm text-slate-200">
            Lista distribuidor (%)
            <input
              className="input-modern mt-2 w-full"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={comisionConfig.porcentajes.distribuidor}
              onChange={(e) =>
                setComisionConfig((prev) => ({
                  ...prev,
                  porcentajes: { ...prev.porcentajes, distribuidor: Number(e.target.value || 0) },
                }))
              }
              disabled={comisionConfigLoading || comisionConfigSaving}
            />
          </label>
          <label className="text-sm text-slate-200">
            Lista final (%)
            <input
              className="input-modern mt-2 w-full"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={comisionConfig.porcentajes.final}
              onChange={(e) =>
                setComisionConfig((prev) => ({
                  ...prev,
                  porcentajes: { ...prev.porcentajes, final: Number(e.target.value || 0) },
                }))
              }
              disabled={comisionConfigLoading || comisionConfigSaving}
            />
          </label>
          <label className="text-sm text-slate-200">
            Productos en oferta (%)
            <input
              className="input-modern mt-2 w-full"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={comisionConfig.porcentajes.oferta}
              onChange={(e) =>
                setComisionConfig((prev) => ({
                  ...prev,
                  porcentajes: { ...prev.porcentajes, oferta: Number(e.target.value || 0) },
                }))
              }
              disabled={comisionConfigLoading || comisionConfigSaving}
            />
          </label>
        </div>
        <div className="mt-3">
          <Button
            type="button"
            onClick={guardarConfigComisionListas}
            disabled={comisionConfigLoading || comisionConfigSaving}
          >
            {comisionConfigSaving ? 'Guardando...' : 'Guardar configuracion'}
          </Button>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <ChartCard
            title="Ranking de vendedores (ventas entregadas)"
            right={
              rankingLoading ? (
                <Spinner />
              ) : (
                <div className="text-xs text-slate-400">{rankingMetricLabel}</div>
              )
            }
          >
            {rankingError && <Alert kind="error" message={rankingError} />}
            {!rankingLoading && !ranking?.items?.length && (
              <div className="text-sm text-slate-400">Sin datos para el rango seleccionado.</div>
            )}
            {!!ranking?.items?.length && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-slate-200">
                  <thead className="text-xs uppercase text-slate-400">
                    <tr>
                      <th className="text-left py-2">#</th>
                      <th className="text-left py-2">Vendedor</th>
                      <th className="text-left py-2">Ventas</th>
                      <th className="text-left py-2">Bruto</th>
                      <th className="text-left py-2">Comision</th>
                      <th className="text-left py-2">Margen</th>
                      <th className="text-left py-2">{rankingMetricLabel}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {ranking.items.map((row, idx) => {
                      const metricValue =
                        ranking.metric === 'margen_venta'
                          ? formatMoney(Number(row.margen_total || 0))
                          : row.ventas_count;
                      return (
                        <tr key={row.id}>
                          <td className="py-2">{idx + 1}</td>
                          <td className="py-2">
                            <div className="font-medium">{row.nombre || row.email}</div>
                            <div className="text-xs text-slate-400">{row.email}</div>
                          </td>
                          <td className="py-2">{row.ventas_count}</td>
                          <td className="py-2">{formatMoney(Number(row.ventas_total || 0))}</td>
                          <td className="py-2">{formatMoney(Number(row.comision_total || 0))}</td>
                          <td className="py-2">{formatMoney(Number(row.margen_total || 0))}</td>
                          <td className="py-2 font-semibold text-emerald-200">{metricValue}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>

          <ChartCard
            title="Resumen por vendedor"
            right={loading ? <Spinner /> : <div className="text-xs text-slate-400">{effectiveDesde} / {effectiveHasta}</div>}
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-slate-200">
                <thead className="text-xs uppercase text-slate-400">
                  <tr>
                    <th className="text-left py-2">Vendedor</th>
                    <th className="text-left py-2">Ventas</th>
                    <th className="text-left py-2">Bruto</th>
                    <th className="text-left py-2">% Comision</th>
                    <th className="text-left py-2">Comision</th>
                    <th className="text-left py-2">Pagado</th>
                    <th className="text-left py-2">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {(data?.items || []).map((row) => {
                    const active = row.usuario_id === selectedId;
                    return (
                      <tr
                        key={row.usuario_id}
                        className={active ? 'bg-white/5' : 'hover:bg-white/5 cursor-pointer'}
                        onClick={() => setSelectedId(row.usuario_id)}
                      >
                        <td className="py-2">
                          <div className="font-medium">{row.nombre || row.email}</div>
                          <div className="text-xs text-slate-400">{row.email}</div>
                        </td>
                        <td className="py-2">{row.ventas_count}</td>
                        <td className="py-2">{formatMoney(row.ventas_total)}</td>
                        <td className="py-2">{row.comision_porcentaje || 0}%</td>
                        <td className="py-2">{formatMoney(row.comision_monto)}</td>
                        <td className="py-2">{formatMoney(row.pagado_total)}</td>
                        <td className={`py-2 ${row.saldo > 0 ? 'text-amber-200' : 'text-emerald-200'}`}>
                          {formatMoney(row.saldo)}
                        </td>
                      </tr>
                    );
                  })}
                  {!data?.items?.length && (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-slate-400">
                        Sin vendedores en el rango.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard
            title="Ventas del vendedor"
            right={detailLoading ? <Spinner /> : null}
          >
            {!selectedId && (
              <div className="text-sm text-slate-400">Selecciona un vendedor para ver su historial.</div>
            )}
            {selectedId && detailError && <Alert kind="error" message={detailError} />}
            {selectedId && !detailError && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-slate-200">
                  <thead className="text-xs uppercase text-slate-400">
                    <tr>
                      <th className="text-left py-2">Venta</th>
                      <th className="text-left py-2">Fecha</th>
                      <th className="text-left py-2">Cliente</th>
                      <th className="text-left py-2">Bruto</th>
                      <th className="text-left py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {ventas.map((v) => (
                      <tr key={v.id}>
                        <td className="py-2">#{v.id}</td>
                        <td className="py-2">{formatDateTime(v.fecha)}</td>
                        <td className="py-2">{[v.cliente_nombre, v.cliente_apellido].filter(Boolean).join(' ') || '-'}</td>
                        <td className="py-2">{formatMoney(Number(v.total || 0))}</td>
                        <td className="py-2">{v.estado_pago}</td>
                      </tr>
                    ))}
                    {!ventas.length && (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-slate-400">
                          Sin ventas en el rango.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        </div>

        <div className="space-y-6">
          <ChartCard title="Resumen vendedor">
            {!selectedItem && <div className="text-sm text-slate-400">Selecciona un vendedor.</div>}
            {selectedItem && (
              <div className="space-y-2 text-sm text-slate-200">
                <div className="font-semibold">{selectedItem.nombre || selectedItem.email}</div>
                <div className="text-slate-400 text-xs">{selectedItem.email}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-slate-400">Ventas</div>
                  <div className="text-right">{selectedItem.ventas_count}</div>
                  <div className="text-slate-400">Bruto</div>
                  <div className="text-right">{formatMoney(selectedItem.ventas_total)}</div>
                  <div className="text-slate-400">Comision</div>
                  <div className="text-right">{formatMoney(selectedItem.comision_monto)}</div>
                  <div className="text-slate-400">Pagado</div>
                  <div className="text-right">{formatMoney(selectedItem.pagado_total)}</div>
                  <div className="text-slate-400">Saldo</div>
                  <div className="text-right">{formatMoney(selectedItem.saldo)}</div>
                </div>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Comision">
            {!selectedId && <div className="text-sm text-slate-400">Selecciona un vendedor.</div>}
            {selectedId && (
              <div className="space-y-3">
                {comisionMessage && <Alert kind={comisionMessage.includes('guardada') ? 'info' : 'error'} message={comisionMessage} />}
                <div className="text-xs text-slate-400">
                  Periodo: {effectivePeriodo} · Vigencia {formatDate(comision?.vigencia_desde)} - {formatDate(comision?.vigencia_hasta)}
                </div>
                <input
                  type="number"
                  step="0.01"
                  className="input-modern h-11 text-sm"
                  placeholder="Porcentaje"
                  value={comisionForm.porcentaje}
                  onChange={(e) => setComisionForm((prev) => ({ ...prev, porcentaje: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="input-modern h-11 text-sm"
                    value={comisionForm.vigencia_desde}
                    onChange={(e) => setComisionForm((prev) => ({ ...prev, vigencia_desde: e.target.value }))}
                  />
                  <input
                    type="date"
                    className="input-modern h-11 text-sm"
                    value={comisionForm.vigencia_hasta}
                    onChange={(e) => setComisionForm((prev) => ({ ...prev, vigencia_hasta: e.target.value }))}
                  />
                </div>
                <Button type="button" onClick={saveComision} disabled={comisionSaving}>
                  {comisionSaving ? 'Guardando...' : 'Guardar comision'}
                </Button>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Pagos">
            {!selectedId && <div className="text-sm text-slate-400">Selecciona un vendedor.</div>}
            {selectedId && (
              <div className="space-y-3">
                {pagoMessage && <Alert kind={pagoMessage.includes('registrado') ? 'info' : 'error'} message={pagoMessage} />}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.01"
                    className="input-modern h-11 text-sm"
                    placeholder="Monto pagado"
                    value={pagoForm.monto_pagado}
                    onChange={(e) => setPagoForm((prev) => ({ ...prev, monto_pagado: e.target.value }))}
                  />
                  <input
                    type="text"
                    className="input-modern h-11 text-sm"
                    placeholder="Metodo"
                    value={pagoForm.metodo}
                    onChange={(e) => setPagoForm((prev) => ({ ...prev, metodo: e.target.value }))}
                  />
                </div>
                <input
                  type="text"
                  className="input-modern h-11 text-sm"
                  placeholder="Notas"
                  value={pagoForm.notas}
                  onChange={(e) => setPagoForm((prev) => ({ ...prev, notas: e.target.value }))}
                />
                <Button type="button" onClick={registrarPago} disabled={pagoSaving}>
                  {pagoSaving ? 'Registrando...' : 'Registrar pago'}
                </Button>

                <div className="text-xs text-slate-400">Pagos registrados</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs text-slate-200">
                    <thead className="text-[10px] uppercase text-slate-400">
                      <tr>
                        <th className="text-left py-2">Fecha</th>
                        <th className="text-left py-2">Monto</th>
                        <th className="text-left py-2">Rango</th>
                        <th className="text-left py-2">Metodo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {pagos.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2">{formatDateTime(p.fecha_pago)}</td>
                          <td className="py-2">{formatMoney(Number(p.monto_pagado || 0))}</td>
                          <td className="py-2">{formatDate(p.desde)} - {formatDate(p.hasta)}</td>
                          <td className="py-2">{p.metodo || '-'}</td>
                        </tr>
                      ))}
                      {!pagos.length && (
                        <tr>
                          <td colSpan={4} className="py-3 text-center text-slate-400">
                            Sin pagos en el rango.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
