/**
 * Tipos TypeScript para las entidades del dominio.
 * Importar desde aquí en lugar de definir `any` en cada componente.
 */

export interface Cliente {
  id: number;
  nombre: string;
  apellido?: string | null;
  telefono?: string | null;
  telefono_e164?: string | null;
  whatsapp_opt_in?: boolean | number;
  whatsapp_status?: string | null;
  email?: string | null;
  direccion?: string | null;
  entre_calles?: string | null;
  cuit_cuil?: string | null;
  condicion_iva?: string | null;
  provincia?: string | null;
  localidad?: string | null;
  tipo_cliente?: 'minorista' | 'mayorista' | 'distribuidor';
  segmento?: string | null;
  tags?: string | null;
  estado: 'activo' | 'inactivo';
  fecha_registro?: string | null;
}

export interface Producto {
  id: number;
  name: string;
  codigo?: string | null;
  price: number;
  price_local?: number | null;
  price_distribuidor?: number | null;
  precio_final?: number | null;
  costo_pesos?: number | null;
  costo_dolares?: number | null;
  stock_quantity?: number | null;
  stock_minimo?: number | null;
  category_name?: string | null;
  categoria_id?: number | null;
  activo?: boolean | number;
}

export interface Venta {
  id: number;
  cliente_id: number;
  cliente_nombre: string;
  fecha: string;
  total: number;
  descuento: number;
  impuestos: number;
  neto: number;
  estado_pago: 'pendiente' | 'parcial' | 'pagado' | 'cancelado';
  estado_entrega?: 'pendiente' | 'entregado';
  oculto?: boolean | number;
  es_reserva?: boolean | number;
  total_pagado?: number;
  saldo_pendiente?: number;
  price_list_type?: 'local' | 'distribuidor' | 'final' | null;
  caja_tipo?: 'home_office' | 'sucursal';
}

export interface VentaDetalle {
  id: number;
  producto_id: number;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  descuento_oferta?: number;
  subtotal_neto?: number;
}

export interface Compra {
  id: number;
  proveedor_id?: number | null;
  proveedor_nombre?: string | null;
  fecha: string;
  total_costo: number;
  estado?: string;
}

export interface Proveedor {
  id: number;
  nombre: string;
  cuit?: string | null;
  email?: string | null;
  telefono?: string | null;
  estado?: 'activo' | 'inactivo';
}

export interface Deposito {
  id: number;
  nombre: string;
  codigo?: string | null;
}

export interface MetodoPago {
  id: number;
  nombre: string;
  moneda?: string | null;
  activo?: boolean;
}

export interface Pago {
  id: number;
  venta_id?: number | null;
  cliente_id?: number | null;
  monto: number;
  fecha: string;
  metodo_pago_id?: number | null;
}

export interface InsightItem {
  id: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  entity?: { type: string; id: number | string; name: string };
  metrics?: Record<string, unknown>;
}

export interface InsightsResponse {
  generated_at: string;
  summary: { total: number; high: number; medium: number; low: number };
  items: InsightItem[];
}

// ─── Integraciones ────────────────────────────────────────────────────────────

export interface IntegracionMpStatus {
  connected: boolean;
  provider: 'mp';
  status: 'conectado' | 'desconectado' | 'error';
  mp_user_id: string | null;
  mp_user_name: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  webhook_secret_configured: boolean;
}

export interface IntegracionMlStatus {
  connected: boolean;
  provider: 'ml';
  status: 'conectado' | 'desconectado' | 'error';
  ml_user_id: string | null;
  ml_user_name: string | null;
  token_expires_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}

export interface MpPaymentLink {
  id: number;
  venta_id: number;
  mp_preference_id: string;
  mp_payment_id: string | null;
  external_reference: string | null;
  init_point: string;
  sandbox_init_point: string | null;
  estado: 'pendiente' | 'approved' | 'rejected' | 'cancelled' | 'in_process' | 'procesando';
  payment_status_detail: string | null;
  local_pago_id: number | null;
  expires_at: string | null;
  last_seen_at: string | null;
}

export interface MlSyncedProduct {
  id: number;
  producto_id: number;
  product_name: string | null;
  product_codigo: string | null;
  ml_item_id: string;
  ml_item_url: string | null;
  ml_category_id: string | null;
  ml_listing_type: string | null;
  precio_publicado: number;
  stock_publicado: number;
  estado: 'active' | 'paused' | 'closed' | 'under_review' | 'error';
  ultimo_sync_at: string | null;
  sync_error: string | null;
}

export interface MlImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  details?: Array<{ ml_order_id: string; venta_id?: number; error?: string }>;
}

export interface MovimientoFinanciero {
  fecha: string;
  totalVentas: number;
  totalGastos: number;
  gananciaNeta: number;
  margenTotal?: number;
}
