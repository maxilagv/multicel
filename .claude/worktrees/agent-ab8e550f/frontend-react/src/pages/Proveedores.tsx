import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Api } from '../lib/api';
import Alert from '../components/Alert';

type Proveedor = {
  id: number;
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  cuit_cuil?: string | null;
  fecha_registro?: string | null;
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

type ProveedorForm = {
  id: number | null;
  nombre: string;
  email: string;
  telefono: string;
  direccion: string;
  cuit_cuil: string;
};

const emptyForm: ProveedorForm = {
  id: null,
  nombre: '',
  email: '',
  telefono: '',
  direccion: '',
  cuit_cuil: '',
};

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

  const isEditing = form.id !== null;

  const canSubmit = useMemo(() => {
    return form.nombre.trim().length > 0 && !saving;
  }, [form.nombre, saving]);

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

  async function loadComprasProveedor(proveedor: Proveedor) {
    setSelectedProveedor(proveedor);
    setLoadingComprasProveedor(true);
    try {
      const data = await Api.proveedorCompras(proveedor.id);
      setComprasProveedor(
        (data || []).map((c: any) => ({
          id: c.id,
          fecha: c.fecha,
          total_costo: Number(c.total_costo ?? 0),
          moneda: c.moneda || 'ARS',
          estado_recepcion: c.estado_recepcion,
          oc_numero: c.oc_numero ?? null,
          adjunto_url: c.adjunto_url ?? null,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar compras');
    } finally {
      setLoadingComprasProveedor(false);
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
        direccion: form.direccion.trim() || undefined,
        cuit_cuil: form.cuit_cuil.trim() || undefined,
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
      direccion: item.direccion || '',
      cuit_cuil: item.cuit_cuil || '',
    });
  }

  function resetForm() {
    setForm(emptyForm);
    setSuccess(null);
  }

  return (
    <div className="space-y-6">
      <h2 className="app-title">Proveedores</h2>

      {error && <Alert kind="error" message={error} />}
      {success && <Alert kind="info" message={success} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 app-card p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="text-sm font-medium text-slate-200">Listado</div>
            <div className="flex gap-2">
              <input
                className="input-modern text-sm"
                placeholder="Buscar por nombre, email o telefono"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                className="px-3 py-1.5 rounded border border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
                onClick={() => loadProveedores(query)}
              >
                Buscar
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-xs text-slate-400">Cargando proveedores...</div>
          ) : proveedores.length === 0 ? (
            <div className="text-xs text-slate-400">Sin proveedores registrados.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs md:text-sm">
                <thead className="text-left text-slate-400">
                  <tr>
                    <th className="py-1 pr-2">Nombre</th>
                    <th className="py-1 pr-2">Email</th>
                    <th className="py-1 pr-2">Telefono</th>
                    <th className="py-1 pr-2">Direccion</th>
                    <th className="py-1 pr-2">CUIT/CUIL</th>
                    <th className="py-1 pr-2">Acciones</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {proveedores.map((p) => (
                    <tr key={p.id} className="border-t border-white/10">
                      <td className="py-1 pr-2">{p.nombre}</td>
                      <td className="py-1 pr-2">{p.email || '-'}</td>
                      <td className="py-1 pr-2">{p.telefono || '-'}</td>
                      <td className="py-1 pr-2">{p.direccion || '-'}</td>
                      <td className="py-1 pr-2">{p.cuit_cuil || '-'}</td>
                      <td className="py-1 pr-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="text-xs text-cyan-200 hover:text-cyan-100"
                            onClick={() => startEdit(p)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="text-xs text-slate-200 hover:text-slate-100"
                            onClick={() => loadComprasProveedor(p)}
                          >
                            Compras
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedProveedor && (
            <div className="border-t border-white/10 pt-3 space-y-2">
              <div className="text-sm font-medium text-slate-200">
                Compras de {selectedProveedor.nombre}
              </div>
              {loadingComprasProveedor ? (
                <div className="text-xs text-slate-400">Cargando compras...</div>
              ) : comprasProveedor.length === 0 ? (
                <div className="text-xs text-slate-400">Sin compras registradas.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="text-left text-slate-400">
                      <tr>
                        <th className="py-1 pr-2">ID</th>
                        <th className="py-1 pr-2">Fecha</th>
                        <th className="py-1 pr-2">Total</th>
                        <th className="py-1 pr-2">Moneda</th>
                        <th className="py-1 pr-2">Estado</th>
                        <th className="py-1 pr-2">OC</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-200">
                      {comprasProveedor.map((c) => (
                        <tr key={c.id} className="border-t border-white/10">
                          <td className="py-1 pr-2">{c.id}</td>
                          <td className="py-1 pr-2">
                            {c.fecha ? new Date(c.fecha).toLocaleDateString() : '-'}
                          </td>
                          <td className="py-1 pr-2">
                            {Number(c.total_costo || 0).toFixed(2)} {c.moneda}
                          </td>
                          <td className="py-1 pr-2">{c.moneda}</td>
                          <td className="py-1 pr-2 capitalize">
                            {c.estado_recepcion || 'pendiente'}
                          </td>
                          <td className="py-1 pr-2">{c.oc_numero || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="app-card p-4 space-y-3">
          <div className="text-sm font-medium text-slate-200">
            {isEditing ? 'Editar proveedor' : 'Nuevo proveedor'}
          </div>
          <form onSubmit={onSubmit} className="space-y-2">
            <input
              className="input-modern text-sm w-full"
              placeholder="Nombre"
              value={form.nombre}
              onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
              required
            />
            <input
              className="input-modern text-sm w-full"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            />
            <input
              className="input-modern text-sm w-full"
              placeholder="Telefono"
              value={form.telefono}
              onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value }))}
            />
            <input
              className="input-modern text-sm w-full"
              placeholder="Direccion"
              value={form.direccion}
              onChange={(e) => setForm((prev) => ({ ...prev, direccion: e.target.value }))}
            />
            <input
              className="input-modern text-sm w-full"
              placeholder="CUIT/CUIL"
              value={form.cuit_cuil}
              onChange={(e) => setForm((prev) => ({ ...prev, cuit_cuil: e.target.value }))}
            />

            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className={[
                  'px-3 py-1.5 rounded text-xs font-medium',
                  canSubmit
                    ? 'bg-emerald-500/80 hover:bg-emerald-500 text-white'
                    : 'bg-emerald-500/30 text-emerald-100 cursor-not-allowed',
                ].join(' ')}
              >
                {saving ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded border border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
                onClick={resetForm}
              >
                Limpiar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
