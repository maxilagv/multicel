import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Api, apiFetch } from '../lib/api';
import Alert from '../components/Alert';
import ProductPicker from '../components/ProductPicker';

type Deposito = {
  id: number;
  nombre: string;
  codigo?: string | null;
  direccion?: string | null;
  activo: boolean;
};

type InventarioRow = {
  producto_id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  cantidad_disponible: number;
  cantidad_reservada: number;
  stock_minimo: number | null;
};

type Categoria = {
  id: number;
  nombre: string;
};

type DepositoForm = {
  nombre: string;
  codigo: string;
  direccion: string;
};

const initialDepositoForm: DepositoForm = {
  nombre: '',
  codigo: '',
  direccion: '',
};

export default function Multideposito() {
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [selectedDepositoId, setSelectedDepositoId] = useState<number | ''>('');
  const [depositoForm, setDepositoForm] = useState<DepositoForm>(initialDepositoForm);
  const [inventario, setInventario] = useState<InventarioRow[]>([]);
  const [loadingDepositos, setLoadingDepositos] = useState(false);
  const [loadingInventario, setLoadingInventario] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [ajusteLoading, setAjusteLoading] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltroId, setCategoriaFiltroId] = useState<number | ''>('');

  const [ajusteProductoId, setAjusteProductoId] = useState<number | null>(null);
  const [ajusteCantidad, setAjusteCantidad] = useState<string>('');
  const [ajusteTipo, setAjusteTipo] = useState<'entrada' | 'salida'>('entrada');
  const [ajusteMotivo, setAjusteMotivo] = useState<string>('');

  const [transferProductoId, setTransferProductoId] = useState<number | ''>('');
  const [transferDestinoId, setTransferDestinoId] = useState<number | ''>('');
  const [transferCantidad, setTransferCantidad] = useState<string>('');
  const [transferMotivo, setTransferMotivo] = useState<string>('');
  const [transferLoading, setTransferLoading] = useState(false);

  const [reservaProductoId, setReservaProductoId] = useState<number | ''>('');
  const [reservaCantidad, setReservaCantidad] = useState<string>('');
  const [reservaLoading, setReservaLoading] = useState(false);

  const depositoSeleccionado = useMemo(
    () => depositos.find((d) => d.id === Number(selectedDepositoId)) || null,
    [depositos, selectedDepositoId],
  );
  const transferProductOptions = useMemo(
    () =>
      inventario.map((r) => ({
        id: r.producto_id,
        name: r.nombre,
        codigo: r.codigo,
        category_name: r.categoria,
        stock_quantity: r.cantidad_disponible,
      })),
    [inventario],
  );

  async function loadDepositos() {
    setLoadingDepositos(true);
    setError(null);
    try {
      let data: any;
      try {
        data = await apiFetch('/api/mis-depositos');
      } catch {
        data = await Api.depositos();
      }
      const list: Deposito[] = (data || []).map((d: any) => ({
        id: d.id,
        nombre: d.nombre,
        codigo: d.codigo ?? null,
        direccion: d.direccion ?? null,
        activo: Boolean(d.activo),
      }));
      setDepositos(list);
      if (!selectedDepositoId && list.length > 0) {
        setSelectedDepositoId(list[0].id);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudieron cargar los depósitos',
      );
    } finally {
      setLoadingDepositos(false);
    }
  }

  async function loadCategorias() {
    try {
      const data = await Api.categorias();
      const list: Categoria[] = (data || []).map((c: any) => ({
        id: c.id,
        nombre: c.nombre,
      }));
      setCategorias(list);
    } catch {
      // ignorar error de categorías en esta vista
    }
  }

  async function loadInventario(depositoId: number) {
    setLoadingInventario(true);
    setError(null);
    try {
      const data = await Api.inventarioDeposito(
        depositoId,
        busqueda.trim() || undefined,
      );
      let rows: InventarioRow[] = (data || []).map((r: any) => ({
        producto_id: r.producto_id,
        codigo: r.codigo,
        nombre: r.nombre,
        categoria: r.categoria,
        cantidad_disponible: Number(r.cantidad_disponible ?? 0),
        cantidad_reservada: Number(r.cantidad_reservada ?? 0),
        stock_minimo:
          typeof r.stock_minimo === 'number' ? r.stock_minimo : null,
      }));
      if (categoriaFiltroId) {
        const cat = categorias.find((c) => c.id === Number(categoriaFiltroId));
        if (cat) {
          rows = rows.filter((r) => r.categoria === cat.nombre);
        }
      }
      setInventario(rows);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudo cargar el inventario por depósito',
      );
    } finally {
      setLoadingInventario(false);
    }
  }

  useEffect(() => {
    loadDepositos();
    loadCategorias();
  }, []);

  useEffect(() => {
    if (selectedDepositoId) {
      loadInventario(Number(selectedDepositoId));
    } else {
      setInventario([]);
    }
  }, [selectedDepositoId, busqueda, categoriaFiltroId]);

  async function onSubmitDeposito(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!depositoForm.nombre.trim()) {
      setError('El nombre del depósito es obligatorio');
      return;
    }
    try {
      await Api.crearDeposito({
        nombre: depositoForm.nombre.trim(),
        codigo: depositoForm.codigo.trim() || undefined,
        direccion: depositoForm.direccion.trim() || undefined,
      });
      setDepositoForm(initialDepositoForm);
      setSuccess('Depósito creado correctamente');
      await loadDepositos();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo crear el depósito',
      );
    }
  }

  async function aplicarAjuste(
    productoId: number,
    delta: number,
    motivo?: string,
  ) {
    if (!selectedDepositoId) return;
    if (!Number.isFinite(delta) || delta === 0) return;
    setAjusteLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await Api.ajustarInventario({
        producto_id: productoId,
        cantidad: delta,
        motivo: motivo || 'ajuste multidepósito',
        referencia: `DEP ${selectedDepositoId}`,
        deposito_id: Number(selectedDepositoId),
      });
      await loadInventario(Number(selectedDepositoId));
      setSuccess('Ajuste aplicado correctamente');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudo aplicar el ajuste',
      );
    } finally {
      setAjusteLoading(false);
    }
  }

  async function onSubmitAjusteManual(e: FormEvent) {
    e.preventDefault();
    if (!selectedDepositoId || ajusteProductoId == null) return;
    const cantidadNum = Number(ajusteCantidad);
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      setError('Ingresa una cantidad positiva para el ajuste');
      return;
    }
    const signo = ajusteTipo === 'entrada' ? 1 : -1;
    await aplicarAjuste(ajusteProductoId, signo * cantidadNum, ajusteMotivo);
    setAjusteProductoId(null);
    setAjusteCantidad('');
    setAjusteMotivo('');
    setAjusteTipo('entrada');
  }

  async function manejarReserva(tipo: 'reservar' | 'liberar') {
    if (!selectedDepositoId || !reservaProductoId) return;
    const cantidadNum = Number(reservaCantidad);
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      setError('Ingresa una cantidad positiva para la reserva');
      return;
    }
    setReservaLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const path =
        tipo === 'reservar'
          ? '/api/inventario/reservar'
          : '/api/inventario/liberar';
      await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({
          producto_id: reservaProductoId,
          cantidad: cantidadNum,
          referencia: `Reserva manual DEP ${selectedDepositoId}`,
          deposito_id: Number(selectedDepositoId),
        }),
      });
      await loadInventario(Number(selectedDepositoId));
      setSuccess(
        tipo === 'reservar'
          ? 'Reserva aplicada correctamente'
          : 'Reserva liberada correctamente',
      );
      setReservaCantidad('');
      if (tipo === 'liberar') {
        setReservaProductoId('');
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : tipo === 'reservar'
          ? 'No se pudo reservar stock'
          : 'No se pudo liberar stock',
      );
    } finally {
      setReservaLoading(false);
    }
  }

  async function onSubmitTransfer(e: FormEvent) {
    e.preventDefault();
    if (!selectedDepositoId || !transferProductoId || !transferDestinoId) {
      return;
    }
    const origenId = Number(selectedDepositoId);
    const destinoId = Number(transferDestinoId);
    if (!Number.isFinite(origenId) || !Number.isFinite(destinoId)) return;
    if (origenId === destinoId) {
      setError('El depósito origen y destino deben ser distintos');
      return;
    }
    const cantidadNum = Number(transferCantidad);
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      setError('Ingresa una cantidad positiva para la transferencia');
      return;
    }
    setTransferLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await Api.transferirStock({
        producto_id: Number(transferProductoId),
        cantidad: cantidadNum,
        deposito_origen_id: origenId,
        deposito_destino_id: destinoId,
        motivo: transferMotivo || 'transferencia entre depósitos',
        referencia: 'UI multideposito',
      });
      await loadInventario(origenId);
      setSuccess('Transferencia realizada correctamente');
      setTransferProductoId('');
      setTransferDestinoId('');
      setTransferCantidad('');
      setTransferMotivo('');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudo transferir stock',
      );
    } finally {
      setTransferLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
        Multidepósito
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-4 space-y-3">
          <div className="text-sm font-medium text-slate-200">Depósitos</div>
          {error && <Alert kind="error" message={error} />}
          {success && <Alert kind="info" message={success} />}
          <form onSubmit={onSubmitDeposito} className="space-y-2">
            <input
              className="input-modern text-sm w-full"
              placeholder="Nombre del depósito"
              value={depositoForm.nombre}
              onChange={(e) =>
                setDepositoForm((prev) => ({
                  ...prev,
                  nombre: e.target.value,
                }))
              }
            />
            <input
              className="input-modern text-sm w-full"
              placeholder="Código (opcional)"
              value={depositoForm.codigo}
              onChange={(e) =>
                setDepositoForm((prev) => ({
                  ...prev,
                  codigo: e.target.value,
                }))
              }
            />
            <input
              className="input-modern text-sm w-full"
              placeholder="Dirección (opcional)"
              value={depositoForm.direccion}
              onChange={(e) =>
                setDepositoForm((prev) => ({
                  ...prev,
                  direccion: e.target.value,
                }))
              }
            />
            <button
              type="submit"
              className="w-full h-10 rounded-lg bg-primary-500 text-white text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loadingDepositos}
            >
              Crear depósito
            </button>
          </form>

          <div className="mt-3">
            <div className="text-xs text-slate-400 mb-1">
              Depósitos existentes
            </div>
            {loadingDepositos ? (
              <div className="text-xs text-slate-400">
                Cargando depósitos...
              </div>
            ) : !depositos.length ? (
              <div className="text-xs text-slate-400">
                Aún no hay depósitos creados.
              </div>
            ) : (
              <ul className="text-xs text-slate-200 space-y-1">
                {depositos.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      className="text-left flex-1 truncate hover:text-white"
                      onClick={() => setSelectedDepositoId(d.id)}
                    >
                      {d.nombre}
                      {d.codigo ? ` (${d.codigo})` : ''}
                    </button>
                    {!d.activo && (
                      <span className="text-[10px] text-amber-300">
                        inactivo
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-slate-200">
                Stock por depósito
              </div>
              <div className="text-xs text-slate-400">
                Ajusta el stock disponible por sucursal para cada producto.
              </div>
            </div>
            <div>
              <select
                className="input-modern text-sm"
                value={selectedDepositoId === '' ? '' : String(selectedDepositoId)}
                onChange={(e) =>
                  setSelectedDepositoId(
                    e.target.value ? Number(e.target.value) : '',
                  )
                }
              >
                {depositos.length === 0 && (
                  <option value="">Sin depósitos</option>
                )}
                {depositos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                    {d.codigo ? ` (${d.codigo})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!selectedDepositoId ? (
            <div className="text-xs text-slate-400 py-4">
              Crea y selecciona un depósito para ver y ajustar su stock.
            </div>
          ) : loadingInventario ? (
            <div className="text-xs text-slate-400 py-4">
              Cargando inventario...
            </div>
          ) : !inventario.length ? (
            <div className="text-xs text-slate-400 py-4">
              Sin productos registrados para este depósito.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    className="input-modern text-xs md:text-sm"
                    placeholder="Buscar por código o nombre"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                  />
                  {busqueda && (
                    <button
                      type="button"
                      className="text-[11px] text-slate-300 hover:text-white"
                      onClick={() => setBusqueda('')}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="input-modern text-xs md:text-sm"
                    value={
                      categoriaFiltroId === '' ? '' : String(categoriaFiltroId)
                    }
                    onChange={(e) =>
                      setCategoriaFiltroId(
                        e.target.value ? Number(e.target.value) : '',
                      )
                    }
                  >
                    <option value="">Todas las categorías</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                  {selectedDepositoId && (
                    <Link
                      to={`/app/stock?deposito_id=${selectedDepositoId}`}
                      className="text-[11px] text-sky-300 hover:text-sky-200 underline"
                    >
                      Ver historial de movimientos
                    </Link>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-xs md:text-sm">
                  <thead className="text-left text-slate-400">
                    <tr>
                      <th className="py-1 pr-2">Código</th>
                      <th className="py-1 pr-2">Producto</th>
                      <th className="py-1 pr-2">Categoría</th>
                      <th className="py-1 pr-2 text-right">Disponible</th>
                      <th className="py-1 pr-2 text-right">Reservado</th>
                      <th className="py-1 pr-2 text-right">Stock mínimo</th>
                      <th className="py-1 pr-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {inventario.map((row) => (
                      <tr
                        key={row.producto_id}
                        className="border-t border-white/10 hover:bg-white/5"
                      >
                        <td className="py-1 pr-2 text-xs">{row.codigo}</td>
                        <td className="py-1 pr-2">{row.nombre}</td>
                        <td className="py-1 pr-2 text-xs">{row.categoria}</td>
                        <td className="py-1 pr-2 text-right">
                          <span
                            className={
                              row.stock_minimo != null &&
                              row.cantidad_disponible < row.stock_minimo
                                ? 'text-rose-300 font-semibold'
                                : undefined
                            }
                          >
                            {row.cantidad_disponible}
                          </span>
                        </td>
                        <td className="py-1 pr-2 text-right">
                          {row.cantidad_reservada}
                        </td>
                        <td className="py-1 pr-2 text-right">
                          {row.stock_minimo != null ? row.stock_minimo : '-'}
                        </td>
                        <td className="py-1 pr-2">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              className="px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-100 text-[11px]"
                              disabled={ajusteLoading}
                              onClick={() => {
                                setAjusteProductoId(row.producto_id);
                                setAjusteCantidad('');
                                setAjusteTipo('entrada');
                                setAjusteMotivo('');
                              }}
                            >
                              Ajustar
                            </button>
                            <button
                              type="button"
                              className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-100 text-[11px]"
                              onClick={() => {
                                setReservaProductoId(row.producto_id);
                                setReservaCantidad('');
                              }}
                            >
                              Reserva
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {ajusteProductoId && depositoSeleccionado && (
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2 text-xs md:text-sm">
                  <div className="font-medium text-slate-200 mb-1">
                    Ajuste manual de stock
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Producto:{' '}
                    <span className="text-slate-200">
                      {
                        inventario.find(
                          (r) => r.producto_id === ajusteProductoId,
                        )?.nombre
                      }
                    </span>
                    {depositoSeleccionado && (
                      <> {' · '}Depósito {depositoSeleccionado.nombre}</>
                    )}
                  </div>
                  <form
                    onSubmit={onSubmitAjusteManual}
                    className="flex flex-col sm:flex-row gap-2 sm:items-end"
                  >
                    <div className="flex-1">
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Cantidad
                      </label>
                      <input
                        type="number"
                        className="input-modern text-xs md:text-sm w-full"
                        value={ajusteCantidad}
                        onChange={(e) => setAjusteCantidad(e.target.value)}
                        min={0}
                        step={1}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Tipo
                      </label>
                      <select
                        className="input-modern text-xs md:text-sm"
                        value={ajusteTipo}
                        onChange={(e) =>
                          setAjusteTipo(
                            e.target.value === 'salida' ? 'salida' : 'entrada',
                          )
                        }
                      >
                        <option value="entrada">Entrada</option>
                        <option value="salida">Salida</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Motivo (opcional)
                      </label>
                      <input
                        className="input-modern text-xs md:text-sm w-full"
                        value={ajusteMotivo}
                        onChange={(e) => setAjusteMotivo(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      className="h-9 px-3 rounded-lg bg-indigo-500 text-white text-[11px] font-medium disabled:opacity-60"
                      disabled={ajusteLoading}
                    >
                      Aplicar ajuste
                    </button>
                  </form>
                </div>
              )}

              {reservaProductoId && selectedDepositoId && (
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2 text-xs md:text-sm">
                  <div className="font-medium text-slate-200 mb-1">
                    Reservas de stock
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Producto:{' '}
                    <span className="text-slate-200">
                      {
                        inventario.find(
                          (r) => r.producto_id === reservaProductoId,
                        )?.nombre
                      }
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div className="flex-1">
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Cantidad
                      </label>
                      <input
                        type="number"
                        className="input-modern text-xs md:text-sm w-full"
                        value={reservaCantidad}
                        onChange={(e) => setReservaCantidad(e.target.value)}
                        min={0}
                        step={1}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="h-9 px-3 rounded-lg bg-amber-500 text-white text-[11px] font-medium disabled:opacity-60"
                        disabled={reservaLoading}
                        onClick={() => manejarReserva('reservar')}
                      >
                        Reservar
                      </button>
                      <button
                        type="button"
                        className="h-9 px-3 rounded-lg bg-slate-600 text-white text-[11px] font-medium disabled:opacity-60"
                        disabled={reservaLoading}
                        onClick={() => manejarReserva('liberar')}
                      >
                        Liberar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selectedDepositoId && inventario.length > 0 && (
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2 text-xs md:text-sm">
                  <div className="font-medium text-slate-200 mb-1">
                    Transferir stock entre depósitos
                  </div>
                  <form
                    onSubmit={onSubmitTransfer}
                    className="grid grid-cols-1 md:grid-cols-4 gap-2 md:items-end"
                  >
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Producto
                      </label>
                      <ProductPicker
                        options={transferProductOptions}
                        value={transferProductoId === '' ? null : Number(transferProductoId)}
                        onChange={(id) => setTransferProductoId(id == null ? '' : Number(id))}
                        placeholder="Seleccionar..."
                        buttonClassName="h-10 text-xs md:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Depósito destino
                      </label>
                      <select
                        className="input-modern text-xs md:text-sm w-full"
                        value={
                          transferDestinoId === ''
                            ? ''
                            : String(transferDestinoId)
                        }
                        onChange={(e) =>
                          setTransferDestinoId(
                            e.target.value ? Number(e.target.value) : '',
                          )
                        }
                      >
                        <option value="">Seleccionar...</option>
                        {depositos
                          .filter((d) => d.id !== Number(selectedDepositoId))
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nombre}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Cantidad
                      </label>
                      <input
                        type="number"
                        className="input-modern text-xs md:text-sm w-full"
                        value={transferCantidad}
                        onChange={(e) => setTransferCantidad(e.target.value)}
                        min={0}
                        step={1}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Motivo (opcional)
                      </label>
                      <input
                        className="input-modern text-xs md:text-sm w-full"
                        value={transferMotivo}
                        onChange={(e) => setTransferMotivo(e.target.value)}
                      />
                      <button
                        type="submit"
                        className="h-9 px-3 rounded-lg bg-emerald-500 text-white text-[11px] font-medium disabled:opacity-60"
                        disabled={transferLoading}
                      >
                        Transferir
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
