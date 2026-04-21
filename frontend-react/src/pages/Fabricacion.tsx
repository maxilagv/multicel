/**
 * Módulo de Fabricación / Producción
 * ────────────────────────────────────
 * Gestión completa del ciclo de vida de una orden de fabricación:
 * PLANIFICADA → ABASTECIENDO → EN_PRODUCCION → FINALIZADA | CANCELADA
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FlaskConical, Plus, Search, X, ChevronDown, ChevronRight,
  RefreshCw, CheckCircle2, AlertTriangle, Package, Layers,
  ArrowRight, Clock, User, BookOpen, LayoutGrid, List,
  Cpu, TrendingUp, Boxes, ClipboardList, Wrench, BarChart2,
  AlertCircle, ShoppingCart,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { formatARS, formatFecha } from '../lib/formatters';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type EstadoOF = 'PLANIFICADA' | 'ABASTECIENDO' | 'EN_PRODUCCION' | 'FINALIZADA' | 'CANCELADA';

type RecetaRow = {
  id: number; nombre: string; descripcion?: string;
  producto_terminado_id?: number; producto_terminado_nombre?: string; producto_terminado_codigo?: string;
  rendimiento: number; unidad_rendimiento: string; tiempo_produccion_horas?: number;
  activa: boolean; version: number; costo_calculado?: number; costo_calculado_en?: string;
  notas?: string; total_items: number; created_at: string;
};

type RecetaItem = {
  id: number; producto_id: number; cantidad: number; unidad?: string; notas?: string;
  producto_nombre: string; producto_codigo: string; costo_unitario: number; stock_disponible: number;
};

type RecetaDetalle = RecetaRow & {
  items: RecetaItem[];
  producto_precio_venta?: number;
};

type OrdenRow = {
  id: number; numero_of: string; estado: EstadoOF;
  cantidad_planificada: number; cantidad_producida?: number;
  fecha_inicio_planificada?: string; fecha_fin_planificada?: string;
  fecha_inicio_real?: string; fecha_fin_real?: string;
  receta_id: number; receta_nombre: string;
  producto_terminado_id?: number; producto_nombre?: string; producto_codigo?: string;
  responsable_usuario_id?: number; responsable_nombre?: string;
  deposito_destino_id?: number; deposito_nombre?: string;
  notas?: string; costo_total_calculado?: number;
  created_at: string; updated_at: string;
};

type InsumoOf = {
  id: number; producto_id: number; cantidad_requerida: number;
  cantidad_reservada: number; cantidad_consumida: number;
  producto_nombre: string; producto_codigo: string;
};

type OrdenDetalle = OrdenRow & {
  insumos: InsumoOf[];
  historial: Array<{
    id: number; estado_anterior?: string; estado_nuevo: string;
    usuario_nombre?: string; observacion?: string; created_at: string;
  }>;
};

type AnalisisItem = {
  id: number; producto_id: number; producto_nombre: string; producto_codigo: string;
  cantidad_requerida: number; cantidad_reservada: number;
  stock_disponible: number; stock_reservado: number;
  entradas_pendientes: number; disponible: number;
  faltante: number; estado: 'ok' | 'justo' | 'falta';
};

type TableroRow = OrdenRow & {
  total_insumos: number; insumos_ok: number;
};

// ─── Configuración de estados ─────────────────────────────────────────────────

const ESTADO_CFG: Record<EstadoOF, {
  label: string; emoji: string; descripcion: string;
  bg: string; text: string; border: string; dot: string;
}> = {
  PLANIFICADA:   { label: 'Planificada',   emoji: '📋', descripcion: 'Orden creada, pendiente de análisis de insumos',
    bg: 'bg-slate-500/15',   text: 'text-slate-300',  border: 'border-slate-500/30', dot: 'bg-slate-400' },
  ABASTECIENDO:  { label: 'Abasteciendo',  emoji: '📦', descripcion: 'Insumos siendo reservados o comprados',
    bg: 'bg-amber-500/15',   text: 'text-amber-300',  border: 'border-amber-500/30', dot: 'bg-amber-400' },
  EN_PRODUCCION: { label: 'En producción', emoji: '⚙️', descripcion: 'La producción está en curso',
    bg: 'bg-indigo-500/15',  text: 'text-indigo-300', border: 'border-indigo-500/30', dot: 'bg-indigo-400' },
  FINALIZADA:    { label: 'Finalizada',    emoji: '✅', descripcion: 'Producción completada y stock actualizado',
    bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  CANCELADA:     { label: 'Cancelada',     emoji: '❌', descripcion: 'Orden cancelada',
    bg: 'bg-red-500/15',     text: 'text-red-300',    border: 'border-red-500/30',    dot: 'bg-red-500' },
};

const ESTADOS_ACTIVOS: EstadoOF[] = ['PLANIFICADA', 'ABASTECIENDO', 'EN_PRODUCCION'];

// ─── Badge de estado ──────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: EstadoOF }) {
  const cfg = ESTADO_CFG[estado] ?? ESTADO_CFG.PLANIFICADA;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Barra de progreso temporal ───────────────────────────────────────────────

function ProgressoTemporal({ desde, hasta }: { desde?: string; hasta?: string }) {
  if (!desde || !hasta) return null;
  const start = new Date(desde).getTime();
  const end   = new Date(hasta).getTime();
  const now   = Date.now();
  const pct   = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  const color = pct < 60 ? 'bg-emerald-500' : pct < 85 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
        <span>{formatFecha(desde)}</span>
        <span>{Math.round(pct)}%</span>
        <span>{formatFecha(hasta)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Semáforo de abastecimiento ───────────────────────────────────────────────

function SemaforoAbastecimiento({ ok, total }: { ok: number; total: number }) {
  if (!total) return null;
  const pct = total > 0 ? ok / total : 0;
  const color = pct === 1 ? 'text-emerald-400' : pct >= 0.75 ? 'text-amber-400' : 'text-red-400';
  const emoji = pct === 1 ? '🟢' : pct >= 0.75 ? '🟡' : '🔴';
  return (
    <span className={`text-xs font-medium ${color}`} title={`${ok}/${total} insumos disponibles`}>
      {emoji} {ok}/{total}
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="animate-pulse flex items-center gap-4 p-4 border-b border-white/5">
      <div className="w-20 h-4 bg-white/10 rounded" />
      <div className="flex-1 h-4 bg-white/10 rounded" />
      <div className="w-24 h-5 bg-white/10 rounded-full" />
      <div className="w-16 h-4 bg-white/10 rounded" />
    </div>
  );
}

// ─── Wizard "Nueva OF" ────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3;

function WizardNuevaOf({
  onClose, onCreated,
}: { onClose: () => void; onCreated: (of: OrdenRow) => void }) {
  const toast   = useToast();
  const qc      = useQueryClient();
  const [step, setStep]       = useState<WizardStep>(1);
  const [recetaId, setRecetaId]   = useState<number | null>(null);
  const [recetaQ, setRecetaQ]     = useState('');
  const [cantidad, setCantidad]   = useState('1');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin]       = useState('');
  const [notas, setNotas]           = useState('');
  const [analisisItems, setAnalisisItems] = useState<AnalisisItem[]>([]);
  const [loadingAnalisis, setLoadingAnalisis] = useState(false);

  const { data: recetas = [] } = useQuery<RecetaRow[]>({
    queryKey: ['fab-recetas', recetaQ],
    queryFn: () => Api.fabricacionRecetas({ q: recetaQ || undefined, activa: true }),
    staleTime: 60_000,
  });

  const recetaSeleccionada = recetas.find((r) => r.id === recetaId);

  const mutCreate = useMutation({
    mutationFn: (body: any) => Api.fabricacionCrearOrden(body),
    onSuccess: (data: OrdenRow) => {
      qc.invalidateQueries({ queryKey: ['fab-ordenes'] });
      qc.invalidateQueries({ queryKey: ['fab-tablero'] });
      toast.success(`Orden ${data.numero_of} creada`);
      onCreated(data);
    },
    onError: (e: any) => toast.error(e.message || 'Error al crear la orden'),
  });

  async function handleNext() {
    if (step === 1) {
      if (!recetaId) return toast.error('Seleccioná una receta');
      setStep(2);
    } else if (step === 2) {
      if (!cantidad || Number(cantidad) <= 0) return toast.error('Ingresá una cantidad válida');
      setLoadingAnalisis(true);
      try {
        // Create provisional order to get analisis – or compute manually
        const r = await Api.fabricacionReceta(recetaId!);
        const items: AnalisisItem[] = (r.items || []).map((item: RecetaItem) => {
          const req = item.cantidad * Number(cantidad);
          const stock = Number(item.stock_disponible) || 0;
          const faltante = Math.max(0, req - stock);
          return {
            id: item.id,
            producto_id: item.producto_id,
            producto_nombre: item.producto_nombre,
            producto_codigo: item.producto_codigo,
            cantidad_requerida: req,
            cantidad_reservada: 0,
            stock_disponible: stock,
            stock_reservado: 0,
            entradas_pendientes: 0,
            disponible: stock,
            faltante,
            estado: faltante === 0 ? 'ok' : stock / req >= 0.75 ? 'justo' : 'falta',
          };
        });
        setAnalisisItems(items);
        setStep(3);
      } catch (e: any) {
        toast.error(e.message || 'Error al calcular análisis');
      } finally {
        setLoadingAnalisis(false);
      }
    } else {
      mutCreate.mutate({
        receta_id: recetaId,
        cantidad_planificada: Number(cantidad),
        fecha_inicio_planificada: fechaInicio || undefined,
        fecha_fin_planificada: fechaFin || undefined,
        notas: notas || undefined,
      });
    }
  }

  const estadoAbastecimiento = {
    ok:    analisisItems.filter((i) => i.estado === 'ok').length,
    justo: analisisItems.filter((i) => i.estado === 'justo').length,
    falta: analisisItems.filter((i) => i.estado === 'falta').length,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="app-card w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h2 className="text-base font-bold text-white">Nueva Orden de Fabricación</h2>
            <div className="flex items-center gap-2 mt-1.5">
              {([1, 2, 3] as WizardStep[]).map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
                    s === step ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                    : s < step  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                    : 'border-white/10 text-slate-600'
                  }`}>
                    {s < step ? '✓' : s}
                  </div>
                  <span className={`text-xs hidden sm:block ${s === step ? 'text-slate-300' : 'text-slate-600'}`}>
                    {s === 1 ? 'Receta' : s === 2 ? 'Cantidad y fechas' : 'Confirmación'}
                  </span>
                  {s < 3 && <ChevronRight className="w-3 h-3 text-slate-700" />}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Step 1: Select recipe */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">Buscá y seleccioná la receta que querés producir:</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  className="input-field w-full pl-9"
                  placeholder="Buscar receta o producto..."
                  value={recetaQ}
                  onChange={(e) => setRecetaQ(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {recetas.length === 0 && (
                  <p className="text-center text-slate-500 text-sm py-4">No hay recetas activas. Creá una en la pestaña Recetas.</p>
                )}
                {recetas.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRecetaId(r.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      recetaId === r.id
                        ? 'border-indigo-500/60 bg-indigo-500/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{r.nombre}</p>
                        {r.producto_terminado_nombre && (
                          <p className="text-xs text-slate-500">Produce: {r.producto_terminado_nombre}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-500">{r.total_items} insumo{r.total_items !== 1 ? 's' : ''}</p>
                        {r.costo_calculado != null && (
                          <p className="text-xs text-emerald-400">{formatARS(r.costo_calculado)}/u</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Quantity and dates */}
          {step === 2 && recetaSeleccionada && (
            <div className="space-y-4">
              <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-3">
                <p className="text-xs text-indigo-300 font-semibold uppercase tracking-wider mb-0.5">Receta seleccionada</p>
                <p className="text-sm font-bold text-white">{recetaSeleccionada.nombre}</p>
                {recetaSeleccionada.producto_terminado_nombre && (
                  <p className="text-xs text-slate-400 mt-0.5">Produce: {recetaSeleccionada.producto_terminado_nombre}</p>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium mb-1 block">Cantidad a producir *</label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  className="input-field w-full"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  autoFocus
                />
                {recetaSeleccionada.costo_calculado != null && Number(cantidad) > 0 && (
                  <p className="text-xs text-emerald-400 mt-1">
                    Costo estimado: {formatARS(recetaSeleccionada.costo_calculado * Number(cantidad))}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Inicio planificado</label>
                  <input type="date" className="input-field w-full" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Fin planificado</label>
                  <input type="date" className="input-field w-full" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium mb-1 block">Notas (opcional)</label>
                <textarea
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:border-indigo-500/50"
                  placeholder="Observaciones..."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 3: Abastecimiento analysis */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm text-slate-400">Análisis de abastecimiento para <strong className="text-white">{cantidad} {recetaSeleccionada?.unidad_rendimiento}</strong>:</p>
                <div className="flex gap-2">
                  {estadoAbastecimiento.ok    > 0 && <span className="text-xs text-emerald-400">✓ {estadoAbastecimiento.ok} OK</span>}
                  {estadoAbastecimiento.justo > 0 && <span className="text-xs text-amber-400">⚠ {estadoAbastecimiento.justo} justo</span>}
                  {estadoAbastecimiento.falta > 0 && <span className="text-xs text-red-400">✗ {estadoAbastecimiento.falta} faltante</span>}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="min-w-full text-xs">
                  <thead className="bg-white/5">
                    <tr className="text-left text-slate-500 uppercase tracking-wider">
                      <th className="px-3 py-2">Insumo</th>
                      <th className="px-3 py-2 text-right">Req.</th>
                      <th className="px-3 py-2 text-right">Stock</th>
                      <th className="px-3 py-2 text-right">Dispon.</th>
                      <th className="px-3 py-2 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisisItems.map((item) => (
                      <tr key={item.id} className="border-t border-white/5 hover:bg-white/5">
                        <td className="px-3 py-2">
                          <p className="text-slate-200 font-medium">{item.producto_nombre}</p>
                          <p className="text-slate-600">{item.producto_codigo}</p>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-300 font-data">{item.cantidad_requerida.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-slate-400 font-data">{Number(item.stock_disponible).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-data font-semibold">
                          <span className={item.faltante > 0 ? 'text-red-300' : 'text-emerald-300'}>
                            {item.disponible.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {item.estado === 'ok'    && <span className="text-emerald-400 font-semibold">✓ OK</span>}
                          {item.estado === 'justo' && <span className="text-amber-400 font-semibold">⚠ Justo</span>}
                          {item.estado === 'falta' && <span className="text-red-400 font-semibold">✗ Falta {item.faltante.toFixed(2)}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {estadoAbastecimiento.falta > 0 && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300">
                    Hay {estadoAbastecimiento.falta} insumo(s) con stock insuficiente. Podés crear la orden igual y luego generar un pedido de compra desde el detalle.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-5 border-t border-white/10">
          <button
            onClick={() => step > 1 ? setStep((s) => (s - 1) as WizardStep) : onClose()}
            className="btn-secondary text-sm"
          >
            {step > 1 ? 'Atrás' : 'Cancelar'}
          </button>
          <button
            onClick={handleNext}
            disabled={mutCreate.isPending || loadingAnalisis}
            className="btn-primary text-sm flex items-center gap-2"
          >
            {(mutCreate.isPending || loadingAnalisis) && <RefreshCw className="w-4 h-4 animate-spin" />}
            {step === 3 ? 'Crear orden' : 'Siguiente'}
            {step < 3 && !mutCreate.isPending && !loadingAnalisis && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Modal Detalle de Orden ───────────────────────────────────────────────────

function ModalOrden({ ofId, onClose }: { ofId: number; onClose: () => void }) {
  const toast = useToast();
  const qc    = useQueryClient();
  const [tabMod, setTabMod] = useState<'info' | 'analisis' | 'planilla' | 'historial'>('info');
  const [obsInput, setObsInput] = useState('');
  const [cantProducida, setCantProducida] = useState('');
  const [metodoFin, setMetodoFin] = useState<'automatico' | 'planilla'>('automatico');
  const [planillaValues, setPlanillaValues] = useState<Record<number, string>>({});

  const { data: of, isLoading, isError } = useQuery<OrdenDetalle>({
    queryKey: ['fab-orden', ofId],
    queryFn:  () => Api.fabricacionOrden(ofId),
    staleTime: 30_000,
  });

  const { data: analisis, isLoading: analisisLoading } = useQuery<AnalisisItem[]>({
    queryKey: ['fab-analisis', ofId],
    queryFn:  () => Api.fabricacionAnalisis(ofId),
    enabled:  tabMod === 'analisis',
    staleTime: 20_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['fab-orden', ofId] });
    qc.invalidateQueries({ queryKey: ['fab-ordenes'] });
    qc.invalidateQueries({ queryKey: ['fab-tablero'] });
    qc.invalidateQueries({ queryKey: ['fab-analisis', ofId] });
  };

  const mutReservar = useMutation({
    mutationFn: () => Api.fabricacionReservarInsumos(ofId),
    onSuccess: () => { invalidate(); toast.success('Insumos reservados'); },
    onError: (e: any) => toast.error(e.message || 'Error al reservar'),
  });

  const mutIniciar = useMutation({
    mutationFn: () => Api.fabricacionIniciar(ofId, { observacion: obsInput || undefined }),
    onSuccess: () => { invalidate(); toast.success('Producción iniciada'); setObsInput(''); },
    onError: (e: any) => toast.error(e.message || 'Error al iniciar'),
  });

  const mutFinalizar = useMutation({
    mutationFn: () => Api.fabricacionFinalizar(ofId, {
      cantidad_producida: Number(cantProducida),
      metodo: metodoFin,
    }),
    onSuccess: (data: any) => {
      invalidate();
      const warns: string[] = data.advertencias || [];
      if (warns.length) toast.error(`Finalizado con advertencias: ${warns.join('; ')}`);
      else toast.success('Orden finalizada y stock actualizado');
    },
    onError: (e: any) => toast.error(e.message || 'Error al finalizar'),
  });

  const mutCancelar = useMutation({
    mutationFn: () => Api.fabricacionCancelar(ofId, { observacion: obsInput || undefined }),
    onSuccess: () => { invalidate(); toast.success('Orden cancelada'); setObsInput(''); },
    onError: (e: any) => toast.error(e.message || 'Error al cancelar'),
  });

  const mutPlanilla = useMutation({
    mutationFn: () => {
      const items = (of?.insumos || []).map((ins) => ({
        insumo_id: ins.id,
        cantidad_consumida: Number(planillaValues[ins.id] ?? ins.cantidad_requerida),
      }));
      return Api.fabricacionCargarPlanilla(ofId, items);
    },
    onSuccess: () => { invalidate(); toast.success('Planilla guardada'); },
    onError: (e: any) => toast.error(e.message || 'Error al guardar planilla'),
  });

  if (isLoading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="app-card p-10"><RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" /></div>
    </div>
  );

  if (isError || !of) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="app-card p-8 text-center">
        <p className="text-red-400 mb-4">No se pudo cargar la orden</p>
        <button onClick={onClose} className="btn-secondary">Cerrar</button>
      </div>
    </div>
  );

  const cfg    = ESTADO_CFG[of.estado];
  const canIniciar  = ['PLANIFICADA', 'ABASTECIENDO'].includes(of.estado);
  const canFinalizar = of.estado === 'EN_PRODUCCION';
  const canCancelar  = !['FINALIZADA', 'CANCELADA'].includes(of.estado);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18 }}
        className="app-card w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-white/10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-lg font-bold text-white font-mono">{of.numero_of}</span>
              <EstadoBadge estado={of.estado} />
            </div>
            <p className="text-sm text-slate-400 mt-0.5 truncate">{of.receta_nombre}</p>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2 shrink-0">
            {canIniciar && (
              <button
                onClick={() => mutIniciar.mutate()}
                disabled={mutIniciar.isPending}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-all"
              >
                <Cpu className="w-3 h-3" /> Iniciar producción
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-white/10 px-5 overflow-x-auto">
          {(['info', 'analisis', 'planilla', 'historial'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTabMod(t)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                tabMod === t
                  ? 'border-indigo-400 text-indigo-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {t === 'info' ? 'Información' : t === 'analisis' ? '📦 Abastecimiento' : t === 'planilla' ? '📋 Planilla' : '⏱ Historial'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Tab: Info */}
          {tabMod === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">Cantidad planif.</p>
                  <p className="text-xl font-bold text-white mt-0.5">{of.cantidad_planificada}</p>
                </div>
                {of.cantidad_producida != null && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
                    <p className="text-[11px] text-slate-500 uppercase tracking-wider">Producida</p>
                    <p className="text-xl font-bold text-emerald-300 mt-0.5">{of.cantidad_producida}</p>
                  </div>
                )}
                {of.responsable_nombre && (
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <p className="text-[11px] text-slate-500 uppercase tracking-wider">Responsable</p>
                    <p className="text-sm font-semibold text-slate-200 mt-0.5">{of.responsable_nombre}</p>
                  </div>
                )}
                {of.costo_total_calculado != null && (
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <p className="text-[11px] text-slate-500 uppercase tracking-wider">Costo total</p>
                    <p className="text-sm font-semibold text-emerald-300 mt-0.5">{formatARS(of.costo_total_calculado)}</p>
                  </div>
                )}
              </div>

              {/* Insumos requeridos */}
              {of.insumos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Insumos de la orden</p>
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="min-w-full text-xs">
                      <thead className="bg-white/5">
                        <tr className="text-left text-slate-500">
                          <th className="px-3 py-2">Insumo</th>
                          <th className="px-3 py-2 text-right">Requerido</th>
                          <th className="px-3 py-2 text-right">Reservado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {of.insumos.map((ins) => (
                          <tr key={ins.id} className="border-t border-white/5">
                            <td className="px-3 py-2">
                              <p className="text-slate-200">{ins.producto_nombre}</p>
                              <p className="text-slate-600">{ins.producto_codigo}</p>
                            </td>
                            <td className="px-3 py-2 text-right font-data text-slate-300">{Number(ins.cantidad_requerida).toFixed(3)}</td>
                            <td className="px-3 py-2 text-right font-data">
                              <span className={Number(ins.cantidad_reservada) > 0 ? 'text-emerald-400' : 'text-slate-600'}>
                                {Number(ins.cantidad_reservada).toFixed(3)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Acciones de estado */}
              <div className="space-y-3">
                {canIniciar && (
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
                    <p className="text-sm font-semibold text-indigo-300">Iniciar producción</p>
                    <textarea
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:border-indigo-500/50"
                      placeholder="Observación (opcional)..."
                      value={obsInput}
                      onChange={(e) => setObsInput(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => mutReservar.mutate()}
                        disabled={mutReservar.isPending}
                        className="btn-secondary text-xs flex items-center gap-1.5"
                      >
                        {mutReservar.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Boxes className="w-3 h-3" />}
                        Reservar insumos
                      </button>
                      <button
                        onClick={() => mutIniciar.mutate()}
                        disabled={mutIniciar.isPending}
                        className="btn-primary text-xs flex items-center gap-1.5"
                      >
                        {mutIniciar.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Cpu className="w-3 h-3" />}
                        Iniciar producción
                      </button>
                    </div>
                  </div>
                )}

                {canFinalizar && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                    <p className="text-sm font-semibold text-emerald-300">Finalizar producción</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Cantidad producida *</label>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          className="input-field w-full"
                          placeholder={`Planificado: ${of.cantidad_planificada}`}
                          value={cantProducida}
                          onChange={(e) => setCantProducida(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Método de descuento</label>
                        <select
                          className="input-field w-full"
                          value={metodoFin}
                          onChange={(e) => setMetodoFin(e.target.value as 'automatico' | 'planilla')}
                        >
                          <option value="automatico">Automático (receta)</option>
                          <option value="planilla">Planilla manual</option>
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={() => mutFinalizar.mutate()}
                      disabled={mutFinalizar.isPending || !cantProducida || Number(cantProducida) <= 0}
                      className="btn-primary text-xs flex items-center gap-1.5"
                    >
                      {mutFinalizar.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Finalizar y actualizar stock
                    </button>
                  </div>
                )}

                {canCancelar && (
                  <div className="rounded-xl border border-red-500/15 bg-red-500/5 p-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">¿Necesitás cancelar esta orden?</p>
                    <button
                      onClick={() => { if (confirm('¿Cancelar esta orden de fabricación?')) mutCancelar.mutate(); }}
                      disabled={mutCancelar.isPending}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                    >
                      {mutCancelar.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                      Cancelar orden
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab: Analisis */}
          {tabMod === 'analisis' && (
            <div className="space-y-3">
              {analisisLoading && <div className="flex justify-center py-8"><RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" /></div>}
              {!analisisLoading && (
                <>
                  <div className="flex justify-end">
                    <button
                      onClick={() => mutReservar.mutate()}
                      disabled={mutReservar.isPending}
                      className="btn-secondary text-xs flex items-center gap-1.5"
                    >
                      {mutReservar.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Boxes className="w-3 h-3" />}
                      Reservar disponibles
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="min-w-full text-xs">
                      <thead className="bg-white/5">
                        <tr className="text-left text-slate-500 uppercase tracking-wider text-[10px]">
                          <th className="px-3 py-2">Insumo</th>
                          <th className="px-3 py-2 text-right">Req.</th>
                          <th className="px-3 py-2 text-right">Stock</th>
                          <th className="px-3 py-2 text-right">Reser.</th>
                          <th className="px-3 py-2 text-right">Entrant.</th>
                          <th className="px-3 py-2 text-right">Dispon.</th>
                          <th className="px-3 py-2 text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analisis || []).map((item) => (
                          <tr key={item.id} className="border-t border-white/5 hover:bg-white/5">
                            <td className="px-3 py-2">
                              <p className="text-slate-200 font-medium">{item.producto_nombre}</p>
                              <p className="text-slate-600">{item.producto_codigo}</p>
                            </td>
                            <td className="px-3 py-2 text-right font-data text-slate-300">{Number(item.cantidad_requerida).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-data text-slate-400">{Number(item.stock_disponible).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-data text-slate-500">{Number(item.cantidad_reservada).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-data text-cyan-400">{Number(item.entradas_pendientes).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-data font-semibold">
                              <span className={item.faltante > 0 ? 'text-red-300' : 'text-emerald-300'}>
                                {Number(item.disponible).toFixed(2)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              {item.estado === 'ok'    && <span className="text-emerald-400">✓ OK</span>}
                              {item.estado === 'justo' && <span className="text-amber-400">⚠ Justo</span>}
                              {item.estado === 'falta' && <span className="text-red-400 font-semibold">✗ Falta {item.faltante.toFixed(2)}</span>}
                            </td>
                          </tr>
                        ))}
                        {(!analisis || !analisis.length) && (
                          <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Sin insumos requeridos</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab: Planilla */}
          {tabMod === 'planilla' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">Ingresá las cantidades realmente consumidas de cada insumo. Esta planilla se usa cuando finalizás con método "planilla manual".</p>
              {of.estado !== 'EN_PRODUCCION' && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  La planilla solo se puede editar cuando la orden está EN_PRODUCCION.
                </div>
              )}
              <div className="space-y-2">
                {of.insumos.map((ins) => (
                  <div key={ins.id} className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 font-medium truncate">{ins.producto_nombre}</p>
                      <p className="text-xs text-slate-500">Requerido: {Number(ins.cantidad_requerida).toFixed(3)}</p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      className="input-field w-28 text-right"
                      placeholder={String(ins.cantidad_requerida)}
                      value={planillaValues[ins.id] ?? ins.cantidad_consumida}
                      onChange={(e) => setPlanillaValues((p) => ({ ...p, [ins.id]: e.target.value }))}
                      disabled={of.estado !== 'EN_PRODUCCION'}
                    />
                  </div>
                ))}
              </div>
              {of.estado === 'EN_PRODUCCION' && (
                <button
                  onClick={() => mutPlanilla.mutate()}
                  disabled={mutPlanilla.isPending}
                  className="btn-primary text-sm flex items-center gap-2"
                >
                  {mutPlanilla.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Guardar planilla
                </button>
              )}
            </div>
          )}

          {/* Tab: Historial */}
          {tabMod === 'historial' && (
            <div className="space-y-2">
              {of.historial.map((h) => (
                <div key={h.id} className="flex gap-3 rounded-xl bg-white/5 border border-white/5 p-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1 shrink-0" />
                    <div className="w-px flex-1 bg-white/5 mt-1" />
                  </div>
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-indigo-300">{h.estado_nuevo}</span>
                      {h.estado_anterior && <span className="text-xs text-slate-600">← {h.estado_anterior}</span>}
                    </div>
                    {h.observacion && <p className="text-xs text-slate-400 mt-0.5">{h.observacion}</p>}
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-600">
                      {h.usuario_nombre && <span className="flex items-center gap-1"><User className="w-3 h-3" />{h.usuario_nombre}</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatFecha(h.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {!of.historial.length && <p className="text-center text-slate-500 text-sm py-4">Sin historial</p>}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Tab Recetas ──────────────────────────────────────────────────────────────

function TabRecetas() {
  const toast = useToast();
  const qc    = useQueryClient();
  const [q, setQ]               = useState('');
  const [showNueva, setShowNueva]   = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState({
    nombre: '', descripcion: '', rendimiento: '1', unidad_rendimiento: 'unidad',
    tiempo_produccion_horas: '', notas: '',
  });
  const [items, setItems] = useState<Array<{ producto_id: string; cantidad: string; unidad: string }>>([]);

  const { data: recetas = [], isLoading } = useQuery<RecetaRow[]>({
    queryKey: ['fab-recetas', q],
    queryFn:  () => Api.fabricacionRecetas({ q: q || undefined }),
    staleTime: 30_000,
  });

  const { data: recetaDet } = useQuery<RecetaDetalle>({
    queryKey: ['fab-receta-det', expandedId],
    queryFn:  () => Api.fabricacionReceta(expandedId!),
    enabled:  expandedId != null,
    staleTime: 60_000,
  });

  const mutCreate = useMutation({
    mutationFn: (body: any) => Api.fabricacionCrearReceta(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fab-recetas'] });
      toast.success('Receta creada');
      setShowNueva(false);
      setForm({ nombre: '', descripcion: '', rendimiento: '1', unidad_rendimiento: 'unidad', tiempo_produccion_horas: '', notas: '' });
      setItems([]);
    },
    onError: (e: any) => toast.error(e.message || 'Error al crear'),
  });

  const mutCalcCosto = useMutation({
    mutationFn: (id: number) => Api.fabricacionCalcularCosto(id),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['fab-recetas'] });
      qc.invalidateQueries({ queryKey: ['fab-receta-det', expandedId] });
      toast.success(`Costo calculado: ${formatARS(data.costo_total)}`);
    },
    onError: (e: any) => toast.error(e.message || 'Error al calcular'),
  });

  function addItem() {
    setItems((p) => [...p, { producto_id: '', cantidad: '1', unidad: '' }]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validItems = items.filter((i) => i.producto_id && Number(i.cantidad) > 0).map((i) => ({
      producto_id: Number(i.producto_id),
      cantidad: Number(i.cantidad),
      unidad: i.unidad || undefined,
    }));
    mutCreate.mutate({ ...form, rendimiento: Number(form.rendimiento), items: validItems });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="input-field w-full pl-9" placeholder="Buscar receta..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button onClick={() => setShowNueva((v) => !v)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Nueva receta
        </button>
      </div>

      {/* Formulario nueva receta */}
      <AnimatePresence>
        {showNueva && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleSubmit} className="app-card p-5 space-y-4 border border-indigo-500/20">
              <h3 className="text-sm font-bold text-white">Nueva receta de fabricación</h3>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-400 block mb-1">Nombre *</label>
                  <input className="input-field w-full" required value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Rendimiento</label>
                  <input type="number" min="0.001" step="0.001" className="input-field w-full" value={form.rendimiento} onChange={(e) => setForm((f) => ({ ...f, rendimiento: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Unidad</label>
                  <input className="input-field w-full" value={form.unidad_rendimiento} onChange={(e) => setForm((f) => ({ ...f, unidad_rendimiento: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Tiempo producción (horas)</label>
                  <input type="number" min="0" step="0.5" className="input-field w-full" value={form.tiempo_produccion_horas} onChange={(e) => setForm((f) => ({ ...f, tiempo_produccion_horas: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-400 block mb-1">Notas</label>
                  <textarea rows={2} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-indigo-500/50" value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
                </div>
              </div>

              {/* Insumos */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Insumos</p>
                  <button type="button" onClick={addItem} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Agregar insumo
                  </button>
                </div>
                {items.length === 0 && <p className="text-xs text-slate-600 py-2">No hay insumos. La receta puede guardarse sin insumos y agregarlos después.</p>}
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input
                      className="input-field flex-1"
                      type="number"
                      placeholder="ID Producto"
                      value={item.producto_id}
                      onChange={(e) => setItems((p) => p.map((i, k) => k === idx ? { ...i, producto_id: e.target.value } : i))}
                    />
                    <input
                      className="input-field w-24"
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="Cant."
                      value={item.cantidad}
                      onChange={(e) => setItems((p) => p.map((i, k) => k === idx ? { ...i, cantidad: e.target.value } : i))}
                    />
                    <input
                      className="input-field w-20"
                      placeholder="Unidad"
                      value={item.unidad}
                      onChange={(e) => setItems((p) => p.map((i, k) => k === idx ? { ...i, unidad: e.target.value } : i))}
                    />
                    <button type="button" onClick={() => setItems((p) => p.filter((_, k) => k !== idx))} className="text-red-400 hover:text-red-300">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={mutCreate.isPending} className="btn-primary text-sm flex items-center gap-2">
                  {mutCreate.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Guardar receta
                </button>
                <button type="button" onClick={() => setShowNueva(false)} className="btn-secondary text-sm">Cancelar</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista de recetas */}
      {isLoading && [1, 2, 3].map((k) => <SkeletonRow key={k} />)}
      {!isLoading && recetas.length === 0 && (
        <div className="app-card p-8 text-center">
          <FlaskConical className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No hay recetas de fabricación todavía.</p>
          <p className="text-sm text-slate-600 mt-1">Las recetas definen los insumos necesarios para producir cada producto.</p>
        </div>
      )}

      <div className="space-y-2">
        {recetas.map((r) => (
          <div key={r.id} className="app-card overflow-hidden">
            <button
              className="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors text-left"
              onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <FlaskConical className="w-4 h-4 text-indigo-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-100">{r.nombre}</p>
                  {!r.activa && <span className="text-xs text-slate-600 border border-white/10 rounded px-1.5 py-0.5">Inactiva</span>}
                  <span className="text-xs text-slate-600">v{r.version}</span>
                </div>
                {r.producto_terminado_nombre && (
                  <p className="text-xs text-slate-500 mt-0.5">Produce: {r.producto_terminado_nombre}</p>
                )}
              </div>
              <div className="text-right shrink-0 hidden sm:block">
                <p className="text-xs text-slate-500">{r.total_items} insumo{r.total_items !== 1 ? 's' : ''}</p>
                {r.costo_calculado != null ? (
                  <p className="text-xs text-emerald-400 font-semibold">{formatARS(r.costo_calculado)}/u</p>
                ) : (
                  <p className="text-xs text-slate-600">Costo sin calcular</p>
                )}
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${expandedId === r.id ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {expandedId === r.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-t border-white/10"
                >
                  <div className="p-4 space-y-3">
                    {/* Cost header */}
                    {recetaDet && (
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-0">
                          {recetaDet.producto_precio_venta != null && recetaDet.costo_calculado != null && (
                            <div className="flex gap-4">
                              <div>
                                <p className="text-[10px] text-slate-600 uppercase">Costo/u</p>
                                <p className="text-sm font-bold text-emerald-300">{formatARS(recetaDet.costo_calculado)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-600 uppercase">Precio venta</p>
                                <p className="text-sm font-bold text-slate-200">{formatARS(recetaDet.producto_precio_venta)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-600 uppercase">Margen fab.</p>
                                <p className="text-sm font-bold text-indigo-300">
                                  {recetaDet.producto_precio_venta > 0
                                    ? `${(((recetaDet.producto_precio_venta - recetaDet.costo_calculado) / recetaDet.producto_precio_venta) * 100).toFixed(1)}%`
                                    : '—'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => mutCalcCosto.mutate(r.id)}
                          disabled={mutCalcCosto.isPending}
                          className="btn-secondary text-xs flex items-center gap-1.5"
                        >
                          {mutCalcCosto.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
                          Recalcular costo
                        </button>
                      </div>
                    )}

                    {/* Items table */}
                    {recetaDet?.items?.length ? (
                      <div className="overflow-x-auto rounded-xl border border-white/10">
                        <table className="min-w-full text-xs">
                          <thead className="bg-white/5">
                            <tr className="text-left text-slate-500">
                              <th className="px-3 py-2">Insumo</th>
                              <th className="px-3 py-2 text-right">Cantidad</th>
                              <th className="px-3 py-2 text-right">Costo unit.</th>
                              <th className="px-3 py-2 text-right">Stock</th>
                              <th className="px-3 py-2 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recetaDet.items.map((item) => (
                              <tr key={item.id} className="border-t border-white/5 hover:bg-white/5">
                                <td className="px-3 py-2">
                                  <p className="text-slate-200">{item.producto_nombre}</p>
                                  <p className="text-slate-600">{item.producto_codigo}</p>
                                </td>
                                <td className="px-3 py-2 text-right font-data text-slate-300">{item.cantidad} {item.unidad || ''}</td>
                                <td className="px-3 py-2 text-right font-data text-slate-400">{formatARS(item.costo_unitario)}</td>
                                <td className="px-3 py-2 text-right font-data">
                                  <span className={Number(item.stock_disponible) >= item.cantidad ? 'text-emerald-400' : 'text-red-400'}>
                                    {Number(item.stock_disponible).toFixed(2)}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right font-data text-slate-200 font-semibold">
                                  {formatARS(item.cantidad * item.costo_unitario)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600">Sin insumos cargados</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab Tablero ──────────────────────────────────────────────────────────────

function TabTablero({ onOpenOrden }: { onOpenOrden: (id: number) => void }) {
  const { data: ordenes = [], isLoading, refetch } = useQuery<TableroRow[]>({
    queryKey: ['fab-tablero'],
    queryFn:  () => Api.fabricacionTablero(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const columnas: { estado: EstadoOF; icon: React.ReactNode }[] = [
    { estado: 'PLANIFICADA',   icon: <ClipboardList className="w-4 h-4" /> },
    { estado: 'ABASTECIENDO',  icon: <Boxes className="w-4 h-4" /> },
    { estado: 'EN_PRODUCCION', icon: <Wrench className="w-4 h-4" /> },
  ];

  if (isLoading) return (
    <div className="flex justify-center py-12">
      <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => refetch()} className="btn-secondary text-xs flex items-center gap-1.5">
          <RefreshCw className="w-3 h-3" /> Actualizar
        </button>
      </div>

      {ordenes.length === 0 && (
        <div className="app-card p-8 text-center">
          <LayoutGrid className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No hay órdenes activas en producción.</p>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {columnas.map(({ estado, icon }) => {
          const cfg    = ESTADO_CFG[estado];
          const items  = ordenes.filter((o) => o.estado === estado);
          return (
            <div key={estado} className="space-y-3">
              {/* Column header */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${cfg.border} ${cfg.bg}`}>
                <span className={cfg.text}>{icon}</span>
                <span className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</span>
                <span className={`ml-auto text-xs font-bold ${cfg.text} opacity-70`}>{items.length}</span>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[120px]">
                {items.map((of) => {
                  const totalInsumos = Number(of.total_insumos) || 0;
                  const insumosOk    = Number(of.insumos_ok)    || 0;
                  const abastPct     = totalInsumos > 0 ? insumosOk / totalInsumos : 1;
                  return (
                    <button
                      key={of.id}
                      onClick={() => onOpenOrden(of.id)}
                      className="w-full text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white font-mono">{of.numero_of}</p>
                          <p className="text-xs text-slate-400 mt-0.5 truncate">{of.receta_nombre}</p>
                        </div>
                        <SemaforoAbastecimiento ok={insumosOk} total={totalInsumos} />
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-500">
                          {Number(of.cantidad_planificada)} {of.producto_nombre ? `× ${of.producto_nombre}` : ''}
                        </span>
                        {of.responsable_nombre && (
                          <span className="text-xs text-slate-600 flex items-center gap-0.5">
                            <User className="w-2.5 h-2.5" />{of.responsable_nombre}
                          </span>
                        )}
                      </div>

                      <ProgressoTemporal desde={of.fecha_inicio_planificada} hasta={of.fecha_fin_planificada} />

                      {/* Abastecimiento bar */}
                      {totalInsumos > 0 && (
                        <div className="space-y-0.5">
                          <div className="flex justify-between text-[10px] text-slate-600">
                            <span>Abastecimiento</span>
                            <span>{insumosOk}/{totalInsumos}</span>
                          </div>
                          <div className="h-1 rounded-full bg-white/10">
                            <div
                              className={`h-full rounded-full ${abastPct === 1 ? 'bg-emerald-500' : abastPct >= 0.75 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${abastPct * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
                {items.length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-600">
                    Sin órdenes
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab Órdenes ──────────────────────────────────────────────────────────────

function TabOrdenes({ onOpenOrden }: { onOpenOrden: (id: number) => void }) {
  const [q, setQ]               = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<string>('activos');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showWizard, setShowWizard]     = useState(false);

  const estadoParam = useMemo(() => {
    if (estadoFiltro === 'activos') return undefined; // will filter client-side
    if (estadoFiltro === 'todos')   return undefined;
    return estadoFiltro;
  }, [estadoFiltro]);

  const { data: ordenes = [], isLoading, refetch } = useQuery<OrdenRow[]>({
    queryKey: ['fab-ordenes', q, estadoParam],
    queryFn:  () => Api.fabricacionOrdenes({ q: q || undefined, estado: estadoParam }),
    staleTime: 30_000,
  });

  const filtradas = useMemo(() => {
    if (estadoFiltro === 'activos') return ordenes.filter((o) => ESTADOS_ACTIVOS.includes(o.estado));
    return ordenes;
  }, [ordenes, estadoFiltro]);

  const resumen = useMemo(() => ({
    total:    ordenes.length,
    activas:  ordenes.filter((o) => ESTADOS_ACTIVOS.includes(o.estado)).length,
    hoy:      ordenes.filter((o) => {
      if (!o.fecha_fin_planificada) return false;
      const fin = new Date(o.fecha_fin_planificada);
      const now = new Date();
      return fin.toDateString() === now.toDateString();
    }).length,
  }), [ordenes]);

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Activas', value: resumen.activas, color: 'indigo' },
          { label: 'Total',   value: resumen.total,   color: 'slate' },
          { label: 'Vencen hoy', value: resumen.hoy,  color: resumen.hoy > 0 ? 'amber' : 'slate' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl px-3 py-1.5 text-xs font-semibold border bg-${color}-500/10 border-${color}-500/20 text-${color}-300`}>
            {label}: {value}
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="input-field w-full pl-9" placeholder="Buscar por número, receta, producto..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input-field" value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
          <option value="activos">Activas</option>
          <option value="todos">Todas</option>
          {Object.entries(ESTADO_CFG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          <button onClick={() => setViewMode('list')} className={`px-2.5 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-white/10 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}><List className="w-4 h-4" /></button>
          <button onClick={() => setViewMode('grid')} className={`px-2.5 py-1.5 transition-colors ${viewMode === 'grid' ? 'bg-white/10 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}><LayoutGrid className="w-4 h-4" /></button>
        </div>
        <button onClick={() => refetch()} className="btn-secondary flex items-center gap-1.5 text-sm"><RefreshCw className="w-4 h-4" /></button>
        <button onClick={() => setShowWizard(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Nueva OF
        </button>
      </div>

      {/* List / Grid */}
      {isLoading && [1, 2, 3].map((k) => <SkeletonRow key={k} />)}

      {!isLoading && filtradas.length === 0 && (
        <div className="app-card p-8 text-center">
          <Package className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No hay órdenes para mostrar.</p>
          <p className="text-sm text-slate-600 mt-1">Creá la primera con el botón "Nueva OF".</p>
        </div>
      )}

      {!isLoading && viewMode === 'list' && filtradas.length > 0 && (
        <div className="app-card overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-slate-500 text-xs uppercase tracking-wider">
                <th className="px-4 py-3">OF</th>
                <th className="px-4 py-3">Receta / Producto</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 hidden md:table-cell">Fecha fin</th>
                <th className="px-4 py-3 hidden lg:table-cell">Responsable</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((of) => (
                <tr
                  key={of.id}
                  className="border-t border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => onOpenOrden(of.id)}
                >
                  <td className="px-4 py-3 font-mono font-bold text-slate-200">{of.numero_of}</td>
                  <td className="px-4 py-3">
                    <p className="text-slate-200">{of.receta_nombre}</p>
                    {of.producto_nombre && <p className="text-xs text-slate-500">{of.producto_nombre}</p>}
                  </td>
                  <td className="px-4 py-3 text-center"><EstadoBadge estado={of.estado} /></td>
                  <td className="px-4 py-3 text-right font-data text-slate-300">{Number(of.cantidad_planificada)}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-400 text-xs">
                    {of.fecha_fin_planificada ? formatFecha(of.fecha_fin_planificada) : '—'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-slate-400 text-xs">
                    {of.responsable_nombre || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && viewMode === 'grid' && filtradas.length > 0 && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtradas.map((of) => (
            <button
              key={of.id}
              onClick={() => onOpenOrden(of.id)}
              className="app-card p-4 text-left hover:bg-white/10 hover:border-white/20 transition-all space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono font-bold text-white">{of.numero_of}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{of.receta_nombre}</p>
                </div>
                <EstadoBadge estado={of.estado} />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{Number(of.cantidad_planificada)} u.</span>
                {of.responsable_nombre && <span className="flex items-center gap-1"><User className="w-3 h-3" />{of.responsable_nombre}</span>}
              </div>
              <ProgressoTemporal desde={of.fecha_inicio_planificada} hasta={of.fecha_fin_planificada} />
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showWizard && (
          <WizardNuevaOf
            onClose={() => setShowWizard(false)}
            onCreated={(of) => { setShowWizard(false); onOpenOrden(of.id); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Tab Insumos ──────────────────────────────────────────────────────────────

type InsumoProducto = {
  id: number; nombre: string; codigo: string; descripcion?: string;
  category_id: number; category_name: string; costo_pesos: number;
  stock_quantity: number; tipo_producto: string;
};

type CategoriaItem = { id: number; nombre: string; path?: string };

function TabInsumos() {
  const toast  = useToast();
  const qc     = useQueryClient();
  const [q, setQ]                       = useState('');
  const [showForm, setShowForm]          = useState(false);
  const [editId, setEditId]             = useState<number | null>(null);

  const FORM_EMPTY = { nombre: '', codigo: '', descripcion: '', categoria_id: '', precio_costo_pesos: '', unidad: '' };
  const [form, setForm] = useState(FORM_EMPTY);

  // ── Datos ──────────────────────────────────────────────────────────────────
  const { data: insumos = [], isLoading } = useQuery<InsumoProducto[]>({
    queryKey: ['fab-insumos', q],
    queryFn:  () => Api.productos({ tipo: 'insumo', q: q || undefined, all: true }),
    staleTime: 30_000,
  });

  const { data: categorias = [] } = useQuery<CategoriaItem[]>({
    queryKey: ['categorias-flat'],
    queryFn:  () => Api.categorias(),
    staleTime: 120_000,
  });

  // ── Mutaciones ─────────────────────────────────────────────────────────────
  const mutCrear = useMutation({
    mutationFn: (body: any) => Api.crearProducto(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fab-insumos'] });
      toast.success('Insumo creado');
      setShowForm(false);
      setForm(FORM_EMPTY);
    },
    onError: (e: any) => toast.error(e.message || 'Error al crear insumo'),
  });

  const mutEditar = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => Api.actualizarProducto(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fab-insumos'] });
      toast.success('Insumo actualizado');
      setEditId(null);
      setForm(FORM_EMPTY);
    },
    onError: (e: any) => toast.error(e.message || 'Error al actualizar'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!form.categoria_id) { toast.error('Seleccioná una categoría'); return; }
    const body = {
      name:              form.nombre.trim(),
      description:       form.descripcion.trim() || undefined,
      codigo:            form.codigo.trim() || undefined,
      category_id:       Number(form.categoria_id),
      precio_costo_pesos: Number(form.precio_costo_pesos) || 0,
      price:             0,
      tipo_producto:     'insumo',
    };
    if (editId != null) {
      mutEditar.mutate({ id: editId, body });
    } else {
      mutCrear.mutate(body);
    }
  }

  function startEdit(ins: InsumoProducto) {
    setEditId(ins.id);
    setForm({
      nombre:             ins.nombre,
      codigo:             ins.codigo,
      descripcion:        ins.descripcion || '',
      categoria_id:       String(ins.category_id),
      precio_costo_pesos: String(ins.costo_pesos || 0),
      unidad:             '',
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
    setForm(FORM_EMPTY);
  }

  const filtered = q
    ? insumos.filter((i) =>
        i.nombre.toLowerCase().includes(q.toLowerCase()) ||
        i.codigo.toLowerCase().includes(q.toLowerCase())
      )
    : insumos;

  const isPending = mutCrear.isPending || mutEditar.isPending;

  return (
    <div className="space-y-4">

      {/* Barra de herramientas */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar insumo..."
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
          Nuevo insumo
        </button>
      </div>

      {/* Formulario de creación / edición */}
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
                  {editId != null ? 'Editar insumo' : 'Nuevo insumo de fabricación'}
                </p>
                <button type="button" onClick={cancelForm} className="text-slate-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Nombre <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    className="input-field text-sm w-full"
                    placeholder="Ej: Resina epoxi, Hilo de cobre..."
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Código / SKU <span className="text-slate-600">(opcional)</span></label>
                  <input
                    type="text"
                    className="input-field text-sm w-full"
                    placeholder="Se genera automáticamente si no indicás"
                    value={form.codigo}
                    onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Categoría <span className="text-red-400">*</span></label>
                  <select
                    className="input-field text-sm w-full"
                    value={form.categoria_id}
                    onChange={(e) => setForm((f) => ({ ...f, categoria_id: e.target.value }))}
                  >
                    <option value="">Seleccionar categoría...</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>{c.path || c.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Costo unitario (ARS)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-field text-sm w-full"
                    placeholder="0.00"
                    value={form.precio_costo_pesos}
                    onChange={(e) => setForm((f) => ({ ...f, precio_costo_pesos: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs text-slate-400">Descripción</label>
                  <input
                    type="text"
                    className="input-field text-sm w-full"
                    placeholder="Descripción opcional..."
                    value={form.descripcion}
                    onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={cancelForm} className="btn-secondary text-sm">
                  Cancelar
                </button>
                <button type="submit" disabled={isPending} className="btn-primary text-sm flex items-center gap-1.5">
                  {isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {editId != null ? 'Guardar cambios' : 'Crear insumo'}
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
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              {q ? 'No se encontraron insumos con ese término.' : 'No hay insumos creados aún.'}
            </p>
            {!q && (
              <p className="text-xs text-slate-600 mt-1">
                Los insumos son las materias primas que usás en tus recetas de fabricación.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 border-b border-white/10">
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Insumo</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-right">Costo unitario</th>
                  <th className="px-4 py-3 text-right">Stock actual</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((ins) => (
                  <tr key={ins.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-slate-100 font-medium">{ins.nombre}</p>
                      <p className="text-xs text-slate-500 font-mono">{ins.codigo}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{ins.category_name}</td>
                    <td className="px-4 py-3 text-right font-data text-slate-300">
                      {ins.costo_pesos > 0 ? formatARS(ins.costo_pesos) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-data font-semibold ${
                        ins.stock_quantity <= 0 ? 'text-red-400' :
                        ins.stock_quantity < 5  ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {Number(ins.stock_quantity).toLocaleString('es-AR')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => startEdit(ins)}
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

      {/* Info box */}
      <div className="rounded-xl bg-white/3 border border-white/8 px-4 py-3 flex items-start gap-3">
        <Package className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">
          Los insumos están integrados al sistema de stock: se descuentan automáticamente cuando finalizás una orden de fabricación,
          y podés comprarlos desde el módulo de <strong className="text-slate-400">Compras</strong> como cualquier otro producto.
        </p>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

type TabKey = 'ordenes' | 'recetas' | 'tablero' | 'insumos';

export default function Fabricacion() {
  const [tab, setTab]       = useState<TabKey>('ordenes');
  const [modalOfId, setModalOfId] = useState<number | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'ordenes',  label: 'Órdenes de Fabricación', icon: <ClipboardList className="w-4 h-4" /> },
    { key: 'recetas',  label: 'Recetas',                 icon: <FlaskConical  className="w-4 h-4" /> },
    { key: 'tablero',  label: 'Tablero de Producción',   icon: <LayoutGrid    className="w-4 h-4" /> },
    { key: 'insumos',  label: 'Insumos',                 icon: <Package       className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <h1 className="app-title">Fabricación</h1>
          <p className="app-subtitle">Gestión de órdenes de producción, recetas y trazabilidad de insumos.</p>
        </div>
        <button
          onClick={() => setShowTutorial((v) => !v)}
          className="btn-secondary flex items-center gap-1.5 text-sm self-start xl:self-auto"
        >
          <BookOpen className="w-4 h-4" />
          <span className="hidden sm:inline">¿Cómo se usa?</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTutorial ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Tutorial */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="app-card p-5 border-indigo-500/30 bg-indigo-500/5 space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                  <FlaskConical className="w-4 h-4 text-indigo-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100 mb-1">¿Para qué sirve Fabricación?</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Te permite gestionar el proceso de producción de principio a fin: definís las <strong className="text-slate-200">recetas</strong> (qué insumos necesitás para cada producto),
                    creás <strong className="text-slate-200">órdenes de fabricación</strong>, verificás el stock disponible antes de empezar y cuando terminás,
                    el sistema descuenta automáticamente los insumos y agrega el producto terminado al inventario.
                  </p>
                </div>
              </div>
              <hr className="border-white/10" />
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { emoji: '📋', titulo: '1. Creá la receta', desc: 'Define los insumos y cantidades necesarias para fabricar una unidad del producto. Una vez creada, puede reutilizarse en múltiples órdenes.' },
                  { emoji: '⚙️', titulo: '2. Abrí una orden (OF)', desc: 'Indicá qué receta y cuántas unidades querés producir. El sistema te muestra si tenés stock suficiente antes de confirmar.' },
                  { emoji: '✅', titulo: '3. Finalizá la producción', desc: 'Cuando terminás, el sistema descuenta los insumos del stock y agrega el producto terminado. Todo queda registrado con historial.' },
                ].map(({ emoji, titulo, desc }) => (
                  <div key={titulo} className="rounded-xl p-4 bg-white/5 border border-white/10 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{emoji}</span>
                      <span className="text-sm font-semibold text-slate-200">{titulo}</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
              <hr className="border-white/10" />
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Estados de una orden</p>
                  {Object.entries(ESTADO_CFG).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="text-base">{v.emoji}</span>
                      <div>
                        <span className="text-xs font-semibold text-slate-200">{v.label}</span>
                        <span className="text-xs text-slate-500 ml-1.5">— {v.descripcion}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Consejos</p>
                  {[
                    { icon: '💡', titulo: 'Calculá el costo antes de producir', desc: 'En la pestaña Recetas, usá "Recalcular costo" para ver el costo actual basado en los precios de compra.' },
                    { icon: '📦', titulo: 'Analizá el abastecimiento', desc: 'Antes de iniciar la producción, revisá la pestaña Abastecimiento en el detalle de la orden.' },
                    { icon: '📋', titulo: 'Usá la planilla para ajustes', desc: 'Si consumiste cantidades distintas a las planificadas, cargalas en la planilla antes de finalizar.' },
                  ].map(({ icon, titulo, desc }) => (
                    <div key={titulo} className="flex gap-2">
                      <span className="text-base shrink-0">{icon}</span>
                      <div>
                        <p className="text-xs font-medium text-slate-200">{titulo}</p>
                        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={() => setShowTutorial(false)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
                  Cerrar guía <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-white/10 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-all shrink-0 ${
              tab === t.key
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'ordenes'  && <TabOrdenes  onOpenOrden={(id) => setModalOfId(id)} />}
      {tab === 'recetas'  && <TabRecetas />}
      {tab === 'tablero'  && <TabTablero  onOpenOrden={(id) => setModalOfId(id)} />}
      {tab === 'insumos'  && <TabInsumos />}

      {/* Modal */}
      <AnimatePresence>
        {modalOfId != null && (
          <ModalOrden ofId={modalOfId} onClose={() => setModalOfId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
