import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../components/Alert';
import Button from '../ui/Button';
import { Api } from '../lib/api';
import type { CommissionListRow, Periodo } from '../lib/vendorCommissions';
import {
  buildDateRangeForPeriodo,
  exportPayrollWorkbook,
  formatMoney,
  humanizeMode,
} from '../lib/vendorCommissions';

type SummaryItem = {
  usuario_id: number;
  nombre: string;
  email?: string;
  activo?: boolean;
  periodo_liquidacion?: Periodo;
  comision_tipo: string;
  ventas_count: number;
  ventas_total: number;
  comision_monto: number;
  sueldo_fijo: number;
  adelantos_total: number;
  pagado_total: number;
  total_devengado: number;
  saldo: number;
};

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

export default function SueldosVendedores() {
  const initialRange = buildDateRangeForPeriodo('mes');
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [desde, setDesde] = useState(initialRange.desde);
  const [hasta, setHasta] = useState(initialRange.hasta);
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [globalRows, setGlobalRows] = useState<CommissionListRow[]>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaving, setConfigSaving] = useState(false);

  const periodLabel = useMemo(() => {
    if (periodo === 'dia') return 'día';
    if (periodo === 'semana') return 'semana';
    return 'mes';
  }, [periodo]);

  useEffect(() => {
    const nextRange = buildDateRangeForPeriodo(periodo);
    setDesde(nextRange.desde);
    setHasta(nextRange.hasta);
  }, [periodo]);

  async function loadSummary() {
    setLoading(true);
    setError(null);
    try {
      const res: any = await Api.vendedoresSueldos({ periodo, desde, hasta });
      setItems(Array.isArray(res?.items) ? res.items : []);
      setTotals(res?.totals || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la nómina');
    } finally {
      setLoading(false);
    }
  }

  async function loadGlobalConfig() {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const res: any = await Api.getComisionListasConfig();
      setGlobalRows(Array.isArray(res?.listas) ? res.listas : []);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'No se pudo cargar la configuración global');
    } finally {
      setConfigLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, [periodo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadGlobalConfig();
  }, []);

  async function saveGlobalConfig() {
    setConfigSaving(true);
    setConfigMessage(null);
    setConfigError(null);
    try {
      await Api.setComisionListasConfig({
        listas: globalRows.map((row) => ({
          lista_codigo: row.lista_codigo,
          lista_nombre: row.lista_nombre,
          porcentaje: Number(row.porcentaje || 0),
          activo: row.activo !== false,
        })),
      });
      setConfigMessage('Configuración global guardada. Los cambios aplican a ventas futuras.');
      await loadGlobalConfig();
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'No se pudo guardar la configuración global');
    } finally {
      setConfigSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-700/60 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-300/70">
              Comisiones a vendedores
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-50">Sueldos del período</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Vista global para revisar cuánto corresponde pagar, exportar la planilla y entrar al detalle completo de cada vendedor.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-xs text-slate-300">
              Liquidar por
              <select
                className="input-modern mt-2 w-full"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value as Periodo)}
              >
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
            <div className="flex items-end gap-2">
              <Button type="button" className="w-full" onClick={loadSummary} disabled={loading}>
                {loading ? 'Actualizando...' : 'Actualizar'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {error ? <Alert kind="error" message={error} /> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total ventas" value={formatMoney(Number(totals?.ventas_total || 0))} />
        <StatCard label="Total comisión" value={formatMoney(Number(totals?.comision_monto || 0))} />
        <StatCard label="Total fijo" value={formatMoney(Number(totals?.sueldo_fijo || 0))} />
        <StatCard label="Adelantos" value={formatMoney(Number(totals?.adelantos_total || 0))} />
        <StatCard label="Saldo a pagar" value={formatMoney(Number(totals?.saldo || 0))} hint={`Liquidación por ${periodLabel}`} />
      </section>

      <section className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Configuración global</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">Porcentaje por lista de precios</h2>
            <p className="mt-2 text-sm text-slate-400">
              Estos son los defaults del sistema. Cada vendedor puede usar esta configuración o personalizarla desde su propia ficha.
            </p>
          </div>
          <Button type="button" onClick={saveGlobalConfig} disabled={configLoading || configSaving}>
            {configSaving ? 'Guardando...' : 'Guardar configuración global'}
          </Button>
        </div>

        {configError ? <div className="mt-4"><Alert kind="error" message={configError} /></div> : null}
        {configMessage ? <div className="mt-4"><Alert kind="info" message={configMessage} /></div> : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(globalRows || []).map((row) => (
            <label key={row.lista_codigo} className="rounded-2xl border border-slate-700/60 bg-slate-950/50 p-4 text-sm text-slate-200">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{row.lista_nombre}</div>
              <input
                className="input-modern mt-3 w-full"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={row.porcentaje}
                onChange={(e) =>
                  setGlobalRows((current) =>
                    current.map((item) =>
                      item.lista_codigo === row.lista_codigo
                        ? { ...item, porcentaje: Number(e.target.value || 0) }
                        : item
                    )
                  )
                }
                disabled={configLoading || configSaving}
              />
              <div className="mt-2 text-xs text-slate-500">Si una venta usa esta lista, ese porcentaje se toma como default.</div>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Resumen nómina</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">Todos los vendedores</h2>
            <p className="mt-2 text-sm text-slate-400">
              Entrá al detalle para ver configuración, liquidación transparente, historial de pagos y adelantos.
            </p>
          </div>
          <Button
            type="button"
            onClick={() =>
              exportPayrollWorkbook(items, {
                periodoLabel: periodLabel,
                desde,
                hasta,
              })
            }
            disabled={!items.length}
          >
            Exportar planilla de sueldos
          </Button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-700 text-left text-slate-400">
              <tr>
                <th className="py-2 pr-3">Vendedor</th>
                <th className="py-2 pr-3">Modo</th>
                <th className="py-2 pr-3 text-right">Ventas</th>
                <th className="py-2 pr-3 text-right">Comisión</th>
                <th className="py-2 pr-3 text-right">Fijo</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3 text-right">Saldo</th>
                <th className="py-2 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((item) => (
                <tr key={item.usuario_id}>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-slate-100">{item.nombre}</div>
                    <div className="text-xs text-slate-500">{item.email || 'Sin email'}</div>
                  </td>
                  <td className="py-3 pr-3 text-slate-300">{humanizeMode(item.comision_tipo)}</td>
                  <td className="py-3 pr-3 text-right text-slate-300">{formatMoney(item.ventas_total)}</td>
                  <td className="py-3 pr-3 text-right text-slate-300">{formatMoney(item.comision_monto)}</td>
                  <td className="py-3 pr-3 text-right text-slate-300">{formatMoney(item.sueldo_fijo)}</td>
                  <td className="py-3 pr-3 text-right text-slate-300">{formatMoney(item.total_devengado)}</td>
                  <td className="py-3 pr-3 text-right font-semibold text-emerald-300">{formatMoney(item.saldo)}</td>
                  <td className="py-3 text-right">
                    <Link
                      className="text-cyan-300 hover:text-cyan-200"
                      to={`/app/vendedores/${item.usuario_id}/comisiones?periodo=${periodo}&desde=${desde}&hasta=${hasta}`}
                    >
                      Ver ficha
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!items.length && !loading ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No hay vendedores con liquidación para el rango seleccionado.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
