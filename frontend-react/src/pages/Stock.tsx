import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Api } from '../lib/api';
import { formatARS, formatFechaHora } from '../lib/formatters';

type InventarioItem = {
  producto_id: number;
  codigo?: string | null;
  nombre: string;
  categoria?: string | null;
  costo_pesos?: number | null;
  cantidad_disponible: number;
  cantidad_reservada: number;
  stock_minimo: number;
};

type Movimiento = {
  id: number;
  producto_id: number;
  producto_nombre?: string | null;
  producto_codigo?: string | null;
  tipo: 'entrada' | 'salida';
  cantidad: number;
  motivo: string;
  referencia: string;
  fecha: string;
  deposito_id?: number | null;
  deposito_nombre?: string | null;
  usuario_id?: number | null;
  usuario_nombre?: string | null;
};

type HistorialVentaProducto = {
  venta_id: number;
  fecha: string;
  estado_pago: string;
  estado_entrega?: string | null;
  usuario_id?: number | null;
  deposito_id?: number | null;
  deposito_nombre?: string | null;
  cliente_id?: number | null;
  cliente_nombre?: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  vendedor_nombre?: string | null;
};

function formatUnits(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('es-AR') : '0';
}

function getStockState(item: InventarioItem) {
  const disponible = Number(item.cantidad_disponible || 0);
  const minimo = Number(item.stock_minimo || 0);
  if (disponible <= 0) {
    return {
      label: 'Sin stock',
      className: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
    };
  }
  if (minimo > 0 && disponible <= minimo) {
    return {
      label: 'Bajo',
      className: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    };
  }
  return {
    label: 'OK',
    className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  };
}

export default function Stock() {
  const [items, setItems] = useState<InventarioItem[]>([]);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [salesHistory, setSalesHistory] = useState<HistorialVentaProducto[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const location = useLocation();
  const deferredQ = useDeferredValue(q.trim());

  const depositoId = useMemo(() => {
    const dep = new URLSearchParams(location.search).get('deposito_id');
    const n = Number(dep || 0);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [location.search]);

  const selectedItem = useMemo(
    () => items.find((item) => Number(item.producto_id) === Number(selectedProductId)) || null,
    [items, selectedProductId]
  );

  const metrics = useMemo(() => {
    const totalProductos = items.length;
    const totalDisponible = items.reduce(
      (acc, item) => acc + Number(item.cantidad_disponible || 0),
      0
    );
    const sinStock = items.filter((item) => Number(item.cantidad_disponible || 0) <= 0).length;
    const stockBajo = items.filter((item) => {
      const disponible = Number(item.cantidad_disponible || 0);
      const minimo = Number(item.stock_minimo || 0);
      return minimo > 0 && disponible > 0 && disponible <= minimo;
    }).length;
    return { totalProductos, totalDisponible, sinStock, stockBajo };
  }, [items]);

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      setLoadingSummary(true);
      setError(null);
      try {
        const data = await Api.inventario({
          q: deferredQ || undefined,
          deposito_id: depositoId || undefined,
          limit: 200,
        });
        if (!active) return;
        setItems(Array.isArray(data) ? (data as InventarioItem[]) : []);
      } catch (err: any) {
        if (!active) return;
        setItems([]);
        setError(err?.message || 'No se pudo cargar el stock');
      } finally {
        if (active) setLoadingSummary(false);
      }
    }

    loadSummary();
    return () => {
      active = false;
    };
  }, [deferredQ, depositoId]);

  useEffect(() => {
    if (!items.length) {
      setSelectedProductId(null);
      return;
    }
    const currentExists = items.some(
      (item) => Number(item.producto_id) === Number(selectedProductId)
    );
    if (!currentExists) {
      setSelectedProductId(Number(items[0].producto_id));
    }
  }, [items, selectedProductId]);

  useEffect(() => {
    let active = true;

    async function loadDetail() {
      setLoadingDetail(true);
      setDetailError(null);
      try {
        const movementParams: Record<string, string | number> = {
          limit: selectedProductId ? 40 : 20,
        };
        if (depositoId) movementParams.deposito_id = depositoId;
        if (selectedProductId) movementParams.producto_id = selectedProductId;

        const movementPromise = Api.movimientos(movementParams);
        const salesPromise = selectedProductId
          ? Api.inventarioProductoHistorialVentas(selectedProductId, {
              deposito_id: depositoId || undefined,
              limit: 30,
            })
          : Promise.resolve([]);

        const [movementData, salesData] = await Promise.all([movementPromise, salesPromise]);
        if (!active) return;
        setMovs(Array.isArray(movementData) ? (movementData as Movimiento[]) : []);
        setSalesHistory(
          Array.isArray(salesData) ? (salesData as HistorialVentaProducto[]) : []
        );
      } catch (err: any) {
        if (!active) return;
        setMovs([]);
        setSalesHistory([]);
        setDetailError(err?.message || 'No se pudo cargar el detalle del producto');
      } finally {
        if (active) setLoadingDetail(false);
      }
    }

    loadDetail();
    return () => {
      active = false;
    };
  }, [selectedProductId, depositoId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="app-title">Stock</h2>
          <p className="text-sm text-slate-400">
            Busca por nombre o codigo sin escribir la descripcion completa.
            {depositoId ? ` Deposito #${depositoId}.` : ' Vista general.'}
          </p>
        </div>
        <div className="w-full lg:w-auto">
          <input
            className="input-modern text-sm w-full lg:w-[360px]"
            placeholder="Buscar producto, codigo o parte del nombre"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <article className="app-card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Productos</div>
          <div className="mt-2 text-2xl font-semibold text-slate-100">
            {formatUnits(metrics.totalProductos)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Resultados visibles</div>
        </article>
        <article className="app-card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Unidades</div>
          <div className="mt-2 text-2xl font-semibold text-slate-100">
            {formatUnits(metrics.totalDisponible)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Stock disponible sumado</div>
        </article>
        <article className="app-card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Stock bajo</div>
          <div className="mt-2 text-2xl font-semibold text-amber-300">
            {formatUnits(metrics.stockBajo)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Productos por debajo del minimo</div>
        </article>
        <article className="app-card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Sin stock</div>
          <div className="mt-2 text-2xl font-semibold text-rose-300">
            {formatUnits(metrics.sinStock)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Productos agotados</div>
        </article>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.9fr)]">
        <section className="app-card p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-100">Stock actual</h3>
              <p className="text-xs text-slate-500">
                Haz clic en un producto para ver su historial completo.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}

          {loadingSummary ? (
            <div className="py-10 text-center text-slate-400">Cargando stock...</div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-slate-500">
              {deferredQ ? 'No hay productos que coincidan con la busqueda.' : 'No hay stock para mostrar.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-slate-200">
                <thead className="text-left text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Producto</th>
                    <th className="py-2 pr-3 text-right">Disponible</th>
                    <th className="py-2 pr-3 text-right">Reservado</th>
                    <th className="py-2 pr-3 text-right">Minimo</th>
                    <th className="py-2 pr-0 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const stockState = getStockState(item);
                    const isSelected =
                      Number(item.producto_id) === Number(selectedProductId);
                    return (
                      <tr
                        key={item.producto_id}
                        className={`cursor-pointer border-t border-white/10 transition-colors ${
                          isSelected ? 'bg-white/8' : 'hover:bg-white/5'
                        }`}
                        onClick={() => setSelectedProductId(Number(item.producto_id))}
                      >
                        <td className="py-3 pr-3">
                          <div className="font-medium text-slate-100">{item.nombre}</div>
                          <div className="text-xs text-slate-500">
                            {[item.codigo, item.categoria].filter(Boolean).join(' · ') || `#${item.producto_id}`}
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-right">{formatUnits(item.cantidad_disponible)}</td>
                        <td className="py-3 pr-3 text-right text-slate-400">
                          {formatUnits(item.cantidad_reservada)}
                        </td>
                        <td className="py-3 pr-3 text-right text-slate-400">
                          {formatUnits(item.stock_minimo)}
                        </td>
                        <td className="py-3 pr-0 text-right">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${stockState.className}`}>
                            {stockState.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="app-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  {selectedItem ? selectedItem.nombre : 'Detalle del producto'}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedItem
                    ? [selectedItem.codigo, selectedItem.categoria].filter(Boolean).join(' · ') || `#${selectedItem.producto_id}`
                    : 'Selecciona un producto para ver su historial.'}
                </p>
              </div>
              {selectedItem && (
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStockState(selectedItem).className}`}>
                  {getStockState(selectedItem).label}
                </span>
              )}
            </div>

            {selectedItem && (
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs text-slate-400">Disponible</div>
                  <div className="mt-1 text-lg font-semibold text-slate-100">
                    {formatUnits(selectedItem.cantidad_disponible)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs text-slate-400">Reservado</div>
                  <div className="mt-1 text-lg font-semibold text-slate-100">
                    {formatUnits(selectedItem.cantidad_reservada)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs text-slate-400">Stock minimo</div>
                  <div className="mt-1 text-lg font-semibold text-slate-100">
                    {formatUnits(selectedItem.stock_minimo)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs text-slate-400">Costo</div>
                  <div className="mt-1 text-lg font-semibold text-slate-100">
                    {formatARS(selectedItem.costo_pesos || 0)}
                  </div>
                </div>
              </div>
            )}

            {detailError && (
              <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {detailError}
              </div>
            )}
          </section>

          <section className="app-card p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-100">Historial de ventas</h3>
              <p className="text-xs text-slate-500">
                Cliente, cantidad, precio y vendedor del producto seleccionado.
              </p>
            </div>

            {loadingDetail ? (
              <div className="py-6 text-center text-slate-400">Cargando historial...</div>
            ) : !selectedItem ? (
              <div className="py-6 text-center text-slate-500">Selecciona un producto.</div>
            ) : salesHistory.length === 0 ? (
              <div className="py-6 text-center text-slate-500">Sin ventas registradas para este producto.</div>
            ) : (
              <div className="space-y-3">
                {salesHistory.map((sale) => (
                  <article key={`${sale.venta_id}-${sale.fecha}-${sale.cantidad}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-100">
                        {sale.cliente_nombre || 'Cliente'}
                      </div>
                      <div className="text-xs text-slate-400">
                        Venta #{sale.venta_id}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
                      <div>Cantidad: <span className="text-slate-100">{formatUnits(sale.cantidad)}</span></div>
                      <div>Precio: <span className="text-slate-100">{formatARS(sale.precio_unitario)}</span></div>
                      <div>Vendedor: <span className="text-slate-100">{sale.vendedor_nombre || 'Sin vendedor'}</span></div>
                      <div>Subtotal: <span className="text-slate-100">{formatARS(sale.subtotal)}</span></div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      {formatFechaHora(sale.fecha)}
                      {sale.deposito_nombre ? ` · ${sale.deposito_nombre}` : ''}
                      {sale.estado_entrega ? ` · ${sale.estado_entrega}` : ''}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="app-card p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-100">
                {selectedItem ? 'Movimientos del producto' : 'Movimientos recientes'}
              </h3>
              <p className="text-xs text-slate-500">
                {selectedItem
                  ? 'Entradas y salidas asociadas al producto seleccionado.'
                  : 'Ultimos movimientos de stock visibles en este deposito.'}
              </p>
            </div>

            {loadingDetail ? (
              <div className="py-6 text-center text-slate-400">Cargando movimientos...</div>
            ) : movs.length === 0 ? (
              <div className="py-6 text-center text-slate-500">Sin movimientos para mostrar.</div>
            ) : (
              <div className="space-y-3">
                {movs.map((mov) => (
                  <article key={mov.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-100">
                        {mov.producto_nombre || `Producto #${mov.producto_id}`}
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          mov.tipo === 'entrada'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {mov.tipo === 'entrada' ? '+' : '-'}
                        {formatUnits(mov.cantidad)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-300">
                      {mov.motivo}
                      {mov.referencia ? ` · ${mov.referencia}` : ''}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      {formatFechaHora(mov.fecha)}
                      {mov.deposito_nombre ? ` · ${mov.deposito_nombre}` : ''}
                      {mov.usuario_nombre ? ` · ${mov.usuario_nombre}` : ''}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
