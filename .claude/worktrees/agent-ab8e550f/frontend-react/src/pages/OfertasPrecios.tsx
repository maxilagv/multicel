import { useEffect, useMemo, useState } from 'react';
import Alert from '../components/Alert';
import Button from '../ui/Button';
import { Api } from '../lib/api';

type Producto = {
  id: number;
  name: string;
  codigo?: string | null;
};

type Oferta = {
  id: number;
  nombre: string;
  descripcion?: string | null;
  tipo_oferta: 'cantidad' | 'fecha';
  producto_id?: number | null;
  producto_nombre?: string | null;
  lista_precio_objetivo: 'local' | 'distribuidor' | 'final' | 'todas';
  cantidad_minima?: number;
  descuento_pct: number;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  prioridad?: number;
  activo: boolean | number;
};

const emptyForm = {
  nombre: '',
  descripcion: '',
  tipo_oferta: 'cantidad' as 'cantidad' | 'fecha',
  producto_id: '',
  lista_precio_objetivo: 'todas' as 'local' | 'distribuidor' | 'final' | 'todas',
  cantidad_minima: '1',
  descuento_pct: '10',
  fecha_desde: '',
  fecha_hasta: '',
  prioridad: '0',
  activo: true,
};

function normalizeActive(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function toDatetimeLocalInput(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  return iso.slice(0, 16);
}

function fromDatetimeLocalInput(value?: string) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export default function OfertasPrecios() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const productoOptions = useMemo(
    () =>
      (productos || []).map((p) => ({
        value: String(p.id),
        label: `${p.name}${p.codigo ? ` (${p.codigo})` : ''}`,
      })),
    [productos]
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [offersRes, productsRes] = await Promise.all([
        Api.preciosOfertas({ inactivas: true }),
        Api.productos({ all: true }),
      ]);
      setOfertas(Array.isArray(offersRes) ? (offersRes as Oferta[]) : []);
      const parsedProducts = Array.isArray(productsRes)
        ? productsRes.map((p: any) => ({
            id: Number(p.id),
            name: String(p.name || ''),
            codigo: p.codigo || null,
          }))
        : [];
      setProductos(parsedProducts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar ofertas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm });
  }

  async function submit() {
    setError(null);
    setSuccess(null);
    const payload: any = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || undefined,
      tipo_oferta: form.tipo_oferta,
      producto_id: form.producto_id ? Number(form.producto_id) : undefined,
      lista_precio_objetivo: form.lista_precio_objetivo,
      cantidad_minima: Number(form.cantidad_minima || 1),
      descuento_pct: Number(form.descuento_pct || 0),
      prioridad: Number(form.prioridad || 0),
      activo: form.activo,
    };
    if (form.tipo_oferta === 'fecha') {
      payload.fecha_desde = fromDatetimeLocalInput(form.fecha_desde);
      payload.fecha_hasta = fromDatetimeLocalInput(form.fecha_hasta);
    }

    setSaving(true);
    try {
      if (editingId) {
        await Api.actualizarPrecioOferta(editingId, payload);
        setSuccess('Oferta actualizada');
      } else {
        await Api.crearPrecioOferta(payload);
        setSuccess('Oferta creada');
      }
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la oferta');
    } finally {
      setSaving(false);
    }
  }

  function editOffer(oferta: Oferta) {
    setEditingId(oferta.id);
    setForm({
      nombre: oferta.nombre || '',
      descripcion: oferta.descripcion || '',
      tipo_oferta: oferta.tipo_oferta || 'cantidad',
      producto_id: oferta.producto_id ? String(oferta.producto_id) : '',
      lista_precio_objetivo: oferta.lista_precio_objetivo || 'todas',
      cantidad_minima: String(oferta.cantidad_minima || 1),
      descuento_pct: String(oferta.descuento_pct || 0),
      fecha_desde: toDatetimeLocalInput(oferta.fecha_desde),
      fecha_hasta: toDatetimeLocalInput(oferta.fecha_hasta),
      prioridad: String(oferta.prioridad || 0),
      activo: normalizeActive(oferta.activo),
    });
    setError(null);
    setSuccess(null);
  }

  async function toggleOffer(oferta: Oferta) {
    try {
      await Api.actualizarPrecioOferta(oferta.id, { activo: !normalizeActive(oferta.activo) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la oferta');
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="app-title">Ofertas y listas</h2>

      {error && <Alert kind="error" message={error} />}
      {success && <Alert kind="info" message={success} />}

      <div className="app-card p-4 space-y-3">
        <div className="text-sm text-slate-200 font-medium">
          {editingId ? `Editar oferta #${editingId}` : 'Nueva oferta'}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            className="input-modern text-sm"
            placeholder="Nombre de oferta"
            value={form.nombre}
            onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
          />
          <select
            className="input-modern text-sm"
            value={form.tipo_oferta}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                tipo_oferta: e.target.value === 'fecha' ? 'fecha' : 'cantidad',
              }))
            }
          >
            <option value="cantidad">Por cantidad</option>
            <option value="fecha">Por rango de fechas</option>
          </select>
          <select
            className="input-modern text-sm"
            value={form.lista_precio_objetivo}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                lista_precio_objetivo: e.target.value as 'local' | 'distribuidor' | 'final' | 'todas',
              }))
            }
          >
            <option value="todas">Todas las listas</option>
            <option value="local">Lista local</option>
            <option value="distribuidor">Lista distribuidor</option>
            <option value="final">Lista final</option>
          </select>
          <input
            className="input-modern text-sm"
            type="number"
            step="0.01"
            min="0.01"
            max="100"
            placeholder="% descuento"
            value={form.descuento_pct}
            onChange={(e) => setForm((prev) => ({ ...prev, descuento_pct: e.target.value }))}
          />
          <select
            className="input-modern text-sm md:col-span-2"
            value={form.producto_id}
            onChange={(e) => setForm((prev) => ({ ...prev, producto_id: e.target.value }))}
          >
            <option value="">Todos los productos</option>
            {productoOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            className="input-modern text-sm"
            type="number"
            min="1"
            placeholder="Cantidad minima"
            value={form.cantidad_minima}
            onChange={(e) => setForm((prev) => ({ ...prev, cantidad_minima: e.target.value }))}
            disabled={form.tipo_oferta !== 'cantidad'}
          />
          <input
            className="input-modern text-sm"
            type="number"
            placeholder="Prioridad"
            value={form.prioridad}
            onChange={(e) => setForm((prev) => ({ ...prev, prioridad: e.target.value }))}
          />
          <input
            className="input-modern text-sm md:col-span-2"
            placeholder="Descripcion"
            value={form.descripcion}
            onChange={(e) => setForm((prev) => ({ ...prev, descripcion: e.target.value }))}
          />
          <input
            className="input-modern text-sm"
            type="datetime-local"
            value={form.fecha_desde}
            onChange={(e) => setForm((prev) => ({ ...prev, fecha_desde: e.target.value }))}
            disabled={form.tipo_oferta !== 'fecha'}
          />
          <input
            className="input-modern text-sm"
            type="datetime-local"
            value={form.fecha_hasta}
            onChange={(e) => setForm((prev) => ({ ...prev, fecha_hasta: e.target.value }))}
            disabled={form.tipo_oferta !== 'fecha'}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.activo}
            onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked }))}
          />
          Oferta activa
        </label>
        <div className="flex gap-2">
          <Button type="button" onClick={submit} loading={saving}>
            {editingId ? 'Guardar cambios' : 'Crear oferta'}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancelar
            </Button>
          )}
        </div>
      </div>

      <div className="app-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-slate-200 font-medium">Ofertas registradas</div>
          <Button type="button" variant="outline" onClick={load} disabled={loading}>
            {loading ? 'Actualizando...' : 'Recargar'}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="py-2 pr-2">Oferta</th>
                <th className="py-2 pr-2">Tipo</th>
                <th className="py-2 pr-2">Producto</th>
                <th className="py-2 pr-2">Lista</th>
                <th className="py-2 pr-2">Descuento</th>
                <th className="py-2 pr-2">Regla</th>
                <th className="py-2 pr-2">Estado</th>
                <th className="py-2 pr-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {(ofertas || []).map((o) => {
                const active = normalizeActive(o.activo);
                const rule =
                  o.tipo_oferta === 'cantidad'
                    ? `Min. ${o.cantidad_minima || 1} un.`
                    : `${o.fecha_desde ? new Date(o.fecha_desde).toLocaleDateString('es-AR') : '-'} a ${
                        o.fecha_hasta ? new Date(o.fecha_hasta).toLocaleDateString('es-AR') : '-'
                      }`;
                return (
                  <tr key={o.id} className="border-t border-white/10">
                    <td className="py-2 pr-2">
                      <div className="font-medium">{o.nombre}</div>
                      {o.descripcion && <div className="text-xs text-slate-400">{o.descripcion}</div>}
                    </td>
                    <td className="py-2 pr-2">{o.tipo_oferta === 'cantidad' ? 'Cantidad' : 'Fecha'}</td>
                    <td className="py-2 pr-2">{o.producto_nombre || 'Todos'}</td>
                    <td className="py-2 pr-2">{o.lista_precio_objetivo || 'todas'}</td>
                    <td className="py-2 pr-2">{Number(o.descuento_pct || 0).toFixed(2)}%</td>
                    <td className="py-2 pr-2">{rule}</td>
                    <td className="py-2 pr-2">{active ? 'Activa' : 'Inactiva'}</td>
                    <td className="py-2 pr-2 space-x-2">
                      <button
                        type="button"
                        className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-xs"
                        onClick={() => editOffer(o)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-xs text-indigo-100"
                        onClick={() => toggleOffer(o)}
                      >
                        {active ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!ofertas.length && (
                <tr>
                  <td className="py-3 text-slate-400" colSpan={8}>
                    No hay ofertas cargadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
