import { useEffect, useState } from 'react';
import ChartCard from '../ui/ChartCard';
import DataTable from '../ui/DataTable';
import Alert from '../components/Alert';
import { useLicense } from '../context/LicenseContext';
import { hasFeature } from '../lib/features';
import { Api } from '../lib/api';

type Ticket = { id: number; asunto: string; descripcion?: string; estado: string; prioridad: string; tipo: string; cliente_nombre?: string; creado_en: string };

export default function Postventa() {
  const { status: licenseStatus } = useLicense();
  const aiEnabled = hasFeature(licenseStatus, 'ai');
  const [estado, setEstado] = useState<string>('abierto');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyTicket, setReplyTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const t = await Api.tickets({ estado: estado || undefined, limit: 50 });
        setTickets(t || []);
      } catch (_) { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [estado]);

  const estados = ['abierto','en_progreso','resuelto','cerrado'];

  async function generarRespuesta(t: Ticket) {
    setReplyError(null);
    setReplyText(null);
    setReplyTicket(t);
    if (!aiEnabled) {
      setReplyError('IA no habilitada en la licencia.');
      return;
    }
    setReplyLoading(true);
    try {
      const resp: any = await Api.ticketReply(t.id);
      setReplyText(resp?.reply || 'Sin respuesta sugerida.');
    } catch (e: any) {
      setReplyError(e?.message || 'No se pudo generar la respuesta con IA');
    } finally {
      setReplyLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <ChartCard title="Tickets" right={
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="bg-white/10 border border-white/10 rounded px-2 py-1 text-sm">
          <option value="">Todos</option>
          {estados.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      }>
        <DataTable headers={
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-2 px-2">Asunto</th>
              <th className="py-2 px-2">Cliente</th>
              <th className="py-2 px-2">Estado</th>
              <th className="py-2 px-2">Prioridad</th>
              <th className="py-2 px-2">Tipo</th>
              <th className="py-2 px-2">Creado</th>
              <th className="py-2 px-2">IA</th>
            </tr>
          </thead>
        }>
          <tbody className="text-slate-200">
            {(loading ? [] : tickets).map((t) => (
              <tr key={t.id} className="border-t border-white/10 hover:bg-white/5">
                <td className="py-2 px-2">{t.asunto}</td>
                <td className="py-2 px-2">{t.cliente_nombre || '-'}</td>
                <td className="py-2 px-2">{t.estado}</td>
                <td className="py-2 px-2">{t.prioridad}</td>
                <td className="py-2 px-2">{t.tipo}</td>
                <td className="py-2 px-2">{new Date(t.creado_en).toLocaleString()}</td>
                <td className="py-2 px-2">
                  <button
                    onClick={() => generarRespuesta(t)}
                    className={`px-2 py-1 rounded border text-xs ${
                      aiEnabled
                        ? 'bg-primary-500/20 border-primary-500/30 hover:bg-primary-500/30 text-primary-200'
                        : 'bg-white/5 border-white/10 text-slate-500 cursor-not-allowed'
                    }`}
                    disabled={!aiEnabled}
                    title={aiEnabled ? 'Generar respuesta con IA' : 'IA no habilitada'}
                  >
                    Respuesta IA
                  </button>
                </td>
              </tr>
            ))}
            {!loading && tickets.length === 0 && (
              <tr><td className="py-3 px-2 text-slate-400" colSpan={7}>Sin tickets</td></tr>
            )}
          </tbody>
        </DataTable>
      </ChartCard>

      <ChartCard title="Respuesta IA sugerida">
        {!aiEnabled && (
          <div className="text-sm text-slate-400">
            La IA esta disponible desde el plan Pro.
          </div>
        )}
        {aiEnabled && (
          <div className="space-y-2">
            <div className="text-xs text-slate-400">
              {replyTicket ? `Ticket: ${replyTicket.asunto}` : 'Selecciona un ticket y genera una respuesta.'}
            </div>
            {replyLoading && <div className="text-sm text-slate-300">Generando respuesta...</div>}
            {replyError && <Alert kind="error" message={replyError} />}
            {!replyLoading && !replyError && replyText && (
              <div className="text-sm text-slate-200 whitespace-pre-line">{replyText}</div>
            )}
            {!replyLoading && !replyError && !replyText && (
              <div className="text-sm text-slate-500">Sin respuesta aun.</div>
            )}
          </div>
        )}
      </ChartCard>
    </div>
  );
}
