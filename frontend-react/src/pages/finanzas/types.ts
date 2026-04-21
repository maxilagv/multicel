export type PeriodKey = '24h' | '7d' | '30d' | 'custom';
export type TabKey =
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

export type FinanceTabGuide = {
  key: TabKey;
  label: string;
  queMide: string;
  comoLeer: string;
  accion: string;
};

export type SerieGananciaNeta = {
  fecha: string;
  totalVentas: number;
  totalCostoProductos: number;
  totalGastos: number;
  totalInversiones: number;
  gananciaBruta: number;
  gananciaNeta: number;
};

export type SerieGananciaBruta = {
  fecha: string;
  totalVentas: number;
  totalCostoProductos: number;
  gananciaBruta: number;
};

export type DetalleGananciaPorProducto = {
  productoId: number;
  productoCodigo: string;
  productoNombre: string;
  unidadesVendidas: number;
  ingresos: number;
  costoTotal: number;
  gananciaBruta: number;
  margenPorcentaje: number | null;
};

export type DetalleCostosProducto = {
  productoId: number;
  productoCodigo: string;
  productoNombre: string;
  moneda: string;
  cantidad: number;
  totalCostos: number;
};

export type DetalleRentabilidadCategoria = {
  categoriaId: number | null;
  categoriaNombre: string;
  unidadesVendidas: number;
  ingresos: number;
  costoTotal: number;
  gananciaBruta: number;
  margenPorcentaje: number | null;
};

export type DetalleRentabilidadCliente = {
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

export type DeudaClienteResumen = {
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

export type VentaPendiente = {
  ventaId: number;
  fecha: string;
  neto: number;
  totalPagado: number;
  saldo: number;
  dias: number;
};

export type DeudaProveedorResumen = {
  proveedorId: number;
  proveedorNombre: string;
  deudaTotal: number;
  deuda0_30: number;
  deuda31_60: number;
  deuda61_90: number;
  deudaMas90: number;
  diasPromedioAtraso: number | null;
};

export type PuntoCashflow = {
  fecha: string;
  entradas: number;
  salidas: number;
  saldoAcumulado: number;
};

export type PresupuestoRow = {
  id?: number;
  anio: number;
  mes: number;
  tipo: string;
  categoria: string;
  monto: number;
};

export type PresupuestoVsRealRow = {
  tipo: string;
  categoria: string;
  presupuesto: number;
  real: number;
  diferencia: number;
};

export type PresupuestoTotales = {
  presupuestoVentas: number;
  realVentas: number;
  presupuestoGastos: number;
  realGastos: number;
};

export type PresupuestoCategorias = {
  ventas: string[];
  gastos: string[];
};

export type BrutaResumen = {
  totalVentas: number;
  totalCostoProductos: number;
  gananciaBruta: number;
  totalDescuentos: number;
  totalImpuestos: number;
};

export type SimuladorResultado = {
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

export type OwnerCenterAlert = {
  alert_code: string;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  detail?: string;
  action_label?: string;
  action_path?: string;
};

export type OwnerCommandCenter = {
  caja_actual: number;
  promedio_neto_diario: number;
  proyeccion_caja: Record<string, number>;
  deuda?: { total?: number; mas_90?: number };
  stock_breaks?: any[];
  alertas?: OwnerCenterAlert[];
};

export type RiskRankingRow = {
  cliente_id: number;
  nombre?: string;
  apellido?: string;
  deuda_pendiente: number;
  deuda_mas_90: number;
  dias_promedio_atraso: number;
  score: number;
  bucket: 'critical' | 'high' | 'medium' | 'low';
};

export type PromiseRow = {
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

export type ReminderRow = {
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

export type OwnerAlertRow = {
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

export type MarginRow = {
  entity_id: number;
  entity_name: string;
  ingresos: number;
  costo: number;
  margen: number;
  margen_pct: number;
};

export type RepricingRuleRow = {
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

export type RepricingPreviewRow = {
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

export type FiscalRuleRow = {
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

export type FiscalSimulationResult = {
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

export type PriceListRow = {
  id: number;
  nombre: string;
  moneda_base: string;
  canal?: string | null;
  estrategia_actualizacion: 'manual' | 'usd' | 'ipc' | 'proveedor' | 'mixta';
  activo: number;
};

export type PriceListRuleRow = {
  id: number;
  price_list_id: number;
  tipo_regla: 'usd' | 'ipc' | 'proveedor' | 'canal' | 'markup_fijo' | 'markup_pct';
  prioridad: number;
  parametros?: Record<string, any>;
  activo: number;
};

export type PriceListPreviewRow = {
  producto_id: number;
  producto: string;
  precio_actual: number;
  precio_lista: number;
  variacion_pct: number;
};

export type ChannelIntegrationRow = {
  id: number;
  canal: 'mercadolibre' | 'tiendanube' | 'whatsapp_catalog';
  estado: 'disconnected' | 'connected' | 'error';
  config?: Record<string, any>;
  secret_ref?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
};

export type ChannelJobRow = {
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

export type BetaCompanyRow = {
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

export type BetaMetrics = {
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

export type ReleaseCycleRow = {
  id: number;
  codigo: string;
  mes: string;
  estado: 'open' | 'closed';
  objetivos?: Record<string, any>;
  changelog_resumen?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
};

export type MarketplaceAlianzaLite = {
  id: number;
  nombre?: string | null;
  pyme_nombre?: string | null;
  estado?: string | null;
};

export type MarketplaceOfferLite = {
  id: number;
  alianza_id: number;
  nombre: string;
  descripcion?: string | null;
  precio_fijo?: number | null;
  activo: boolean | number;
};
