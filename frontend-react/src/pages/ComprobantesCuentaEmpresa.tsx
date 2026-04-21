import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Clock3, FileCheck2, FileWarning, Landmark, Send, XCircle } from 'lucide-react';
import Alert from '../components/Alert';
import { Api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { getRoleFromToken } from '../lib/auth';

type CuentaEmpresaProveedor = {
  id: number;
  nombre: string;
  alias_cuenta: string;
  banco?: string | null;
  tiempo_reposicion_dias?: number | null;
};

type CuentaEmpresaTransaccion = {
  id: number;
  proveedor_id: number;
  proveedor_nombre: string;
  venta_id?: number | null;
  monto: number;
  moneda: string;
  estado: string;
  origen: string;
  alias_cuenta_snapshot?: string | null;
  banco_snapshot?: string | null;
  comprobante_url?: string | null;
  comprobante_nombre?: string | null;
  nota?: string | null;
  creado_en: string;
  actualizado_en?: string | null;
};

function money(value: number, currency = 'ARS') {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency || 'ARS',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function statusBadge(status: string) {
  const key = String(status || '').trim().toLowerCase();
  if (key === 'acreditado') return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/20';
  if (key === 'confirmado') return 'bg-cyan-500/15 text-cyan-100 border-cyan-300/20';
  if (key === 'rechazado') return 'bg-rose-500/15 text-rose-100 border-rose-400/20';
  return 'bg-amber-500/15 text-amber-100 border-amber-300/20';
}

export default function ComprobantesCuentaEmpresa() {
  const { accessToken } = useAuth();
  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const canReview = role === 'admin' || role === 'gerente';

  const [providers, setProviders] = useState<CuentaEmpresaProveedor[]>([]);
  const [transactions, setTransactions] = useState<CuentaEmpresaTransaccion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    proveedor_id: '',
    monto: '',
    nota: '',
    file: null as File | null,
  });

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [providerRows, txRows] = await Promise.all([
        Api.proveedoresCuentaEmpresaActivas().catch(() => []),
        Api.cuentaEmpresaTransacciones({ limit: 50 }).catch(() => []),
      ]);
      setProviders(Array.isArray(providerRows) ? (providerRows as CuentaEmpresaProveedor[]) : []);
      setTransactions(Array.isArray(txRows) ? (txRows as CuentaEmpresaTransaccion[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la cuenta empresa');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const selectedProvider = useMemo(
    () => providers.find((provider) => Number(provider.id) === Number(form.proveedor_id)) || null,
    [providers, form.proveedor_id]
  );

  async function submitReceipt(e: FormEvent) {
    e.preventDefault();
    if (!form.proveedor_id || !form.monto || !form.file) {
      setError('Completá alias, monto y comprobante.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await Api.subirComprobanteCuentaEmpresa({
        proveedor_id: Number(form.proveedor_id),
        monto: Number(form.monto),
        nota: form.nota.trim() || undefined,
        file: form.file,
      });
      setSuccess('Comprobante enviado. Queda pendiente de revisión.');
      setForm({
        proveedor_id: '',
        monto: '',
        nota: '',
        file: null,
      });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el comprobante');
    } finally {
      setSaving(false);
    }
  }

  async function reviewTransaction(id: number, action: 'confirmar' | 'rechazar' | 'acreditar') {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (action === 'confirmar') await Api.confirmarTransaccionCuentaEmpresa(id);
      if (action === 'rechazar') await Api.rechazarTransaccionCuentaEmpresa(id);
      if (action === 'acreditar') await Api.acreditarTransaccionCuentaEmpresa(id);
      setSuccess('Estado actualizado.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la transacción');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_42%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(2,6,23,0.82))] p-6 text-slate-100 shadow-[0_40px_120px_-60px_rgba(34,211,238,0.55)]">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.12),transparent_60%)]" />
        <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100">
              <Landmark size={14} />
              Cuenta empresa
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Cobros a proveedores, claros y ordenados</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Acá registrás comprobantes y seguís cada movimiento sin ver tecnicismos. Elegís el alias, cargás el monto y el sistema deja todo listo para revisión.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Alias activos</div>
              <div className="mt-2 text-2xl font-semibold text-white">{providers.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Pendientes</div>
              <div className="mt-2 text-2xl font-semibold text-amber-200">
                {transactions.filter((item) => String(item.estado).toLowerCase() === 'pendiente').length}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Acreditados</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-200">
                {transactions.filter((item) => String(item.estado).toLowerCase() === 'acreditado').length}
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && <Alert kind="error" message={error} />}
      {success && <Alert kind="info" message={success} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="rounded-[30px] border border-slate-200/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.94))] p-5 shadow-[0_24px_80px_-56px_rgba(15,23,42,0.85)]">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-cyan-500/15 p-3 text-cyan-100">
              <Send size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Enviar comprobante</h2>
              <p className="text-sm text-slate-400">Pensado para que cualquier vendedor lo use sin pedir ayuda.</p>
            </div>
          </div>
          <form onSubmit={submitReceipt} className="mt-5 space-y-4">
            <label className="block">
              <div className="mb-1.5 text-sm text-slate-300">Alias de destino</div>
              <select
                value={form.proveedor_id}
                onChange={(e) => setForm((prev) => ({ ...prev, proveedor_id: e.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100"
              >
                <option value="">Elegir alias</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.alias_cuenta} - {provider.nombre}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <div className="mb-1.5 text-sm text-slate-300">Monto del comprobante</div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.monto}
                  onChange={(e) => setForm((prev) => ({ ...prev, monto: e.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100"
                  placeholder="0,00"
                />
              </label>
              <label className="block">
                <div className="mb-1.5 text-sm text-slate-300">Comprobante</div>
                <input
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/webp"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))
                  }
                  className="w-full rounded-2xl border border-dashed border-white/15 bg-white/5 px-3 py-2.5 text-sm text-slate-200 file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-500/20 file:px-3 file:py-2 file:text-cyan-50"
                />
              </label>
            </div>

            <label className="block">
              <div className="mb-1.5 text-sm text-slate-300">Nota opcional</div>
              <textarea
                value={form.nota}
                onChange={(e) => setForm((prev) => ({ ...prev, nota: e.target.value }))}
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100"
                placeholder="Ejemplo: pago parcial de una venta del mediodía"
              />
            </label>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              <div className="font-medium text-slate-100">Lo que va a pasar</div>
              <div className="mt-2 space-y-1">
                <div>1. El comprobante se guarda con su alias.</div>
                <div>2. Queda pendiente de revisión.</div>
                <div>3. Cuando administración lo acredita, impacta en la cuenta corriente del proveedor.</div>
              </div>
              {selectedProvider && (
                <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-50">
                  Alias elegido: <strong>{selectedProvider.alias_cuenta}</strong>
                  {selectedProvider.banco ? ` · Banco ${selectedProvider.banco}` : ''}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileCheck2 size={18} />
              {saving ? 'Enviando...' : 'Enviar comprobante'}
            </button>
          </form>
        </section>

        <section className="rounded-[30px] border border-slate-200/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.96))] p-5 shadow-[0_24px_80px_-56px_rgba(15,23,42,0.85)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">{canReview ? 'Revisión de movimientos' : 'Últimos movimientos'}</h2>
              <p className="text-sm text-slate-400">
                {canReview ? 'Confirmá, rechazá o acreditá cada comprobante desde una sola vista.' : 'Así podés seguir qué pasó con cada envío.'}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="mt-6 text-sm text-slate-400">Cargando movimientos...</div>
          ) : !transactions.length ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">
              Todavía no hay movimientos cargados.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {transactions.map((item) => (
                <article
                  key={item.id}
                  className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_-50px_rgba(15,23,42,0.95)]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">{item.alias_cuenta_snapshot || item.proveedor_nombre}</span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${statusBadge(item.estado)}`}>
                          {item.estado}
                        </span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                          {item.origen === 'venta' ? 'Venta' : 'Comprobante'}
                        </span>
                      </div>
                      <div className="text-lg font-semibold text-cyan-50">{money(item.monto, item.moneda)}</div>
                      <div className="text-sm text-slate-400">
                        {item.proveedor_nombre}
                        {item.venta_id ? ` · venta #${item.venta_id}` : ''}
                        {item.banco_snapshot ? ` · ${item.banco_snapshot}` : ''}
                      </div>
                      {item.nota && <div className="text-sm text-slate-300">{item.nota}</div>}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span>{new Date(item.creado_en).toLocaleString()}</span>
                        {item.comprobante_url && (
                          <a
                            href={item.comprobante_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-200 underline-offset-4 hover:underline"
                          >
                            Ver comprobante
                          </a>
                        )}
                      </div>
                    </div>

                    {canReview && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => reviewTransaction(item.id, 'confirmar')}
                          className="inline-flex items-center gap-1 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-50 hover:bg-cyan-400/20 disabled:opacity-50"
                        >
                          <Clock3 size={14} />
                          Confirmar
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => reviewTransaction(item.id, 'acreditar')}
                          className="inline-flex items-center gap-1 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-50 hover:bg-emerald-400/20 disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} />
                          Acreditar
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => reviewTransaction(item.id, 'rechazar')}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-50 hover:bg-rose-400/20 disabled:opacity-50"
                        >
                          <XCircle size={14} />
                          Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[26px] border border-white/10 bg-white/5 p-5">
          <div className="inline-flex rounded-2xl bg-cyan-500/10 p-3 text-cyan-100">
            <FileCheck2 size={18} />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-white">Registro claro</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Cada movimiento guarda alias, monto, comprobante y estado para que no haya dudas.
          </p>
        </div>
        <div className="rounded-[26px] border border-white/10 bg-white/5 p-5">
          <div className="inline-flex rounded-2xl bg-amber-500/10 p-3 text-amber-100">
            <FileWarning size={18} />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-white">Revisión simple</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            El equipo administrativo ve todo junto y decide rápido qué confirmar, acreditar o corregir.
          </p>
        </div>
        <div className="rounded-[26px] border border-white/10 bg-white/5 p-5">
          <div className="inline-flex rounded-2xl bg-emerald-500/10 p-3 text-emerald-100">
            <CheckCircle2 size={18} />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-white">Seguimiento ordenado</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Cuando se acredita, ese movimiento queda listo para impactar en la cuenta corriente del proveedor.
          </p>
        </div>
      </section>
    </div>
  );
}
