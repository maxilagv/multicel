import type { LoginResponse, LoginError } from '../types/auth';
import {
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearTokens,
  getApiBase,
} from './storage';

function apiUrl(path: string) {
  const base = getApiBase();
  return base ? `${base}${path}` : path;
}


export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(apiUrl('/api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    let msg = 'Error desconocido';
    try {
      const data: LoginError = await res.json();
      if (data.error) msg = data.error;
      else if (Array.isArray(data.errors) && data.errors.length) msg = data.errors[0].msg;
    } catch (_) { }
    throw new Error(msg);
  }

  return res.json();
}

export async function setupStatus(): Promise<{ requiresSetup: boolean }> {
  const res = await fetch(apiUrl('/api/setup/status'), {
    method: 'GET',
  });
  if (!res.ok) {
    throw new Error('No se pudo verificar el estado de setup');
  }
  return res.json();
}

export async function setupAdmin(payload: {
  nombre: string;
  email: string;
  password: string;
}): Promise<{ ok: true }> {
  const res = await fetch(apiUrl('/api/setup/admin'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = 'No se pudo crear el admin';
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch (_) { }
    throw new Error(msg);
  }
  return res.json();
}

export async function restoreBackupSetup(file: File): Promise<any> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(apiUrl('/api/setup/restore-backup'), {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    let msg = 'No se pudo restaurar el backup';
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch (_) {}
    throw new Error(msg);
  }
  return await res.json();
}

export async function licenseInstallId(): Promise<{ install_id: string | null; demo_expired?: boolean; demo_expires_at?: string | null }> {
  const res = await fetch(apiUrl('/api/license/install-id'), { method: 'GET' });
  if (!res.ok) {
    throw new Error('No se pudo obtener el ID de instalacion');
  }
  return res.json();
}

export async function activateLicensePublic(code: string): Promise<{ message?: string }> {
  const res = await fetch(apiUrl('/api/license/activate-public'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    let msg = 'No se pudo activar la licencia';
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

async function refreshAccessToken(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;
  const res = await fetch(apiUrl('/api/refresh-token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.accessToken) {
    // keep same refresh in storage (session/local depending on where it's stored)
    saveTokens(data.accessToken, rt, Boolean(localStorage.getItem('auth.refreshToken')));
    return data.accessToken as string;
  }
  return null;
}

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const url = apiUrl(path);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as any) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Dev logging (no exponer token completo)
  try {
    if (import.meta?.env?.DEV) {
      const sanitizedHeaders: Record<string, string> = { ...headers };
      if (sanitizedHeaders.Authorization) sanitizedHeaders.Authorization = 'Bearer ***';
      let loggedBody: any = undefined;
      try {
        loggedBody = init.body ? JSON.parse(init.body as any) : undefined;
      } catch {
        loggedBody = (init.body as any) ?? undefined;
      }
      console.debug('[apiFetch] Request', {
        method: init.method || 'GET',
        url,
        headers: sanitizedHeaders,
        body: loggedBody,
      });
    }
  } catch { }
  let res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    const newAt = await refreshAccessToken();
    if (newAt) {
      const retryHeaders = { ...headers, Authorization: `Bearer ${newAt}` };
      res = await fetch(url, { ...init, headers: retryHeaders });
    } else {
      clearTokens();
    }
  }
  try {
    if (import.meta?.env?.DEV) {
      console.debug('[apiFetch] Response', { url, status: res.status });
    }
  } catch { }
  if (!res.ok) {
    let errorText = '';
    try {
      errorText = await res.clone().text().catch(() => '');
      if (import.meta?.env?.DEV) {
        console.debug('[apiFetch] Error response body', { status: res.status, body: errorText });
      }
    } catch { }
    let errMsg = 'Error de red';
    try {
      const data = errorText ? JSON.parse(errorText) : await res.json();
      // Propagar error enriquecido si es un requerimiento de aprobación
      if (res.status === 403 && (data?.aprobacion_id || data?.regla)) {
        const err: any = new Error(data?.error || 'Pendiente de aprobación');
        err.code = 'APPROVAL_REQUIRED';
        if (data?.aprobacion_id) err.aprobacionId = data.aprobacion_id;
        if (data?.regla) err.regla = data.regla;
        throw err;
      }
      if (Array.isArray(data?.errors) && data.errors.length) {
        errMsg = data.errors
          .map((e: any) => {
            const param = e?.param ? String(e.param) : 'campo';
            const msg = e?.msg ? String(e.msg) : 'invalido';
            return `${param}: ${msg}`;
          })
          .join(' | ');
      } else {
        errMsg = data?.error || data?.message || JSON.stringify(data);
      }
    } catch (_) {
      if (errorText) errMsg = errorText;
    }
    try {
      console.error('[apiFetch] Error', { url, status: res.status, body: errorText });
    } catch { }
    throw new Error(errMsg);
  }
  const text = await res.text();
  if (!text) return undefined as any;

  const contentType = res.headers.get('content-type') || '';
  const looksJson = contentType.includes('application/json');

  if (looksJson) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Respuesta invalida del servidor');
    }
  }

  try {
    return JSON.parse(text);
  } catch {
    // Algunos endpoints/proxys devuelven texto plano; no romper toda la UI por eso.
    return text as any;
  }
}

// Domain helpers
export const Api = {
  // Configuración / parámetros del sistema
  getDolarBlue: () => apiFetch('/api/config/dolar-blue'),
  setDolarBlue: (valor: number) =>
    apiFetch('/api/config/dolar-blue', {
      method: 'PUT',
      body: JSON.stringify({ valor }),
    }),
  getDebtThreshold: () => apiFetch('/api/config/deuda-umbral'),
  setDebtThreshold: (valor: number) =>
    apiFetch('/api/config/deuda-umbral', {
      method: 'PUT',
      body: JSON.stringify({ valor }),
    }),
  getPriceLabels: () => apiFetch('/api/config/price-labels'),
  setPriceLabels: (body: { local?: string; distribuidor?: string; final?: string }) =>
    apiFetch('/api/config/price-labels', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  getRankingMetric: () => apiFetch('/api/config/ranking-vendedores'),
  setRankingMetric: (valor: 'cantidad_ventas' | 'margen_venta') =>
    apiFetch('/api/config/ranking-vendedores', {
      method: 'PUT',
      body: JSON.stringify({ valor }),
    }),
  licenseStatus: async () => ({
    status: 'cloud',
    licensed: true,
    plan: 'cloud',
    expires_at: null,
    features: [
      'usuarios',
      'arca',
      'ai',
      'marketplace',
      'cloud',
      'aprobaciones',
      'crm',
      'postventa',
      'multideposito',
    ],
  }),
  licenseInstallId: () => licenseInstallId(),
  activateLicensePublic: (code: string) => activateLicensePublic(code),
  activateLicense: async (_code: string) => ({
    message: 'Licencias locales deshabilitadas en modo cloud',
  }),
  cloudStatus: async () => ({
    connected: true,
    mode: 'cloud-native',
    endpoint: null,
  }),
  cloudActivate: async (_body: { token: string; endpoint?: string | null }) => ({
    message: 'Sin vinculacion local: modo cloud nativo',
  }),
  cloudSnapshot: async () => ({
    queued: false,
    message: 'Sin cola local en modo cloud nativo',
  }),
  cloudQueueStatus: async () => ({
    summary: { pending: 0, processing: 0, sent: 0, error: 0 },
    recent_errors: [],
    last_sent_at: null,
  }),
  getNetworkPolicy: async () => ({
    policy: 'off',
    subnet: '',
  }),
  setNetworkPolicy: async (body: { policy: 'off' | 'private' | 'subnet'; subnet?: string | null }) => ({
    policy: body?.policy || 'off',
    subnet: body?.subnet || '',
    message: 'Politica de red local deshabilitada en cloud',
  }),
  listBackups: async () => [],
  backupStatus: async () => ({
    scheduler_active: false,
    last_run_at: null,
    last_success_at: null,
    last_filename: null,
    last_error: null,
    next_run_at: null,
    settings: {
      enabled: false,
      interval_hours: 0,
      retention_days: 0,
      external_dir: '',
    },
  }),
  saveBackupSettings: async (body: {
    enabled?: boolean;
    interval_hours?: number;
    retention_days?: number;
    external_dir?: string;
  }) => ({
    scheduler_active: false,
    settings: {
      enabled: Boolean(body?.enabled),
      interval_hours: Number(body?.interval_hours ?? 0),
      retention_days: Number(body?.retention_days ?? 0),
      external_dir: body?.external_dir || '',
    },
  }),
  createBackup: async () => ({
    message: 'Backups de archivos locales no disponibles en cloud',
    backup: {
      mirror_error: null,
    },
  }),
  restoreBackup: async (_filename: string) => ({
    message: 'Restore de archivos locales no disponible en cloud',
  }),
  descargarBackup: async (filename: string): Promise<Blob> => {
    throw new Error(
      `Backup local no disponible en cloud: ${filename}`
    );
  },

  // Depósitos
  depositos: (opts: { incluirInactivos?: boolean } = {}) => {
    const qs = opts.incluirInactivos ? '?inactivos=1' : '';
    return apiFetch(`/api/depositos${qs}`);
  },
  crearDeposito: (body: any) =>
    apiFetch('/api/depositos', { method: 'POST', body: JSON.stringify(body) }),
  actualizarDeposito: (id: number, body: any) =>
    apiFetch(`/api/depositos/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  eliminarDeposito: (id: number) =>
    apiFetch(`/api/depositos/${id}`, { method: 'DELETE' }),

  // Catalogo
  catalogoConfig: () => apiFetch('/api/catalogo/config'),
  guardarCatalogoConfig: (body: {
    nombre?: string;
    logo_url?: string;
    destacado_producto_id?: number | null;
    publicado?: boolean;
    price_type?: 'final' | 'distribuidor' | 'mayorista';
    dominio?: string;
  }) =>
    apiFetch('/api/catalogo/config', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  emitirCatalogo: () =>
    apiFetch('/api/catalogo/emitir', {
      method: 'POST',
    }),
  catalogoPublico: () => apiFetch('/api/catalogo'),
  descargarCatalogoExcel: async (
    priceType: 'distribuidor' | 'mayorista' | 'final'
  ): Promise<Blob> => {
    const at = getAccessToken();
    const headers: Record<string, string> = {};
    if (at) headers['Authorization'] = `Bearer ${at}`;
    const p = new URLSearchParams();
    if (priceType) p.set('price_type', priceType);
    const qs = p.toString();
    const res = await fetch(apiUrl(`/api/catalogo/excel${qs ? `?${qs}` : ''}`), {
      method: 'GET',
      headers,
    });
    if (!res.ok) {
      let msg = 'No se pudo descargar el excel del catalogo';
      try {
        const data = await res.json();
        if (data?.error) msg = data.error;
      } catch (_) { }
      throw new Error(msg);
    }
    return await res.blob();
  },
  importarProductosExcel: async (
    file: File,
    opts: { dryRun?: boolean } = {}
  ): Promise<any> => {
    const at = getAccessToken();
    const headers: Record<string, string> = {};
    if (at) headers['Authorization'] = `Bearer ${at}`;
    const form = new FormData();
    form.append('file', file);
    const p = new URLSearchParams();
    if (opts.dryRun) p.set('dry_run', '1');
    const qs = p.toString();
    const res = await fetch(apiUrl(`/api/productos/import${qs ? `?${qs}` : ''}`), {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      let msg = 'No se pudo importar el archivo';
      try {
        const data = await res.json();
        if (data?.error) msg = data.error;
      } catch (_) { }
      throw new Error(msg);
    }
    return await res.json();
  },
  productos: (params?: {
    q?: string;
    category_id?: number;
    include_descendants?: boolean;
    limit?: number;
    offset?: number;
    sort?: string;
    dir?: 'asc' | 'desc';
    page?: number;
    paginated?: boolean;
    all?: boolean;
  }) => {
      const p = new URLSearchParams();
      if (params?.q) p.set('q', params.q);
      if (params?.category_id != null) p.set('category_id', String(params.category_id));
      if (params?.include_descendants) p.set('include_descendants', '1');
      if (params?.limit != null) p.set('limit', String(params.limit));
    if (params?.offset != null) p.set('offset', String(params.offset));
    if (params?.sort) p.set('sort', params.sort);
    if (params?.dir) p.set('dir', params.dir);
    if (params?.page != null) p.set('page', String(params.page));
    if (params?.all) p.set('all', '1');
    const qs = p.toString();
    const promise = apiFetch(`/api/productos${qs ? `?${qs}` : ''}`);
    if (params?.paginated) {
      return promise;
    }
    return promise.then((res: any) => {
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.data)) return res.data;
      return res;
    });
  },
  crearProducto: (body: any) => apiFetch('/api/productos', { method: 'POST', body: JSON.stringify(body) }),
  actualizarProducto: (id: number, body: any) => apiFetch(`/api/productos/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  eliminarProducto: (id: number) => apiFetch(`/api/productos/${id}`, { method: 'DELETE' }),
  productoPorCodigo: (codigo: string) => apiFetch(`/api/productos/codigo/${encodeURIComponent(codigo)}`),
  productoHistorial: (id: number, params: { limit?: number; offset?: number } = {}) => {
    const p = new URLSearchParams();
    if (params.limit != null) p.set('limit', String(params.limit));
    if (params.offset != null) p.set('offset', String(params.offset));
    const qs = p.toString();
    return apiFetch(`/api/productos/${id}/historial${qs ? `?${qs}` : ''}`);
  },
  categorias: () => apiFetch('/api/categorias'),
  categoriasTree: () => apiFetch('/api/categorias/tree'),
  crearCategoria: (body: any) => apiFetch('/api/categorias', { method: 'POST', body: JSON.stringify(body) }),
  actualizarCategoria: (id: number, body: any) => apiFetch(`/api/categorias/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  moverCategoria: (id: number, body: any) => apiFetch(`/api/categorias/${id}/move`, { method: 'PATCH', body: JSON.stringify(body) }),
  eliminarCategoria: (id: number) => apiFetch(`/api/categorias/${id}`, { method: 'DELETE' }),

  // Inventario
  inventario: (q?: string) => apiFetch(`/api/inventario${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  movimientos: (params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    );
    return apiFetch(`/api/inventario/movimientos${qs.size ? `?${qs}` : ''}`);
  },
  inventarioDeposito: (depositoId: number, q?: string) => {
    const p = new URLSearchParams();
    p.set('deposito_id', String(depositoId));
    if (q) p.set('q', q);
    const qs = p.toString();
    return apiFetch(`/api/inventario${qs ? `?${qs}` : ''}`);
  },
  ajustarInventario: (body: { producto_id: number; cantidad: number; motivo?: string; referencia?: string; deposito_id?: number }) =>
    apiFetch('/api/inventario/ajustes', { method: 'POST', body: JSON.stringify(body) }),
  transferirStock: (body: { producto_id: number; cantidad: number; deposito_origen_id: number; deposito_destino_id: number; motivo?: string; referencia?: string }) =>
    apiFetch('/api/inventario/transferencias', { method: 'POST', body: JSON.stringify(body) }),

  // Clientes y proveedores
  clientes: (
    arg?:
      | string
      | {
          q?: string;
          estado?: 'activo' | 'inactivo' | 'todos';
          limit?: number;
          offset?: number;
          all?: boolean;
          view?: 'mobile' | 'full';
        }
  ) => {
    const p = new URLSearchParams();
    if (typeof arg === 'string') {
      if (arg) p.set('q', arg);
    } else if (arg && typeof arg === 'object') {
      if (arg.q) p.set('q', arg.q);
      if (arg.estado && arg.estado !== 'todos') p.set('estado', arg.estado);
      if (arg.limit != null) p.set('limit', String(arg.limit));
      if (arg.offset != null) p.set('offset', String(arg.offset));
      if (arg.all) p.set('all', '1');
      if (arg.view) p.set('view', arg.view);
    }
    const qs = p.toString();
    return apiFetch(`/api/clientes${qs ? `?${qs}` : ''}`);
  },
  crearCliente: (body: any) => apiFetch('/api/clientes', { method: 'POST', body: JSON.stringify(body) }),
  actualizarCliente: (id: number, body: any) => apiFetch(`/api/clientes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  eliminarCliente: (id: number) => apiFetch(`/api/clientes/${id}`, { method: 'DELETE' }),
  clienteAcceso: (clienteId: number) => apiFetch(`/api/clientes/${clienteId}/credenciales`),
  clienteSetPassword: (clienteId: number, body: { password?: string }) =>
    apiFetch(`/api/clientes/${clienteId}/credenciales`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  clienteHistorialPagos: (
    clienteId: number,
    opts: { limit?: number; offset?: number } = {}
  ) => {
    const p = new URLSearchParams();
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.offset != null) p.set('offset', String(opts.offset));
    const qs = p.toString();
    return apiFetch(`/api/clientes/${clienteId}/historial-pagos${qs ? `?${qs}` : ''}`);
  },
  eliminarPagoClienteVenta: (clienteId: number, pagoId: number) =>
    apiFetch(`/api/clientes/${clienteId}/pagos/${pagoId}`, { method: 'DELETE' }),
  eliminarPagoClienteDeuda: (clienteId: number, pagoId: number) =>
    apiFetch(`/api/clientes/${clienteId}/deudas-iniciales/pagos/${pagoId}`, {
      method: 'DELETE',
    }),
  proveedores: (q?: string) => apiFetch(`/api/proveedores${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  proveedorCompras: (proveedorId: number) => apiFetch(`/api/proveedores/${proveedorId}/compras`),
  crearProveedor: (body: any) => apiFetch('/api/proveedores', { method: 'POST', body: JSON.stringify(body) }),
  actualizarProveedor: (id: number, body: any) => apiFetch(`/api/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  // Compras, Ventas, Pagos
  compras: () => apiFetch('/api/compras'),
  compraDetalle: (id: number) => apiFetch(`/api/compras/${id}/detalle`),
  crearCompra: (body: any) => apiFetch('/api/compras', { method: 'POST', body: JSON.stringify(body) }),
  recibirCompra: (id: number, body: any = {}) => apiFetch(`/api/compras/${id}/recibir`, { method: 'POST', body: JSON.stringify(body) }),
  ventas: (
    f: { cliente_id?: number; limit?: number; offset?: number; view?: 'mobile' | 'full' } = {}
  ) => {
    const qs = new URLSearchParams(
      Object.entries(f)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    );
    return apiFetch(`/api/ventas${qs.size ? `?${qs}` : ''}`);
  },
  crearVenta: (body: any) => apiFetch('/api/ventas', { method: 'POST', body: JSON.stringify(body) }),
  ventaDetalle: (id: number) => apiFetch(`/api/ventas/${id}/detalle`),
  entregarVenta: (id: number) => apiFetch(`/api/ventas/${id}/entregar`, { method: 'POST' }),
  ocultarVenta: (id: number) => apiFetch(`/api/ventas/${id}/ocultar`, { method: 'POST' }),
  cancelarVenta: (id: number, body?: { motivo?: string }) =>
    apiFetch(`/api/ventas/${id}/cancelar`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  pagos: (f?: { venta_id?: number; cliente_id?: number }) => apiFetch(`/api/pagos${f ? `?${new URLSearchParams(Object.entries(f as any))}` : ''}`),
  crearPago: (body: any) => apiFetch('/api/pagos', { method: 'POST', body: JSON.stringify(body) }),

  // Ofertas internas y comisiones por lista
  preciosOfertas: (params: { inactivas?: boolean; q?: string; tipo?: string; producto_id?: number; lista_precio_objetivo?: string } = {}) => {
    const p = new URLSearchParams();
    if (params.inactivas) p.set('inactivas', '1');
    if (params.q) p.set('q', params.q);
    if (params.tipo) p.set('tipo', params.tipo);
    if (params.producto_id != null) p.set('producto_id', String(params.producto_id));
    if (params.lista_precio_objetivo) p.set('lista_precio_objetivo', params.lista_precio_objetivo);
    const qs = p.toString();
    return apiFetch(`/api/precios/ofertas${qs ? `?${qs}` : ''}`);
  },
  crearPrecioOferta: (body: any) =>
    apiFetch('/api/precios/ofertas', { method: 'POST', body: JSON.stringify(body) }),
  actualizarPrecioOferta: (id: number, body: any) =>
    apiFetch(`/api/precios/ofertas/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  getComisionListasConfig: () => apiFetch('/api/precios/comisiones'),
  setComisionListasConfig: (body: {
    mode: 'producto' | 'lista';
    porcentajes?: { local?: number; distribuidor?: number; final?: number; oferta?: number };
  }) => apiFetch('/api/precios/comisiones', { method: 'PUT', body: JSON.stringify(body) }),

  // Metodos de pago
  metodosPago: (opts: { inactivos?: boolean } = {}) => {
    const qs = opts.inactivos ? '?inactivos=1' : '';
    return apiFetch(`/api/metodos-pago${qs}`);
  },
  crearMetodoPago: (body: { nombre: string; moneda?: string | null; activo?: boolean; orden?: number }) =>
    apiFetch('/api/metodos-pago', { method: 'POST', body: JSON.stringify(body) }),
  actualizarMetodoPago: (
    id: number,
    body: { nombre?: string; moneda?: string | null; activo?: boolean; orden?: number }
  ) =>
    apiFetch(`/api/metodos-pago/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  eliminarMetodoPago: (id: number) => apiFetch(`/api/metodos-pago/${id}`, { method: 'DELETE' }),

  // Deudas iniciales de clientes
  clienteDeudasIniciales: (clienteId: number) =>
    apiFetch(`/api/clientes/${clienteId}/deudas-iniciales`),
  crearDeudaInicialCliente: (
    clienteId: number,
    body: { monto: number; fecha?: string; descripcion?: string }
  ) => apiFetch(`/api/clientes/${clienteId}/deudas-iniciales`, {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  clientePagosDeudaInicial: (clienteId: number) =>
    apiFetch(`/api/clientes/${clienteId}/deudas-iniciales/pagos`),
  crearPagoDeudaInicialCliente: (
    clienteId: number,
    body: { monto: number; fecha?: string; descripcion?: string }
  ) =>
    apiFetch(`/api/clientes/${clienteId}/deudas-iniciales/pagos`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Zonas
  zonas: (opts: { inactivos?: boolean } = {}) => {
    const qs = opts.inactivos ? '?inactivos=1' : '';
    return apiFetch(`/api/zonas${qs}`);
  },
  crearZona: (body: { nombre: string; color_hex?: string; activo?: boolean }) =>
    apiFetch('/api/zonas', { method: 'POST', body: JSON.stringify(body) }),
  actualizarZona: (id: number, body: { nombre?: string; color_hex?: string; activo?: boolean }) =>
    apiFetch(`/api/zonas/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  eliminarZona: (id: number) =>
    apiFetch(`/api/zonas/${id}`, { method: 'DELETE' }),

  // Reportes
  deudas: () => apiFetch('/api/reportes/deudas'),
  gananciasMensuales: () => apiFetch('/api/reportes/ganancias-mensuales'),
  movimientosFinancieros: (params: { desde: string; hasta: string; agregado?: string }) => {
    const p = new URLSearchParams();
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    if (params.agregado) p.set('agregado', params.agregado);
    const qs = p.toString();
    return apiFetch(`/api/reportes/movimientos${qs ? `?${qs}` : ''}`);
  },
  movimientosResumen: (params: { desde?: string; hasta?: string; usuario_id?: number; deposito_id?: number; cliente_id?: number; proveedor_id?: number } = {}) => {
    const p = new URLSearchParams();
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    if (params.usuario_id != null) p.set('usuario_id', String(params.usuario_id));
    if (params.deposito_id != null) p.set('deposito_id', String(params.deposito_id));
    if (params.cliente_id != null) p.set('cliente_id', String(params.cliente_id));
    if (params.proveedor_id != null) p.set('proveedor_id', String(params.proveedor_id));
    const qs = p.toString();
    return apiFetch(`/api/reportes/movimientos-resumen${qs ? `?${qs}` : ''}`);
  },
  movimientosDetalle: (params: {
    desde?: string;
    hasta?: string;
    usuario_id?: number;
    deposito_id?: number;
    cliente_id?: number;
    proveedor_id?: number;
    tipo?: string;
    limit?: number;
    offset?: number;
  } = {}) => {
    const p = new URLSearchParams();
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    if (params.usuario_id != null) p.set('usuario_id', String(params.usuario_id));
    if (params.deposito_id != null) p.set('deposito_id', String(params.deposito_id));
    if (params.cliente_id != null) p.set('cliente_id', String(params.cliente_id));
    if (params.proveedor_id != null) p.set('proveedor_id', String(params.proveedor_id));
    if (params.tipo) p.set('tipo', params.tipo);
    if (params.limit != null) p.set('limit', String(params.limit));
    if (params.offset != null) p.set('offset', String(params.offset));
    const qs = p.toString();
    return apiFetch(`/api/reportes/movimientos-detalle${qs ? `?${qs}` : ''}`);
  },
  rankingVendedores: (params: { desde?: string; hasta?: string; usuario_id?: number; deposito_id?: number; caja_tipo?: string } = {}) => {
    const p = new URLSearchParams();
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    if (params.usuario_id != null) p.set('usuario_id', String(params.usuario_id));
    if (params.deposito_id != null) p.set('deposito_id', String(params.deposito_id));
    if (params.caja_tipo) p.set('caja_tipo', String(params.caja_tipo));
    const qs = p.toString();
    return apiFetch(`/api/reportes/ranking-vendedores${qs ? `?${qs}` : ''}`);
  },
  movimientosDiaProductos: (params: { fecha?: string; desde?: string; hasta?: string; usuario_id?: number; deposito_id?: number; caja_tipo?: string; zona_id?: number } = {}) => {
    const p = new URLSearchParams();
    if (params.fecha) p.set('fecha', params.fecha);
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    if (params.usuario_id != null) p.set('usuario_id', String(params.usuario_id));
    if (params.deposito_id != null) p.set('deposito_id', String(params.deposito_id));
    if (params.caja_tipo) p.set('caja_tipo', String(params.caja_tipo));
    if (params.zona_id != null) p.set('zona_id', String(params.zona_id));
    const qs = p.toString();
    return apiFetch(`/api/reportes/movimientos-dia-productos${qs ? `?${qs}` : ''}`);
  },
  descargarMovimientosExcel: async (params: { desde: string; hasta: string; zona_id?: number; usuario_id?: number; remito_base?: string }): Promise<Blob> => {
    const at = getAccessToken();
    const headers: Record<string, string> = {};
    if (at) headers['Authorization'] = `Bearer ${at}`;
    const p = new URLSearchParams();
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    if (params.zona_id != null) p.set('zona_id', String(params.zona_id));
    if (params.usuario_id != null) p.set('usuario_id', String(params.usuario_id));
    if (params.remito_base) p.set('remito_base', params.remito_base);
    const qs = p.toString();
    const res = await fetch(apiUrl(`/api/reportes/movimientos-ventas-excel${qs ? `?${qs}` : ''}`), {
      method: 'GET',
      headers,
    });
    if (!res.ok) {
      throw new Error('No se pudo descargar el excel de movimientos');
    }
    return await res.blob();
  },
  stockBajo: () => apiFetch('/api/reportes/stock-bajo'),
  topClientes: (limit = 10) => apiFetch(`/api/reportes/top-clientes?limit=${limit}`),
  topProductosCliente: (clienteId: number, limit = 5) =>
    apiFetch(`/api/reportes/clientes/${clienteId}/top-productos?limit=${limit}`),
  descargarRemito: async (ventaId: number, observaciones?: string): Promise<Blob> => {
    const at = getAccessToken();
    const headers: Record<string, string> = {};
    if (at) headers['Authorization'] = `Bearer ${at}`;
    const qs = observaciones ? `?observaciones=${encodeURIComponent(observaciones)}` : '';
    const res = await fetch(apiUrl(`/api/reportes/remito/${ventaId}.pdf${qs}`), { method: 'GET', headers });
    if (!res.ok) {
      throw new Error('No se pudo descargar el remito');
    }
    return await res.blob();
  },
  descargarInformeGanancias: async (params: { desde: string; hasta: string; agregado?: string }): Promise<Blob> => {
    const at = getAccessToken();
    const headers: Record<string, string> = {};
    if (at) headers['Authorization'] = `Bearer ${at}`;
    const p = new URLSearchParams();
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    if (params.agregado) p.set('agregado', params.agregado);
    const qs = p.toString();
    const res = await fetch(apiUrl(`/api/reportes/ganancias${qs ? `?${qs}` : ''}`), { method: 'GET', headers });
    if (!res.ok) {
      throw new Error('No se pudo descargar el informe de ganancias');
    }
    return await res.blob();
  },

  // Finanzas
  costosProductos: (params: {
    desde?: string;
    hasta?: string;
    periodo?: string;
    groupBy?: 'dia' | 'producto' | 'proveedor' | 'categoria';
    categoria_id?: number;
    include_descendants?: boolean;
  }) => {
    const p = new URLSearchParams();
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    if (params.periodo) p.set('periodo', params.periodo);
    if (params.groupBy) p.set('groupBy', params.groupBy);
    if (params.categoria_id != null) p.set('categoria_id', String(params.categoria_id));
    if (params.include_descendants) p.set('include_descendants', '1');
    const qs = p.toString();
    return apiFetch(`/api/finanzas/costos-productos${qs ? `?${qs}` : ''}`);
  },
  gananciaBruta: (params: { desde?: string; hasta?: string; periodo?: string; agregado?: 'dia' | 'mes'; detalle?: 'producto' | 'cliente'; limit?: number }) => {
    const p = new URLSearchParams();
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    if (params.periodo) p.set('periodo', params.periodo);
    if (params.agregado) p.set('agregado', params.agregado);
    if (params.detalle) p.set('detalle', params.detalle);
    if (params.limit != null) p.set('limit', String(params.limit));
    const qs = p.toString();
    return apiFetch(`/api/finanzas/ganancia-bruta${qs ? `?${qs}` : ''}`);
  },
  gananciaNeta: (params: { desde?: string; hasta?: string; periodo?: string }) => {
    const p = new URLSearchParams();
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    if (params.periodo) p.set('periodo', params.periodo);
    const qs = p.toString();
    return apiFetch(`/api/finanzas/ganancia-neta${qs ? `?${qs}` : ''}`);
  },
  gananciaPorProducto: (params: { desde?: string; hasta?: string; periodo?: string; limit?: number; orderBy?: 'ganancia' | 'ingresos' | 'cantidad' | 'margen'; categoria_id?: number; include_descendants?: boolean }) => {
    const p = new URLSearchParams();
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    if (params.periodo) p.set('periodo', params.periodo);
    if (params.limit != null) p.set('limit', String(params.limit));
    if (params.orderBy) p.set('orderBy', params.orderBy);
    if (params.categoria_id != null) p.set('categoria_id', String(params.categoria_id));
    if (params.include_descendants) p.set('include_descendants', '1');
    const qs = p.toString();
    return apiFetch(`/api/finanzas/ganancia-por-producto${qs ? `?${qs}` : ''}`);
  },
  rentabilidadPorCategoria: (params: { desde?: string; hasta?: string; periodo?: string; limit?: number }) => {
    const p = new URLSearchParams();
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    if (params.periodo) p.set('periodo', params.periodo);
    if (params.limit != null) p.set('limit', String(params.limit));
    const qs = p.toString();
    return apiFetch(`/api/finanzas/rentabilidad-por-categoria${qs ? `?${qs}` : ''}`);
  },
  rentabilidadPorCliente: (params: { desde?: string; hasta?: string; periodo?: string; limit?: number }) => {
    const p = new URLSearchParams();
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    if (params.periodo) p.set('periodo', params.periodo);
    if (params.limit != null) p.set('limit', String(params.limit));
    const qs = p.toString();
    return apiFetch(`/api/finanzas/rentabilidad-por-cliente${qs ? `?${qs}` : ''}`);
  },
  deudasClientes: (opts: { clienteId?: number; detalle?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (opts.clienteId != null) p.set('cliente_id', String(opts.clienteId));
    if (opts.detalle) p.set('detalle', '1');
    const qs = p.toString();
    return apiFetch(`/api/finanzas/deudas-clientes${qs ? `?${qs}` : ''}`);
  },
  deudasProveedores: (opts: { proveedorId?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.proveedorId != null) p.set('proveedor_id', String(opts.proveedorId));
    const qs = p.toString();
    return apiFetch(`/api/finanzas/deudas-proveedores${qs ? `?${qs}` : ''}`);
  },
  cashflow: (params: { desde?: string; hasta?: string; periodo?: string; agrupado?: 'dia' | 'mes' }) => {
    const p = new URLSearchParams();
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    if (params.periodo) p.set('periodo', params.periodo);
    if (params.agrupado) p.set('agrupado', params.agrupado);
    const qs = p.toString();
    return apiFetch(`/api/finanzas/cashflow${qs ? `?${qs}` : ''}`);
  },
  presupuestos: (params: { anio?: number; mes?: number } = {}) => {
    const p = new URLSearchParams();
    if (params.anio != null) p.set('anio', String(params.anio));
    if (params.mes != null) p.set('mes', String(params.mes));
    const qs = p.toString();
    return apiFetch(`/api/finanzas/presupuestos${qs ? `?${qs}` : ''}`);
  },
  guardarPresupuesto: (body: { anio: number; mes: number; tipo: string; categoria: string; monto: number }) =>
    apiFetch('/api/finanzas/presupuestos', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  eliminarPresupuesto: (id: number) =>
    apiFetch(`/api/finanzas/presupuestos/${id}`, {
      method: 'DELETE',
    }),
  presupuestoCategorias: () => apiFetch('/api/finanzas/presupuesto-categorias'),
  presupuestoVsReal: (params: { anio?: number; mes?: number } = {}) => {
    const p = new URLSearchParams();
    if (params.anio != null) p.set('anio', String(params.anio));
    if (params.mes != null) p.set('mes', String(params.mes));
    const qs = p.toString();
    return apiFetch(`/api/finanzas/presupuesto-vs-real${qs ? `?${qs}` : ''}`);
  },
  simuladorFinanciero: (body: {
    aumentoPrecios?: number;
    aumentoCostos?: number;
    aumentoGastos?: number;
    periodoDias?: number;
  }) =>
    apiFetch('/api/finanzas/simulador', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  finanzasDebug: (params: { desde?: string; hasta?: string } = {}) => {
    const p = new URLSearchParams();
    if (params.desde) p.set('desde', params.desde);
    if (params.hasta) p.set('hasta', params.hasta);
    const qs = p.toString();
    return apiFetch(`/api/finanzas/debug${qs ? `?${qs}` : ''}`);
  },

  // AI
  aiForecast: (opts: { days?: number; history?: number; limit?: number; category_id?: number; include_descendants?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (opts.days != null) p.set('days', String(opts.days));
    if (opts.history != null) p.set('history', String(opts.history));
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.category_id != null) p.set('category_id', String(opts.category_id));
    if (opts.include_descendants) p.set('include_descendants', '1');
    const qs = p.toString();
    return apiFetch(`/api/ai/forecast${qs ? `?${qs}` : ''}`);
  },
  aiStockouts: (opts: { days?: number; history?: number; limit?: number; category_id?: number; include_descendants?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (opts.days != null) p.set('days', String(opts.days));
    if (opts.history != null) p.set('history', String(opts.history));
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.category_id != null) p.set('category_id', String(opts.category_id));
    if (opts.include_descendants) p.set('include_descendants', '1');
    const qs = p.toString();
    return apiFetch(`/api/ai/stockouts${qs ? `?${qs}` : ''}`);
  },
  aiAnomalias: (opts: { scope?: 'sales' | 'expenses' | 'both'; period?: number; sigma?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.scope) p.set('scope', opts.scope);
    if (opts.period != null) p.set('period', String(opts.period));
    if (opts.sigma != null) p.set('sigma', String(opts.sigma));
    const qs = p.toString();
    return apiFetch(`/api/ai/anomalias${qs ? `?${qs}` : ''}`);
  },
  aiPrecios: (opts: { margin?: number; history?: number; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.margin != null) p.set('margin', String(opts.margin));
    if (opts.history != null) p.set('history', String(opts.history));
    if (opts.limit != null) p.set('limit', String(opts.limit));
    const qs = p.toString();
    return apiFetch(`/api/ai/precios${qs ? `?${qs}` : ''}`);
  },
  aiInsights: (opts: { days?: number; history?: number; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.days != null) p.set('days', String(opts.days));
    if (opts.history != null) p.set('history', String(opts.history));
    if (opts.limit != null) p.set('limit', String(opts.limit));
    const qs = p.toString();
    return apiFetch(`/api/ai/insights${qs ? `?${qs}` : ''}`);
  },
  aiForecastDetail: (productoId: number, opts: { days?: number; history?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.days != null) p.set('days', String(opts.days));
    if (opts.history != null) p.set('history', String(opts.history));
    const qs = p.toString();
    return apiFetch(`/api/ai/forecast/${productoId}/serie${qs ? `?${qs}` : ''}`);
  },
  aiExplainForecast: (productoId: number, opts: { days?: number; history?: number } = {}) => {
    const body: any = { producto_id: productoId };
    if (opts.days != null) body.forecast_days = opts.days;
    if (opts.history != null) body.history_days = opts.history;
    return apiFetch('/api/ai/explain-forecast', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  aiReportData: (opts: { desde?: string; hasta?: string; history?: number; forecast?: number; limit?: number; top?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.desde) p.set('desde', opts.desde);
    if (opts.hasta) p.set('hasta', opts.hasta);
    if (opts.history != null) p.set('history', String(opts.history));
    if (opts.forecast != null) p.set('forecast', String(opts.forecast));
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.top != null) p.set('top', String(opts.top));
    const qs = p.toString();
    return apiFetch(`/api/ai/report-data${qs ? `?${qs}` : ''}`);
  },
  aiReportSummary: (body: { desde?: string; hasta?: string; history?: number; forecast?: number; limit?: number; top?: number } = {}) =>
    apiFetch('/api/ai/report-summary', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  aiPredictionsSummary: (body: { days?: number; history?: number; limit?: number; category_id?: number; include_descendants?: boolean } = {}) =>
    apiFetch('/api/ai/predictions-summary', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // CRM
  oportunidades: (f: { q?: string; fase?: string; cliente_id?: number; owner_id?: number; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams(Object.entries(f).filter(([_, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    return apiFetch(`/api/crm/oportunidades${qs.size ? `?${qs}` : ''}`);
  },
  crearOportunidad: (body: any) => apiFetch('/api/crm/oportunidades', { method: 'POST', body: JSON.stringify(body) }),
  actualizarOportunidad: (id: number, body: any) => apiFetch(`/api/crm/oportunidades/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  actividades: (f: { cliente_id?: number; oportunidad_id?: number; estado?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams(Object.entries(f).filter(([_, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    return apiFetch(`/api/crm/actividades${qs.size ? `?${qs}` : ''}`);
  },
  crearActividad: (body: any) => apiFetch('/api/crm/actividades', { method: 'POST', body: JSON.stringify(body) }),
  actualizarActividad: (id: number, body: any) => apiFetch(`/api/crm/actividades/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  crmAnalisis: () => apiFetch('/api/crm/analisis'),
  crmSuggestion: (oportunidadId: number) =>
    apiFetch('/api/ai/crm-suggestion', {
      method: 'POST',
      body: JSON.stringify({ oportunidad_id: oportunidadId }),
    }),

  // Tickets
  tickets: (f: { q?: string; estado?: string; prioridad?: string; cliente_id?: number; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams(Object.entries(f).filter(([_, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    return apiFetch(`/api/tickets${qs.size ? `?${qs}` : ''}`);
  },
  crearTicket: (body: any) => apiFetch('/api/tickets', { method: 'POST', body: JSON.stringify(body) }),
  actualizarTicket: (id: number, body: any) => apiFetch(`/api/tickets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  ticketEventos: (id: number) => apiFetch(`/api/tickets/${id}/eventos`),
  crearTicketEvento: (id: number, body: any) => apiFetch(`/api/tickets/${id}/eventos`, { method: 'POST', body: JSON.stringify(body) }),
  ticketReply: (id: number) =>
    apiFetch('/api/ai/ticket-reply', {
      method: 'POST',
      body: JSON.stringify({ ticket_id: id }),
    }),

  // Marketplace
  marketplacePymes: (opts: { q?: string; limit?: number; offset?: number; inactivos?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (opts.q) p.set('q', opts.q);
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.offset != null) p.set('offset', String(opts.offset));
    if (opts.inactivos) p.set('inactivos', '1');
    const qs = p.toString();
    return apiFetch(`/api/marketplace/pymes${qs ? `?${qs}` : ''}`);
  },
  marketplaceCrearPyme: (body: any) =>
    apiFetch('/api/marketplace/pymes', { method: 'POST', body: JSON.stringify(body) }),
  marketplaceActualizarPyme: (id: number, body: any) =>
    apiFetch(`/api/marketplace/pymes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  marketplaceAlianzas: (opts: { q?: string; estado?: string; pyme_id?: number; limit?: number; offset?: number; inactivas?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (opts.q) p.set('q', opts.q);
    if (opts.estado) p.set('estado', opts.estado);
    if (opts.pyme_id != null) p.set('pyme_id', String(opts.pyme_id));
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.offset != null) p.set('offset', String(opts.offset));
    if (opts.inactivas) p.set('inactivas', '1');
    const qs = p.toString();
    return apiFetch(`/api/marketplace/alianzas${qs ? `?${qs}` : ''}`);
  },
  marketplaceCrearAlianza: (body: any) =>
    apiFetch('/api/marketplace/alianzas', { method: 'POST', body: JSON.stringify(body) }),
  marketplaceActualizarAlianza: (id: number, body: any) =>
    apiFetch(`/api/marketplace/alianzas/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  marketplaceOfertas: (alianzaId: number, opts: { inactivas?: boolean } = {}) => {
    const qs = opts.inactivas ? '?inactivas=1' : '';
    return apiFetch(`/api/marketplace/alianzas/${alianzaId}/ofertas${qs}`);
  },
  marketplaceCrearOferta: (alianzaId: number, body: any) =>
    apiFetch(`/api/marketplace/alianzas/${alianzaId}/ofertas`, { method: 'POST', body: JSON.stringify(body) }),
  marketplaceActualizarOferta: (id: number, body: any) =>
    apiFetch(`/api/marketplace/ofertas/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  marketplaceReferidos: (opts: { q?: string; estado?: string; alianza_id?: number; limit?: number; offset?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.q) p.set('q', opts.q);
    if (opts.estado) p.set('estado', opts.estado);
    if (opts.alianza_id != null) p.set('alianza_id', String(opts.alianza_id));
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.offset != null) p.set('offset', String(opts.offset));
    const qs = p.toString();
    return apiFetch(`/api/marketplace/referidos${qs ? `?${qs}` : ''}`);
  },
  marketplaceCrearReferido: (body: any) =>
    apiFetch('/api/marketplace/referidos', { method: 'POST', body: JSON.stringify(body) }),
  marketplaceActualizarReferido: (id: number, body: any) =>
    apiFetch(`/api/marketplace/referidos/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  marketplaceValidarReferido: (body: { codigo: string; total?: number }) =>
    apiFetch('/api/marketplace/referidos/validar', { method: 'POST', body: JSON.stringify(body) }),
  marketplaceReporteAlianzas: (opts: { desde?: string; hasta?: string; alianza_id?: number; pyme_id?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.desde) p.set('desde', opts.desde);
    if (opts.hasta) p.set('hasta', opts.hasta);
    if (opts.alianza_id != null) p.set('alianza_id', String(opts.alianza_id));
    if (opts.pyme_id != null) p.set('pyme_id', String(opts.pyme_id));
    const qs = p.toString();
    return apiFetch(`/api/marketplace/reportes/alianzas${qs ? `?${qs}` : ''}`);
  },
  marketplaceSyncExport: () => apiFetch('/api/marketplace/sync/export'),
  marketplaceSyncImport: (body: any) =>
    apiFetch('/api/marketplace/sync/import', { method: 'POST', body: JSON.stringify(body) }),

  // Sueldos vendedores
  vendedoresSueldos: (opts: { periodo?: 'dia' | 'semana' | 'mes'; desde?: string; hasta?: string } = {}) => {
    const p = new URLSearchParams();
    if (opts.periodo) p.set('periodo', opts.periodo);
    if (opts.desde) p.set('desde', opts.desde);
    if (opts.hasta) p.set('hasta', opts.hasta);
    const qs = p.toString();
    return apiFetch(`/api/vendedores/sueldos${qs ? `?${qs}` : ''}`);
  },
  vendedorVentas: (
    vendedorId: number,
    opts: { periodo?: 'dia' | 'semana' | 'mes'; desde?: string; hasta?: string; limit?: number; offset?: number } = {}
  ) => {
    const p = new URLSearchParams();
    if (opts.periodo) p.set('periodo', opts.periodo);
    if (opts.desde) p.set('desde', opts.desde);
    if (opts.hasta) p.set('hasta', opts.hasta);
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.offset != null) p.set('offset', String(opts.offset));
    const qs = p.toString();
    return apiFetch(`/api/vendedores/${vendedorId}/ventas${qs ? `?${qs}` : ''}`);
  },
  vendedorComision: (vendedorId: number, periodo?: 'dia' | 'semana' | 'mes') => {
    const qs = periodo ? `?periodo=${encodeURIComponent(periodo)}` : '';
    return apiFetch(`/api/vendedores/${vendedorId}/comision${qs}`);
  },
  setVendedorComision: (
    vendedorId: number,
    body: { periodo: 'dia' | 'semana' | 'mes'; porcentaje: number; vigencia_desde?: string; vigencia_hasta?: string; base_tipo?: 'bruto' | 'neto' }
  ) => apiFetch(`/api/vendedores/${vendedorId}/comision`, { method: 'PUT', body: JSON.stringify(body) }),
  vendedorPagos: (
    vendedorId: number,
    opts: { periodo?: 'dia' | 'semana' | 'mes'; desde?: string; hasta?: string; limit?: number; offset?: number } = {}
  ) => {
    const p = new URLSearchParams();
    if (opts.periodo) p.set('periodo', opts.periodo);
    if (opts.desde) p.set('desde', opts.desde);
    if (opts.hasta) p.set('hasta', opts.hasta);
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.offset != null) p.set('offset', String(opts.offset));
    const qs = p.toString();
    return apiFetch(`/api/vendedores/${vendedorId}/pagos${qs ? `?${qs}` : ''}`);
  },
  crearVendedorPago: (
    vendedorId: number,
    body: { periodo: 'dia' | 'semana' | 'mes'; desde: string; hasta: string; monto_pagado: number; metodo?: string; notas?: string }
  ) => apiFetch(`/api/vendedores/${vendedorId}/pagos`, { method: 'POST', body: JSON.stringify(body) }),

  // Aprobaciones
  aprobaciones: (f: { estado?: 'pendiente' | 'aprobado' | 'rechazado'; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams(Object.entries(f).filter(([_, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    return apiFetch(`/api/aprobaciones${qs.size ? `?${qs}` : ''}`);
  },
  aprobar: (id: number, notas?: string) => apiFetch(`/api/aprobaciones/${id}/aprobar`, { method: 'POST', body: JSON.stringify({ notas }) }),
  rechazar: (id: number, notas?: string) => apiFetch(`/api/aprobaciones/${id}/rechazar`, { method: 'POST', body: JSON.stringify({ notas }) }),
  resetPanelData: () =>
    apiFetch('/api/config/reset-panel', {
      method: 'POST',
    }),
  // Centro de mando duenio (Fase 4 y 5)
  ownerRiskRanking: (opts: { limit?: number; persist?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.persist != null) p.set('persist', opts.persist ? '1' : '0');
    const qs = p.toString();
    return apiFetch(`/api/duenio/cobranzas/ranking-riesgo${qs ? `?${qs}` : ''}`);
  },
  ownerAutoReminders: (body: { limit?: number } = {}) =>
    apiFetch('/api/duenio/cobranzas/recordatorios/auto', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  ownerReminders: (opts: { status?: string; cliente_id?: number; limit?: number; offset?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.status) p.set('status', opts.status);
    if (opts.cliente_id != null) p.set('cliente_id', String(opts.cliente_id));
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.offset != null) p.set('offset', String(opts.offset));
    const qs = p.toString();
    return apiFetch(`/api/duenio/cobranzas/recordatorios${qs ? `?${qs}` : ''}`);
  },
  ownerCreateReminder: (body: {
    cliente_id: number;
    canal?: 'whatsapp' | 'email' | 'manual';
    destino?: string;
    template_code?: string;
    payload?: Record<string, any>;
    scheduled_at?: string;
  }) =>
    apiFetch('/api/duenio/cobranzas/recordatorios', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  ownerPromises: (opts: { estado?: string; cliente_id?: number; limit?: number; offset?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.estado) p.set('estado', opts.estado);
    if (opts.cliente_id != null) p.set('cliente_id', String(opts.cliente_id));
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.offset != null) p.set('offset', String(opts.offset));
    const qs = p.toString();
    return apiFetch(`/api/duenio/cobranzas/promesas${qs ? `?${qs}` : ''}`);
  },
  ownerCreatePromise: (body: {
    cliente_id: number;
    monto_prometido: number;
    fecha_promesa: string;
    canal_preferido?: 'whatsapp' | 'email' | 'telefono' | 'manual';
    notas?: string;
  }) =>
    apiFetch('/api/duenio/cobranzas/promesas', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  ownerUpdatePromiseStatus: (
    id: number,
    body: { estado: 'pendiente' | 'cumplida' | 'incumplida' | 'cancelada'; notas?: string }
  ) =>
    apiFetch(`/api/duenio/cobranzas/promesas/${id}/estado`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  ownerMarginsRealtime: (opts: { dimension?: 'producto' | 'vendedor' | 'deposito'; desde?: string; hasta?: string; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.dimension) p.set('dimension', opts.dimension);
    if (opts.desde) p.set('desde', opts.desde);
    if (opts.hasta) p.set('hasta', opts.hasta);
    if (opts.limit != null) p.set('limit', String(opts.limit));
    const qs = p.toString();
    return apiFetch(`/api/duenio/margenes/tiempo-real${qs ? `?${qs}` : ''}`);
  },
  ownerRepricingRules: () => apiFetch('/api/duenio/repricing/reglas'),
  ownerCreateRepricingRule: (body: any) =>
    apiFetch('/api/duenio/repricing/reglas', { method: 'POST', body: JSON.stringify(body) }),
  ownerUpdateRepricingRule: (id: number, body: any) =>
    apiFetch(`/api/duenio/repricing/reglas/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  ownerRepricingPreview: (body: { product_ids?: number[]; limit?: number } = {}) =>
    apiFetch('/api/duenio/repricing/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  ownerRepricingApply: (body: { product_ids?: number[]; limit?: number } = {}) =>
    apiFetch('/api/duenio/repricing/aplicar', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  ownerCommandCenter: (opts: { base_cash?: number; horizons?: string; persist_alerts?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (opts.base_cash != null) p.set('base_cash', String(opts.base_cash));
    if (opts.horizons) p.set('horizons', opts.horizons);
    if (opts.persist_alerts != null) p.set('persist_alerts', opts.persist_alerts ? '1' : '0');
    const qs = p.toString();
    return apiFetch(`/api/duenio/centro-mando${qs ? `?${qs}` : ''}`);
  },
  ownerAlerts: (opts: { status?: 'open' | 'dismissed'; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.status) p.set('status', opts.status);
    if (opts.limit != null) p.set('limit', String(opts.limit));
    const qs = p.toString();
    return apiFetch(`/api/duenio/alertas${qs ? `?${qs}` : ''}`);
  },
  ownerDismissAlert: (id: number) =>
    apiFetch(`/api/duenio/alertas/${id}/dismiss`, { method: 'POST' }),
  ownerFiscalRules: () => apiFetch('/api/duenio/fiscal-ar/reglas'),
  ownerCreateFiscalRule: (body: any) =>
    apiFetch('/api/duenio/fiscal-ar/reglas', { method: 'POST', body: JSON.stringify(body) }),
  ownerUpdateFiscalRule: (id: number, body: any) =>
    apiFetch(`/api/duenio/fiscal-ar/reglas/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  ownerSimulateFiscal: (body: any) =>
    apiFetch('/api/duenio/fiscal-ar/simular', { method: 'POST', body: JSON.stringify(body) }),
  ownerPriceLists: () => apiFetch('/api/duenio/listas-precios'),
  ownerCreatePriceList: (body: any) =>
    apiFetch('/api/duenio/listas-precios', { method: 'POST', body: JSON.stringify(body) }),
  ownerUpdatePriceList: (id: number, body: any) =>
    apiFetch(`/api/duenio/listas-precios/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  ownerPriceListRules: (id: number) => apiFetch(`/api/duenio/listas-precios/${id}/reglas`),
  ownerCreatePriceListRule: (id: number, body: any) =>
    apiFetch(`/api/duenio/listas-precios/${id}/reglas`, { method: 'POST', body: JSON.stringify(body) }),
  ownerUpdatePriceListRule: (ruleId: number, body: any) =>
    apiFetch(`/api/duenio/listas-precios/reglas/${ruleId}`, { method: 'PUT', body: JSON.stringify(body) }),
  ownerPreviewPriceList: (id: number, body: { limit?: number } = {}) =>
    apiFetch(`/api/duenio/listas-precios/${id}/preview`, { method: 'POST', body: JSON.stringify(body) }),
  ownerChannelIntegrations: () => apiFetch('/api/duenio/integraciones/canales'),
  ownerUpsertChannelIntegration: (canal: 'mercadolibre' | 'tiendanube' | 'whatsapp_catalog', body: any) =>
    apiFetch(`/api/duenio/integraciones/canales/${canal}`, { method: 'PUT', body: JSON.stringify(body) }),
  ownerQueueChannelSync: (canal: 'mercadolibre' | 'tiendanube' | 'whatsapp_catalog', body: any) =>
    apiFetch(`/api/duenio/integraciones/canales/${canal}/sync`, { method: 'POST', body: JSON.stringify(body) }),
  ownerChannelJobs: (opts: { status?: 'pending' | 'running' | 'done' | 'failed'; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.status) p.set('status', opts.status);
    if (opts.limit != null) p.set('limit', String(opts.limit));
    const qs = p.toString();
    return apiFetch(`/api/duenio/integraciones/jobs${qs ? `?${qs}` : ''}`);
  },
  ownerBetaCompanies: () => apiFetch('/api/duenio/beta/empresas'),
  ownerCreateBetaCompany: (body: any) =>
    apiFetch('/api/duenio/beta/empresas', { method: 'POST', body: JSON.stringify(body) }),
  ownerCreateBetaFeedback: (id: number, body: any) =>
    apiFetch(`/api/duenio/beta/empresas/${id}/feedback`, { method: 'POST', body: JSON.stringify(body) }),
  ownerBetaMetrics: () => apiFetch('/api/duenio/beta/metricas'),
  ownerReleaseCycles: () => apiFetch('/api/duenio/release-train/ciclos'),
  ownerCreateReleaseCycle: (body: any) =>
    apiFetch('/api/duenio/release-train/ciclos', { method: 'POST', body: JSON.stringify(body) }),
  ownerAddReleaseEntry: (id: number, body: any) =>
    apiFetch(`/api/duenio/release-train/ciclos/${id}/entries`, { method: 'POST', body: JSON.stringify(body) }),
  ownerCloseReleaseCycle: (id: number, body: { changelog_resumen?: string } = {}) =>
    apiFetch(`/api/duenio/release-train/ciclos/${id}/cerrar`, { method: 'POST', body: JSON.stringify(body) }),
  factoryReset: () =>
    apiFetch('/api/setup/reset-database', {
      method: 'POST',
    }),

  // ARCA
  arcaConfig: () => apiFetch('/api/arca/config'),
  arcaSaveConfig: (body: any) =>
    apiFetch('/api/arca/config', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  arcaTest: () =>
    apiFetch('/api/arca/test', {
      method: 'POST',
    }),
  arcaPuntosVenta: () => apiFetch('/api/arca/puntos-venta'),
  arcaCrearPuntoVenta: (body: { punto_venta: number; nombre?: string; activo?: boolean }) =>
    apiFetch('/api/arca/puntos-venta', { method: 'POST', body: JSON.stringify(body) }),
  arcaActualizarPuntoVenta: (id: number, body: { punto_venta: number; nombre?: string; activo?: boolean }) =>
    apiFetch(`/api/arca/puntos-venta/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  arcaEliminarPuntoVenta: (id: number) =>
    apiFetch(`/api/arca/puntos-venta/${id}`, { method: 'DELETE' }),
  arcaAsignarDeposito: (body: { deposito_id: number; punto_venta_id: number }) =>
    apiFetch('/api/arca/puntos-venta/asignar', { method: 'POST', body: JSON.stringify(body) }),
  arcaDepositos: () => apiFetch('/api/arca/depositos'),
  arcaPadronCliente: (clienteId: number, body: { cuit: string; overwrite?: boolean }) =>
    apiFetch(`/api/arca/clientes/${clienteId}/padron`, { method: 'POST', body: JSON.stringify(body) }),
  arcaEmitirFactura: (body: {
    venta_id: number;
    punto_venta_id?: number;
    tipo_comprobante?: 'A' | 'B' | 'C';
    concepto?: number;
    fecha_serv_desde?: string;
    fecha_serv_hasta?: string;
    fecha_vto_pago?: string;
  }) =>
    apiFetch('/api/arca/emitir', { method: 'POST', body: JSON.stringify(body) }),
  arcaFactura: (ventaId: number) => apiFetch(`/api/arca/facturas/${ventaId}`),
  arcaFacturaPdf: async (ventaId: number): Promise<Blob> => {
    const at = getAccessToken();
    const headers: Record<string, string> = {};
    if (at) headers['Authorization'] = `Bearer ${at}`;
    const res = await fetch(apiUrl(`/api/arca/facturas/${ventaId}/pdf`), {
      method: 'GET',
      headers,
    });
    if (!res.ok) {
      throw new Error('No se pudo descargar la factura');
    }
    return await res.blob();
  },
};
