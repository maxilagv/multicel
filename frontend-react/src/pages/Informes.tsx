import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Api } from '../lib/api';
import ChartCard from '../ui/ChartCard';
import DataTable from '../ui/DataTable';
import Button from '../ui/Button';
import Alert from '../components/Alert';
import Skeleton from '../ui/Skeleton';
import { useAuth } from '../context/AuthContext';
import { getRoleFromToken } from '../lib/auth';
import { useLicense } from '../context/LicenseContext';
import { hasFeature } from '../lib/features';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { trackMobileEvent } from '../lib/mobileTelemetry';

type PeriodKey = '7d' | '30d' | '90d' | 'custom';
type AggKey = 'dia' | 'mes';

type Movimiento = {
  fecha: string;
  totalVentas: number;
  totalGastos: number;
  gananciaNeta: number;
};

type GananciaMensual = {
  mes: string;
  total_ventas: number;
  total_gastos: number;
  ganancia_neta: number;
};

type StockBajoRow = {
  producto_id: number;
  codigo: string;
  nombre: string;
  cantidad_disponible: number;
  stock_minimo: number;
};

type TopClienteRow = {
  cliente_id: number;
  nombre: string;
  apellido?: string | null;
  total_comprado: number;
};

type DeudaRow = {
  cliente_id: number;
  deuda_pendiente: number;
  deuda_0_30: number;
  deuda_31_60: number;
  deuda_61_90: number;
  deuda_mas_90: number;
  dias_promedio_atraso: number | null;
};

type TopProductoClienteRow = {
  producto_id: number;
  producto_nombre: string;
  total_cantidad: number;
  total_monto: number;
};

type Zona = {
  id: number;
  nombre: string;
  color_hex?: string | null;
  activo?: boolean;
};

type MovDiaProducto = {
  producto_id: number;
  producto_nombre: string;
  total_base: number;
  total_cantidad: number;
  comision_total: number;
  margen_total: number;
};

type MovDiaResponse = {
  fecha?: string | null;
  desde?: string;
  hasta?: string;
  total: number;
  items: MovDiaProducto[];
};

type CsvColumn<T> = { key: keyof T; label: string };

type ResumenSection = {
  title: string;
  lines: string[];
};

type ResumenMovimientos = {
  generated_at: string;
  range: { desde: string; hasta: string; dias: number };
  totals: {
    ventas: number;
    compras: number;
    pagos_clientes: number;
    gastos: number;
    pagos_proveedores: number;
  };
  sections: ResumenSection[];
};

type MovimientoDetalle = {
  tipo: string;
  fecha: string;
  monto: number;
  descripcion?: string | null;
};

type ExecutiveReportData = {
  generated_at: string;
  range: { desde: string; hasta: string; dias: number };
  kpis: {
    ventas: { total: number; count: number; avg_ticket: number };
    compras: { total: number; count: number };
    gastos: { total: number; count: number };
    pagos_clientes: { total: number; count: number };
    pagos_proveedores: { total: number; count: number };
    deudas_iniciales_pagos: { total: number };
    ganancia_neta: { total: number };
    cobranza_ratio: number | null;
    cashflow: { cash_in: number; cash_out: number; neto: number };
  };
  trends: { ventas_pct: number | null; gastos_pct: number | null; ganancia_pct: number | null };
  top: {
    clientes: { id: number; nombre: string; total: number }[];
    productos: { id: number; nombre: string; unidades: number; monto: number }[];
  };
  riesgos: {
    stock_bajo: { producto_id: number; nombre: string; disponible: number; stock_minimo: number }[];
    deudas: { cliente_id: number; nombre: string; deuda_pendiente: number; deuda_mas_90: number; dias_promedio_atraso: number | null }[];
    alertas: any[];
    alertas_resumen: { total: number; high: number; medium: number; low: number } | null;
  };
};

const PIE_COLORS = [
  '#22d3ee',
  '#34d399',
  '#f59e0b',
  '#f97316',
  '#a855f7',
  '#60a5fa',
  '#f472b6',
  '#eab308',
  '#38bdf8',
  '#fb7185',
];

function toLocalDateString(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function computeRange(period: PeriodKey, desde: string, hasta: string) {
  const now = new Date();
  const todayStr = toLocalDateString(now);
  if (period === '7d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { desde: toLocalDateString(d), hasta: todayStr };
  }
  if (period === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return { desde: toLocalDateString(d), hasta: todayStr };
  }
  if (period === '90d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 89);
    return { desde: toLocalDateString(d), hasta: todayStr };
  }
  if (!desde || !hasta) return null;
  return { desde, hasta };
}

function csvEscape(value: any) {
  if (value == null) return '';
  const str = String(value);
  const safe = str.replace(/"/g, '""');
  if (safe.includes(',') || safe.includes('\n')) {
    return `"${safe}"`;
  }
  return safe;
}

function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]) {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const body = rows
    .map((row) => columns.map((c) => csvEscape((row as any)[c.key])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const csv = buildCsv(rows, columns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function Informes() {
  const { accessToken } = useAuth();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const { status: licenseStatus } = useLicense();
  const aiEnabled = hasFeature(licenseStatus, 'ai');
  const isAdmin = useMemo(() => getRoleFromToken(accessToken) === 'admin', [accessToken]);
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');
  const [agg, setAgg] = useState<AggKey>('dia');
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [zonaId, setZonaId] = useState<number | ''>('');
  const [zonasError, setZonasError] = useState<string | null>(null);

  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [movLoading, setMovLoading] = useState(true);
  const [movError, setMovError] = useState<string | null>(null);

  const [gananciasMensuales, setGananciasMensuales] = useState<GananciaMensual[]>([]);
  const [gananciasError, setGananciasError] = useState<string | null>(null);

  const [stockBajo, setStockBajo] = useState<StockBajoRow[]>([]);
  const [stockError, setStockError] = useState<string | null>(null);

  const [topClientes, setTopClientes] = useState<TopClienteRow[]>([]);
  const [topError, setTopError] = useState<string | null>(null);

  const [deudas, setDeudas] = useState<DeudaRow[]>([]);
  const [deudasError, setDeudasError] = useState<string | null>(null);

  const [selectedClienteId, setSelectedClienteId] = useState<number | null>(null);
  const [topProductosCliente, setTopProductosCliente] = useState<TopProductoClienteRow[]>([]);
  const [topProdError, setTopProdError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewResumen, setPreviewResumen] = useState<ResumenMovimientos | null>(null);
  const [previewMovimientos, setPreviewMovimientos] = useState<MovimientoDetalle[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);

  const [aiHistory, setAiHistory] = useState(90);
  const [aiForecast, setAiForecast] = useState(14);
  const [aiLimit, setAiLimit] = useState(10);
  const [aiTop, setAiTop] = useState(5);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiData, setAiData] = useState<ExecutiveReportData | null>(null);
  const [aiShowData, setAiShowData] = useState(true);
  const [movDia, setMovDia] = useState<MovDiaResponse | null>(null);
  const [movDiaLoading, setMovDiaLoading] = useState(false);
  const [movDiaError, setMovDiaError] = useState<string | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);

  const range = useMemo(() => computeRange(period, customDesde, customHasta), [period, customDesde, customHasta]);
  const zonaSeleccionada = useMemo(
    () => (zonaId ? zonas.find((z) => Number(z.id) === zonaId) || null : null),
    [zonaId, zonas]
  );
  const zonaLabel = zonaSeleccionada?.nombre || 'Todas las zonas';
  const rangeLabel = useMemo(() => {
    if (!range) return '-';
    if (range.desde === range.hasta) return range.desde;
    return `${range.desde} a ${range.hasta}`;
  }, [range]);

  useEffect(() => {
    setAiSummary(null);
    setAiData(null);
    setAiError(null);
  }, [range?.desde, range?.hasta]);

  useEffect(() => {
    (async () => {
      setZonasError(null);
      try {
        const rows = await Api.zonas();
        setZonas(Array.isArray(rows) ? (rows as Zona[]) : []);
      } catch (e: any) {
        setZonasError(e?.message || 'No se pudieron cargar las zonas');
        setZonas([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!range) return;
    (async () => {
      setMovLoading(true);
      setMovError(null);
      try {
        const data = await Api.movimientosFinancieros({ ...range, agregado: agg });
        setMovimientos(
          (data || []).map((r: any) => ({
            fecha: r.fecha,
            totalVentas: Number(r.totalVentas || 0),
            totalGastos: Number(r.totalGastos || 0),
            gananciaNeta: Number(r.gananciaNeta || 0),
          }))
        );
      } catch (e: any) {
        setMovError(e?.message || 'No se pudieron cargar movimientos');
        setMovimientos([]);
      } finally {
        setMovLoading(false);
      }
    })();
  }, [range?.desde, range?.hasta, agg]);

  useEffect(() => {
    (async () => {
      setGananciasError(null);
      try {
        const rows = await Api.gananciasMensuales();
        setGananciasMensuales(
          (rows || []).map((r: any) => ({
            mes: r.mes,
            total_ventas: Number(r.total_ventas || 0),
            total_gastos: Number(r.total_gastos || 0),
            ganancia_neta: Number(r.ganancia_neta || 0),
          }))
        );
      } catch (e: any) {
        setGananciasError(e?.message || 'No se pudieron cargar ganancias mensuales');
        setGananciasMensuales([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setStockError(null);
      setTopError(null);
      setDeudasError(null);
      const results = await Promise.allSettled([
        Api.stockBajo(),
        Api.topClientes(20),
        Api.deudas(),
      ]);

      if (results[0].status === 'fulfilled') {
        setStockBajo(results[0].value || []);
      } else {
        setStockBajo([]);
        setStockError(results[0].reason?.message || 'No se pudo cargar stock bajo');
      }

      if (results[1].status === 'fulfilled') {
        setTopClientes(results[1].value || []);
      } else {
        setTopClientes([]);
        setTopError(results[1].reason?.message || 'No se pudo cargar top clientes');
      }

      if (results[2].status === 'fulfilled') {
        setDeudas(results[2].value || []);
      } else {
        setDeudas([]);
        setDeudasError(results[2].reason?.message || 'No se pudo cargar deudas');
      }
    })();
  }, []);

  useEffect(() => {
    if (!topClientes.length) return;
    if (selectedClienteId != null) return;
    setSelectedClienteId(topClientes[0].cliente_id);
  }, [topClientes, selectedClienteId]);

  useEffect(() => {
    if (!selectedClienteId) {
      setTopProductosCliente([]);
      return;
    }
    (async () => {
      setTopProdError(null);
      try {
        const rows = await Api.topProductosCliente(selectedClienteId, 10);
        setTopProductosCliente(rows || []);
      } catch (e: any) {
        setTopProdError(e?.message || 'No se pudieron cargar productos del cliente');
        setTopProductosCliente([]);
      }
    })();
  }, [selectedClienteId]);

  async function loadMovimientosDia() {
    setMovDiaLoading(true);
    setMovDiaError(null);
    try {
      if (!range) {
        setMovDia(null);
        return;
      }
      const res: any = await Api.movimientosDiaProductos({
        desde: range.desde,
        hasta: range.hasta,
        zona_id: Number.isFinite(zonaId as number) ? (zonaId as number) : undefined,
      });
      const items = Array.isArray(res?.items)
        ? res.items.map((r: any) => ({
            producto_id: Number(r.producto_id),
            producto_nombre: r.producto_nombre,
            total_base: Number(r.total_base || 0),
            total_cantidad: Number(r.total_cantidad || 0),
            comision_total: Number(r.comision_total || 0),
            margen_total: Number(r.margen_total || 0),
          }))
        : [];
      setMovDia({
        fecha: res?.fecha || null,
        desde: res?.desde || range.desde,
        hasta: res?.hasta || range.hasta,
        total: Number(res?.total || 0),
        items,
      });
    } catch (e: any) {
      setMovDiaError(e?.message || 'No se pudieron cargar los movimientos del periodo');
      setMovDia(null);
    } finally {
      setMovDiaLoading(false);
    }
  }

  useEffect(() => {
    loadMovimientosDia();
  }, [range?.desde, range?.hasta, zonaId]);

  const totals = useMemo(() => {
    return movimientos.reduce(
      (acc, r) => {
        acc.ventas += r.totalVentas;
        acc.gastos += r.totalGastos;
        acc.neto += r.gananciaNeta;
        return acc;
      },
      { ventas: 0, gastos: 0, neto: 0 }
    );
  }, [movimientos]);

  const movDiaPie = useMemo(() => {
    if (!movDia?.items?.length) return [];
    return movDia.items
      .filter((i) => Number(i.total_base) > 0)
      .sort((a, b) => Number(b.total_base) - Number(a.total_base))
      .map((i) => ({
        name: i.producto_nombre || 'Producto',
        value: Number(i.total_base || 0),
        cantidad: i.total_cantidad,
        comision: i.comision_total,
        margen: i.margen_total,
      }));
  }, [movDia]);

  const movDiaTotal = Number(movDia?.total || 0);

  const chartMovimientos = useMemo(
    () =>
      movimientos.map((r) => ({
        fecha: new Date(r.fecha).toLocaleDateString(undefined, { month: 'short', day: '2-digit' }),
        ventas: r.totalVentas,
        gastos: r.totalGastos,
        neto: r.gananciaNeta,
      })),
    [movimientos]
  );

  const chartMensual = useMemo(
    () =>
      gananciasMensuales.map((r) => ({
        mes: new Date(r.mes).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
        ventas: r.total_ventas,
        gastos: r.total_gastos,
        neto: r.ganancia_neta,
      })),
    [gananciasMensuales]
  );

  const tipoLabelMap: Record<string, string> = {
    venta: 'Venta',
    compra: 'Compra',
    pago_cliente: 'Pago cliente',
    gasto: 'Gasto',
    pago_proveedor: 'Pago proveedor',
  };

  async function openPreview() {
    if (!range) return;
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const [resumen, detalle] = await Promise.all([
        Api.movimientosResumen({ ...range }),
        Api.movimientosDetalle({ ...range, limit: 200 }),
      ]);
      const items = Array.isArray(detalle?.items)
        ? detalle.items
        : Array.isArray(detalle)
        ? detalle
        : [];
      setPreviewResumen(resumen as ResumenMovimientos);
      setPreviewMovimientos(items as MovimientoDetalle[]);
      setPreviewTotal(Number(detalle?.total || items.length || 0));
    } catch (e: any) {
      setPreviewError(e?.message || 'No se pudo generar la vista previa');
      setPreviewResumen(null);
      setPreviewMovimientos([]);
      setPreviewTotal(0);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleDownloadGananciasPdf() {
    if (!range) return;
    if (isAdmin) {
      await openPreview();
      return;
    }
    try {
      const blob = await Api.descargarInformeGanancias({ ...range, agregado: agg });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {}
  }

  function handleDownloadMovimientosCsv() {
    if (!range || !movimientos.length) return;
    downloadCsv(
      `movimientos-${range.desde}_a_${range.hasta}.csv`,
      movimientos,
      [
        { key: 'fecha', label: 'Fecha' },
        { key: 'totalVentas', label: 'Total ventas' },
        { key: 'totalGastos', label: 'Total gastos' },
        { key: 'gananciaNeta', label: 'Ganancia neta' },
      ]
    );
  }

  function buildRemitoBase() {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    if (!origin || origin === 'null') return '';
    const isHashRouter =
      window.location.protocol === 'file:' || (window as any)?.desktopEnv?.isDesktop;
    if (isHashRouter) {
      const path = window.location.pathname || '/';
      return `${origin}${path}#/app/remitos/`;
    }
    return `${origin}/app/remitos/`;
  }

  async function handleDownloadMovimientosExcel() {
    if (!range) return;
    setExcelError(null);
    setExcelLoading(true);
    const startedAt = Date.now();
    try {
      const remitoBase = buildRemitoBase();
      const blob = await Api.descargarMovimientosExcel({
        desde: range.desde,
        hasta: range.hasta,
        zona_id: Number.isFinite(zonaId as number) ? (zonaId as number) : undefined,
        remito_base: remitoBase || undefined,
      });
      const name =
        range.desde === range.hasta
          ? `movimientos-${range.desde}.xlsx`
          : `movimientos-${range.desde}-a-${range.hasta}.xlsx`;
      downloadBlob(name, blob);
      if (isMobile) {
        trackMobileEvent('informes_excel_descargado', {
          desde: range.desde,
          hasta: range.hasta,
          duration_ms: Date.now() - startedAt,
        });
      }
    } catch (e: any) {
      setExcelError(e?.message || 'No se pudo descargar el excel de movimientos');
      if (isMobile) {
        trackMobileEvent('informes_excel_error', {
          desde: range.desde,
          hasta: range.hasta,
          message: e?.message || 'No se pudo descargar el excel de movimientos',
          duration_ms: Date.now() - startedAt,
        });
      }
    } finally {
      setExcelLoading(false);
    }
  }

  async function confirmarDescargaPdf() {
    if (!range) return;
    setPreviewError(null);
    try {
      const blob = await Api.descargarInformeGanancias({ ...range, agregado: agg });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setPreviewOpen(false);
    } catch (e: any) {
      setPreviewError(e?.message || 'No se pudo descargar el PDF');
    }
  }

  async function generarInformeIa() {
    if (!range) return;
    if (!aiEnabled) {
      setAiError('IA no habilitada en la licencia.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const resp: any = await Api.aiReportSummary({
        desde: range.desde,
        hasta: range.hasta,
        history: aiHistory,
        forecast: aiForecast,
        limit: aiLimit,
        top: aiTop,
      });
      setAiSummary(resp?.narrative || '');
      setAiData(resp?.data || null);
    } catch (e: any) {
      setAiError(e?.message || 'No se pudo generar el informe IA');
      setAiSummary(null);
      setAiData(null);
    } finally {
      setAiLoading(false);
    }
  }

  function copyAiSummary() {
    if (!aiSummary) return;
    try {
      navigator.clipboard?.writeText(aiSummary);
    } catch {}
  }

  function renderNarrative(text: string) {
    const lines = text.split('\n');
    return (
      <div className="space-y-2">
        {lines.map((raw, idx) => {
          const line = raw.trim();
          if (!line) {
            return <div key={`sp-${idx}`} className="h-2" />;
          }
          if (/^#{1,3}\s/.test(line)) {
            return (
              <div key={`h-${idx}`} className="text-sm font-semibold text-slate-100">
                {line.replace(/^#{1,3}\s*/, '')}
              </div>
            );
          }
          if (line.startsWith('- ') || line.startsWith('* ')) {
            return (
              <div key={`b-${idx}`} className="flex gap-2 text-sm text-slate-200">
                <span className="text-slate-500">-</span>
                <span>{line.replace(/^[-*]\s*/, '')}</span>
              </div>
            );
          }
          return (
            <div key={`t-${idx}`} className="text-sm text-slate-200">
              {line}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="app-title">Informes</div>
          <div className="app-subtitle">Reportes ejecutivos con filtros y descargas</div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKey)}
            className="input-modern text-sm"
          >
            <option value="7d">Ultimos 7 dias</option>
            <option value="30d">Ultimos 30 dias</option>
            <option value="90d">Ultimos 90 dias</option>
            <option value="custom">Rango personalizado</option>
          </select>
          {period === 'custom' && (
            <>
              <input
                type="date"
                value={customDesde}
                onChange={(e) => setCustomDesde(e.target.value)}
                className="input-modern text-sm"
              />
              <input
                type="date"
                value={customHasta}
                onChange={(e) => setCustomHasta(e.target.value)}
                className="input-modern text-sm"
              />
            </>
          )}
          <select
            value={agg}
            onChange={(e) => setAgg(e.target.value as AggKey)}
            className="input-modern text-sm"
          >
            <option value="dia">Dia</option>
            <option value="mes">Mes</option>
          </select>
          <select
            value={zonaId === '' ? '' : String(zonaId)}
            onChange={(e) => setZonaId(e.target.value ? Number(e.target.value) : '')}
            className="input-modern text-sm"
          >
            <option value="">Todas las zonas</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>{z.nombre}</option>
            ))}
          </select>
          <Button variant="ghost" onClick={handleDownloadGananciasPdf} disabled={!range}>
            Descargar PDF ganancias
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadMovimientosCsv}
            disabled={!range || !movimientos.length}
          >
            Descargar CSV movimientos
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadMovimientosExcel}
            disabled={!range || excelLoading}
          >
            {excelLoading ? 'Generando Excel...' : 'Descargar Excel movimientos'}
          </Button>
        </div>
      </div>
      {zonasError && <Alert kind="error" message={zonasError} />}
      {excelError && <Alert kind="error" message={excelError} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="app-card p-4">
          <div className="text-xs text-slate-400">Total ventas</div>
          <div className="text-xl text-slate-100 font-semibold">${totals.ventas.toFixed(0)}</div>
        </div>
        <div className="app-card p-4">
          <div className="text-xs text-slate-400">Total gastos</div>
          <div className="text-xl text-slate-100 font-semibold">${totals.gastos.toFixed(0)}</div>
        </div>
        <div className="app-card p-4">
          <div className="text-xs text-slate-400">Ganancia neta</div>
          <div className="text-xl text-slate-100 font-semibold">${totals.neto.toFixed(0)}</div>
        </div>
      </div>

      <ChartCard
        title="Movimientos por producto"
        right={
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">{rangeLabel}</span>
            <span className="text-slate-500">· {zonaLabel}</span>
            <Button variant="ghost" onClick={loadMovimientosDia} disabled={movDiaLoading}>
              {movDiaLoading ? 'Actualizando...' : 'Actualizar'}
            </Button>
          </div>
        }
      >
        {movDiaError && <Alert kind="error" message={movDiaError} />}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Total ingresado</div>
            <div className="text-xl text-slate-100 font-semibold">
              ${movDiaTotal.toFixed(0)}
            </div>
            <div className="h-56">
              {movDiaLoading ? (
                <div className="h-full flex items-center justify-center">
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : !movDiaPie.length ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  Sin ventas entregadas en el periodo.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={movDiaPie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {movDiaPie.map((entry, index) => (
                        <Cell key={`cell-${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      wrapperStyle={{ outline: 'none' }}
                      contentStyle={{
                        background: 'rgba(2,6,23,0.92)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        color: '#e2e8f0',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="text-xs text-slate-400">Detalle por producto</div>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {movDiaPie.map((item, idx) => {
                const pct = movDiaTotal > 0 ? (item.value / movDiaTotal) * 100 : 0;
                return (
                  <div
                    key={`${item.name}-${idx}`}
                    className="flex items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                      />
                      <span className="truncate text-slate-200">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-100 font-medium">${item.value.toFixed(0)}</div>
                      <div className="text-[11px] text-slate-400">{pct.toFixed(1)}%</div>
                    </div>
                  </div>
                );
              })}
              {!movDiaPie.length && !movDiaLoading && (
                <div className="text-xs text-slate-500">Sin productos para el periodo.</div>
              )}
            </div>
          </div>
        </div>
      </ChartCard>

      <ChartCard
        title="Informe ejecutivo IA"
        right={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={aiHistory}
              onChange={(e) => setAiHistory(Number(e.target.value))}
              className="input-modern text-xs"
            >
              <option value={30}>Historia 30d</option>
              <option value={60}>Historia 60d</option>
              <option value={90}>Historia 90d</option>
            </select>
            <select
              value={aiForecast}
              onChange={(e) => setAiForecast(Number(e.target.value))}
              className="input-modern text-xs"
            >
              <option value={7}>Forecast 7d</option>
              <option value={14}>Forecast 14d</option>
              <option value={30}>Forecast 30d</option>
            </select>
            <select
              value={aiLimit}
              onChange={(e) => setAiLimit(Number(e.target.value))}
              className="input-modern text-xs"
            >
              <option value={6}>Alertas 6</option>
              <option value={10}>Alertas 10</option>
              <option value={14}>Alertas 14</option>
            </select>
            <select
              value={aiTop}
              onChange={(e) => setAiTop(Number(e.target.value))}
              className="input-modern text-xs"
            >
              <option value={3}>Top 3</option>
              <option value={5}>Top 5</option>
              <option value={8}>Top 8</option>
            </select>
            <button
              type="button"
              onClick={generarInformeIa}
              disabled={!range || !aiEnabled || aiLoading}
              className={`px-2 py-1 rounded border text-xs ${
                aiEnabled
                  ? 'bg-primary-500/20 border-primary-500/30 hover:bg-primary-500/30 text-primary-200'
                  : 'bg-white/5 border-white/10 text-slate-500 cursor-not-allowed'
              }`}
            >
              {aiLoading ? 'Generando...' : 'Generar IA'}
            </button>
          </div>
        }
      >
        {!aiEnabled && (
          <div className="text-sm text-slate-400">
            La IA esta disponible desde el plan Pro.
          </div>
        )}
        {aiEnabled && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Rango: {range?.desde || '-'} a {range?.hasta || '-'}
              </span>
              <button
                type="button"
                onClick={() => setAiShowData((v) => !v)}
                className="text-slate-300 hover:text-white"
              >
                {aiShowData ? 'Ocultar datos' : 'Ver datos'}
              </button>
            </div>

            {aiError && <Alert kind="error" message={aiError} />}

            {aiShowData && aiData && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 text-sm">
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="text-xs text-slate-400">Ventas</div>
                  <div className="text-slate-100 font-semibold">
                    ${Number(aiData.kpis.ventas.total || 0).toFixed(0)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {aiData.kpis.ventas.count} ops · Ticket ${Number(aiData.kpis.ventas.avg_ticket || 0).toFixed(0)}
                  </div>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="text-xs text-slate-400">Gastos</div>
                  <div className="text-slate-100 font-semibold">
                    ${Number(aiData.kpis.gastos.total || 0).toFixed(0)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {aiData.kpis.gastos.count} ops · Var {aiData.trends.gastos_pct ?? 0}%
                  </div>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="text-xs text-slate-400">Ganancia neta</div>
                  <div className="text-slate-100 font-semibold">
                    ${Number(aiData.kpis.ganancia_neta.total || 0).toFixed(0)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Var {aiData.trends.ganancia_pct ?? 0}%
                  </div>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="text-xs text-slate-400">Cashflow neto</div>
                  <div className="text-slate-100 font-semibold">
                    ${Number(aiData.kpis.cashflow.neto || 0).toFixed(0)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Cobranzas {Number(aiData.kpis.cobranza_ratio || 0).toFixed(1)}%
                  </div>
                </div>
              </div>
            )}

            {aiSummary && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-slate-200 font-semibold">Narrativa IA</div>
                  <button
                    type="button"
                    onClick={copyAiSummary}
                    className="text-xs text-slate-300 hover:text-white"
                  >
                    Copiar
                  </button>
                </div>
                {renderNarrative(aiSummary)}
              </div>
            )}

            {!aiSummary && !aiLoading && !aiError && (
              <div className="text-sm text-slate-500">
                Genera el informe IA para obtener resumen, riesgos y acciones sugeridas.
              </div>
            )}
          </div>
        )}
      </ChartCard>

      <ChartCard title="Movimientos de ventas y gastos">
        {movError && <Alert kind="error" message={movError} />}
        <div className="h-64">
          {movLoading ? (
            <div className="h-full flex items-center justify-center">
              <Skeleton className="h-32 w-full" />
            </div>
          ) : !chartMovimientos.length ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              Sin datos para el periodo seleccionado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartMovimientos}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="fecha" tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#334155' }} />
                <YAxis tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#334155' }} />
                <Tooltip
                  wrapperStyle={{ outline: 'none' }}
                  contentStyle={{
                    background: 'rgba(2,6,23,0.92)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: '#e2e8f0',
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="ventas" stroke="#22d3ee" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="gastos" stroke="#f97316" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="neto" stroke="#a855f7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      <ChartCard title="Ganancias mensuales">
        {gananciasError && <Alert kind="error" message={gananciasError} />}
        <div className="h-64">
          {!chartMensual.length ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              Sin datos disponibles
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartMensual}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#334155' }} />
                <YAxis tick={{ fill: '#94a3b8' }} axisLine={{ stroke: '#334155' }} />
                <Tooltip
                  wrapperStyle={{ outline: 'none' }}
                  contentStyle={{
                    background: 'rgba(2,6,23,0.92)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: '#e2e8f0',
                  }}
                />
                <Legend />
                <Area type="monotone" dataKey="ventas" stroke="#22d3ee" fill="rgba(34,211,238,0.2)" />
                <Area type="monotone" dataKey="gastos" stroke="#f97316" fill="rgba(249,115,22,0.18)" />
                <Area type="monotone" dataKey="neto" stroke="#a855f7" fill="rgba(168,85,247,0.2)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="mt-4">
          {isMobile ? (
            <div className="space-y-2">
              {gananciasMensuales.map((r) => (
                <article key={r.mes} className="app-panel p-3 text-xs space-y-2">
                  <div className="text-slate-100 font-medium">
                    {new Date(r.mes).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-slate-400">Ventas</div>
                      <div className="text-slate-100">${r.total_ventas.toFixed(0)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Gastos</div>
                      <div className="text-slate-100">${r.total_gastos.toFixed(0)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Neto</div>
                      <div className="text-slate-100">${r.ganancia_neta.toFixed(0)}</div>
                    </div>
                  </div>
                </article>
              ))}
              {!gananciasMensuales.length && (
                <div className="app-panel p-3 text-xs text-slate-400">Sin registros</div>
              )}
            </div>
          ) : (
            <DataTable
              headers={
                <thead className="text-left text-slate-400">
                  <tr>
                    <th className="py-2 px-2">Mes</th>
                    <th className="py-2 px-2 text-right">Ventas</th>
                    <th className="py-2 px-2 text-right">Gastos</th>
                    <th className="py-2 px-2 text-right">Ganancia neta</th>
                  </tr>
                </thead>
              }
            >
              <tbody className="text-slate-200">
                {gananciasMensuales.map((r) => (
                  <tr key={r.mes} className="border-t border-white/10">
                    <td className="py-2 px-2">
                      {new Date(r.mes).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-2 px-2 text-right">${r.total_ventas.toFixed(0)}</td>
                    <td className="py-2 px-2 text-right">${r.total_gastos.toFixed(0)}</td>
                    <td className="py-2 px-2 text-right">${r.ganancia_neta.toFixed(0)}</td>
                  </tr>
                ))}
                {!gananciasMensuales.length && (
                  <tr>
                    <td className="py-2 px-2 text-slate-400" colSpan={4}>
                      Sin registros
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          )}
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Stock bajo">
          {stockError && <Alert kind="error" message={stockError} />}
          {isMobile ? (
            <div className="space-y-2">
              {stockBajo.map((r) => (
                <article key={r.producto_id} className="app-panel p-3 text-xs space-y-1">
                  <div className="text-slate-100 font-medium">{r.nombre}</div>
                  <div className="text-slate-400">Codigo: {r.codigo || '-'}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-slate-400">Disponible</div>
                      <div className="text-slate-100">{r.cantidad_disponible}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Minimo</div>
                      <div className="text-slate-100">{r.stock_minimo}</div>
                    </div>
                  </div>
                </article>
              ))}
              {!stockBajo.length && <div className="app-panel p-3 text-xs text-slate-400">Sin alertas de stock</div>}
            </div>
          ) : (
            <DataTable
              headers={
                <thead className="text-left text-slate-400">
                  <tr>
                    <th className="py-2 px-2">Codigo</th>
                    <th className="py-2 px-2">Producto</th>
                    <th className="py-2 px-2 text-right">Disponible</th>
                    <th className="py-2 px-2 text-right">Minimo</th>
                  </tr>
                </thead>
              }
            >
              <tbody className="text-slate-200">
                {stockBajo.map((r) => (
                  <tr key={r.producto_id} className="border-t border-white/10">
                    <td className="py-2 px-2">{r.codigo}</td>
                    <td className="py-2 px-2">{r.nombre}</td>
                    <td className="py-2 px-2 text-right">{r.cantidad_disponible}</td>
                    <td className="py-2 px-2 text-right">{r.stock_minimo}</td>
                  </tr>
                ))}
                {!stockBajo.length && (
                  <tr>
                    <td className="py-2 px-2 text-slate-400" colSpan={4}>
                      Sin alertas de stock
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          )}
        </ChartCard>

        <ChartCard title="Top clientes y productos">
          {topError && <Alert kind="error" message={topError} />}
          <div className="mb-3">
            <select
              value={selectedClienteId ?? ''}
              onChange={(e) => setSelectedClienteId(Number(e.target.value) || null)}
              className="input-modern text-sm w-full"
            >
              {topClientes.map((c) => (
                <option key={c.cliente_id} value={c.cliente_id}>
                  {c.nombre} {c.apellido || ''} - ${Number(c.total_comprado || 0).toFixed(0)}
                </option>
              ))}
              {!topClientes.length && <option value="">Sin clientes</option>}
            </select>
          </div>
          {topProdError && <Alert kind="error" message={topProdError} />}
          {isMobile ? (
            <div className="space-y-2">
              {topProductosCliente.map((r) => (
                <article key={r.producto_id} className="app-panel p-3 text-xs">
                  <div className="text-slate-100 font-medium">{r.producto_nombre}</div>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-slate-400">Unidades</div>
                      <div className="text-slate-100">{r.total_cantidad}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Monto</div>
                      <div className="text-slate-100">${Number(r.total_monto || 0).toFixed(0)}</div>
                    </div>
                  </div>
                </article>
              ))}
              {!topProductosCliente.length && (
                <div className="app-panel p-3 text-xs text-slate-400">Sin datos de productos</div>
              )}
            </div>
          ) : (
            <DataTable
              headers={
                <thead className="text-left text-slate-400">
                  <tr>
                    <th className="py-2 px-2">Producto</th>
                    <th className="py-2 px-2 text-right">Unidades</th>
                    <th className="py-2 px-2 text-right">Monto</th>
                  </tr>
                </thead>
              }
            >
              <tbody className="text-slate-200">
                {topProductosCliente.map((r) => (
                  <tr key={r.producto_id} className="border-t border-white/10">
                    <td className="py-2 px-2">{r.producto_nombre}</td>
                    <td className="py-2 px-2 text-right">{r.total_cantidad}</td>
                    <td className="py-2 px-2 text-right">${Number(r.total_monto || 0).toFixed(0)}</td>
                  </tr>
                ))}
                {!topProductosCliente.length && (
                  <tr>
                    <td className="py-2 px-2 text-slate-400" colSpan={3}>
                      Sin datos de productos
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Deudas por cliente">
        {deudasError && <Alert kind="error" message={deudasError} />}
        {isMobile ? (
          <div className="space-y-2">
            {deudas.slice(0, 20).map((r) => (
              <article key={r.cliente_id} className="app-panel p-3 text-xs space-y-2">
                <div className="text-slate-100 font-medium">Cliente #{r.cliente_id}</div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-slate-400">Deuda</div>
                    <div className="text-slate-100">${Number(r.deuda_pendiente || 0).toFixed(0)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">0-30</div>
                    <div className="text-slate-100">${Number(r.deuda_0_30 || 0).toFixed(0)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">31-60</div>
                    <div className="text-slate-100">${Number(r.deuda_31_60 || 0).toFixed(0)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">61-90</div>
                    <div className="text-slate-100">${Number(r.deuda_61_90 || 0).toFixed(0)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">+90</div>
                    <div className="text-slate-100">${Number(r.deuda_mas_90 || 0).toFixed(0)}</div>
                  </div>
                </div>
              </article>
            ))}
            {!deudas.length && <div className="app-panel p-3 text-xs text-slate-400">Sin registros de deuda</div>}
          </div>
        ) : (
          <DataTable
            headers={
              <thead className="text-left text-slate-400">
                <tr>
                  <th className="py-2 px-2">Cliente ID</th>
                  <th className="py-2 px-2 text-right">Deuda</th>
                  <th className="py-2 px-2 text-right">0-30</th>
                  <th className="py-2 px-2 text-right">31-60</th>
                  <th className="py-2 px-2 text-right">61-90</th>
                  <th className="py-2 px-2 text-right">+90</th>
                </tr>
              </thead>
            }
          >
            <tbody className="text-slate-200">
              {deudas.slice(0, 20).map((r) => (
                <tr key={r.cliente_id} className="border-t border-white/10">
                  <td className="py-2 px-2">{r.cliente_id}</td>
                  <td className="py-2 px-2 text-right">${Number(r.deuda_pendiente || 0).toFixed(0)}</td>
                  <td className="py-2 px-2 text-right">${Number(r.deuda_0_30 || 0).toFixed(0)}</td>
                  <td className="py-2 px-2 text-right">${Number(r.deuda_31_60 || 0).toFixed(0)}</td>
                  <td className="py-2 px-2 text-right">${Number(r.deuda_61_90 || 0).toFixed(0)}</td>
                  <td className="py-2 px-2 text-right">${Number(r.deuda_mas_90 || 0).toFixed(0)}</td>
                </tr>
              ))}
              {!deudas.length && (
                <tr>
                  <td className="py-2 px-2 text-slate-400" colSpan={6}>
                    Sin registros de deuda
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>
        )}
      </ChartCard>

      {previewOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="bg-slate-900 rounded-2xl border border-white/10 shadow-xl w-full max-w-5xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <div className="text-sm text-slate-400">Resumen y recomendaciones</div>
                <div className="text-lg text-slate-100 font-semibold">
                  Vista previa antes de descargar el PDF
                </div>
                {previewResumen?.range && (
                  <div className="text-xs text-slate-400">
                    Periodo: {previewResumen.range.desde} a {previewResumen.range.hasta}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setPreviewOpen(false)}>
                  Cerrar
                </Button>
                <Button onClick={confirmarDescargaPdf} disabled={previewLoading}>
                  {previewLoading ? 'Generando...' : 'Descargar PDF'}
                </Button>
              </div>
            </div>

            {previewError && <Alert kind="error" message={previewError} />}

            {previewLoading ? (
              <div className="py-8 text-center text-slate-400">Generando resumen...</div>
            ) : (
              <div className="space-y-4">
                {previewResumen?.totals && (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                      <div className="text-xs text-slate-400">Ventas</div>
                      <div className="text-slate-100 font-semibold">
                        ${Number(previewResumen.totals.ventas || 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                      <div className="text-xs text-slate-400">Compras</div>
                      <div className="text-slate-100 font-semibold">
                        ${Number(previewResumen.totals.compras || 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                      <div className="text-xs text-slate-400">Pagos clientes</div>
                      <div className="text-slate-100 font-semibold">
                        ${Number(previewResumen.totals.pagos_clientes || 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                      <div className="text-xs text-slate-400">Gastos</div>
                      <div className="text-slate-100 font-semibold">
                        ${Number(previewResumen.totals.gastos || 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                      <div className="text-xs text-slate-400">Pagos proveedores</div>
                      <div className="text-slate-100 font-semibold">
                        ${Number(previewResumen.totals.pagos_proveedores || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}

                {previewResumen?.sections?.map((section, idx) => (
                  <div key={`${section.title}-${idx}`} className="rounded-xl bg-white/5 border border-white/10 p-4">
                    <div className="text-sm text-slate-200 font-semibold mb-2">
                      {section.title}
                    </div>
                    <div className="space-y-2 text-sm">
                      {section.lines?.length ? (
                        section.lines.map((line, i) => (
                          <div
                            key={`${idx}-line-${i}`}
                            className="flex gap-2 items-start bg-slate-950/60 border border-white/5 rounded-lg px-3 py-2"
                          >
                            <span className="text-slate-500">•</span>
                            <span className="text-slate-200">{line}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-500">Sin datos para mostrar.</div>
                      )}
                    </div>
                  </div>
                ))}

                <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-slate-200 font-semibold">Movimientos detallados</div>
                    <div className="text-xs text-slate-400">
                      Mostrando {previewMovimientos.length} de {previewTotal}
                    </div>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {previewMovimientos.map((item, idx) => {
                      const label = tipoLabelMap[item.tipo] || item.tipo;
                      const ingreso = item.tipo === 'venta' || item.tipo === 'pago_cliente';
                      return (
                        <div
                          key={`${item.tipo}-${idx}`}
                          className="flex items-center justify-between gap-3 bg-slate-950/60 border border-white/5 rounded-lg px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="text-slate-200 font-medium">{label}</div>
                            <div className="text-slate-500 truncate">
                              {item.descripcion || 'Movimiento'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={ingreso ? 'text-emerald-200' : 'text-rose-200'}>
                              ${Number(item.monto || 0).toFixed(2)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {item.fecha ? new Date(item.fecha).toLocaleString() : '-'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {!previewMovimientos.length && (
                      <div className="text-xs text-slate-500">Sin movimientos en el periodo.</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
