import type {
  RiesgoMora,
  PromesaCobranza,
  RecordatorioCobranza,
} from './types';
import { riesgoLabel, riesgoClass, recordatorioStatusLabel } from './utils';

type PromesaFormState = {
  monto: string;
  fecha: string;
  canal: 'whatsapp' | 'email' | 'telefono' | 'manual';
  notas: string;
};

type RecordatorioFormState = {
  canal: 'whatsapp' | 'email' | 'manual';
  destino: string;
  template_code: string;
  mensaje: string;
};

type ClienteCobranzaSectionProps = {
  selectedClienteId: number;
  riesgoMora: RiesgoMora | null;
  promesasCobranza: PromesaCobranza[];
  recordatoriosCobranza: RecordatorioCobranza[];
  cobranzaLoading: boolean;
  cobranzaError: string | null;
  promesaForm: PromesaFormState;
  promesaSaving: boolean;
  recordatorioForm: RecordatorioFormState;
  recordatorioSaving: boolean;
  onRefresh: () => void;
  onPromesaFormChange: (changes: Partial<PromesaFormState>) => void;
  onCrearPromesa: () => void;
  onActualizarEstadoPromesa: (id: number, estado: PromesaCobranza['estado']) => void;
  onRecordatorioFormChange: (changes: Partial<RecordatorioFormState>) => void;
  onCrearRecordatorio: () => void;
};

export default function ClienteCobranzaSection({
  selectedClienteId,
  riesgoMora,
  promesasCobranza,
  recordatoriosCobranza,
  cobranzaLoading,
  cobranzaError,
  promesaForm,
  promesaSaving,
  recordatorioForm,
  recordatorioSaving,
  onRefresh,
  onPromesaFormChange,
  onCrearPromesa,
  onActualizarEstadoPromesa,
  onRecordatorioFormChange,
  onCrearRecordatorio,
}: ClienteCobranzaSectionProps) {
  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-200">
          Cobranzas inteligentes
        </h4>
        <button
          type="button"
          className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10 text-xs"
          onClick={onRefresh}
          disabled={cobranzaLoading}
        >
          {cobranzaLoading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {cobranzaError && (
        <div className="text-xs text-rose-300">{cobranzaError}</div>
      )}

      {cobranzaLoading ? (
        <div className="text-sm text-slate-400">Cargando modulo de cobranzas...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="p-3 rounded-lg border border-white/10 bg-white/5">
              <div className="text-[11px] uppercase text-slate-400 mb-1">
                Riesgo mora
              </div>
              {riesgoMora ? (
                <div className="space-y-1">
                  <div>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${riesgoClass(
                        riesgoMora.bucket
                      )}`}
                    >
                      {riesgoLabel(riesgoMora.bucket)}
                    </span>
                  </div>
                  <div className="text-slate-200">
                    Score: <span className="font-semibold">{riesgoMora.score}</span>/100
                  </div>
                  <div className="text-slate-300 text-xs">
                    Deuda +90: ${Number(riesgoMora.deuda_mas_90 || 0).toFixed(2)}
                  </div>
                  <div className="text-slate-300 text-xs">
                    Atraso promedio: {Number(riesgoMora.dias_promedio_atraso || 0).toFixed(0)} dias
                  </div>
                </div>
              ) : (
                <div className="text-slate-400">Sin score disponible</div>
              )}
            </div>

            <div className="p-3 rounded-lg border border-white/10 bg-white/5">
              <div className="text-[11px] uppercase text-slate-400 mb-1">
                Promesas
              </div>
              <div className="text-slate-200 text-lg font-semibold">
                {promesasCobranza.length}
              </div>
              <div className="text-xs text-slate-400">
                Pendientes:{' '}
                {promesasCobranza.filter((p) => p.estado === 'pendiente').length}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-white/10 bg-white/5">
              <div className="text-[11px] uppercase text-slate-400 mb-1">
                Recordatorios
              </div>
              <div className="text-slate-200 text-lg font-semibold">
                {recordatoriosCobranza.length}
              </div>
              <div className="text-xs text-slate-400">
                Pendientes:{' '}
                {recordatoriosCobranza.filter((r) => r.status === 'pending').length}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg border border-white/10 bg-white/5 space-y-3">
              <div className="text-sm text-slate-200 font-medium">
                Promesas de pago
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                  placeholder="Monto"
                  value={promesaForm.monto}
                  onChange={(e) => onPromesaFormChange({ monto: e.target.value })}
                />
                <input
                  type="date"
                  className="bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                  value={promesaForm.fecha}
                  onChange={(e) => onPromesaFormChange({ fecha: e.target.value })}
                />
                <select
                  className="bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                  value={promesaForm.canal}
                  onChange={(e) =>
                    onPromesaFormChange({
                      canal: e.target.value as 'whatsapp' | 'email' | 'telefono' | 'manual',
                    })
                  }
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="telefono">Telefono</option>
                  <option value="manual">Manual</option>
                </select>
                <button
                  type="button"
                  onClick={onCrearPromesa}
                  className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200 text-xs disabled:opacity-60"
                  disabled={promesaSaving}
                >
                  {promesaSaving ? 'Guardando...' : 'Crear promesa'}
                </button>
              </div>
              <input
                type="text"
                className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                placeholder="Notas (opcional)"
                value={promesaForm.notas}
                onChange={(e) => onPromesaFormChange({ notas: e.target.value })}
              />
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-left text-slate-400">
                    <tr>
                      <th className="py-1 pr-2">Fecha</th>
                      <th className="py-1 pr-2">Monto</th>
                      <th className="py-1 pr-2">Canal</th>
                      <th className="py-1 pr-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {promesasCobranza.map((p) => (
                      <tr key={p.id} className="border-t border-white/10">
                        <td className="py-1 pr-2">
                          {p.fecha_promesa
                            ? new Date(p.fecha_promesa).toLocaleDateString()
                            : '-'}
                        </td>
                        <td className="py-1 pr-2">${Number(p.monto_prometido || 0).toFixed(2)}</td>
                        <td className="py-1 pr-2">{p.canal_preferido}</td>
                        <td className="py-1 pr-2">
                          <select
                            className="bg-slate-800 border border-white/10 rounded px-1 py-0.5 text-xs"
                            value={p.estado}
                            onChange={(e) =>
                              onActualizarEstadoPromesa(
                                p.id,
                                e.target.value as PromesaCobranza['estado']
                              )
                            }
                          >
                            <option value="pendiente">pendiente</option>
                            <option value="cumplida">cumplida</option>
                            <option value="incumplida">incumplida</option>
                            <option value="cancelada">cancelada</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                    {!promesasCobranza.length && (
                      <tr>
                        <td colSpan={4} className="py-2 text-slate-400">
                          Sin promesas registradas
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-white/10 bg-white/5 space-y-3">
              <div className="text-sm text-slate-200 font-medium">
                Recordatorios
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <select
                  className="bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                  value={recordatorioForm.canal}
                  onChange={(e) =>
                    onRecordatorioFormChange({
                      canal: e.target.value as 'whatsapp' | 'email' | 'manual',
                    })
                  }
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="manual">Manual</option>
                </select>
                <input
                  type="text"
                  className="bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                  placeholder="Destino"
                  value={recordatorioForm.destino}
                  onChange={(e) => onRecordatorioFormChange({ destino: e.target.value })}
                />
                <input
                  type="text"
                  className="bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                  placeholder="Template"
                  value={recordatorioForm.template_code}
                  onChange={(e) =>
                    onRecordatorioFormChange({ template_code: e.target.value })
                  }
                />
                <button
                  type="button"
                  onClick={onCrearRecordatorio}
                  className="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-200 text-xs disabled:opacity-60"
                  disabled={recordatorioSaving}
                >
                  {recordatorioSaving ? 'Guardando...' : 'Crear recordatorio'}
                </button>
              </div>
              <input
                type="text"
                className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                placeholder="Mensaje corto"
                value={recordatorioForm.mensaje}
                onChange={(e) => onRecordatorioFormChange({ mensaje: e.target.value })}
              />
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-left text-slate-400">
                    <tr>
                      <th className="py-1 pr-2">Fecha</th>
                      <th className="py-1 pr-2">Canal</th>
                      <th className="py-1 pr-2">Destino</th>
                      <th className="py-1 pr-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {recordatoriosCobranza.map((r) => (
                      <tr key={r.id} className="border-t border-white/10">
                        <td className="py-1 pr-2">
                          {r.scheduled_at
                            ? new Date(r.scheduled_at).toLocaleString()
                            : '-'}
                        </td>
                        <td className="py-1 pr-2">{r.canal}</td>
                        <td className="py-1 pr-2">{r.destino || '-'}</td>
                        <td className="py-1 pr-2">{recordatorioStatusLabel(r.status)}</td>
                      </tr>
                    ))}
                    {!recordatoriosCobranza.length && (
                      <tr>
                        <td colSpan={4} className="py-2 text-slate-400">
                          Sin recordatorios registrados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
