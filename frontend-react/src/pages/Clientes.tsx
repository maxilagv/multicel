import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { getDepositoIdFromToken, getRoleFromToken, getUserIdFromToken } from '../lib/auth';
import Button from '../ui/Button';
import Alert from '../components/Alert';
import HelpTooltip from '../components/HelpTooltip';
import SpreadsheetImportPanel from '../components/SpreadsheetImportPanel';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { trackMobileEvent } from '../lib/mobileTelemetry';
import ClienteDetallePanel from './clientes/ClienteDetallePanel';
// Subcomponentes extraídos — WIP: la integración completa con props se hace en el próximo sprint
// Los archivos ya existen en ./clientes/ listos para conectar
// import ClienteDetallePanel from './clientes/ClienteDetallePanel';
// import ClienteFormPanel from './clientes/ClienteFormPanel';

type Cliente = {
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

type DepositoVisible = {
  id: number;
  nombre: string;
  codigo?: string | null;
};

type ResponsableVisible = {
  id: number;
  nombre: string;
  email?: string | null;
  rol?: string | null;
  deposito_id?: number | null;
  deposito_nombre?: string | null;
  deposito_codigo?: string | null;
};

type ClienteFormState = {
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

type Zona = {
  id: number;
  nombre: string;
  color_hex?: string | null;
  activo?: boolean;
};

type VentaCliente = {
  id: number;
  fecha: string;
  neto?: number;
  total?: number;
  estado_pago: string;
  saldo_pendiente?: number;
};

type CrmOportunidad = {
  id: number;
  titulo: string;
  fase: string;
  valor_estimado?: number;
  probabilidad?: number;
  fecha_cierre_estimada?: string;
};

type CrmActividad = {
  id: number;
  tipo: string;
  asunto: string;
  fecha_hora?: string;
  estado: string;
};

type ClienteInsight = {
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

type ClienteMensaje = {
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

type ClienteTimelineItem = {
  fecha: string;
  tipo: 'venta' | 'actividad' | 'oportunidad' | 'mensaje';
  titulo: string;
  detalle?: string | null;
};

type DeudaInicial = {
  id: number;
  cliente_id: number;
  monto: number;
  fecha: string;
  descripcion?: string | null;
};

type DeudaInicialPago = {
  id: number;
  cliente_id: number;
  monto: number;
  fecha: string;
  descripcion?: string | null;
};

type MetodoPago = {
  id: number;
  nombre: string;
  moneda?: string | null;
  activo?: boolean;
  orden?: number;
};

type PagoMetodoForm = {
  metodo_id: string;
  monto: string;
  moneda?: string | null;
};

type HistorialPago = {
  id: number;
  tipo: 'pago_venta' | 'pago_cuenta' | 'pago_deuda_inicial' | 'entrega_venta';
  venta_id?: number | null;
  monto?: number | null;
  fecha: string;
  detalle?: string | null;
};

type HistorialCuentaItem = {
  id: string;
  fecha?: string | null;
  tipo: 'pago' | 'compra' | 'entrega';
  monto?: number | null;
  detalle?: string | null;
};

type ClienteAcceso = {
  cliente_id: number;
  email?: string | null;
  has_access: boolean;
  password_set_at?: string | null;
  last_login_at?: string | null;
};

type RiesgoMora = {
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

type PromesaCobranza = {
  id: number;
  cliente_id: number;
  monto_prometido: number;
  fecha_promesa: string;
  estado: 'pendiente' | 'cumplida' | 'incumplida' | 'cancelada';
  canal_preferido: 'whatsapp' | 'email' | 'telefono' | 'manual';
  notas?: string | null;
};

type RecordatorioCobranza = {
  id: number;
  cliente_id: number;
  canal: 'whatsapp' | 'email' | 'manual';
  destino?: string | null;
  template_code: string;
  scheduled_at: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
};

function riesgoLabel(bucket: RiesgoMora['bucket']) {
  if (bucket === 'critical') return 'Critica';
  if (bucket === 'high') return 'Alta';
  if (bucket === 'medium') return 'Media';
  return 'Baja';
}

function riesgoClass(bucket: RiesgoMora['bucket']) {
  if (bucket === 'critical') return 'bg-rose-500/20 border-rose-500/40 text-rose-200';
  if (bucket === 'high') return 'bg-orange-500/20 border-orange-500/40 text-orange-200';
  if (bucket === 'medium') return 'bg-amber-500/20 border-amber-500/40 text-amber-200';
  return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200';
}

function recordatorioStatusLabel(status: RecordatorioCobranza['status']) {
  if (status === 'sent') return 'Enviado';
  if (status === 'failed') return 'Fallido';
  if (status === 'cancelled') return 'Cancelado';
  return 'Pendiente';
}

function leadSegmentLabel(segment?: Cliente['lead_segmento'] | null) {
  if (segment === 'vip') return 'VIP';
  if (segment === 'frecuente') return 'Frecuente';
  if (segment === 'activo') return 'Activo';
  if (segment === 'dormido') return 'Dormido';
  return 'Inactivo';
}

function leadSegmentClass(segment?: Cliente['lead_segmento'] | null) {
  if (segment === 'vip') return 'bg-amber-500/20 border-amber-500/40 text-amber-100';
  if (segment === 'frecuente') return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-100';
  if (segment === 'activo') return 'bg-sky-500/20 border-sky-500/40 text-sky-100';
  if (segment === 'dormido') return 'bg-orange-500/20 border-orange-500/40 text-orange-100';
  return 'bg-rose-500/20 border-rose-500/40 text-rose-100';
}

function buildEmptyClienteForm(
  defaults: Partial<Pick<ClienteFormState, 'deposito_id' | 'responsable_usuario_id'>> = {}
): ClienteFormState {
  return {
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    direccion: '',
    entre_calles: '',
    cuit_cuil: '',
    tipo_doc: '',
    nro_doc: '',
    condicion_iva: '',
    domicilio_fiscal: '',
    provincia: '',
    localidad: '',
    codigo_postal: '',
    zona_id: '',
    deposito_id: defaults.deposito_id || '',
    responsable_usuario_id: defaults.responsable_usuario_id || '',
    tipo_cliente: 'minorista',
    segmento: '',
    fecha_nacimiento: '',
    tags: '',
  };
}

function labelResponsableRol(rol?: string | null) {
  if (!rol) return '';
  if (rol === 'gerente_sucursal') return 'Admin de sucursal';
  if (rol === 'vendedor') return 'Vendedor';
  return rol;
}

export default function Clientes() {
  const { accessToken } = useAuth();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const currentUserId = useMemo(() => getUserIdFromToken(accessToken), [accessToken]);
  const scopedDepositoId = useMemo(() => getDepositoIdFromToken(accessToken), [accessToken]);
  const isGlobalClientAdmin = role === 'admin' || role === 'gerente';
  const isBranchAdmin = role === 'gerente_sucursal';
  const isSeller = role === 'vendedor';
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [deletedClientes, setDeletedClientes] = useState<Cliente[]>([]);
  const [deudas, setDeudas] = useState<Record<number, number>>({});
  const [deudaUmbralRojo, setDeudaUmbralRojo] = useState<number>(1000000);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [detalleVentas, setDetalleVentas] = useState<VentaCliente[]>([]);
  const [ranking, setRanking] = useState<{ cliente_id: number; total: number }[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [visibleDepositos, setVisibleDepositos] = useState<DepositoVisible[]>([]);
  const [responsablesVisibles, setResponsablesVisibles] = useState<ResponsableVisible[]>([]);
  const [depositoFilter, setDepositoFilter] = useState('');
  const [responsableFilter, setResponsableFilter] = useState('');
  const [crmOpps, setCrmOpps] = useState<CrmOportunidad[]>([]);
  const [crmActs, setCrmActs] = useState<CrmActividad[]>([]);
  const [clienteInsight, setClienteInsight] = useState<ClienteInsight | null>(null);
  const [clienteMensajes, setClienteMensajes] = useState<ClienteMensaje[]>([]);
  const [clienteTimeline, setClienteTimeline] = useState<ClienteTimelineItem[]>([]);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleError, setDetalleError] = useState<string | null>(null);
  const [segmentRefreshLoading, setSegmentRefreshLoading] = useState(false);
  const [segmentRefreshMessage, setSegmentRefreshMessage] = useState<string | null>(null);
  const [clienteAcceso, setClienteAcceso] = useState<ClienteAcceso | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessSaving, setAccessSaving] = useState(false);
  const [riesgoMora, setRiesgoMora] = useState<RiesgoMora | null>(null);
  const [promesasCobranza, setPromesasCobranza] = useState<PromesaCobranza[]>([]);
  const [recordatoriosCobranza, setRecordatoriosCobranza] = useState<RecordatorioCobranza[]>([]);
  const [cobranzaLoading, setCobranzaLoading] = useState(false);
  const [cobranzaError, setCobranzaError] = useState<string | null>(null);
  const [promesaForm, setPromesaForm] = useState({
    monto: '',
    fecha: new Date().toISOString().slice(0, 10),
    canal: 'whatsapp' as 'whatsapp' | 'email' | 'telefono' | 'manual',
    notas: '',
  });
  const [promesaSaving, setPromesaSaving] = useState(false);
  const [recordatorioForm, setRecordatorioForm] = useState({
    canal: 'whatsapp' as 'whatsapp' | 'email' | 'manual',
    destino: '',
    template_code: 'manual_followup',
    mensaje: '',
  });
  const [recordatorioSaving, setRecordatorioSaving] = useState(false);
  const [deudasIniciales, setDeudasIniciales] = useState<DeudaInicial[]>([]);
  const [pagosDeudaInicial, setPagosDeudaInicial] = useState<DeudaInicialPago[]>([]);
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([]);
  const [metodosPagoLoading, setMetodosPagoLoading] = useState(false);
  const [metodosPagoError, setMetodosPagoError] = useState<string | null>(null);
  const [pagoMetodos, setPagoMetodos] = useState<PagoMetodoForm[]>([
    { metodo_id: '', monto: '', moneda: '' },
  ]);
  const [historialPagos, setHistorialPagos] = useState<HistorialPago[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState<string | null>(null);
  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [historialDeleting, setHistorialDeleting] = useState(false);
  const [deudaAnteriorForm, setDeudaAnteriorForm] = useState({
    tiene: false,
    monto: '',
  });
  const [pagoDeudaForm, setPagoDeudaForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    venta_id: '',
  });
  const [pagoDeudaSaving, setPagoDeudaSaving] = useState(false);
  const [pagoDeudaError, setPagoDeudaError] = useState<string | null>(null);
  const [padronLoading, setPadronLoading] = useState(false);
  const [padronError, setPadronError] = useState<string | null>(null);
  const [padronOverwrite, setPadronOverwrite] = useState(false);
  const [form, setForm] = useState<ClienteFormState>(() => buildEmptyClienteForm());
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const CLIENTES_LIMIT = 200;
  const HISTORIAL_LIMIT = 200;
  const searchInitialized = useRef(false);
  const canSubmit = useMemo(() => Boolean(form.nombre), [form]);
  const segmentSummary = useMemo(() => {
    const base = {
      vip: 0,
      frecuente: 0,
      activo: 0,
      dormido: 0,
      inactivo: 0,
    };

    for (const cliente of clientes) {
      const key = (cliente.lead_segmento || 'inactivo') as keyof typeof base;
      if (Object.prototype.hasOwnProperty.call(base, key)) {
        base[key] += 1;
      }
    }

    return base;
  }, [clientes]);

  const defaultScopedDeposito = scopedDepositoId ? String(scopedDepositoId) : '';
  const defaultScopedResponsable = isSeller && currentUserId ? String(currentUserId) : '';
  const defaultFormResponsable =
    isSeller && currentUserId
      ? String(currentUserId)
      : isBranchAdmin && currentUserId
      ? String(currentUserId)
      : '';

  const effectiveDepositoFilter = isGlobalClientAdmin ? depositoFilter : defaultScopedDeposito;
  const effectiveResponsableFilter = isSeller ? defaultScopedResponsable : responsableFilter;

  const responsiblesForSelectedDeposito = useMemo(() => {
    const activeDepositoId = Number(form.deposito_id || effectiveDepositoFilter || 0);
    const filtered = responsablesVisibles.filter((item) => {
      if (!activeDepositoId) return true;
      return Number(item.deposito_id || 0) === activeDepositoId;
    });
    const byId = new Map<number, ResponsableVisible>();
    for (const item of filtered) {
      const id = Number(item.id || 0);
      if (!id || byId.has(id)) continue;
      byId.set(id, item);
    }
    return Array.from(byId.values());
  }, [effectiveDepositoFilter, form.deposito_id, responsablesVisibles]);

  const responsiblesForListFilter = useMemo(() => {
    const activeDepositoId = Number(effectiveDepositoFilter || 0);
    const filtered = responsablesVisibles.filter((item) => {
      if (!activeDepositoId) return true;
      return Number(item.deposito_id || 0) === activeDepositoId;
    });
    const byId = new Map<number, ResponsableVisible>();
    for (const item of filtered) {
      const id = Number(item.id || 0);
      if (!id || byId.has(id)) continue;
      byId.set(id, item);
    }
    return Array.from(byId.values());
  }, [effectiveDepositoFilter, responsablesVisibles]);

  const selectedDepositoLabel = useMemo(() => {
    const depositoId = Number(form.deposito_id || effectiveDepositoFilter || 0);
    if (!depositoId) return 'Sin sucursal asignada';
    return (
      visibleDepositos.find((item) => Number(item.id) === depositoId)?.nombre ||
      'Sucursal no disponible'
    );
  }, [effectiveDepositoFilter, form.deposito_id, visibleDepositos]);

  const selectedResponsableLabel = useMemo(() => {
    const responsableId = Number(form.responsable_usuario_id || defaultFormResponsable || 0);
    if (!responsableId) return 'Sin responsable asignado';
    const found =
      responsiblesForSelectedDeposito.find((item) => Number(item.id) === responsableId) ||
      responsablesVisibles.find((item) => Number(item.id) === responsableId);
    return found?.nombre || 'Responsable no disponible';
  }, [defaultFormResponsable, form.responsable_usuario_id, responsiblesForSelectedDeposito, responsablesVisibles]);

  const loadBase = useCallback(async () => {
    setError(null);
    try {
      const [deudaRows, topRows, umbralRes, zonasRes, depositosRes, responsablesRes] = await Promise.all([
        Api.deudas(),
        Api.topClientes(200).catch(() => []),
        Api.getDebtThreshold().catch(() => null),
        Api.zonas().catch(() => []),
        Api.misDepositos().catch(() => []),
        Api.clientesResponsablesVisibles().catch(() => []),
      ]);
      const map: Record<number, number> = {};
      for (const d of deudaRows as any[]) {
        map[d.cliente_id] = Number(d.deuda_pendiente || 0);
      }
      setDeudas(map);
      const umbralVal =
        umbralRes && typeof (umbralRes as any).valor === 'number'
          ? Number((umbralRes as any).valor)
          : null;
      if (umbralVal != null && umbralVal > 0) {
        setDeudaUmbralRojo(umbralVal);
      }
      setZonas(Array.isArray(zonasRes) ? (zonasRes as Zona[]) : []);
      setVisibleDepositos(Array.isArray(depositosRes) ? (depositosRes as DepositoVisible[]) : []);
      setResponsablesVisibles(
        Array.isArray(responsablesRes) ? (responsablesRes as ResponsableVisible[]) : []
      );
      setRanking(
        (topRows || []).map((r: any) => ({
          cliente_id: Number(r.cliente_id),
          total: Number(r.total_comprado || 0),
        }))
      );
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar los clientes');
    }
  }, []);

  const loadClientes = useCallback(async (query: string) => {
    const startedAt = Date.now();
    setLoading(true);
    setError(null);
    try {
      const qValue = query.trim();
      const clis = await Api.clientes({
        q: qValue ? qValue : undefined,
        limit: CLIENTES_LIMIT,
        view: isMobile ? 'mobile' : undefined,
        deposito_id: effectiveDepositoFilter ? Number(effectiveDepositoFilter) : undefined,
        responsable_usuario_id: effectiveResponsableFilter
          ? Number(effectiveResponsableFilter)
          : undefined,
      });
      setClientes(clis as Cliente[]);
      if (isMobile) {
        trackMobileEvent('clientes_load_success', {
          total: Array.isArray(clis) ? clis.length : 0,
          q: qValue || '',
          duration_ms: Date.now() - startedAt,
        });
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar los clientes');
      setClientes([]);
      if (isMobile) {
        trackMobileEvent('clientes_load_error', {
          q: query.trim() || '',
          message: e?.message || 'No se pudieron cargar los clientes',
          duration_ms: Date.now() - startedAt,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [effectiveDepositoFilter, effectiveResponsableFilter, isMobile]);

  const loadDeletedClientes = useCallback(async () => {
    try {
      const rows = await Api.clientesPapelera({
        limit: 25,
        view: isMobile ? 'mobile' : 'full',
      });
      setDeletedClientes(Array.isArray(rows) ? (rows as Cliente[]) : []);
    } catch {
      setDeletedClientes([]);
    }
  }, [isMobile]);

  const load = useCallback(async () => {
    await Promise.all([loadBase(), loadClientes(q), loadDeletedClientes()]);
  }, [loadBase, loadClientes, loadDeletedClientes, q]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (editingCliente) return;
    setForm((prev) => {
      let next = prev;
      if (!isGlobalClientAdmin && defaultScopedDeposito && prev.deposito_id !== defaultScopedDeposito) {
        next = { ...next, deposito_id: defaultScopedDeposito };
      }
      if (
        defaultFormResponsable &&
        prev.responsable_usuario_id !== defaultFormResponsable &&
        (!isGlobalClientAdmin || isSeller || isBranchAdmin)
      ) {
        next = { ...next, responsable_usuario_id: defaultFormResponsable };
      }
      return next;
    });
  }, [
    defaultScopedDeposito,
    defaultFormResponsable,
    editingCliente,
    isGlobalClientAdmin,
    isBranchAdmin,
    isSeller,
  ]);

  useEffect(() => {
    if (!form.responsable_usuario_id) return;
    const stillValid = responsiblesForSelectedDeposito.some(
      (item) => String(item.id) === String(form.responsable_usuario_id)
    );
    if (stillValid) return;
    setForm((prev) => ({
      ...prev,
      responsable_usuario_id: defaultFormResponsable || '',
    }));
  }, [
    defaultFormResponsable,
    form.responsable_usuario_id,
    responsiblesForSelectedDeposito,
  ]);

  useEffect(() => {
    if (!responsableFilter) return;
    const stillValid = responsiblesForListFilter.some(
      (item) => String(item.id) === String(responsableFilter)
    );
    if (!stillValid) setResponsableFilter(isSeller ? defaultScopedResponsable : '');
  }, [defaultScopedResponsable, isSeller, responsableFilter, responsiblesForListFilter]);

  useEffect(() => {
    let active = true;
    (async () => {
      setMetodosPagoLoading(true);
      setMetodosPagoError(null);
      try {
        const rows = await Api.metodosPago();
        if (!active) return;
        setMetodosPago((rows || []) as MetodoPago[]);
      } catch (e: any) {
        if (!active) return;
        setMetodosPagoError(e?.message || 'No se pudieron cargar los metodos de pago');
        setMetodosPago([]);
      } finally {
        if (active) setMetodosPagoLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);


  useEffect(() => {
    if (!searchInitialized.current) {
      searchInitialized.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      loadClientes(q);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [loadClientes, q]);

  useEffect(() => {
    const onEscape = () => {
      setShowHistorialModal(false);
    };

    window.addEventListener('kaisen:escape', onEscape as EventListener);
    return () => window.removeEventListener('kaisen:escape', onEscape as EventListener);
  }, []);

  async function loadCobranzaCliente(clienteId: number) {
    setCobranzaLoading(true);
    setCobranzaError(null);
    try {
      const [riskRows, promises, reminders] = await Promise.all([
        Api.ownerRiskRanking({ limit: 500, persist: false }).catch(() => []),
        Api.ownerPromises({ cliente_id: clienteId, limit: 50 }).catch(() => []),
        Api.ownerReminders({ cliente_id: clienteId, limit: 50 }).catch(() => []),
      ]);
      const risk = (riskRows as RiesgoMora[]).find(
        (r) => Number(r.cliente_id) === Number(clienteId)
      ) || null;
      setRiesgoMora(risk);
      setPromesasCobranza((promises || []) as PromesaCobranza[]);
      setRecordatoriosCobranza((reminders || []) as RecordatorioCobranza[]);
    } catch (e: any) {
      setCobranzaError(e?.message || 'No se pudo cargar cobranzas inteligentes');
      setRiesgoMora(null);
      setPromesasCobranza([]);
      setRecordatoriosCobranza([]);
    } finally {
      setCobranzaLoading(false);
    }
  }

  async function crearPromesaCobranza() {
    if (!selectedCliente || promesaSaving) return;
    const monto = Number(promesaForm.monto.replace(',', '.'));
    if (!Number.isFinite(monto) || monto <= 0) {
      setCobranzaError('Monto de promesa invalido');
      return;
    }
    if (!promesaForm.fecha) {
      setCobranzaError('Fecha de promesa requerida');
      return;
    }
    setPromesaSaving(true);
    setCobranzaError(null);
    try {
      await Api.ownerCreatePromise({
        cliente_id: selectedCliente.id,
        monto_prometido: monto,
        fecha_promesa: promesaForm.fecha,
        canal_preferido: promesaForm.canal,
        notas: promesaForm.notas || undefined,
      });
      setPromesaForm({
        monto: '',
        fecha: new Date().toISOString().slice(0, 10),
        canal: 'whatsapp',
        notas: '',
      });
      await loadCobranzaCliente(selectedCliente.id);
    } catch (e: any) {
      setCobranzaError(e?.message || 'No se pudo crear la promesa');
    } finally {
      setPromesaSaving(false);
    }
  }

  async function actualizarEstadoPromesa(id: number, estado: PromesaCobranza['estado']) {
    if (!selectedCliente) return;
    try {
      await Api.ownerUpdatePromiseStatus(id, { estado });
      await loadCobranzaCliente(selectedCliente.id);
    } catch (e: any) {
      setCobranzaError(e?.message || 'No se pudo actualizar estado de promesa');
    }
  }

  async function crearRecordatorioManual() {
    if (!selectedCliente || recordatorioSaving) return;
    setRecordatorioSaving(true);
    setCobranzaError(null);
    try {
      const payload = {
        mensaje: recordatorioForm.mensaje || 'Seguimiento de cobranza',
      };
      await Api.ownerCreateReminder({
        cliente_id: selectedCliente.id,
        canal: recordatorioForm.canal,
        destino: recordatorioForm.destino || undefined,
        template_code: recordatorioForm.template_code || 'manual_followup',
        payload,
      });
      setRecordatorioForm({
        canal: 'whatsapp',
        destino: '',
        template_code: 'manual_followup',
        mensaje: '',
      });
      await loadCobranzaCliente(selectedCliente.id);
    } catch (e: any) {
      setCobranzaError(e?.message || 'No se pudo crear recordatorio');
    } finally {
      setRecordatorioSaving(false);
    }
  }

  const resumenSeleccionado = useMemo(() => {
    if (!selectedCliente) {
      return {
        totalComprado: 0,
        ticketPromedio: 0,
        ultimaCompra: null as Date | null,
        deudaCorriente: 0,
        comprasCount: 0,
        frecuenciaPromedioDias: null as number | null,
        rankingPosicion: null as number | null,
        rankingTotal: ranking.length,
      };
    }
    const comprasCount = detalleVentas.length;
    let totalComprado = 0;
    let ultimaCompra: Date | null = null;
    for (const v of detalleVentas) {
      const monto = Number(v.neto ?? v.total ?? 0);
      totalComprado += monto;
      if (v.fecha) {
        const f = new Date(v.fecha);
        if (!Number.isNaN(f.getTime())) {
          if (!ultimaCompra || f > ultimaCompra) ultimaCompra = f;
        }
      }
    }
    const deudaCorriente = Number(selectedCliente ? deudas[selectedCliente.id] || 0 : 0);
    const ticketPromedio = comprasCount ? totalComprado / comprasCount : 0;

    // Frecuencia promedio entre compras (en días)
    let frecuenciaPromedioDias: number | null = null;
    if (comprasCount > 1) {
      const ordenadas = [...detalleVentas]
        .filter((v) => v.fecha)
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      if (ordenadas.length > 1) {
        let difTotal = 0;
        let pares = 0;
        for (let i = 1; i < ordenadas.length; i += 1) {
          const prev = new Date(ordenadas[i - 1].fecha);
          const curr = new Date(ordenadas[i].fecha);
          if (!Number.isNaN(prev.getTime()) && !Number.isNaN(curr.getTime())) {
            const diffMs = curr.getTime() - prev.getTime();
            difTotal += diffMs / (1000 * 60 * 60 * 24);
            pares += 1;
          }
        }
        if (pares > 0) frecuenciaPromedioDias = difTotal / pares;
      }
    }

    // Posición en ranking interno (si está en el top cargado)
    const idx = ranking.findIndex((r) => r.cliente_id === selectedCliente.id);
    const rankingPosicion = idx >= 0 ? idx + 1 : null;

    return {
      totalComprado,
      ticketPromedio,
      ultimaCompra,
      deudaCorriente,
      comprasCount,
      frecuenciaPromedioDias,
      rankingPosicion,
      rankingTotal: ranking.length,
    };
  }, [selectedCliente, detalleVentas, deudas, ranking]);

  const totalDeudaAnterior = useMemo(
    () =>
      deudasIniciales.reduce(
        (acc, d) => acc + (typeof d.monto === 'number' ? d.monto : Number(d.monto || 0)),
        0
      ),
    [deudasIniciales]
  );

  const totalPagosDeudaAnterior = useMemo(
    () =>
      pagosDeudaInicial.reduce(
        (acc, p) => acc + (typeof p.monto === 'number' ? p.monto : Number(p.monto || 0)),
        0
      ),
    [pagosDeudaInicial]
  );

  const saldoDeudaAnterior = useMemo(
    () => Math.max(totalDeudaAnterior - totalPagosDeudaAnterior, 0),
    [totalDeudaAnterior, totalPagosDeudaAnterior]
  );

  const ventasPendientes = useMemo(
    () =>
      detalleVentas.filter(
        (v) =>
          Number(v.saldo_pendiente ?? v.neto ?? v.total ?? 0) > 0 &&
          v.estado_pago !== 'cancelado'
      ),
    [detalleVentas]
  );

  function parseMonto(value: string) {
    const num = Number(String(value || '').replace(',', '.'));
    return Number.isFinite(num) ? num : 0;
  }

  const totalPagoMetodos = useMemo(
    () => pagoMetodos.reduce((acc, row) => acc + parseMonto(row.monto), 0),
    [pagoMetodos]
  );

  const canSubmitPago = useMemo(() => {
    return (
      metodosPago.length > 0 &&
      pagoMetodos.some(
        (row) => Number(row.metodo_id) > 0 && parseMonto(row.monto) > 0
      ) && !pagoDeudaSaving
    );
  }, [metodosPago.length, pagoMetodos, pagoDeudaSaving]);

  const historialCuenta = useMemo(() => {
    const items: HistorialCuentaItem[] = [];

    for (const v of detalleVentas) {
      if (v.estado_pago === 'cancelado') continue;
      const monto = Number(v.neto ?? v.total ?? 0);
      items.push({
        id: `venta-${v.id}`,
        fecha: v.fecha,
        tipo: 'compra',
        monto,
        detalle: `Venta #${v.id}`,
      });
    }

    for (const h of historialPagos) {
      if (h.tipo === 'entrega_venta') {
        items.push({
          id: `entrega-${h.id}`,
          fecha: h.fecha,
          tipo: 'entrega',
          detalle: h.detalle
            ? `Se llevo ${h.detalle}`
            : h.venta_id
              ? `Se llevo venta #${h.venta_id}`
              : 'Se llevo',
        });
        continue;
      }

      const detalle =
        h.tipo === 'pago_deuda_inicial'
          ? 'Deuda anterior'
          : h.venta_id
            ? `Venta #${h.venta_id}`
            : 'Cuenta corriente';
      items.push({
        id: `pago-${h.id}`,
        fecha: h.fecha,
        tipo: 'pago',
        monto: Number(h.monto ?? 0),
        detalle,
      });
    }

    items.sort((a, b) => {
      const aTime = a.fecha ? new Date(a.fecha).getTime() : 0;
      const bTime = b.fecha ? new Date(b.fecha).getTime() : 0;
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;
      return bTime - aTime;
    });

    return items;
  }, [detalleVentas, historialPagos]);

  async function cambiarEstado(cliente: Cliente, nuevoEstado: 'activo' | 'inactivo') {
    setError(null);
    try {
      await Api.actualizarCliente(cliente.id, {
        nombre: cliente.nombre,
        apellido: cliente.apellido || undefined,
        email: cliente.email || undefined,
        telefono: cliente.telefono || undefined,
        direccion: cliente.direccion || undefined,
        cuit_cuil: cliente.cuit_cuil || undefined,
        estado: nuevoEstado,
      });
      await load();
    } catch (e: any) {
      setError(e?.message || 'No se pudo actualizar el estado del cliente');
    }
  }

  async function eliminarCliente(cliente: Cliente) {
    if (
      !window.confirm(
        `Eliminar cliente ${cliente.nombre}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      await Api.eliminarCliente(cliente.id);
      await load();
    } catch (e: any) {
      setError(e?.message || 'No se pudo eliminar el cliente');
    }
  }

  async function restaurarCliente(cliente: Cliente) {
    setError(null);
    try {
      await Api.restaurarCliente(cliente.id);
      await load();
    } catch (e: any) {
      setError(e?.message || 'No se pudo restaurar el cliente');
    }
  }

  async function actualizarPrioridades() {
    setSegmentRefreshLoading(true);
    setSegmentRefreshMessage(null);
    try {
      const resp: any = await Api.recalcularSegmentosClientes();
      await load();
      setSegmentRefreshMessage(
        resp?.message ||
          `Prioridades actualizadas. ${resp?.changed || 0} clientes cambiaron de grupo.`
      );
    } catch (e: any) {
      setSegmentRefreshMessage(e?.message || 'No se pudieron actualizar las prioridades');
    } finally {
      setSegmentRefreshLoading(false);
    }
  }

  async function verDetalleCliente(cliente: Cliente) {
    setSelectedCliente(cliente);
    setDetalleLoading(true);
    setDetalleError(null);
    setAccessError(null);
    setPagoDeudaError(null);
    try {
      setDeudasIniciales([]);
      setPagosDeudaInicial([]);
      setHistorialPagos([]);
      setHistorialError(null);
      setClienteInsight(null);
      setClienteMensajes([]);
      setClienteTimeline([]);
      const [ventas, opps, acts, ficha, deudasIni, pagosIni, acceso, historial] = await Promise.all([
        Api.ventas({
          cliente_id: cliente.id,
          limit: 200,
          view: isMobile ? 'mobile' : undefined,
        }),
        Api.oportunidades({ cliente_id: cliente.id, limit: 50 }),
        Api.actividades({ cliente_id: cliente.id, include_completed: true, limit: 50 }),
        Api.crmFichaCliente(cliente.id).catch(() => null),
        Api.clienteDeudasIniciales(cliente.id).catch(() => []),
        Api.clientePagosDeudaInicial(cliente.id).catch(() => []),
        Api.clienteAcceso(cliente.id).catch(() => null),
        Api.clienteHistorialPagos(cliente.id, { limit: HISTORIAL_LIMIT }).catch(() => []),
      ]);
      setDetalleVentas((ventas || []) as VentaCliente[]);
      setCrmOpps(((ficha as any)?.oportunidades || opps || []) as CrmOportunidad[]);
      setCrmActs(((ficha as any)?.actividades || acts || []) as CrmActividad[]);
      setDeudasIniciales((deudasIni || []) as DeudaInicial[]);
      setPagosDeudaInicial((pagosIni || []) as DeudaInicialPago[]);
      setClienteAcceso((acceso || null) as ClienteAcceso | null);
      setHistorialPagos((historial || []) as HistorialPago[]);
      setClienteInsight(((ficha as any)?.cliente_insight || null) as ClienteInsight | null);
      setClienteMensajes((((ficha as any)?.mensajes || []) as ClienteMensaje[]));
      setClienteTimeline((((ficha as any)?.timeline || []) as ClienteTimelineItem[]));
      if ((ficha as any)?.cliente) {
        setSelectedCliente((prev) => ({
          ...(prev || cliente),
          ...(ficha as any).cliente,
        }));
      }
      if (isMobile) {
        trackMobileEvent('cliente_detalle_opened', {
          cliente_id: cliente.id,
          ventas: Array.isArray(ventas) ? ventas.length : 0,
          historial: Array.isArray(historial) ? historial.length : 0,
        });
      }
      await loadCobranzaCliente(cliente.id);
    } catch (e: any) {
      setDetalleError(e?.message || 'No se pudo cargar el detalle del cliente');
      setDetalleVentas([]);
      setCrmOpps([]);
      setCrmActs([]);
      setClienteInsight(null);
      setClienteMensajes([]);
      setClienteTimeline([]);
      setDeudasIniciales([]);
      setPagosDeudaInicial([]);
      setHistorialPagos([]);
      setHistorialError(null);
      setClienteAcceso(null);
      setRiesgoMora(null);
      setPromesasCobranza([]);
      setRecordatoriosCobranza([]);
      setCobranzaError(null);
    } finally {
      setDetalleLoading(false);
    }
  }

  async function loadHistorialPagos() {
    if (!selectedCliente) return;
    setHistorialLoading(true);
    setHistorialError(null);
    try {
      const rows = await Api.clienteHistorialPagos(selectedCliente.id, {
        limit: HISTORIAL_LIMIT,
      });
      setHistorialPagos((rows || []) as HistorialPago[]);
    } catch (e: any) {
      setHistorialError(e?.message || 'No se pudo cargar el historial de pagos');
      setHistorialPagos([]);
    } finally {
      setHistorialLoading(false);
    }
  }

  async function abrirHistorialPagos() {
    if (!selectedCliente) {
      window.alert('Primero selecciona un cliente');
      return;
    }
    setShowHistorialModal(true);
    await loadHistorialPagos();
  }

  function updatePagoMetodo(index: number, changes: Partial<PagoMetodoForm>) {
    setPagoMetodos((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...changes } : row))
    );
  }

  function addPagoMetodoRow() {
    setPagoMetodos((prev) => [...prev, { metodo_id: '', monto: '', moneda: '' }]);
  }

  function removePagoMetodoRow(index: number) {
    setPagoMetodos((prev) => prev.filter((_, i) => i !== index));
  }

  async function registrarPagoDeuda() {
    if (!selectedCliente || pagoDeudaSaving) return;
    setPagoDeudaError(null);
    if (!metodosPago.length) {
      setPagoDeudaError('Configura al menos un metodo de pago en Configuracion');
      return;
    }
    const parsedRows = pagoMetodos.map((row) => {
      const metodoId = Number(row.metodo_id);
      const monto = parseMonto(row.monto);
      const metodo = metodosPago.find((m) => Number(m.id) === metodoId);
      return {
        metodo_id: metodoId,
        monto,
        moneda: (row.moneda || metodo?.moneda || '').toString().trim().toUpperCase(),
        rawMetodo: row.metodo_id,
        rawMonto: row.monto,
      };
    });
    const invalidRow = parsedRows.find(
      (row) =>
        (row.rawMetodo && (!row.metodo_id || row.metodo_id <= 0)) ||
        (row.rawMonto && row.monto <= 0) ||
        (row.metodo_id > 0 && row.monto <= 0)
    );
    if (invalidRow) {
      setPagoDeudaError('Completa los metodos y montos validos');
      return;
    }
    const metodosValidos = parsedRows.filter((row) => row.metodo_id > 0 && row.monto > 0);
    if (!metodosValidos.length) {
      setPagoDeudaError('Agrega al menos un metodo con monto');
      return;
    }
    const totalMonto = metodosValidos.reduce((acc, row) => acc + row.monto, 0);
    if (!Number.isFinite(totalMonto) || totalMonto <= 0) {
      setPagoDeudaError('El total del pago es invalido');
      return;
    }
    const ventaId = pagoDeudaForm.venta_id ? Number(pagoDeudaForm.venta_id) : null;
    if (ventasPendientes.length && (!ventaId || !Number.isInteger(ventaId))) {
      setPagoDeudaError('Selecciona una venta pendiente para registrar el pago');
      return;
    }
    setPagoDeudaSaving(true);
    try {
      const fecha = pagoDeudaForm.fecha || undefined;
      await Api.crearPago({
        cliente_id: selectedCliente.id,
        monto: totalMonto,
        fecha,
        venta_id: ventaId || undefined,
        metodos: metodosValidos.map((row) => ({
          metodo_id: row.metodo_id,
          monto: row.monto,
          moneda: row.moneda || undefined,
        })),
      });
      await verDetalleCliente(selectedCliente);
      await loadBase();
      if (showHistorialModal) {
        await loadHistorialPagos();
      }
      setPagoDeudaForm((prev) => ({ ...prev, venta_id: '' }));
      setPagoMetodos([{ metodo_id: '', monto: '', moneda: '' }]);
    } catch (e: any) {
      setPagoDeudaError(e?.message || 'No se pudo registrar el pago');
    } finally {
      setPagoDeudaSaving(false);
    }
  }

  async function eliminarPagoHistorial(item: HistorialPago) {
    if (!selectedCliente || historialDeleting) return;
    if (item.tipo === 'entrega_venta') return;
    if (!window.confirm('?Hubo un inconveniente con un pago?')) return;
    if (!window.confirm('?Deseas eliminarlo? Esta acci?n no se puede deshacer.')) return;
    setHistorialDeleting(true);
    try {
      if (item.tipo === 'pago_venta' || item.tipo === 'pago_cuenta') {
        await Api.eliminarPagoClienteVenta(selectedCliente.id, item.id);
      } else if (item.tipo === 'pago_deuda_inicial') {
        await Api.eliminarPagoClienteDeuda(selectedCliente.id, item.id);
      }
      await verDetalleCliente(selectedCliente);
      await loadBase();
      await loadHistorialPagos();
    } catch (e: any) {
      setHistorialError(e?.message || 'No se pudo eliminar el pago');
    } finally {
      setHistorialDeleting(false);
    }
  }

  function startEditCliente(cliente: Cliente) {
    setEditingCliente(cliente);
    setDeudaAnteriorForm({ tiene: false, monto: '' });
    setPadronError(null);
      setForm({
        nombre: cliente.nombre || '',
        apellido: cliente.apellido || '',
        email: cliente.email || '',
        telefono: cliente.telefono || '',
        direccion: cliente.direccion || '',
        entre_calles: cliente.entre_calles || '',
        cuit_cuil: cliente.cuit_cuil || '',
        tipo_doc: cliente.tipo_doc || '',
        nro_doc: cliente.nro_doc || '',
        condicion_iva: cliente.condicion_iva || '',
        domicilio_fiscal: cliente.domicilio_fiscal || '',
        provincia: cliente.provincia || '',
        localidad: cliente.localidad || '',
        codigo_postal: cliente.codigo_postal || '',
        zona_id: cliente.zona_id != null ? String(cliente.zona_id) : '',
        deposito_id:
          cliente.deposito_principal_id != null
            ? String(cliente.deposito_principal_id)
            : defaultScopedDeposito,
        responsable_usuario_id:
          cliente.responsable_usuario_id != null
            ? String(cliente.responsable_usuario_id)
            : defaultFormResponsable,
        tipo_cliente: cliente.tipo_cliente || 'minorista',
        segmento: cliente.segmento || '',
        fecha_nacimiento: cliente.fecha_nacimiento ? String(cliente.fecha_nacimiento).slice(0, 10) : '',
        tags: cliente.tags || '',
      });
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // No interrumpir la edicion si el navegador no soporta smooth scroll.
    }
  }

  async function completarDesdePadron() {
    setPadronError(null);
    if (!editingCliente) {
      setPadronError('Guardá el cliente antes de consultar padrón.');
      return;
    }
    if (!form.cuit_cuil) {
      setPadronError('Ingresá un CUIT/CUIL válido.');
      return;
    }
    setPadronLoading(true);
    try {
      const resp: any = await Api.arcaPadronCliente(editingCliente.id, {
        cuit: form.cuit_cuil,
        overwrite: padronOverwrite,
      });
      const data = resp?.data || {};
      setForm((prev) => ({
        ...prev,
        cuit_cuil: data.cuit || prev.cuit_cuil,
        tipo_doc: 'CUIT',
        nro_doc: data.cuit || prev.nro_doc,
        condicion_iva: data.condicion_iva || prev.condicion_iva,
        domicilio_fiscal: data.domicilio_fiscal || prev.domicilio_fiscal,
        provincia: data.provincia || prev.provincia,
        localidad: data.localidad || prev.localidad,
        codigo_postal: data.codigo_postal || prev.codigo_postal,
        nombre:
          padronOverwrite && (data.razon_social || data.nombre)
            ? data.razon_social || data.nombre
            : prev.nombre,
        apellido:
          padronOverwrite && data.apellido ? data.apellido : prev.apellido,
      }));
    } catch (e: any) {
      setPadronError(e?.message || 'No se pudo consultar padrón');
    } finally {
      setPadronLoading(false);
    }
  }

  async function crearActividadRapida() {
    if (!selectedCliente) return;
    const asunto = window.prompt(
      `Seguimiento a registrar para ${selectedCliente.nombre}?`,
      ''
    );
    if (!asunto) return;
    const descripcion =
      window.prompt('Detalle adicional (opcional)', '') || undefined;
    try {
      await Api.crearActividad({
        tipo: 'llamada',
        asunto: asunto.trim(),
        descripcion,
        fecha_hora: new Date().toISOString(),
        estado: 'pendiente',
        cliente_id: selectedCliente.id,
      });
      const acts = await Api.actividades({
        cliente_id: selectedCliente.id,
        include_completed: true,
        limit: 50,
      });
      setCrmActs((acts || []) as CrmActividad[]);
    } catch (e: any) {
      // En esta vista usamos un fallback simple de alerta
      window.alert(
        e?.message || 'No se pudo crear la actividad rápida'
      );
    }
  }

  async function configurarAccesoCliente() {
    if (!selectedCliente || accessSaving) return;
    setAccessError(null);
    const promptMsg = clienteAcceso?.has_access
      ? 'Nueva contrasena para el cliente (dejar vacio para generar una).'
      : 'Contrasena inicial (dejar vacio para generar una).';
    const password = window.prompt(promptMsg, '');
    if (password === null) return;
    setAccessSaving(true);
    try {
      const resp: any = await Api.clienteSetPassword(
        selectedCliente.id,
        password ? { password } : {}
      );
      window.alert(`Contrasena de acceso para ${resp.email}: ${resp.password}`);
      const status = await Api.clienteAcceso(selectedCliente.id);
      setClienteAcceso(status as ClienteAcceso);
    } catch (e: any) {
      setAccessError(e?.message || 'No se pudo configurar el acceso del cliente');
    } finally {
      setAccessSaving(false);
    }
  }


    return (
    <div className="space-y-6">
      <h2 className="app-title">Clientes</h2>
      <div className="app-card p-4">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!canSubmit) return;
            setError(null);
            if (!editingCliente && deudaAnteriorForm.tiene) {
              const montoNum = Number(deudaAnteriorForm.monto.replace(',', '.'));
              if (!Number.isFinite(montoNum) || montoNum <= 0) {
                setError('Ingresá un monto válido para la deuda anterior');
                return;
              }
            }
            const depositoSeleccionado = form.deposito_id || defaultScopedDeposito;
            const responsableSeleccionado =
              form.responsable_usuario_id || defaultFormResponsable;
            if (!depositoSeleccionado) {
              setError('Seleccioná la sucursal a la que pertenece el cliente');
              return;
            }
            if (!responsableSeleccionado) {
              setError('Seleccioná el responsable del cliente');
              return;
            }
            const payload = {
              nombre: form.nombre,
              apellido: form.apellido || undefined,
              email: form.email || undefined,
              telefono: form.telefono || undefined,
              direccion: form.direccion || undefined,
              entre_calles: form.entre_calles || undefined,
              cuit_cuil: form.cuit_cuil || undefined,
              tipo_doc: form.tipo_doc || undefined,
              nro_doc: form.nro_doc || undefined,
              condicion_iva: form.condicion_iva || undefined,
                domicilio_fiscal: form.domicilio_fiscal || undefined,
                provincia: form.provincia || undefined,
                localidad: form.localidad || undefined,
                codigo_postal: form.codigo_postal || undefined,
                fecha_nacimiento: form.fecha_nacimiento || undefined,
              zona_id: form.zona_id ? Number(form.zona_id) : undefined,
              deposito_id: Number(depositoSeleccionado),
              responsable_usuario_id: Number(responsableSeleccionado),
              tipo_cliente: form.tipo_cliente || undefined,
              segmento: form.segmento || undefined,
              tags: form.tags || undefined,
              estado: editingCliente?.estado || undefined,
            };
            try {
              if (editingCliente) {
                await Api.actualizarCliente(editingCliente.id, payload);
              } else {
                const created: any = await Api.crearCliente(payload);
                const createdId = Number(created?.id);
                if (deudaAnteriorForm.tiene && Number.isFinite(createdId) && createdId > 0) {
                  const montoNum = Number(deudaAnteriorForm.monto.replace(',', '.'));
                  try {
                    await Api.crearDeudaInicialCliente(createdId, {
                      monto: montoNum,
                    });
                  } catch (err: any) {
                    setError(
                      err?.message ||
                        'Cliente creado, pero no se pudo registrar la deuda anterior'
                    );
                  }
                }
              }
              setForm(
                buildEmptyClienteForm({
                  deposito_id: defaultScopedDeposito,
                  responsable_usuario_id: defaultFormResponsable,
                })
              );
              setDeudaAnteriorForm({ tiene: false, monto: '' });
              setEditingCliente(null);
              await load();
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : editingCliente
                  ? 'No se pudo actualizar el cliente'
                  : 'No se pudo crear el cliente'
              );
            }
          }}
          className="grid grid-cols-1 md:grid-cols-6 gap-2"
        >
          {error && (
            <div className="md:col-span-6">
              <Alert kind="error" message={error} />
            </div>
          )}
          <div className="md:col-span-6 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="app-panel p-3 md:col-span-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Contexto comercial
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-1 text-slate-200">
                  Rol actual: {role || 'sin rol'}
                </span>
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-sky-100">
                  Sucursal: {selectedDepositoLabel}
                </span>
                <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-indigo-100">
                  Responsable: {selectedResponsableLabel}
                </span>
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              <span>Sucursal principal</span>
              {isGlobalClientAdmin ? (
                <select
                  className="input-modern text-sm"
                  value={form.deposito_id}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      deposito_id: e.target.value,
                    }))
                  }
                >
                  <option value="">Seleccionar sucursal</option>
                  {visibleDepositos.map((deposito) => (
                    <option key={deposito.id} value={deposito.id}>
                      {deposito.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="input-modern flex min-h-[42px] items-center text-sm text-slate-200">
                  {selectedDepositoLabel}
                </div>
              )}
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-300 md:col-span-2">
              <span>Responsable comercial</span>
              {isSeller ? (
                <div className="input-modern flex min-h-[42px] items-center text-sm text-slate-200">
                  {selectedResponsableLabel}
                </div>
              ) : (
                <select
                  className="input-modern text-sm"
                  value={form.responsable_usuario_id}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      responsable_usuario_id: e.target.value,
                    }))
                  }
                >
                  <option value="">Seleccionar responsable</option>
                  {responsiblesForSelectedDeposito.map((responsable) => (
                    <option key={responsable.id} value={responsable.id}>
                      {responsable.nombre}
                      {responsable.deposito_nombre ? ` • ${responsable.deposito_nombre}` : ''}
                      {responsable.rol ? ` • ${labelResponsableRol(responsable.rol)}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>
          <input
            className="input-modern text-sm"
            placeholder="Nombre"
            value={form.nombre}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, nombre: e.target.value }))
            }
          />
          <input
            className="input-modern text-sm"
            placeholder="Apellido"
            value={form.apellido}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, apellido: e.target.value }))
            }
          />
          <input
            className="input-modern text-sm"
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, email: e.target.value }))
            }
          />
          <input
            className="input-modern text-sm"
            placeholder="Telefono"
            value={form.telefono}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, telefono: e.target.value }))
            }
          />
          <input
            className="input-modern text-sm"
            placeholder="Direccion"
            value={form.direccion}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, direccion: e.target.value }))
            }
          />
          <input
            className="input-modern text-sm"
            placeholder="Entre calles"
            value={form.entre_calles}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, entre_calles: e.target.value }))
            }
          />          <input
            className="input-modern text-sm"
            placeholder="CUIT/CUIL"
            value={form.cuit_cuil}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, cuit_cuil: e.target.value }))
            }
          />
          <div className="md:col-span-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={completarDesdePadron}
              className="px-3 py-1.5 rounded bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/30 text-indigo-200 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={!editingCliente || padronLoading}
            >
              {padronLoading ? 'Consultando padrón...' : 'Completar desde padrón'}
            </button>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                className="rounded border-white/20"
                checked={padronOverwrite}
                onChange={(e) => setPadronOverwrite(e.target.checked)}
              />
              Sobrescribir nombre/apellido
            </label>
            {padronError && <span className="text-xs text-rose-300">{padronError}</span>}
          </div>
          <div className="md:col-span-6 grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              className="input-modern text-sm"
              value={form.tipo_doc}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, tipo_doc: e.target.value }))
              }
            >
              <option value="">Tipo documento</option>
              <option value="CUIT">CUIT</option>
              <option value="CUIL">CUIL</option>
              <option value="DNI">DNI</option>
              <option value="CONSUMIDOR_FINAL">Consumidor final</option>
            </select>
            <input
              className="input-modern text-sm"
              placeholder="Nº documento"
              value={form.nro_doc}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, nro_doc: e.target.value }))
              }
            />
            <select
              className="input-modern text-sm"
              value={form.condicion_iva}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, condicion_iva: e.target.value }))
              }
            >
              <option value="">Condicion IVA</option>
              <option value="responsable_inscripto">Responsable inscripto</option>
              <option value="monotributo">Monotributo</option>
              <option value="consumidor_final">Consumidor final</option>
              <option value="exento">Exento</option>
              <option value="no_categorizado">No categorizado</option>
            </select>
            <input
              className="input-modern text-sm md:col-span-2"
              placeholder="Domicilio fiscal"
              value={form.domicilio_fiscal}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, domicilio_fiscal: e.target.value }))
              }
            />
            <input
              className="input-modern text-sm"
              placeholder="Provincia"
              value={form.provincia}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, provincia: e.target.value }))
              }
            />
            <input
              className="input-modern text-sm"
              placeholder="Localidad"
              value={form.localidad}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, localidad: e.target.value }))
              }
            />
            <input
              className="input-modern text-sm"
              placeholder="Codigo postal"
              value={form.codigo_postal}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, codigo_postal: e.target.value }))
              }
            />
          </div>
          <select
            className="input-modern text-sm"
            value={form.zona_id}
            onChange={(e) => setForm((prev) => ({ ...prev, zona_id: e.target.value }))}
          >
            <option value="">Zona</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </select>
          <select
            className="input-modern text-sm"
            value={form.tipo_cliente}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, tipo_cliente: e.target.value as any }))
            }
          >
            <option value="minorista">Minorista</option>
            <option value="mayorista">Mayorista</option>
            <option value="distribuidor">Distribuidor</option>
          </select>
          <input
            className="input-modern text-sm"
            placeholder="Segmento / rubro"
            value={form.segmento}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, segmento: e.target.value }))
            }
          />
          <label className="flex flex-col gap-1 text-xs text-slate-300">
            <span>Cumpleanos</span>
            <input
              className="input-modern text-sm"
              type="date"
              value={form.fecha_nacimiento}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, fecha_nacimiento: e.target.value }))
              }
            />
          </label>
          <input
            className="input-modern text-sm"
            placeholder="Tags (ej: VIP, Moroso)"
            value={form.tags}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, tags: e.target.value }))
            }
          />
          {!editingCliente && (
            <>
              <label className="md:col-span-6 flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  className="accent-slate-200"
                  checked={deudaAnteriorForm.tiene}
                  onChange={(e) =>
                    setDeudaAnteriorForm((prev) => ({
                      ...prev,
                      tiene: e.target.checked,
                    }))
                  }
                />
                ¿Tiene deuda anterior?
              </label>
              {deudaAnteriorForm.tiene && (
                <input
                  className="input-modern text-sm md:col-span-2"
                  placeholder="Monto deuda anterior"
                  type="number"
                  min="0"
                  step="0.01"
                  value={deudaAnteriorForm.monto}
                  onChange={(e) =>
                    setDeudaAnteriorForm((prev) => ({
                      ...prev,
                      monto: e.target.value,
                    }))
                  }
                />
              )}
            </>
          )}
          <div className="md:col-span-6 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canSubmit}>
              {editingCliente ? 'Guardar cambios' : 'Registrar cliente'}
            </Button>
            {editingCliente && (
              <button
                type="button"
                className="input-modern text-sm"
                onClick={() => {
                  setEditingCliente(null);
                  setForm(
                    buildEmptyClienteForm({
                      deposito_id: defaultScopedDeposito,
                      responsable_usuario_id: defaultFormResponsable,
                    })
                  );
                  setDeudaAnteriorForm({ tiene: false, monto: '' });
                }}
              >
                Cancelar edicion
              </button>
            )}
          </div>
        </form>
      </div>
      <SpreadsheetImportPanel
        title="Importar clientes desde Excel"
        description="Permite migrar padrones completos, detecta emails duplicados, normaliza teléfonos y deja trazabilidad por fila si algo falla."
        templateName="plantilla-clientes.csv"
        templateHeaders={[
          'nombre',
          'apellido',
          'email',
          'telefono',
          'direccion',
          'cuit_cuil',
          'condicion_iva',
          'estado',
        ]}
        upload={(file, opts) =>
          Api.importarClientesExcel(file, {
            dryRun: opts?.dryRun,
            async: opts?.async,
          })
        }
        onCompleted={async () => {
          await Promise.all([loadBase(), loadClientes(q), loadDeletedClientes()]);
        }}
      />
      <div className="app-card p-4">
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-100">Grupos de clientes</div>
              <div className="text-xs text-slate-400">
                Sirve para ver rapido a quien hay que cuidar, seguir o reactivar.
              </div>
            </div>
            <button
              type="button"
              className="input-modern text-xs disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={actualizarPrioridades}
              disabled={segmentRefreshLoading}
            >
              {segmentRefreshLoading ? 'Actualizando prioridades...' : 'Actualizar prioridades'}
            </button>
          </div>
          {segmentRefreshMessage && (
            <div className="text-xs text-slate-300">{segmentRefreshMessage}</div>
          )}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {(['vip', 'frecuente', 'activo', 'dormido', 'inactivo'] as const).map((segmento) => (
              <div key={segmento} className="app-panel p-3">
                <div
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${leadSegmentClass(segmento)}`}
                >
                  {leadSegmentLabel(segmento)}
                </div>
                <div className="mt-2 text-xl font-semibold text-slate-100">
                  {segmentSummary[segmento]}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full md:max-w-sm">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="input-modern w-full pl-9"
              placeholder="Buscar por nombre o apellido"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
            />
          </div>
          {isGlobalClientAdmin && (
            <select
              className="input-modern text-sm md:min-w-[220px]"
              value={depositoFilter}
              onChange={(e) => setDepositoFilter(e.target.value)}
            >
              <option value="">Todas las sucursales</option>
              {visibleDepositos.map((deposito) => (
                <option key={deposito.id} value={deposito.id}>
                  {deposito.nombre}
                </option>
              ))}
            </select>
          )}
          {!isSeller && (
            <select
              className="input-modern text-sm md:min-w-[240px]"
              value={responsableFilter}
              onChange={(e) => setResponsableFilter(e.target.value)}
            >
              <option value="">
                {isGlobalClientAdmin ? 'Todos los responsables' : 'Todos los responsables visibles'}
              </option>
              {responsiblesForListFilter.map((responsable) => (
                <option key={responsable.id} value={responsable.id}>
                  {responsable.nombre}
                  {responsable.deposito_nombre ? ` • ${responsable.deposito_nombre}` : ''}
                </option>
              ))}
            </select>
          )}
          {q || depositoFilter || responsableFilter ? (
            <button
              type="button"
              className="input-modern text-xs"
              onClick={() => {
                setQ('');
                if (isGlobalClientAdmin) setDepositoFilter('');
                setResponsableFilter(isSeller ? defaultScopedResponsable : '');
              }}
            >
              Limpiar
            </button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-8 text-center text-slate-500">Cargando...</div>
          ) : isMobile ? (
            <div className="space-y-3">
              {clientes.map((c) => {
                const deuda = Number(deudas[c.id] || 0);
                const deudaClass =
                  deuda <= 0
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                    : deuda < deudaUmbralRojo
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                      : 'bg-rose-500/20 border-rose-500/40 text-rose-200';
                return (
                  <article key={c.id} className="app-panel p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm text-slate-100 font-medium">
                          {c.nombre} {c.apellido}
                        </div>
                        <div className="text-xs text-slate-400">{c.email || '-'}</div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Sucursal: {c.deposito_principal_nombre || '-'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Responsable: {c.responsable_nombre || '-'}
                        </div>
                      </div>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] border ${
                          c.estado === 'activo'
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                            : 'bg-slate-500/20 border-slate-500/40 text-slate-200'
                        }`}
                      >
                        {c.estado === 'activo' ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] border ${leadSegmentClass(c.lead_segmento)}`}
                      >
                        {leadSegmentLabel(c.lead_segmento)}
                      </span>
                    </div>
                    <div>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${deudaClass}`}>
                        Deuda ${deuda.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="touch-target px-3 py-1.5 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-200 text-xs"
                        onClick={() => verDetalleCliente(c)}
                      >
                        Ver detalle
                      </button>
                      <button
                        className="touch-target px-3 py-1.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-200 text-xs"
                        onClick={() => startEditCliente(c)}
                      >
                        Editar
                      </button>
                      {c.estado === 'activo' ? (
                        <button
                          className="touch-target px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 text-xs"
                          onClick={() => cambiarEstado(c, 'inactivo')}
                        >
                          Desactivar
                        </button>
                      ) : (
                        <>
                          <button
                            className="touch-target px-3 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200 text-xs"
                            onClick={() => cambiarEstado(c, 'activo')}
                          >
                            Activar
                          </button>
                          <button
                            className="touch-target px-3 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 text-xs"
                            onClick={() => eliminarCliente(c)}
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
              {!loading && !clientes.length && (
                <div className="py-6 text-center text-slate-400 app-panel">
                  {q ? 'Sin resultados para la busqueda' : 'Sin clientes registrados'}
                </div>
              )}
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-400">
                <tr>
                  <th className="py-2">Nombre</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Sucursal</th>
                  <th className="py-2">Responsable</th>
                  <th className="py-2">Grupo</th>
                  <th className="py-2">Deuda corriente</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {clientes.map((cliente) => {
                  const deuda = Number(deudas[cliente.id] || 0);
                  const deudaClass =
                    deuda <= 0
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                      : deuda < deudaUmbralRojo
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                      : 'bg-rose-500/20 border-rose-500/40 text-rose-200';

                  return (
                    <tr key={cliente.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="py-2">
                        {cliente.nombre} {cliente.apellido}
                      </td>
                      <td className="py-2">{cliente.email || '-'}</td>
                      <td className="py-2">{cliente.deposito_principal_nombre || '-'}</td>
                      <td className="py-2">
                        {cliente.responsable_nombre || '-'}
                        {cliente.responsable_rol
                          ? (
                            <div className="text-[11px] text-slate-500">
                              {labelResponsableRol(cliente.responsable_rol)}
                            </div>
                          )
                          : null}
                      </td>
                      <td className="py-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${leadSegmentClass(cliente.lead_segmento)}`}
                        >
                          {leadSegmentLabel(cliente.lead_segmento)}
                        </span>
                      </td>
                      <td className="py-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${deudaClass}`}>
                          ${deuda.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
                            cliente.estado === 'activo'
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                              : 'bg-slate-500/20 border-slate-500/40 text-slate-200'
                          }`}
                        >
                          {cliente.estado === 'activo' ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-200 text-xs"
                            onClick={() => verDetalleCliente(cliente)}
                          >
                            Ver detalle
                          </button>
                          <button
                            className="px-2 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-200 text-xs"
                            onClick={() => startEditCliente(cliente)}
                          >
                            Editar
                          </button>
                          {cliente.estado === 'activo' ? (
                            <button
                              className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 text-xs"
                              onClick={() => cambiarEstado(cliente, 'inactivo')}
                            >
                              Desactivar
                            </button>
                          ) : (
                            <>
                              <button
                                className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200 text-xs"
                                onClick={() => cambiarEstado(cliente, 'activo')}
                              >
                                Activar
                              </button>
                              <button
                                className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 text-xs"
                                onClick={() => eliminarCliente(cliente)}
                              >
                                Eliminar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && !clientes.length && (
                  <tr>
                    <td className="py-6 text-center text-slate-400" colSpan={8}>
                      {q ? 'Sin resultados para la busqueda' : 'Sin clientes registrados'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="app-card p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-100">Papelera de clientes</div>
            <div className="text-xs text-slate-400">
              Los clientes eliminados se pueden restaurar para recuperar historial y cobranza.
            </div>
          </div>
          <div className="text-xs text-slate-400">
            {deletedClientes.length} elemento{deletedClientes.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="py-2">Nombre</th>
                <th className="py-2">Email</th>
                <th className="py-2">Eliminado</th>
                <th className="py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {deletedClientes.map((cliente) => (
                <tr key={cliente.id} className="border-t border-white/10 hover:bg-white/5">
                  <td className="py-2">
                    {cliente.nombre} {cliente.apellido}
                  </td>
                  <td className="py-2">{cliente.email || '-'}</td>
                  <td className="py-2">
                    {cliente.deleted_at ? new Date(cliente.deleted_at).toLocaleString() : '-'}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200 transition hover:bg-emerald-500/20"
                      onClick={() => restaurarCliente(cliente)}
                    >
                      Restaurar
                    </button>
                  </td>
                </tr>
              ))}
              {!deletedClientes.length && (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={4}>
                    No hay clientes en papelera.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCliente && (
          <ClienteDetallePanel
            selectedCliente={selectedCliente}
            detalleLoading={detalleLoading}
            detalleError={detalleError}
            isMobile={isMobile}
            deudaUmbralRojo={deudaUmbralRojo}
            resumenSeleccionado={resumenSeleccionado}
            crmOpps={crmOpps}
            crmActs={crmActs}
            clienteInsight={clienteInsight}
            clienteMensajes={clienteMensajes}
            clienteTimeline={clienteTimeline}
            clienteAcceso={clienteAcceso}
            accessError={accessError}
            accessSaving={accessSaving}
            historialCuenta={historialCuenta}
            ventasPendientes={ventasPendientes}
            saldoDeudaAnterior={saldoDeudaAnterior}
            pagoDeudaForm={pagoDeudaForm}
            pagoMetodos={pagoMetodos}
            pagoDeudaSaving={pagoDeudaSaving}
            pagoDeudaError={pagoDeudaError}
            metodosPago={metodosPago}
            metodosPagoLoading={metodosPagoLoading}
            metodosPagoError={metodosPagoError}
            totalPagoMetodos={totalPagoMetodos}
            canSubmitPago={canSubmitPago}
            riesgoMora={riesgoMora}
            promesasCobranza={promesasCobranza}
            recordatoriosCobranza={recordatoriosCobranza}
            cobranzaLoading={cobranzaLoading}
            cobranzaError={cobranzaError}
            promesaForm={promesaForm}
            promesaSaving={promesaSaving}
            recordatorioForm={recordatorioForm}
            recordatorioSaving={recordatorioSaving}
            showHistorialModal={showHistorialModal}
            historialPagos={historialPagos}
            historialLoading={historialLoading}
            historialError={historialError}
            historialDeleting={historialDeleting}
            onClose={() => setSelectedCliente(null)}
            onAbrirHistorial={abrirHistorialPagos}
            onConfigurarAcceso={configurarAccesoCliente}
            onCrearActividadRapida={crearActividadRapida}
            onPagoDeudaFormChange={(changes) => setPagoDeudaForm((prev) => ({ ...prev, ...changes }))}
            onUpdatePagoMetodo={updatePagoMetodo}
            onAddPagoMetodoRow={addPagoMetodoRow}
            onRemovePagoMetodoRow={removePagoMetodoRow}
            onRegistrarPago={(e) => { e.preventDefault(); registrarPagoDeuda(); }}
            onLoadCobranza={() => loadCobranzaCliente(selectedCliente.id)}
            onPromesaFormChange={(changes) => setPromesaForm((prev) => ({ ...prev, ...changes }))}
            onCrearPromesa={crearPromesaCobranza}
            onActualizarEstadoPromesa={actualizarEstadoPromesa}
            onRecordatorioFormChange={(changes) => setRecordatorioForm((prev) => ({ ...prev, ...changes }))}
            onCrearRecordatorio={crearRecordatorioManual}
            onCloseHistorialModal={() => setShowHistorialModal(false)}
            onEliminarPagoHistorial={eliminarPagoHistorial}
          />
        )}

      


    </div>
  );
}
