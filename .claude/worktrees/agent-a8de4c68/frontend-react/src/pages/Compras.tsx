import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Api } from '../lib/api';
import Alert from '../components/Alert';
import { useAuth } from '../context/AuthContext';
import { getRoleFromToken } from '../lib/auth';
import ProductPicker from '../components/ProductPicker';

type Producto = {
  id: number;
  name: string;
  codigo?: string | null;
  category_name?: string;
  stock_quantity: number;
  price: number;
  costo_pesos?: number | null;
  costo_dolares?: number | null;
};

type Proveedor = {
  id: number;
  nombre: string;
  telefono?: string | null;
  direccion?: string | null;
};

type Deposito = {
  id: number;
  nombre: string;
  codigo?: string | null;
};

type Moneda = 'ARS' | 'USD' | 'CNY';

type CompraItem = {
  id: string;
  producto_id: number | '';
  cantidad: string;
  costo_unitario: string;
  costo_envio: string;
};

type CompraRow = {
  id: number;
  proveedor_nombre: string;
  fecha: string;
  total_costo: number;
  moneda: string;
  estado: string;
  estado_recepcion?: string;
  oc_numero?: string | null;
  adjunto_url?: string | null;
  total_cantidad?: number;
  total_recibida?: number;
};

type CompraDetalleItem = {
  id: number;
  producto_id: number;
  producto_nombre: string;
  cantidad: number;
  cantidad_recibida: number;
  costo_unitario: number;
  costo_envio: number;
  subtotal: number;
  moneda: string;
  tipo_cambio: number | null;
};

type RecepcionItem = {
  producto_id: number;
  producto_nombre: string;
  pendiente: number;
  cantidad_recibir: string;
};

const COST_ALERT_PCT = 0.15;

function newItem(): CompraItem {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    producto_id: '',
    cantidad: '',
    costo_unitario: '',
    costo_envio: '',
  };
}

function toNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function Compras() {
  const { accessToken } = useAuth();
  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const canManagePurchases = role === 'admin' || role === 'gerente';

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loadingProductos, setLoadingProductos] = useState(true);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loadingProveedores, setLoadingProveedores] = useState(true);
  const [compras, setCompras] = useState<CompraRow[]>([]);
  const [loadingCompras, setLoadingCompras] = useState(true);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [depositoId, setDepositoId] = useState<number | ''>('');
  const [proveedorId, setProveedorId] = useState<number | ''>('');
  const [moneda, setMoneda] = useState<Moneda>('ARS');
  const [tipoCambio, setTipoCambio] = useState('');
  const [dolarBlue, setDolarBlue] = useState<number | null>(null);
  const [notas, setNotas] = useState('');
  const [ocNumero, setOcNumero] = useState('');
  const [adjuntoUrl, setAdjuntoUrl] = useState('');
  const [recepcionInmediata, setRecepcionInmediata] = useState(true);
  const [items, setItems] = useState<CompraItem[]>([newItem()]);
  const [error, setError] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [selectedCompra, setSelectedCompra] = useState<CompraRow | null>(null);
  const [detalleCompra, setDetalleCompra] = useState<CompraDetalleItem[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [recepcionItems, setRecepcionItems] = useState<RecepcionItem[]>([]);
  const [recepcionNotas, setRecepcionNotas] = useState('');
  const [recepcionSubmitting, setRecepcionSubmitting] = useState(false);

  const fx = useMemo(() => {
    if (moneda === 'ARS') return null;
    const n = Number(tipoCambio);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [moneda, tipoCambio]);

  const totals = useMemo(() => {
    let total = 0;
    for (const item of items) {
      const cantidad = Math.max(0, parseInt(item.cantidad || '0', 10) || 0);
      const costo = toNumber(item.costo_unitario);
      const envio = toNumber(item.costo_envio);
      total += cantidad * costo + envio;
    }
    const totalArs = moneda === 'ARS' ? total : fx ? total * fx : null;
    return { total, totalArs };
  }, [items, moneda, fx]);

  const itemsValid = useMemo(() => {
    if (!items.length) return false;
    return items.every((item) => {
      const cantidad = parseInt(item.cantidad || '0', 10) || 0;
      const costo = toNumber(item.costo_unitario);
      return !!item.producto_id && cantidad > 0 && costo > 0;
    });
  }, [items]);

  const formValid = useMemo(() => {
    if (!proveedorId) return false;
    if (recepcionInmediata && !depositoId) return false;
    if (!itemsValid) return false;
    if (moneda !== 'ARS' && !fx) return false;
    return true;
  }, [proveedorId, depositoId, itemsValid, moneda, fx, recepcionInmediata]);

  const canSubmitNow = formValid && canManagePurchases && !submitting;
  const productOptions = useMemo(
    () =>
      productos.map((p) => ({
        id: p.id,
        name: p.name,
        category_name: p.category_name || null,
        codigo: p.codigo || null,
        stock_quantity: p.stock_quantity,
        extra: `${p.category_name ? `${p.category_name} · ` : ''}Stock: ${p.stock_quantity}`,
      })),
    [productos],
  );

  async function loadProductos() {
    setLoadingProductos(true);
    setError(null);
    try {
      const data = await Api.productos({ all: true });
      setProductos(
        (data || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          codigo: r.codigo ?? null,
          category_name: r.category_name,
          stock_quantity: Number(r.stock_quantity ?? 0),
          price: Number(r.price ?? 0),
          costo_pesos: r.costo_pesos ?? null,
          costo_dolares: r.costo_dolares ?? null,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando productos');
    } finally {
      setLoadingProductos(false);
    }
  }

  async function loadProveedores() {
    setLoadingProveedores(true);
    try {
      const data = await Api.proveedores();
      setProveedores(
        (data || []).map((r: any) => ({
          id: r.id,
          nombre: r.nombre,
          telefono: r.telefono,
          direccion: r.direccion,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando proveedores');
    } finally {
      setLoadingProveedores(false);
    }
  }

  async function loadCompras() {
    setLoadingCompras(true);
    try {
      const data = await Api.compras();
      const mapped = (data || []).map((r: any) => ({
        id: r.id,
        proveedor_nombre: r.proveedor_nombre,
        fecha: r.fecha,
        total_costo: Number(r.total_costo ?? 0),
        moneda: r.moneda || 'ARS',
        estado: r.estado || 'pendiente',
        estado_recepcion: r.estado_recepcion,
        oc_numero: r.oc_numero ?? null,
        adjunto_url: r.adjunto_url ?? null,
        total_cantidad: r.total_cantidad ? Number(r.total_cantidad) : 0,
        total_recibida: r.total_recibida ? Number(r.total_recibida) : 0,
      }));
      setCompras(mapped);
      return mapped;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando compras');
      return [];
    } finally {
      setLoadingCompras(false);
    }
  }

  async function loadDepositos() {
    try {
      const data = await Api.depositos();
      setDepositos(
        (data || []).map((d: any) => ({
          id: d.id,
          nombre: d.nombre,
          codigo: d.codigo,
        }))
      );
      if (!depositoId && (data || []).length > 0) {
        setDepositoId((data as any)[0].id);
      }
    } catch (e) {
      console.error('Error cargando depositos', e);
    }
  }

  async function loadDolarBlue() {
    try {
      const data = await Api.getDolarBlue();
      if (typeof data?.valor === 'number') {
        setDolarBlue(data.valor);
      } else {
        setDolarBlue(null);
      }
    } catch (_) {
      setDolarBlue(null);
    }
  }

  useEffect(() => {
    loadProductos();
    loadProveedores();
    loadCompras();
    loadDepositos();
    loadDolarBlue();
  }, []);

  useEffect(() => {
    if (moneda === 'ARS') {
      setTipoCambio('');
      return;
    }
    if (!tipoCambio && dolarBlue && dolarBlue > 0) {
      setTipoCambio(String(dolarBlue));
    }
  }, [moneda, dolarBlue, tipoCambio]);

  function updateItem(id: string, patch: Partial<CompraItem>) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function removeItem(id: string) {
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((item) => item.id !== id);
    });
  }

  async function loadDetalle(compra: CompraRow) {
    setSelectedCompra(compra);
    setLoadingDetalle(true);
    try {
      const data = await Api.compraDetalle(compra.id);
      const mapped = (data || []).map((d: any) => ({
        id: d.id,
        producto_id: d.producto_id,
        producto_nombre: d.producto_nombre,
        cantidad: Number(d.cantidad || 0),
        cantidad_recibida: Number(d.cantidad_recibida || 0),
        costo_unitario: Number(d.costo_unitario || 0),
        costo_envio: Number(d.costo_envio || 0),
        subtotal: Number(d.subtotal || 0),
        moneda: d.moneda || compra.moneda,
        tipo_cambio: d.tipo_cambio ? Number(d.tipo_cambio) : null,
      }));
      setDetalleCompra(mapped);
      const recepcion = mapped
        .map((item: CompraDetalleItem) => {
          const pendiente = Math.max(0, item.cantidad - item.cantidad_recibida);
          return {
            producto_id: item.producto_id,
            producto_nombre: item.producto_nombre,
            pendiente,
            cantidad_recibir: pendiente > 0 ? String(pendiente) : '0',
          };
        })
        .filter((item: RecepcionItem) => item.pendiente > 0);
      setRecepcionItems(recepcion);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle');
    } finally {
      setLoadingDetalle(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canManagePurchases) {
      setError('No tienes permisos para registrar compras (solo admin o gerente).');
      return;
    }
    if (!formValid) return;

    setError(null);
    setSavedDraft(false);
    setSubmitting(true);
    try {
      const detalle = items.map((item) => ({
        producto_id: Number(item.producto_id),
        cantidad: Math.max(1, parseInt(item.cantidad || '0', 10) || 0),
        costo_unitario: toNumber(item.costo_unitario),
        costo_envio: toNumber(item.costo_envio) || 0,
        moneda,
        tipo_cambio: moneda === 'ARS' ? undefined : fx || undefined,
      }));

      const compra = await Api.crearCompra({
        proveedor_id: Number(proveedorId),
        fecha: new Date().toISOString(),
        moneda,
        detalle,
        oc_numero: ocNumero || undefined,
        adjunto_url: adjuntoUrl || undefined,
      });

      if (recepcionInmediata) {
        await Api.recibirCompra(Number(compra.id), {
          observaciones: notas || undefined,
          deposito_id: depositoId,
        });
      }

      setItems([newItem()]);
      setNotas('');
      setOcNumero('');
      setAdjuntoUrl('');
      setSavedDraft(true);
      setTimeout(() => setSavedDraft(false), 2500);

      await Promise.all([loadProductos(), loadCompras()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la compra');
    } finally {
      setSubmitting(false);
    }
  }

  async function onRecepcionSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedCompra) return;
    if (!depositoId) {
      setError('Selecciona un deposito para recibir la mercaderia.');
      return;
    }
    const detalle = recepcionItems
      .map((item) => ({
        producto_id: item.producto_id,
        cantidad: Math.max(0, parseInt(item.cantidad_recibir || '0', 10) || 0),
        pendiente: item.pendiente,
      }))
      .filter((item) => item.cantidad > 0);

    if (!detalle.length) {
      setError('No hay cantidades para recibir.');
      return;
    }

    for (const item of detalle) {
      if (item.cantidad > item.pendiente) {
        setError('La cantidad a recibir supera lo pendiente.');
        return;
      }
    }

    setRecepcionSubmitting(true);
    setError(null);
    try {
      await Api.recibirCompra(selectedCompra.id, {
        deposito_id: depositoId,
        observaciones: recepcionNotas || undefined,
        detalle: detalle.map((item) => ({
          producto_id: item.producto_id,
          cantidad: item.cantidad,
        })),
      });
      setRecepcionNotas('');
      const [updatedList] = await Promise.all([loadCompras(), loadProductos()]);
      const updated = updatedList.find((c) => c.id === selectedCompra.id) || selectedCompra;
      await loadDetalle(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la recepcion');
    } finally {
      setRecepcionSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="app-title">Compra de productos</h2>

      <div className="app-card p-4 space-y-4">
        {!canManagePurchases && (
          <Alert
            kind="warning"
            message="No tienes permisos para crear o recibir compras. Solo los usuarios con rol admin o gerente pueden registrar compras."
          />
        )}
        {error && <Alert kind="error" message={error} />}
        {moneda !== 'ARS' && !fx && (
          <Alert
            kind="warning"
            message="Configura el tipo de cambio para poder convertir la compra a pesos."
          />
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-200">Proveedor</div>
              <select
                className="input-modern text-sm w-full"
                disabled={loadingProveedores}
                value={proveedorId === '' ? '' : String(proveedorId)}
                onChange={(e) =>
                  setProveedorId(e.target.value ? Number(e.target.value) : '')
                }
              >
                <option value="">Seleccionar proveedor...</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.direccion ? ` - ${p.direccion}` : ''}
                  </option>
                ))}
              </select>
              <Link
                to="/app/proveedores"
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Gestionar proveedores
              </Link>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-200">Moneda</div>
              <select
                className="input-modern text-sm w-full"
                value={moneda}
                onChange={(e) => setMoneda(e.target.value as Moneda)}
              >
                <option value="ARS">ARS (pesos)</option>
                <option value="USD">USD (dolar)</option>
                <option value="CNY">CNY (yuan)</option>
              </select>
              {moneda !== 'ARS' && (
                <input
                  className="input-modern text-sm w-full"
                  type="number"
                  step="0.0001"
                  min={0}
                  placeholder={dolarBlue ? `Dolar actual: ${dolarBlue}` : 'Tipo de cambio'}
                  value={tipoCambio}
                  onChange={(e) => setTipoCambio(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-200">
                Deposito de recepcion
              </div>
              <select
                className="input-modern text-sm w-full"
                value={depositoId === '' ? '' : String(depositoId)}
                onChange={(e) =>
                  setDepositoId(e.target.value ? Number(e.target.value) : '')
                }
              >
                {depositos.length === 0 && (
                  <option value="">Sin depositos disponibles</option>
                )}
                {depositos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                    {d.codigo ? ` (${d.codigo})` : ''}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={recepcionInmediata}
                  onChange={(e) => setRecepcionInmediata(e.target.checked)}
                />
                Recepcion inmediata
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              className="input-modern text-sm"
              placeholder="Numero OC"
              value={ocNumero}
              onChange={(e) => setOcNumero(e.target.value)}
            />
            <input
              className="input-modern text-sm md:col-span-2"
              placeholder="Adjunto (URL o ruta)"
              value={adjuntoUrl}
              onChange={(e) => setAdjuntoUrl(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium text-slate-200">Items</div>
            {items.map((item, idx) => {
              const cantidad = Math.max(0, parseInt(item.cantidad || '0', 10) || 0);
              const costo = toNumber(item.costo_unitario);
              const envio = toNumber(item.costo_envio);
              const subtotal = cantidad * costo + envio;
              const subtotalArs = moneda === 'ARS' ? subtotal : fx ? subtotal * fx : null;
              const producto = productos.find((p) => p.id === Number(item.producto_id));
              const costoActual =
                moneda === 'ARS'
                  ? producto?.costo_pesos || null
                  : moneda === 'USD'
                  ? producto?.costo_dolares || null
                  : null;
              const costoAlerta =
                costoActual && costo > 0
                  ? (costo - costoActual) / costoActual
                  : null;
              const showAlert =
                costoAlerta !== null && costoAlerta > COST_ALERT_PCT;

              return (
                <div
                  key={item.id}
                  className="app-panel p-3"
                >
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <ProductPicker
                      options={productOptions}
                      disabled={loadingProductos}
                      value={item.producto_id === '' ? null : Number(item.producto_id)}
                      onChange={(id) =>
                        updateItem(item.id, {
                          producto_id: id == null ? '' : Number(id),
                        })
                      }
                      placeholder="Producto..."
                      className="md:col-span-5"
                      buttonClassName="h-11"
                    />
                    <input
                      className="input-modern text-sm md:col-span-2"
                      type="number"
                      min={1}
                      placeholder="Cantidad"
                      value={item.cantidad}
                      onChange={(e) =>
                        updateItem(item.id, { cantidad: e.target.value })
                      }
                    />
                    <input
                      className="input-modern text-sm md:col-span-2"
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="Costo unitario"
                      value={item.costo_unitario}
                      onChange={(e) =>
                        updateItem(item.id, { costo_unitario: e.target.value })
                      }
                    />
                    <input
                      className="input-modern text-sm md:col-span-2"
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="Costo envio"
                      value={item.costo_envio}
                      onChange={(e) =>
                        updateItem(item.id, { costo_envio: e.target.value })
                      }
                    />
                    <div className="md:col-span-1 flex items-center justify-end">
                      <button
                        type="button"
                        className="text-xs text-rose-200 hover:text-rose-100"
                        onClick={() => removeItem(item.id)}
                        disabled={items.length <= 1}
                        title={items.length <= 1 ? 'Debe haber al menos un item' : 'Eliminar item'}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-300 flex flex-wrap gap-4">
                    <span>Subtotal: {subtotal.toFixed(2)} {moneda}</span>
                    {subtotalArs !== null && moneda !== 'ARS' && (
                      <span>Subtotal ARS: {subtotalArs.toFixed(2)}</span>
                    )}
                    <span>Item #{idx + 1}</span>
                    {showAlert && (
                      <span className="text-amber-300">
                        Alerta: costo +{(costoAlerta * 100).toFixed(1)}% vs actual
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              className="px-3 py-1.5 rounded border border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
              onClick={() => setItems((prev) => [...prev, newItem()])}
            >
              Agregar item
            </button>
          </div>

          <textarea
            className="input-modern text-sm h-20"
            placeholder="Notas (opcional)"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="px-3 py-1.5 rounded border border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
              onClick={() => {
                if (submitting) return;
                setItems([newItem()]);
                setNotas('');
                setOcNumero('');
                setAdjuntoUrl('');
                setSavedDraft(false);
              }}
            >
              Limpiar
            </button>
            <button
              type="submit"
              disabled={!canSubmitNow}
              className={[
                'px-4 py-1.5 rounded text-sm font-medium',
                canSubmitNow
                  ? 'bg-emerald-500/80 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                  : 'bg-emerald-500/30 text-emerald-100 cursor-not-allowed',
              ].join(' ')}
            >
              {submitting ? 'Guardando compra...' : 'Registrar compra'}
            </button>
          </div>

          <div className="text-xs text-slate-300">
            Total: {totals.total.toFixed(2)} {moneda}
            {totals.totalArs !== null && moneda !== 'ARS' && (
              <span className="ml-3">Total ARS: {totals.totalArs.toFixed(2)}</span>
            )}
          </div>

          {savedDraft && (
            <div className="text-xs text-emerald-300">
              {recepcionInmediata
                ? 'Compra registrada correctamente y stock actualizado.'
                : 'Compra registrada. Pendiente de recepcion.'}
            </div>
          )}
        </form>

        <div className="border-t border-white/10 pt-4 space-y-2">
          <div className="text-sm font-medium text-slate-200">
            Historial de compras
          </div>
          {loadingCompras ? (
            <div className="text-xs text-slate-400 py-2">
              Cargando historial de compras...
            </div>
          ) : compras.length === 0 ? (
            <div className="text-xs text-slate-400 py-2">
              Sin compras registradas.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs md:text-sm">
                <thead className="text-left text-slate-400">
                  <tr>
                    <th className="py-1 pr-2">ID</th>
                    <th className="py-1 pr-2">Fecha</th>
                    <th className="py-1 pr-2">Proveedor</th>
                    <th className="py-1 pr-2">Total</th>
                    <th className="py-1 pr-2">Moneda</th>
                    <th className="py-1 pr-2">Estado</th>
                    <th className="py-1 pr-2">Accion</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {compras.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-white/10 hover:bg-white/5"
                    >
                      <td className="py-1 pr-2">{c.id}</td>
                      <td className="py-1 pr-2">
                        {c.fecha ? new Date(c.fecha).toLocaleString() : '-'}
                      </td>
                      <td className="py-1 pr-2">{c.proveedor_nombre}</td>
                      <td className="py-1 pr-2">
                        {Number(c.total_costo || 0).toFixed(2)} {c.moneda}
                      </td>
                      <td className="py-1 pr-2">{c.moneda}</td>
                      <td className="py-1 pr-2 capitalize">
                        {c.estado_recepcion || c.estado}
                      </td>
                      <td className="py-1 pr-2">
                        <button
                          type="button"
                          className="text-xs text-cyan-200 hover:text-cyan-100"
                          onClick={() => loadDetalle(c)}
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedCompra && (
          <div className="border-t border-white/10 pt-4 space-y-3">
            <div className="text-sm font-medium text-slate-200">
              Detalle compra #{selectedCompra.id}
            </div>
            {loadingDetalle ? (
              <div className="text-xs text-slate-400">Cargando detalle...</div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-slate-300">
                  Proveedor: {selectedCompra.proveedor_nombre} | Estado:{' '}
                  {selectedCompra.estado_recepcion || selectedCompra.estado}
                </div>
                {selectedCompra.oc_numero && (
                  <div className="text-xs text-slate-300">
                    OC: {selectedCompra.oc_numero}
                  </div>
                )}
                {selectedCompra.adjunto_url && (
                  <div className="text-xs text-slate-300">
                    Adjunto: {selectedCompra.adjunto_url}
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="text-left text-slate-400">
                      <tr>
                        <th className="py-1 pr-2">Producto</th>
                        <th className="py-1 pr-2">Cantidad</th>
                        <th className="py-1 pr-2">Recibido</th>
                        <th className="py-1 pr-2">Pendiente</th>
                        <th className="py-1 pr-2">Costo</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-200">
                      {detalleCompra.map((d) => (
                        <tr key={d.id} className="border-t border-white/10">
                          <td className="py-1 pr-2">{d.producto_nombre}</td>
                          <td className="py-1 pr-2">{d.cantidad}</td>
                          <td className="py-1 pr-2">{d.cantidad_recibida}</td>
                          <td className="py-1 pr-2">
                            {Math.max(0, d.cantidad - d.cantidad_recibida)}
                          </td>
                          <td className="py-1 pr-2">
                            {d.costo_unitario.toFixed(2)} {d.moneda || selectedCompra.moneda}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {recepcionItems.length > 0 && (
                  <form onSubmit={onRecepcionSubmit} className="space-y-2">
                    <div className="text-sm text-slate-200">Recepcionar parcial</div>
                    <div className="space-y-2">
                      {recepcionItems.map((item) => (
                        <div key={item.producto_id} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div className="text-xs text-slate-300">
                            {item.producto_nombre} (pendiente: {item.pendiente})
                          </div>
                          <input
                            className="input-modern text-sm"
                            type="number"
                            min={0}
                            max={item.pendiente}
                            value={item.cantidad_recibir}
                            onChange={(e) =>
                              setRecepcionItems((prev) =>
                                prev.map((r) =>
                                  r.producto_id === item.producto_id
                                    ? { ...r, cantidad_recibir: e.target.value }
                                    : r
                                )
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <textarea
                      className="input-modern text-sm h-16"
                      placeholder="Observaciones de recepcion"
                      value={recepcionNotas}
                      onChange={(e) => setRecepcionNotas(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={recepcionSubmitting}
                      className={[
                        'px-3 py-1.5 rounded text-xs font-medium',
                        recepcionSubmitting
                          ? 'bg-emerald-500/40 text-emerald-100 cursor-not-allowed'
                          : 'bg-emerald-500/80 hover:bg-emerald-500 text-white',
                      ].join(' ')}
                    >
                      {recepcionSubmitting ? 'Registrando...' : 'Registrar recepcion'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
