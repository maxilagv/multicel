import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Building2, Clock3, Landmark, NotebookTabs, RefreshCw, WalletCards } from 'lucide-react';
import { Api } from '../lib/api';
import Alert from '../components/Alert';

type Proveedor = {
  id: number;
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  whatsapp?: string | null;
  direccion?: string | null;
  cuit_cuil?: string | null;
  alias_cuenta?: string | null;
  cbu?: string | null;
  cbu_masked?: string | null;
  banco?: string | null;
  activo?: boolean;
  notas_internas?: string | null;
  tiempo_reposicion_dias?: number | null;
  fecha_registro?: string | null;
  actualizado_en?: string | null;
};

type CompraProveedor = {
  id: number;
  fecha: string;
  total_costo: number;
  moneda: string;
  estado_recepcion?: string;
  oc_numero?: string | null;
  adjunto_url?: string | null;
};

type CuentaCorrienteResumen = {
  total_debito: number;
  total_credito: number;
  saldo: number;
};

type CuentaCorrienteMovimiento = {
  id: number;
  compra_id?: number | null;
  transaccion_id?: number | null;
  tipo_movimiento: string;
  debito: number;
  credito: number;
  descripcion?: string | null;
  fecha: string;
};

type ProveedorForm = {
  id: number | null;
  nombre: string;
  email: string;
  telefono: string;
  whatsapp: string;
  direccion: string;
  cuit_cuil: string;
  alias_cuenta: string;
  cbu: string;
  banco: string;
  activo: boolean;
  notas_internas: string;
  tiempo_reposicion_dias: string;
};

const emptyForm: ProveedorForm = {
  id: null,
  nombre: '',
  email: '',
  telefono: '',
  whatsapp: '',
  direccion: '',
  cuit_cuil: '',
  alias_cuenta: '',
  cbu: '',
  banco: '',
  activo: true,
  notas_internas: '',
  tiempo_reposicion_dias: '',
};

function money(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export default function Proveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<ProveedorForm>(emptyForm);
  const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);
  const [comprasProveedor, setComprasProveedor] = useState<CompraProveedor[]>([]);
  const [loadingComprasProveedor, setLoadingComprasProveedor] = useState(false);
  const [cuentaResumen, setCuentaResumen] = useState<CuentaCorrienteResumen | null>(null);
  const [cuentaMovimientos, setCuentaMovimientos] = useState<CuentaCorrienteMovimiento[]>([]);
  const [loadingCuenta, setLoadingCuenta] = useState(false);

  const isEditing = form.id !== null;

  const canSubmit = useMemo(() => form.nombre.trim().length > 0 && !saving, [form.nombre, saving]);
  const activos = useMemo(
    () => proveedores.filter((item) => item.activo !== false).length,
    [proveedores]
  );
  const conAlias = useMemo(
    () => proveedores.filter((item) => Boolean(item.alias_cuenta)).length,
    [proveedores]
  );

  async function loadProveedores(q?: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await Api.proveedores(q || undefined);
      setProveedores((data || []) as Proveedor[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando proveedores');
    } finally {
      setLoading(false);
    }
  }

  async function loadProveedorContext(proveedor: Proveedor) {
    setSelectedProveedor(proveedor);
    setLoadingComprasProveedor(true);
    setLoadingCuenta(true);
    try {
      const [compras, cuenta] = await Promise.all([
        Api.proveedorCompras(proveedor.id),
        Api.proveedorCuentaCorriente(proveedor.id).catch(() => null),
      ]);
      setComprasProveedor(
        (compras || []).map((c: any) => ({
          id: c.id,
          fecha: c.fecha,
          total_costo: Number(c.total_costo ?? 0),
          moneda: c.moneda || 'ARS',
          estado_recepcion: c.estado_recepcion,
          oc_numero: c.oc_numero ?? null,
          adjunto_url: c.adjunto_url ?? null,
        }))
      );
      setCuentaResumen(
        cuenta?.resumen
          ? {
              total_debito: Number(cuenta.resumen.total_debito || 0),
              total_credito: Number(cuenta.resumen.total_credito || 0),
              saldo: Number(cuenta.resumen.saldo || 0),
            }
          : null
      );
      setCuentaMovimientos(
        Array.isArray(cuenta?.movimientos)
          ? cuenta.movimientos.map((row: any) => ({
              id: Number(row.id),
              compra_id: row.compra_id != null ? Number(row.compra_id) : null,
              transaccion_id: row.transaccion_id != null ? Number(row.transaccion_id) : null,
              tipo_movimiento: row.tipo_movimiento,
              debito: Number(row.debito || 0),
              credito: Number(row.credito || 0),
              descripcion: row.descripcion ?? null,
              fecha: row.fecha,
            }))
          : []
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos del proveedor');
    } finally {
      setLoadingComprasProveedor(false);
      setLoadingCuenta(false);
    }
  }

  useEffect(() => {
    loadProveedores();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        email: form.email.trim() || undefined,
        telefono: form.telefono.trim() || undefined,
        whatsapp: form.whatsapp.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
        cuit_cuil: form.cuit_cuil.trim() || undefined,
        alias_cuenta: form.alias_cuenta.trim() || undefined,
        cbu: form.cbu.trim() || undefined,
        banco: form.banco.trim() || undefined,
        activo: form.activo,
        notas_internas: form.notas_internas.trim() || undefined,
        tiempo_reposicion_dias: form.tiempo_reposicion_dias
          ? Number(form.tiempo_reposicion_dias)
          : undefined,
      };
      if (isEditing && form.id) {
        await Api.actualizarProveedor(form.id, payload);
        setSuccess('Proveedor actualizado.');
      } else {
        await Api.crearProveedor(payload);
        setSuccess('Proveedor creado.');
      }
      setForm(emptyForm);
      await loadProveedores(query);
      if (selectedProveedor?.id === form.id && form.id) {
        const updated = proveedores.find((item) => item.id === form.id);
        if (updated) await loadProveedorContext(updated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el proveedor');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: Proveedor) {
    setForm({
      id: item.id,
      nombre: item.nombre || '',
      email: item.email || '',
      telefono: item.telefono || '',
      whatsapp: item.whatsapp || '',
      direccion: item.direccion || '',
      cuit_cuil: item.cuit_cuil || '',
      alias_cuenta: item.alias_cuenta || '',
      cbu: item.cbu || '',
      banco: item.banco || '',
      activo: item.activo !== false,
      notas_internas: item.notas_internas || '',
      tiempo_reposicion_dias:
        item.tiempo_reposicion_dias != null ? String(item.tiempo_reposicion_dias) : '',
    });
  }

  function resetForm() {
    setForm(emptyForm);
    setSuccess(null);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200/10 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.16),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.88))] p-6 text-slate-100 shadow-[0_40px_120px_-60px_rgba(16,185,129,0.6)]">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-emerald-100">
              <Building2 size={14} />
              Red de proveedores
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Cuenta empresa clara, proveedor por proveedor</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Desde acá configurás cómo trabaja cada proveedor, dónde entra cada venta por cuenta empresa y cómo queda su saldo.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Total</div>
              <div className="mt-2 text-2xl font-semibold text-white">{proveedores.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Activos</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-200">{activos}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Con alias</div>
              <div className="mt-2 text-2xl font-semibold text-cyan-200">{conAlias}</div>
            </div>
          </div>
        </div>
      </section>

      {error && <Alert kind="error" message={error} />}
      {success && <Alert kind="info" message={success} />}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="space-y-4">
          <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Listado y seguimiento</h2>
                <p className="text-sm text-slate-400">Buscá rápido y entrá al detalle de compras, cuenta y tiempos de reposición.</p>
              </div>
              <div className="flex gap-2">
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100"
                  placeholder="Buscar por nombre, teléfono o CUIT"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:bg-white/10"
                  onClick={() => loadProveedores(query)}
                >
                  <RefreshCw size={16} />
                  Buscar
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {loading ? (
                <div className="text-sm text-slate-400">Cargando proveedores...</div>
              ) : !proveedores.length ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-slate-400">
                  Todavía no hay proveedores registrados.
                </div>
              ) : (
                proveedores.map((proveedor) => {
                  const active = proveedor.activo !== false;
                  const selected = selectedProveedor?.id === proveedor.id;
                  return (
                    <div
                      key={proveedor.id}
                      className={[
                        'rounded-[26px] border p-4 transition',
                        selected
                          ? 'border-cyan-300/25 bg-cyan-400/10 shadow-[0_20px_60px_-50px_rgba(34,211,238,0.7)]'
                          : 'border-white/10 bg-white/5 hover:bg-white/10',
                      ].join(' ')}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold text-white">{proveedor.nombre}</span>
                            <span
                              className={[
                                'rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]',
                                active
                                  ? 'border-emerald-400/20 bg-emerald-500/15 text-emerald-100'
                                  : 'border-slate-400/20 bg-slate-500/15 text-slate-300',
                              ].join(' ')}
                            >
                              {active ? 'Activo' : 'Pausado'}
                            </span>
                            {proveedor.alias_cuenta && (
                              <span className="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-100">
                                {proveedor.alias_cuenta}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                            <span>{proveedor.telefono || proveedor.whatsapp || 'Sin teléfono'}</span>
                            <span>{proveedor.email || 'Sin email'}</span>
                            <span>{proveedor.banco || 'Banco no definido'}</span>
                          </div>
                        </div>
                        <div className="grid gap-1 text-xs text-slate-400">
                          <span>Reposición: {proveedor.tiempo_reposicion_dias != null ? `${proveedor.tiempo_reposicion_dias} días` : 'Sin dato'}</span>
                          <span>CBU visible: {proveedor.cbu_masked || 'No cargado'}</span>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => loadProveedorContext(proveedor)}
                          className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-50 hover:bg-cyan-500/20"
                        >
                          Ver detalle
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(proveedor)}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {selectedProveedor && (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-100">
                    <WalletCards size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Cuenta corriente</h3>
                    <p className="text-sm text-slate-400">Resumen de saldo y movimientos del proveedor seleccionado.</p>
                  </div>
                </div>
                {loadingCuenta ? (
                  <div className="mt-4 text-sm text-slate-400">Cargando cuenta corriente...</div>
                ) : cuentaResumen ? (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Compras</div>
                        <div className="mt-2 text-lg font-semibold text-rose-100">{money(cuentaResumen.total_debito)}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Créditos</div>
                        <div className="mt-2 text-lg font-semibold text-emerald-100">{money(cuentaResumen.total_credito)}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Saldo</div>
                        <div className="mt-2 text-lg font-semibold text-cyan-50">{money(cuentaResumen.saldo)}</div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {cuentaMovimientos.length ? (
                        cuentaMovimientos.slice(0, 8).map((item) => (
                          <div key={item.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="text-sm font-medium text-white">{item.descripcion || item.tipo_movimiento}</div>
                                <div className="text-xs text-slate-400">{new Date(item.fecha).toLocaleString()}</div>
                              </div>
                              <div className="text-right text-sm">
                                {item.debito > 0 && <div className="text-rose-200">Debe {money(item.debito)}</div>}
                                {item.credito > 0 && <div className="text-emerald-200">Haber {money(item.credito)}</div>}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-4 text-sm text-slate-400">
                          Todavía no hay movimientos registrados para este proveedor.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/15 p-4 text-sm text-slate-400">
                    La cuenta corriente todavía no está disponible o no tiene movimientos.
                  </div>
                )}
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-100">
                    <NotebookTabs size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Compras recientes</h3>
                    <p className="text-sm text-slate-400">Últimas órdenes y recepciones del proveedor.</p>
                  </div>
                </div>
                {loadingComprasProveedor ? (
                  <div className="mt-4 text-sm text-slate-400">Cargando compras...</div>
                ) : comprasProveedor.length ? (
                  <div className="mt-4 space-y-2">
                    {comprasProveedor.slice(0, 8).map((compra) => (
                      <div key={compra.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-medium text-white">
                              Compra #{compra.id} {compra.oc_numero ? `· OC ${compra.oc_numero}` : ''}
                            </div>
                            <div className="text-xs text-slate-400">{new Date(compra.fecha).toLocaleDateString()}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-slate-100">{money(compra.total_costo)}</div>
                            <div className="text-xs text-slate-400 capitalize">{compra.estado_recepcion || 'pendiente'}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/15 p-4 text-sm text-slate-400">
                    Este proveedor todavía no tiene compras registradas.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-100">
              <Landmark size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{isEditing ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
              <p className="text-sm text-slate-400">Completá datos de contacto, cuenta empresa y tiempos de trabajo.</p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="mb-1.5 text-sm text-slate-300">Nombre</div>
                <input className="input-modern w-full text-sm" value={form.nombre} onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))} required />
              </label>
              <label className="block">
                <div className="mb-1.5 text-sm text-slate-300">CUIT / CUIL</div>
                <input className="input-modern w-full text-sm" value={form.cuit_cuil} onChange={(e) => setForm((prev) => ({ ...prev, cuit_cuil: e.target.value }))} />
              </label>
              <label className="block">
                <div className="mb-1.5 text-sm text-slate-300">Email</div>
                <input className="input-modern w-full text-sm" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
              </label>
              <label className="block">
                <div className="mb-1.5 text-sm text-slate-300">Teléfono</div>
                <input className="input-modern w-full text-sm" value={form.telefono} onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value }))} />
              </label>
              <label className="block">
                <div className="mb-1.5 text-sm text-slate-300">WhatsApp</div>
                <input className="input-modern w-full text-sm" value={form.whatsapp} onChange={(e) => setForm((prev) => ({ ...prev, whatsapp: e.target.value }))} />
              </label>
              <label className="block">
                <div className="mb-1.5 text-sm text-slate-300">Dirección</div>
                <input className="input-modern w-full text-sm" value={form.direccion} onChange={(e) => setForm((prev) => ({ ...prev, direccion: e.target.value }))} />
              </label>
            </div>

            <div className="rounded-[26px] border border-cyan-300/15 bg-cyan-500/5 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-100">
                  <Landmark size={18} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Datos de cuenta empresa</h3>
                  <p className="text-sm text-slate-400">Estos datos permiten que ventas y comprobantes usen un lenguaje simple, basado en alias.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <div className="mb-1.5 text-sm text-slate-300">Alias visible para ventas</div>
                  <input className="input-modern w-full text-sm" value={form.alias_cuenta} onChange={(e) => setForm((prev) => ({ ...prev, alias_cuenta: e.target.value }))} />
                </label>
                <label className="block">
                  <div className="mb-1.5 text-sm text-slate-300">Banco</div>
                  <input className="input-modern w-full text-sm" value={form.banco} onChange={(e) => setForm((prev) => ({ ...prev, banco: e.target.value }))} />
                </label>
                <label className="block md:col-span-2">
                  <div className="mb-1.5 text-sm text-slate-300">CBU</div>
                  <input className="input-modern w-full text-sm" value={form.cbu} onChange={(e) => setForm((prev) => ({ ...prev, cbu: e.target.value }))} />
                </label>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <label className="block">
                <div className="mb-1.5 flex items-center gap-2 text-sm text-slate-300">
                  <Clock3 size={15} />
                  Reposición estimada
                </div>
                <input
                  type="number"
                  min="0"
                  className="input-modern w-full text-sm"
                  value={form.tiempo_reposicion_dias}
                  onChange={(e) => setForm((prev) => ({ ...prev, tiempo_reposicion_dias: e.target.value }))}
                  placeholder="Días"
                />
              </label>
              <label className="block">
                <div className="mb-1.5 text-sm text-slate-300">Notas internas</div>
                <textarea
                  rows={4}
                  className="input-modern w-full text-sm"
                  value={form.notas_internas}
                  onChange={(e) => setForm((prev) => ({ ...prev, notas_internas: e.target.value }))}
                  placeholder="Acuerdos, horarios, observaciones o recordatorios"
                />
              </label>
            </div>

            <label className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked }))}
                className="h-4 w-4 rounded border-white/15 bg-transparent"
              />
              Proveedor activo para compras y cuenta empresa
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className={[
                  'rounded-2xl px-4 py-3 text-sm font-medium transition',
                  canSubmit
                    ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                    : 'cursor-not-allowed bg-emerald-500/30 text-emerald-100',
                ].join(' ')}
              >
                {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear proveedor'}
              </button>
              <button
                type="button"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 hover:bg-white/10"
                onClick={resetForm}
              >
                Limpiar
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
