export type Cliente = {
  id: number;
  nombre: string;
  apellido?: string | null;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  entre_calles?: string | null;
  cuit_cuil?: string | null;
  tipo_doc?: string | null;
  nro_doc?: string | null;
  condicion_iva?: string | null;
  domicilio_fiscal?: string | null;
  provincia?: string | null;
  localidad?: string | null;
  codigo_postal?: string | null;
  zona_id?: number | null;
  tipo_cliente?: 'minorista' | 'mayorista' | 'distribuidor' | null;
  segmento?: string | null;
  lead_score?: number | null;
  lead_segmento?: 'vip' | 'frecuente' | 'activo' | 'dormido' | 'inactivo' | null;
  lead_score_updated_at?: string | null;
  fecha_nacimiento?: string | null;
  tags?: string | null;
  deposito_principal_id?: number | null;
  deposito_principal_nombre?: string | null;
  deposito_principal_codigo?: string | null;
  responsable_usuario_id?: number | null;
  responsable_nombre?: string | null;
  responsable_rol?: string | null;
  estado: 'activo' | 'inactivo';
  deleted_at?: string | null;
};

export type DepositoVisible = {
  id: number;
  nombre: string;
  codigo?: string | null;
};

export type ResponsableVisible = {
  id: number;
  nombre: string;
  email?: string | null;
  rol?: string | null;
  deposito_id?: number | null;
  deposito_nombre?: string | null;
  deposito_codigo?: string | null;
};

export type Zona = {
  id: number;
  nombre: string;
  color_hex?: string | null;
  activo?: boolean;
};

export type VentaCliente = {
  id: number;
  fecha: string;
  neto?: number;
  total?: number;
  estado_pago: string;
  saldo_pendiente?: number;
};

export type CrmOportunidad = {
  id: number;
  titulo: string;
  fase: string;
  valor_estimado?: number;
  probabilidad?: number;
  fecha_cierre_estimada?: string;
};

export type CrmActividad = {
  id: number;
  tipo: string;
  asunto: string;
  fecha_hora?: string;
  estado: string;
};

export type ClienteInsight = {
  lead_score: number;
  lead_segmento: 'vip' | 'frecuente' | 'activo' | 'dormido' | 'inactivo';
  dias_desde_ultima_compra?: number | null;
  total_compras: number;
  total_gastado: number;
  deuda_pendiente: number;
  oportunidades_activas: number;
  respondio_whatsapp: boolean;
  whatsapp_opt_in: boolean;
  fecha_nacimiento?: string | null;
  sugerencia: string;
};

export type ClienteMensaje = {
  id: number;
  direccion: 'enviado' | 'recibido';
  tipo: string;
  contenido?: string | null;
  plantilla_codigo?: string | null;
  provider_status?: string | null;
  automatizado?: boolean;
  automatizacion_nombre?: string | null;
  created_at?: string | null;
};

export type ClienteTimelineItem = {
  fecha: string;
  tipo: 'venta' | 'actividad' | 'oportunidad' | 'mensaje';
  titulo: string;
  detalle?: string | null;
};

export type DeudaInicial = {
  id: number;
  cliente_id: number;
  monto: number;
  fecha: string;
  descripcion?: string | null;
};

export type DeudaInicialPago = {
  id: number;
  cliente_id: number;
  monto: number;
  fecha: string;
  descripcion?: string | null;
};

export type MetodoPago = {
  id: number;
  nombre: string;
  moneda?: string | null;
  activo?: boolean;
  orden?: number;
};

export type PagoMetodoForm = {
  metodo_id: string;
  monto: string;
  moneda?: string | null;
};

export type HistorialPago = {
  id: number;
  tipo: 'pago_venta' | 'pago_cuenta' | 'pago_deuda_inicial' | 'entrega_venta';
  venta_id?: number | null;
  monto?: number | null;
  fecha: string;
  detalle?: string | null;
};

export type HistorialCuentaItem = {
  id: string;
  fecha?: string | null;
  tipo: 'pago' | 'compra' | 'entrega';
  monto?: number | null;
  detalle?: string | null;
};

export type ClienteAcceso = {
  cliente_id: number;
  email?: string | null;
  has_access: boolean;
  password_set_at?: string | null;
  last_login_at?: string | null;
};

export type RiesgoMora = {
  cliente_id: number;
  score: number;
  bucket: 'low' | 'medium' | 'high' | 'critical';
  deuda_pendiente?: number;
  deuda_mas_90?: number;
  dias_promedio_atraso?: number;
  factores?: {
    deuda_pendiente?: number;
    deuda_mas_90?: number;
    dias_promedio_atraso?: number;
    promesas_incumplidas?: number;
    promesas_totales?: number;
  };
};

export type PromesaCobranza = {
  id: number;
  cliente_id: number;
  monto_prometido: number;
  fecha_promesa: string;
  estado: 'pendiente' | 'cumplida' | 'incumplida' | 'cancelada';
  canal_preferido: 'whatsapp' | 'email' | 'telefono' | 'manual';
  notas?: string | null;
};

export type RecordatorioCobranza = {
  id: number;
  cliente_id: number;
  canal: 'whatsapp' | 'email' | 'manual';
  destino?: string | null;
  template_code: string;
  scheduled_at: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
};

export type ClienteForm = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  direccion: string;
  entre_calles: string;
  cuit_cuil: string;
  tipo_doc: string;
  nro_doc: string;
  condicion_iva: string;
  domicilio_fiscal: string;
  provincia: string;
  localidad: string;
  codigo_postal: string;
  zona_id: string;
  deposito_id: string;
  responsable_usuario_id: string;
  tipo_cliente: string;
  segmento: string;
  fecha_nacimiento: string;
  tags: string;
};
