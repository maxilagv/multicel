import { useEffect, useMemo, useState } from 'react';
import ChartCard from '../ui/ChartCard';
import DataTable from '../ui/DataTable';
import Skeleton from '../ui/Skeleton';
import Button from '../ui/Button';
import Alert from '../components/Alert';
import { useLicense } from '../context/LicenseContext';
import { hasFeature } from '../lib/features';
import { Api } from '../lib/api';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

type Oportunidad = { id: number; cliente_id: number; cliente_nombre: string; titulo: string; fase: string; valor_estimado: number; probabilidad: number; fecha_cierre_estimada?: string; oculto?: boolean };
type Actividad = { id: number; tipo: string; asunto: string; descripcion?: string; fecha_hora?: string; estado: string; cliente_nombre?: string; cliente_id?: number; oportunidad_id?: number };
type CrmAnalisis = {
  fases: { fase: string; cantidad: number; valor_total: number }[];
  conversiones: { de: string; a: string; tasa: number; tiempo_promedio_dias: number | null }[];
};
type OppSortKey = keyof Pick<Oportunidad, 'titulo' | 'cliente_nombre' | 'fase' | 'valor_estimado' | 'probabilidad' | 'fecha_cierre_estimada'>;
type ActSortKey = keyof Pick<Actividad, 'tipo' | 'asunto' | 'cliente_nombre' | 'fecha_hora' | 'estado'>;
type SortState<K extends string> = { key: K; dir: 'asc' | 'desc' };

export default function CRM() {
  const { status: licenseStatus } = useLicense();
  const aiEnabled = hasFeature(licenseStatus, 'ai');
  const [fase, setFase] = useState<string>('');
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [clientes, setClientes] = useState<{ id: number; nombre: string; apellido?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI: crear oportunidad
  const [showOppForm, setShowOppForm] = useState(false);
  const [oppForm, setOppForm] = useState({
    cliente_id: '',
    titulo: '',
    fase: 'lead',
    valor_estimado: '',
    probabilidad: '',
    fecha_cierre_estimada: '',
  });
  const [oppError, setOppError] = useState<string | null>(null);

  // UI: crear actividad
  const [showActForm, setShowActForm] = useState(false);
  const [actForm, setActForm] = useState({
    tipo: 'llamada',
    asunto: '',
    descripcion: '',
    fecha_hora: '',
    estado: 'pendiente',
    cliente_id: '',
    oportunidad_id: '',
  });
  const [actError, setActError] = useState<string | null>(null);

  // Ordenamiento
  const [oppSort, setOppSort] = useState<SortState<OppSortKey>>({ key: 'valor_estimado', dir: 'desc' });
  const [actSort, setActSort] = useState<SortState<ActSortKey>>({ key: 'fecha_hora', dir: 'asc' });

  // Análisis
  const [analisis, setAnalisis] = useState<CrmAnalisis | null>(null);
  const [analisisLoading, setAnalisisLoading] = useState(false);
  const [analisisError, setAnalisisError] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiSuggestionError, setAiSuggestionError] = useState<string | null>(null);
  const [aiSuggestionLoading, setAiSuggestionLoading] = useState(false);
  const [aiOpp, setAiOpp] = useState<Oportunidad | null>(null);

  async function loadData(selectedPhase: string) {
    setLoading(true);
    setError(null);
    setAnalisisError(null);
    try {
      const anaPromise = Api.crmAnalisis().catch((e: any) => {
        setAnalisisError(e?.message || 'No se pudo cargar el análisis de CRM');
        return null;
      });
      const [ops, acts, cls, ana] = await Promise.all([
        Api.oportunidades({ fase: selectedPhase || undefined, limit: 100 }),
        Api.actividades({ estado: 'pendiente', limit: 100 }),
        Api.clientes({ estado: 'activo', all: true }),
        anaPromise,
      ]);
      setOportunidades(ops || []);
      setActividades(acts || []);
      setClientes((cls || []).map((c: any) => ({ id: c.id, nombre: c.nombre, apellido: c.apellido })));
      if (ana) setAnalisis(ana);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar datos de CRM');
    } finally {
      setLoading(false);
      setAnalisisLoading(false);
    }
  }

  useEffect(() => {
    setAnalisisLoading(true);
    loadData(fase);
  }, [fase]);

  async function ocultarOportunidad(o: Oportunidad) {
    if (!window.confirm('¿Ocultar esta oportunidad del listado?')) return;
    try {
      await Api.actualizarOportunidad(o.id, { oculto: true });
      setOportunidades(prev => prev.filter(op => op.id !== o.id));
    } catch (e: any) {
      // Fallback sencillo; en este flujo no hay Alert dedicado
      alert(e?.message || 'No se pudo ocultar la oportunidad');
    }
  }

  async function crearOportunidad() {
    setOppError(null);
    const body: any = {
      cliente_id: oppForm.cliente_id ? Number(oppForm.cliente_id) : undefined,
      titulo: oppForm.titulo.trim(),
      fase: oppForm.fase || undefined,
      valor_estimado: oppForm.valor_estimado !== '' ? Number(oppForm.valor_estimado) : undefined,
      probabilidad: oppForm.probabilidad !== '' ? Number(oppForm.probabilidad) : undefined,
      fecha_cierre_estimada: oppForm.fecha_cierre_estimada ? new Date(oppForm.fecha_cierre_estimada).toISOString().slice(0, 10) : undefined,
    };
    if (!body.cliente_id || !body.titulo) {
      setOppError('Selecciona un cliente y agrega un título');
      return;
    }
    try {
      await Api.crearOportunidad(body);
      setOppForm({ cliente_id: '', titulo: '', fase: 'lead', valor_estimado: '', probabilidad: '', fecha_cierre_estimada: '' });
      setShowOppForm(false);
      // recargar lista
      const ops = await Api.oportunidades({ fase: fase || undefined, limit: 50 });
      setOportunidades(ops || []);
    } catch (e: any) {
      setOppError(e?.message || 'No se pudo crear la oportunidad');
    }
  }

  async function crearActividad() {
    setActError(null);
    const body: any = {
      tipo: actForm.tipo,
      asunto: actForm.asunto.trim(),
      descripcion: actForm.descripcion.trim() || undefined,
      fecha_hora: actForm.fecha_hora ? new Date(actForm.fecha_hora).toISOString() : undefined,
      estado: actForm.estado || 'pendiente',
      cliente_id: actForm.cliente_id ? Number(actForm.cliente_id) : undefined,
      oportunidad_id: actForm.oportunidad_id ? Number(actForm.oportunidad_id) : undefined,
    };
    if (!body.tipo || !body.asunto) {
      setActError('Selecciona tipo y escribe un asunto');
      return;
    }
    try {
      await Api.crearActividad(body);
      setActForm({ tipo: 'llamada', asunto: '', descripcion: '', fecha_hora: '', estado: 'pendiente', cliente_id: '', oportunidad_id: '' });
      setShowActForm(false);
      const acts = await Api.actividades({ estado: 'pendiente', limit: 50 });
      setActividades(acts || []);
    } catch (e: any) {
      setActError(e?.message || 'No se pudo crear la actividad');
    }
  }

  async function generarSugerencia(o: Oportunidad) {
    setAiSuggestionError(null);
    setAiSuggestion(null);
    setAiOpp(o);
    if (!aiEnabled) {
      setAiSuggestionError('IA no habilitada en la licencia.');
      return;
    }
    setAiSuggestionLoading(true);
    try {
      const resp: any = await Api.crmSuggestion(o.id);
      setAiSuggestion(resp?.suggestion || 'Sin sugerencia disponible.');
    } catch (e: any) {
      setAiSuggestionError(e?.message || 'No se pudo generar la sugerencia con IA');
    } finally {
      setAiSuggestionLoading(false);
    }
  }

  const fases = ['lead','contacto','propuesta','negociacion','ganado','perdido'];

  function toggleSort<K extends string>(state: SortState<K>, key: K, setter: (s: SortState<K>) => void) {
    if (state.key === key) setter({ key, dir: state.dir === 'asc' ? 'desc' : 'asc' });
    else setter({ key, dir: 'asc' });
  }

  function sortList<T, K extends string>(rows: T[], state: SortState<K>): T[] {
    const { key, dir } = state;
    const mult = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a: any, b: any) => {
      const va = a[key];
      const vb = b[key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (key === 'fecha_cierre_estimada' || key === 'fecha_hora') {
        const ta = va ? new Date(va).getTime() : 0;
        const tb = vb ? new Date(vb).getTime() : 0;
        return (ta - tb) * mult;
      }
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult;
      return String(va).localeCompare(String(vb)) * mult;
    });
  }

  const sortedOpps = useMemo(() => sortList<Oportunidad, OppSortKey>(oportunidades, oppSort), [oportunidades, oppSort]);
  const visibleOpps = useMemo(() => sortedOpps.filter(o => !o.oculto), [sortedOpps]);
  const sortedActs = useMemo(() => sortList<Actividad, ActSortKey>(actividades, actSort), [actividades, actSort]);

  const funnelData = useMemo(() => {
    if (!analisis) return [];
    return fases.map(f => {
      const row = analisis.fases.find(x => x.fase === f);
      return {
        fase: f,
        cantidad: row ? row.cantidad : 0,
        valor_total: row ? row.valor_total : 0,
      };
    });
  }, [analisis]);

  return (
    <div className="space-y-6">
      <div>
        <div className="app-title">CRM</div>
        <div className="app-subtitle">Embudo, actividades y recomendaciones</div>
      </div>
      <ChartCard title="Embudo de oportunidades" right={
        <div className="flex items-center gap-2">
          <select value={fase} onChange={(e) => setFase(e.target.value)} className="input-modern text-sm">
            <option value="">Todas</option>
            {fases.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <button onClick={() => setShowOppForm(s => !s)} className="px-2 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/30 text-primary-200 text-xs">
            {showOppForm ? 'Cancelar' : 'Nueva oportunidad'}
          </button>
        </div>
      }>
        {showOppForm && (
          <div className="mb-4 p-3 app-panel">
            {oppError && <div className="mb-2 text-rose-300 text-sm">{oppError}</div>}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
              <select value={oppForm.cliente_id} onChange={(e)=>setOppForm({...oppForm, cliente_id: e.target.value})} className="input-modern text-sm">
                <option value="">Cliente</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.apellido?` ${c.apellido}`:''}</option>)}
              </select>
              <input value={oppForm.titulo} onChange={(e)=>setOppForm({...oppForm, titulo: e.target.value})} placeholder="Título" className="input-modern text-sm md:col-span-2" />
              <select value={oppForm.fase} onChange={(e)=>setOppForm({...oppForm, fase: e.target.value})} className="input-modern text-sm">
                {fases.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <input type="number" placeholder="Valor estimado" value={oppForm.valor_estimado} onChange={(e)=>setOppForm({...oppForm, valor_estimado: e.target.value})} className="input-modern text-sm" />
              <input type="number" placeholder="Probabilidad %" value={oppForm.probabilidad} onChange={(e)=>setOppForm({...oppForm, probabilidad: e.target.value})} className="input-modern text-sm" />
              <input type="date" value={oppForm.fecha_cierre_estimada} onChange={(e)=>setOppForm({...oppForm, fecha_cierre_estimada: e.target.value})} className="input-modern text-sm" />
            </div>
            <div className="mt-3 flex justify-end">
              <button onClick={crearOportunidad} className="px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-200 text-sm">Crear</button>
            </div>
          </div>
        )}
        <DataTable headers={
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-2 px-2">Oportunidad</th>
              <th className="py-2 px-2">Cliente</th>
              <th className="py-2 px-2">Fase</th>
              <th className="py-2 px-2">Valor</th>
              <th className="py-2 px-2">Probabilidad</th>
              <th className="py-2 px-2">Cierre est.</th>
              <th className="py-2 px-2">Acciones</th>
            </tr>
          </thead>
        }>
          <tbody className="text-slate-200">
            {(loading ? [] : visibleOpps).map((o) => (
              <tr key={o.id} className="border-t border-white/10 hover:bg-white/5">
                <td className="py-2 px-2">{o.titulo}</td>
                <td className="py-2 px-2">{o.cliente_nombre}</td>
                <td className="py-2 px-2">{o.fase}</td>
                <td className="py-2 px-2">{"$" + (o.valor_estimado || 0).toFixed(0)}</td>
                <td className="py-2 px-2">{o.probabilidad}%</td>
                <td className="py-2 px-2">{o.fecha_cierre_estimada ? new Date(o.fecha_cierre_estimada).toLocaleDateString() : '-'}</td>
                <td className="py-2 px-2">
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => generarSugerencia(o)}
                      className={`px-2 py-1 rounded border text-xs ${
                        aiEnabled
                          ? 'bg-primary-500/20 border-primary-500/30 hover:bg-primary-500/30 text-primary-200'
                          : 'bg-white/5 border-white/10 text-slate-500 cursor-not-allowed'
                      }`}
                      disabled={!aiEnabled}
                      title={aiEnabled ? 'Generar sugerencia con IA' : 'IA no habilitada'}
                    >
                      Sugerencia IA
                    </button>
                    {(o.fase === 'ganado' || o.fase === 'perdido') && (
                      <button
                        onClick={() => ocultarOportunidad(o)}
                        className="px-2 py-1 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-slate-200 text-xs"
                      >
                        Ocultar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && visibleOpps.length === 0 && (
              <tr><td className="py-3 px-2 text-slate-400" colSpan={7}>Sin oportunidades</td></tr>
            )}
          </tbody>
        </DataTable>
      </ChartCard>

      <ChartCard title="Sugerencia IA">
        {!aiEnabled && (
          <div className="text-sm text-slate-400">
            La IA esta disponible desde el plan Pro.
          </div>
        )}
        {aiEnabled && (
          <div className="space-y-2">
            <div className="text-xs text-slate-400">
              {aiOpp ? `Oportunidad: ${aiOpp.titulo}` : 'Selecciona una oportunidad y genera una sugerencia.'}
            </div>
            {aiSuggestionLoading && <div className="text-sm text-slate-300">Generando sugerencia...</div>}
            {aiSuggestionError && <Alert kind="error" message={aiSuggestionError} />}
            {!aiSuggestionLoading && !aiSuggestionError && aiSuggestion && (
              <div className="text-sm text-slate-200 whitespace-pre-line">{aiSuggestion}</div>
            )}
            {!aiSuggestionLoading && !aiSuggestionError && !aiSuggestion && (
              <div className="text-sm text-slate-500">Sin sugerencia aun.</div>
            )}
          </div>
        )}
      </ChartCard>

      <ChartCard title="Actividades pendientes" right={
        <button onClick={() => setShowActForm(s => !s)} className="px-2 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/30 text-primary-200 text-xs">
          {showActForm ? 'Cancelar' : 'Nueva actividad'}
        </button>
      }>
        {showActForm && (
          <div className="mb-4 p-3 app-panel">
            {actError && <div className="mb-2 text-rose-300 text-sm">{actError}</div>}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
              <select value={actForm.tipo} onChange={(e)=>setActForm({...actForm, tipo: e.target.value})} className="input-modern text-sm">
                {['llamada','reunion','tarea'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={actForm.asunto} onChange={(e)=>setActForm({...actForm, asunto: e.target.value})} placeholder="Asunto" className="input-modern text-sm md:col-span-2" />
              <select value={actForm.estado} onChange={(e)=>setActForm({...actForm, estado: e.target.value})} className="input-modern text-sm">
                {['pendiente','completado','cancelado'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input type="datetime-local" value={actForm.fecha_hora} onChange={(e)=>setActForm({...actForm, fecha_hora: e.target.value})} className="input-modern text-sm" />
              <input value={actForm.descripcion} onChange={(e)=>setActForm({...actForm, descripcion: e.target.value})} placeholder="Descripción (opcional)" className="input-modern text-sm md:col-span-3" />
              <select value={actForm.cliente_id} onChange={(e)=>setActForm({...actForm, cliente_id: e.target.value})} className="input-modern text-sm">
                <option value="">Cliente (opcional)</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.apellido?` ${c.apellido}`:''}</option>)}
              </select>
              <select value={actForm.oportunidad_id} onChange={(e)=>setActForm({...actForm, oportunidad_id: e.target.value})} className="input-modern text-sm">
                <option value="">Oportunidad (opcional)</option>
                {visibleOpps.map(o => <option key={o.id} value={o.id}>{o.titulo}</option>)}
              </select>
            </div>
            <div className="mt-3 flex justify-end">
              <button onClick={crearActividad} className="px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-200 text-sm">Crear</button>
            </div>
          </div>
        )}
        <DataTable headers={
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-2 px-2">Tipo</th>
              <th className="py-2 px-2">Asunto</th>
              <th className="py-2 px-2">Cliente</th>
              <th className="py-2 px-2">Fecha</th>
              <th className="py-2 px-2">Estado</th>
            </tr>
          </thead>
        }>
          <tbody className="text-slate-200">
            {(loading ? [] : actividades).map((a) => (
              <tr key={a.id} className="border-t border-white/10 hover:bg-white/5">
                <td className="py-2 px-2">{a.tipo}</td>
                <td className="py-2 px-2">{a.asunto}</td>
                <td className="py-2 px-2">{a.cliente_nombre || '-'}</td>
                <td className="py-2 px-2">{a.fecha_hora ? new Date(a.fecha_hora).toLocaleString() : '-'}</td>
                <td className="py-2 px-2">{a.estado}</td>
              </tr>
            ))}
            {!loading && actividades.length === 0 && (
              <tr><td className="py-3 px-2 text-slate-400" colSpan={5}>Sin actividades</td></tr>
            )}
          </tbody>
        </DataTable>
      </ChartCard>

      <ChartCard title="Análisis de conversiones">
        {analisisError && <Alert kind="error" message={analisisError} />}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64">
            {analisisLoading ? (
              <Skeleton className="h-full w-full" />
            ) : !analisis || funnelData.every(f => f.cantidad === 0 && f.valor_total === 0) ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                Sin datos suficientes para el análisis.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData}>
                  <XAxis dataKey="fase" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="cantidad" fill="#6366f1" name="Oportunidades" />
                  <Bar dataKey="valor_total" fill="#22c55e" name="Valor total" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="overflow-x-auto">
            {analisisLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-400">
                  <tr>
                    <th className="py-2 px-2">De</th>
                    <th className="py-2 px-2">A</th>
                    <th className="py-2 px-2">Tasa</th>
                    <th className="py-2 px-2">Tiempo prom. (días)</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {analisis && analisis.conversiones.map((c, i) => (
                    <tr key={i} className="border-t border-white/10 hover:bg-white/5">
                      <td className="py-2 px-2">{c.de}</td>
                      <td className="py-2 px-2">{c.a}</td>
                      <td className="py-2 px-2">{(c.tasa * 100).toFixed(1)}%</td>
                      <td className="py-2 px-2">
                        {c.tiempo_promedio_dias != null ? c.tiempo_promedio_dias.toFixed(1) : '-'}
                      </td>
                    </tr>
                  ))}
                  {analisis && analisis.conversiones.length === 0 && (
                    <tr><td className="py-3 px-2 text-slate-400" colSpan={4}>Sin datos de conversiones</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
