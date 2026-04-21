import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, AlertTriangle,
  Wallet, BarChart2, Target, BookOpen, ChevronDown, X, Settings, Activity,
} from 'lucide-react';
import { Api } from '../lib/api';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  Line,
} from 'recharts';
import Button from '../ui/Button';
import HelpTooltip from '../components/HelpTooltip';
import { useViewMode } from '../context/ViewModeContext';
import CobranzasTab from './finanzas/tabs/CobranzasTab';
import RepricingTab from './finanzas/tabs/RepricingTab';
import FiscalTab from './finanzas/tabs/FiscalTab';
import PresupuestosTab from './finanzas/tabs/PresupuestosTab';

type PeriodKey = '24h' | '7d' | '30d' | 'custom';
type TabKey =
  | 'costos'
  | 'bruta'
  | 'neta'
  | 'producto'
  | 'categorias'
  | 'clientes'
  | 'cobranzas'
  | 'alertas'
  | 'margenes'
  | 'repricing'
  | 'fiscal'
  | 'precios'
  | 'integraciones'
  | 'beta'
  | 'release'
  | 'ofertas'
  | 'cashflow'
  | 'presupuestos';

type FinanceTabGuide = {
  key: TabKey;
  label: string;
  queMide: string;
  comoLeer: string;
  accion: string;
};

// Tabs que se muestran siempre (vista principal)
const MAIN_TAB_KEYS: TabKey[] = ['neta', 'bruta', 'costos', 'producto', 'categorias', 'clientes', 'cobranzas', 'alertas', 'cashflow', 'presupuestos'];
// Tabs avanzados (solo para administradores y usuarios avanzados)
const ADVANCED_TAB_KEYS: TabKey[] = ['margenes', 'repricing', 'fiscal', 'precios', 'integraciones', 'beta', 'release', 'ofertas'];

const FINANCE_TAB_GUIDES: FinanceTabGuide[] = [
  {
    key: 'neta',
    label: '✅ Ganancia neta',
    queMide: 'Es el resultado final del negocio: lo que queda después de pagar los productos, los gastos del local y todas las inversiones del período.',
    comoLeer: 'Si es positiva, el negocio genera dinero. Si es negativa, se está gastando más de lo que entra — hay que actuar rápido. Si sube aunque vengas ganando menos, revisá los gastos.',
    accion: 'Si la ganancia neta cae, priorizá cobrar deudas pendientes y reducir gastos no urgentes.',
  },
  {
    key: 'bruta',
    label: '💰 Ganancia bruta',
    queMide: 'Es lo que queda de las ventas después de restar únicamente el costo de los productos vendidos. No incluye gastos del local ni sueldos.',
    comoLeer: 'Si vendés mucho pero la ganancia bruta es baja, el problema está en los precios o en los costos de compra. Un margen bruto saludable suele ser superior al 30%.',
    accion: 'Revisá los productos con menor margen y considerá subir el precio o negociar mejor con el proveedor.',
  },
  {
    key: 'costos',
    label: '📦 Costos de compra',
    queMide: 'Cuánto gastaste en comprar mercadería en el período seleccionado, artículo por artículo.',
    comoLeer: 'Si los costos suben sin que las ventas suban también, tu margen se está achicando. Comparalo con períodos anteriores para detectar aumentos de precios de proveedores.',
    accion: 'Identificá los artículos que más pesan en el costo total y negociá condiciones o volumen con el proveedor.',
  },
  {
    key: 'producto',
    label: '🛍 Por artículo',
    queMide: 'Qué ganás con cada artículo que vendés: cuánto ingresa, cuánto cuesta, qué ganancia queda y qué porcentaje de margen tiene.',
    comoLeer: 'Algunos artículos venden mucho pero dejan poco. Otros venden poco pero son muy rentables. Esto te ayuda a decidir qué impulsar y qué limitar.',
    accion: 'Enfocá las promociones en artículos con buen margen. Si un artículo muy vendido tiene margen bajo, subí el precio o reducí descuentos.',
  },
  {
    key: 'categorias',
    label: '📂 Por rubro',
    queMide: 'La rentabilidad agrupada por familia o categoría de productos: cuánto vende cada rubro y qué margen deja.',
    comoLeer: 'Te ayuda a ver qué rubros son el motor del negocio y cuáles son un lastre. Un rubro con ventas altas pero margen bajo puede estar dañando la rentabilidad general.',
    accion: 'Invertí en los rubros rentables. Si un rubro tiene margen muy bajo, evaluá si vale la pena seguir trabajándolo.',
  },
  {
    key: 'clientes',
    label: '👥 Por cliente',
    queMide: 'Cuánto aporta cada cliente al negocio: ingresos, costo de lo que le vendés, ganancia que genera y deuda que tiene pendiente.',
    comoLeer: 'Un cliente que compra mucho pero tiene deuda alta o márgenes bajos puede ser un riesgo. Los más valiosos son los que compran seguido, pagan en término y tienen buen margen.',
    accion: 'Con los clientes de peor margen, renegociá condiciones o reducí descuentos. Con los de mayor deuda, priorizá el cobro.',
  },
  {
    key: 'cobranzas',
    label: '📋 Cobranzas',
    queMide: 'El estado de las deudas de los clientes: quién debe, cuánto, hace cuántos días y si hay promesas de pago.',
    comoLeer: 'La columna más importante es "más de 90 días" — esa deuda es la más difícil de cobrar. Si crece, hay que actuar de inmediato. Los clientes en riesgo "crítico" necesitan gestión personal.',
    accion: 'Contactá primero a los clientes con mayor deuda y más días de atraso. Registrá las promesas de pago y hacé seguimiento.',
  },
  {
    key: 'alertas',
    label: '🔔 Alertas',
    queMide: 'Las situaciones de riesgo detectadas automáticamente: caja baja, deudas vencidas, stock en cero y otros problemas que necesitan atención.',
    comoLeer: 'Las alertas rojas ("críticas") son urgentes y pueden afectar la operación hoy. Las amarillas ("medias") son importantes pero no inmediatas. Las verdes son informativas.',
    accion: 'Resolvé primero las alertas críticas. Una vez solucionada la causa raíz, cerrá la alerta para mantener el panel limpio.',
  },
  {
    key: 'margenes',
    label: '📊 Márgenes',
    queMide: 'El margen de ganancia analizado por producto, por vendedor o por depósito — para ver qué parte del negocio rinde mejor.',
    comoLeer: 'Compará los márgenes entre vendedores o depósitos para detectar si alguien está vendiendo con descuentos excesivos o si hay problemas de costo en algún punto de venta.',
    accion: 'Si un vendedor tiene margen muy bajo, revisá si está aplicando demasiados descuentos. Si un depósito tiene mal margen, revisá los costos de operación.',
  },
  {
    key: 'repricing',
    label: '⚡ Ajuste de precios',
    queMide: 'Reglas automáticas que sugieren nuevos precios basándose en costos, márgenes objetivo y tipo de canal de venta.',
    comoLeer: 'Antes de aplicar un cambio masivo de precios, revisá el "precio sugerido" vs el "precio actual". Si la diferencia es muy grande, validá que el mercado aguante esa suba.',
    accion: 'Usá el "Preview" para ver el impacto antes de aplicar. Aplicá de a lotes pequeños y monitoreá cómo responden las ventas.',
  },
  {
    key: 'fiscal',
    label: '🏛 Retenciones e impuestos',
    queMide: 'Simulación de retenciones y percepciones impositivas (IIBB, IVA, etc.) según las reglas configuradas para cada tipo de operación.',
    comoLeer: 'Te permite estimar cuánto impuesto se aplicará antes de emitir un comprobante. Útil para verificar que las alícuotas estén correctamente configuradas.',
    accion: 'Si el resultado de la simulación no coincide con lo que esperabas, revisá las reglas de jurisdicción y alícuotas.',
  },
  {
    key: 'precios',
    label: '🏷 Listas de precios',
    queMide: 'Las listas de precios configuradas para diferentes canales (local, mayorista, final) con sus reglas de actualización.',
    comoLeer: 'Si una lista tiene variaciones grandes respecto a la anterior, verificá que los cambios de costo o tipo de cambio justifiquen esa diferencia.',
    accion: 'Aprobá solo los cambios que mantengan el margen mínimo por categoría. Evitá cambios masivos sin revisar el preview primero.',
  },
  {
    key: 'integraciones',
    label: '🔗 Canales de venta',
    queMide: 'El estado de la conexión con canales externos (MercadoLibre, Tienda Nube, WhatsApp) y los trabajos de sincronización de catálogo.',
    comoLeer: 'Si una integración aparece como "error" o hay trabajos fallidos repetidos, el catálogo puede estar desactualizado en ese canal.',
    accion: 'Verificá las credenciales del canal con error y reintentá la sincronización. Si el problema persiste, contactá soporte.',
  },
  {
    key: 'beta',
    label: '🧪 Clientes piloto',
    queMide: 'Seguimiento de empresas que están probando el sistema en etapa piloto: su estado, nivel de satisfacción (NPS) y feedback registrado.',
    comoLeer: 'Un NPS bajo (menor a 6) indica que el cliente no está satisfecho y puede abandonar el programa. El feedback de alto impacto tiene prioridad de resolución.',
    accion: 'Contactá a los clientes con NPS bajo para entender el problema. Registrá el feedback con impacto alto para que el equipo técnico lo priorice.',
  },
  {
    key: 'release',
    label: '🚀 Ciclos de mejora',
    queMide: 'Los ciclos mensuales de mejora del sistema: objetivos planificados, cambios realizados y si cada ciclo cumplió sus metas.',
    comoLeer: 'Si un ciclo se cierra sin evidencia de impacto en los KPIs, hubo trabajo técnico que no generó valor de negocio.',
    accion: 'Cerrá un ciclo solo cuando tengas evidencia de que los cambios mejoraron algún indicador clave.',
  },
  {
    key: 'ofertas',
    label: '🎁 Ofertas',
    queMide: 'El desempeño de las ofertas activas: cuánto volumen generan y si el descuento aplicado mantiene la rentabilidad.',
    comoLeer: 'Una oferta con descuento alto pero sin aumento de volumen está destruyendo margen sin beneficio. Lo ideal es que cada oferta genere más unidades vendidas.',
    accion: 'Pausá las ofertas que no generan más ventas. Mantené solo las que tienen un aumento real de volumen que compense el descuento.',
  },
  {
    key: 'cashflow',
    label: '💵 Flujo de caja',
    queMide: 'Cuánto dinero entró y salió cada día, y cómo quedó el saldo acumulado. Es la "respiración" financiera del negocio.',
    comoLeer: 'Si el saldo acumulado baja varios días seguidos, hay tensión de caja — no alcanza para cubrir los pagos. Un saldo negativo es una emergencia.',
    accion: 'Si el saldo cae, acelerá los cobros pendientes y postergá pagos no urgentes a proveedores.',
  },
  {
    key: 'presupuestos',
    label: '🎯 Presupuesto vs real',
    queMide: 'La comparación entre lo que planificaste ganar/gastar y lo que realmente ocurrió en el mes.',
    comoLeer: 'Si las ventas reales están por debajo del presupuesto, algo falló en la ejecución comercial. Si los gastos superan el presupuesto, hay un problema de control de costos.',
    accion: 'Ajustá el presupuesto del mes siguiente según los desvíos detectados y asigná un responsable para cada categoría.',
  },
];

type SerieGananciaNeta = {
  fecha: string;
  totalVentas: number;
  totalCostoProductos: number;
  totalGastos: number;
  totalInversiones: number;
  gananciaBruta: number;
  gananciaNeta: number;
};

type SerieGananciaBruta = {
  fecha: string;
  totalVentas: number;
  totalCostoProductos: number;
  gananciaBruta: number;
};

type DetalleGananciaPorProducto = {
  productoId: number;
  productoCodigo: string;
  productoNombre: string;
  unidadesVendidas: number;
  ingresos: number;
  costoTotal: number;
  gananciaBruta: number;
  margenPorcentaje: number | null;
};

type DetalleCostosProducto = {
  productoId: number;
  productoCodigo: string;
  productoNombre: string;
  moneda: string;
  cantidad: number;
  totalCostos: number;
};

type DetalleRentabilidadCategoria = {
  categoriaId: number | null;
  categoriaNombre: string;
  unidadesVendidas: number;
  ingresos: number;
  costoTotal: number;
  gananciaBruta: number;
  margenPorcentaje: number | null;
};

type DetalleRentabilidadCliente = {
  clienteId: number;
  clienteNombre: string;
  clienteApellido: string;
  unidadesVendidas: number;
  ingresos: number;
  costoTotal: number;
  gananciaBruta: number;
  margenPorcentaje: number | null;
  deuda: number;
};

type DeudaClienteResumen = {
  clienteId: number;
  clienteNombre: string;
  clienteApellido: string;
  deudaTotal: number;
  deuda0_30: number;
  deuda31_60: number;
  deuda61_90: number;
  deudaMas90: number;
  diasPromedioAtraso: number | null;
};

type VentaPendiente = {
  ventaId: number;
  fecha: string;
  neto: number;
  totalPagado: number;
  saldo: number;
  dias: number;
};

type DeudaProveedorResumen = {
  proveedorId: number;
  proveedorNombre: string;
  deudaTotal: number;
  deuda0_30: number;
  deuda31_60: number;
  deuda61_90: number;
  deudaMas90: number;
  diasPromedioAtraso: number | null;
};

type PuntoCashflow = {
  fecha: string;
  entradas: number;
  salidas: number;
  saldoAcumulado: number;
};

type PresupuestoRow = {
  id?: number;
  anio: number;
  mes: number;
  tipo: string;
  categoria: string;
  monto: number;
};

type PresupuestoVsRealRow = {
  tipo: string;
  categoria: string;
  presupuesto: number;
  real: number;
  diferencia: number;
};

type PresupuestoTotales = {
  presupuestoVentas: number;
  realVentas: number;
  presupuestoGastos: number;
  realGastos: number;
};

type PresupuestoCategorias = {
  ventas: string[];
  gastos: string[];
};

type BrutaResumen = {
  totalVentas: number;
  totalCostoProductos: number;
  gananciaBruta: number;
  totalDescuentos: number;
  totalImpuestos: number;
};

type SimuladorResultado = {
  periodoDias: number;
  actual: {
    totalVentas: number;
    totalCosto: number;
    totalGastos: number;
    gananciaBruta: number;
    gananciaNeta: number;
  };
  simulado: {
    totalVentas: number;
    totalCosto: number;
    totalGastos: number;
    gananciaBruta: number;
    gananciaNeta: number;
  };
};

type OwnerCenterAlert = {
  alert_code: string;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  detail?: string;
  action_label?: string;
  action_path?: string;
};

type OwnerCommandCenter = {
  caja_actual: number;
  promedio_neto_diario: number;
  proyeccion_caja: Record<string, number>;
  deuda?: { total?: number; mas_90?: number };
  stock_breaks?: any[];
  alertas?: OwnerCenterAlert[];
};

type RiskRankingRow = {
  cliente_id: number;
  nombre?: string;
  apellido?: string;
  deuda_pendiente: number;
  deuda_mas_90: number;
  dias_promedio_atraso: number;
  score: number;
  bucket: 'critical' | 'high' | 'medium' | 'low';
};

type PromiseRow = {
  id: number;
  cliente_id: number;
  nombre?: string;
  apellido?: string;
  monto_prometido: number;
  fecha_promesa: string;
  estado: 'pendiente' | 'cumplida' | 'incumplida' | 'cancelada';
  canal_preferido?: string;
  notas?: string;
};

type ReminderRow = {
  id: number;
  cliente_id: number;
  nombre?: string;
  apellido?: string;
  canal: string;
  destino?: string;
  template_code?: string;
  scheduled_at?: string;
  sent_at?: string;
  status: 'pending' | 'sent' | 'error';
  error_message?: string;
};

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
  resolved_at?: string;
};

type MarginRow = {
  entity_id: number;
  entity_name: string;
  ingresos: number;
  costo: number;
  margen: number;
  margen_pct: number;
};

type RepricingRuleRow = {
  id: number;
  nombre: string;
  scope: 'global' | 'categoria' | 'proveedor' | 'producto';
  scope_ref_id?: number | null;
  channel?: 'local' | 'distribuidor' | 'final' | null;
  margin_min: number;
  margin_target: number;
  usd_pass_through: number;
  rounding_step: number;
  prioridad: number;
  status: 'active' | 'inactive';
};

type RepricingPreviewRow = {
  producto_id: number;
  producto: string;
  regla_nombre?: string;
  costo_ars?: number;
  precio_actual?: {
    venta?: number;
    local?: number;
    distribuidor?: number;
    final?: number;
  };
  precio_sugerido?: {
    venta?: number;
    local?: number;
    distribuidor?: number;
    final?: number;
  };
};

type FiscalRuleRow = {
  id: number;
  tipo: 'retencion' | 'percepcion';
  nombre: string;
  impuesto?: string;
  jurisdiccion?: string;
  scope: 'global' | 'cliente' | 'proveedor' | 'producto';
  scope_ref_id?: number | null;
  alicuota: number;
  monto_minimo: number;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
  activo: number;
  prioridad: number;
};

type FiscalSimulationResult = {
  monto_base: number;
  total_fiscal: number;
  detalle: Array<{
    rule_id: number;
    nombre: string;
    tipo: string;
    alicuota: number;
    monto: number;
  }>;
};

type PriceListRow = {
  id: number;
  nombre: string;
  moneda_base: string;
  canal?: string | null;
  estrategia_actualizacion: 'manual' | 'usd' | 'ipc' | 'proveedor' | 'mixta';
  activo: number;
};

type PriceListRuleRow = {
  id: number;
  price_list_id: number;
  tipo_regla: 'usd' | 'ipc' | 'proveedor' | 'canal' | 'markup_fijo' | 'markup_pct';
  prioridad: number;
  parametros?: Record<string, any>;
  activo: number;
};

type PriceListPreviewRow = {
  producto_id: number;
  producto: string;
  precio_actual: number;
  precio_lista: number;
  variacion_pct: number;
};

type ChannelIntegrationRow = {
  id: number;
  canal: 'mercadolibre' | 'tiendanube' | 'whatsapp_catalog';
  estado: 'disconnected' | 'connected' | 'error';
  config?: Record<string, any>;
  secret_ref?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
};

type ChannelJobRow = {
  id: number;
  canal: string;
  job_type: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  attempts: number;
  scheduled_at?: string;
  started_at?: string;
  finished_at?: string;
  error_message?: string | null;
};

type BetaCompanyRow = {
  id: number;
  nombre: string;
  cuit?: string | null;
  segmento?: string | null;
  tamano_equipo?: number | null;
  estado: 'invited' | 'active' | 'paused' | 'churned';
  onboarded_at?: string | null;
  last_feedback_at?: string | null;
  nps_score?: number | null;
};

type BetaMetrics = {
  companies?: {
    total_companies?: number;
    active_companies?: number;
    avg_nps?: number;
  };
  feedback?: {
    total_feedback?: number;
    avg_impact?: number;
  };
};

type ReleaseCycleRow = {
  id: number;
  codigo: string;
  mes: string;
  estado: 'open' | 'closed';
  objetivos?: Record<string, any>;
  changelog_resumen?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
};

type MarketplaceAlianzaLite = {
  id: number;
  nombre?: string | null;
  pyme_nombre?: string | null;
  estado?: string | null;
};

type MarketplaceOfferLite = {
  id: number;
  alianza_id: number;
  nombre: string;
  descripcion?: string | null;
  precio_fijo?: number | null;
  activo: boolean | number;
};

function toLocalDateString(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function computeRange(period: PeriodKey, desde: string, hasta: string): { desde: string; hasta: string } | null {
  const now = new Date();
  const todayStr = toLocalDateString(now);

  if (period === '24h') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return { desde: toLocalDateString(d), hasta: todayStr };
  }
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
  if (!desde || !hasta) return null;
  return { desde, hasta };
}

const PIE_COLORS = ['#22c55e', '#0ea5e9', '#a855f7', '#f97316', '#eab308', '#14b8a6', '#ef4444', '#64748b'];

type PieDatum = { name: string; value: number };

function buildPieData<T>(
  items: T[],
  limit: number,
  getValue: (item: T) => number,
  getLabel: (item: T) => string
): PieDatum[] {
  const normalized = items
    .map((item) => ({
      name: getLabel(item),
      value: Number(getValue(item) || 0),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  if (!normalized.length || limit <= 0) return [];

  const top = normalized.slice(0, limit);
  const resto = normalized.slice(limit);
  const restoTotal = resto.reduce((acc, item) => acc + item.value, 0);

  if (restoTotal > 0) {
    top.push({ name: 'Otros', value: restoTotal });
  }

  return top;
}

function buildBudgetPie(presupuesto: number, real: number): PieDatum[] {
  if (presupuesto <= 0) return [];
  const realCap = Math.min(real, presupuesto);
  const restante = Math.max(presupuesto - real, 0);
  return [
    { name: 'Real', value: realCap },
    { name: 'Restante', value: restante },
  ];
}

function normalizePresupuestoTipo(tipo: string): 'ventas' | 'gastos' {
  const raw = (tipo || '').toLowerCase();
  if (['venta', 'ventas', 'ingreso', 'ingresos'].includes(raw)) return 'ventas';
  if (['gasto', 'gastos', 'egreso', 'egresos'].includes(raw)) return 'gastos';
  return 'gastos';
}

function ownerSeverityLabel(severity?: string) {
  if (severity === 'critical') return 'Critica';
  if (severity === 'warn') return 'Media';
  return 'Baja';
}

function ownerSeverityClass(severity?: string) {
  if (severity === 'critical') return 'bg-rose-500/20 border-rose-500/40 text-rose-200';
  if (severity === 'warn') return 'bg-amber-500/20 border-amber-500/40 text-amber-200';
  return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200';
}

function riskBucketLabel(bucket?: string) {
  if (bucket === 'critical') return 'Critico';
  if (bucket === 'high') return 'Alto';
  if (bucket === 'medium') return 'Medio';
  return 'Bajo';
}

function riskBucketClass(bucket?: string) {
  if (bucket === 'critical') return 'bg-rose-500/20 border-rose-500/40 text-rose-200';
  if (bucket === 'high') return 'bg-orange-500/20 border-orange-500/40 text-orange-200';
  if (bucket === 'medium') return 'bg-amber-500/20 border-amber-500/40 text-amber-200';
  return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200';
}

function marginClass(margenPct: number) {
  if (margenPct >= 25) return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200';
  if (margenPct >= 10) return 'bg-amber-500/20 border-amber-500/40 text-amber-200';
  return 'bg-rose-500/20 border-rose-500/40 text-rose-200';
}

export default function Finanzas() {
  const { isSimpleView } = useViewMode();
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [customDesde, setCustomDesde] = useState<string>('');
  const [customHasta, setCustomHasta] = useState<string>('');
  const [tab, setTab] = useState<TabKey>('neta');
  const [showFinanceGuide, setShowFinanceGuide] = useState(false);

  const [showAdvancedTabs, setShowAdvancedTabs] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);

  const [serieNeta, setSerieNeta] = useState<SerieGananciaNeta[]>([]);
  const [serieBruta, setSerieBruta] = useState<SerieGananciaBruta[]>([]);
  const [brutaResumen, setBrutaResumen] = useState<BrutaResumen>({
    totalVentas: 0,
    totalCostoProductos: 0,
    gananciaBruta: 0,
    totalDescuentos: 0,
    totalImpuestos: 0,
  });
  const [productosRentables, setProductosRentables] = useState<DetalleGananciaPorProducto[]>([]);
  const [costosProductos, setCostosProductos] = useState<DetalleCostosProducto[]>([]);
  const [rentabilidadCategorias, setRentabilidadCategorias] = useState<DetalleRentabilidadCategoria[]>([]);
  const [rentabilidadClientes, setRentabilidadClientes] = useState<DetalleRentabilidadCliente[]>([]);
  const [deudasClientesResumen, setDeudasClientesResumen] = useState<DeudaClienteResumen[]>([]);
  const [clienteDeudaSeleccionado, setClienteDeudaSeleccionado] = useState<number | null>(null);
  const [ventasPendientesCliente, setVentasPendientesCliente] = useState<VentaPendiente[]>([]);
  const [deudasProveedoresResumen, setDeudasProveedoresResumen] = useState<DeudaProveedorResumen[]>([]);
  const [diasPromedioPagoProveedores, setDiasPromedioPagoProveedores] = useState<number | null>(null);
  const [cashflowSerie, setCashflowSerie] = useState<PuntoCashflow[]>([]);
  const [saldoInicial, setSaldoInicial] = useState<number>(0);
  const [saldoMinimo, setSaldoMinimo] = useState<number>(0);
  const [saldoMaximo, setSaldoMaximo] = useState<number>(0);
  const [diasPorDebajoUmbral, setDiasPorDebajoUmbral] = useState<number>(0);
  const [umbralMinimo, setUmbralMinimo] = useState<number>(0);

  const now = new Date();
  const [presupuestoAnio, setPresupuestoAnio] = useState<number>(now.getFullYear());
  const [presupuestoMes, setPresupuestoMes] = useState<number>(now.getMonth() + 1);
  const [presupuestosMes, setPresupuestosMes] = useState<PresupuestoRow[]>([]);
  const [presupuestoVsRealRows, setPresupuestoVsRealRows] = useState<PresupuestoVsRealRow[]>([]);
  const [presupuestoTotales, setPresupuestoTotales] = useState<PresupuestoTotales>({
    presupuestoVentas: 0,
    realVentas: 0,
    presupuestoGastos: 0,
    realGastos: 0,
  });
  const [presupuestoCategorias, setPresupuestoCategorias] = useState<PresupuestoCategorias>({
    ventas: [],
    gastos: [],
  });
  const [presupuestoForm, setPresupuestoForm] = useState({
    id: undefined as number | undefined,
    tipo: 'ventas' as 'ventas' | 'gastos',
    categoria: '',
    monto: '',
  });
  const [presupuestoGuardando, setPresupuestoGuardando] = useState(false);
  const [presupuestoError, setPresupuestoError] = useState<string | null>(null);
  const [presupuestoOk, setPresupuestoOk] = useState<string | null>(null);
  const [simuladorForm, setSimuladorForm] = useState({
    aumentoPrecios: 0,
    aumentoCostos: 0,
    aumentoGastos: 0,
  });
  const [simuladorResultado, setSimuladorResultado] = useState<SimuladorResultado | null>(null);
  const [ownerCenter, setOwnerCenter] = useState<OwnerCommandCenter | null>(null);
  const [ownerCenterLoading, setOwnerCenterLoading] = useState(false);
  const [ownerCenterError, setOwnerCenterError] = useState<string | null>(null);
  const [riskRankingRows, setRiskRankingRows] = useState<RiskRankingRow[]>([]);
  const [riskBucketFilter, setRiskBucketFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [promiseRows, setPromiseRows] = useState<PromiseRow[]>([]);
  const [promiseStatusFilter, setPromiseStatusFilter] = useState<'all' | 'pendiente' | 'cumplida' | 'incumplida' | 'cancelada'>('all');
  const [reminderRows, setReminderRows] = useState<ReminderRow[]>([]);
  const [reminderStatusFilter, setReminderStatusFilter] = useState<'all' | 'pending' | 'sent' | 'error'>('all');
  const [cobranzasLoading, setCobranzasLoading] = useState(false);
  const [cobranzasError, setCobranzasError] = useState<string | null>(null);
  const [autoReminderLimit, setAutoReminderLimit] = useState<number>(30);
  const [autoReminderMsg, setAutoReminderMsg] = useState<string | null>(null);
  const [promiseUpdatingId, setPromiseUpdatingId] = useState<number | null>(null);

  const [ownerAlertsRows, setOwnerAlertsRows] = useState<OwnerAlertRow[]>([]);
  const [alertsStatusFilter, setAlertsStatusFilter] = useState<'open' | 'dismissed'>('open');
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [dismissingAlertId, setDismissingAlertId] = useState<number | null>(null);

  const [marginDimension, setMarginDimension] = useState<'producto' | 'vendedor' | 'deposito'>('producto');
  const [marginRows, setMarginRows] = useState<MarginRow[]>([]);
  const [marginsLimit, setMarginsLimit] = useState<number>(50);
  const [marginsLoading, setMarginsLoading] = useState(false);
  const [marginsError, setMarginsError] = useState<string | null>(null);

  const [repricingRules, setRepricingRules] = useState<RepricingRuleRow[]>([]);
  const [repricingRulesLoading, setRepricingRulesLoading] = useState(false);
  const [repricingRulesError, setRepricingRulesError] = useState<string | null>(null);
  const [repricingPreviewRows, setRepricingPreviewRows] = useState<RepricingPreviewRow[]>([]);
  const [repricingPreviewLoading, setRepricingPreviewLoading] = useState(false);
  const [repricingPreviewError, setRepricingPreviewError] = useState<string | null>(null);
  const [repricingApplyMsg, setRepricingApplyMsg] = useState<string | null>(null);
  const [repricingLimit, setRepricingLimit] = useState<number>(120);
  const [repricingProductIds, setRepricingProductIds] = useState<string>('');
  const [repricingSaving, setRepricingSaving] = useState(false);
  const [repricingForm, setRepricingForm] = useState({
    nombre: '',
    scope: 'global' as 'global' | 'categoria' | 'proveedor' | 'producto',
    scope_ref_id: '',
    channel: '' as '' | 'local' | 'distribuidor' | 'final',
    margin_min: '0.15',
    margin_target: '0.30',
    usd_pass_through: '1',
    rounding_step: '1',
    prioridad: '100',
    status: 'active' as 'active' | 'inactive',
  });

  const [fiscalRules, setFiscalRules] = useState<FiscalRuleRow[]>([]);
  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [fiscalError, setFiscalError] = useState<string | null>(null);
  const [fiscalSuccess, setFiscalSuccess] = useState<string | null>(null);
  const [fiscalSaving, setFiscalSaving] = useState(false);
  const [fiscalForm, setFiscalForm] = useState({
    tipo: 'retencion' as 'retencion' | 'percepcion',
    nombre: '',
    impuesto: 'iibb',
    jurisdiccion: 'nacional',
    scope: 'global' as 'global' | 'cliente' | 'proveedor' | 'producto',
    scope_ref_id: '',
    alicuota: '3',
    monto_minimo: '0',
    vigencia_desde: '',
    vigencia_hasta: '',
    prioridad: '100',
    activo: true,
  });
  const [fiscalSimForm, setFiscalSimForm] = useState({
    monto: '',
    fecha: '',
    cliente_id: '',
    proveedor_id: '',
    producto_id: '',
  });
  const [fiscalSimLoading, setFiscalSimLoading] = useState(false);
  const [fiscalSimError, setFiscalSimError] = useState<string | null>(null);
  const [fiscalSimResult, setFiscalSimResult] = useState<FiscalSimulationResult | null>(null);

  const [priceLists, setPriceLists] = useState<PriceListRow[]>([]);
  const [selectedPriceListId, setSelectedPriceListId] = useState<number | null>(null);
  const [priceListRules, setPriceListRules] = useState<PriceListRuleRow[]>([]);
  const [priceListPreviewRows, setPriceListPreviewRows] = useState<PriceListPreviewRow[]>([]);
  const [priceListLoading, setPriceListLoading] = useState(false);
  const [priceListError, setPriceListError] = useState<string | null>(null);
  const [priceListMsg, setPriceListMsg] = useState<string | null>(null);
  const [priceListPreviewLoading, setPriceListPreviewLoading] = useState(false);
  const [priceListPreviewLimit, setPriceListPreviewLimit] = useState<number>(120);
  const [priceListForm, setPriceListForm] = useState({
    nombre: '',
    moneda_base: 'ARS',
    canal: '',
    estrategia_actualizacion: 'manual' as 'manual' | 'usd' | 'ipc' | 'proveedor' | 'mixta',
    activo: true,
  });
  const [priceRuleForm, setPriceRuleForm] = useState({
    tipo_regla: 'markup_pct' as 'usd' | 'ipc' | 'proveedor' | 'canal' | 'markup_fijo' | 'markup_pct',
    prioridad: '100',
    valor: '0',
    activo: true,
  });

  const [integrations, setIntegrations] = useState<ChannelIntegrationRow[]>([]);
  const [integrationJobs, setIntegrationJobs] = useState<ChannelJobRow[]>([]);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [integrationMsg, setIntegrationMsg] = useState<string | null>(null);
  const [integrationJobStatus, setIntegrationJobStatus] = useState<'all' | 'pending' | 'running' | 'done' | 'failed'>('all');
  const [integrationForm, setIntegrationForm] = useState({
    canal: 'mercadolibre' as 'mercadolibre' | 'tiendanube' | 'whatsapp_catalog',
    estado: 'connected' as 'disconnected' | 'connected' | 'error',
    secret_ref: '',
    config_json: '{}',
    job_type: 'catalog_sync',
  });

  const [betaCompanies, setBetaCompanies] = useState<BetaCompanyRow[]>([]);
  const [betaMetrics, setBetaMetrics] = useState<BetaMetrics | null>(null);
  const [betaLoading, setBetaLoading] = useState(false);
  const [betaError, setBetaError] = useState<string | null>(null);
  const [betaMsg, setBetaMsg] = useState<string | null>(null);
  const [betaCompanyForm, setBetaCompanyForm] = useState({
    nombre: '',
    cuit: '',
    segmento: '',
    tamano_equipo: '',
    estado: 'invited' as 'invited' | 'active' | 'paused' | 'churned',
    nps_score: '',
  });
  const [betaFeedbackForm, setBetaFeedbackForm] = useState({
    company_id: '',
    modulo: '',
    impacto_score: '3',
    comentario: '',
  });

  const [releaseCycles, setReleaseCycles] = useState<ReleaseCycleRow[]>([]);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releaseMsg, setReleaseMsg] = useState<string | null>(null);
  const [releaseForm, setReleaseForm] = useState({
    codigo: '',
    mes: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    objetivos_json: '{}',
  });
  const [releaseEntryForm, setReleaseEntryForm] = useState({
    cycle_id: '',
    categoria: '',
    titulo: '',
    impacto_negocio: '',
    kpi_target: '',
  });
  const [releaseCloseForm, setReleaseCloseForm] = useState({
    cycle_id: '',
    changelog_resumen: '',
  });

  const [offerAlianzas, setOfferAlianzas] = useState<MarketplaceAlianzaLite[]>([]);
  const [offerSelectedAlianzaId, setOfferSelectedAlianzaId] = useState<number | null>(null);
  const [offerRows, setOfferRows] = useState<MarketplaceOfferLite[]>([]);
  const [offerLoading, setOfferLoading] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerMsg, setOfferMsg] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState({
    nombre: '',
    descripcion: '',
    precio_fijo: '',
  });

  const range = useMemo(() => computeRange(period, customDesde, customHasta), [period, customDesde, customHasta]);

  async function handleDebug() {
    setDebugError(null);
    if (!range) {
      setDebugError('Definí un rango de fechas para diagnosticar.');
      return;
    }
    setDebugLoading(true);
    try {
      const data = await Api.finanzasDebug({ desde: range.desde, hasta: range.hasta });
      setDebugInfo(data);
    } catch (e) {
      setDebugError(e instanceof Error ? e.message : 'No se pudo obtener el debug');
    } finally {
      setDebugLoading(false);
    }
  }

  async function loadPresupuestos(anio: number, mes: number) {
    try {
      const [presRes, vsRealRes] = await Promise.all([
        Api.presupuestos({ anio, mes }).catch(() => []),
        Api.presupuestoVsReal({ anio, mes }).catch(() => ({ items: [], totales: {} })),
      ]);

      setPresupuestosMes(
        (presRes as any[]).map((p) => ({
          id: p.id,
          anio: Number(p.anio || anio),
          mes: Number(p.mes || mes),
          tipo: normalizePresupuestoTipo(p.tipo),
          categoria: p.categoria,
          monto: Number(p.monto || 0),
        }))
      );

      setPresupuestoVsRealRows(
        ((vsRealRes as any)?.items || []).map((r: any) => ({
          tipo: r.tipo,
          categoria: r.categoria,
          presupuesto: Number(r.presupuesto || 0),
          real: Number(r.real || 0),
          diferencia: Number(r.diferencia || 0),
        }))
      );

      const totales = (vsRealRes as any)?.totales || {};
      setPresupuestoTotales({
        presupuestoVentas: Number(totales.presupuestoVentas || 0),
        realVentas: Number(totales.realVentas || 0),
        presupuestoGastos: Number(totales.presupuestoGastos || 0),
        realGastos: Number(totales.realGastos || 0),
      });
    } catch {
      setPresupuestosMes([]);
      setPresupuestoVsRealRows([]);
      setPresupuestoTotales({
        presupuestoVentas: 0,
        realVentas: 0,
        presupuestoGastos: 0,
        realGastos: 0,
      });
    }
  }

  async function loadOwnerCenter(showError = false) {
    setOwnerCenterLoading(true);
    if (!showError) setOwnerCenterError(null);
    try {
      const data = await Api.ownerCommandCenter({ persist_alerts: false, horizons: '7,30,90' });
      const safeAlerts = Array.isArray(data?.alertas)
        ? data.alertas
            .filter((a: any) => a && typeof a === 'object')
            .map((a: any) => ({
              alert_code: String(a.alert_code || 'alerta'),
              severity: String(a.severity || 'info'),
              title: String(a.title || 'Alerta'),
              detail: a.detail ? String(a.detail) : null,
              action_label: a.action_label ? String(a.action_label) : null,
              action_path: a.action_path ? String(a.action_path) : null,
            }))
        : [];
      setOwnerCenter({
        caja_actual: Number(data?.caja_actual || 0),
        promedio_neto_diario: Number(data?.promedio_neto_diario || 0),
        proyeccion_caja: (data?.proyeccion_caja || {}) as Record<string, number>,
        deuda: data?.deuda || { total: 0, mas_90: 0 },
        stock_breaks: Array.isArray(data?.stock_breaks) ? data.stock_breaks : [],
        alertas: safeAlerts,
      });
    } catch (e) {
      if (showError) {
        setOwnerCenterError(e instanceof Error ? e.message : 'No se pudo cargar centro de mando');
      }
      setOwnerCenter(null);
    } finally {
      setOwnerCenterLoading(false);
    }
  }

  function parseIds(raw: string): number[] {
    return String(raw || '')
      .split(',')
      .map((x) => Number(String(x).trim()))
      .filter((x) => Number.isInteger(x) && x > 0);
  }

  function parseJsonSafe(raw: string, fallback: Record<string, any> = {}) {
    try {
      const out = JSON.parse(raw || '{}');
      return out && typeof out === 'object' ? out : fallback;
    } catch {
      return fallback;
    }
  }

  async function loadCobranzas(showError = false) {
    setCobranzasLoading(true);
    if (!showError) setCobranzasError(null);
    setAutoReminderMsg(null);
    try {
      const [ranking, promises, reminders] = await Promise.all([
        Api.ownerRiskRanking({ limit: 500, persist: false }),
        Api.ownerPromises({
          estado: promiseStatusFilter === 'all' ? undefined : promiseStatusFilter,
          limit: 250,
        }),
        Api.ownerReminders({
          status: reminderStatusFilter === 'all' ? undefined : reminderStatusFilter,
          limit: 250,
        }),
      ]);

      const safeRanking = Array.isArray(ranking)
        ? ranking.map((r: any) => ({
            cliente_id: Number(r.cliente_id || 0),
            nombre: r.nombre ? String(r.nombre) : '',
            apellido: r.apellido ? String(r.apellido) : '',
            deuda_pendiente: Number(r.deuda_pendiente || 0),
            deuda_mas_90: Number(r.deuda_mas_90 || 0),
            dias_promedio_atraso: Number(r.dias_promedio_atraso || 0),
            score: Number(r.score || 0),
            bucket: String(r.bucket || 'low') as RiskRankingRow['bucket'],
          }))
        : [];
      setRiskRankingRows(safeRanking);

      const safePromises = Array.isArray(promises)
        ? promises.map((p: any) => ({
            id: Number(p.id || 0),
            cliente_id: Number(p.cliente_id || 0),
            nombre: p.nombre ? String(p.nombre) : '',
            apellido: p.apellido ? String(p.apellido) : '',
            monto_prometido: Number(p.monto_prometido || 0),
            fecha_promesa: String(p.fecha_promesa || ''),
            estado: String(p.estado || 'pendiente') as PromiseRow['estado'],
            canal_preferido: p.canal_preferido ? String(p.canal_preferido) : '',
            notas: p.notas ? String(p.notas) : '',
          }))
        : [];
      setPromiseRows(safePromises);

      const safeReminders = Array.isArray(reminders)
        ? reminders.map((r: any) => ({
            id: Number(r.id || 0),
            cliente_id: Number(r.cliente_id || 0),
            nombre: r.nombre ? String(r.nombre) : '',
            apellido: r.apellido ? String(r.apellido) : '',
            canal: String(r.canal || 'manual'),
            destino: r.destino ? String(r.destino) : '',
            template_code: r.template_code ? String(r.template_code) : '',
            scheduled_at: r.scheduled_at ? String(r.scheduled_at) : '',
            sent_at: r.sent_at ? String(r.sent_at) : '',
            status: String(r.status || 'pending') as ReminderRow['status'],
            error_message: r.error_message ? String(r.error_message) : '',
          }))
        : [];
      setReminderRows(safeReminders);
    } catch (e) {
      if (showError) {
        setCobranzasError(e instanceof Error ? e.message : 'No se pudo cargar cobranzas');
      }
      setRiskRankingRows([]);
      setPromiseRows([]);
      setReminderRows([]);
    } finally {
      setCobranzasLoading(false);
    }
  }

  async function handleAutoReminders() {
    setAutoReminderMsg(null);
    setCobranzasError(null);
    try {
      const out = await Api.ownerAutoReminders({ limit: Math.max(1, Number(autoReminderLimit) || 1) });
      setAutoReminderMsg(`Recordatorios creados: ${Number(out?.created || 0)}`);
      await loadCobranzas(false);
    } catch (e) {
      setCobranzasError(e instanceof Error ? e.message : 'No se pudieron generar recordatorios');
    }
  }

  async function handlePromiseStatusChange(id: number, estado: PromiseRow['estado']) {
    setPromiseUpdatingId(id);
    setCobranzasError(null);
    try {
      await Api.ownerUpdatePromiseStatus(id, { estado });
      await loadCobranzas(false);
    } catch (e) {
      setCobranzasError(e instanceof Error ? e.message : 'No se pudo actualizar estado de promesa');
    } finally {
      setPromiseUpdatingId(null);
    }
  }

  async function loadOwnerAlerts(showError = false) {
    setAlertsLoading(true);
    if (!showError) setAlertsError(null);
    try {
      const rows = await Api.ownerAlerts({ status: alertsStatusFilter, limit: 250 });
      const safeRows = Array.isArray(rows)
        ? rows.map((a: any) => ({
            id: Number(a.id || 0),
            alert_code: String(a.alert_code || ''),
            severity: String(a.severity || 'info') as OwnerAlertRow['severity'],
            title: String(a.title || 'Alerta'),
            detail: a.detail ? String(a.detail) : '',
            action_label: a.action_label ? String(a.action_label) : '',
            action_path: a.action_path ? String(a.action_path) : '',
            status: String(a.status || 'open') as OwnerAlertRow['status'],
            detected_at: a.detected_at ? String(a.detected_at) : '',
            resolved_at: a.resolved_at ? String(a.resolved_at) : '',
          }))
        : [];
      setOwnerAlertsRows(safeRows);
    } catch (e) {
      if (showError) {
        setAlertsError(e instanceof Error ? e.message : 'No se pudieron cargar alertas');
      }
      setOwnerAlertsRows([]);
    } finally {
      setAlertsLoading(false);
    }
  }

  async function handleDismissAlert(id: number) {
    setDismissingAlertId(id);
    setAlertsError(null);
    try {
      await Api.ownerDismissAlert(id);
      await loadOwnerAlerts(false);
    } catch (e) {
      setAlertsError(e instanceof Error ? e.message : 'No se pudo descartar la alerta');
    } finally {
      setDismissingAlertId(null);
    }
  }

  async function loadMargins(showError = false) {
    setMarginsLoading(true);
    if (!showError) setMarginsError(null);
    try {
      const data = await Api.ownerMarginsRealtime({
        dimension: marginDimension,
        desde: range?.desde,
        hasta: range?.hasta,
        limit: Math.max(1, Number(marginsLimit) || 1),
      });
      const rows = Array.isArray(data)
        ? data.map((r: any) => ({
            entity_id: Number(r.entity_id || 0),
            entity_name: String(r.entity_name || 'N/A'),
            ingresos: Number(r.ingresos || 0),
            costo: Number(r.costo || 0),
            margen: Number(r.margen || 0),
            margen_pct: Number(r.margen_pct || 0),
          }))
        : [];
      setMarginRows(rows);
    } catch (e) {
      if (showError) {
        setMarginsError(e instanceof Error ? e.message : 'No se pudo cargar margenes');
      }
      setMarginRows([]);
    } finally {
      setMarginsLoading(false);
    }
  }

  async function loadRepricingRules(showError = false) {
    setRepricingRulesLoading(true);
    if (!showError) setRepricingRulesError(null);
    try {
      const rows = await Api.ownerRepricingRules();
      const safeRows = Array.isArray(rows)
        ? rows.map((r: any) => ({
            id: Number(r.id || 0),
            nombre: String(r.nombre || ''),
            scope: String(r.scope || 'global') as RepricingRuleRow['scope'],
            scope_ref_id: r.scope_ref_id == null ? null : Number(r.scope_ref_id),
            channel: r.channel ? (String(r.channel) as RepricingRuleRow['channel']) : null,
            margin_min: Number(r.margin_min || 0),
            margin_target: Number(r.margin_target || 0),
            usd_pass_through: Number(r.usd_pass_through || 0),
            rounding_step: Number(r.rounding_step || 1),
            prioridad: Number(r.prioridad || 100),
            status: String(r.status || 'active') as RepricingRuleRow['status'],
          }))
        : [];
      setRepricingRules(safeRows);
    } catch (e) {
      if (showError) {
        setRepricingRulesError(e instanceof Error ? e.message : 'No se pudieron cargar reglas de repricing');
      }
      setRepricingRules([]);
    } finally {
      setRepricingRulesLoading(false);
    }
  }

  async function handleCreateRepricingRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRepricingRulesError(null);
    setRepricingApplyMsg(null);
    if (repricingForm.nombre.trim().length < 3) {
      setRepricingRulesError('Nombre de regla invalido');
      return;
    }
    setRepricingSaving(true);
    try {
      await Api.ownerCreateRepricingRule({
        nombre: repricingForm.nombre.trim(),
        scope: repricingForm.scope,
        scope_ref_id: repricingForm.scope_ref_id ? Number(repricingForm.scope_ref_id) : null,
        channel: repricingForm.channel || null,
        margin_min: Number(repricingForm.margin_min || 0.15),
        margin_target: Number(repricingForm.margin_target || 0.3),
        usd_pass_through: Number(repricingForm.usd_pass_through || 1),
        rounding_step: Number(repricingForm.rounding_step || 1),
        prioridad: Number(repricingForm.prioridad || 100),
        status: repricingForm.status,
      });
      setRepricingForm((prev) => ({ ...prev, nombre: '', scope_ref_id: '' }));
      await loadRepricingRules(false);
    } catch (e) {
      setRepricingRulesError(e instanceof Error ? e.message : 'No se pudo crear la regla');
    } finally {
      setRepricingSaving(false);
    }
  }

  async function handleToggleRepricingRule(rule: RepricingRuleRow) {
    setRepricingRulesError(null);
    try {
      await Api.ownerUpdateRepricingRule(rule.id, {
        status: rule.status === 'active' ? 'inactive' : 'active',
      });
      await loadRepricingRules(false);
    } catch (e) {
      setRepricingRulesError(e instanceof Error ? e.message : 'No se pudo actualizar la regla');
    }
  }

  async function handlePreviewRepricing() {
    setRepricingPreviewLoading(true);
    setRepricingPreviewError(null);
    setRepricingApplyMsg(null);
    try {
      const ids = parseIds(repricingProductIds);
      const out = await Api.ownerRepricingPreview({
        limit: Math.max(1, Number(repricingLimit) || 1),
        product_ids: ids.length ? ids : undefined,
      });
      const rows = Array.isArray(out)
        ? out.map((r: any) => ({
            producto_id: Number(r.producto_id || 0),
            producto: String(r.producto || ''),
            regla_nombre: r.regla_nombre ? String(r.regla_nombre) : '',
            costo_ars: Number(r.costo_ars || 0),
            precio_actual: r.precio_actual || {},
            precio_sugerido: r.precio_sugerido || {},
          }))
        : [];
      setRepricingPreviewRows(rows);
    } catch (e) {
      setRepricingPreviewError(e instanceof Error ? e.message : 'No se pudo generar preview');
      setRepricingPreviewRows([]);
    } finally {
      setRepricingPreviewLoading(false);
    }
  }

  async function handleApplyRepricing() {
    setRepricingPreviewError(null);
    setRepricingApplyMsg(null);
    try {
      const ids = parseIds(repricingProductIds);
      const out = await Api.ownerRepricingApply({
        limit: Math.max(1, Number(repricingLimit) || 1),
        product_ids: ids.length ? ids : undefined,
      });
      setRepricingApplyMsg(`Repricing aplicado. Productos actualizados: ${Number(out?.changed || 0)}`);
      const preview = Array.isArray(out?.preview) ? out.preview : [];
      if (preview.length) {
        setRepricingPreviewRows(
          preview.map((r: any) => ({
            producto_id: Number(r.producto_id || 0),
            producto: String(r.producto || ''),
            regla_nombre: r.regla_nombre ? String(r.regla_nombre) : '',
            costo_ars: Number(r.costo_ars || 0),
            precio_actual: r.precio_actual || {},
            precio_sugerido: r.precio_sugerido || {},
          }))
        );
      }
    } catch (e) {
      setRepricingPreviewError(e instanceof Error ? e.message : 'No se pudo aplicar repricing');
    }
  }

  async function loadFiscalRules(showError = false) {
    setFiscalLoading(true);
    if (!showError) setFiscalError(null);
    try {
      const rows = await Api.ownerFiscalRules();
      const safeRows = Array.isArray(rows)
        ? rows.map((r: any) => ({
            id: Number(r.id || 0),
            tipo: String(r.tipo || 'retencion') as FiscalRuleRow['tipo'],
            nombre: String(r.nombre || ''),
            impuesto: r.impuesto ? String(r.impuesto) : '',
            jurisdiccion: r.jurisdiccion ? String(r.jurisdiccion) : '',
            scope: String(r.scope || 'global') as FiscalRuleRow['scope'],
            scope_ref_id: r.scope_ref_id == null ? null : Number(r.scope_ref_id),
            alicuota: Number(r.alicuota || 0),
            monto_minimo: Number(r.monto_minimo || 0),
            vigencia_desde: r.vigencia_desde ? String(r.vigencia_desde).slice(0, 10) : '',
            vigencia_hasta: r.vigencia_hasta ? String(r.vigencia_hasta).slice(0, 10) : '',
            activo: Number(r.activo || 0),
            prioridad: Number(r.prioridad || 100),
          }))
        : [];
      setFiscalRules(safeRows);
    } catch (e) {
      if (showError) {
        setFiscalError(e instanceof Error ? e.message : 'No se pudieron cargar reglas fiscales');
      }
      setFiscalRules([]);
    } finally {
      setFiscalLoading(false);
    }
  }

  async function handleCreateFiscalRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFiscalError(null);
    setFiscalSuccess(null);
    if (fiscalForm.nombre.trim().length < 3) {
      setFiscalError('Nombre de regla fiscal invalido');
      return;
    }
    const alicuota = Number(fiscalForm.alicuota);
    if (!Number.isFinite(alicuota) || alicuota < 0) {
      setFiscalError('Alicuota invalida');
      return;
    }
    setFiscalSaving(true);
    try {
      await Api.ownerCreateFiscalRule({
        tipo: fiscalForm.tipo,
        nombre: fiscalForm.nombre.trim(),
        impuesto: fiscalForm.impuesto.trim() || undefined,
        jurisdiccion: fiscalForm.jurisdiccion.trim() || undefined,
        scope: fiscalForm.scope,
        scope_ref_id: fiscalForm.scope_ref_id ? Number(fiscalForm.scope_ref_id) : null,
        alicuota,
        monto_minimo: Number(fiscalForm.monto_minimo || 0),
        vigencia_desde: fiscalForm.vigencia_desde || null,
        vigencia_hasta: fiscalForm.vigencia_hasta || null,
        prioridad: Number(fiscalForm.prioridad || 100),
        activo: fiscalForm.activo,
      });
      setFiscalForm((prev) => ({ ...prev, nombre: '', scope_ref_id: '' }));
      setFiscalSuccess('Regla fiscal creada');
      await loadFiscalRules(false);
    } catch (e) {
      setFiscalError(e instanceof Error ? e.message : 'No se pudo crear la regla fiscal');
    } finally {
      setFiscalSaving(false);
    }
  }

  async function handleToggleFiscalRule(rule: FiscalRuleRow) {
    setFiscalError(null);
    setFiscalSuccess(null);
    try {
      await Api.ownerUpdateFiscalRule(rule.id, { activo: Number(rule.activo || 0) !== 1 });
      setFiscalSuccess('Regla fiscal actualizada');
      await loadFiscalRules(false);
    } catch (e) {
      setFiscalError(e instanceof Error ? e.message : 'No se pudo actualizar la regla fiscal');
    }
  }

  async function handleFiscalSimulation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFiscalSimError(null);
    setFiscalSimResult(null);
    const monto = Number(fiscalSimForm.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      setFiscalSimError('Monto invalido para simular');
      return;
    }
    setFiscalSimLoading(true);
    try {
      const out = await Api.ownerSimulateFiscal({
        monto,
        fecha: fiscalSimForm.fecha || undefined,
        cliente_id: fiscalSimForm.cliente_id ? Number(fiscalSimForm.cliente_id) : undefined,
        proveedor_id: fiscalSimForm.proveedor_id ? Number(fiscalSimForm.proveedor_id) : undefined,
        producto_id: fiscalSimForm.producto_id ? Number(fiscalSimForm.producto_id) : undefined,
      });
      setFiscalSimResult({
        monto_base: Number(out?.monto_base || 0),
        total_fiscal: Number(out?.total_fiscal || 0),
        detalle: Array.isArray(out?.detalle)
          ? out.detalle.map((d: any) => ({
              rule_id: Number(d.rule_id || 0),
              nombre: String(d.nombre || ''),
              tipo: String(d.tipo || ''),
              alicuota: Number(d.alicuota || 0),
              monto: Number(d.monto || 0),
            }))
          : [],
      });
    } catch (e) {
      setFiscalSimError(e instanceof Error ? e.message : 'No se pudo simular fiscal AR');
    } finally {
      setFiscalSimLoading(false);
    }
  }

  async function loadPriceLists(showError = false) {
    setPriceListLoading(true);
    if (!showError) setPriceListError(null);
    try {
      const lists = await Api.ownerPriceLists();
      const safeLists = Array.isArray(lists)
        ? lists.map((x: any) => ({
            id: Number(x.id || 0),
            nombre: String(x.nombre || ''),
            moneda_base: String(x.moneda_base || 'ARS'),
            canal: x.canal ? String(x.canal) : '',
            estrategia_actualizacion: String(x.estrategia_actualizacion || 'manual') as PriceListRow['estrategia_actualizacion'],
            activo: Number(x.activo || 0),
          }))
        : [];
      setPriceLists(safeLists);
      const nextId = selectedPriceListId || safeLists[0]?.id || null;
      setSelectedPriceListId(nextId);
      if (nextId) {
        const rules = await Api.ownerPriceListRules(nextId);
        setPriceListRules(
          Array.isArray(rules)
            ? rules.map((r: any) => ({
                id: Number(r.id || 0),
                price_list_id: Number(r.price_list_id || nextId),
                tipo_regla: String(r.tipo_regla || 'markup_pct') as PriceListRuleRow['tipo_regla'],
                prioridad: Number(r.prioridad || 100),
                parametros: r.parametros && typeof r.parametros === 'object' ? r.parametros : {},
                activo: Number(r.activo || 0),
              }))
            : []
        );
      } else {
        setPriceListRules([]);
      }
    } catch (e) {
      if (showError) {
        setPriceListError(e instanceof Error ? e.message : 'No se pudieron cargar listas de precios');
      }
      setPriceLists([]);
      setPriceListRules([]);
    } finally {
      setPriceListLoading(false);
    }
  }

  async function loadSelectedPriceListRules(showError = false) {
    if (!selectedPriceListId) {
      setPriceListRules([]);
      return;
    }
    if (!showError) setPriceListError(null);
    try {
      const rules = await Api.ownerPriceListRules(selectedPriceListId);
      setPriceListRules(
        Array.isArray(rules)
          ? rules.map((r: any) => ({
              id: Number(r.id || 0),
              price_list_id: Number(r.price_list_id || selectedPriceListId),
              tipo_regla: String(r.tipo_regla || 'markup_pct') as PriceListRuleRow['tipo_regla'],
              prioridad: Number(r.prioridad || 100),
              parametros: r.parametros && typeof r.parametros === 'object' ? r.parametros : {},
              activo: Number(r.activo || 0),
            }))
          : []
      );
    } catch (e) {
      if (showError) {
        setPriceListError(e instanceof Error ? e.message : 'No se pudieron cargar reglas de la lista');
      }
      setPriceListRules([]);
    }
  }

  async function handleCreatePriceList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPriceListError(null);
    setPriceListMsg(null);
    if (priceListForm.nombre.trim().length < 2) {
      setPriceListError('Nombre de lista invalido');
      return;
    }
    try {
      await Api.ownerCreatePriceList({
        nombre: priceListForm.nombre.trim(),
        moneda_base: priceListForm.moneda_base || 'ARS',
        canal: priceListForm.canal.trim() || null,
        estrategia_actualizacion: priceListForm.estrategia_actualizacion,
        activo: priceListForm.activo,
      });
      setPriceListForm((prev) => ({ ...prev, nombre: '', canal: '' }));
      setPriceListMsg('Lista de precios creada');
      await loadPriceLists(false);
    } catch (e) {
      setPriceListError(e instanceof Error ? e.message : 'No se pudo crear la lista de precios');
    }
  }

  async function handleTogglePriceList(pl: PriceListRow) {
    setPriceListError(null);
    setPriceListMsg(null);
    try {
      await Api.ownerUpdatePriceList(pl.id, { activo: Number(pl.activo || 0) !== 1 });
      setPriceListMsg('Lista actualizada');
      await loadPriceLists(false);
    } catch (e) {
      setPriceListError(e instanceof Error ? e.message : 'No se pudo actualizar la lista');
    }
  }

  async function handleCreatePriceRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPriceListId) {
      setPriceListError('Selecciona una lista');
      return;
    }
    setPriceListError(null);
    setPriceListMsg(null);
    try {
      await Api.ownerCreatePriceListRule(selectedPriceListId, {
        tipo_regla: priceRuleForm.tipo_regla,
        prioridad: Number(priceRuleForm.prioridad || 100),
        parametros: { valor: Number(priceRuleForm.valor || 0) },
        activo: priceRuleForm.activo,
      });
      setPriceRuleForm((prev) => ({ ...prev, valor: '0' }));
      setPriceListMsg('Regla de lista creada');
      await loadSelectedPriceListRules(false);
    } catch (e) {
      setPriceListError(e instanceof Error ? e.message : 'No se pudo crear la regla');
    }
  }

  async function handleTogglePriceRule(rule: PriceListRuleRow) {
    setPriceListError(null);
    setPriceListMsg(null);
    try {
      await Api.ownerUpdatePriceListRule(rule.id, { activo: Number(rule.activo || 0) !== 1 });
      setPriceListMsg('Regla actualizada');
      await loadSelectedPriceListRules(false);
    } catch (e) {
      setPriceListError(e instanceof Error ? e.message : 'No se pudo actualizar la regla');
    }
  }

  async function handlePreviewPriceList() {
    if (!selectedPriceListId) {
      setPriceListError('Selecciona una lista');
      return;
    }
    setPriceListPreviewLoading(true);
    setPriceListError(null);
    try {
      const out = await Api.ownerPreviewPriceList(selectedPriceListId, {
        limit: Math.max(1, Number(priceListPreviewLimit) || 1),
      });
      setPriceListPreviewRows(
        Array.isArray(out)
          ? out.map((x: any) => ({
              producto_id: Number(x.producto_id || 0),
              producto: String(x.producto || ''),
              precio_actual: Number(x.precio_actual || 0),
              precio_lista: Number(x.precio_lista || 0),
              variacion_pct: Number(x.variacion_pct || 0),
            }))
          : []
      );
    } catch (e) {
      setPriceListError(e instanceof Error ? e.message : 'No se pudo simular lista de precios');
      setPriceListPreviewRows([]);
    } finally {
      setPriceListPreviewLoading(false);
    }
  }

  async function loadIntegrations(showError = false) {
    setIntegrationLoading(true);
    if (!showError) setIntegrationError(null);
    try {
      const [ints, jobs] = await Promise.all([
        Api.ownerChannelIntegrations(),
        Api.ownerChannelJobs({
          status: integrationJobStatus === 'all' ? undefined : integrationJobStatus,
          limit: 120,
        }),
      ]);
      setIntegrations(
        Array.isArray(ints)
          ? ints.map((i: any) => ({
              id: Number(i.id || 0),
              canal: String(i.canal || 'mercadolibre') as ChannelIntegrationRow['canal'],
              estado: String(i.estado || 'disconnected') as ChannelIntegrationRow['estado'],
              config: i.config && typeof i.config === 'object' ? i.config : {},
              secret_ref: i.secret_ref ? String(i.secret_ref) : '',
              last_sync_at: i.last_sync_at ? String(i.last_sync_at) : '',
              last_error: i.last_error ? String(i.last_error) : '',
            }))
          : []
      );
      setIntegrationJobs(
        Array.isArray(jobs)
          ? jobs.map((j: any) => ({
              id: Number(j.id || 0),
              canal: String(j.canal || ''),
              job_type: String(j.job_type || ''),
              status: String(j.status || 'pending') as ChannelJobRow['status'],
              attempts: Number(j.attempts || 0),
              scheduled_at: j.scheduled_at ? String(j.scheduled_at) : '',
              started_at: j.started_at ? String(j.started_at) : '',
              finished_at: j.finished_at ? String(j.finished_at) : '',
              error_message: j.error_message ? String(j.error_message) : '',
            }))
          : []
      );
    } catch (e) {
      if (showError) {
        setIntegrationError(e instanceof Error ? e.message : 'No se pudieron cargar integraciones');
      }
      setIntegrations([]);
      setIntegrationJobs([]);
    } finally {
      setIntegrationLoading(false);
    }
  }

  async function handleSaveIntegration() {
    setIntegrationError(null);
    setIntegrationMsg(null);
    try {
      const config = parseJsonSafe(integrationForm.config_json, {});
      await Api.ownerUpsertChannelIntegration(integrationForm.canal, {
        estado: integrationForm.estado,
        config,
        secret_ref: integrationForm.secret_ref.trim() || null,
      });
      setIntegrationMsg('Integracion guardada');
      await loadIntegrations(false);
    } catch (e) {
      setIntegrationError(e instanceof Error ? e.message : 'No se pudo guardar integracion');
    }
  }

  async function handleQueueIntegrationSync() {
    setIntegrationError(null);
    setIntegrationMsg(null);
    try {
      const config = parseJsonSafe(integrationForm.config_json, {});
      await Api.ownerQueueChannelSync(integrationForm.canal, {
        job_type: integrationForm.job_type || 'catalog_sync',
        payload: config,
      });
      setIntegrationMsg('Sync encolado');
      await loadIntegrations(false);
    } catch (e) {
      setIntegrationError(e instanceof Error ? e.message : 'No se pudo encolar sync');
    }
  }

  async function loadBeta(showError = false) {
    setBetaLoading(true);
    if (!showError) setBetaError(null);
    try {
      const [companies, metrics] = await Promise.all([Api.ownerBetaCompanies(), Api.ownerBetaMetrics()]);
      setBetaCompanies(
        Array.isArray(companies)
          ? companies.map((c: any) => ({
              id: Number(c.id || 0),
              nombre: String(c.nombre || ''),
              cuit: c.cuit ? String(c.cuit) : '',
              segmento: c.segmento ? String(c.segmento) : '',
              tamano_equipo: c.tamano_equipo == null ? null : Number(c.tamano_equipo),
              estado: String(c.estado || 'invited') as BetaCompanyRow['estado'],
              onboarded_at: c.onboarded_at ? String(c.onboarded_at) : '',
              last_feedback_at: c.last_feedback_at ? String(c.last_feedback_at) : '',
              nps_score: c.nps_score == null ? null : Number(c.nps_score),
            }))
          : []
      );
      setBetaMetrics(metrics && typeof metrics === 'object' ? metrics : null);
    } catch (e) {
      if (showError) {
        setBetaError(e instanceof Error ? e.message : 'No se pudo cargar programa beta');
      }
      setBetaCompanies([]);
      setBetaMetrics(null);
    } finally {
      setBetaLoading(false);
    }
  }

  async function handleCreateBetaCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBetaError(null);
    setBetaMsg(null);
    if (betaCompanyForm.nombre.trim().length < 2) {
      setBetaError('Nombre de empresa invalido');
      return;
    }
    try {
      await Api.ownerCreateBetaCompany({
        nombre: betaCompanyForm.nombre.trim(),
        cuit: betaCompanyForm.cuit.trim() || undefined,
        segmento: betaCompanyForm.segmento.trim() || undefined,
        tamano_equipo: betaCompanyForm.tamano_equipo ? Number(betaCompanyForm.tamano_equipo) : undefined,
        estado: betaCompanyForm.estado,
        nps_score: betaCompanyForm.nps_score ? Number(betaCompanyForm.nps_score) : undefined,
      });
      setBetaCompanyForm((prev) => ({ ...prev, nombre: '', cuit: '', segmento: '', tamano_equipo: '', nps_score: '' }));
      setBetaMsg('Empresa beta creada');
      await loadBeta(false);
    } catch (e) {
      setBetaError(e instanceof Error ? e.message : 'No se pudo crear empresa beta');
    }
  }

  async function handleCreateBetaFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBetaError(null);
    setBetaMsg(null);
    const companyId = Number(betaFeedbackForm.company_id);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      setBetaError('Selecciona empresa para feedback');
      return;
    }
    if (betaFeedbackForm.modulo.trim().length < 2) {
      setBetaError('Modulo invalido');
      return;
    }
    try {
      await Api.ownerCreateBetaFeedback(companyId, {
        modulo: betaFeedbackForm.modulo.trim(),
        impacto_score: Number(betaFeedbackForm.impacto_score || 3),
        comentario: betaFeedbackForm.comentario.trim() || undefined,
      });
      setBetaFeedbackForm((prev) => ({ ...prev, modulo: '', comentario: '' }));
      setBetaMsg('Feedback beta registrado');
      await loadBeta(false);
    } catch (e) {
      setBetaError(e instanceof Error ? e.message : 'No se pudo registrar feedback beta');
    }
  }

  async function loadRelease(showError = false) {
    setReleaseLoading(true);
    if (!showError) setReleaseError(null);
    try {
      const rows = await Api.ownerReleaseCycles();
      setReleaseCycles(
        Array.isArray(rows)
          ? rows.map((r: any) => ({
              id: Number(r.id || 0),
              codigo: String(r.codigo || ''),
              mes: String(r.mes || ''),
              estado: String(r.estado || 'open') as ReleaseCycleRow['estado'],
              objetivos: r.objetivos && typeof r.objetivos === 'object' ? r.objetivos : {},
              changelog_resumen: r.changelog_resumen ? String(r.changelog_resumen) : '',
              opened_at: r.opened_at ? String(r.opened_at) : '',
              closed_at: r.closed_at ? String(r.closed_at) : '',
            }))
          : []
      );
    } catch (e) {
      if (showError) {
        setReleaseError(e instanceof Error ? e.message : 'No se pudieron cargar ciclos de release');
      }
      setReleaseCycles([]);
    } finally {
      setReleaseLoading(false);
    }
  }

  async function handleCreateReleaseCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReleaseError(null);
    setReleaseMsg(null);
    if (releaseForm.codigo.trim().length < 3) {
      setReleaseError('Codigo de ciclo invalido');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(releaseForm.mes)) {
      setReleaseError('Mes invalido, formato YYYY-MM');
      return;
    }
    try {
      await Api.ownerCreateReleaseCycle({
        codigo: releaseForm.codigo.trim(),
        mes: releaseForm.mes,
        objetivos: parseJsonSafe(releaseForm.objetivos_json, {}),
      });
      setReleaseForm((prev) => ({ ...prev, codigo: '', objetivos_json: '{}' }));
      setReleaseMsg('Ciclo creado');
      await loadRelease(false);
    } catch (e) {
      setReleaseError(e instanceof Error ? e.message : 'No se pudo crear ciclo');
    }
  }

  async function handleAddReleaseEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReleaseError(null);
    setReleaseMsg(null);
    const cycleId = Number(releaseEntryForm.cycle_id);
    if (!Number.isInteger(cycleId) || cycleId <= 0) {
      setReleaseError('Selecciona ciclo');
      return;
    }
    if (releaseEntryForm.categoria.trim().length < 2 || releaseEntryForm.titulo.trim().length < 4) {
      setReleaseError('Categoria o titulo invalido');
      return;
    }
    if (releaseEntryForm.impacto_negocio.trim().length < 8) {
      setReleaseError('Impacto de negocio demasiado corto');
      return;
    }
    try {
      await Api.ownerAddReleaseEntry(cycleId, {
        categoria: releaseEntryForm.categoria.trim(),
        titulo: releaseEntryForm.titulo.trim(),
        impacto_negocio: releaseEntryForm.impacto_negocio.trim(),
        kpi_target: releaseEntryForm.kpi_target.trim() || undefined,
      });
      setReleaseEntryForm((prev) => ({ ...prev, categoria: '', titulo: '', impacto_negocio: '', kpi_target: '' }));
      setReleaseMsg('Entrada de changelog agregada');
    } catch (e) {
      setReleaseError(e instanceof Error ? e.message : 'No se pudo agregar entrada');
    }
  }

  async function handleCloseReleaseCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReleaseError(null);
    setReleaseMsg(null);
    const cycleId = Number(releaseCloseForm.cycle_id);
    if (!Number.isInteger(cycleId) || cycleId <= 0) {
      setReleaseError('Selecciona ciclo');
      return;
    }
    try {
      await Api.ownerCloseReleaseCycle(cycleId, {
        changelog_resumen: releaseCloseForm.changelog_resumen.trim() || undefined,
      });
      setReleaseMsg('Ciclo cerrado');
      await loadRelease(false);
    } catch (e) {
      setReleaseError(e instanceof Error ? e.message : 'No se pudo cerrar ciclo');
    }
  }

  async function loadOffersHub(showError = false) {
    setOfferLoading(true);
    if (!showError) setOfferError(null);
    try {
      const alianzas = await Api.marketplaceAlianzas({ limit: 200, inactivas: true });
      const safeAlianzas = Array.isArray(alianzas)
        ? alianzas.map((a: any) => ({
            id: Number(a.id || 0),
            nombre: a.nombre ? String(a.nombre) : '',
            pyme_nombre: a.pyme_nombre ? String(a.pyme_nombre) : '',
            estado: a.estado ? String(a.estado) : '',
          }))
        : [];
      setOfferAlianzas(safeAlianzas);
      const selected = offerSelectedAlianzaId || safeAlianzas[0]?.id || null;
      setOfferSelectedAlianzaId(selected);
      if (selected) {
        const offers = await Api.marketplaceOfertas(selected, { inactivas: true });
        setOfferRows(
          Array.isArray(offers)
            ? offers.map((o: any) => ({
                id: Number(o.id || 0),
                alianza_id: Number(o.alianza_id || selected),
                nombre: String(o.nombre || ''),
                descripcion: o.descripcion ? String(o.descripcion) : '',
                precio_fijo: o.precio_fijo == null ? null : Number(o.precio_fijo),
                activo: o.activo,
              }))
            : []
        );
      } else {
        setOfferRows([]);
      }
    } catch (e) {
      if (showError) {
        setOfferError(e instanceof Error ? e.message : 'No se pudieron cargar ofertas');
      }
      setOfferAlianzas([]);
      setOfferRows([]);
    } finally {
      setOfferLoading(false);
    }
  }

  async function handleCreateOfferHub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOfferError(null);
    setOfferMsg(null);
    if (!offerSelectedAlianzaId) {
      setOfferError('Selecciona alianza');
      return;
    }
    if (offerForm.nombre.trim().length < 2) {
      setOfferError('Nombre de oferta invalido');
      return;
    }
    try {
      await Api.marketplaceCrearOferta(offerSelectedAlianzaId, {
        nombre: offerForm.nombre.trim(),
        descripcion: offerForm.descripcion.trim() || undefined,
        precio_fijo: offerForm.precio_fijo ? Number(offerForm.precio_fijo) : undefined,
      });
      setOfferForm({ nombre: '', descripcion: '', precio_fijo: '' });
      setOfferMsg('Oferta creada');
      await loadOffersHub(false);
    } catch (e) {
      setOfferError(e instanceof Error ? e.message : 'No se pudo crear oferta');
    }
  }

  async function handleToggleOfferHub(offer: MarketplaceOfferLite) {
    setOfferError(null);
    setOfferMsg(null);
    try {
      await Api.marketplaceActualizarOferta(offer.id, { activo: !offer.activo });
      setOfferMsg('Oferta actualizada');
      await loadOffersHub(false);
    } catch (e) {
      setOfferError(e instanceof Error ? e.message : 'No se pudo actualizar oferta');
    }
  }

  useEffect(() => {
    if (period === 'custom' && !range) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rangeParams =
          period === 'custom' && range
            ? { desde: range.desde, hasta: range.hasta }
            : { periodo: period };
        const [netaRes, brutaRes, prodRes, costosRes, catsRes, clientesRes, cashflowRes] = await Promise.all([
          Api.gananciaNeta({ ...rangeParams }),
          Api.gananciaBruta({ ...rangeParams, agregado: 'dia' }),
          Api.gananciaPorProducto({ ...rangeParams, limit: 20, orderBy: 'ganancia' }),
          Api.costosProductos({ ...rangeParams, groupBy: 'producto' }),
          Api.rentabilidadPorCategoria({ ...rangeParams, limit: 20 }),
          Api.rentabilidadPorCliente({ ...rangeParams, limit: 20 }),
          Api.cashflow({ ...rangeParams, agrupado: 'dia' }),
        ]);

        setSerieNeta(
          (netaRes?.serie || []).map((r: any) => ({
            fecha: r.fecha,
            totalVentas: Number(r.totalVentas || 0),
            totalCostoProductos: Number(r.totalCostoProductos || 0),
            totalGastos: Number(r.totalGastos || 0),
            totalInversiones: Number(r.totalInversiones || 0),
            gananciaBruta: Number(r.gananciaBruta || 0),
            gananciaNeta: Number(r.gananciaNeta || 0),
          }))
        );

        setSerieBruta(
          (brutaRes?.serie || []).map((r: any) => ({
            fecha: r.fecha,
            totalVentas: Number(r.totalVentas || 0),
            totalCostoProductos: Number(r.totalCostoProductos || 0),
            gananciaBruta:
              r.gananciaBruta != null
                ? Number(r.gananciaBruta || 0)
                : Number(r.totalVentas || 0) - Number(r.totalCostoProductos || 0),
          }))
        );
        setBrutaResumen({
          totalVentas: Number(brutaRes?.totalVentas || 0),
          totalCostoProductos: Number(brutaRes?.totalCostoProductos || 0),
          gananciaBruta: Number(brutaRes?.gananciaBruta || 0),
          totalDescuentos: Number(brutaRes?.totalDescuentos || 0),
          totalImpuestos: Number(brutaRes?.totalImpuestos || 0),
        });

        setProductosRentables(
          (prodRes?.items || []).map((r: any) => ({
            productoId: r.productoId,
            productoCodigo: r.productoCodigo,
            productoNombre: r.productoNombre,
            unidadesVendidas: Number(r.unidadesVendidas || 0),
            ingresos: Number(r.ingresos || 0),
            costoTotal: Number(r.costoTotal || 0),
            gananciaBruta: Number(r.gananciaBruta || 0),
            margenPorcentaje: r.margenPorcentaje != null ? Number(r.margenPorcentaje) : null,
          }))
        );

        setCostosProductos(
          (costosRes?.detalles || []).map((r: any) => ({
            productoId: r.productoId,
            productoCodigo: r.productoCodigo,
            productoNombre: r.productoNombre,
            moneda: r.moneda,
            cantidad: Number(r.cantidad || 0),
            totalCostos: Number(r.totalCostos || 0),
          }))
        );

        setRentabilidadCategorias(
          (catsRes?.items || []).map((r: any) => ({
            categoriaId: r.categoriaId ?? null,
            categoriaNombre: r.categoriaNombre,
            unidadesVendidas: Number(r.unidadesVendidas || 0),
            ingresos: Number(r.ingresos || 0),
            costoTotal: Number(r.costoTotal || 0),
            gananciaBruta: Number(r.gananciaBruta || 0),
            margenPorcentaje: r.margenPorcentaje != null ? Number(r.margenPorcentaje) : null,
          }))
        );

        setRentabilidadClientes(
          (clientesRes?.items || []).map((r: any) => ({
            clienteId: r.clienteId,
            clienteNombre: r.clienteNombre,
            clienteApellido: r.clienteApellido,
            unidadesVendidas: Number(r.unidadesVendidas || 0),
            ingresos: Number(r.ingresos || 0),
            costoTotal: Number(r.costoTotal || 0),
            gananciaBruta: Number(r.gananciaBruta || 0),
            margenPorcentaje: r.margenPorcentaje != null ? Number(r.margenPorcentaje) : null,
            deuda: Number(r.deuda || 0),
          }))
        );

        setCashflowSerie(
          (cashflowRes?.serie || []).map((r: any) => ({
            fecha: r.fecha,
            entradas: Number(r.entradas || 0),
            salidas: Number(r.salidas || 0),
            saldoAcumulado: Number(r.saldoAcumulado || 0),
          }))
        );
        setSaldoInicial(Number(cashflowRes?.saldoInicial || 0));
        setSaldoMinimo(Number(cashflowRes?.saldoMinimo || 0));
        setSaldoMaximo(Number(cashflowRes?.saldoMaximo || 0));
        setDiasPorDebajoUmbral(Number(cashflowRes?.diasPorDebajoUmbral || 0));
        setUmbralMinimo(Number(cashflowRes?.umbralMinimo || 0));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos de finanzas');
        setSerieNeta([]);
        setSerieBruta([]);
        setBrutaResumen({
          totalVentas: 0,
          totalCostoProductos: 0,
          gananciaBruta: 0,
          totalDescuentos: 0,
          totalImpuestos: 0,
        });
        setProductosRentables([]);
        setCostosProductos([]);
        setRentabilidadCategorias([]);
        setRentabilidadClientes([]);
        setCashflowSerie([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [range?.desde, range?.hasta, period]);

  // Cargar deudas de clientes y proveedores (estado al día de hoy)
  useEffect(() => {
    (async () => {
      try {
        const [cliRes, provRes] = await Promise.all([
          Api.deudasClientes().catch(() => []),
          Api.deudasProveedores().catch(() => ({ items: [], diasPromedioPagoGlobal: null })),
        ]);

        const cliItems = Array.isArray(cliRes) ? cliRes : [];
        setDeudasClientesResumen(
          cliItems.map((c: any) => ({
            clienteId: c.clienteId,
            clienteNombre: c.clienteNombre,
            clienteApellido: c.clienteApellido,
            deudaTotal: Number(c.deudaTotal || 0),
            deuda0_30: Number(c.deuda0_30 || 0),
            deuda31_60: Number(c.deuda31_60 || 0),
            deuda61_90: Number(c.deuda61_90 || 0),
            deudaMas90: Number(c.deudaMas90 || 0),
            diasPromedioAtraso:
              c.diasPromedioAtraso != null ? Number(c.diasPromedioAtraso) : null,
          }))
        );

        const provObj = provRes as any;
        const itemsProv = Array.isArray(provObj?.items) ? provObj.items : [];
        setDeudasProveedoresResumen(
          itemsProv.map((p: any) => ({
            proveedorId: p.proveedorId,
            proveedorNombre: p.proveedorNombre,
            deudaTotal: Number(p.deudaTotal || 0),
            deuda0_30: Number(p.deuda0_30 || 0),
            deuda31_60: Number(p.deuda31_60 || 0),
            deuda61_90: Number(p.deuda61_90 || 0),
            deudaMas90: Number(p.deudaMas90 || 0),
            diasPromedioAtraso:
              p.diasPromedioAtraso != null ? Number(p.diasPromedioAtraso) : null,
          }))
        );
        setDiasPromedioPagoProveedores(
          provObj?.diasPromedioPagoGlobal != null
            ? Number(provObj.diasPromedioPagoGlobal)
            : null
        );
      } catch {
        setDeudasClientesResumen([]);
        setDeudasProveedoresResumen([]);
        setDiasPromedioPagoProveedores(null);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await Api.presupuestoCategorias();
        setPresupuestoCategorias({
          ventas: Array.isArray(res?.ventas) ? res.ventas : [],
          gastos: Array.isArray(res?.gastos) ? res.gastos : [],
        });
      } catch {
        setPresupuestoCategorias({ ventas: [], gastos: [] });
      }
    })();
  }, []);

  // Cargar presupuestos y presupuesto vs real para el mes seleccionado
  useEffect(() => {
    loadPresupuestos(presupuestoAnio, presupuestoMes);
  }, [presupuestoAnio, presupuestoMes]);

  useEffect(() => {
    loadOwnerCenter(false);
  }, []);

  useEffect(() => {
    if (tab === 'cobranzas') {
      loadCobranzas(false);
    }
  }, [tab, promiseStatusFilter, reminderStatusFilter]);

  useEffect(() => {
    if (tab === 'alertas') {
      loadOwnerAlerts(false);
    }
  }, [tab, alertsStatusFilter]);

  useEffect(() => {
    if (tab === 'margenes') {
      loadMargins(false);
    }
  }, [tab, marginDimension, range?.desde, range?.hasta]);

  useEffect(() => {
    if (tab === 'repricing') {
      loadRepricingRules(false);
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'fiscal') {
      loadFiscalRules(false);
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'precios') {
      loadPriceLists(false);
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'precios' && selectedPriceListId) {
      loadSelectedPriceListRules(false);
    }
  }, [tab, selectedPriceListId]);

  useEffect(() => {
    if (tab === 'integraciones') {
      loadIntegrations(false);
    }
  }, [tab, integrationJobStatus]);

  useEffect(() => {
    if (tab === 'beta') {
      loadBeta(false);
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'release') {
      loadRelease(false);
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'ofertas') {
      loadOffersHub(false);
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'ofertas' && offerSelectedAlianzaId) {
      loadOffersHub(false);
    }
  }, [tab, offerSelectedAlianzaId]);

  const presupuestoEditando = presupuestoForm.id != null;
  const categoriasSugeridas =
    presupuestoForm.tipo === 'ventas' ? presupuestoCategorias.ventas : presupuestoCategorias.gastos;

  async function handleGuardarPresupuesto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPresupuestoError(null);
    setPresupuestoOk(null);

    const categoria = presupuestoForm.categoria.trim();
    const monto = Number(presupuestoForm.monto);

    if (!categoria) {
      setPresupuestoError('Categoria requerida');
      return;
    }
    if (!Number.isFinite(monto) || monto < 0) {
      setPresupuestoError('Monto invalido');
      return;
    }

    setPresupuestoGuardando(true);
    try {
      await Api.guardarPresupuesto({
        anio: presupuestoAnio,
        mes: presupuestoMes,
        tipo: presupuestoForm.tipo,
        categoria,
        monto,
      });
      setPresupuestoOk('Presupuesto guardado');
      setPresupuestoForm({
        id: undefined,
        tipo: presupuestoForm.tipo,
        categoria: '',
        monto: '',
      });
      await loadPresupuestos(presupuestoAnio, presupuestoMes);
    } catch (e) {
      setPresupuestoError(e instanceof Error ? e.message : 'No se pudo guardar el presupuesto');
    } finally {
      setPresupuestoGuardando(false);
    }
  }

  function handleEditarPresupuesto(row: PresupuestoRow) {
    setPresupuestoForm({
      id: row.id,
      tipo: normalizePresupuestoTipo(row.tipo),
      categoria: row.categoria,
      monto: row.monto.toString(),
    });
  }

  function handleCancelarPresupuesto() {
    setPresupuestoForm({
      id: undefined,
      tipo: 'ventas',
      categoria: '',
      monto: '',
    });
    setPresupuestoError(null);
    setPresupuestoOk(null);
  }

  async function handleEliminarPresupuesto(row: PresupuestoRow) {
    if (!row.id) return;
    if (!window.confirm('Eliminar presupuesto seleccionado?')) return;
    setPresupuestoError(null);
    setPresupuestoOk(null);
    try {
      await Api.eliminarPresupuesto(row.id);
      setPresupuestoOk('Presupuesto eliminado');
      if (presupuestoForm.id === row.id) {
        handleCancelarPresupuesto();
      }
      await loadPresupuestos(presupuestoAnio, presupuestoMes);
    } catch (e) {
      setPresupuestoError(e instanceof Error ? e.message : 'No se pudo eliminar el presupuesto');
    }
  }

  const chartGananciaNeta = useMemo(
    () =>
      serieNeta.map((r) => ({
        fecha: new Date(r.fecha).toLocaleDateString(undefined, { month: 'short', day: '2-digit' }),
        ventas: r.totalVentas,
        costo: r.totalCostoProductos,
        gastos: r.totalGastos + r.totalInversiones,
        neta: r.gananciaNeta,
      })),
    [serieNeta]
  );

  const chartGananciaBruta = useMemo(
    () =>
      serieBruta.map((r) => ({
        fecha: new Date(r.fecha).toLocaleDateString(undefined, { month: 'short', day: '2-digit' }),
        ventas: r.totalVentas,
        costo: r.totalCostoProductos,
        bruta: r.gananciaBruta,
      })),
    [serieBruta]
  );

  const chartCashflow = useMemo(
    () =>
      cashflowSerie.map((p) => ({
        fecha: new Date(p.fecha).toLocaleDateString(undefined, { month: 'short', day: '2-digit' }),
        entradas: p.entradas,
        salidas: p.salidas,
        saldo: p.saldoAcumulado,
      })),
    [cashflowSerie]
  );

  const totalGananciaNeta = useMemo(
    () => serieNeta.reduce((acc, r) => acc + r.gananciaNeta, 0),
    [serieNeta]
  );

  const totalCostosPeriodo = useMemo(
    () => costosProductos.reduce((acc, r) => acc + r.totalCostos, 0),
    [costosProductos]
  );

  const totalGastosPeriodo = useMemo(
    () => serieNeta.reduce((acc, row) => acc + row.totalGastos + row.totalInversiones, 0),
    [serieNeta]
  );

  const totalPresupuestoMes = useMemo(
    () => presupuestoVsRealRows.reduce((acc, r) => acc + r.presupuesto, 0),
    [presupuestoVsRealRows]
  );

  const totalRealMes = useMemo(
    () => presupuestoVsRealRows.reduce((acc, r) => acc + r.real, 0),
    [presupuestoVsRealRows]
  );

  const margenBruto = useMemo(() => {
    if (!brutaResumen.totalVentas) return 0;
    return (brutaResumen.gananciaBruta / brutaResumen.totalVentas) * 100;
  }, [brutaResumen]);

  const pieVentasCosto = useMemo(() => {
    if (!brutaResumen.totalVentas && !brutaResumen.totalCostoProductos) return [];
    return [
      { name: 'Costo productos', value: Math.max(brutaResumen.totalCostoProductos, 0) },
      { name: 'Ganancia bruta', value: Math.max(brutaResumen.gananciaBruta, 0) },
    ];
  }, [brutaResumen]);

  const pieCategoriasGanancia = useMemo(
    () => buildPieData(rentabilidadCategorias, 6, (c) => c.gananciaBruta, (c) => c.categoriaNombre),
    [rentabilidadCategorias]
  );

  const pieProductosGanancia = useMemo(
    () => buildPieData(productosRentables, 6, (p) => p.gananciaBruta, (p) => p.productoNombre),
    [productosRentables]
  );

  const presupuestoVentasPie = useMemo(
    () => buildBudgetPie(presupuestoTotales.presupuestoVentas, presupuestoTotales.realVentas),
    [presupuestoTotales]
  );

  const presupuestoGastosPie = useMemo(
    () => buildBudgetPie(presupuestoTotales.presupuestoGastos, presupuestoTotales.realGastos),
    [presupuestoTotales]
  );

  const presupuestoVentasExceso = useMemo(
    () => Math.max(presupuestoTotales.realVentas - presupuestoTotales.presupuestoVentas, 0),
    [presupuestoTotales]
  );

  const presupuestoGastosExceso = useMemo(
    () => Math.max(presupuestoTotales.realGastos - presupuestoTotales.presupuestoGastos, 0),
    [presupuestoTotales]
  );

  const topProducto = useMemo(() => productosRentables[0] ?? null, [productosRentables]);
  const activeGuide = useMemo(
    () => FINANCE_TAB_GUIDES.find((item) => item.key === tab) || null,
    [tab]
  );
  const filteredRiskRanking = useMemo(
    () =>
      riskRankingRows.filter((r) => (riskBucketFilter === 'all' ? true : String(r.bucket) === riskBucketFilter)),
    [riskRankingRows, riskBucketFilter]
  );
  const repricingImpact = useMemo(() => {
    const totals = repricingPreviewRows.reduce(
      (acc, row) => {
        const actual = Number(row.precio_actual?.venta || 0);
        const sugerido = Number(row.precio_sugerido?.venta || 0);
        acc.actual += actual;
        acc.sugerido += sugerido;
        return acc;
      },
      { actual: 0, sugerido: 0 }
    );
    const delta = totals.sugerido - totals.actual;
    const deltaPct = totals.actual > 0 ? (delta / totals.actual) * 100 : 0;
    return { ...totals, delta, deltaPct };
  }, [repricingPreviewRows]);

  if (isSimpleView) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-2xl font-semibold bg-gradient-to-r from-slate-100 via-cyan-200 to-cyan-400 bg-clip-text text-transparent">
              Finanzas
            </div>
            <div className="mt-1 text-sm text-slate-400">
              Vista simple: solo los numeros que importan para decidir rapido.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => setPeriod('30d')}>
              Últimos 30 días
            </Button>
            <Button type="button" variant="ghost" className="h-8 px-3 text-xs" onClick={() => setPeriod('7d')}>
              Últimos 7 días
            </Button>
          </div>
        </div>

        {error && (
          <div className="app-card border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="app-card finance-card p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Ventas del periodo</div>
            <div className="text-3xl font-semibold font-data text-slate-100">
              ${brutaResumen.totalVentas.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="mt-2 text-xs text-slate-500">Total vendido en el rango actual.</div>
          </div>
          <div className="app-card finance-card p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Gastos del periodo</div>
            <div className="text-3xl font-semibold font-data text-cyan-200">
              ${totalGastosPeriodo.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="mt-2 text-xs text-slate-500">Incluye gastos e inversiones del periodo.</div>
          </div>
          <div className="app-card finance-card p-4">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Ganancia neta
              <HelpTooltip>
                La ganancia neta es lo que queda despues de costos, gastos e inversiones del periodo.
              </HelpTooltip>
            </div>
            <div className="text-3xl font-semibold font-data text-emerald-200">
              ${totalGananciaNeta.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="mt-2 text-xs text-slate-500">Resultado consolidado del negocio.</div>
          </div>
        </div>

        <div className="app-card finance-card p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <span>Margen bruto</span>
            <HelpTooltip>
              El margen bruto muestra cuanto queda de las ventas despues de restar solo el costo de los productos vendidos.
            </HelpTooltip>
          </div>
          <div className="mt-2 text-2xl font-semibold font-data text-fuchsia-200">
            {margenBruto.toFixed(1)}%
          </div>
          <div className="mt-4 h-72 finance-shimmer">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartGananciaNeta}>
                <XAxis dataKey="fecha" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  wrapperStyle={{ outline: 'none' }}
                  contentStyle={{
                    background: 'rgba(2,6,23,0.92)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: '#e2e8f0',
                  }}
                />
                <Area type="monotone" dataKey="ventas" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.18} name="Ventas" />
                <Area type="monotone" dataKey="neta" stroke="#06b6d4" fill="#22d3ee" fillOpacity={0.22} name="Ganancia neta" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="app-card finance-card p-4">
          <div className="text-sm font-medium text-slate-100">Alertas clave</div>
          <div className="mt-3 space-y-3">
            {ownerAlertsRows.slice(0, 4).map((alertRow) => (
              <div key={alertRow.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-sm text-slate-100">{alertRow.title}</div>
                <div className="mt-1 text-xs text-slate-400">{alertRow.detail || 'Sin detalle adicional.'}</div>
              </div>
            ))}
            {!ownerAlertsRows.length && (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-4 text-sm text-slate-400">
                No hay alertas abiertas. Cambia a vista completa para ver analisis detallado.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <h1 className="app-title">Finanzas</h1>
          <p className="app-subtitle">
            Rentabilidad, costos, deudas y flujo de caja del negocio.
            {range && <span className="ml-2 font-mono text-slate-500">{range.desde} → {range.hasta}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
            <span className="text-xs text-slate-400">Período:</span>
            <select
              className="bg-transparent text-sm text-slate-200 border-none outline-none cursor-pointer"
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodKey)}
            >
              <option value="24h" className="bg-slate-900">Últimas 24 horas</option>
              <option value="7d" className="bg-slate-900">Últimos 7 días</option>
              <option value="30d" className="bg-slate-900">Últimos 30 días</option>
              <option value="custom" className="bg-slate-900">Rango personalizado</option>
            </select>
          </div>
          {period === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
              <span className="text-xs text-slate-400">Desde:</span>
              <input type="date" className="bg-transparent text-sm text-slate-200 border-none outline-none" value={customDesde} onChange={(e) => setCustomDesde(e.target.value)} />
              <span className="text-xs text-slate-400">Hasta:</span>
              <input type="date" className="bg-transparent text-sm text-slate-200 border-none outline-none" value={customHasta} onChange={(e) => setCustomHasta(e.target.value)} />
            </div>
          )}
          <button
            onClick={() => setShowTutorial((v) => !v)}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">¿Cómo se usa?</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTutorial ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="app-card border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Tutorial colapsable */}
      {showTutorial && (
        <div className="app-card p-5 border-indigo-500/30 bg-indigo-500/5 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-indigo-300" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 mb-1">¿Para qué sirve el módulo de Finanzas?</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Este módulo te da una <strong className="text-slate-200">visión completa de la salud financiera del negocio</strong>.
                Podés ver cuánto ganás, qué productos son rentables, quién te debe dinero y cómo se mueve la caja.
                Todo en el mismo lugar, sin necesidad de hacer cuentas aparte.
              </p>
            </div>
          </div>
          <hr className="border-white/10" />
          <div>
            <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-3">Las secciones más importantes — empezá por acá</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { emoji: '✅', titulo: 'Ganancia neta', desc: 'Es el número más importante. Te dice si el negocio realmente gana dinero después de pagar todo. Si es positivo, vas bien. Si es negativo, hay que actuar.' },
                { emoji: '💵', titulo: 'Flujo de caja', desc: 'Muestra cuánto dinero entró y salió cada día. Si el saldo acumulado baja seguido, hay riesgo de quedarte sin efectivo para pagar.' },
                { emoji: '📋', titulo: 'Cobranzas', desc: 'Lista de clientes que te deben dinero, cuánto hace que deben y si prometieron pagar. Las deudas de más de 90 días son las más urgentes.' },
                { emoji: '🔔', titulo: 'Alertas', desc: 'El sistema detecta automáticamente situaciones de riesgo: caja baja, deudas críticas, stock en cero. Las rojas son urgentes, las amarillas son importantes.' },
                { emoji: '💰', titulo: 'Ganancia bruta', desc: 'Muestra cuánto queda de las ventas después de restar solo el costo de los productos. Te ayuda a ver si tus precios están bien puestos.' },
                { emoji: '🎯', titulo: 'Presupuesto vs real', desc: 'Compará lo que planificaste con lo que realmente pasó. Si las ventas quedan cortas o los gastos se van de madre, podés corregir a tiempo.' },
              ].map(({ emoji, titulo, desc }) => (
                <div key={titulo} className="rounded-xl p-4 bg-white/5 border border-white/10 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{emoji}</span>
                    <span className="text-sm font-semibold text-slate-200">{titulo}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
          <hr className="border-white/10" />
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cómo leer los números</p>
              {[
                { icon: '📅', titulo: 'Elegí el período correcto', desc: 'Cambiá el selector de período en la parte superior. "Últimos 30 días" es el más usado para tener una foto mensual del negocio.' },
                { icon: '🟢🟡🔴', titulo: 'Los colores indican el estado', desc: 'Verde = bien, amarillo = atención, rojo = problema. Usá esto para priorizar dónde mirar primero.' },
                { icon: '📊', titulo: 'Los gráficos muestran tendencia', desc: 'Si una línea sube, va bien. Si baja, hay que investigar. Pasá el mouse por encima para ver los valores exactos de cada día.' },
              ].map(({ icon, titulo, desc }) => (
                <div key={titulo} className="flex gap-3">
                  <span className="text-lg shrink-0 mt-0.5">{icon}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{titulo}</p>
                    <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Consejos prácticos</p>
              {[
                { icon: '💡', titulo: 'Revisalo al menos una vez por semana', desc: 'No hace falta ser contador. Con mirar la ganancia neta, las alertas y el flujo de caja tenés el pulso del negocio.' },
                { icon: '🔔', titulo: 'Empezá siempre por las alertas', desc: 'Las alertas críticas son lo más urgente. Resolvelas antes de analizar tendencias o reportes.' },
                { icon: '📈', titulo: 'Usá "por artículo" para tomar decisiones de precio', desc: 'Si un producto vende mucho pero deja poco margen, es momento de revisar el precio o negociar con el proveedor.' },
              ].map(({ icon, titulo, desc }) => (
                <div key={titulo} className="flex gap-3">
                  <span className="text-lg shrink-0 mt-0.5">{icon}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{titulo}</p>
                    <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-slate-600">¿Dudas? Pedile ayuda a tu administrador.</p>
            <button onClick={() => setShowTutorial(false)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
              Cerrar guía <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="app-card p-4 flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-emerald-400 shrink-0 opacity-70" />
          <div>
            <p className="text-xs text-slate-500">Ganancia neta</p>
            <p className={`text-xl font-bold mt-0.5 ${totalGananciaNeta >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              ${totalGananciaNeta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-slate-600 mt-0.5">Lo que queda después de todo</p>
          </div>
        </div>
        <div className="app-card p-4 flex items-center gap-3">
          <ShoppingCart className="w-8 h-8 text-indigo-400 shrink-0 opacity-70" />
          <div>
            <p className="text-xs text-slate-500">Ventas del período</p>
            <p className="text-xl font-bold text-slate-100 mt-0.5">
              ${brutaResumen.totalVentas.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-slate-600 mt-0.5">Total facturado</p>
          </div>
        </div>
        <div className="app-card p-4 flex items-center gap-3">
          <BarChart2 className="w-8 h-8 text-fuchsia-400 shrink-0 opacity-70" />
          <div>
            <p className="text-xs text-slate-500">Margen bruto</p>
            <p className={`text-xl font-bold mt-0.5 ${margenBruto >= 30 ? 'text-emerald-300' : margenBruto >= 15 ? 'text-amber-300' : 'text-red-300'}`}>
              {margenBruto.toFixed(1)}%
            </p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              {margenBruto >= 30 ? '✅ Margen saludable' : margenBruto >= 15 ? '⚠️ Margen bajo' : '🔴 Margen crítico'}
            </p>
          </div>
        </div>
        <div className="app-card p-4 flex items-center gap-3">
          <Activity className="w-8 h-8 text-cyan-400 shrink-0 opacity-70" />
          <div>
            <p className="text-xs text-slate-500">Artículo más rentable</p>
            {topProducto ? (
              <>
                <p className="text-sm font-semibold text-slate-100 mt-0.5 leading-tight">{topProducto.productoNombre}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {topProducto.margenPorcentaje != null ? `Margen: ${topProducto.margenPorcentaje.toFixed(1)}%` : `Ganancia: $${topProducto.gananciaBruta.toFixed(0)}`}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500 mt-0.5">Sin datos aún</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {/* Tabs principales */}
        <div className="flex gap-1 border-b border-white/10 overflow-x-auto app-scrollbar pb-0">
          {FINANCE_TAB_GUIDES.filter((t) => MAIN_TAB_KEYS.includes(t.key)).map((t) => (
            <button
              key={t.key}
              type="button"
              className={`flex items-center gap-1 px-3 py-2.5 text-sm font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-all shrink-0 ${
                tab === t.key
                  ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowAdvancedTabs((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-all shrink-0 ${
              showAdvancedTabs || ADVANCED_TAB_KEYS.includes(tab)
                ? 'border-amber-400/60 text-amber-300 bg-amber-500/10'
                : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Herramientas
            <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedTabs ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {/* Tabs avanzados (colapsables) */}
        {showAdvancedTabs && (
          <div className="flex flex-wrap gap-1 px-2 py-2 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <span className="text-[11px] text-amber-400 uppercase tracking-wider self-center mr-2">Avanzado:</span>
            {FINANCE_TAB_GUIDES.filter((t) => ADVANCED_TAB_KEYS.includes(t.key)).map((t) => (
              <button
                key={t.key}
                type="button"
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  tab === t.key
                    ? 'bg-amber-500/20 border border-amber-500/40 text-amber-200'
                    : 'bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                }`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeGuide && (
        <div className="rounded-xl border border-white/10 bg-white/3 px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="shrink-0">
            <span className="text-2xl">{activeGuide.label.split(' ')[0]}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200">{activeGuide.label.replace(/^[^\s]+\s/, '')}</p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{activeGuide.queMide}</p>
          </div>
          <div className="hidden md:flex flex-col gap-1 text-xs text-slate-500 shrink-0 max-w-xs">
            <span className="text-[11px] text-slate-600 uppercase tracking-wider">Acción recomendada</span>
            <span className="text-slate-400 leading-relaxed">{activeGuide.accion}</span>
          </div>
        </div>
      )}

      {tab === 'neta' && (
        <div className="app-card finance-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium text-slate-200">Ganancia neta vs. ganancia bruta</div>
              <div className="text-xs text-slate-500 mt-0.5">La línea azul muestra lo que queda después de todos los gastos</div>
            </div>
          </div>
          {chartGananciaNeta.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-slate-500 text-sm">
              Sin datos para el período seleccionado. Probá con un rango más amplio.
            </div>
          ) : (
          <div className="h-72 finance-shimmer">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartGananciaNeta}>
                <XAxis dataKey="fecha" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  wrapperStyle={{ outline: 'none' }}
                  contentStyle={{
                    background: 'rgba(2,6,23,0.92)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: '#e2e8f0',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="ventas"
                  stroke="#4f46e5"
                  fill="#6366f1"
                  fillOpacity={0.25}
                  name="Ventas"
                />
                <Area
                  type="monotone"
                  dataKey="neta"
                  stroke="#06b6d4"
                  fill="#22d3ee"
                  fillOpacity={0.25}
                  name="Ganancia neta"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>
      )}

      {tab === 'bruta' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="app-card finance-card p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Ventas netas</div>
              <div className="text-2xl font-semibold font-data text-slate-100">
                ${brutaResumen.totalVentas.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Descuentos: {brutaResumen.totalDescuentos.toLocaleString(undefined, { maximumFractionDigits: 0 })} -
                Impuestos: {brutaResumen.totalImpuestos.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="app-card finance-card p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Costo productos vendidos</div>
              <div className="text-2xl font-semibold font-data text-cyan-200">
                ${brutaResumen.totalCostoProductos.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-slate-500 mt-2">Costo total del periodo</div>
            </div>
            <div className="app-card finance-card p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Ganancia bruta</div>
              <div className="text-2xl font-semibold font-data text-emerald-200">
                ${brutaResumen.gananciaBruta.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-slate-500 mt-2">Ventas menos costos</div>
            </div>
            <div className="app-card finance-card p-4">
              <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                <span>Margen bruto</span>
                <HelpTooltip>
                  El margen bruto mide que porcentaje de la venta queda despues de restar el costo directo del producto.
                </HelpTooltip>
              </div>
              <div className="text-2xl font-semibold font-data text-fuchsia-200">
                {margenBruto.toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500 mt-2">Ganancia bruta / ventas</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="app-card finance-card p-4 lg:col-span-2">
              <div className="text-sm text-slate-300 mb-2">Ventas, costo y ganancia bruta</div>
              <div className="h-72 finance-shimmer">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartGananciaBruta}>
                    <XAxis dataKey="fecha" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      formatter={(value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      wrapperStyle={{ outline: 'none' }}
                      contentStyle={{
                        background: 'rgba(2,6,23,0.92)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        color: '#e2e8f0',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="ventas"
                      stroke="#4f46e5"
                      fill="#6366f1"
                      fillOpacity={0.2}
                      name="Ventas"
                    />
                    <Area
                      type="monotone"
                      dataKey="costo"
                      stroke="#ef4444"
                      fill="#fca5a5"
                      fillOpacity={0.2}
                      name="Costo productos"
                    />
                    <Line
                      type="monotone"
                      dataKey="bruta"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      name="Ganancia bruta"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="app-card finance-card p-4">
              <div className="text-sm text-slate-300 mb-2">Estructura de ganancia bruta</div>
              <div className="h-72 finance-shimmer">
                {pieVentasCosto.length === 0 ? (
                  <div className="text-sm text-slate-500">Sin datos para el periodo.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieVentasCosto}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={2}
                      >
                        {pieVentasCosto.map((entry, index) => (
                          <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        wrapperStyle={{ outline: 'none' }}
                        contentStyle={{
                          background: 'rgba(2,6,23,0.92)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8,
                          color: '#e2e8f0',
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="app-card finance-card p-4">
              <div className="text-sm text-slate-300 mb-2">Ganancia bruta por categoria</div>
              <div className="h-72 finance-shimmer">
                {pieCategoriasGanancia.length === 0 ? (
                  <div className="text-sm text-slate-500">Sin datos para el periodo.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieCategoriasGanancia}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {pieCategoriasGanancia.map((entry, index) => (
                          <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        wrapperStyle={{ outline: 'none' }}
                        contentStyle={{
                          background: 'rgba(2,6,23,0.92)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8,
                          color: '#e2e8f0',
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div className="app-card finance-card p-4">
              <div className="text-sm text-slate-300 mb-2">Ganancia bruta por producto</div>
              <div className="h-72 finance-shimmer">
                {pieProductosGanancia.length === 0 ? (
                  <div className="text-sm text-slate-500">Sin datos para el periodo.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieProductosGanancia}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {pieProductosGanancia.map((entry, index) => (
                          <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        wrapperStyle={{ outline: 'none' }}
                        contentStyle={{
                          background: 'rgba(2,6,23,0.92)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8,
                          color: '#e2e8f0',
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'costos' && (
        <div className="app-card finance-card p-4">
          <div className="mb-3">
            <div className="text-sm font-medium text-slate-200">Costos de compra por artículo</div>
            <div className="text-xs text-slate-500 mt-0.5">Cuánto gastaste en cada producto durante el período</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2 px-2">Código</th>
                  <th className="py-2 px-2">Producto</th>
                  <th className="py-2 px-2 text-right">Unidades compradas</th>
                  <th className="py-2 px-2 text-right">Costo total</th>
                  <th className="py-2 px-2">Moneda</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {costosProductos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      No hay compras registradas en este período.
                    </td>
                  </tr>
                )}
                {costosProductos.map((r) => (
                  <tr key={r.productoId} className="border-t border-white/10 hover:bg-white/5">
                    <td className="py-2 px-2 font-data text-cyan-200">{r.productoCodigo}</td>
                    <td className="py-2 px-2">{r.productoNombre}</td>
                    <td className="py-2 px-2 text-right font-data">{r.cantidad}</td>
                    <td className="py-2 px-2 text-right font-data">
                      ${r.totalCostos.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 px-2 text-slate-400">{r.moneda}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'categorias' && (
        <div className="app-card finance-card p-4">
          <div className="mb-3">
            <div className="text-sm font-medium text-slate-200">Rentabilidad por rubro</div>
            <div className="text-xs text-slate-500 mt-0.5">Qué familia de productos genera más ganancia en el período</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2 px-2">Categoría</th>
                  <th className="py-2 px-2 text-right">Unidades</th>
                  <th className="py-2 px-2 text-right">Ingresos</th>
                  <th className="py-2 px-2 text-right">Costo</th>
                  <th className="py-2 px-2 text-right">Ganancia</th>
                  <th className="py-2 px-2 text-right">Margen %</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {rentabilidadCategorias.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-500">
                      Sin ventas en el período.
                    </td>
                  </tr>
                )}
                {rentabilidadCategorias.map((c) => (
                  <tr key={c.categoriaId ?? c.categoriaNombre} className="border-t border-white/10 hover:bg-white/5">
                    <td className="py-2 px-2">{c.categoriaNombre}</td>
                    <td className="py-2 px-2 text-right font-data">{c.unidadesVendidas}</td>
                    <td className="py-2 px-2 text-right font-data">
                      ${c.ingresos.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 px-2 text-right font-data">
                      ${c.costoTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 px-2 text-right font-data">
                      ${c.gananciaBruta.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {c.margenPorcentaje != null ? (
                        <span className={`finance-badge ${c.margenPorcentaje >= 30 ? 'high' : c.margenPorcentaje >= 15 ? 'mid' : 'low'}`}>
                          {c.margenPorcentaje.toFixed(1)}%
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'clientes' && (
        <div className="app-card finance-card p-4">
          <div className="mb-3">
            <div className="text-sm font-medium text-slate-200">Rentabilidad por cliente</div>
            <div className="text-xs text-slate-500 mt-0.5">Ventas, ganancia y deuda pendiente de cada cliente — la deuda en rojo requiere atención</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2 px-2">Cliente</th>
                  <th className="py-2 px-2 text-right">Unidades</th>
                  <th className="py-2 px-2 text-right">Ingresos</th>
                  <th className="py-2 px-2 text-right">Costo</th>
                  <th className="py-2 px-2 text-right">Ganancia</th>
                  <th className="py-2 px-2 text-right">Margen %</th>
                  <th className="py-2 px-2 text-right">Deuda</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {rentabilidadClientes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-slate-500">
                      Sin ventas en el período.
                    </td>
                  </tr>
                )}
                {rentabilidadClientes.map((c) => (
                  <tr key={c.clienteId} className="border-t border-white/10 hover:bg-white/5">
                    <td className="py-2 px-2">
                      {c.clienteNombre}
                      {c.clienteApellido ? ` ${c.clienteApellido}` : ''}
                    </td>
                    <td className="py-2 px-2 text-right font-data">{c.unidadesVendidas}</td>
                    <td className="py-2 px-2 text-right font-data">
                      ${c.ingresos.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 px-2 text-right font-data">
                      ${c.costoTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 px-2 text-right font-data">
                      ${c.gananciaBruta.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {c.margenPorcentaje != null ? (
                        <span className={`finance-badge ${c.margenPorcentaje >= 30 ? 'high' : c.margenPorcentaje >= 15 ? 'mid' : 'low'}`}>
                          {c.margenPorcentaje.toFixed(1)}%
                        </span>
                      ) : '-'}
                    </td>
                    <td className={`py-2 px-2 text-right font-data ${c.deuda > 0 ? 'text-rose-300' : 'text-slate-400'}`}>
                      {c.deuda > 0 ? `$${c.deuda.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'cobranzas' && <CobranzasTab />}

        {tab === 'alertas' && (
          <div className="app-card finance-card p-4 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-200">Centro de alertas</div>
                <div className="text-xs text-slate-500">Las rojas son urgentes — resolvelas primero</div>
              </div>
              <div className="flex items-end gap-2">
                <select
                  className="input-modern text-xs h-8"
                  value={alertsStatusFilter}
                  onChange={(e) => setAlertsStatusFilter(e.target.value as 'open' | 'dismissed')}
                >
                  <option value="open">Abiertas</option>
                  <option value="dismissed">Resueltas</option>
                </select>
                <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => loadOwnerAlerts(true)} disabled={alertsLoading}>
                  {alertsLoading ? 'Actualizando...' : 'Actualizar'}
                </Button>
              </div>
            </div>
            {alertsError && <div className="text-xs text-rose-300">{alertsError}</div>}
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs md:text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2 px-2">Severidad</th>
                    <th className="py-2 px-2">Título</th>
                    <th className="py-2 px-2">Detalle</th>
                    <th className="py-2 px-2">Detectada</th>
                    <th className="py-2 px-2">Acción</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {ownerAlertsRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 px-2 text-slate-500">
                        Sin alertas para el estado seleccionado.
                      </td>
                    </tr>
                  )}
                  {ownerAlertsRows.map((a) => (
                    <tr key={a.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="py-2 px-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${ownerSeverityClass(a.severity)}`}>
                          {ownerSeverityLabel(a.severity)}
                        </span>
                      </td>
                      <td className="py-2 px-2">{a.title}</td>
                      <td className="py-2 px-2 text-slate-300">{a.detail || '-'}</td>
                      <td className="py-2 px-2 text-slate-300">{a.detected_at ? new Date(a.detected_at).toLocaleString() : '-'}</td>
                      <td className="py-2 px-2">
                        {alertsStatusFilter === 'open' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleDismissAlert(a.id)}
                            disabled={dismissingAlertId === a.id}
                          >
                            {dismissingAlertId === a.id ? 'Guardando...' : 'Descartar'}
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-500">{a.resolved_at ? new Date(a.resolved_at).toLocaleString() : '-'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'margenes' && (
          <div className="app-card finance-card p-4 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-sm text-slate-300">Márgenes en tiempo real</div>
                <div className="text-xs text-slate-500">Vista por producto, vendedor o depósito</div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <select
                  className="input-modern text-xs h-8"
                  value={marginDimension}
                  onChange={(e) => setMarginDimension(e.target.value as 'producto' | 'vendedor' | 'deposito')}
                >
                  <option value="producto">Producto</option>
                  <option value="vendedor">Vendedor</option>
                  <option value="deposito">Depósito</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={300}
                  className="input-modern text-xs h-8 w-24"
                  value={marginsLimit}
                  onChange={(e) => setMarginsLimit(Number(e.target.value) || 1)}
                />
                <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => loadMargins(true)} disabled={marginsLoading}>
                  {marginsLoading ? 'Actualizando...' : 'Actualizar'}
                </Button>
              </div>
            </div>
            {marginsError && <div className="text-xs text-rose-300">{marginsError}</div>}
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs md:text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2 px-2">Entidad</th>
                    <th className="py-2 px-2 text-right">Ingresos</th>
                    <th className="py-2 px-2 text-right">Costo</th>
                    <th className="py-2 px-2 text-right">Ganancia</th>
                    <th className="py-2 px-2 text-right">Margen %</th>
                    <th className="py-2 px-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {marginRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-3 px-2 text-slate-500">
                        Sin datos de margenes para este rango.
                      </td>
                    </tr>
                  )}
                  {marginRows.map((m) => (
                    <tr key={`${marginDimension}-${m.entity_id}`} className="border-t border-white/10 hover:bg-white/5">
                      <td className="py-2 px-2">{m.entity_name || 'N/A'}</td>
                      <td className="py-2 px-2 text-right font-data">${Number(m.ingresos || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="py-2 px-2 text-right font-data">${Number(m.costo || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="py-2 px-2 text-right font-data">${Number(m.margen || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="py-2 px-2 text-right font-data">{Number(m.margen_pct || 0).toFixed(1)}%</td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${marginClass(Number(m.margen_pct || 0))}`}>
                          {Number(m.margen_pct || 0) >= 25 ? 'Verde' : Number(m.margen_pct || 0) >= 10 ? 'Amarillo' : 'Rojo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'repricing' && <RepricingTab />}

        {tab === 'fiscal' && <FiscalTab />}

        {tab === 'precios' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="app-card finance-card p-4">
                <div className="text-sm text-slate-300 mb-2">Nueva lista de precios</div>
                <form className="grid grid-cols-1 md:grid-cols-2 gap-2" onSubmit={handleCreatePriceList}>
                  <input
                    className="input-modern text-xs md:col-span-2"
                    placeholder="Nombre lista"
                    value={priceListForm.nombre}
                    onChange={(e) => setPriceListForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  />
                  <input
                    className="input-modern text-xs"
                    placeholder="Moneda base"
                    value={priceListForm.moneda_base}
                    onChange={(e) => setPriceListForm((prev) => ({ ...prev, moneda_base: e.target.value }))}
                  />
                  <input
                    className="input-modern text-xs"
                    placeholder="Canal (opcional)"
                    value={priceListForm.canal}
                    onChange={(e) => setPriceListForm((prev) => ({ ...prev, canal: e.target.value }))}
                  />
                  <select
                    className="input-modern text-xs"
                    value={priceListForm.estrategia_actualizacion}
                    onChange={(e) =>
                      setPriceListForm((prev) => ({
                        ...prev,
                        estrategia_actualizacion: e.target.value as PriceListRow['estrategia_actualizacion'],
                      }))
                    }
                  >
                    <option value="manual">Manual</option>
                    <option value="usd">USD</option>
                    <option value="ipc">IPC</option>
                    <option value="proveedor">Proveedor</option>
                    <option value="mixta">Mixta</option>
                  </select>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={priceListForm.activo}
                      onChange={(e) => setPriceListForm((prev) => ({ ...prev, activo: e.target.checked }))}
                    />
                    Activa
                  </label>
                  <div className="md:col-span-2 flex items-center gap-2">
                    <Button type="submit" className="h-8 px-3 text-xs">
                      Guardar lista
                    </Button>
                    <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => loadPriceLists(true)} disabled={priceListLoading}>
                      {priceListLoading ? 'Actualizando...' : 'Actualizar'}
                    </Button>
                  </div>
                </form>
                {priceListError && <div className="text-xs text-rose-300 mt-2">{priceListError}</div>}
                {priceListMsg && <div className="text-xs text-emerald-300 mt-2">{priceListMsg}</div>}
              </div>

              <div className="app-card finance-card p-4">
                <div className="text-sm text-slate-300 mb-2">Listas cargadas</div>
                <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                  {priceLists.length === 0 && <div className="text-xs text-slate-500">Sin listas de precios.</div>}
                  {priceLists.map((pl) => (
                    <div key={pl.id} className="rounded-lg border border-white/10 bg-white/5 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className={`text-xs text-left ${selectedPriceListId === pl.id ? 'text-cyan-200' : 'text-slate-200'}`}
                          onClick={() => setSelectedPriceListId(pl.id)}
                        >
                          {pl.nombre}
                        </button>
                        <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleTogglePriceList(pl)}>
                          {Number(pl.activo || 0) === 1 ? 'Desactivar' : 'Activar'}
                        </Button>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {pl.moneda_base} - {pl.canal || 'all'} - {pl.estrategia_actualizacion}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="app-card finance-card p-4">
                <div className="text-sm text-slate-300 mb-2">Nueva regla de lista</div>
                <form className="grid grid-cols-1 md:grid-cols-2 gap-2" onSubmit={handleCreatePriceRule}>
                  <select
                    className="input-modern text-xs"
                    value={priceRuleForm.tipo_regla}
                    onChange={(e) =>
                      setPriceRuleForm((prev) => ({
                        ...prev,
                        tipo_regla: e.target.value as PriceListRuleRow['tipo_regla'],
                      }))
                    }
                  >
                    <option value="markup_pct">Markup %</option>
                    <option value="markup_fijo">Markup fijo</option>
                    <option value="usd">USD</option>
                    <option value="ipc">IPC</option>
                    <option value="proveedor">Proveedor</option>
                    <option value="canal">Canal</option>
                  </select>
                  <input
                    className="input-modern text-xs"
                    placeholder="Prioridad"
                    value={priceRuleForm.prioridad}
                    onChange={(e) => setPriceRuleForm((prev) => ({ ...prev, prioridad: e.target.value }))}
                  />
                  <input
                    className="input-modern text-xs"
                    placeholder="Valor parametro"
                    value={priceRuleForm.valor}
                    onChange={(e) => setPriceRuleForm((prev) => ({ ...prev, valor: e.target.value }))}
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={priceRuleForm.activo}
                      onChange={(e) => setPriceRuleForm((prev) => ({ ...prev, activo: e.target.checked }))}
                    />
                    Activa
                  </label>
                  <Button type="submit" className="h-8 px-3 text-xs md:col-span-2" disabled={!selectedPriceListId}>
                    Guardar regla
                  </Button>
                </form>
                <div className="text-xs text-slate-500 mt-2">
                  Lista seleccionada: {selectedPriceListId || '-'}
                </div>
              </div>

              <div className="app-card finance-card p-4">
                <div className="text-sm text-slate-300 mb-2">Reglas de la lista</div>
                <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                  {priceListRules.length === 0 && <div className="text-xs text-slate-500">Sin reglas cargadas.</div>}
                  {priceListRules.map((r) => (
                    <div key={r.id} className="rounded-lg border border-white/10 bg-white/5 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-slate-200">
                          {r.tipo_regla} (prio {r.prioridad})
                        </div>
                        <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleTogglePriceRule(r)}>
                          {Number(r.activo || 0) === 1 ? 'Desactivar' : 'Activar'}
                        </Button>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {JSON.stringify(r.parametros || {})}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="app-card finance-card p-4 space-y-3">
              <div className="flex items-end gap-2">
                <input
                  type="number"
                  min={1}
                  className="input-modern text-xs w-24"
                  value={priceListPreviewLimit}
                  onChange={(e) => setPriceListPreviewLimit(Number(e.target.value) || 1)}
                />
                <Button type="button" className="h-8 px-3 text-xs" onClick={handlePreviewPriceList} disabled={priceListPreviewLoading || !selectedPriceListId}>
                  {priceListPreviewLoading ? 'Simulando...' : 'Simular lista'}
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs md:text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2 px-2">Producto</th>
                      <th className="py-2 px-2 text-right">Actual</th>
                      <th className="py-2 px-2 text-right">Lista</th>
                      <th className="py-2 px-2 text-right">Variacion %</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {priceListPreviewRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-3 px-2 text-slate-500">
                          Ejecuta simulacion para ver preview.
                        </td>
                      </tr>
                    )}
                    {priceListPreviewRows.map((r) => (
                      <tr key={r.producto_id} className="border-t border-white/10 hover:bg-white/5">
                        <td className="py-2 px-2">{r.producto}</td>
                        <td className="py-2 px-2 text-right font-data">${Number(r.precio_actual || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="py-2 px-2 text-right font-data">${Number(r.precio_lista || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="py-2 px-2 text-right font-data">{Number(r.variacion_pct || 0).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'integraciones' && (
          <div className="space-y-4">
            <div className="app-card finance-card p-4 space-y-3">
              <div className="text-sm text-slate-300">Integraciones de canales</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                <select
                  className="input-modern text-xs"
                  value={integrationForm.canal}
                  onChange={(e) =>
                    setIntegrationForm((prev) => ({
                      ...prev,
                      canal: e.target.value as 'mercadolibre' | 'tiendanube' | 'whatsapp_catalog',
                    }))
                  }
                >
                  <option value="mercadolibre">Mercado Libre</option>
                  <option value="tiendanube">Tienda Nube</option>
                  <option value="whatsapp_catalog">WhatsApp Catalog</option>
                </select>
                <select
                  className="input-modern text-xs"
                  value={integrationForm.estado}
                  onChange={(e) =>
                    setIntegrationForm((prev) => ({
                      ...prev,
                      estado: e.target.value as 'disconnected' | 'connected' | 'error',
                    }))
                  }
                >
                  <option value="connected">Connected</option>
                  <option value="disconnected">Disconnected</option>
                  <option value="error">Error</option>
                </select>
                <input
                  className="input-modern text-xs"
                  placeholder="secret_ref"
                  value={integrationForm.secret_ref}
                  onChange={(e) => setIntegrationForm((prev) => ({ ...prev, secret_ref: e.target.value }))}
                />
                <input
                  className="input-modern text-xs"
                  placeholder="job_type"
                  value={integrationForm.job_type}
                  onChange={(e) => setIntegrationForm((prev) => ({ ...prev, job_type: e.target.value }))}
                />
                <select
                  className="input-modern text-xs"
                  value={integrationJobStatus}
                  onChange={(e) =>
                    setIntegrationJobStatus(
                      e.target.value as 'all' | 'pending' | 'running' | 'done' | 'failed'
                    )
                  }
                >
                  <option value="all">Jobs: all</option>
                  <option value="pending">Pending</option>
                  <option value="running">Running</option>
                  <option value="done">Done</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <textarea
                className="input-modern text-xs w-full min-h-20"
                value={integrationForm.config_json}
                onChange={(e) => setIntegrationForm((prev) => ({ ...prev, config_json: e.target.value }))}
                placeholder='Config JSON, ej: {"token":"abc"}'
              />
              <div className="flex items-center gap-2">
                <Button type="button" className="h-8 px-3 text-xs" onClick={handleSaveIntegration}>
                  Guardar integracion
                </Button>
                <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={handleQueueIntegrationSync}>
                  Encolar sync
                </Button>
                <Button type="button" variant="ghost" className="h-8 px-3 text-xs" onClick={() => loadIntegrations(true)} disabled={integrationLoading}>
                  {integrationLoading ? 'Actualizando...' : 'Actualizar'}
                </Button>
              </div>
              {integrationError && <div className="text-xs text-rose-300">{integrationError}</div>}
              {integrationMsg && <div className="text-xs text-emerald-300">{integrationMsg}</div>}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="app-card finance-card p-4">
                <div className="text-sm text-slate-300 mb-2">Canales</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs md:text-sm">
                    <thead className="text-left text-slate-500">
                      <tr>
                        <th className="py-2 px-2">Canal</th>
                        <th className="py-2 px-2">Estado</th>
                        <th className="py-2 px-2">Ultimo sync</th>
                        <th className="py-2 px-2">Error</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-200">
                      {integrations.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-3 px-2 text-slate-500">
                            Sin integraciones registradas.
                          </td>
                        </tr>
                      )}
                      {integrations.map((i) => (
                        <tr key={i.canal} className="border-t border-white/10 hover:bg-white/5">
                          <td className="py-2 px-2">{i.canal}</td>
                          <td className="py-2 px-2">{i.estado}</td>
                          <td className="py-2 px-2">{i.last_sync_at ? new Date(i.last_sync_at).toLocaleString() : '-'}</td>
                          <td className="py-2 px-2 text-rose-300">{i.last_error || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="app-card finance-card p-4">
                <div className="text-sm text-slate-300 mb-2">Jobs de sincronizacion</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs md:text-sm">
                    <thead className="text-left text-slate-500">
                      <tr>
                        <th className="py-2 px-2">Canal</th>
                        <th className="py-2 px-2">Tipo</th>
                        <th className="py-2 px-2">Estado</th>
                        <th className="py-2 px-2 text-right">Intentos</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-200">
                      {integrationJobs.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-3 px-2 text-slate-500">
                            Sin jobs para el filtro actual.
                          </td>
                        </tr>
                      )}
                      {integrationJobs.map((j) => (
                        <tr key={j.id} className="border-t border-white/10 hover:bg-white/5">
                          <td className="py-2 px-2">{j.canal}</td>
                          <td className="py-2 px-2">{j.job_type}</td>
                          <td className="py-2 px-2">{j.status}</td>
                          <td className="py-2 px-2 text-right">{j.attempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'beta' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="app-card finance-card p-3">
                <div className="text-[11px] text-slate-400 uppercase">Empresas beta</div>
                <div className="text-lg font-semibold font-data text-slate-100">
                  {Number(betaMetrics?.companies?.total_companies || 0)}
                </div>
              </div>
              <div className="app-card finance-card p-3">
                <div className="text-[11px] text-slate-400 uppercase">Activas</div>
                <div className="text-lg font-semibold font-data text-emerald-200">
                  {Number(betaMetrics?.companies?.active_companies || 0)}
                </div>
              </div>
              <div className="app-card finance-card p-3">
                <div className="text-[11px] text-slate-400 uppercase">NPS promedio</div>
                <div className="text-lg font-semibold font-data text-cyan-200">
                  {Number(betaMetrics?.companies?.avg_nps || 0).toFixed(2)}
                </div>
              </div>
              <div className="app-card finance-card p-3">
                <div className="text-[11px] text-slate-400 uppercase">Impacto feedback</div>
                <div className="text-lg font-semibold font-data text-amber-200">
                  {Number(betaMetrics?.feedback?.avg_impact || 0).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="app-card finance-card p-4">
                <div className="text-sm text-slate-300 mb-2">Nueva empresa beta</div>
                <form className="grid grid-cols-1 md:grid-cols-2 gap-2" onSubmit={handleCreateBetaCompany}>
                  <input className="input-modern text-xs md:col-span-2" placeholder="Nombre" value={betaCompanyForm.nombre} onChange={(e) => setBetaCompanyForm((prev) => ({ ...prev, nombre: e.target.value }))} />
                  <input className="input-modern text-xs" placeholder="CUIT" value={betaCompanyForm.cuit} onChange={(e) => setBetaCompanyForm((prev) => ({ ...prev, cuit: e.target.value }))} />
                  <input className="input-modern text-xs" placeholder="Segmento" value={betaCompanyForm.segmento} onChange={(e) => setBetaCompanyForm((prev) => ({ ...prev, segmento: e.target.value }))} />
                  <input className="input-modern text-xs" placeholder="Tamano equipo" value={betaCompanyForm.tamano_equipo} onChange={(e) => setBetaCompanyForm((prev) => ({ ...prev, tamano_equipo: e.target.value }))} />
                  <select className="input-modern text-xs" value={betaCompanyForm.estado} onChange={(e) => setBetaCompanyForm((prev) => ({ ...prev, estado: e.target.value as BetaCompanyRow['estado'] }))}>
                    <option value="invited">Invited</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="churned">Churned</option>
                  </select>
                  <input className="input-modern text-xs md:col-span-2" placeholder="NPS (opcional)" value={betaCompanyForm.nps_score} onChange={(e) => setBetaCompanyForm((prev) => ({ ...prev, nps_score: e.target.value }))} />
                  <div className="md:col-span-2 flex items-center gap-2">
                    <Button type="submit" className="h-8 px-3 text-xs">Crear empresa</Button>
                    <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => loadBeta(true)} disabled={betaLoading}>
                      {betaLoading ? 'Actualizando...' : 'Actualizar'}
                    </Button>
                  </div>
                </form>
              </div>

              <div className="app-card finance-card p-4">
                <div className="text-sm text-slate-300 mb-2">Registrar feedback beta</div>
                <form className="grid grid-cols-1 md:grid-cols-2 gap-2" onSubmit={handleCreateBetaFeedback}>
                  <select className="input-modern text-xs md:col-span-2" value={betaFeedbackForm.company_id} onChange={(e) => setBetaFeedbackForm((prev) => ({ ...prev, company_id: e.target.value }))}>
                    <option value="">Seleccionar empresa</option>
                    {betaCompanies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                  <input className="input-modern text-xs" placeholder="Modulo" value={betaFeedbackForm.modulo} onChange={(e) => setBetaFeedbackForm((prev) => ({ ...prev, modulo: e.target.value }))} />
                  <input className="input-modern text-xs" placeholder="Impacto (1-5)" value={betaFeedbackForm.impacto_score} onChange={(e) => setBetaFeedbackForm((prev) => ({ ...prev, impacto_score: e.target.value }))} />
                  <textarea className="input-modern text-xs md:col-span-2 min-h-20" placeholder="Comentario" value={betaFeedbackForm.comentario} onChange={(e) => setBetaFeedbackForm((prev) => ({ ...prev, comentario: e.target.value }))} />
                  <Button type="submit" className="h-8 px-3 text-xs md:col-span-2">Guardar feedback</Button>
                </form>
              </div>
            </div>
            {betaError && <div className="text-xs text-rose-300">{betaError}</div>}
            {betaMsg && <div className="text-xs text-emerald-300">{betaMsg}</div>}
            <div className="app-card finance-card p-4">
              <div className="text-sm text-slate-300 mb-2">Empresas del programa beta</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs md:text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2 px-2">Empresa</th>
                      <th className="py-2 px-2">Segmento</th>
                      <th className="py-2 px-2">Estado</th>
                      <th className="py-2 px-2 text-right">NPS</th>
                      <th className="py-2 px-2">Ultimo feedback</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {betaCompanies.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-3 px-2 text-slate-500">
                          Sin empresas beta cargadas.
                        </td>
                      </tr>
                    )}
                    {betaCompanies.map((c) => (
                      <tr key={c.id} className="border-t border-white/10 hover:bg-white/5">
                        <td className="py-2 px-2">{c.nombre}</td>
                        <td className="py-2 px-2">{c.segmento || '-'}</td>
                        <td className="py-2 px-2">{c.estado}</td>
                        <td className="py-2 px-2 text-right">{c.nps_score == null ? '-' : Number(c.nps_score).toFixed(0)}</td>
                        <td className="py-2 px-2">{c.last_feedback_at ? new Date(c.last_feedback_at).toLocaleString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'release' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="app-card finance-card p-4">
                <div className="text-sm text-slate-300 mb-2">Nuevo ciclo</div>
                <form className="space-y-2" onSubmit={handleCreateReleaseCycle}>
                  <input className="input-modern text-xs w-full" placeholder="Codigo" value={releaseForm.codigo} onChange={(e) => setReleaseForm((prev) => ({ ...prev, codigo: e.target.value }))} />
                  <input className="input-modern text-xs w-full" placeholder="Mes YYYY-MM" value={releaseForm.mes} onChange={(e) => setReleaseForm((prev) => ({ ...prev, mes: e.target.value }))} />
                  <textarea className="input-modern text-xs w-full min-h-20" placeholder='Objetivos JSON {"north_star":"..."}' value={releaseForm.objetivos_json} onChange={(e) => setReleaseForm((prev) => ({ ...prev, objetivos_json: e.target.value }))} />
                  <Button type="submit" className="h-8 px-3 text-xs">Crear ciclo</Button>
                </form>
              </div>
              <div className="app-card finance-card p-4">
                <div className="text-sm text-slate-300 mb-2">Agregar changelog entry</div>
                <form className="space-y-2" onSubmit={handleAddReleaseEntry}>
                  <select className="input-modern text-xs w-full" value={releaseEntryForm.cycle_id} onChange={(e) => setReleaseEntryForm((prev) => ({ ...prev, cycle_id: e.target.value }))}>
                    <option value="">Seleccionar ciclo</option>
                    {releaseCycles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codigo} ({c.mes})
                      </option>
                    ))}
                  </select>
                  <input className="input-modern text-xs w-full" placeholder="Categoria" value={releaseEntryForm.categoria} onChange={(e) => setReleaseEntryForm((prev) => ({ ...prev, categoria: e.target.value }))} />
                  <input className="input-modern text-xs w-full" placeholder="Título" value={releaseEntryForm.titulo} onChange={(e) => setReleaseEntryForm((prev) => ({ ...prev, titulo: e.target.value }))} />
                  <textarea className="input-modern text-xs w-full min-h-20" placeholder="Impacto negocio" value={releaseEntryForm.impacto_negocio} onChange={(e) => setReleaseEntryForm((prev) => ({ ...prev, impacto_negocio: e.target.value }))} />
                  <input className="input-modern text-xs w-full" placeholder="KPI target" value={releaseEntryForm.kpi_target} onChange={(e) => setReleaseEntryForm((prev) => ({ ...prev, kpi_target: e.target.value }))} />
                  <Button type="submit" className="h-8 px-3 text-xs">Agregar entry</Button>
                </form>
              </div>
              <div className="app-card finance-card p-4">
                <div className="text-sm text-slate-300 mb-2">Cerrar ciclo</div>
                <form className="space-y-2" onSubmit={handleCloseReleaseCycle}>
                  <select className="input-modern text-xs w-full" value={releaseCloseForm.cycle_id} onChange={(e) => setReleaseCloseForm((prev) => ({ ...prev, cycle_id: e.target.value }))}>
                    <option value="">Seleccionar ciclo</option>
                    {releaseCycles.filter((c) => c.estado === 'open').map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codigo} ({c.mes})
                      </option>
                    ))}
                  </select>
                  <textarea className="input-modern text-xs w-full min-h-28" placeholder="Resumen de changelog de negocio" value={releaseCloseForm.changelog_resumen} onChange={(e) => setReleaseCloseForm((prev) => ({ ...prev, changelog_resumen: e.target.value }))} />
                  <div className="flex items-center gap-2">
                    <Button type="submit" className="h-8 px-3 text-xs">Cerrar ciclo</Button>
                    <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => loadRelease(true)} disabled={releaseLoading}>
                      {releaseLoading ? 'Actualizando...' : 'Actualizar'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
            {releaseError && <div className="text-xs text-rose-300">{releaseError}</div>}
            {releaseMsg && <div className="text-xs text-emerald-300">{releaseMsg}</div>}
            <div className="app-card finance-card p-4">
              <div className="text-sm text-slate-300 mb-2">Ciclos release train</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs md:text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2 px-2">Codigo</th>
                      <th className="py-2 px-2">Mes</th>
                      <th className="py-2 px-2">Estado</th>
                      <th className="py-2 px-2">Resumen</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {releaseCycles.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-3 px-2 text-slate-500">
                          Sin ciclos de release.
                        </td>
                      </tr>
                    )}
                    {releaseCycles.map((c) => (
                      <tr key={c.id} className="border-t border-white/10 hover:bg-white/5">
                        <td className="py-2 px-2">{c.codigo}</td>
                        <td className="py-2 px-2">{c.mes}</td>
                        <td className="py-2 px-2">{c.estado}</td>
                        <td className="py-2 px-2 text-slate-300">{c.changelog_resumen || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'ofertas' && (
          <div className="space-y-4">
            <div className="app-card finance-card p-4 space-y-3">
              <div className="text-sm text-slate-300">Motor de ofertas</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select
                  className="input-modern text-xs"
                  value={offerSelectedAlianzaId ?? ''}
                  onChange={(e) => setOfferSelectedAlianzaId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Seleccionar alianza</option>
                  {offerAlianzas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre || `Alianza #${a.id}`} {a.pyme_nombre ? `- ${a.pyme_nombre}` : ''}
                    </option>
                  ))}
                </select>
                <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => loadOffersHub(true)} disabled={offerLoading}>
                  {offerLoading ? 'Actualizando...' : 'Actualizar'}
                </Button>
              </div>
              <form className="grid grid-cols-1 md:grid-cols-3 gap-2" onSubmit={handleCreateOfferHub}>
                <input className="input-modern text-xs" placeholder="Nombre oferta" value={offerForm.nombre} onChange={(e) => setOfferForm((prev) => ({ ...prev, nombre: e.target.value }))} />
                <input className="input-modern text-xs" placeholder="Descripcion" value={offerForm.descripcion} onChange={(e) => setOfferForm((prev) => ({ ...prev, descripcion: e.target.value }))} />
                <input className="input-modern text-xs" placeholder="Precio fijo (opcional)" value={offerForm.precio_fijo} onChange={(e) => setOfferForm((prev) => ({ ...prev, precio_fijo: e.target.value }))} />
                <Button type="submit" className="h-8 px-3 text-xs md:col-span-3" disabled={!offerSelectedAlianzaId}>
                  Crear oferta
                </Button>
              </form>
              {offerError && <div className="text-xs text-rose-300">{offerError}</div>}
              {offerMsg && <div className="text-xs text-emerald-300">{offerMsg}</div>}
            </div>

            <div className="app-card finance-card p-4">
              <div className="text-sm text-slate-300 mb-2">Ofertas de la alianza</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs md:text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2 px-2">Nombre</th>
                      <th className="py-2 px-2">Descripción</th>
                      <th className="py-2 px-2 text-right">Precio fijo</th>
                      <th className="py-2 px-2">Estado</th>
                      <th className="py-2 px-2">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {offerRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-3 px-2 text-slate-500">
                          Sin ofertas para la alianza seleccionada.
                        </td>
                      </tr>
                    )}
                    {offerRows.map((o) => (
                      <tr key={o.id} className="border-t border-white/10 hover:bg-white/5">
                        <td className="py-2 px-2">{o.nombre}</td>
                        <td className="py-2 px-2">{o.descripcion || '-'}</td>
                        <td className="py-2 px-2 text-right">{o.precio_fijo == null ? '-' : `$${Number(o.precio_fijo).toFixed(2)}`}</td>
                        <td className="py-2 px-2">{o.activo ? 'Activa' : 'Inactiva'}</td>
                        <td className="py-2 px-2">
                          <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleToggleOfferHub(o)}>
                            {o.activo ? 'Desactivar' : 'Activar'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'cashflow' && (
          <div className="app-card finance-card p-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <div className="text-sm text-slate-300 mb-1">Flujo de caja diario</div>
                <div className="text-xs text-slate-500">
                  Saldo inicial:{' '}
                  <span className="font-medium text-slate-200 dark:text-slate-200">
                    {saldoInicial.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  {' — '}Saldo mínimo:{' '}
                  <span className="font-medium text-slate-200 dark:text-slate-200">
                    {saldoMinimo.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  {' — '}Saldo máximo:{' '}
                  <span className="font-medium text-slate-200 dark:text-slate-200">
                    {saldoMaximo.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  Días por debajo del umbral ({umbralMinimo.toLocaleString(undefined, { maximumFractionDigits: 0 })}):{' '}
                  <span className="font-medium text-slate-200 dark:text-slate-200">
                    {diasPorDebajoUmbral}
                  </span>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  className="h-9 px-3 text-xs"
                  onClick={() => loadOwnerCenter(true)}
                  disabled={ownerCenterLoading}
                >
                  {ownerCenterLoading ? 'Actualizando...' : 'Actualizar'}
                </Button>
              </div>
            </div>

            <div className="border border-white/10 rounded-xl p-3 space-y-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Centro de mando del dueño
              </div>
              {ownerCenterError && (
                <div className="text-xs text-rose-300">{ownerCenterError}</div>
              )}
              {!ownerCenter && !ownerCenterLoading && !ownerCenterError && (
                <div className="text-xs text-slate-500">Sin datos del centro de mando.</div>
              )}
              {ownerCenter && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] text-slate-400 uppercase">Caja hoy</div>
                      <div className="text-lg font-semibold font-data text-slate-100">
                        ${Number(ownerCenter.caja_actual || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5">Saldo actual</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] text-slate-400 uppercase">Proyección 7 días</div>
                      <div className="text-lg font-semibold font-data text-cyan-200">
                        ${Number(ownerCenter.proyeccion_caja?.['7'] ?? ownerCenter.proyeccion_caja?.[7] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5">Estimado próxima semana</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] text-slate-400 uppercase">Proyección 30 días</div>
                      <div className="text-lg font-semibold font-data text-cyan-200">
                        ${Number(ownerCenter.proyeccion_caja?.['30'] ?? ownerCenter.proyeccion_caja?.[30] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5">Estimado próximo mes</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] text-slate-400 uppercase">Proyección 90 días</div>
                      <div className="text-lg font-semibold font-data text-cyan-200">
                        ${Number(ownerCenter.proyeccion_caja?.['90'] ?? ownerCenter.proyeccion_caja?.[90] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5">Estimado próximo trimestre</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] text-slate-400 uppercase">Ingreso diario promedio</div>
                      <div className="text-lg font-semibold font-data text-emerald-200">
                        ${Number(ownerCenter.promedio_neto_diario || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5">Por día en el período</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs md:text-sm">
                      <thead className="text-left text-slate-500">
                        <tr>
                          <th className="py-2 px-2">Severidad</th>
                          <th className="py-2 px-2">Alerta</th>
                          <th className="py-2 px-2">Detalle</th>
                          <th className="py-2 px-2">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-200">
                        {(ownerCenter.alertas || []).length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-3 px-2 text-slate-500">
                              Sin alertas accionables.
                            </td>
                          </tr>
                        )}
                        {(ownerCenter.alertas || []).map((a, idx) => (
                          <tr key={`${a.alert_code}-${idx}`} className="border-t border-white/10 hover:bg-white/5">
                            <td className="py-2 px-2">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${ownerSeverityClass(a.severity)}`}>
                                {ownerSeverityLabel(a.severity)}
                              </span>
                            </td>
                            <td className="py-2 px-2">{a.title}</td>
                            <td className="py-2 px-2 text-slate-300">{a.detail || '-'}</td>
                            <td className="py-2 px-2 text-slate-300">
                              {a.action_label || '-'}
                              {a.action_path ? ` (${a.action_path})` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="h-72 finance-shimmer">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartCashflow}>
                  <XAxis dataKey="fecha" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    wrapperStyle={{ outline: 'none' }}
                    contentStyle={{
                      background: 'rgba(2,6,23,0.92)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      color: '#e2e8f0',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="entradas"
                    stroke="#22c55e"
                    fill="#22c55e"
                    fillOpacity={0.25}
                    name="Entradas"
                  />
                  <Area
                    type="monotone"
                    dataKey="salidas"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.18}
                    name="Salidas"
                  />
                  <Area
                    type="monotone"
                    dataKey="saldo"
                    stroke="#0ea5e9"
                    fill="#0ea5e9"
                    fillOpacity={0.12}
                    name="Saldo acumulado"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {tab === 'presupuestos' && <PresupuestosTab presupuestoCategorias={presupuestoCategorias} />}

        {tab === 'producto' && (
        <div className="app-card finance-card p-4">
          <div className="text-sm text-slate-300 mb-2">Top productos por ganancia bruta</div>
          <div className="h-72 mb-4 finance-shimmer">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={productosRentables.map((p) => ({
                  nombre: p.productoNombre,
                  ganancia: p.gananciaBruta,
                }))}
                margin={{ left: 0, right: 0 }}
              >
                <XAxis dataKey="nombre" hide />
                <YAxis />
                <Tooltip
                  wrapperStyle={{ outline: 'none' }}
                  contentStyle={{
                    background: 'rgba(2,6,23,0.92)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: '#e2e8f0',
                  }}
                />
                <Bar dataKey="ganancia" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2 px-2">Código</th>
                  <th className="py-2 px-2">Producto</th>
                  <th className="py-2 px-2 text-right">Unidades</th>
                  <th className="py-2 px-2 text-right">Ingresos</th>
                  <th className="py-2 px-2 text-right">Costo</th>
                  <th className="py-2 px-2 text-right">Ganancia</th>
                  <th className="py-2 px-2 text-right">Margen %</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {productosRentables.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-slate-500">
                      Sin ventas en el período.
                    </td>
                  </tr>
                )}
                {productosRentables.map((p) => (
                  <tr key={p.productoId} className="border-t border-white/10 hover:bg-white/5">
                    <td className="py-2 px-2 font-data text-cyan-200">{p.productoCodigo}</td>
                    <td className="py-2 px-2">{p.productoNombre}</td>
                    <td className="py-2 px-2 text-right font-data">{p.unidadesVendidas}</td>
                    <td className="py-2 px-2 text-right font-data">
                      {p.ingresos.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 px-2 text-right font-data">
                      {p.costoTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 px-2 text-right font-data">
                      {p.gananciaBruta.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {p.margenPorcentaje != null ? (
                        <span className={`finance-badge ${p.margenPorcentaje >= 40 ? 'high' : p.margenPorcentaje >= 20 ? 'mid' : 'low'}`}>
                          {p.margenPorcentaje.toFixed(1)}%
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && (
        <div className="text-xs text-slate-500">
          Cargando datos financieros...
        </div>
      )}
    </div>
  );
}

