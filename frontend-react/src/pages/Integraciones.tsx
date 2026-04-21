import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  LogOut,
  Pause,
  Play,
  RefreshCw,
  ShoppingBag,
  X,
  XCircle,
} from 'lucide-react';
import { Api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import type { IntegracionMpStatus, IntegracionMlStatus, MlSyncedProduct } from '../types/entities';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(val: string | null | undefined) {
  if (!val) return null;
  try {
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(val));
  } catch {
    return val;
  }
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
        connected
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
          : 'bg-slate-700/60 text-slate-400 border border-slate-600/40'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
      {label ?? (connected ? 'Conectado' : 'Desconectado')}
    </span>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl overflow-hidden">
      {children}
    </div>
  );
}

function SectionHeader({
  logo,
  title,
  subtitle,
  connected,
  loading,
}: {
  logo: React.ReactNode;
  title: string;
  subtitle: string;
  connected: boolean;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-4 px-6 py-5 border-b border-white/8">
      <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center bg-white/6">
        {logo}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-base leading-none">{title}</p>
        <p className="text-slate-400 text-xs mt-1">{subtitle}</p>
      </div>
      {loading ? (
        <Loader2 className="w-4 h-4 text-slate-500 animate-spin shrink-0" />
      ) : (
        <StatusBadge connected={connected} />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-white text-sm font-medium">{value || '—'}</span>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

function SuccessBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm text-emerald-400">
      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

// ─── MercadoPago Section ──────────────────────────────────────────────────────

function MercadoPagoSection() {
  const toastApi = useToast();
  const toast = (opts: { type: 'success' | 'error' | 'info' | 'warning'; message: string }) =>
    toastApi[opts.type](opts.message);
  const queryClient = useQueryClient();
  const [tokenInput, setTokenInput]       = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [showAdvanced, setShowAdvanced]   = useState(false);
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

  const { data: status, isLoading } = useQuery<IntegracionMpStatus>({
    queryKey: ['mp-status'],
    queryFn: () => Api.mpStatus(),
    refetchInterval: 30_000,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: () => Api.mpSaveToken(tokenInput.trim(), webhookSecret.trim() || undefined),
    onSuccess: (res) => {
      toast({ type: 'success', message: res.message || 'MercadoPago conectado correctamente' });
      setTokenInput('');
      setWebhookSecret('');
      queryClient.invalidateQueries({ queryKey: ['mp-status'] });
    },
    onError: (err: any) => {
      toast({ type: 'error', message: err?.message || 'No se pudo conectar MercadoPago' });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => Api.mpDisconnect(),
    onSuccess: () => {
      toast({ type: 'success', message: 'MercadoPago desconectado' });
      setDisconnectConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['mp-status'] });
    },
    onError: (err: any) => {
      toast({ type: 'error', message: err?.message || 'No se pudo desconectar' });
    },
  });

  const connected = status?.connected ?? false;

  return (
    <SectionCard>
      <SectionHeader
        logo={
          <svg viewBox="0 0 48 48" className="w-6 h-6" fill="none">
            <circle cx="24" cy="24" r="24" fill="#009EE3" />
            <path d="M14 20h12a6 6 0 010 12H14V20z" fill="white" />
            <path d="M14 20h8a6 6 0 010 12H14V20z" fill="#00BCFF" opacity=".6" />
          </svg>
        }
        title="MercadoPago"
        subtitle="Cobros online · links de pago para ventas · webhooks automáticos"
        connected={connected}
        loading={isLoading}
      />

      <div className="px-6 py-5 space-y-5">
        {/* Estado conectado */}
        {connected && status && (
          <>
            <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 space-y-0">
              <InfoRow label="Usuario MP" value={status.mp_user_name || status.mp_user_id} />
              <InfoRow label="ID de usuario" value={status.mp_user_id} />
              <InfoRow label="Último sync" value={formatDate(status.last_sync_at)} />
              <InfoRow
                label="Webhook secret"
                value={
                  status.webhook_secret_configured ? (
                    <StatusBadge connected label="Configurado" />
                  ) : (
                    <span className="text-slate-500 text-xs">No configurado</span>
                  )
                }
              />
            </div>

            {status.last_error && <ErrorBox message={`Último error: ${status.last_error}`} />}

            {/* Desconectar */}
            {disconnectConfirm ? (
              <div className="flex items-center gap-3 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
                <span className="flex-1 text-sm text-red-300">
                  ¿Confirmas que querés desconectar MercadoPago? Se eliminarán las credenciales guardadas.
                </span>
                <button
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {disconnectMutation.isPending ? 'Desconectando...' : 'Sí, desconectar'}
                </button>
                <button
                  onClick={() => setDisconnectConfirm(false)}
                  className="p-1.5 hover:bg-white/8 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDisconnectConfirm(true)}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-red-400 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Desconectar MercadoPago
              </button>
            )}
          </>
        )}

        {/* Formulario de conexión */}
        {!connected && (
          <div className="space-y-4">
            <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl px-4 py-3 text-sm text-blue-300">
              <p className="font-medium mb-1">¿Cómo obtener el Access Token?</p>
              <ol className="list-decimal list-inside space-y-0.5 text-blue-300/80">
                <li>Ingresá a <span className="font-mono">mercadopago.com.ar/developers</span></li>
                <li>Seleccioná tu aplicación (o creá una nueva)</li>
                <li>En "Credenciales de producción" copiá el <strong>Access Token</strong></li>
                <li>El token empieza con <span className="font-mono">APP_USR-</span></li>
              </ol>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-slate-300 font-medium block mb-1.5">Access Token *</span>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="APP_USR-..."
                  className="w-full bg-white/5 border border-white/12 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-500 outline-none focus:border-blue-500/50 transition-colors font-mono"
                />
              </label>

              {/* Sección avanzada */}
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Opciones avanzadas (Webhook Secret)
              </button>

              {showAdvanced && (
                <label className="block">
                  <span className="text-sm text-slate-300 font-medium block mb-1.5">
                    Webhook Secret <span className="text-slate-500 font-normal">(opcional)</span>
                  </span>
                  <input
                    type="password"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder="Secret configurado en la consola de MP"
                    className="w-full bg-white/5 border border-white/12 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-500 outline-none focus:border-blue-500/50 transition-colors font-mono"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Si configurás notificaciones en MP Developer, ingresá el mismo secreto aquí para validar la firma de los webhooks.
                  </p>
                </label>
              )}
            </div>

            <button
              onClick={() => saveMutation.mutate()}
              disabled={!tokenInput.trim() || saveMutation.isPending}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 rounded-xl transition-colors"
            >
              {saveMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Verificando token...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Verificar y conectar</>
              )}
            </button>
          </div>
        )}

        {/* URL del webhook */}
        <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 space-y-1">
          <p className="text-xs text-slate-400 font-medium">URL del webhook (configurar en MP Developer)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-slate-300 font-mono truncate">
              {window.location.origin}/api/integraciones/mp/webhook
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/api/integraciones/mp/webhook`);
                toast({ type: 'success', message: 'URL copiada al portapapeles' });
              }}
              className="shrink-0 p-1.5 hover:bg-white/8 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── MercadoLibre Section ─────────────────────────────────────────────────────

function MlProductRow({
  product,
  onAction,
}: {
  product: MlSyncedProduct;
  onAction: (id: number, action: 'pause' | 'reactivate' | 'close') => void;
}) {
  const estadoColor: Record<string, string> = {
    active:       'text-emerald-400',
    paused:       'text-yellow-400',
    closed:       'text-slate-500',
    under_review: 'text-blue-400',
    error:        'text-red-400',
  };
  const estadoLabel: Record<string, string> = {
    active:       'Activa',
    paused:       'Pausada',
    closed:       'Cerrada',
    under_review: 'En revisión',
    error:        'Error',
  };

  return (
    <tr className="border-b border-white/5 hover:bg-white/3 transition-colors">
      <td className="py-3 px-4">
        <p className="text-sm text-white font-medium truncate max-w-[200px]" title={product.product_name ?? ''}>
          {product.product_name || `Producto ${product.producto_id}`}
        </p>
        {product.product_codigo && (
          <p className="text-xs text-slate-500 font-mono">{product.product_codigo}</p>
        )}
      </td>
      <td className="py-3 px-4">
        <a
          href={product.ml_item_url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-mono transition-colors"
        >
          {product.ml_item_id}
          {product.ml_item_url && <ExternalLink className="w-3 h-3" />}
        </a>
      </td>
      <td className="py-3 px-4 text-sm text-slate-300 text-right">
        {formatCurrency(product.precio_publicado)}
      </td>
      <td className="py-3 px-4 text-sm text-slate-300 text-right">
        {product.stock_publicado}
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs font-medium ${estadoColor[product.estado] || 'text-slate-400'}`}>
          {estadoLabel[product.estado] || product.estado}
        </span>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1 justify-end">
          {product.estado === 'active' && (
            <button
              onClick={() => onAction(product.producto_id, 'pause')}
              title="Pausar publicación"
              className="p-1.5 hover:bg-yellow-500/15 text-slate-400 hover:text-yellow-400 rounded-lg transition-colors"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          )}
          {product.estado === 'paused' && (
            <button
              onClick={() => onAction(product.producto_id, 'reactivate')}
              title="Reactivar publicación"
              className="p-1.5 hover:bg-emerald-500/15 text-slate-400 hover:text-emerald-400 rounded-lg transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          {product.estado !== 'closed' && (
            <button
              onClick={() => onAction(product.producto_id, 'close')}
              title="Cerrar publicación"
              className="p-1.5 hover:bg-red-500/15 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ImportOrdersModal({
  onClose,
  onImport,
  loading,
}: {
  onClose: () => void;
  onImport: (params: { from?: string; to?: string; limit?: number }) => void;
  loading: boolean;
}) {
  const [from, setFrom]   = useState('');
  const [to, setTo]       = useState('');
  const [limit, setLimit] = useState('20');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-white/12 rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Importar órdenes de ML</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/8 rounded-lg text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-slate-400">
          Se importarán las órdenes pagas de MercadoLibre como ventas en Kaisen. Las ya importadas se omiten automáticamente.
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-slate-400 block mb-1">Desde (opcional)</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/50 transition-colors"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 block mb-1">Hasta (opcional)</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/50 transition-colors"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 block mb-1">Límite de órdenes</span>
            <select
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="w-full bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/50 transition-colors"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </label>
        </div>

        <button
          onClick={() => onImport({ from: from || undefined, to: to || undefined, limit: Number(limit) })}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold text-sm py-2.5 rounded-xl transition-colors"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</>
          ) : (
            <><ShoppingBag className="w-4 h-4" /> Importar órdenes</>
          )}
        </button>
      </div>
    </div>
  );
}

function SyncProductForm({
  initialProductId,
  onSuccess,
  onCancel,
}: {
  initialProductId: number;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const toastApi = useToast();
  const toast = (opts: { type: 'success' | 'error' | 'info' | 'warning'; message: string }) =>
    toastApi[opts.type](opts.message);
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');

  const syncMutation = useMutation({
    mutationFn: () =>
      Api.mlSyncProduct({
        producto_id: initialProductId,
        ...(categoryId.trim() ? { category_id: categoryId.trim() } : {}),
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(price ? { price: Number(price) } : {}),
        ...(qty ? { available_quantity: Number(qty) } : {}),
      }),
    onSuccess: () => {
      toast({ type: 'success', message: 'Producto publicado en MercadoLibre' });
      queryClient.invalidateQueries({ queryKey: ['ml-synced-products'] });
      onSuccess();
    },
    onError: (err: any) => {
      toast({ type: 'error', message: err?.message || 'No se pudo publicar el producto' });
    },
  });

  return (
    <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-yellow-300">Publicar producto #{initialProductId} en ML</p>
        <button type="button" onClick={onCancel} className="p-1 hover:bg-white/8 rounded text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <label className="block">
          <span className="text-slate-400 block mb-1">Categoria ML <span className="text-yellow-400">(requerido)</span></span>
          <input
            type="text"
            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-xs"
            placeholder="Ej: MLA1055"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-slate-400 block mb-1">Titulo (opcional)</span>
          <input
            type="text"
            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-xs"
            placeholder="Usa el nombre del producto por defecto"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-slate-400 block mb-1">Precio override (opcional)</span>
          <input
            type="number"
            min={0}
            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-xs"
            placeholder="Usa el precio del producto"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-slate-400 block mb-1">Stock a publicar (opcional)</span>
          <input
            type="number"
            min={1}
            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-xs"
            placeholder="Usa el stock actual del producto"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={syncMutation.isPending || !categoryId.trim()}
        onClick={() => syncMutation.mutate()}
        className="w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold text-sm py-2 rounded-xl transition-colors"
      >
        {syncMutation.isPending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Publicando...</>
        ) : (
          'Publicar en MercadoLibre'
        )}
      </button>
    </div>
  );
}

function MercadoLibreSection({ initialSyncProductId }: { initialSyncProductId?: number | null }) {
  const toastApi = useToast();
  const toast = (opts: { type: 'success' | 'error' | 'info' | 'warning'; message: string }) =>
    toastApi[opts.type](opts.message);
  const queryClient = useQueryClient();
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);
  const [showImportModal, setShowImportModal]     = useState(false);
  const [showSyncForm, setShowSyncForm]           = useState(!!initialSyncProductId);
  const [productPage, setProductPage]             = useState(0);
  const PAGE_SIZE = 10;

  const { data: status, isLoading: statusLoading } = useQuery<IntegracionMlStatus>({
    queryKey: ['ml-status'],
    queryFn: () => Api.mlStatus(),
    refetchInterval: 30_000,
    retry: false,
  });

  const { data: syncedProducts, isLoading: productsLoading, refetch: refetchProducts } = useQuery<MlSyncedProduct[]>({
    queryKey: ['ml-synced-products', productPage],
    queryFn: () => Api.mlListSyncedProducts({ limit: PAGE_SIZE, offset: productPage * PAGE_SIZE }),
    enabled: status?.connected === true,
    retry: false,
  });

  const connectMutation = useMutation({
    mutationFn: () => Api.mlGetAuthUrl(),
    onSuccess: ({ url }) => {
      window.open(url, '_blank', 'noopener,noreferrer,width=800,height=700');
      toast({ type: 'info', message: 'Autorizá la conexión en la ventana de MercadoLibre y volvé acá.' });
    },
    onError: (err: any) => {
      toast({ type: 'error', message: err?.message || 'No se pudo generar la URL de autorización' });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => Api.mlDisconnect(),
    onSuccess: () => {
      toast({ type: 'success', message: 'MercadoLibre desconectado' });
      setDisconnectConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['ml-status'] });
      queryClient.invalidateQueries({ queryKey: ['ml-synced-products'] });
    },
    onError: (err: any) => {
      toast({ type: 'error', message: err?.message || 'No se pudo desconectar' });
    },
  });

  const productActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'pause' | 'reactivate' | 'close' }) => {
      if (action === 'pause') return Api.mlPauseProduct(id);
      if (action === 'reactivate') return Api.mlReactivateProduct(id);
      return Api.mlCloseProduct(id);
    },
    onSuccess: (_, { action }) => {
      const msgs = { pause: 'Publicación pausada', reactivate: 'Publicación reactivada', close: 'Publicación cerrada' };
      toast({ type: 'success', message: msgs[action] });
      refetchProducts();
    },
    onError: (err: any) => {
      toast({ type: 'error', message: err?.message || 'No se pudo actualizar la publicación' });
    },
  });

  const importMutation = useMutation({
    mutationFn: (params: { from?: string; to?: string; limit?: number }) => Api.mlImportOrders(params),
    onSuccess: (result) => {
      const msg = `${result.imported} órdenes importadas, ${result.skipped} omitidas`;
      toast({ type: 'success', message: msg });
      setShowImportModal(false);
      if (result.errors?.length) {
        console.warn('[ML Import] errores:', result.errors);
      }
    },
    onError: (err: any) => {
      toast({ type: 'error', message: err?.message || 'No se pudieron importar las órdenes' });
    },
  });

  const connected = status?.connected ?? false;

  const handleProductAction = useCallback(
    (id: number, action: 'pause' | 'reactivate' | 'close') => {
      productActionMutation.mutate({ id, action });
    },
    [productActionMutation]
  );

  return (
    <>
      {showImportModal && (
        <ImportOrdersModal
          onClose={() => setShowImportModal(false)}
          onImport={(params) => importMutation.mutate(params)}
          loading={importMutation.isPending}
        />
      )}

      <SectionCard>
        <SectionHeader
          logo={
            <svg viewBox="0 0 48 48" className="w-6 h-6" fill="none">
              <circle cx="24" cy="24" r="24" fill="#FFE600" />
              <path d="M24 14c-5.5 0-10 4-10 10h4c0-3.3 2.7-6 6-6s6 2.7 6 6h4c0-6-4.5-10-10-10z" fill="#333" />
              <circle cx="19" cy="25" r="2.5" fill="#333" />
              <circle cx="29" cy="25" r="2.5" fill="#333" />
            </svg>
          }
          title="MercadoLibre"
          subtitle="Publicar productos · importar órdenes como ventas · webhooks automáticos"
          connected={connected}
          loading={statusLoading}
        />

        <div className="px-6 py-5 space-y-5">
          {/* Estado conectado */}
          {connected && status && (
            <>
              <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 space-y-0">
                <InfoRow label="Usuario ML" value={status.ml_user_name || status.ml_user_id} />
                <InfoRow label="ID de usuario" value={status.ml_user_id} />
                <InfoRow label="Último sync" value={formatDate(status.last_sync_at)} />
                <InfoRow
                  label="Vencimiento de token"
                  value={
                    status.token_expires_at ? (
                      <span className={
                        new Date(status.token_expires_at) < new Date(Date.now() + 24 * 60 * 60 * 1000)
                          ? 'text-yellow-400'
                          : 'text-slate-300'
                      }>
                        {formatDate(status.token_expires_at)}
                      </span>
                    ) : null
                  }
                />
              </div>

              {status.last_error && <ErrorBox message={`Último error: ${status.last_error}`} />}

              {/* Publicar producto (desde Productos.tsx) */}
              {showSyncForm && initialSyncProductId ? (
                <SyncProductForm
                  initialProductId={initialSyncProductId}
                  onSuccess={() => setShowSyncForm(false)}
                  onCancel={() => setShowSyncForm(false)}
                />
              ) : null}

              {/* Acciones rápidas */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/25 text-yellow-400 text-sm font-medium rounded-xl transition-colors"
                >
                  <ShoppingBag className="w-4 h-4" />
                  Importar órdenes
                </button>
                <button
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ['ml-status'] });
                    refetchProducts();
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/8 border border-white/10 text-slate-300 text-sm font-medium rounded-xl transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Actualizar
                </button>
              </div>

              {/* Tabla de productos sincronizados */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">Productos publicados en ML</h3>

                {productsLoading ? (
                  <div className="flex items-center justify-center py-8 text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Cargando productos...
                  </div>
                ) : !syncedProducts?.length ? (
                  <div className="text-center py-8 text-slate-500 text-sm border border-white/8 rounded-xl">
                    <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No hay productos publicados en MercadoLibre</p>
                    <p className="text-xs mt-1 text-slate-600">
                      Podés publicar productos desde el módulo de Productos
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/8">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-white/8 bg-white/3">
                          <th className="py-2.5 px-4 text-xs font-semibold text-slate-400">Producto</th>
                          <th className="py-2.5 px-4 text-xs font-semibold text-slate-400">ML Item</th>
                          <th className="py-2.5 px-4 text-xs font-semibold text-slate-400 text-right">Precio</th>
                          <th className="py-2.5 px-4 text-xs font-semibold text-slate-400 text-right">Stock</th>
                          <th className="py-2.5 px-4 text-xs font-semibold text-slate-400">Estado</th>
                          <th className="py-2.5 px-4 text-xs font-semibold text-slate-400 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syncedProducts.map((p) => (
                          <MlProductRow
                            key={p.id}
                            product={p}
                            onAction={handleProductAction}
                          />
                        ))}
                      </tbody>
                    </table>

                    {/* Paginación simple */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-white/8">
                      <span className="text-xs text-slate-500">
                        Mostrando {productPage * PAGE_SIZE + 1}–{productPage * PAGE_SIZE + (syncedProducts?.length ?? 0)}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setProductPage((p) => Math.max(0, p - 1))}
                          disabled={productPage === 0}
                          className="px-3 py-1 text-xs bg-white/5 hover:bg-white/8 border border-white/10 text-slate-300 rounded-lg disabled:opacity-40 transition-colors"
                        >
                          Anterior
                        </button>
                        <button
                          onClick={() => setProductPage((p) => p + 1)}
                          disabled={(syncedProducts?.length ?? 0) < PAGE_SIZE}
                          className="px-3 py-1 text-xs bg-white/5 hover:bg-white/8 border border-white/10 text-slate-300 rounded-lg disabled:opacity-40 transition-colors"
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Desconectar */}
              {disconnectConfirm ? (
                <div className="flex items-center gap-3 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
                  <span className="flex-1 text-sm text-red-300">
                    ¿Confirmás que querés desconectar MercadoLibre? Se eliminarán los tokens de acceso.
                  </span>
                  <button
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {disconnectMutation.isPending ? 'Desconectando...' : 'Sí, desconectar'}
                  </button>
                  <button
                    onClick={() => setDisconnectConfirm(false)}
                    className="p-1.5 hover:bg-white/8 rounded-lg text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDisconnectConfirm(true)}
                  className="flex items-center gap-2 text-sm text-slate-400 hover:text-red-400 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Desconectar MercadoLibre
                </button>
              )}
            </>
          )}

          {/* Formulario de conexión */}
          {!connected && (
            <div className="space-y-4">
              <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-4 py-3 text-sm text-yellow-300">
                <p className="font-medium mb-1">¿Cómo conectar MercadoLibre?</p>
                <ol className="list-decimal list-inside space-y-0.5 text-yellow-300/80">
                  <li>Hacé clic en "Conectar con MercadoLibre"</li>
                  <li>Se abrirá una ventana de autorización oficial de ML</li>
                  <li>Iniciá sesión y autorizá el acceso</li>
                  <li>Volvé a esta página — la conexión se completa automáticamente</li>
                </ol>
              </div>

              <button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold text-sm py-2.5 rounded-xl transition-colors"
              >
                {connectMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generando enlace...</>
                ) : (
                  <><ExternalLink className="w-4 h-4" /> Conectar con MercadoLibre</>
                )}
              </button>
            </div>
          )}

          {/* URL del webhook */}
          <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 space-y-1">
            <p className="text-xs text-slate-400 font-medium">URL del webhook ML (configurar en tu app)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-slate-300 font-mono truncate">
                {window.location.origin}/api/integraciones/ml/webhook
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/api/integraciones/ml/webhook`);
                }}
                className="shrink-0 p-1.5 hover:bg-white/8 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </SectionCard>
    </>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Integraciones() {
  const toastApi = useToast();
  const toast = (opts: { type: 'success' | 'error' | 'info' | 'warning'; message: string }) =>
    toastApi[opts.type](opts.message);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [syncProductId, setSyncProductId] = useState<number | null>(() => {
    const raw = searchParams.get('syncProductId');
    return raw ? Number(raw) || null : null;
  });

  // Detectar resultado del callback OAuth de ML y syncProductId
  useEffect(() => {
    const mlResult = searchParams.get('ml');
    const rawSync = searchParams.get('syncProductId');

    if (mlResult === 'connected') {
      toast({ type: 'success', message: 'MercadoLibre conectado correctamente' });
      queryClient.invalidateQueries({ queryKey: ['ml-status'] });
    } else if (mlResult === 'error') {
      const reason = searchParams.get('reason');
      toast({
        type: 'error',
        message: reason
          ? `No se pudo conectar MercadoLibre: ${decodeURIComponent(reason)}`
          : 'Error al conectar MercadoLibre. Intentá de nuevo.',
      });
    }

    if (rawSync) {
      setSyncProductId(Number(rawSync) || null);
    }

    // Limpiar query params
    if (mlResult || rawSync) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, toast, queryClient]);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center shrink-0">
          <Link2 className="w-5 h-5 text-slate-300" />
        </div>
        <div>
          <h1 className="text-white text-xl font-bold leading-none">Integraciones</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Conectá Kaisen con plataformas externas para automatizar cobros, ventas y publicaciones.
          </p>
        </div>
      </div>

      {/* Sección MercadoPago */}
      <MercadoPagoSection />

      {/* Sección MercadoLibre */}
      <MercadoLibreSection initialSyncProductId={syncProductId} />

      {/* Footer informativo */}
      <p className="text-xs text-slate-600 text-center pb-2">
        Las credenciales se almacenan encriptadas en la base de datos del sistema.
        Nunca se comparten con terceros.
      </p>
    </div>
  );
}
