import { useEffect, useState } from 'react';
import ChartCard from '../ui/ChartCard';
import DataTable from '../ui/DataTable';
import { Api } from '../lib/api';

type Aprobacion = {
  id: number;
  estado: string;
  solicitado_por_usuario_id?: number | null;
  aprobado_por_usuario_id?: number | null;
  entidad?: string | null;
  entidad_id?: number | null;
  motivo?: string | null;
  payload?: any;
  creado_en: string;
  regla_clave: string;
  regla_descripcion?: string | null;
};

function describeDetalle(a: Aprobacion): string {
  if (a.regla_clave === 'product_price_update' && a.payload && typeof a.payload === 'object') {
    const oldP = (a.payload as any).old;
    const newP = (a.payload as any).new;
    if (typeof oldP === 'number' && typeof newP === 'number') {
      const diff = newP - oldP;
      const pct = oldP !== 0 ? (Math.abs(diff) / Math.abs(oldP)) * 100 : 0;
      return `Cambio de precio ${oldP.toFixed(2)} → ${newP.toFixed(2)} (${diff >= 0 ? '+' : '-'}${pct.toFixed(1)}%)`;
    }
  }
  if (a.motivo) return a.motivo;
  if (a.payload) return JSON.stringify(a.payload);
  return '';
}

export default function Aprobaciones() {
  const [items, setItems] = useState<Aprobacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [notas, setNotas] = useState<string>('');

  async function load() {
    setLoading(true);
    try {
      const data = await Api.aprobaciones({ estado: 'pendiente', limit: 100 });
      setItems(data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function decide(id: number, action: 'aprobar' | 'rechazar') {
    try {
      if (action === 'aprobar') await Api.aprobar(id, notas || undefined);
      else await Api.rechazar(id, notas || undefined);
      setNotas('');
      await load();
    } catch (e) {
      // no-op: UI puede mostrar toast
    }
  }

  return (
    <div className="space-y-6">
      <ChartCard
        title="Aprobaciones pendientes"
        right={
          <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas (opcional)" className="bg-white/10 border border-white/10 rounded px-2 py-1 text-sm" />
        }
      >
        <DataTable
          headers={
            <thead className="text-left text-slate-400">
              <tr>
                <th className="py-2 px-2">ID</th>
                <th className="py-2 px-2">Regla</th>
                <th className="py-2 px-2">Entidad</th>
                <th className="py-2 px-2">Detalle</th>
                <th className="py-2 px-2">Solicitó</th>
                <th className="py-2 px-2">Creado</th>
                <th className="py-2 px-2">Acciones</th>
              </tr>
            </thead>
          }
        >
          <tbody className="text-slate-200">
            {(loading ? [] : items).map((a) => (
              <tr key={a.id} className="border-t border-white/10 hover:bg-white/5">
                <td className="py-2 px-2">{a.id}</td>
                <td className="py-2 px-2">{a.regla_clave}</td>
                <td className="py-2 px-2">{a.entidad}{a.entidad_id ? ` #${a.entidad_id}` : ''}</td>
                <td className="py-2 px-2 text-xs max-w-[360px] truncate" title={describeDetalle(a)}>{describeDetalle(a)}</td>
                <td className="py-2 px-2">{a.solicitado_por_usuario_id ?? '-'}</td>
                <td className="py-2 px-2">{new Date(a.creado_en).toLocaleString()}</td>
                <td className="py-2 px-2 space-x-2">
                  <button onClick={() => decide(a.id, 'aprobar')} className="px-2 py-1 rounded bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-200 text-xs">Aprobar</button>
                  <button onClick={() => decide(a.id, 'rechazar')} className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/30 hover:bg-rose-500/30 text-rose-200 text-xs">Rechazar</button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td className="py-3 px-2 text-slate-400" colSpan={7}>Sin aprobaciones pendientes</td></tr>
            )}
          </tbody>
        </DataTable>
      </ChartCard>
    </div>
  );
}
