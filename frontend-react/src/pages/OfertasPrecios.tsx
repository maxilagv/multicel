import { useEffect, useMemo, useState } from 'react';
import Alert from '../components/Alert';
import ProductPicker, { type ProductPickerOption } from '../components/ProductPicker';
import Button from '../ui/Button';
import { Api } from '../lib/api';
import { uploadImageToCloudinary } from '../lib/cloudinary';
import { usePriceConfig } from '../context/PriceConfigContext';

type Producto = {
  id: number;
  name: string;
  codigo?: string | null;
};

type Oferta = {
  id: number;
  nombre: string;
  descripcion?: string | null;
  packaging_image_url?: string | null;
  tipo_oferta: 'cantidad' | 'fecha';
  producto_id?: number | null;
  producto_ids?: number[];
  producto_nombre?: string | null;
  producto_nombres?: string[];
  lista_precio_id?: number | null;
  lista_precio_objetivo: string;
  lista_precio_nombre?: string | null;
  lista_precio_slug?: string | null;
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
  packaging_image_url: '',
  tipo_oferta: 'cantidad' as 'cantidad' | 'fecha',
  aplica_todos_productos: true,
  producto_ids: [] as string[],
  lista_precio_objetivo: 'todas',
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

function listCodeToLabel(
  code: string | undefined,
  lists: Array<{ key: string; slug: string; legacy_code?: string | null; label: string; nombre: string }>
) {
  const normalized = String(code || '').trim().toLowerCase();
  const list = lists.find(
    (item) =>
      item.key === normalized ||
      item.slug === normalized ||
      String(item.legacy_code || '').trim().toLowerCase() === normalized
  );
  if (list) return list.label || list.nombre;
  return 'Todas las listas';
}

export default function OfertasPrecios() {
  const { lists: priceLists } = usePriceConfig();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadingPackaging, setUploadingPackaging] = useState(false);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [productoAAgregar, setProductoAAgregar] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const productoOptions = useMemo<ProductPickerOption[]>(
    () =>
      (productos || []).map((p) => ({
        id: Number(p.id),
        name: String(p.name || ''),
        codigo: p.codigo || null,
      })),
    [productos]
  );

  const productosSeleccionados = useMemo(() => {
    const selected = new Set(
      form.producto_ids
        .map((value) => Number(value))
        .filter((n) => Number.isInteger(n) && n > 0)
    );
    return (productos || []).filter((product) => selected.has(Number(product.id)));
  }, [form.producto_ids, productos]);

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
    setProductoAAgregar(null);
    setForm({ ...emptyForm });
  }

  async function submit() {
    setError(null);
    setSuccess(null);
    const payload: any = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || undefined,
      packaging_image_url: form.packaging_image_url.trim() || undefined,
      tipo_oferta: form.tipo_oferta,
      producto_ids: form.aplica_todos_productos
        ? []
        : form.producto_ids
            .map((value) => Number(value))
            .filter((n) => Number.isInteger(n) && n > 0),
      cantidad_minima: Number(form.cantidad_minima || 1),
      descuento_pct: Number(form.descuento_pct || 0),
      prioridad: Number(form.prioridad || 0),
      activo: form.activo,
    };
    if (form.lista_precio_objetivo === 'todas') {
      payload.lista_precio_objetivo = 'todas';
    } else {
      const selectedList = priceLists.find((item) => item.key === form.lista_precio_objetivo);
      payload.lista_precio_objetivo = selectedList?.key || form.lista_precio_objetivo;
      if (selectedList?.id) payload.lista_precio_id = selectedList.id;
    }
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
    const selectedList =
      oferta.lista_precio_id != null
        ? priceLists.find((item) => Number(item.id) === Number(oferta.lista_precio_id))
        : null;
    const selectedIds = Array.from(
      new Set(
        [
          ...(Array.isArray(oferta.producto_ids) ? oferta.producto_ids : []),
          oferta.producto_id,
        ]
          .map((value) => Number(value))
          .filter((n) => Number.isInteger(n) && n > 0)
          .map((n) => String(n))
      )
    );
    setEditingId(oferta.id);
    setForm({
      nombre: oferta.nombre || '',
      descripcion: oferta.descripcion || '',
      packaging_image_url: oferta.packaging_image_url || '',
      tipo_oferta: oferta.tipo_oferta || 'cantidad',
      aplica_todos_productos: selectedIds.length === 0,
      producto_ids: selectedIds,
      lista_precio_objetivo: selectedList?.key || oferta.lista_precio_objetivo || 'todas',
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

  function agregarProductoSeleccionado() {
    if (!productoAAgregar || form.aplica_todos_productos) return;
    setForm((prev) => {
      const exists = prev.producto_ids.includes(String(productoAAgregar));
      if (exists) return prev;
      return {
        ...prev,
        producto_ids: [...prev.producto_ids, String(productoAAgregar)],
      };
    });
    setProductoAAgregar(null);
  }

  function quitarProductoSeleccionado(productoId: number) {
    setForm((prev) => ({
      ...prev,
      producto_ids: prev.producto_ids.filter((id) => Number(id) !== Number(productoId)),
    }));
  }

  async function toggleOffer(oferta: Oferta) {
    try {
      await Api.actualizarPrecioOferta(oferta.id, { activo: !normalizeActive(oferta.activo) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la oferta');
    }
  }

  async function handlePackagingFile(file?: File | null) {
    if (!file) return;
    setError(null);
    setSuccess(null);
    setUploadingPackaging(true);
    try {
      const url = await uploadImageToCloudinary(file);
      setForm((prev) => ({ ...prev, packaging_image_url: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el packaging');
    } finally {
      setUploadingPackaging(false);
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
                lista_precio_objetivo: e.target.value,
              }))
            }
          >
            <option value="todas">Todas las listas</option>
            {priceLists
              .filter((item) => item.enabled)
              .map((item) => (
                <option key={item.id} value={item.key}>
                  {item.label}
                </option>
              ))}
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
          <div className="md:col-span-2 space-y-2">
            <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
              {form.lista_precio_objetivo === 'todas'
                ? 'La oferta aplica sobre todas las listas activas. En venta se calcula sobre la lista elegida en esa venta.'
                : `La oferta aplica sobre: ${listCodeToLabel(form.lista_precio_objetivo, priceLists)}.`}
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={form.aplica_todos_productos}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    aplica_todos_productos: e.target.checked,
                    producto_ids: e.target.checked ? [] : prev.producto_ids,
                  }))
                }
              />
              Aplicar a todos los productos
            </label>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
              <ProductPicker
                options={productoOptions}
                value={productoAAgregar}
                onChange={(id) => setProductoAAgregar(id)}
                placeholder="Buscar producto para agregar"
                disabled={form.aplica_todos_productos}
                allowClear
              />
              <Button
                type="button"
                variant="outline"
                disabled={form.aplica_todos_productos || !productoAAgregar}
                onClick={agregarProductoSeleccionado}
              >
                Agregar
              </Button>
            </div>

            <div className="text-xs text-slate-400">
              Productos seleccionados: {form.aplica_todos_productos ? 'Todos' : productosSeleccionados.length}
            </div>
            {!form.aplica_todos_productos && (
              <div className="max-h-28 overflow-auto rounded-lg border border-white/10 bg-white/5 p-2 space-y-1">
                {productosSeleccionados.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-white/5 border border-white/10 px-2 py-1"
                  >
                    <div className="text-xs text-slate-200 truncate">
                      {product.name}
                      {product.codigo ? ` (${product.codigo})` : ''}
                    </div>
                    <button
                      type="button"
                      className="text-xs rounded border border-white/20 px-1.5 py-0.5 hover:bg-white/10"
                      onClick={() => quitarProductoSeleccionado(product.id)}
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                {!productosSeleccionados.length && (
                  <div className="text-xs text-slate-500">No hay productos seleccionados.</div>
                )}
              </div>
            )}
            <div className="text-xs text-slate-500">
              Activa "todos" o agrega productos uno por uno.
            </div>
          </div>
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
          <div className="md:col-span-2 flex flex-col gap-2">
            <div className="text-xs text-slate-400">Imagen de packaging</div>
            <div className="flex flex-col md:flex-row gap-2">
              <input
                className="input-modern text-sm flex-1"
                placeholder="URL imagen packaging"
                value={form.packaging_image_url}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, packaging_image_url: e.target.value }))
                }
              />
              <input
                className="input-modern text-sm md:w-[250px]"
                type="file"
                accept="image/*"
                onChange={(e) => handlePackagingFile(e.target.files?.[0])}
              />
            </div>
            {uploadingPackaging && (
              <div className="text-xs text-slate-400">Subiendo imagen de packaging...</div>
            )}
            {form.packaging_image_url && (
              <img
                src={form.packaging_image_url}
                alt="Packaging"
                className="h-16 w-16 rounded-lg object-cover border border-white/10"
              />
            )}
          </div>
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
                      {o.packaging_image_url && (
                        <img
                          src={o.packaging_image_url}
                          alt={`${o.nombre} packaging`}
                          className="mt-1 h-10 w-10 rounded object-cover border border-white/10"
                        />
                      )}
                    </td>
                    <td className="py-2 pr-2">{o.tipo_oferta === 'cantidad' ? 'Cantidad' : 'Fecha'}</td>
                    <td className="py-2 pr-2">
                      {Array.isArray(o.producto_nombres) && o.producto_nombres.length
                        ? o.producto_nombres.join(', ')
                        : o.producto_nombre || 'Todos'}
                    </td>
                    <td className="py-2 pr-2">
                      {o.lista_precio_nombre ||
                        listCodeToLabel(o.lista_precio_objetivo || 'todas', priceLists)}
                    </td>
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
