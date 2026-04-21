import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, TrendingUp, Clock, Users, RefreshCw, Settings, Plus, Edit2, Check, X } from 'lucide-react';
import { Api } from '../lib/api';
import { getRoleFromToken, getUserIdFromToken } from '../lib/auth';
import { useAuth } from '../context/AuthContext';
import VendedorSelector from '../components/VendedorSelector';

// ──────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────
interface RankingRow {
  id: number;
  nombre: string;
  color: string;
  emoji: string | null;
  total_ventas: number;
  monto_total: string | number;
  neto_total: string | number;
  ultima_venta: string | null;
}

interface RecentSale {
  id: number;
  usuario_id: number;
  fecha: string;
  total: string | number;
  vendedor_nombre: string | null;
  color: string | null;
  emoji: string | null;
  cliente_nombre: string | null;
}

interface PerfilForm {
  nombre: string;
  color: string;
  emoji: string;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
const fmt = (n: string | number) =>
  Number(n).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 });

const PERIODS = [
  { label: 'Hoy', key: 'today' },
  { label: 'Esta semana', key: 'week' },
  { label: 'Este mes', key: 'month' },
  { label: 'Todo', key: 'all' },
] as const;

type PeriodKey = (typeof PERIODS)[number]['key'];

function getPeriodDates(period: PeriodKey): { desde?: string; hasta?: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (period === 'today') {
    const today = iso(now);
    return { desde: today, hasta: today };
  }
  if (period === 'week') {
    const day = now.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const mon = new Date(now);
    mon.setDate(now.getDate() + diff);
    return { desde: iso(mon), hasta: iso(now) };
  }
  if (period === 'month') {
    return { desde: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, hasta: iso(now) };
  }
  return {};
}

const MEDAL: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' };

const PRESET_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16',
];

// ──────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────
export default function Rankings() {
  const { accessToken } = useAuth();
  const role = getRoleFromToken(accessToken);
  const currentUserId = getUserIdFromToken(accessToken);
  const isAdmin = role === 'admin';

  const [period, setPeriod] = useState<PeriodKey>('month');
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [recientes, setRecientes] = useState<RecentSale[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(false);
  const [loadingRecientes, setLoadingRecientes] = useState(false);
  const [tab, setTab] = useState<'ranking' | 'recientes' | 'vendedores'>('ranking');

  // Admin — gestión de perfiles
  const [perfiles, setPerfiles] = useState<any[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PerfilForm>({ nombre: '', color: '#6366f1', emoji: '' });
  const [saving, setSaving] = useState(false);

  const loadRanking = useCallback(async () => {
    setLoadingRanking(true);
    try {
      const dates = getPeriodDates(period);
      const data = await Api.rankingVendedores(dates);
      setRanking(Array.isArray(data) ? data : []);
    } catch {
      setRanking([]);
    } finally {
      setLoadingRanking(false);
    }
  }, [period]);

  const loadRecientes = useCallback(async () => {
    setLoadingRecientes(true);
    try {
      const data = await Api.ventasRecientesVendedor(20);
      setRecientes(Array.isArray(data) ? data : []);
    } catch {
      setRecientes([]);
    } finally {
      setLoadingRecientes(false);
    }
  }, []);

  const loadPerfiles = useCallback(async () => {
    try {
      const data = await Api.vendedorPerfiles({ inactivos: true });
      setPerfiles(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  useEffect(() => {
    if (tab === 'ranking') loadRanking();
    else if (tab === 'recientes') loadRecientes();
    else if (tab === 'vendedores' && isAdmin) loadPerfiles();
  }, [tab, loadRanking, loadRecientes, loadPerfiles, isAdmin]);

  // Re-cargar ranking cuando cambia el período
  useEffect(() => {
    if (tab === 'ranking') loadRanking();
  }, [period]); // eslint-disable-line

  // ── Guardar perfil (nuevo o edición) ──
  const handleSavePerfil = async () => {
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      const body = {
        nombre: form.nombre.trim(),
        color: form.color,
        emoji: form.emoji || null,
      };
      if (editingId) {
        await Api.actualizarVendedorPerfil(editingId, body);
      } else {
        await Api.crearVendedorPerfil(body);
      }
      setShowNewForm(false);
      setEditingId(null);
      setForm({ nombre: '', color: '#6366f1', emoji: '' });
      loadPerfiles();
    } catch {
      // silencioso por ahora
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setForm({ nombre: p.nombre, color: p.color, emoji: p.emoji || '' });
    setShowNewForm(true);
  };

  const toggleActivo = async (p: any) => {
    try {
      await Api.actualizarVendedorPerfil(p.id, { activo: !p.activo });
      loadPerfiles();
    } catch {}
  };

  const maxMonto = ranking.length ? Math.max(...ranking.map(r => Number(r.monto_total) || 0), 1) : 1;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="w-7 h-7 text-yellow-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Rankings de Vendedores</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Comparativa de rendimiento del equipo</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {([
          { key: 'ranking', label: 'Ranking', icon: Trophy },
          { key: 'recientes', label: 'Recientes', icon: Clock },
          ...(isAdmin ? [{ key: 'vendedores', label: 'Gestionar', icon: Settings }] : []),
        ] as { key: string; label: string; icon: any }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: RANKING ── */}
      {tab === 'ranking' && (
        <div className="space-y-4">
          {/* Filtro de período */}
          <div className="flex gap-2 flex-wrap">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${period === p.key ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-300'}`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={loadRanking}
              className="ml-auto p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Recargar"
            >
              <RefreshCw className={`w-4 h-4 ${loadingRanking ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Lista de ranking */}
          {loadingRanking ? (
            <div className="py-12 text-center text-gray-400">Cargando ranking...</div>
          ) : ranking.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No hay datos para el período seleccionado</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {ranking.map((row, i) => (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden"
                  >
                    <div className="flex items-center gap-3 p-4">
                      {/* Puesto */}
                      <div className="w-8 text-center text-lg">{MEDAL[i] ?? `#${i + 1}`}</div>

                      {/* Avatar */}
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
                        style={{ backgroundColor: (row.color || '#6366f1') + '33' }}
                      >
                        {row.emoji || '👤'}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 dark:text-white truncate">{row.nombre}</p>
                          {currentUserId != null && currentUserId === row.id && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: row.color + '22', color: row.color }}>Tú</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{row.total_ventas} {Number(row.total_ventas) === 1 ? 'venta' : 'ventas'}</p>
                        {/* Barra de progreso */}
                        <div className="mt-1.5 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${(Number(row.monto_total) / maxMonto) * 100}%`, backgroundColor: row.color || '#6366f1' }}
                          />
                        </div>
                      </div>

                      {/* Monto */}
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900 dark:text-white text-sm">{fmt(row.monto_total)}</p>
                        <p className="text-xs text-gray-400">neto {fmt(row.neto_total)}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: RECIENTES ── */}
      {tab === 'recientes' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <TrendingUp className="w-4 h-4" />
              Ultimas ventas registradas
            </div>
            <button
              onClick={loadRecientes}
              className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <RefreshCw className={`w-4 h-4 ${loadingRecientes ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingRecientes ? (
            <div className="py-12 text-center text-gray-400">Cargando...</div>
          ) : recientes.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>Aun no hay ventas registradas</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recientes.map((sale, i) => (
                <motion.div
                  key={sale.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700"
                >
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0"
                    style={{ backgroundColor: (sale.color || '#6366f1') + '33' }}
                  >
                    {sale.emoji || '👤'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {sale.vendedor_nombre || 'Vendedor desconocido'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{sale.cliente_nombre || 'Cliente'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmt(sale.total)}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(sale.fecha).toLocaleDateString('es-AR')}
                      {currentUserId != null && currentUserId === sale.usuario_id ? ' · Tu venta' : ''}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: GESTIONAR (admin) ── */}
      {tab === 'vendedores' && isAdmin && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Users className="w-4 h-4" />
              Perfiles de vendedor
            </div>
            <button
              onClick={() => {
                setEditingId(null);
                setForm({ nombre: '', color: '#6366f1', emoji: '' });
                setShowNewForm(v => !v);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuevo perfil
            </button>
          </div>

          {/* Formulario nuevo/edición */}
          <AnimatePresence>
            {showNewForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-indigo-50 dark:bg-gray-800 border border-indigo-100 dark:border-gray-700 rounded-xl p-4 space-y-3">
                  <p className="font-semibold text-sm text-gray-700 dark:text-gray-200">
                    {editingId ? 'Editar perfil' : 'Nuevo perfil de vendedor'}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
                      <input
                        className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        value={form.nombre}
                        onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                        placeholder="ej: María"
                        maxLength={100}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Emoji (opcional)</label>
                      <input
                        className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        value={form.emoji}
                        onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
                        placeholder="🏆"
                        maxLength={10}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Color</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setForm(f => ({ ...f, color: c }))}
                          className="w-7 h-7 rounded-full border-2 transition-all"
                          style={{ backgroundColor: c, borderColor: form.color === c ? '#000' : 'transparent' }}
                        />
                      ))}
                      <input
                        type="color"
                        className="w-7 h-7 rounded-full border border-gray-300 cursor-pointer"
                        value={form.color}
                        onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                        title="Color personalizado"
                      />
                    </div>
                  </div>
                  {/* Preview */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">Preview:</span>
                    <span
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full font-medium text-sm"
                      style={{ backgroundColor: form.color + '22', color: form.color, border: `1.5px solid ${form.color}` }}
                    >
                      {form.emoji || '👤'} {form.nombre || 'Nombre'}
                    </span>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setShowNewForm(false); setEditingId(null); }}
                      className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleSavePerfil}
                      disabled={saving || !form.nombre.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      {editingId ? 'Guardar cambios' : 'Crear perfil'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Lista de perfiles */}
          <div className="space-y-2">
            {perfiles.length === 0 && (
              <div className="py-8 text-center text-gray-400 text-sm">No hay perfiles creados</div>
            )}
            {perfiles.map(p => (
              <div
                key={p.id}
                className={`flex items-center gap-3 bg-white dark:bg-gray-800 border rounded-xl p-3 ${!p.activo ? 'opacity-50' : 'border-gray-100 dark:border-gray-700'}`}
              >
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0"
                  style={{ backgroundColor: (p.color || '#6366f1') + '33' }}
                >
                  {p.emoji || '👤'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white text-sm">{p.nombre}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-xs text-gray-400">{p.color}</span>
                    {!p.activo && <span className="text-xs text-red-400 font-medium">· Inactivo</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(p)}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleActivo(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${p.activo ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400' : 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400'}`}
                  >
                    {p.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />

          {/* Selector activo en esta sesión */}
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Selector de vendedor para esta sesión
            </p>
            <VendedorSelector variant="full" />
          </div>
        </div>
      )}
    </div>
  );
}
