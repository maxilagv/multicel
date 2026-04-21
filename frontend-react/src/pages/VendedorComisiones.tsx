import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Alert from '../components/Alert';
import Button from '../ui/Button';
import { Api } from '../lib/api';
import type {
  CommissionListRow,
  CommissionMode,
  Periodo,
  VendorCommissionConfig,
  VendorLiquidacion,
} from '../lib/vendorCommissions';
import {
  buildDateRangeForPeriodo,
  exportVendorLiquidacionWorkbook,
  formatMoney,
  humanizeMode,
  todayIsoDate,
} from '../lib/vendorCommissions';
import {
  LiquidacionBreakdown,
  LiquidacionSalesTable,
  LiquidacionSummaryCards,
  PaymentsHistoryTable,
  PeriodAdelantosTable,
  PeriodPaymentsTable,
} from '../components/vendor-commissions/CommissionReadSections';

type Tab = 'configuracion' | 'liquidacion' | 'historial' | 'adelantos';

type ConfigFormState = {
  sueldo_fijo: number;
  comision_tipo: CommissionMode;
  periodo_liquidacion: Periodo;
  porcentaje_fijo: number;
  base_tipo: 'bruto' | 'neto';
  vigencia_desde: string;
  vigencia_hasta: string;
  useGlobal: boolean;
  listas: CommissionListRow[];
};

const MODE_OPTIONS: Array<{
  value: CommissionMode;
  title: string;
  description: string;
}> = [
  {
    value: 'por_lista',
    title: 'Lista de precios',
    description: 'El porcentaje cambia según la lista usada en cada venta.',
  },
  {
    value: 'por_producto',
    title: 'Producto individual',
    description: 'Cada producto usa su propio porcentaje de comisión.',
  },
  {
    value: 'por_total_venta',
    title: 'Porcentaje fijo sobre total',
    description: 'Aplica un porcentaje simple sobre todo lo vendido en el período.',
  },
];

function emptyConfigForm(): ConfigFormState {
  return {
    sueldo_fijo: 0,
    comision_tipo: 'por_producto',
    periodo_liquidacion: 'mes',
    porcentaje_fijo: 0,
    base_tipo: 'bruto',
    vigencia_desde: todayIsoDate(),
    vigencia_hasta: '',
    useGlobal: true,
    listas: [],
  };
}

function mapConfigToForm(config: VendorCommissionConfig | null): ConfigFormState {
  if (!config) return emptyConfigForm();
  return {
    sueldo_fijo: Number(config.sueldo_fijo || 0),
    comision_tipo: (config.comision_tipo || 'por_producto') as CommissionMode,
    periodo_liquidacion: (config.periodo_liquidacion || 'mes') as Periodo,
    porcentaje_fijo: Number(config.comision_fija?.porcentaje || 0),
    base_tipo: config.comision_fija?.base_tipo === 'neto' ? 'neto' : 'bruto',
    vigencia_desde: config.comision_fija?.vigencia_desde?.slice(0, 10) || todayIsoDate(),
    vigencia_hasta: config.comision_fija?.vigencia_hasta?.slice(0, 10) || '',
    useGlobal: config.comision_listas?.usa_configuracion_global !== false,
    listas: Array.isArray(config.comision_listas?.listas)
      ? config.comision_listas!.listas.map((row) => ({
          lista_codigo: row.lista_codigo,
          lista_nombre: row.lista_nombre,
          porcentaje: Number(row.porcentaje || 0),
          activo: row.activo !== false,
        }))
      : [],
  };
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full px-4 py-2 text-sm transition-colors',
        active
          ? 'bg-cyan-500/20 text-cyan-200'
          : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

export default function VendedorComisiones() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const vendedorId = Number(id || 0);
  const [tab, setTab] = useState<Tab>('configuracion');
  const [config, setConfig] = useState<VendorCommissionConfig | null>(null);
  const [configForm, setConfigForm] = useState<ConfigFormState>(emptyConfigForm());
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [desde, setDesde] = useState(buildDateRangeForPeriodo('mes').desde);
  const [hasta, setHasta] = useState(buildDateRangeForPeriodo('mes').hasta);
  const [filtersReady, setFiltersReady] = useState(false);
  const [liquidacion, setLiquidacion] = useState<VendorLiquidacion | null>(null);
  const [liquidacionLoading, setLiquidacionLoading] = useState(true);
  const [liquidacionError, setLiquidacionError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [paymentForm, setPaymentForm] = useState({ monto_pagado: '', metodo: '', notas: '' });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [advanceForm, setAdvanceForm] = useState({ monto: '', fecha: todayIsoDate(), notas: '' });
  const [advanceSaving, setAdvanceSaving] = useState(false);
  const [advanceMessage, setAdvanceMessage] = useState<string | null>(null);

  const vendedorNombre = config?.vendedor?.nombre || liquidacion?.vendedor?.nombre || `Vendedor #${vendedorId}`;
  const globalListas = useMemo(
    () => (Array.isArray(config?.comision_listas?.global) ? config!.comision_listas!.global : []),
    [config]
  );

  async function loadConfig() {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const response = (await Api.vendedorConfig(vendedorId)) as VendorCommissionConfig;
      setConfig(response);
      setConfigForm(mapConfigToForm(response));

      if (!filtersReady) {
        const nextPeriodo = (searchParams.get('periodo') as Periodo) || response.periodo_liquidacion || 'mes';
        const fallbackRange = buildDateRangeForPeriodo(nextPeriodo);
        setPeriodo(nextPeriodo);
        setDesde(searchParams.get('desde') || fallbackRange.desde);
        setHasta(searchParams.get('hasta') || fallbackRange.hasta);
        setFiltersReady(true);
      }
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'No se pudo cargar la configuración');
    } finally {
      setConfigLoading(false);
    }
  }

  async function loadLiquidacion() {
    if (!filtersReady) return;
    setLiquidacionLoading(true);
    setLiquidacionError(null);
    try {
      const response = (await Api.vendedorLiquidacion(vendedorId, {
        periodo,
        desde,
        hasta,
      })) as VendorLiquidacion;
      setLiquidacion(response);
    } catch (err) {
      setLiquidacionError(err instanceof Error ? err.message : 'No se pudo cargar la liquidación');
    } finally {
      setLiquidacionLoading(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const response: any = await Api.vendedorHistorialPagos(vendedorId);
      setHistory(Array.isArray(response?.pagos) ? response.pagos : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function saveConfig() {
    setConfigSaving(true);
    setConfigMessage(null);
    setConfigError(null);
    try {
      await Api.setVendedorConfig(vendedorId, {
        sueldo_fijo: Number(configForm.sueldo_fijo || 0),
        comision_tipo: configForm.comision_tipo,
        periodo_liquidacion: configForm.periodo_liquidacion,
        comision_fija:
          configForm.comision_tipo === 'por_total_venta'
            ? {
                porcentaje: Number(configForm.porcentaje_fijo || 0),
                base_tipo: configForm.base_tipo,
                vigencia_desde: configForm.vigencia_desde || todayIsoDate(),
                vigencia_hasta: configForm.vigencia_hasta || undefined,
              }
            : undefined,
        comision_listas:
          configForm.comision_tipo === 'por_lista'
            ? {
                useGlobal: configForm.useGlobal,
                listas: configForm.useGlobal
                  ? []
                  : configForm.listas.map((row) => ({
                      lista_codigo: row.lista_codigo,
                      lista_nombre: row.lista_nombre,
                      porcentaje: Number(row.porcentaje || 0),
                      activo: row.activo !== false,
                    })),
              }
            : undefined,
      });
      const nextRange = buildDateRangeForPeriodo(configForm.periodo_liquidacion);
      setPeriodo(configForm.periodo_liquidacion);
      setDesde(nextRange.desde);
      setHasta(nextRange.hasta);
      setConfigMessage('Configuración guardada. Los cambios aplican a ventas futuras.');
      await loadConfig();
      await loadLiquidacion();
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'No se pudo guardar la configuración');
    } finally {
      setConfigSaving(false);
    }
  }

  async function registerPayment() {
    if (!paymentForm.monto_pagado) return;
    setPaymentSaving(true);
    setPaymentMessage(null);
    try {
      await Api.crearVendedorPago(vendedorId, {
        periodo,
        desde,
        hasta,
        monto_pagado: Number(paymentForm.monto_pagado),
        metodo: paymentForm.metodo || undefined,
        notas: paymentForm.notas || undefined,
      });
      setPaymentForm({ monto_pagado: '', metodo: '', notas: '' });
      setPaymentMessage('Pago registrado.');
      await loadLiquidacion();
      await loadHistory();
    } catch (err) {
      setPaymentMessage(err instanceof Error ? err.message : 'No se pudo registrar el pago');
    } finally {
      setPaymentSaving(false);
    }
  }

  async function registerAdvance() {
    if (!advanceForm.monto || !advanceForm.fecha) return;
    setAdvanceSaving(true);
    setAdvanceMessage(null);
    try {
      await Api.crearVendedorAdelanto(vendedorId, {
        monto: Number(advanceForm.monto),
        fecha: advanceForm.fecha,
        notas: advanceForm.notas || undefined,
      });
      setAdvanceForm({ monto: '', fecha: todayIsoDate(), notas: '' });
      setAdvanceMessage('Adelanto registrado.');
      await loadLiquidacion();
    } catch (err) {
      setAdvanceMessage(err instanceof Error ? err.message : 'No se pudo registrar el adelanto');
    } finally {
      setAdvanceSaving(false);
    }
  }

  useEffect(() => {
    if (!Number.isInteger(vendedorId) || vendedorId <= 0) return;
    loadConfig();
    loadHistory();
  }, [vendedorId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadLiquidacion();
  }, [filtersReady, periodo, desde, hasta, vendedorId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!Number.isInteger(vendedorId) || vendedorId <= 0) {
    return <Alert kind="error" message="ID de vendedor inválido." />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-700/60 bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.18),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link to="/app/sueldos-vendedores" className="text-sm text-cyan-300 hover:text-cyan-200">
              ← Volver al resumen global
            </Link>
            <div className="mt-4 text-[11px] uppercase tracking-[0.24em] text-cyan-300/70">Ficha por vendedor</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-50">{vendedorNombre}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Configuración, liquidación, historial de pagos y adelantos del vendedor en una única vista.
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
              <Button type="button" className="w-full" onClick={loadLiquidacion} disabled={liquidacionLoading}>
                {liquidacionLoading ? 'Actualizando...' : 'Actualizar'}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <TabButton active={tab === 'configuracion'} label="Configuración" onClick={() => setTab('configuracion')} />
          <TabButton active={tab === 'liquidacion'} label="Liquidación" onClick={() => setTab('liquidacion')} />
          <TabButton active={tab === 'historial'} label="Historial de pagos" onClick={() => setTab('historial')} />
          <TabButton active={tab === 'adelantos'} label="Adelantos" onClick={() => setTab('adelantos')} />
        </div>
      </section>

      {configError ? <Alert kind="error" message={configError} /> : null}
      {liquidacionError ? <Alert kind="error" message={liquidacionError} /> : null}

      {tab === 'configuracion' && (
        <section className="space-y-5">
          {configMessage ? <Alert kind="info" message={configMessage} /> : null}
          <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Datos generales</div>
                  <h2 className="mt-1 text-xl font-semibold text-slate-100">Cómo cobra este vendedor</h2>
                </div>
                <label className="block text-sm text-slate-300">
                  Sueldo fijo
                  <input
                    className="input-modern mt-2 w-full"
                    type="number"
                    min="0"
                    step="0.01"
                    value={configForm.sueldo_fijo}
                    onChange={(e) =>
                      setConfigForm((current) => ({ ...current, sueldo_fijo: Number(e.target.value || 0) }))
                    }
                  />
                </label>
                <div>
                  <div className="mb-2 text-sm text-slate-300">Liquidar por</div>
                  <div className="grid gap-2 md:grid-cols-3">
                    {(['dia', 'semana', 'mes'] as Periodo[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setConfigForm((current) => ({ ...current, periodo_liquidacion: option }))}
                        className={[
                          'rounded-2xl border px-4 py-3 text-sm transition-colors',
                          configForm.periodo_liquidacion === option
                            ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200'
                            : 'border-slate-700 bg-slate-950/40 text-slate-400 hover:text-slate-200',
                        ].join(' ')}
                      >
                        {option === 'dia' ? 'Diario' : option === 'semana' ? 'Semanal' : 'Mensual'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-cyan-500/20 bg-cyan-500/8 p-5 text-sm text-slate-300">
                <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/70">Regla de guardado</div>
                <div className="mt-3 space-y-3">
                  <p>Los cambios de configuración aplican a ventas futuras. Las líneas ya calculadas conservan el modo y porcentaje con el que fueron grabadas.</p>
                  <p>Si este vendedor usa configuración global por lista, cualquier cambio en la grilla global impacta en ventas nuevas mientras siga activa esa opción.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setConfigForm((current) => ({
                    ...current,
                    comision_tipo: option.value,
                    listas:
                      option.value === 'por_lista' && current.listas.length === 0
                        ? (config?.comision_listas?.listas || []).map((row) => ({
                            lista_codigo: row.lista_codigo,
                            lista_nombre: row.lista_nombre,
                            porcentaje: Number(row.porcentaje || 0),
                            activo: row.activo !== false,
                          }))
                        : current.listas,
                  }))
                }
                className={[
                  'rounded-3xl border p-5 text-left transition-colors',
                  configForm.comision_tipo === option.value
                    ? 'border-cyan-500 bg-cyan-500/12'
                    : 'border-slate-700/60 bg-slate-900/60 hover:border-slate-500',
                ].join(' ')}
              >
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{option.title}</div>
                <div className="mt-2 text-lg font-semibold text-slate-100">{humanizeMode(option.value)}</div>
                <p className="mt-2 text-sm text-slate-400">{option.description}</p>
              </button>
            ))}
          </div>

          {configForm.comision_tipo === 'por_lista' && (
            <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Lista de precios</div>
                  <h3 className="mt-1 text-lg font-semibold text-slate-100">Porcentaje por lista</h3>
                </div>
                <Link to="/app/sueldos-vendedores" className="text-sm text-cyan-300 hover:text-cyan-200">
                  Editar configuración global
                </Link>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setConfigForm((current) => ({ ...current, useGlobal: true }))}
                  className={[
                    'rounded-2xl border px-4 py-3 text-left',
                    configForm.useGlobal
                      ? 'border-cyan-500 bg-cyan-500/12 text-cyan-100'
                      : 'border-slate-700 text-slate-400',
                  ].join(' ')}
                >
                  Usar configuración global
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setConfigForm((current) => ({
                      ...current,
                      useGlobal: false,
                      listas: current.listas.length
                        ? current.listas
                        : (config?.comision_listas?.listas || []).map((row) => ({
                            lista_codigo: row.lista_codigo,
                            lista_nombre: row.lista_nombre,
                            porcentaje: Number(row.porcentaje || 0),
                            activo: row.activo !== false,
                          })),
                    }))
                  }
                  className={[
                    'rounded-2xl border px-4 py-3 text-left',
                    !configForm.useGlobal
                      ? 'border-cyan-500 bg-cyan-500/12 text-cyan-100'
                      : 'border-slate-700 text-slate-400',
                  ].join(' ')}
                >
                  Personalizar para este vendedor
                </button>
              </div>

              {configForm.useGlobal ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {globalListas.map((row) => (
                    <div key={row.lista_codigo} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{row.lista_nombre}</div>
                      <div className="mt-3 text-2xl font-semibold text-slate-100">{row.porcentaje}%</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {configForm.listas.map((row) => (
                    <label key={row.lista_codigo} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-200">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{row.lista_nombre}</div>
                      <input
                        className="input-modern mt-3 w-full"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={row.porcentaje}
                        onChange={(e) =>
                          setConfigForm((current) => ({
                            ...current,
                            listas: current.listas.map((item) =>
                              item.lista_codigo === row.lista_codigo
                                ? { ...item, porcentaje: Number(e.target.value || 0) }
                                : item
                            ),
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {configForm.comision_tipo === 'por_producto' && (
            <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Modo producto</div>
              <h3 className="mt-1 text-lg font-semibold text-slate-100">La comisión sale del porcentaje de cada producto</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-xs text-slate-500">Productos activos</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-100">{config?.productos?.total || 0}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-xs text-slate-500">Con comisión</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-100">{config?.productos?.con_comision || 0}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-xs text-slate-500">Sin comisión</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-100">{config?.productos?.sin_comision || 0}</div>
                </div>
              </div>
              <Link to="/app/productos" className="mt-4 inline-flex text-sm text-cyan-300 hover:text-cyan-200">
                Ver productos y editar porcentajes
              </Link>
            </div>
          )}

          {configForm.comision_tipo === 'por_total_venta' && (
            <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Modo porcentaje fijo</div>
              <h3 className="mt-1 text-lg font-semibold text-slate-100">Porcentaje fijo sobre el total del período</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-sm text-slate-300">
                  Porcentaje
                  <input
                    className="input-modern mt-2 w-full"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={configForm.porcentaje_fijo}
                    onChange={(e) =>
                      setConfigForm((current) => ({ ...current, porcentaje_fijo: Number(e.target.value || 0) }))
                    }
                  />
                </label>
                <label className="text-sm text-slate-300">
                  Base
                  <select
                    className="input-modern mt-2 w-full"
                    value={configForm.base_tipo}
                    onChange={(e) =>
                      setConfigForm((current) => ({
                        ...current,
                        base_tipo: e.target.value === 'neto' ? 'neto' : 'bruto',
                      }))
                    }
                  >
                    <option value="bruto">Sobre precio de venta (bruto)</option>
                    <option value="neto">Sobre precio sin IVA (neto)</option>
                  </select>
                </label>
                <label className="text-sm text-slate-300">
                  Vigencia desde
                  <input
                    className="input-modern mt-2 w-full"
                    type="date"
                    value={configForm.vigencia_desde}
                    onChange={(e) => setConfigForm((current) => ({ ...current, vigencia_desde: e.target.value }))}
                  />
                </label>
                <label className="text-sm text-slate-300">
                  Vigencia hasta
                  <input
                    className="input-modern mt-2 w-full"
                    type="date"
                    value={configForm.vigencia_hasta}
                    onChange={(e) => setConfigForm((current) => ({ ...current, vigencia_hasta: e.target.value }))}
                  />
                </label>
              </div>
              <div className="mt-3 text-sm text-slate-400">
                Ejemplo: si vende {formatMoney(100000)} y el porcentaje es {configForm.porcentaje_fijo}%, la comisión será{' '}
                {formatMoney((100000 * Number(configForm.porcentaje_fijo || 0)) / 100)}.
              </div>
            </div>
          )}

          <div>
            <Button type="button" onClick={saveConfig} disabled={configLoading || configSaving}>
              {configSaving ? 'Guardando...' : 'Guardar configuración'}
            </Button>
          </div>
        </section>
      )}

      {tab === 'liquidacion' && (
        <section className="space-y-5">
          {liquidacion ? (
            <>
              <LiquidacionSummaryCards liquidacion={liquidacion} />
              <div className="grid gap-5 xl:grid-cols-[1.7fr_0.9fr]">
                <LiquidacionBreakdown liquidacion={liquidacion} />
                <div className="space-y-5">
                  <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Resumen de pago</div>
                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Sueldo fijo</span>
                        <span>{formatMoney(liquidacion.resumen.sueldo_fijo)}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Comisión</span>
                        <span>{formatMoney(liquidacion.resumen.comision_monto)}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Adelantos</span>
                        <span>-{formatMoney(liquidacion.resumen.adelantos_total)}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Pagos registrados</span>
                        <span>-{formatMoney(liquidacion.resumen.pagado_total)}</span>
                      </div>
                      <div className="border-t border-slate-800 pt-3 text-base font-semibold text-slate-100">
                        <div className="flex items-center justify-between">
                          <span>Saldo a pagar</span>
                          <span>{formatMoney(liquidacion.resumen.saldo)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button type="button" onClick={() => exportVendorLiquidacionWorkbook(liquidacion)}>
                        Exportar a Excel
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Registrar pago</div>
                    <div className="mt-4 space-y-3">
                      {paymentMessage ? (
                        <Alert kind={paymentMessage === 'Pago registrado.' ? 'info' : 'error'} message={paymentMessage} />
                      ) : null}
                      <input
                        className="input-modern w-full"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Monto pagado"
                        value={paymentForm.monto_pagado}
                        onChange={(e) => setPaymentForm((current) => ({ ...current, monto_pagado: e.target.value }))}
                      />
                      <input
                        className="input-modern w-full"
                        type="text"
                        placeholder="Método"
                        value={paymentForm.metodo}
                        onChange={(e) => setPaymentForm((current) => ({ ...current, metodo: e.target.value }))}
                      />
                      <textarea
                        className="input-modern min-h-[100px] w-full"
                        placeholder="Notas"
                        value={paymentForm.notas}
                        onChange={(e) => setPaymentForm((current) => ({ ...current, notas: e.target.value }))}
                      />
                      <Button type="button" onClick={registerPayment} disabled={paymentSaving}>
                        {paymentSaving ? 'Registrando...' : 'Registrar pago'}
                      </Button>
                    </div>
                  </div>

                  <PeriodPaymentsTable pagos={liquidacion.pagos_periodo || []} />
                </div>
              </div>
              <LiquidacionSalesTable liquidacion={liquidacion} productsLink="/app/productos" />
            </>
          ) : (
            <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-6 text-sm text-slate-400">
              {liquidacionLoading ? 'Cargando liquidación...' : 'No hay liquidación disponible.'}
            </div>
          )}
        </section>
      )}

      {tab === 'historial' && (
        <section>
          {historyLoading ? (
            <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-6 text-sm text-slate-400">
              Cargando historial...
            </div>
          ) : (
            <PaymentsHistoryTable pagos={history} />
          )}
        </section>
      )}

      {tab === 'adelantos' && (
        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Registrar adelanto</div>
            <div className="mt-4 space-y-3">
              {advanceMessage ? (
                <Alert kind={advanceMessage === 'Adelanto registrado.' ? 'info' : 'error'} message={advanceMessage} />
              ) : null}
              <input
                className="input-modern w-full"
                type="number"
                min="0"
                step="0.01"
                placeholder="Monto"
                value={advanceForm.monto}
                onChange={(e) => setAdvanceForm((current) => ({ ...current, monto: e.target.value }))}
              />
              <input
                className="input-modern w-full"
                type="date"
                value={advanceForm.fecha}
                onChange={(e) => setAdvanceForm((current) => ({ ...current, fecha: e.target.value }))}
              />
              <textarea
                className="input-modern min-h-[100px] w-full"
                placeholder="Notas"
                value={advanceForm.notas}
                onChange={(e) => setAdvanceForm((current) => ({ ...current, notas: e.target.value }))}
              />
              <Button type="button" onClick={registerAdvance} disabled={advanceSaving}>
                {advanceSaving ? 'Registrando...' : 'Registrar adelanto'}
              </Button>
            </div>
          </div>

          <PeriodAdelantosTable adelantos={liquidacion?.adelantos_periodo || []} />
        </section>
      )}
    </div>
  );
}
