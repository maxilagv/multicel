import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import ChartCard from '../ui/ChartCard';
import DataTable from '../ui/DataTable';
import Skeleton from '../ui/Skeleton';
import Button from '../ui/Button';
import Alert from '../components/Alert';
import { useLicense } from '../context/LicenseContext';
import { hasFeature } from '../lib/features';
import { Api } from '../lib/api';
import CategoryTreePicker from '../components/CategoryTreePicker';
import type { CategoryNode } from '../lib/categoryTree';

type ForecastRow = {
  producto_id: number;
  producto_nombre: string;
  daily_avg: number;
  forecast_units: number;
  disponible: number;
  cobertura_dias: number;
  sugerido_reponer: number;
};

type StockoutRow = ForecastRow & { dias_hasta_quiebre: number };

type PrecioRow = {
  producto_id: number;
  producto_nombre: string;
  precio_actual: number;
  precio_sugerido: number;
  diferencia: number;
  margen_estimado: number | null;
  rotacion_diaria: number;
};

type AnomaliaRow = { dia: string; total: number; z: number; tipo: string };

type ForecastSortKey = keyof Pick<
  ForecastRow,
  'producto_nombre' | 'daily_avg' | 'disponible' | 'cobertura_dias' | 'sugerido_reponer'
>;

type StockoutSortKey = keyof Pick<
  StockoutRow,
  'producto_nombre' | 'disponible' | 'daily_avg' | 'dias_hasta_quiebre' | 'sugerido_reponer'
>;

type PrecioSortKey = keyof Pick<
  PrecioRow,
  'producto_nombre' | 'precio_actual' | 'precio_sugerido' | 'diferencia' | 'margen_estimado' | 'rotacion_diaria'
>;

type SortState<K extends string> = { key: K; dir: 'asc' | 'desc' };

type ForecastDetail = {
  producto_id: number;
  producto_nombre: string;
  daily_avg: number;
  history: { dia: string; unidades: number }[];
  forecast: { dia: string; unidades: number }[];
};

type ProductoInfo = {
  id: number;
  name: string;
  category_id: number;
  description?: string | null;
  image_url?: string | null;
  price: number;
  stock_quantity: number;
};

function getSettledError(result: PromiseSettledResult<any>, fallback: string) {
  if (result.status === 'rejected') {
    const reason = result.reason;
    if (reason instanceof Error && reason.message) return reason.message;
    if (typeof reason === 'string' && reason.trim()) return reason;
  }
  return fallback;
}

export default function Predicciones() {
  const { status: licenseStatus } = useLicense();
  const aiEnabled = hasFeature(licenseStatus, 'ai');
  const [horizon, setHorizon] = useState<number>(14);
  const [history, setHistory] = useState<number>(90);
  const llmEnabled = aiEnabled && import.meta.env.VITE_AI_LLM_ENABLED === 'true';

  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [stockouts, setStockouts] = useState<StockoutRow[]>([]);
  const [anomSales, setAnomSales] = useState<AnomaliaRow[]>([]);
  const [precios, setPrecios] = useState<PrecioRow[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [categoryFilterId, setCategoryFilterId] = useState<number | null>(null);
  const [includeDescendants, setIncludeDescendants] = useState(true);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<{
    forecast: string | null;
    stockouts: string | null;
    anomalias: string | null;
    precios: string | null;
  }>({
    forecast: null,
    stockouts: null,
    anomalias: null,
    precios: null,
  });

  const [forecastSort, setForecastSort] = useState<SortState<ForecastSortKey>>({
    key: 'producto_nombre',
    dir: 'asc',
  });

  const [stockoutSort, setStockoutSort] = useState<SortState<StockoutSortKey>>({
    key: 'dias_hasta_quiebre',
    dir: 'asc',
  });

  const [precioSort, setPrecioSort] = useState<SortState<PrecioSortKey>>({
    key: 'diferencia',
    dir: 'desc',
  });

  const [anomSortKey, setAnomSortKey] = useState<'dia' | 'z'>('dia');
  const [anomSortDir, setAnomSortDir] = useState<'asc' | 'desc'>('desc');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ForecastDetail | null>(null);
  const [detailExplainLoading, setDetailExplainLoading] = useState(false);
  const [detailExplainError, setDetailExplainError] = useState<string | null>(null);
  const [detailExplain, setDetailExplain] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<any>(null);

  const [productosCache, setProductosCache] = useState<ProductoInfo[] | null>(null);
  const [precioError, setPrecioError] = useState<string | null>(null);

  async function loadData(params?: { days?: number; history?: number }) {
    const days = params?.days ?? horizon;
    const hist = params?.history ?? history;
    const categoryId = categoryFilterId ?? undefined;
    const includeTree = categoryId ? includeDescendants : false;
    setLoading(true);
    setError(null);
    setSectionErrors({
      forecast: null,
      stockouts: null,
      anomalias: null,
      precios: null,
    });
    try {
      const results = await Promise.allSettled([
        Api.aiForecast({
          days,
          history: hist,
          limit: 50,
          category_id: categoryId,
          include_descendants: includeTree,
        }),
        Api.aiStockouts({
          days,
          history: hist,
          limit: 50,
          category_id: categoryId,
          include_descendants: includeTree,
        }),
        Api.aiAnomalias({ scope: 'sales', period: hist, sigma: 3 }),
        Api.aiPrecios({ history: hist, limit: 50 }),
      ]);
      let okCount = 0;

      const forecastResult = results[0];
      if (forecastResult.status === 'fulfilled') {
        setForecast(forecastResult.value || []);
        okCount += 1;
      } else {
        setForecast([]);
        setSectionErrors((prev) => ({
          ...prev,
          forecast: getSettledError(forecastResult, 'No se pudo cargar el pronostico'),
        }));
      }

      const stockoutResult = results[1];
      if (stockoutResult.status === 'fulfilled') {
        setStockouts(stockoutResult.value || []);
        okCount += 1;
      } else {
        setStockouts([]);
        setSectionErrors((prev) => ({
          ...prev,
          stockouts: getSettledError(stockoutResult, 'No se pudo cargar stockouts'),
        }));
      }

      const anomResult = results[2];
      if (anomResult.status === 'fulfilled') {
        const a = anomResult.value as any;
        setAnomSales(((a?.sales || []) as any[]).map((r) => ({ ...r, dia: r.dia })));
        okCount += 1;
      } else {
        setAnomSales([]);
        setSectionErrors((prev) => ({
          ...prev,
          anomalias: getSettledError(anomResult, 'No se pudieron cargar anomalias'),
        }));
      }

      const preciosResult = results[3];
      if (preciosResult.status === 'fulfilled') {
        setPrecios(preciosResult.value || []);
        okCount += 1;
      } else {
        setPrecios([]);
        setSectionErrors((prev) => ({
          ...prev,
          precios: getSettledError(preciosResult, 'No se pudieron cargar precios sugeridos'),
        }));
      }

      if (okCount === 0) {
        setError('No se pudieron cargar las predicciones');
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar las predicciones');
    } finally {
      setLoading(false);
    }
  }

  async function loadCategoryTree() {
    try {
      const rows = await Api.categoriasTree();
      setCategoryTree(Array.isArray(rows) ? (rows as CategoryNode[]) : []);
    } catch {
      setCategoryTree([]);
    }
  }

  useEffect(() => {
    loadCategoryTree();
    loadData({ days: horizon, history });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSort<K extends string>(state: SortState<K>, key: K, setter: (s: SortState<K>) => void) {
    if (state.key === key) {
      setter({ key, dir: state.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      setter({ key, dir: 'asc' });
    }
  }

  function sortList<T, K extends string>(rows: T[], state: SortState<K>): T[] {
    const { key, dir } = state;
    const mult = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a: any, b: any) => {
      const va = a[key];
      const vb = b[key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * mult;
      }
      return String(va).localeCompare(String(vb)) * mult;
    });
  }

  const sortedForecast = useMemo(
    () => sortList<ForecastRow, ForecastSortKey>(forecast, forecastSort),
    [forecast, forecastSort],
  );

  const focusProducto = useMemo(
    () => (sortedForecast.length ? sortedForecast[0] : null),
    [sortedForecast],
  );

  const sortedStockouts = useMemo(
    () => sortList<StockoutRow, StockoutSortKey>(stockouts, stockoutSort),
    [stockouts, stockoutSort],
  );

  const sortedPrecios = useMemo(
    () => sortList<PrecioRow, PrecioSortKey>(precios, precioSort),
    [precios, precioSort],
  );

  const sortedAnom = useMemo(() => {
    const arr = [...anomSales];
    const mult = anomSortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (anomSortKey === 'dia') {
        return (new Date(a.dia).getTime() - new Date(b.dia).getTime()) * mult;
      }
      return (a.z - b.z) * mult;
    });
    return arr;
  }, [anomSales, anomSortKey, anomSortDir]);

  async function openDetail(productoId: number) {
    setDetailOpen(true);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    setDetailExplain(null);
    setDetailExplainError(null);
    setDetailExplainLoading(false);
    try {
      const data = await Api.aiForecastDetail(productoId, { days: horizon, history });
      setDetail(data as ForecastDetail);
    } catch (e: any) {
      setDetailError(e?.message || 'No se pudo cargar el detalle');
    } finally {
      setDetailLoading(false);
    }
  }

  function normalizeDateKey(value: unknown) {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const raw = String(value);
    const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return raw;
  }

  const detailChartData = useMemo(() => {
    if (!detail) return [];
    const map = new Map<string, { fecha: string; historico: number | null; forecast: number | null }>();
    const historyRows = Array.isArray(detail.history) ? detail.history : [];
    const forecastRows = Array.isArray(detail.forecast) ? detail.forecast : [];
    for (const r of historyRows) {
      const key = normalizeDateKey(r.dia);
      if (!key) continue;
      map.set(key, { fecha: key, historico: r.unidades, forecast: null });
    }
    for (const r of forecastRows) {
      const key = normalizeDateKey(r.dia);
      if (!key) continue;
      const existing = map.get(key) || { fecha: key, historico: null, forecast: null };
      existing.forecast = r.unidades;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [detail]);

  async function explainDetail(productoId?: number) {
    const id = productoId ?? detail?.producto_id;
    if (!id) return;
    setDetailExplainLoading(true);
    setDetailExplainError(null);
    setDetailExplain(null);
    try {
      const resp: any = await Api.aiExplainForecast(id, {
        days: horizon,
        history,
      });
      setDetailExplain(resp?.explanation || '');
    } catch (e: any) {
      setDetailExplainError(e?.message || 'No se pudo generar la explicación');
    } finally {
      setDetailExplainLoading(false);
    }
  }

  async function generarResumenPredicciones() {
    if (!llmEnabled) {
      setSummaryError('IA no habilitada.');
      return;
    }
    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryText(null);
    try {
      const resp: any = await Api.aiPredictionsSummary({
        days: horizon,
        history,
        limit: 8,
        category_id: categoryFilterId ?? undefined,
        include_descendants: categoryFilterId ? includeDescendants : undefined,
      });
      setSummaryText(resp?.narrative || '');
      setSummaryData(resp?.data || null);
    } catch (e: any) {
      setSummaryError(e?.message || 'No se pudo generar el resumen IA');
      setSummaryText(null);
      setSummaryData(null);
    } finally {
      setSummaryLoading(false);
    }
  }

  function renderNarrative(text: string) {
    const lines = text.split('\n');
    return (
      <div className="space-y-2">
        {lines.map((raw, idx) => {
          const line = raw.trim();
          if (!line) return <div key={`sp-${idx}`} className="h-2" />;
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

  async function ensureProductosCache() {
    if (productosCache) return productosCache;
    try {
      const all = await Api.productos({ all: true });
      const mapped = (all || []).map(
        (p: any): ProductoInfo => ({
          id: p.id,
          name: p.name,
          category_id: p.category_id,
          description: p.description,
          image_url: p.image_url,
          price: Number(p.price || 0),
          stock_quantity: Number(p.stock_quantity || 0),
        }),
      );
      setProductosCache(mapped);
      return mapped;
    } catch (e: any) {
      throw new Error(e?.message || 'No se pudieron cargar los productos');
    }
  }

  async function editarPrecio(row: PrecioRow) {
    setPrecioError(null);
    try {
      const productos = await ensureProductosCache();
      const prod = productos.find((p) => p.id === row.producto_id);
      if (!prod) {
        setPrecioError('Producto no encontrado');
        return;
      }
      const nuevoPrecioStr = window.prompt(
        `Nuevo precio para ${row.producto_nombre}`,
        row.precio_sugerido.toFixed(2),
      );
      if (nuevoPrecioStr == null) return;
      const nuevoPrecio = Number(nuevoPrecioStr);
      if (!Number.isFinite(nuevoPrecio) || nuevoPrecio <= 0) {
        setPrecioError('Precio inválido');
        return;
      }
      await Api.actualizarProducto(prod.id, {
        name: prod.name,
        description: prod.description ?? '',
        price: nuevoPrecio,
        image_url: prod.image_url ?? '',
        category_id: prod.category_id,
        stock_quantity: prod.stock_quantity,
      });
      await loadData();
    } catch (e: any) {
      if (e && e.code === 'APPROVAL_REQUIRED') {
        setPrecioError(
          `Se solicitó aprobación #${e.aprobacionId || ''}${e.regla ? ` (${e.regla})` : ''}`,
        );
      } else {
        setPrecioError(e?.message || 'No se pudo actualizar el precio');
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Predicciones</h2>
          <p className="text-sm text-slate-400">
            Pronósticos de demanda, riesgos de quiebre, anomalías y precios sugeridos.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col text-xs text-slate-400">
            <span className="mb-1">Horizonte</span>
            <select
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="select-modern text-sm min-w-[120px]"
            >
              <option value={7}>7 días</option>
              <option value={14}>14 días</option>
              <option value={30}>30 días</option>
            </select>
          </div>
          <div className="flex flex-col text-xs text-slate-400">
            <span className="mb-1">Historia</span>
            <select
              value={history}
              onChange={(e) => setHistory(Number(e.target.value))}
              className="select-modern text-sm min-w-[120px]"
            >
              <option value={30}>30 días</option>
              <option value={60}>60 días</option>
              <option value={90}>90 días</option>
            </select>
          </div>
          <div className="flex flex-col text-xs text-slate-400 min-w-[260px]">
            <span className="mb-1">Categoria</span>
            <CategoryTreePicker
              tree={categoryTree}
              value={categoryFilterId}
              onChange={setCategoryFilterId}
              allowClear
              placeholder="Todas las categorias"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300 pb-2 select-none">
            <input
              type="checkbox"
              checked={includeDescendants}
              onChange={(e) => setIncludeDescendants(e.target.checked)}
              disabled={!categoryFilterId}
            />
            Incluir subcategorias
          </label>
          <Button
            onClick={() => loadData()}
            className="h-11 px-4"
            disabled={loading}
          >
            Actualizar
          </Button>
        </div>
      </div>

      {error && <Alert kind="error" message={error} />}

      <ChartCard
        title="Resumen IA de predicciones"
        right={
          <Button onClick={generarResumenPredicciones} disabled={summaryLoading || !llmEnabled}>
            {summaryLoading ? 'Generando...' : 'Generar IA'}
          </Button>
        }
      >
        {!llmEnabled && (
          <div className="text-sm text-slate-400">
            La IA esta disponible desde el plan Pro.
          </div>
        )}
        {llmEnabled && (
          <div className="space-y-3">
            {summaryError && <Alert kind="error" message={summaryError} />}
            {summaryText && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                {renderNarrative(summaryText)}
              </div>
            )}
            {!summaryText && !summaryLoading && !summaryError && (
              <div className="text-sm text-slate-500">
                Genera un resumen para tener riesgos, precios a revisar y acciones sugeridas.
              </div>
            )}
            {summaryData?.insights_summary && (
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-100">
                  Altas {summaryData.insights_summary.high}
                </span>
                <span className="px-2 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-100">
                  Medias {summaryData.insights_summary.medium}
                </span>
                <span className="px-2 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-100">
                  Bajas {summaryData.insights_summary.low}
                </span>
              </div>
            )}
          </div>
        )}
      </ChartCard>

      {llmEnabled && focusProducto && (
        <ChartCard title="ExplicaciИn IA de demanda">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="text-xs text-slate-400 mb-1">
                Producto enfocado:{' '}
                <span className="text-slate-200">
                  {focusProducto.producto_nombre}
                </span>
              </div>
              {detailExplain ? (
                <div className="text-xs text-slate-200 whitespace-pre-line max-h-40 overflow-auto">
                  {detailExplain}
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  Pulsa el botСn para generar una explicaciИn de la demanda y stock con IA.
                </div>
              )}
            </div>
            <button
              className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-xs disabled:opacity-50"
              disabled={detailExplainLoading}
              onClick={() => explainDetail(focusProducto.producto_id)}
            >
              {detailExplainLoading ? 'Generando...' : 'ExplicaciИn IA'}
            </button>
          </div>
        </ChartCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title={`Pronóstico por producto (${horizon} días)`}>
          {sectionErrors.forecast && (
            <div className="mb-2">
              <Alert kind="error" message={sectionErrors.forecast} />
            </div>
          )}
          <DataTable
            headers={
              <thead className="text-left text-slate-400">
                <tr>
                  <th
                    className="py-2 px-2 cursor-pointer select-none"
                    onClick={() =>
                      toggleSort(forecastSort, 'producto_nombre', setForecastSort)
                    }
                  >
                    Producto
                  </th>
                  <th
                    className="py-2 px-2 cursor-pointer select-none"
                    onClick={() =>
                      toggleSort(forecastSort, 'daily_avg', setForecastSort)
                    }
                  >
                    Rotación diaria
                  </th>
                  <th
                    className="py-2 px-2 cursor-pointer select-none"
                    onClick={() =>
                      toggleSort(forecastSort, 'disponible', setForecastSort)
                    }
                  >
                    Disponible
                  </th>
                  <th
                    className="py-2 px-2 cursor-pointer select-none"
                    onClick={() =>
                      toggleSort(forecastSort, 'cobertura_dias', setForecastSort)
                    }
                  >
                    Cobertura (días)
                  </th>
                  <th
                    className="py-2 px-2 cursor-pointer select-none"
                    onClick={() =>
                      toggleSort(forecastSort, 'sugerido_reponer', setForecastSort)
                    }
                  >
                    Sugerido reponer
                  </th>
                </tr>
              </thead>
            }
          >
            <tbody className="text-slate-200">
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-white/10">
                    <td className="py-2 px-2" colSpan={5}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))}
              {!loading &&
                sortedForecast.map((r) => {
                  const lowCoverage = r.cobertura_dias < 5 && r.cobertura_dias >= 0;
                  return (
                    <tr
                      key={r.producto_id}
                      className={
                        'border-t border-white/10 hover:bg-white/5 cursor-pointer ' +
                        (lowCoverage ? 'bg-rose-500/10 text-rose-100' : '')
                      }
                      onClick={() => openDetail(r.producto_id)}
                    >
                      <td className="py-2 px-2">{r.producto_nombre}</td>
                      <td className="py-2 px-2">{r.daily_avg.toFixed(3)}</td>
                      <td className="py-2 px-2">{r.disponible}</td>
                      <td className="py-2 px-2">{r.cobertura_dias}</td>
                      <td className="py-2 px-2">{r.sugerido_reponer}</td>
                    </tr>
                  );
                })}
              {!loading && forecast.length === 0 && (
                <tr>
                  <td className="py-3 px-2 text-slate-400" colSpan={5}>
                    Sin datos
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>
        </ChartCard>

        <ChartCard title={`Riesgo de stockout (próx. ${horizon} días)`}>
          {sectionErrors.stockouts && (
            <div className="mb-2">
              <Alert kind="error" message={sectionErrors.stockouts} />
            </div>
          )}
          <DataTable
            headers={
              <thead className="text-left text-slate-400">
                <tr>
                  <th
                    className="py-2 px-2 cursor-pointer select-none"
                    onClick={() =>
                      toggleSort(stockoutSort, 'producto_nombre', setStockoutSort)
                    }
                  >
                    Producto
                  </th>
                  <th
                    className="py-2 px-2 cursor-pointer select-none"
                    onClick={() =>
                      toggleSort(stockoutSort, 'disponible', setStockoutSort)
                    }
                  >
                    Disponible
                  </th>
                  <th
                    className="py-2 px-2 cursor-pointer select-none"
                    onClick={() =>
                      toggleSort(stockoutSort, 'daily_avg', setStockoutSort)
                    }
                  >
                    Rotación diaria
                  </th>
                  <th
                    className="py-2 px-2 cursor-pointer select-none"
                    onClick={() =>
                      toggleSort(
                        stockoutSort,
                        'dias_hasta_quiebre',
                        setStockoutSort,
                      )
                    }
                  >
                    Días hasta quiebre
                  </th>
                  <th
                    className="py-2 px-2 cursor-pointer select-none"
                    onClick={() =>
                      toggleSort(
                        stockoutSort,
                        'sugerido_reponer',
                        setStockoutSort,
                      )
                    }
                  >
                    Sugerido reponer
                  </th>
                </tr>
              </thead>
            }
          >
            <tbody className="text-slate-200">
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-white/10">
                    <td className="py-2 px-2" colSpan={5}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))}
              {!loading &&
                sortedStockouts.map((r) => {
                  const atRisk = r.dias_hasta_quiebre < 5;
                  return (
                    <tr
                      key={r.producto_id}
                      className={
                        'border-t border-white/10 hover:bg-white/5 cursor-pointer ' +
                        (atRisk ? 'bg-rose-500/10 text-rose-100' : '')
                      }
                      onClick={() => openDetail(r.producto_id)}
                    >
                      <td className="py-2 px-2">{r.producto_nombre}</td>
                      <td className="py-2 px-2">{r.disponible}</td>
                      <td className="py-2 px-2">{r.daily_avg.toFixed(3)}</td>
                      <td className="py-2 px-2">{r.dias_hasta_quiebre}</td>
                      <td className="py-2 px-2">{r.sugerido_reponer}</td>
                    </tr>
                  );
                })}
              {!loading && stockouts.length === 0 && (
                <tr>
                  <td className="py-3 px-2 text-slate-400" colSpan={5}>
                    Sin riesgos detectados
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>
        </ChartCard>
      </div>

      <ChartCard title={`Anomalías en ventas (${history} días)`}>
        {sectionErrors.anomalias && (
          <div className="mb-2">
            <Alert kind="error" message={sectionErrors.anomalias} />
          </div>
        )}
        <DataTable
          headers={
            <thead className="text-left text-slate-400">
              <tr>
                <th
                  className="py-2 px-2 cursor-pointer select-none"
                  onClick={() => {
                    if (anomSortKey === 'dia') {
                      setAnomSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                    } else {
                      setAnomSortKey('dia');
                      setAnomSortDir('desc');
                    }
                  }}
                >
                  Fecha
                </th>
                <th className="py-2 px-2">Total</th>
                <th
                  className="py-2 px-2 cursor-pointer select-none"
                  onClick={() => {
                    if (anomSortKey === 'z') {
                      setAnomSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                    } else {
                      setAnomSortKey('z');
                      setAnomSortDir('desc');
                    }
                  }}
                >
                  Z-score
                </th>
                <th className="py-2 px-2">Tipo</th>
              </tr>
            </thead>
          }
        >
          <tbody className="text-slate-200">
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-t border-white/10">
                  <td className="py-2 px-2" colSpan={4}>
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))}
            {!loading &&
              sortedAnom.map((r, i) => (
                <tr key={i} className="border-t border-white/10 hover:bg-white/5">
                  <td className="py-2 px-2">
                    {new Date(r.dia).toLocaleDateString()}
                  </td>
                  <td className="py-2 px-2">
                    {'$' + r.total.toFixed(0)}
                  </td>
                  <td className="py-2 px-2">{r.z}</td>
                  <td className="py-2 px-2">{r.tipo}</td>
                </tr>
              ))}
            {!loading && anomSales.length === 0 && (
              <tr>
                <td className="py-3 px-2 text-slate-400" colSpan={4}>
                  Sin anomalías significativas
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </ChartCard>

      <ChartCard title="Precios sugeridos">
        {precioError && <Alert kind="error" message={precioError} />}
        {sectionErrors.precios && (
          <div className="mb-2">
            <Alert kind="error" message={sectionErrors.precios} />
          </div>
        )}
        <DataTable
          headers={
            <thead className="text-left text-slate-400">
              <tr>
                <th
                  className="py-2 px-2 cursor-pointer select-none"
                  onClick={() =>
                    toggleSort(precioSort, 'producto_nombre', setPrecioSort)
                  }
                >
                  Producto
                </th>
                <th
                  className="py-2 px-2 cursor-pointer select-none"
                  onClick={() =>
                    toggleSort(precioSort, 'precio_actual', setPrecioSort)
                  }
                >
                  Precio actual
                </th>
                <th
                  className="py-2 px-2 cursor-pointer select-none"
                  onClick={() =>
                    toggleSort(precioSort, 'precio_sugerido', setPrecioSort)
                  }
                >
                  Sugerido
                </th>
                <th
                  className="py-2 px-2 cursor-pointer select-none"
                  onClick={() =>
                    toggleSort(precioSort, 'diferencia', setPrecioSort)
                  }
                >
                  Diferencia
                </th>
                <th
                  className="py-2 px-2 cursor-pointer select-none"
                  onClick={() =>
                    toggleSort(precioSort, 'margen_estimado', setPrecioSort)
                  }
                >
                  Margen est.
                </th>
                <th
                  className="py-2 px-2 cursor-pointer select-none"
                  onClick={() =>
                    toggleSort(precioSort, 'rotacion_diaria', setPrecioSort)
                  }
                >
                  Rotación diaria
                </th>
                <th className="py-2 px-2">Acciones</th>
              </tr>
            </thead>
          }
        >
          <tbody className="text-slate-200">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-white/10">
                  <td className="py-2 px-2" colSpan={7}>
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))}
            {!loading &&
              sortedPrecios.map((r) => (
                <tr
                  key={r.producto_id}
                  className="border-t border-white/10 hover:bg-white/5"
                >
                  <td className="py-2 px-2">{r.producto_nombre}</td>
                  <td className="py-2 px-2">
                    {'$' + r.precio_actual.toFixed(2)}
                  </td>
                  <td className="py-2 px-2">
                    {'$' + r.precio_sugerido.toFixed(2)}
                  </td>
                  <td className="py-2 px-2">
                    {(r.diferencia > 0 ? '+$' : '-$') +
                      Math.abs(r.diferencia).toFixed(2)}
                  </td>
                  <td className="py-2 px-2">
                    {r.margen_estimado != null
                      ? (r.margen_estimado * 100).toFixed(1) + '%'
                      : '-'}
                  </td>
                  <td className="py-2 px-2">
                    {r.rotacion_diaria.toFixed(3)}
                  </td>
                  <td className="py-2 px-2">
                    <button
                      className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-xs"
                      onClick={() => editarPrecio(r)}
                    >
                      Editar precio
                    </button>
                  </td>
                </tr>
              ))}
            {!loading && precios.length === 0 && (
              <tr>
                <td className="py-3 px-2 text-slate-400" colSpan={7}>
                  Sin sugerencias de precio
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </ChartCard>

      {detailOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="bg-slate-900 rounded-2xl border border-white/10 shadow-xl w-full max-w-3xl max-h-[90vh] p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm text-slate-400">Detalle de demanda</div>
                <div className="text-base text-slate-100">
                  {detail?.producto_nombre || 'Cargando...'}
                </div>
              </div>
              <button
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-xs"
                onClick={() => {
                  setDetailOpen(false);
                  setDetail(null);
                }}
              >
                Cerrar
              </button>
            </div>
            {detailLoading && (
              <div className="flex-1 flex items-center justify-center">
                <Skeleton className="h-32 w-full" />
              </div>
            )}
            {!detailLoading && detailError && (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-sm text-rose-300">{detailError}</span>
              </div>
            )}
            {!detailLoading && !detailError && detail && (
              <div className="flex-1">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={detailChartData}>
                      <XAxis
                        dataKey="fecha"
                        stroke="#94a3b8"
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="historico"
                        stroke="#22d3ee"
                        fill="#22d3ee"
                        fillOpacity={0.2}
                        name="Histórico"
                      />
                      <Area
                        type="monotone"
                        dataKey="forecast"
                        stroke="#a855f7"
                        fill="#a855f7"
                        fillOpacity={0.15}
                        name="Pronóstico"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Basado en promedio diario de los últimos {history} días. El
                  pronóstico proyecta una demanda constante para los próximos{' '}
                  {horizon} días.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
