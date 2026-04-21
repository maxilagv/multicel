import { useEffect, useState } from 'react';
import Alert from '../components/Alert';
import Button from '../ui/Button';
import { Api } from '../lib/api';
import type { Periodo, VendorLiquidacion } from '../lib/vendorCommissions';
import {
  buildDateRangeForPeriodo,
  formatMoney,
} from '../lib/vendorCommissions';
import {
  LiquidacionBreakdown,
  LiquidacionSalesTable,
  LiquidacionSummaryCards,
  PaymentsHistoryTable,
  PeriodAdelantosTable,
  PeriodPaymentsTable,
} from '../components/vendor-commissions/CommissionReadSections';

export default function MiCuentaComisiones() {
  const initialRange = buildDateRangeForPeriodo('mes');
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [desde, setDesde] = useState(initialRange.desde);
  const [hasta, setHasta] = useState(initialRange.hasta);
  const [data, setData] = useState<VendorLiquidacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextRange = buildDateRangeForPeriodo(periodo);
    setDesde(nextRange.desde);
    setHasta(nextRange.hasta);
  }, [periodo]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = (await Api.miResumenComisiones({
        periodo,
        desde,
        hasta,
      })) as VendorLiquidacion;
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar tu resumen');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [periodo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-700/60 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-300/70">Mi cuenta</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-50">
              Mis comisiones {data?.vendedor?.nombre ? `- ${data.vendedor.nombre}` : ''}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Acá podés ver cuánto te corresponde cobrar, cómo se calcula tu comisión y qué pagos o adelantos ya están registrados.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-xs text-slate-300">
              Liquidar por
              <select className="input-modern mt-2 w-full" value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
                <option value="dia">Diario</option>
                <option value="semana">Semanal</option>
                <option value="mes">Mensual</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              Desde
              <input className="input-modern mt-2 w-full" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label className="text-xs text-slate-300">
              Hasta
              <input className="input-modern mt-2 w-full" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </label>
            <div className="flex items-end">
              <Button type="button" className="w-full" onClick={load} disabled={loading}>
                {loading ? 'Actualizando...' : 'Actualizar'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {error ? <Alert kind="error" message={error} /> : null}

      {data ? (
        <>
          <LiquidacionSummaryCards liquidacion={data} />
          <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Resumen actual</div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="text-xs text-slate-500">Ventas del período</div>
                <div className="mt-2 text-2xl font-semibold text-slate-100">{formatMoney(data.resumen.ventas_total)}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="text-xs text-slate-500">Comisión calculada</div>
                <div className="mt-2 text-2xl font-semibold text-slate-100">{formatMoney(data.resumen.comision_monto)}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="text-xs text-slate-500">Sueldo fijo</div>
                <div className="mt-2 text-2xl font-semibold text-slate-100">{formatMoney(data.resumen.sueldo_fijo)}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="text-xs text-slate-500">Me corresponde cobrar</div>
                <div className="mt-2 text-2xl font-semibold text-emerald-300">{formatMoney(data.resumen.saldo)}</div>
              </div>
            </div>
          </div>
          <LiquidacionBreakdown liquidacion={data} />
          <div className="grid gap-5 xl:grid-cols-2">
            <PeriodPaymentsTable pagos={data.pagos_periodo || []} />
            <PeriodAdelantosTable adelantos={data.adelantos_periodo || []} />
          </div>
          <LiquidacionSalesTable liquidacion={data} />
          <PaymentsHistoryTable pagos={data.historial_pagos || []} />
        </>
      ) : (
        <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-6 text-sm text-slate-400">
          {loading ? 'Cargando tus comisiones...' : 'No hay información disponible.'}
        </div>
      )}
    </div>
  );
}
