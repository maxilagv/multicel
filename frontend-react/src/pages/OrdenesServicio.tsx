/**
 * Módulo de Órdenes de Servicio / Servicio Técnico
 * ─────────────────────────────────────────────────
 * Gestión completa del ciclo de vida de un trabajo técnico:
 * Recibido → Presupuestado → Aceptado → En proceso → Terminado → Entregado → Facturado
 */

import {
  useEffect, useMemo, useState, type FormEvent,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wrench, Plus, Search, X, ChevronRight, Clock, User, FileText,
  Package, History, CheckCircle2, AlertTriangle, Trash2,
  LayoutGrid, List, RefreshCw, ChevronDown, Paperclip, Eye,
  DollarSign, ArrowRight, BookOpen, Boxes,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { getRoleFromToken } from '../lib/auth';
import { formatARS, formatFecha, formatFechaHora } from '../lib/formatters';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type EstadoOS =
  | 'recibido' | 'presupuestado' | 'aceptado' | 'en_proceso'
  | 'terminado' | 'entregado'    | 'facturado' | 'cancelado';

type TipoTrabajo = {
  id: number; nombre: string; color: string; descripcion?: string;
};

type OrdServRow = {
  id: number; numero_os: string; estado: EstadoOS;
  descripcion_problema: string;
  fecha_recepcion: string; fecha_estimada_entrega: string | null;
  fecha_entrega_real?: string | null;
  total_os: number; total_insumos: number; total_mano_obra: number;
  presupuesto_aprobado: number;
  cliente_id: number;    cliente_nombre: string; cliente_telefono?: string;
  tecnico_id?: number;   tecnico_nombre?: string;
  tipo_trabajo_id?: number; tipo_trabajo_nombre?: string; tipo_trabajo_color?: string;
  updated_at: string;
};

type OrdServDetalle = OrdServRow & {
  observaciones_internas?: string; observaciones_cliente?: string;
  cliente_email?: string; venta_id?: number; created_at: string;
  historial:    HistorialItem[];
  insumos:      InsumoItem[];
  documentos:   DocumentoItem[];
  presupuesto:  PresupuestoItem[];
};

type HistorialItem = {
  id: number; estado_anterior: EstadoOS | null; estado_nuevo: EstadoOS;
  usuario_nombre: string | null; observacion: string | null; created_at: string;
};

type InsumoItem = {
  id: number; producto_id: number; producto_nombre: string; producto_codigo?: string;
  cantidad: number; precio_unitario: number; subtotal: number; notas?: string;
};

type DocumentoItem = {
  id: number; nombre_archivo: string; tipo_mime?: string;
  url_archivo: string; descripcion?: string; created_at: string;
};

type PresupuestoItem = {
  id: number; descripcion: string; cantidad: number;
  precio_unitario: number; subtotal: number; orden: number;
};

type TableroCuenta = { estado: EstadoOS; cantidad: number; monto_total: number };

// ─── Configuración visual de estados ──────────────────────────────────────────

const ESTADO_CFG: Record<EstadoOS, {
  label: string; emoji: string;
  bg: string; text: string; border: string; dot: string;
  descripcion: string;
}> = {
  recibido:      { label: 'Recibido',      emoji: '📥', bg: 'bg-slate-500/20',   text: 'text-slate-300',  border: 'border-slate-500/40',  dot: 'bg-slate-400',   descripcion: 'Trabajo recibido, pendiente de análisis' },
  presupuestado: { label: 'Presupuestado', emoji: '📋', bg: 'bg-amber-500/20',   text: 'text-amber-300',  border: 'border-amber-500/40',  dot: 'bg-amber-400',   descripcion: 'Presupuesto enviado, esperando aprobación del cliente' },
  aceptado:      { label: 'Aceptado',      emoji: '✅', bg: 'bg-blue-500/20',    text: 'text-blue-300',   border: 'border-blue-500/40',   dot: 'bg-blue-400',    descripcion: 'Cliente aprobó el presupuesto, listo para comenzar' },
  en_proceso:    { label: 'En proceso',    emoji: '⚙️', bg: 'bg-indigo-500/20',  text: 'text-indigo-300', border: 'border-indigo-500/40', dot: 'bg-indigo-400',  descripcion: 'El técnico está trabajando en esto' },
  terminado:     { label: 'Terminado',     emoji: '🎯', bg: 'bg-emerald-500/20', text: 'text-emerald-300',border: 'border-emerald-500/40',dot: 'bg-emerald-400', descripcion: 'Trabajo finalizado, pendiente de entrega al cliente' },
  entregado:     { label: 'Entregado',     emoji: '📦', bg: 'bg-teal-500/20',    text: 'text-teal-300',   border: 'border-teal-500/40',   dot: 'bg-teal-400',    descripcion: 'Trabajo entregado al cliente, pendiente de facturar' },
  facturado:     { label: 'Facturado',     emoji: '🧾', bg: 'bg-violet-500/20',  text: 'text-violet-300', border: 'border-violet-500/40', dot: 'bg-violet-400',  descripcion: 'Proceso completo — trabajo facturado' },
  cancelado:     { label: 'Cancelado',     emoji: '❌', bg: 'bg-red-500/20',     text: 'text-red-300',    border: 'border-red-500/40',    dot: 'bg-red-400',     descripcion: 'Trabajo cancelado' },
};

/** Transiciones de estado disponibles desde cada estado */
const SIGUIENTE_ESTADO: Record<EstadoOS, { estado: EstadoOS; label: string; confirmMsg?: string }[]> = {
  recibido:      [
    { estado: 'presupuestado', label: 'Cargar presupuesto' },
    { estado: 'aceptado',      label: 'Aceptar directamente (sin presupuesto)' },
    { estado: 'cancelado',     label: 'Cancelar', confirmMsg: '¿Cancelar esta orden de servicio?' },
  ],
  presupuestado: [
    { estado: 'aceptado',  label: 'Marcar como aceptado por el cliente' },
    { estado: 'recibido',  label: 'Volver a recibido' },
    { estado: 'cancelado', label: 'Cancelar', confirmMsg: '¿Cancelar esta orden?' },
  ],
  aceptado:      [
    { estado: 'en_proceso', label: 'Iniciar trabajo' },
    { estado: 'cancelado',  label: 'Cancelar', confirmMsg: '¿Cancelar esta orden?' },
  ],
  en_proceso:    [
    { estado: 'terminado', label: 'Marcar como terminado' },
    { estado: 'cancelado', label: 'Cancelar', confirmMsg: '¿Cancelar esta orden?' },
  ],
  terminado:     [
    { estado: 'entregado',  label: 'Registrar entrega al cliente — descuenta stock automáticamente' },
    { estado: 'en_proceso', label: 'Volver a en proceso' },
  ],
  entregado:     [
    { estado: 'facturado', label: 'Marcar como facturado' },
  ],
  facturado:     [],
  cancelado:     [],
};

// ─── Componente: Badge de estado ──────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: EstadoOS }) {
  const cfg = ESTADO_CFG[estado] || ESTADO_CFG.recibido;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Componente: Skeleton de carga ────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="animate-pulse flex items-center gap-4 p-4 border-b border-white/5">
      <div className="w-24 h-4 bg-white/10 rounded" />
      <div className="flex-1 h-4 bg-white/10 rounded" />
      <div className="w-20 h-5 bg-white/10 rounded-full" />
      <div className="w-16 h-4 bg-white/10 rounded" />
    </div>
  );
}

// ─── Componente: Modal de detalle / edición ───────────────────────────────────

type TabKey = 'detalle' | 'insumos' | 'presupuesto' | 'documentos' | 'historial';

function ModalDetalle({
  osId, onClose, usuarios, tiposTrabajo,
}: {
  osId: number;
  onClose: () => void;
  usuarios: any[];
  tiposTrabajo: TipoTrabajo[];
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('detalle');
  const [showCambioEstado, setShowCambioEstado] = useState(false);
  const [estadoTarget, setEstadoTarget] = useState<EstadoOS | null>(null);
  const [observacionEstado, setObservacionEstado] = useState('');

  // ── Carga del detalle completo ──
  const { data: os, isLoading, isError } = useQuery<OrdServDetalle>({
    queryKey: ['os-detalle', osId],
    queryFn: () => Api.osDetalle(osId),
    staleTime: 30_000,
  });

  // ── Mutations ──
  const mutCambiarEstado = useMutation({
    mutationFn: ({ estado, observacion }: { estado: EstadoOS; observacion?: string }) =>
      Api.osCambiarEstado(osId, { estado, observacion }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['os-detalle', osId] });
      qc.invalidateQueries({ queryKey: ['os-list'] });
      qc.invalidateQueries({ queryKey: ['os-tablero'] });
      toast.success(`Estado cambiado a "${ESTADO_CFG[vars.estado]?.label}"`);
      setShowCambioEstado(false);
      setEstadoTarget(null);
      setObservacionEstado('');
    },
    onError: (err: any) => toast.error(err.message || 'Error al cambiar el estado'),
  });

  const mutRemoveInsumo = useMutation({
    mutationFn: (insumoId: number) => Api.osRemoveInsumo(osId, insumoId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-detalle', osId] });
      toast.success('Insumo eliminado');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const mutRemoveDoc = useMutation({
    mutationFn: (docId: number) => Api.osRemoveDocumento(osId, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-detalle', osId] });
      toast.success('Documento eliminado');
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="app-card w-full max-w-3xl p-10 flex justify-center">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (isError || !os) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="app-card w-full max-w-3xl p-10 text-center">
          <p className="text-red-400 mb-4">No se pudo cargar la orden de servicio</p>
          <button onClick={onClose} className="btn-secondary">Cerrar</button>
        </div>
      </div>
    );
  }

  const cfg = ESTADO_CFG[os.estado];
  const siguientes = SIGUIENTE_ESTADO[os.estado] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="app-card w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* ── Cabecera del modal ── */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-white/10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-lg font-bold text-white font-mono">{os.numero_os}</span>
              <EstadoBadge estado={os.estado} />
            </div>
            <p className="text-sm text-slate-400 mt-1 truncate">{os.cliente_nombre}</p>
          </div>

          {/* Botones de avance de estado */}
          {siguientes.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {siguientes.slice(0, 2).map((sig) => (
                <button
                  key={sig.estado}
                  onClick={() => {
                    if (sig.confirmMsg) {
                      if (!window.confirm(sig.confirmMsg)) return;
                      mutCambiarEstado.mutate({ estado: sig.estado });
                    } else {
                      setEstadoTarget(sig.estado);
                      setShowCambioEstado(true);
                    }
                  }}
                  disabled={mutCambiarEstado.isPending}
                  className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                    border transition-all
                    ${sig.estado === 'cancelado'
                      ? 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                      : 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20'
                    }`}
                >
                  <ArrowRight className="w-3 h-3" />
                  {sig.label}
                </button>
              ))}
            </div>
          )}

          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Botones móviles de avance ── */}
        {siguientes.length > 0 && (
          <div className="sm:hidden flex gap-2 px-5 py-3 border-b border-white/5 overflow-x-auto">
            {siguientes.map((sig) => (
              <button
                key={sig.estado}
                onClick={() => {
                  if (sig.confirmMsg) {
                    if (!window.confirm(sig.confirmMsg)) return;
                    mutCambiarEstado.mutate({ estado: sig.estado });
                  } else {
                    setEstadoTarget(sig.estado);
                    setShowCambioEstado(true);
                  }
                }}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
                  ${sig.estado === 'cancelado'
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                  }`}
              >
                <ArrowRight className="w-3 h-3" />
                {sig.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Dialog de cambio de estado con observación ── */}
        <AnimatePresence>
          {showCambioEstado && estadoTarget && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mx-5 mt-4 p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10"
            >
              <p className="text-sm font-semibold text-indigo-300 mb-2">
                Cambiar a: {ESTADO_CFG[estadoTarget]?.emoji} {ESTADO_CFG[estadoTarget]?.label}
              </p>
              {estadoTarget === 'entregado' && (
                <p className="text-xs text-amber-300 mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Los insumos cargados se descontarán automáticamente del stock al confirmar.
                </p>
              )}
              <textarea
                placeholder="Observación (opcional)..."
                value={observacionEstado}
                onChange={(e) => setObservacionEstado(e.target.value)}
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:border-indigo-500/50 mb-3"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => mutCambiarEstado.mutate({ estado: estadoTarget, observacion: observacionEstado || undefined })}
                  disabled={mutCambiarEstado.isPending}
                  className="btn-primary text-sm px-4 py-1.5 flex items-center gap-1.5"
                >
                  {mutCambiarEstado.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Confirmar
                </button>
                <button onClick={() => { setShowCambioEstado(false); setEstadoTarget(null); }} className="btn-secondary text-sm px-4 py-1.5">
                  Cancelar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Tabs de navegación ── */}
        <div className="flex gap-1 px-5 pt-4 border-b border-white/10 overflow-x-auto flex-shrink-0">
          {([
            { key: 'detalle',     label: 'Detalle',     icon: FileText    },
            { key: 'insumos',     label: 'Insumos',     icon: Package,    badge: os.insumos.length    },
            { key: 'presupuesto', label: 'Presupuesto', icon: DollarSign, badge: os.presupuesto.length },
            { key: 'documentos',  label: 'Documentos',  icon: Paperclip,  badge: os.documentos.length },
            { key: 'historial',   label: 'Historial',   icon: History,    badge: os.historial.length  },
          ] as { key: TabKey; label: string; icon: any; badge?: number }[]).map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-all whitespace-nowrap flex-shrink-0
                ${tab === key
                  ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {badge !== undefined && badge > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/10 text-xs font-semibold text-slate-300">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Contenido del tab ── */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'detalle' && <TabDetalle os={os} tiposTrabajo={tiposTrabajo} usuarios={usuarios} osId={osId} />}
          {tab === 'insumos' && <TabInsumos os={os} osId={osId} onRemove={(id) => mutRemoveInsumo.mutate(id)} />}
          {tab === 'presupuesto' && <TabPresupuesto os={os} osId={osId} />}
          {tab === 'documentos' && <TabDocumentos os={os} osId={osId} onRemove={(id) => mutRemoveDoc.mutate(id)} />}
          {tab === 'historial' && <TabHistorial historial={os.historial} />}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Tab: Detalle general ──────────────────────────────────────────────────────

function TabDetalle({ os, tiposTrabajo, usuarios, osId }: {
  os: OrdServDetalle; tiposTrabajo: TipoTrabajo[]; usuarios: any[]; osId: number;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    descripcion_problema:   os.descripcion_problema   || '',
    observaciones_internas: os.observaciones_internas || '',
    observaciones_cliente:  os.observaciones_cliente  || '',
    tecnico_id:             os.tecnico_id             || '',
    fecha_estimada_entrega: os.fecha_estimada_entrega || '',
    tipo_trabajo_id:        os.tipo_trabajo_id        || '',
  });

  const mutUpdate = useMutation({
    mutationFn: (body: any) => Api.osUpdate(osId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-detalle', osId] });
      qc.invalidateQueries({ queryKey: ['os-list'] });
      toast.success('Orden actualizada');
      setEditing(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    mutUpdate.mutate({
      descripcion_problema:   form.descripcion_problema,
      observaciones_internas: form.observaciones_internas || null,
      observaciones_cliente:  form.observaciones_cliente  || null,
      tecnico_id:             form.tecnico_id  ? Number(form.tecnico_id)  : null,
      tipo_trabajo_id:        form.tipo_trabajo_id ? Number(form.tipo_trabajo_id) : null,
      fecha_estimada_entrega: form.fecha_estimada_entrega || null,
    });
  };

  return (
    <div className="space-y-5">
      {/* Resumen de totales */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Mano de obra',  value: os.total_mano_obra, color: 'text-blue-300' },
          { label: 'Insumos',       value: os.total_insumos,   color: 'text-amber-300' },
          { label: 'Total OS',      value: os.total_os,        color: 'text-emerald-300' },
        ].map((m) => (
          <div key={m.label} className="app-card p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">{m.label}</p>
            <p className={`text-base font-bold ${m.color}`}>{formatARS(m.value)}</p>
          </div>
        ))}
      </div>

      {/* Formulario de edición */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-300">Datos del trabajo</h3>
          {!editing ? (
            <button type="button" onClick={() => setEditing(true)} className="btn-secondary text-xs px-3 py-1">
              Editar
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="submit" disabled={mutUpdate.isPending} className="btn-primary text-xs px-3 py-1">
                {mutUpdate.isPending ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-xs px-3 py-1">
                Cancelar
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Cliente</label>
            <p className="text-sm text-white font-medium">{os.cliente_nombre}</p>
            {os.cliente_telefono && <p className="text-xs text-slate-500">{os.cliente_telefono}</p>}
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Tipo de trabajo</label>
            {editing ? (
              <select
                value={form.tipo_trabajo_id}
                onChange={(e) => setForm((f) => ({ ...f, tipo_trabajo_id: e.target.value }))}
                className="input-field text-sm w-full"
              >
                <option value="">Sin tipo</option>
                {tiposTrabajo.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-white">{os.tipo_trabajo_nombre || '—'}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Técnico asignado</label>
            {editing ? (
              <select
                value={form.tecnico_id}
                onChange={(e) => setForm((f) => ({ ...f, tecnico_id: e.target.value }))}
                className="input-field text-sm w-full"
              >
                <option value="">Sin asignar</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-white">{os.tecnico_nombre || '— Sin asignar'}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Fecha estimada de entrega</label>
            {editing ? (
              <input
                type="date"
                value={form.fecha_estimada_entrega}
                onChange={(e) => setForm((f) => ({ ...f, fecha_estimada_entrega: e.target.value }))}
                className="input-field text-sm w-full"
              />
            ) : (
              <p className="text-sm text-white">
                {os.fecha_estimada_entrega ? formatFecha(os.fecha_estimada_entrega) : '— Sin fecha estimada'}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Descripción del problema <span className="text-red-400">*</span></label>
          {editing ? (
            <textarea
              value={form.descripcion_problema}
              onChange={(e) => setForm((f) => ({ ...f, descripcion_problema: e.target.value }))}
              rows={3}
              className="input-field text-sm w-full resize-none"
              required
            />
          ) : (
            <p className="text-sm text-white whitespace-pre-wrap">{os.descripcion_problema}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Observaciones internas
              <span className="ml-1 text-xs text-slate-600">(no se muestra al cliente)</span>
            </label>
            {editing ? (
              <textarea
                value={form.observaciones_internas}
                onChange={(e) => setForm((f) => ({ ...f, observaciones_internas: e.target.value }))}
                rows={2}
                placeholder="Notas para el equipo..."
                className="input-field text-sm w-full resize-none"
              />
            ) : (
              <p className="text-sm text-slate-300">{os.observaciones_internas || '—'}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Observaciones para el cliente
            </label>
            {editing ? (
              <textarea
                value={form.observaciones_cliente}
                onChange={(e) => setForm((f) => ({ ...f, observaciones_cliente: e.target.value }))}
                rows={2}
                placeholder="Mensaje para incluir al cliente..."
                className="input-field text-sm w-full resize-none"
              />
            ) : (
              <p className="text-sm text-slate-300">{os.observaciones_cliente || '—'}</p>
            )}
          </div>
        </div>
      </form>

      {/* Fechas */}
      <div className="flex gap-4 text-xs text-slate-500 pt-2 border-t border-white/5">
        <span>Recibida: {formatFechaHora(os.fecha_recepcion)}</span>
        {os.fecha_entrega_real && <span>Entregada: {formatFechaHora(os.fecha_entrega_real)}</span>}
        <span className="ml-auto">Última actualización: {formatFechaHora(os.updated_at)}</span>
      </div>
    </div>
  );
}

// ─── Tab: Insumos ─────────────────────────────────────────────────────────────

function TabInsumos({ os, osId, onRemove }: { os: OrdServDetalle; osId: number; onRemove: (id: number) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ producto_id: '', cantidad: '1', precio_unitario: '0', notas: '' });
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [soloRepuestos, setSoloRepuestos] = useState(true);
  const esCambio = useMemo(
    () => String(os.tipo_trabajo_nombre || '').trim().toLowerCase().includes('cambio'),
    [os.tipo_trabajo_nombre]
  );

  useEffect(() => {
    if (esCambio) setSoloRepuestos(false);
  }, [esCambio]);

  const { data: productosData } = useQuery({
    queryKey: ['productos', 'search', busquedaProducto, soloRepuestos],
    queryFn:  () => Api.productos({ q: busquedaProducto, limit: 20, ...(soloRepuestos ? { tipo: 'insumo' } : {}) }),
    enabled:  busquedaProducto.length >= 2,
    staleTime: 60_000,
  });

  const mutAdd = useMutation({
    mutationFn: (body: any) => Api.osAddInsumo(osId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-detalle', osId] });
      toast.success('Insumo agregado');
      setForm({ producto_id: '', cantidad: '1', precio_unitario: '0', notas: '' });
      setBusquedaProducto('');
      setShowForm(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!form.producto_id) { toast.error('Seleccioná un producto'); return; }
    mutAdd.mutate({
      producto_id:     Number(form.producto_id),
      cantidad:        Number(form.cantidad),
      precio_unitario: Number(form.precio_unitario),
      notas:           form.notas || undefined,
    });
  };

  const productos = Array.isArray(productosData) ? productosData : ((productosData as any)?.data || []);
  const bloqueado = ['facturado', 'cancelado', 'entregado'].includes(os.estado);

  return (
    <div className="space-y-4">
      {/* Tabla de insumos */}
      {os.insumos.length === 0 ? (
        <div className="text-center py-10 text-slate-500">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay insumos cargados</p>
          {!bloqueado && (
            <p className="text-xs mt-1">
              {esCambio
                ? 'Agrega el producto de cambio o el repuesto usado para descontarlo al entregar.'
                : 'Agregá los materiales y repuestos utilizados'}
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-white/5">
                <th className="pb-2 font-medium">Producto</th>
                <th className="pb-2 font-medium text-right">Cantidad</th>
                <th className="pb-2 font-medium text-right">Precio unit.</th>
                <th className="pb-2 font-medium text-right">Subtotal</th>
                {!bloqueado && <th className="pb-2 w-8" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {os.insumos.map((ins) => (
                <tr key={ins.id}>
                  <td className="py-2">
                    <p className="text-white font-medium">{ins.producto_nombre}</p>
                    {ins.notas && <p className="text-xs text-slate-500">{ins.notas}</p>}
                  </td>
                  <td className="py-2 text-right text-slate-300">{ins.cantidad}</td>
                  <td className="py-2 text-right text-slate-300">{formatARS(ins.precio_unitario)}</td>
                  <td className="py-2 text-right text-white font-semibold">{formatARS(ins.subtotal)}</td>
                  {!bloqueado && (
                    <td className="py-2 text-right">
                      <button
                        onClick={() => { if (window.confirm('¿Eliminar este insumo?')) onRemove(ins.id); }}
                        className="text-red-400 hover:text-red-300 transition-colors p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10">
                <td colSpan={bloqueado ? 3 : 4} className="pt-3 text-right text-sm text-slate-400">Total insumos:</td>
                <td className="pt-3 text-right font-bold text-emerald-300">{formatARS(os.total_insumos)}</td>
                {!bloqueado && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Formulario para agregar insumo */}
      {!bloqueado && (
        <>
          {esCambio && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
              Flujo de cambio: carga el producto o repuesto reemplazado. Al entregar la orden se descuenta del stock automaticamente.
            </div>
          )}
          {!showForm ? (
            <button onClick={() => setShowForm(true)} className="btn-secondary text-sm flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> {esCambio ? 'Agregar producto de cambio' : 'Agregar insumo o material'}
            </button>
          ) : (
            <form onSubmit={handleAdd} className="p-4 rounded-xl border border-white/10 bg-white/3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-300">
                  {esCambio ? 'Nuevo producto de cambio' : 'Nuevo insumo / repuesto'}
                </p>
                <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={soloRepuestos}
                    onChange={(e) => { setSoloRepuestos(e.target.checked); setForm((f) => ({ ...f, producto_id: '' })); setBusquedaProducto(''); }}
                    className="accent-indigo-500 w-3.5 h-3.5"
                  />
                  Solo repuestos/insumos
                </label>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  {soloRepuestos ? 'Buscar repuesto' : esCambio ? 'Buscar producto de cambio' : 'Buscar cualquier producto'} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder={soloRepuestos ? 'Nombre del repuesto...' : esCambio ? 'Nombre o codigo del producto...' : 'Nombre del producto...'}
                  value={busquedaProducto}
                  onChange={(e) => { setBusquedaProducto(e.target.value); setForm((f) => ({ ...f, producto_id: '' })); }}
                  className="input-field text-sm w-full"
                />
                {esCambio && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Puedes buscar por parte del nombre o por codigo. El descuento de stock se hace cuando la orden se marca como entregada.
                  </p>
                )}
                {busquedaProducto.length >= 2 && !form.producto_id && (
                  productos.length > 0 ? (
                    <div className="mt-1 border border-white/10 rounded-lg bg-slate-900 divide-y divide-white/5 max-h-36 overflow-y-auto">
                      {productos.map((p: any) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, producto_id: String(p.id), precio_unitario: String(p.costo_pesos || p.price || 0) }));
                            setBusquedaProducto(p.name);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 flex justify-between items-center"
                        >
                          <span>{p.name}</span>
                          <span className="text-slate-400 text-xs">{formatARS(p.costo_pesos || p.price)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-xs text-slate-500">
                      No se encontraron repuestos con ese nombre.{' '}
                      {soloRepuestos && (
                        <button type="button" onClick={() => setSoloRepuestos(false)} className="text-indigo-400 hover:underline">
                          Buscar en todos los productos
                        </button>
                      )}
                    </p>
                  )
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Cantidad</label>
                  <input type="number" min="0.01" step="0.01" value={form.cantidad}
                    onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))}
                    className="input-field text-sm w-full" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Precio unitario</label>
                  <input type="number" min="0" step="0.01" value={form.precio_unitario}
                    onChange={(e) => setForm((f) => ({ ...f, precio_unitario: e.target.value }))}
                    className="input-field text-sm w-full" />
                </div>
              </div>
              <input type="text" placeholder="Notas (opcional)" value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                className="input-field text-sm w-full" />
              <div className="flex gap-2">
                <button type="submit" disabled={mutAdd.isPending} className="btn-primary text-sm px-4 py-1.5">
                  {mutAdd.isPending ? 'Guardando...' : 'Agregar'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm px-4 py-1.5">
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {bloqueado && (
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          No se pueden modificar los insumos en estado "{ESTADO_CFG[os.estado]?.label}".
        </p>
      )}
    </div>
  );
}

// ─── Tab: Presupuesto ─────────────────────────────────────────────────────────

function TabPresupuesto({ os, osId }: { os: OrdServDetalle; osId: number }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState(
    os.presupuesto.map((p) => ({
      descripcion: p.descripcion, cantidad: String(p.cantidad), precio_unitario: String(p.precio_unitario),
    }))
  );

  const totalPres = items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0);

  const mutSave = useMutation({
    mutationFn: (its: any[]) => Api.osSetPresupuesto(osId, its),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-detalle', osId] });
      toast.success('Presupuesto guardado');
      setEditing(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addItem = () => setItems((s) => [...s, { descripcion: '', cantidad: '1', precio_unitario: '0' }]);
  const removeItem = (i: number) => setItems((s) => s.filter((_, idx) => idx !== i));
  const updateItem = (i: number, key: string, val: string) =>
    setItems((s) => s.map((row, idx) => idx === i ? { ...row, [key]: val } : row));

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    mutSave.mutate(items.map((i) => ({
      descripcion:     i.descripcion,
      cantidad:        Number(i.cantidad) || 1,
      precio_unitario: Number(i.precio_unitario) || 0,
    })));
  };

  const bloqueado = ['facturado', 'cancelado'].includes(os.estado);

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Ítems del presupuesto</h3>
        {!bloqueado && (
          !editing
            ? <button type="button" onClick={() => setEditing(true)} className="btn-secondary text-xs px-3 py-1">Editar presupuesto</button>
            : <div className="flex gap-2">
                <button type="submit" disabled={mutSave.isPending} className="btn-primary text-xs px-3 py-1">
                  {mutSave.isPending ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-xs px-3 py-1">Cancelar</button>
              </div>
        )}
      </div>

      {items.length === 0 && !editing ? (
        <div className="text-center py-10 text-slate-500">
          <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay presupuesto cargado</p>
          {!bloqueado && <p className="text-xs mt-1">Agregá los conceptos de mano de obra para el cliente</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <div className="flex-1">
                {editing ? (
                  <input type="text" placeholder="Descripción del ítem"
                    value={item.descripcion} onChange={(e) => updateItem(idx, 'descripcion', e.target.value)}
                    className="input-field text-sm w-full" required />
                ) : (
                  <p className="text-sm text-white py-2">{item.descripcion}</p>
                )}
              </div>
              <div className="w-20">
                {editing ? (
                  <input type="number" min="0.01" step="0.01" placeholder="Cant."
                    value={item.cantidad} onChange={(e) => updateItem(idx, 'cantidad', e.target.value)}
                    className="input-field text-sm w-full text-right" />
                ) : (
                  <p className="text-sm text-slate-300 py-2 text-right">{item.cantidad}</p>
                )}
              </div>
              <div className="w-28">
                {editing ? (
                  <input type="number" min="0" step="0.01" placeholder="Precio"
                    value={item.precio_unitario} onChange={(e) => updateItem(idx, 'precio_unitario', e.target.value)}
                    className="input-field text-sm w-full text-right" />
                ) : (
                  <p className="text-sm text-slate-300 py-2 text-right">{formatARS(Number(item.precio_unitario))}</p>
                )}
              </div>
              <div className="w-28 text-right">
                <p className={`text-sm font-semibold py-2 ${editing ? '' : ''} text-white`}>
                  {formatARS((Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0))}
                </p>
              </div>
              {editing && (
                <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 p-2">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          {editing && (
            <button type="button" onClick={addItem} className="btn-secondary text-sm flex items-center gap-1.5 mt-2">
              <Plus className="w-4 h-4" /> Agregar ítem
            </button>
          )}

          <div className="flex justify-end pt-3 border-t border-white/10">
            <p className="text-sm">
              <span className="text-slate-400 mr-3">Total presupuesto:</span>
              <span className="text-lg font-bold text-emerald-300">{formatARS(totalPres)}</span>
            </p>
          </div>
        </div>
      )}
    </form>
  );
}

// ─── Tab: Documentos ──────────────────────────────────────────────────────────

function TabDocumentos({ os, osId, onRemove }: { os: OrdServDetalle; osId: number; onRemove: (id: number) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre_archivo: '', url_archivo: '', descripcion: '' });

  const mutAdd = useMutation({
    mutationFn: (body: any) => Api.osAddDocumento(osId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-detalle', osId] });
      toast.success('Documento adjuntado');
      setForm({ nombre_archivo: '', url_archivo: '', descripcion: '' });
      setShowForm(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    mutAdd.mutate(form);
  };

  const iconForMime = (mime?: string) => {
    if (!mime) return '📄';
    if (mime.includes('pdf')) return '📕';
    if (mime.includes('word') || mime.includes('document')) return '📘';
    if (mime.includes('image')) return '🖼️';
    if (mime.includes('sheet') || mime.includes('excel')) return '📗';
    return '📄';
  };

  return (
    <div className="space-y-4">
      {os.documentos.length === 0 ? (
        <div className="text-center py-10 text-slate-500">
          <Paperclip className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay documentos adjuntos</p>
          <p className="text-xs mt-1">Podés adjuntar PDFs, imágenes, presupuestos externos, etc.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {os.documentos.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/3 border border-white/5 hover:border-white/10 transition-colors">
              <span className="text-xl">{iconForMime(doc.tipo_mime)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{doc.nombre_archivo}</p>
                {doc.descripcion && <p className="text-xs text-slate-500 truncate">{doc.descripcion}</p>}
                <p className="text-xs text-slate-600">{formatFechaHora(doc.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <a href={doc.url_archivo} target="_blank" rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 transition-colors p-1" title="Ver documento">
                  <Eye className="w-4 h-4" />
                </a>
                <button onClick={() => { if (window.confirm('¿Eliminar este documento?')) onRemove(doc.id); }}
                  className="text-red-400 hover:text-red-300 transition-colors p-1" title="Eliminar">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="btn-secondary text-sm flex items-center gap-1.5">
          <Paperclip className="w-4 h-4" /> Adjuntar documento
        </button>
      ) : (
        <form onSubmit={handleAdd} className="p-4 rounded-xl border border-white/10 bg-white/3 space-y-3">
          <p className="text-sm font-semibold text-slate-300">Adjuntar documento</p>
          <p className="text-xs text-slate-500">Pegá la URL del documento (subilo a Cloudinary, Drive o cualquier storage externo)</p>
          <input type="text" placeholder="Nombre del archivo, ej: Presupuesto-proveedor.pdf" value={form.nombre_archivo}
            onChange={(e) => setForm((f) => ({ ...f, nombre_archivo: e.target.value }))}
            className="input-field text-sm w-full" required />
          <input type="url" placeholder="URL del documento (https://...)" value={form.url_archivo}
            onChange={(e) => setForm((f) => ({ ...f, url_archivo: e.target.value }))}
            className="input-field text-sm w-full" required />
          <input type="text" placeholder="Descripción (opcional)" value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            className="input-field text-sm w-full" />
          <div className="flex gap-2">
            <button type="submit" disabled={mutAdd.isPending} className="btn-primary text-sm px-4 py-1.5">
              {mutAdd.isPending ? 'Guardando...' : 'Adjuntar'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm px-4 py-1.5">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Tab: Historial de estados ────────────────────────────────────────────────

function TabHistorial({ historial }: { historial: HistorialItem[] }) {
  if (historial.length === 0) {
    return <div className="text-center py-10 text-slate-500 text-sm">Sin historial</div>;
  }
  return (
    <div className="relative">
      {/* Línea vertical del timeline */}
      <div className="absolute left-3.5 top-4 bottom-4 w-px bg-white/10" />
      <div className="space-y-4">
        {historial.map((h, idx) => {
          const cfg = ESTADO_CFG[h.estado_nuevo] || ESTADO_CFG.recibido;
          return (
            <div key={h.id} className="flex gap-4 items-start">
              {/* Dot */}
              <div className={`relative z-10 w-7 h-7 rounded-full border-2 border-slate-800 flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
              </div>
              <div className="flex-1 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.emoji} {cfg.label}</span>
                  {h.estado_anterior && (
                    <span className="text-xs text-slate-600">desde {ESTADO_CFG[h.estado_anterior]?.label}</span>
                  )}
                </div>
                {h.observacion && (
                  <p className="text-xs text-slate-400 mt-1">{h.observacion}</p>
                )}
                <div className="flex gap-3 mt-1 text-xs text-slate-600">
                  {h.usuario_nombre && <span>👤 {h.usuario_nombre}</span>}
                  <span>🕐 {formatFechaHora(h.created_at)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Modal: Nueva Orden de Servicio ───────────────────────────────────────────

function ModalNuevaOS({
  onClose, tiposTrabajo, usuarios,
}: {
  onClose: (created?: boolean) => void;
  tiposTrabajo: TipoTrabajo[];
  usuarios: any[];
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    cliente_id:              '',
    tipo_trabajo_id:         '',
    descripcion_problema:    '',
    observaciones_internas:  '',
    tecnico_id:              '',
    fecha_estimada_entrega:  '',
  });
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState<{id:number;nombre:string} | null>(null);

  const { data: clientesData } = useQuery({
    queryKey: ['clientes-search', busquedaCliente],
    queryFn:  () => Api.clientes({ q: busquedaCliente, limit: 10 }),
    enabled:  busquedaCliente.length >= 2,
    staleTime: 30_000,
  });

  const mutCreate = useMutation({
    mutationFn: (body: any) => Api.osCreate(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-list'] });
      qc.invalidateQueries({ queryKey: ['os-tablero'] });
      toast.success('¡Orden de servicio creada correctamente!');
      onClose(true);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.cliente_id) { toast.error('Seleccioná un cliente'); return; }
    if (!form.descripcion_problema.trim()) { toast.error('La descripción del problema es obligatoria'); return; }
    mutCreate.mutate({
      cliente_id:             Number(form.cliente_id),
      tipo_trabajo_id:        form.tipo_trabajo_id ? Number(form.tipo_trabajo_id) : undefined,
      descripcion_problema:   form.descripcion_problema,
      observaciones_internas: form.observaciones_internas || undefined,
      tecnico_id:             form.tecnico_id ? Number(form.tecnico_id) : undefined,
      fecha_estimada_entrega: form.fecha_estimada_entrega || undefined,
    });
  };

  const clientes = Array.isArray(clientesData) ? clientesData : ((clientesData as any)?.clients || []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="app-card w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-indigo-400" />
              Nueva Orden de Servicio
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Completá los datos para registrar el trabajo</p>
          </div>
          <button onClick={() => onClose()} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Cliente */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Cliente <span className="text-red-400">*</span>
            </label>
            {clienteSeleccionado ? (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-medium text-white">{clienteSeleccionado.nombre}</span>
                </div>
                <button type="button" onClick={() => { setClienteSeleccionado(null); setForm((f) => ({ ...f, cliente_id: '' })); setBusquedaCliente(''); }}
                  className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  placeholder="Escribí el nombre del cliente para buscar..."
                  value={busquedaCliente}
                  onChange={(e) => setBusquedaCliente(e.target.value)}
                  className="input-field text-sm w-full"
                  autoFocus
                />
                {clientes.length > 0 && (
                  <div className="mt-1 border border-white/10 rounded-lg bg-slate-900 divide-y divide-white/5 max-h-40 overflow-y-auto">
                    {clientes.map((c: any) => (
                      <button key={c.id} type="button"
                        onClick={() => { setClienteSeleccionado({ id: c.id, nombre: c.nombre }); setForm((f) => ({ ...f, cliente_id: String(c.id) })); }}
                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5">
                        {c.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tipo de trabajo */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Tipo de trabajo</label>
            <select value={form.tipo_trabajo_id}
              onChange={(e) => setForm((f) => ({ ...f, tipo_trabajo_id: e.target.value }))}
              className="input-field text-sm w-full">
              <option value="">Seleccionar tipo...</option>
              {tiposTrabajo.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </div>

          {/* Descripción del problema — el más importante */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Descripción del problema <span className="text-red-400">*</span>
            </label>
            <textarea
              placeholder="¿Qué trajo el cliente? ¿Cuál es el problema o trabajo a realizar?"
              value={form.descripcion_problema}
              onChange={(e) => setForm((f) => ({ ...f, descripcion_problema: e.target.value }))}
              rows={3}
              className="input-field text-sm w-full resize-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Técnico */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Técnico asignado</label>
              <select value={form.tecnico_id}
                onChange={(e) => setForm((f) => ({ ...f, tecnico_id: e.target.value }))}
                className="input-field text-sm w-full">
                <option value="">Sin asignar</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>

            {/* Fecha estimada */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Fecha estimada de entrega</label>
              <input type="date" value={form.fecha_estimada_entrega}
                onChange={(e) => setForm((f) => ({ ...f, fecha_estimada_entrega: e.target.value }))}
                className="input-field text-sm w-full" />
            </div>
          </div>

          {/* Obs. internas */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Observaciones internas
              <span className="ml-1 text-xs text-slate-600">(no visible para el cliente)</span>
            </label>
            <textarea
              placeholder="Notas para el equipo técnico..."
              value={form.observaciones_internas}
              onChange={(e) => setForm((f) => ({ ...f, observaciones_internas: e.target.value }))}
              rows={2}
              className="input-field text-sm w-full resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={mutCreate.isPending}
              className="btn-primary flex-1 flex items-center justify-center gap-2 py-2.5">
              {mutCreate.isPending
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creando...</>
                : <><Plus className="w-4 h-4" /> Crear orden de servicio</>
              }
            </button>
            <button type="button" onClick={() => onClose()} className="btn-secondary px-4">
              Cancelar
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Tab: Repuestos ───────────────────────────────────────────────────────────

type RepuestoRow = {
  id: number; nombre: string; codigo: string; descripcion?: string;
  category_id: number; category_name: string; costo_pesos: number;
  stock_quantity: number;
};

function TabRepuestos() {
  const toast = useToast();
  const qc    = useQueryClient();
  const [q, setQ]          = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]    = useState<number | null>(null);

  const FORM_EMPTY = { nombre: '', codigo: '', descripcion: '', categoria_id: '', precio_costo_pesos: '' };
  const [form, setForm] = useState(FORM_EMPTY);

  const { data: repuestos = [], isLoading } = useQuery<RepuestoRow[]>({
    queryKey: ['os-repuestos', q],
    queryFn:  () => Api.productos({ tipo: 'insumo', q: q || undefined, all: true }),
    staleTime: 30_000,
  });

  const { data: categorias = [] } = useQuery<{ id: number; nombre: string; path?: string }[]>({
    queryKey: ['categorias-flat'],
    queryFn:  () => Api.categorias(),
    staleTime: 120_000,
  });

  const mutCrear = useMutation({
    mutationFn: (body: any) => Api.crearProducto(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-repuestos'] });
      toast.success('Repuesto creado');
      setShowForm(false);
      setForm(FORM_EMPTY);
    },
    onError: (e: any) => toast.error(e.message || 'Error al crear'),
  });

  const mutEditar = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => Api.actualizarProducto(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-repuestos'] });
      toast.success('Repuesto actualizado');
      setEditId(null);
      setForm(FORM_EMPTY);
      setShowForm(false);
    },
    onError: (e: any) => toast.error(e.message || 'Error al actualizar'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!form.categoria_id)  { toast.error('Seleccioná una categoría'); return; }
    const body = {
      name:               form.nombre.trim(),
      description:        form.descripcion.trim() || undefined,
      codigo:             form.codigo.trim() || undefined,
      category_id:        Number(form.categoria_id),
      precio_costo_pesos: Number(form.precio_costo_pesos) || 0,
      price:              0,
      tipo_producto:      'insumo',
    };
    if (editId != null) mutEditar.mutate({ id: editId, body });
    else mutCrear.mutate(body);
  }

  function startEdit(r: RepuestoRow) {
    setEditId(r.id);
    setForm({
      nombre:             r.nombre,
      codigo:             r.codigo,
      descripcion:        r.descripcion || '',
      categoria_id:       String(r.category_id),
      precio_costo_pesos: String(r.costo_pesos || 0),
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
    setForm(FORM_EMPTY);
  }

  const isPending = mutCrear.isPending || mutEditar.isPending;

  return (
    <div className="space-y-4">

      {/* Barra de herramientas */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar repuesto..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="input-field pl-9 text-sm w-full"
          />
        </div>
        <button
          onClick={() => { cancelForm(); setShowForm((v) => !v); }}
          className="btn-primary flex items-center gap-1.5 text-sm"
        >
          <Plus className="w-4 h-4" />
          Nuevo repuesto
        </button>
      </div>

      {/* Formulario */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleSubmit} className="app-card p-5 space-y-4 border-indigo-500/20 bg-indigo-500/5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-indigo-300">
                  {editId != null ? 'Editar repuesto' : 'Nuevo repuesto / material de servicio'}
                </p>
                <button type="button" onClick={cancelForm} className="text-slate-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Nombre <span className="text-red-400">*</span></label>
                  <input type="text" className="input-field text-sm w-full"
                    placeholder="Ej: Pantalla iPhone 13, Pasta térmica..."
                    value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Código / SKU <span className="text-slate-600">(opcional)</span></label>
                  <input type="text" className="input-field text-sm w-full"
                    placeholder="Se genera automáticamente si no indicás"
                    value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Categoría <span className="text-red-400">*</span></label>
                  <select className="input-field text-sm w-full" value={form.categoria_id}
                    onChange={(e) => setForm((f) => ({ ...f, categoria_id: e.target.value }))}>
                    <option value="">Seleccionar categoría...</option>
                    {categorias.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.path || c.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Costo unitario (ARS)</label>
                  <input type="number" min="0" step="0.01" className="input-field text-sm w-full"
                    placeholder="0.00" value={form.precio_costo_pesos}
                    onChange={(e) => setForm((f) => ({ ...f, precio_costo_pesos: e.target.value }))} />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs text-slate-400">Descripción</label>
                  <input type="text" className="input-field text-sm w-full"
                    placeholder="Descripción opcional..."
                    value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={cancelForm} className="btn-secondary text-sm">Cancelar</button>
                <button type="submit" disabled={isPending} className="btn-primary text-sm flex items-center gap-1.5">
                  {isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {editId != null ? 'Guardar cambios' : 'Crear repuesto'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabla */}
      <div className="app-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : repuestos.length === 0 ? (
          <div className="p-12 text-center">
            <Boxes className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              {q ? 'No se encontraron repuestos con ese término.' : 'No hay repuestos cargados aún.'}
            </p>
            {!q && (
              <p className="text-xs text-slate-600 mt-1">
                Los repuestos y materiales que cargues acá estarán disponibles al agregar insumos en cada orden de servicio.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 border-b border-white/10">
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Repuesto / Material</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-right">Costo unitario</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {repuestos.map((r) => (
                  <tr key={r.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-slate-100 font-medium">{r.nombre}</p>
                      <p className="text-xs text-slate-500 font-mono">{r.codigo}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{r.category_name}</td>
                    <td className="px-4 py-3 text-right font-data text-slate-300">
                      {r.costo_pesos > 0 ? formatARS(r.costo_pesos) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-data font-semibold ${
                        r.stock_quantity <= 0 ? 'text-red-400' :
                        r.stock_quantity < 3  ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {Number(r.stock_quantity).toLocaleString('es-AR')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => startEdit(r)}
                        className="text-xs text-slate-400 hover:text-indigo-300 transition-colors px-2 py-1 rounded hover:bg-white/5"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white/3 border border-white/8 px-4 py-3 flex items-start gap-3">
        <Package className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">
          Los repuestos tienen stock propio: podés comprarlos desde <strong className="text-slate-400">Compras</strong>.
          Al agregarlos en una orden de servicio, el precio de costo se completa automáticamente para que puedas cargar el precio de venta al cliente.
        </p>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function OrdenesServicio() {
  const { accessToken } = useAuth();
  const role = getRoleFromToken(accessToken);
  const qc = useQueryClient();

  // ── Tab principal ──
  const [paginaTab, setPaginaTab] = useState<'ordenes' | 'repuestos'>('ordenes');

  // ── Estado de UI ──
  const [vistaKanban, setVistaKanban] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [mostrarNuevaOS, setMostrarNuevaOS] = useState(false);
  const [osSeleccionada, setOsSeleccionada] = useState<number | null>(null);

  // Chip de filtro rápido
  const [quickFilter, setQuickFilter] = useState<'todas' | 'activas' | 'sin_entregar' | 'sin_facturar'>('todas');

  const [showTutorial, setShowTutorial] = useState(false);

  // ── Datos ──
  const { data: tiposTrabajo = [] } = useQuery<TipoTrabajo[]>({
    queryKey: ['os-tipos-trabajo'],
    queryFn:  () => Api.osTiposTrabajo(),
    staleTime: 300_000,
  });

  const { data: tableroData = [] } = useQuery<TableroCuenta[]>({
    queryKey: ['os-tablero'],
    queryFn:  () => Api.osTablero(),
    staleTime: 60_000,
  });

  const { data: usuariosData } = useQuery({
    queryKey: ['usuarios', 'staff'],
    queryFn:  () => Api.usuarios({ activo: true }),
    staleTime: 300_000,
  });
  const usuarios: any[] = Array.isArray(usuariosData) ? usuariosData : [];

  // Parámetros de filtro derivados del quickFilter
  const filtrosQuery = useMemo(() => {
    const base: any = { q: busqueda || undefined };
    if (filtroEstado) base.estado = filtroEstado;
    if (quickFilter === 'activas')       base.estado = undefined; // incluye todos activos — filtraremos en front
    if (quickFilter === 'sin_entregar')  base.estado = 'terminado';
    if (quickFilter === 'sin_facturar')  base.estado = 'entregado';
    return base;
  }, [busqueda, filtroEstado, quickFilter]);

  const { data: listaData, isLoading: cargando } = useQuery({
    queryKey: ['os-list', filtrosQuery],
    queryFn:  () => Api.osList(filtrosQuery),
    staleTime: 30_000,
  });

  const ordenes: OrdServRow[] = useMemo(() => {
    const rows: OrdServRow[] = (listaData as any)?.rows || listaData || [];
    if (quickFilter === 'activas') {
      return rows.filter((o) => !['facturado', 'cancelado'].includes(o.estado));
    }
    return rows;
  }, [listaData, quickFilter]);

  const totalPorEstado = useMemo(() => {
    const map: Record<string, number> = {};
    tableroData.forEach((t) => { map[t.estado] = t.cantidad; });
    return map;
  }, [tableroData]);

  // ── Vistas ──

  const CHIPS: { key: typeof quickFilter; label: string; count?: number }[] = [
    { key: 'todas',        label: 'Todas',                 count: Object.values(totalPorEstado).reduce((a, b) => a + b, 0) },
    { key: 'activas',      label: 'Activas',               count: tableroData.filter(t => !['facturado','cancelado'].includes(t.estado)).reduce((s,t) => s + t.cantidad, 0) },
    { key: 'sin_entregar', label: '🎯 Terminadas sin entregar', count: totalPorEstado['terminado'] },
    { key: 'sin_facturar', label: '📦 Entregadas sin facturar', count: totalPorEstado['entregado'] },
  ];

  // ── Render ──

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-indigo-400" />
            Servicio Técnico
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Seguimiento de trabajos desde la recepción hasta la facturación
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setShowTutorial((v) => !v)}
            className="btn-secondary flex items-center gap-1.5 text-sm"
            title="Ver guía de uso"
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">¿Cómo se usa?</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTutorial ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={() => setMostrarNuevaOS(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nueva orden de servicio
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b border-white/10 overflow-x-auto">
        {([
          { key: 'ordenes',   label: 'Órdenes',   icon: <Wrench   className="w-4 h-4" /> },
          { key: 'repuestos', label: 'Repuestos',  icon: <Boxes    className="w-4 h-4" /> },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setPaginaTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap -mb-px
              ${paginaTab === t.key
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {paginaTab === 'repuestos' && <TabRepuestos />}

      {paginaTab === 'ordenes' && <>

      {/* Tutorial paso a paso */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-5 space-y-5">
              {/* Intro */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4 text-indigo-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100 mb-1">¿Para qué sirve Servicio Técnico?</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Acá gestionás todos los trabajos técnicos que entra al taller o servicio.
                    Cada trabajo tiene su propia <strong className="text-slate-200">Orden de Servicio</strong> que avanza por etapas, desde que llega el equipo hasta que se cobra.
                    Así nunca perdés un trabajo, sabés quién lo tiene y en qué estado está.
                  </p>
                </div>
              </div>

              <hr className="border-white/10" />

              {/* Ciclo de vida */}
              <div>
                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-3">El ciclo de vida de una orden</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    {
                      paso: '1', emoji: '📥', color: 'text-slate-300', bg: 'bg-slate-500/15', border: 'border-slate-500/30',
                      titulo: 'Recibido',
                      desc: 'Cuando llega un equipo o trabajo, creás la orden. Ingresás el cliente, describís el problema y asignás un técnico. El sistema le da un número automático.',
                    },
                    {
                      paso: '2', emoji: '💰', color: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-500/30',
                      titulo: 'Presupuesto',
                      desc: 'Antes de arrancar, cargás el presupuesto con los ítems de trabajo. El cliente lo aprueba (o no). Solo si acepta, el trabajo avanza.',
                    },
                    {
                      paso: '3', emoji: '🔧', color: 'text-blue-300', bg: 'bg-blue-500/15', border: 'border-blue-500/30',
                      titulo: 'En proceso',
                      desc: 'El técnico trabaja. Podés agregar insumos usados (repuestos, materiales) que se suman al total. También podés adjuntar fotos o documentos.',
                    },
                    {
                      paso: '4', emoji: '✅', color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30',
                      titulo: 'Terminado → Entregado → Facturado',
                      desc: 'Cuando el trabajo está listo, marcalo como Terminado. Al entregarlo al cliente, pasa a Entregado. Al cobrar, se genera la venta y queda Facturado.',
                    },
                  ].map(({ paso, emoji, color, bg, border, titulo, desc }) => (
                    <div key={paso} className={`rounded-xl p-4 ${bg} border ${border} space-y-2`}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{emoji}</span>
                        <span className={`text-sm font-semibold ${color}`}>{titulo}</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <hr className="border-white/10" />

              {/* Detalle de secciones + consejos */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Qué hace cada parte</p>
                  {[
                    { icon: '📊', titulo: 'Tablero de estados', desc: 'Los 8 íconos en la parte superior muestran cuántas órdenes hay en cada estado. Hacé clic en uno para filtrar solo esas.' },
                    { icon: '📋', titulo: 'Historial de la orden', desc: 'Cada cambio de estado queda registrado con fecha, usuario y observación. Así siempre sabés quién hizo qué y cuándo.' },
                    { icon: '🔩', titulo: 'Insumos', desc: 'Registrá los repuestos o materiales usados en cada orden. El sistema los suma al total automáticamente.' },
                    { icon: '📄', titulo: 'Presupuesto', desc: 'Armá el presupuesto ítem por ítem antes de arrancar. Una vez aprobado, no se puede modificar sin pasar por el responsable.' },
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
                    { icon: '💡', titulo: 'Siempre cargá el presupuesto primero', desc: 'Antes de tocar el equipo, ingresá el presupuesto y esperá la aprobación. Así evitás trabajos sin cobrar.' },
                    { icon: '📸', titulo: 'Adjuntá fotos al recibir', desc: 'Fotografiá el equipo al recibirlo y subilo como documento. Si el cliente dice que llegó roto, tenés prueba.' },
                    { icon: '🔁', titulo: 'Actualizá el estado siempre', desc: 'Cada vez que el trabajo avanza, cambiá el estado. Así el equipo sabe en qué está sin tener que preguntar.' },
                    { icon: '👤', titulo: 'Asigná el técnico desde el principio', desc: 'Al crear la orden, elegí quién es responsable. Esa persona verá el trabajo asignado a su nombre.' },
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tablero de conteo rápido por estado ── */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {(['recibido','presupuestado','aceptado','en_proceso','terminado','entregado','facturado','cancelado'] as EstadoOS[]).map((e) => {
          const c   = totalPorEstado[e] || 0;
          const cfg = ESTADO_CFG[e];
          return (
            <button
              key={e}
              onClick={() => { setFiltroEstado(filtroEstado === e ? '' : e); setQuickFilter('todas'); }}
              title={cfg.descripcion}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all text-center
                ${filtroEstado === e
                  ? `${cfg.bg} ${cfg.border} ${cfg.text}`
                  : 'bg-white/3 border-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200'
                }`}
            >
              <span className="text-base">{cfg.emoji}</span>
              <span className="text-lg font-bold leading-none">{c}</span>
              <span className="text-xs leading-tight hidden sm:block">{cfg.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Barra de búsqueda y filtros ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por número, cliente o descripción..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="input-field pl-9 w-full text-sm"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setVistaKanban(false)}
            title="Vista lista"
            className={`p-2 rounded-lg border transition-all ${!vistaKanban ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-white/3 border-white/10 text-slate-400 hover:text-white'}`}
          >
            <List className="w-5 h-5" />
          </button>
          <button
            onClick={() => setVistaKanban(true)}
            title="Vista tablero"
            className={`p-2 rounded-lg border transition-all ${vistaKanban ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-white/3 border-white/10 text-slate-400 hover:text-white'}`}
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['os-list'] })}
            title="Actualizar"
            className="p-2 rounded-lg border border-white/10 bg-white/3 text-slate-400 hover:text-white transition-all"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Chips de filtro rápido ── */}
      <div className="flex gap-2 flex-wrap">
        {CHIPS.map((chip) => (
          <button
            key={chip.key}
            onClick={() => { setQuickFilter(chip.key); setFiltroEstado(''); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
              ${quickFilter === chip.key
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                : 'bg-white/3 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
              }`}
          >
            {chip.label}
            {chip.count !== undefined && chip.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${quickFilter === chip.key ? 'bg-indigo-500/30' : 'bg-white/10'}`}>
                {chip.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Contenido principal ── */}
      {cargando ? (
        <div className="app-card divide-y divide-white/5">
          {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : ordenes.length === 0 ? (
        <div className="app-card p-12 text-center">
          <Wrench className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <p className="text-slate-300 font-medium mb-1">
            {busqueda || filtroEstado ? 'No se encontraron órdenes con ese filtro' : 'Todavía no hay órdenes de servicio'}
          </p>
          <p className="text-slate-500 text-sm mb-4">
            {busqueda || filtroEstado
              ? 'Probá con otros términos o limpiá los filtros'
              : 'Creá la primera orden cuando llegue un trabajo técnico'}
          </p>
          {!busqueda && !filtroEstado && (
            <button onClick={() => setMostrarNuevaOS(true)} className="btn-primary inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nueva orden de servicio
            </button>
          )}
        </div>
      ) : vistaKanban ? (
        <VistaKanban ordenes={ordenes} onSelectOS={setOsSeleccionada} />
      ) : (
        <VistaLista ordenes={ordenes} onSelectOS={setOsSeleccionada} />
      )}

      </>}

      {/* ── Modales ── */}
      <AnimatePresence>
        {mostrarNuevaOS && (
          <ModalNuevaOS
            tiposTrabajo={tiposTrabajo}
            usuarios={usuarios}
            onClose={() => setMostrarNuevaOS(false)}
          />
        )}
        {osSeleccionada !== null && (
          <ModalDetalle
            osId={osSeleccionada}
            tiposTrabajo={tiposTrabajo}
            usuarios={usuarios}
            onClose={() => setOsSeleccionada(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Vista: Lista ─────────────────────────────────────────────────────────────

function VistaLista({ ordenes, onSelectOS }: { ordenes: OrdServRow[]; onSelectOS: (id: number) => void }) {
  return (
    <div className="app-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-slate-400">N° OS</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400">Cliente</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 hidden md:table-cell">Tipo</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 hidden lg:table-cell">Técnico</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400">Estado</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 hidden sm:table-cell">Recibido</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 hidden md:table-cell">Entrega est.</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 text-right">Total</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {ordenes.map((os) => {
              const hoy = new Date();
              const fEst = os.fecha_estimada_entrega ? new Date(os.fecha_estimada_entrega) : null;
              const vencida = fEst && fEst < hoy && !['entregado','facturado','cancelado'].includes(os.estado);

              return (
                <tr
                  key={os.id}
                  onClick={() => onSelectOS(os.id)}
                  className="hover:bg-white/3 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm font-semibold text-indigo-300">{os.numero_os}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-white font-medium">{os.cliente_nombre}</p>
                    {os.cliente_telefono && <p className="text-xs text-slate-500">{os.cliente_telefono}</p>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {os.tipo_trabajo_nombre ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: `${os.tipo_trabajo_color}25`, color: os.tipo_trabajo_color, border: `1px solid ${os.tipo_trabajo_color}40` }}>
                        {os.tipo_trabajo_nombre}
                      </span>
                    ) : <span className="text-slate-600 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <p className="text-sm text-slate-300">{os.tecnico_nombre || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={os.estado} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 hidden sm:table-cell whitespace-nowrap">
                    {formatFecha(os.fecha_recepcion)}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {fEst ? (
                      <span className={`text-xs ${vencida ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                        {vencida && '⚠ '}{formatFecha(os.fecha_estimada_entrega!)}
                      </span>
                    ) : <span className="text-slate-600 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-white">{formatARS(os.total_os)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Vista: Kanban ────────────────────────────────────────────────────────────

function VistaKanban({ ordenes, onSelectOS }: { ordenes: OrdServRow[]; onSelectOS: (id: number) => void }) {
  const COLUMNAS: EstadoOS[] = ['recibido','presupuestado','aceptado','en_proceso','terminado','entregado','facturado'];

  const porEstado = useMemo(() => {
    const m: Record<string, OrdServRow[]> = {};
    COLUMNAS.forEach((e) => { m[e] = []; });
    ordenes.forEach((o) => { if (m[o.estado]) m[o.estado].push(o); });
    return m;
  }, [ordenes]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {COLUMNAS.map((estado) => {
        const cfg  = ESTADO_CFG[estado];
        const cols = porEstado[estado] || [];
        return (
          <div key={estado} className="flex-shrink-0 w-64">
            {/* Header columna */}
            <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg border-b ${cfg.bg} ${cfg.border}`}>
              <div className="flex items-center gap-2">
                <span>{cfg.emoji}</span>
                <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
              </div>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                {cols.length}
              </span>
            </div>
            {/* Tarjetas */}
            <div className="space-y-2 p-2 bg-white/2 rounded-b-lg min-h-24 border border-t-0 border-white/5">
              {cols.length === 0 ? (
                <p className="text-center text-xs text-slate-600 py-4">Sin órdenes</p>
              ) : cols.map((os) => {
                const hoy  = new Date();
                const fEst = os.fecha_estimada_entrega ? new Date(os.fecha_estimada_entrega) : null;
                const venc = fEst && fEst < hoy && !['entregado','facturado','cancelado'].includes(os.estado);
                return (
                  <button
                    key={os.id}
                    onClick={() => onSelectOS(os.id)}
                    className="w-full text-left p-3 rounded-lg bg-white/5 border border-white/8 hover:border-white/20 hover:bg-white/8 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-mono text-xs font-bold text-indigo-300">{os.numero_os}</span>
                      {venc && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-white font-medium mb-0.5 truncate">{os.cliente_nombre}</p>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-2">{os.descripcion_problema}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-300">{formatARS(os.total_os)}</span>
                      {os.tecnico_nombre && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <User className="w-3 h-3" />{os.tecnico_nombre.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
