import { useState, useMemo } from 'react';
import { Api } from '../../../lib/api';
import Button from '../../../ui/Button';
import { riskBucketClass, riskBucketLabel } from '../utils';
import type { RiskRankingRow, PromiseRow, ReminderRow } from '../types';

export default function CobranzasTab() {
  const [riskRankingRows, setRiskRankingRows] = useState<RiskRankingRow[]>([]);
  const [riskBucketFilter, setRiskBucketFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [promiseRows, setPromiseRows] = useState<PromiseRow[]>([]);
  const [promiseStatusFilter, setPromiseStatusFilter] = useState<'all' | 'pendiente' | 'cumplida' | 'incumplida' | 'cancelada'>('all');
  const [reminderRows, setReminderRows] = useState<ReminderRow[]>([]);
  const [reminderStatusFilter, setReminderStatusFilter] = useState<'all' | 'pending' | 'sent' | 'error'>('all');
  const [cobranzasLoading, setCobranzasLoading] = useState(false);
  const [cobranzasError, setCobranzasError] = useState<string | null>(null);
  const [autoReminderLimit, setAutoReminderLimit] = useState<number>(30);
  const [autoReminderMsg, setAutoReminderMsg] = useState<string | null>(null);
  const [promiseUpdatingId, setPromiseUpdatingId] = useState<number | null>(null);

  async function loadCobranzas(showError = false) {
    setCobranzasLoading(true);
    if (!showError) setCobranzasError(null);
    setAutoReminderMsg(null);
    try {
      const [ranking, promises, reminders] = await Promise.all([
        Api.ownerRiskRanking({ limit: 500, persist: false }),
        Api.ownerPromises({
          estado: promiseStatusFilter === 'all' ? undefined : promiseStatusFilter,
          limit: 250,
        }),
        Api.ownerReminders({
          status: reminderStatusFilter === 'all' ? undefined : reminderStatusFilter,
          limit: 250,
        }),
      ]);

      const safeRanking = Array.isArray(ranking)
        ? ranking.map((r: any) => ({
            cliente_id: Number(r.cliente_id || 0),
            nombre: r.nombre ? String(r.nombre) : '',
            apellido: r.apellido ? String(r.apellido) : '',
            deuda_pendiente: Number(r.deuda_pendiente || 0),
            deuda_mas_90: Number(r.deuda_mas_90 || 0),
            dias_promedio_atraso: Number(r.dias_promedio_atraso || 0),
            score: Number(r.score || 0),
            bucket: String(r.bucket || 'low') as RiskRankingRow['bucket'],
          }))
        : [];
      setRiskRankingRows(safeRanking);

      const safePromises = Array.isArray(promises)
        ? promises.map((p: any) => ({
            id: Number(p.id || 0),
            cliente_id: Number(p.cliente_id || 0),
            nombre: p.nombre ? String(p.nombre) : '',
            apellido: p.apellido ? String(p.apellido) : '',
            monto_prometido: Number(p.monto_prometido || 0),
            fecha_promesa: String(p.fecha_promesa || ''),
            estado: String(p.estado || 'pendiente') as PromiseRow['estado'],
            canal_preferido: p.canal_preferido ? String(p.canal_preferido) : '',
            notas: p.notas ? String(p.notas) : '',
          }))
        : [];
      setPromiseRows(safePromises);

      const safeReminders = Array.isArray(reminders)
        ? reminders.map((r: any) => ({
            id: Number(r.id || 0),
            cliente_id: Number(r.cliente_id || 0),
            nombre: r.nombre ? String(r.nombre) : '',
            apellido: r.apellido ? String(r.apellido) : '',
            canal: String(r.canal || 'manual'),
            destino: r.destino ? String(r.destino) : '',
            template_code: r.template_code ? String(r.template_code) : '',
            scheduled_at: r.scheduled_at ? String(r.scheduled_at) : '',
            sent_at: r.sent_at ? String(r.sent_at) : '',
            status: String(r.status || 'pending') as ReminderRow['status'],
            error_message: r.error_message ? String(r.error_message) : '',
          }))
        : [];
      setReminderRows(safeReminders);
    } catch (e) {
      if (showError) {
        setCobranzasError(e instanceof Error ? e.message : 'No se pudo cargar cobranzas');
      }
      setRiskRankingRows([]);
      setPromiseRows([]);
      setReminderRows([]);
    } finally {
      setCobranzasLoading(false);
    }
  }

  async function handleAutoReminders() {
    setAutoReminderMsg(null);
    setCobranzasError(null);
    try {
      const out = await Api.ownerAutoReminders({ limit: Math.max(1, Number(autoReminderLimit) || 1) });
      setAutoReminderMsg(`Recordatorios creados: ${Number(out?.created || 0)}`);
      await loadCobranzas(false);
    } catch (e) {
      setCobranzasError(e instanceof Error ? e.message : 'No se pudieron generar recordatorios');
    }
  }

  async function handlePromiseStatusChange(id: number, estado: PromiseRow['estado']) {
    setPromiseUpdatingId(id);
    setCobranzasError(null);
    try {
      await Api.ownerUpdatePromiseStatus(id, { estado });
      await loadCobranzas(false);
    } catch (e) {
      setCobranzasError(e instanceof Error ? e.message : 'No se pudo actualizar estado de promesa');
    } finally {
      setPromiseUpdatingId(null);
    }
  }

  const filteredRiskRanking = useMemo(
    () =>
      riskRankingRows.filter((r) => (riskBucketFilter === 'all' ? true : String(r.bucket) === riskBucketFilter)),
    [riskRankingRows, riskBucketFilter]
  );

  return (
    <div className="space-y-4">
      <div className="app-card finance-card p-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm text-slate-300">Panel global de cobranzas</div>
            <div className="text-xs text-slate-500">Ranking, promesas y recordatorios</div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <select
              className="input-modern text-xs h-8"
              value={riskBucketFilter}
              onChange={(e) =>
                setRiskBucketFilter(e.target.value as 'all' | 'critical' | 'high' | 'medium' | 'low')
              }
            >
              <option value="all">Bucket: todos</option>
              <option value="critical">Critico</option>
              <option value="high">Alto</option>
              <option value="medium">Medio</option>
              <option value="low">Bajo</option>
            </select>
            <select
              className="input-modern text-xs h-8"
              value={promiseStatusFilter}
              onChange={(e) =>
                setPromiseStatusFilter(
                  e.target.value as 'all' | 'pendiente' | 'cumplida' | 'incumplida' | 'cancelada'
                )
              }
            >
              <option value="all">Promesas: todas</option>
              <option value="pendiente">Pendiente</option>
              <option value="cumplida">Cumplida</option>
              <option value="incumplida">Incumplida</option>
              <option value="cancelada">Cancelada</option>
            </select>
            <select
              className="input-modern text-xs h-8"
              value={reminderStatusFilter}
              onChange={(e) => setReminderStatusFilter(e.target.value as 'all' | 'pending' | 'sent' | 'error')}
            >
              <option value="all">Recordatorios: todos</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="error">Error</option>
            </select>
            <input
              type="number"
              min={1}
              className="input-modern text-xs h-8 w-20"
              value={autoReminderLimit}
              onChange={(e) => setAutoReminderLimit(Number(e.target.value) || 1)}
            />
            <Button type="button" className="h-8 px-3 text-xs" onClick={handleAutoReminders} disabled={cobranzasLoading}>
              Auto recordatorios
            </Button>
            <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => loadCobranzas(true)} disabled={cobranzasLoading}>
              {cobranzasLoading ? 'Actualizando...' : 'Actualizar'}
            </Button>
          </div>
        </div>
        {cobranzasError && <div className="text-xs text-rose-300">{cobranzasError}</div>}
        {autoReminderMsg && <div className="text-xs text-emerald-300">{autoReminderMsg}</div>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="app-card finance-card p-4 xl:col-span-2">
          <div className="text-sm text-slate-300 mb-2">Ranking de riesgo</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2 px-2">Cliente</th>
                  <th className="py-2 px-2">Bucket</th>
                  <th className="py-2 px-2 text-right">Score</th>
                  <th className="py-2 px-2 text-right">Deuda</th>
                  <th className="py-2 px-2 text-right">+90</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {filteredRiskRanking.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 px-2 text-slate-500">
                      Sin datos para el filtro.
                    </td>
                  </tr>
                )}
                {filteredRiskRanking.map((r) => (
                  <tr key={r.cliente_id} className="border-t border-white/10 hover:bg-white/5">
                    <td className="py-2 px-2">
                      {r.nombre || 'Cliente'} {r.apellido || ''}
                    </td>
                    <td className="py-2 px-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${riskBucketClass(r.bucket)}`}>
                        {riskBucketLabel(r.bucket)}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-data">{Number(r.score || 0).toFixed(0)}</td>
                    <td className="py-2 px-2 text-right font-data">
                      ${Number(r.deuda_pendiente || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 px-2 text-right font-data">
                      ${Number(r.deuda_mas_90 || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="app-card finance-card p-4">
          <div className="text-sm text-slate-300 mb-2">Seguimiento de promesas</div>
          <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
            {promiseRows.length === 0 && <div className="text-xs text-slate-500">Sin promesas.</div>}
            {promiseRows.map((p) => (
              <div key={p.id} className="rounded-lg border border-white/10 bg-white/5 p-2">
                <div className="text-xs text-slate-200">
                  {p.nombre || 'Cliente'} {p.apellido || ''}
                </div>
                <div className="text-[11px] text-slate-400">
                  ${Number(p.monto_prometido || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} -{' '}
                  {p.fecha_promesa ? new Date(p.fecha_promesa).toLocaleDateString() : '-'}
                </div>
                <select
                  className="input-modern text-xs h-7 mt-2"
                  value={p.estado}
                  disabled={promiseUpdatingId === p.id}
                  onChange={(e) =>
                    handlePromiseStatusChange(
                      p.id,
                      e.target.value as 'pendiente' | 'cumplida' | 'incumplida' | 'cancelada'
                    )
                  }
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="cumplida">Cumplida</option>
                  <option value="incumplida">Incumplida</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="app-card finance-card p-4">
        <div className="text-sm text-slate-300 mb-2">Recordatorios</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2 px-2">Cliente</th>
                <th className="py-2 px-2">Canal</th>
                <th className="py-2 px-2">Estado</th>
                <th className="py-2 px-2">Programado</th>
                <th className="py-2 px-2">Error</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {reminderRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 px-2 text-slate-500">
                    Sin recordatorios.
                  </td>
                </tr>
              )}
              {reminderRows.map((r) => (
                <tr key={r.id} className="border-t border-white/10 hover:bg-white/5">
                  <td className="py-2 px-2">
                    {r.nombre || 'Cliente'} {r.apellido || ''}
                  </td>
                  <td className="py-2 px-2">{r.canal}</td>
                  <td className="py-2 px-2">{r.status}</td>
                  <td className="py-2 px-2">{r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : '-'}</td>
                  <td className="py-2 px-2 text-rose-300">{r.error_message || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
