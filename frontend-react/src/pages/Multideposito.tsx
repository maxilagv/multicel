import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Warehouse,
  Plus,
  X,
  ChevronRight,
  Users,
  Package,
  AlertTriangle,
  ArrowRightLeft,
  Settings,
  Loader2,
} from 'lucide-react';
import { Api, apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { getRoleFromToken } from '../lib/auth';
import Alert from '../components/Alert';
import ProductPicker from '../components/ProductPicker';

// ─── Types ────────────────────────────────────────────────────────────────────

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

type Categoria = { id: number; nombre: string };

type UsuarioDeposito = {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  rol_deposito: string | null;
  asignado: boolean;
};

type TabId = 'inventario' | 'vendedores' | 'editar';

type AjusteModal = {
  productoId: number;
  productoNombre: string;
  tipo: 'entrada' | 'salida';
  cantidad: string;
  motivo: string;
};

type ReservaModal = {
  productoId: number;
  productoNombre: string;
  cantidad: string;
};

type TransferBatchItem = {
  producto_id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  disponible: number;
  cantidad: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  gerente: 'Gerente',
  vendedor: 'Vendedor',
  fletero: 'Fletero',
};

const ROL_DEPOSITO_OPTIONS = [
  { value: 'operador', label: 'Operador' },
  { value: 'visor', label: 'Solo lectura' },
  { value: 'admin', label: 'Administrador' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Multideposito() {
  const { accessToken } = useAuth();
  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const isAdmin = role === 'admin';
  const isManager = role === 'admin' || role === 'gerente';

  // Deposits list
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [loadingDepositos, setLoadingDepositos] = useState(false);
  const [selectedDepositoId, setSelectedDepositoId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('inventario');

  // Inventory tab
  const [inventario, setInventario] = useState<InventarioRow[]>([]);
  const [loadingInventario, setLoadingInventario] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltroId, setCategoriaFiltroId] = useState<number | ''>('');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferProductoId, setTransferProductoId] = useState<number | ''>('');
  const [transferDestinoId, setTransferDestinoId] = useState<number | ''>('');
  const [transferCantidad, setTransferCantidad] = useState('');
  const [transferMotivo, setTransferMotivo] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferItems, setTransferItems] = useState<TransferBatchItem[]>([]);

  // Vendedores tab
  const [usuarios, setUsuarios] = useState<UsuarioDeposito[]>([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [usuariosEditados, setUsuariosEditados] = useState<
    Map<number, { asignado: boolean; rol_deposito: string | null }>
  >(new Map());
  const [savingUsuarios, setSavingUsuarios] = useState(false);

  // Edit tab
  const [editForm, setEditForm] = useState({ nombre: '', codigo: '', direccion: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  // Modals
  const [showNuevoModal, setShowNuevoModal] = useState(false);
  const [nuevoForm, setNuevoForm] = useState({ nombre: '', codigo: '', direccion: '' });
  const [nuevoLoading, setNuevoLoading] = useState(false);
  const [ajusteModal, setAjusteModal] = useState<AjusteModal | null>(null);
  const [ajusteLoading, setAjusteLoading] = useState(false);
  const [reservaModal, setReservaModal] = useState<ReservaModal | null>(null);
  const [reservaLoading, setReservaLoading] = useState(false);

  // Messages
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const depositoSeleccionado = useMemo(
    () => depositos.find((d) => d.id === selectedDepositoId) ?? null,
    [depositos, selectedDepositoId],
  );

  const inventarioFiltrado = useMemo(() => {
    if (!categoriaFiltroId) return inventario;
    const cat = categorias.find((c) => c.id === Number(categoriaFiltroId));
    if (!cat) return inventario;
    return inventario.filter((r) => r.categoria === cat.nombre);
  }, [inventario, categoriaFiltroId, categorias]);

  const metricas = useMemo(() => {
    const totalProductos = inventarioFiltrado.length;
    const bajominimo = inventarioFiltrado.filter(
      (r) => r.stock_minimo != null && r.cantidad_disponible < r.stock_minimo,
    ).length;
    const totalReservado = inventarioFiltrado.reduce((s, r) => s + r.cantidad_reservada, 0);
    return { totalProductos, bajominimo, totalReservado };
  }, [inventarioFiltrado]);

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

  const transferSummary = useMemo(() => {
    const totalProductos = transferItems.length;
    const totalUnidades = transferItems.reduce((sum, item) => {
      const cantidad = Number(item.cantidad);
      return sum + (Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 0);
    }, 0);
    return { totalProductos, totalUnidades };
  }, [transferItems]);

  // ─── Loaders ──────────────────────────────────────────────────────────────

  async function loadDepositos() {
    setLoadingDepositos(true);
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
      if (selectedDepositoId == null && list.length > 0) {
        setSelectedDepositoId(list[0].id);
      }
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'No se pudieron cargar los depósitos');
    } finally {
      setLoadingDepositos(false);
    }
  }

  async function loadCategorias() {
    try {
      const data = await Api.categorias();
      setCategorias((data || []).map((c: any) => ({ id: c.id, nombre: c.nombre })));
    } catch {
      // non-critical
    }
  }

  async function loadInventario(depositoId: number) {
    setLoadingInventario(true);
    try {
      const data = await Api.inventarioDeposito(depositoId, busqueda.trim() || undefined);
      setInventario(
        (data || []).map((r: any) => ({
          producto_id: r.producto_id,
          codigo: r.codigo,
          nombre: r.nombre,
          categoria: r.categoria,
          cantidad_disponible: Number(r.cantidad_disponible ?? 0),
          cantidad_reservada: Number(r.cantidad_reservada ?? 0),
          stock_minimo: typeof r.stock_minimo === 'number' ? r.stock_minimo : null,
        })),
      );
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'No se pudo cargar el inventario');
    } finally {
      setLoadingInventario(false);
    }
  }

  async function loadUsuariosDeposito(depositoId: number) {
    setLoadingUsuarios(true);
    try {
      const data = await Api.depositoUsuarios(depositoId);
      const rows: UsuarioDeposito[] = (data || []).map((u: any) => ({
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        rol: u.rol,
        rol_deposito: u.rol_deposito ?? null,
        asignado: Boolean(u.asignado),
      }));
      setUsuarios(rows);
      const map = new Map<number, { asignado: boolean; rol_deposito: string | null }>();
      for (const u of rows) {
        map.set(u.id, { asignado: u.asignado, rol_deposito: u.rol_deposito });
      }
      setUsuariosEditados(map);
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'No se pudieron cargar los usuarios');
    } finally {
      setLoadingUsuarios(false);
    }
  }

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    loadDepositos();
    loadCategorias();
  }, []);

  useEffect(() => {
    if (selectedDepositoId == null) {
      setInventario([]);
      setUsuarios([]);
      return;
    }
    setError(null);
    setSuccess(null);
    if (activeTab === 'inventario') {
      loadInventario(selectedDepositoId);
    } else if (activeTab === 'vendedores') {
      loadUsuariosDeposito(selectedDepositoId);
    } else if (activeTab === 'editar') {
      const dep = depositos.find((d) => d.id === selectedDepositoId);
      if (dep) {
        setEditForm({ nombre: dep.nombre, codigo: dep.codigo ?? '', direccion: dep.direccion ?? '' });
        setConfirmDeactivate(false);
      }
    }
  }, [selectedDepositoId, activeTab]);

  useEffect(() => {
    if (selectedDepositoId != null && activeTab === 'inventario') {
      loadInventario(selectedDepositoId);
    }
  }, [busqueda]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function flashSuccess(msg: string) {
    setSuccess(msg);
    setError(null);
    setTimeout(() => setSuccess(null), 3500);
  }

  function flashError(msg: string) {
    setError(msg);
    setSuccess(null);
  }

  function selectDeposito(id: number) {
    setSelectedDepositoId(id);
    setActiveTab('inventario');
    setBusqueda('');
    setCategoriaFiltroId('');
    setShowTransfer(false);
    setTransferProductoId('');
    setTransferDestinoId('');
    setTransferMotivo('');
    setTransferItems([]);
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  async function onCrearDeposito(e: FormEvent) {
    e.preventDefault();
    if (!nuevoForm.nombre.trim()) {
      flashError('El nombre del depósito es obligatorio');
      return;
    }
    setNuevoLoading(true);
    try {
      const created: any = await Api.crearDeposito({
        nombre: nuevoForm.nombre.trim(),
        codigo: nuevoForm.codigo.trim() || undefined,
        direccion: nuevoForm.direccion.trim() || undefined,
      });
      setNuevoForm({ nombre: '', codigo: '', direccion: '' });
      setShowNuevoModal(false);
      await loadDepositos();
      if (created?.id) setSelectedDepositoId(Number(created.id));
      flashSuccess('Depósito creado correctamente');
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'No se pudo crear el depósito');
    } finally {
      setNuevoLoading(false);
    }
  }

  async function onEditarDeposito(e: FormEvent) {
    e.preventDefault();
    if (!selectedDepositoId || !editForm.nombre.trim()) {
      flashError('El nombre es obligatorio');
      return;
    }
    setEditLoading(true);
    try {
      await Api.actualizarDeposito(selectedDepositoId, {
        nombre: editForm.nombre.trim(),
        codigo: editForm.codigo.trim() || null,
        direccion: editForm.direccion.trim() || null,
      });
      await loadDepositos();
      flashSuccess('Depósito actualizado correctamente');
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'No se pudo actualizar el depósito');
    } finally {
      setEditLoading(false);
    }
  }

  async function onDesactivarDeposito() {
    if (!selectedDepositoId) return;
    setDeactivateLoading(true);
    try {
      await Api.eliminarDeposito(selectedDepositoId);
      setSelectedDepositoId(null);
      setConfirmDeactivate(false);
      await loadDepositos();
      flashSuccess('Depósito desactivado');
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'No se pudo desactivar el depósito');
    } finally {
      setDeactivateLoading(false);
    }
  }

  async function onAplicarAjuste() {
    if (!ajusteModal || !selectedDepositoId) return;
    const cantidad = Number(ajusteModal.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      flashError('Ingresá una cantidad positiva');
      return;
    }
    setAjusteLoading(true);
    try {
      const delta = ajusteModal.tipo === 'entrada' ? cantidad : -cantidad;
      await Api.ajustarInventario({
        producto_id: ajusteModal.productoId,
        cantidad: delta,
        motivo: ajusteModal.motivo || 'ajuste multidepósito',
        referencia: `DEP ${selectedDepositoId}`,
        deposito_id: selectedDepositoId,
      });
      setAjusteModal(null);
      await loadInventario(selectedDepositoId);
      flashSuccess('Ajuste aplicado correctamente');
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'No se pudo aplicar el ajuste');
    } finally {
      setAjusteLoading(false);
    }
  }

  async function onReserva(tipo: 'reservar' | 'liberar') {
    if (!reservaModal || !selectedDepositoId) return;
    const cantidad = Number(reservaModal.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      flashError('Ingresá una cantidad positiva');
      return;
    }
    setReservaLoading(true);
    try {
      const path = tipo === 'reservar' ? '/api/inventario/reservar' : '/api/inventario/liberar';
      await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({
          producto_id: reservaModal.productoId,
          cantidad,
          referencia: `Reserva manual DEP ${selectedDepositoId}`,
          deposito_id: selectedDepositoId,
        }),
      });
      setReservaModal(null);
      await loadInventario(selectedDepositoId);
      flashSuccess(tipo === 'reservar' ? 'Reserva aplicada' : 'Reserva liberada');
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Error en la operación de reserva');
    } finally {
      setReservaLoading(false);
    }
  }

  function addTransferItem(row: InventarioRow) {
    setTransferItems((prev) => {
      if (prev.some((item) => item.producto_id === row.producto_id)) {
        return prev;
      }
      return [
        ...prev,
        {
          producto_id: row.producto_id,
          codigo: row.codigo,
          nombre: row.nombre,
          categoria: row.categoria,
          disponible: row.cantidad_disponible,
          cantidad: row.cantidad_disponible > 0 ? '1' : '',
        },
      ];
    });
    setTransferProductoId('');
    setShowTransfer(true);
  }

  function addTransferItemById(productoId: number | '') {
    const id = Number(productoId);
    if (!Number.isInteger(id) || id <= 0) return;
    const row = inventario.find((item) => item.producto_id === id);
    if (!row) {
      flashError('No se encontro el producto seleccionado en este deposito');
      return;
    }
    addTransferItem(row);
  }

  function updateTransferItemCantidad(productoId: number, cantidad: string) {
    setTransferItems((prev) =>
      prev.map((item) =>
        item.producto_id === productoId ? { ...item, cantidad } : item
      )
    );
  }

  function removeTransferItem(productoId: number) {
    setTransferItems((prev) => prev.filter((item) => item.producto_id !== productoId));
  }

  async function onTransferir(e: FormEvent) {
    e.preventDefault();
    if (!selectedDepositoId || !transferDestinoId) return;
    const origen = Number(selectedDepositoId);
    const destino = Number(transferDestinoId);
    if (origen === destino) {
      flashError('El origen y destino deben ser distintos');
      return;
    }
    const cantidad = Number(transferCantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      flashError('Cantidad inválida');
      return;
    }
    setTransferLoading(true);
    try {
      await Api.transferirStock({
        producto_id: Number(transferProductoId),
        cantidad,
        deposito_origen_id: origen,
        deposito_destino_id: destino,
        motivo: transferMotivo || 'transferencia entre depósitos',
        referencia: 'UI multideposito',
      });
      setTransferProductoId('');
      setTransferDestinoId('');
      setTransferCantidad('');
      setTransferMotivo('');
      setShowTransfer(false);
      await loadInventario(origen);
      flashSuccess('Transferencia realizada correctamente');
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'No se pudo transferir el stock');
    } finally {
      setTransferLoading(false);
    }
  }

  async function onTransferirLote(e: FormEvent) {
    e.preventDefault();
    if (!selectedDepositoId || !transferDestinoId) return;
    const origen = Number(selectedDepositoId);
    const destino = Number(transferDestinoId);
    if (origen === destino) {
      flashError('El origen y destino deben ser distintos');
      return;
    }
    const items = transferItems
      .map((item) => ({
        producto_id: item.producto_id,
        nombre: item.nombre,
        cantidad: Number(item.cantidad),
        disponible: item.disponible,
      }))
      .filter((item) => Number.isInteger(item.cantidad) && item.cantidad > 0);
    if (!items.length) {
      flashError('Agrega al menos un producto con cantidad valida para transferir');
      return;
    }
    const invalidItem = items.find((item) => item.cantidad > item.disponible);
    if (invalidItem) {
      flashError(`La cantidad de ${invalidItem.nombre} supera el stock disponible`);
      return;
    }
    setTransferLoading(true);
    try {
      await Api.transferirStockLote({
        items: items.map((item) => ({
          producto_id: item.producto_id,
          cantidad: item.cantidad,
        })),
        deposito_origen_id: origen,
        deposito_destino_id: destino,
        motivo: transferMotivo || 'transferencia entre depositos',
        referencia: 'UI multideposito',
      });
      setTransferProductoId('');
      setTransferDestinoId('');
      setTransferMotivo('');
      setTransferItems([]);
      setShowTransfer(false);
      await loadInventario(origen);
      flashSuccess('Transferencia realizada correctamente');
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'No se pudo transferir el stock');
    } finally {
      setTransferLoading(false);
    }
  }

  function toggleUsuario(userId: number) {
    setUsuariosEditados((prev) => {
      const next = new Map(prev);
      const cur = next.get(userId) ?? { asignado: false, rol_deposito: null };
      next.set(userId, { ...cur, asignado: !cur.asignado });
      return next;
    });
  }

  function setRolDeposito(userId: number, rolDeposito: string | null) {
    setUsuariosEditados((prev) => {
      const next = new Map(prev);
      const cur = next.get(userId) ?? { asignado: true, rol_deposito: null };
      next.set(userId, { ...cur, rol_deposito: rolDeposito });
      return next;
    });
  }

  async function onGuardarVendedores() {
    if (!selectedDepositoId) return;
    setSavingUsuarios(true);
    try {
      const items = Array.from(usuariosEditados.entries())
        .filter(([, v]) => v.asignado)
        .map(([userId, v]) => ({ usuario_id: userId, rol_deposito: v.rol_deposito }));
      await Api.setDepositoUsuarios(selectedDepositoId, items);
      await loadUsuariosDeposito(selectedDepositoId);
      flashSuccess('Asignaciones guardadas correctamente');
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSavingUsuarios(false);
    }
  }

  // ─── Tab definitions ──────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'inventario', label: 'Inventario', icon: Package },
    { id: 'vendedores', label: 'Vendedores', icon: Users },
    ...(isManager ? [{ id: 'editar' as TabId, label: 'Configurar', icon: Settings }] : []),
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Multidepósito</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Sucursales, stock por ubicación y accesos por usuario
          </p>
        </div>
        {isManager && (
          <button
            type="button"
            onClick={() => setShowNuevoModal(true)}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            Nuevo depósito
          </button>
        )}
      </div>

      {/* ── Global messages ── */}
      {error && <Alert kind="error" message={error} />}
      {success && <Alert kind="info" message={success} />}

      {/* ── Deposits loading ── */}
      {loadingDepositos ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
          <Loader2 size={16} className="animate-spin" />
          Cargando depósitos...
        </div>
      ) : depositos.length === 0 ? (
        /* ── Empty state ── */
        <div className="rounded-2xl bg-white/5 border border-white/10 p-12 text-center space-y-4">
          <Warehouse size={44} className="mx-auto text-slate-600" />
          <div>
            <p className="text-slate-200 font-medium text-base">No hay depósitos configurados</p>
            <p className="text-slate-500 text-sm mt-1">
              Creá el primer depósito para gestionar stock por sucursal.
            </p>
          </div>
          {isManager && (
            <button
              type="button"
              onClick={() => setShowNuevoModal(true)}
              className="inline-flex items-center gap-2 h-9 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              <Plus size={14} />
              Crear primer depósito
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ── Deposit card tabs ── */}
          <div className="flex gap-3 overflow-x-auto pb-1 -mb-1">
            {depositos.map((dep) => {
              const sel = dep.id === selectedDepositoId;
              return (
                <button
                  key={dep.id}
                  type="button"
                  onClick={() => selectDeposito(dep.id)}
                  className={`flex-shrink-0 flex flex-col items-start gap-0.5 rounded-2xl border px-4 py-3 min-w-[150px] max-w-[200px] text-left transition-all ${
                    sel
                      ? 'bg-indigo-600/20 border-indigo-500/60 shadow-lg shadow-indigo-500/10'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2 w-full">
                    <Warehouse
                      size={14}
                      className={sel ? 'text-indigo-300 flex-shrink-0' : 'text-slate-500 flex-shrink-0'}
                    />
                    <span
                      className={`text-sm font-semibold truncate flex-1 ${
                        sel ? 'text-indigo-100' : 'text-slate-200'
                      }`}
                    >
                      {dep.nombre}
                    </span>
                  </div>
                  {dep.codigo && (
                    <span className="text-[11px] text-slate-500 font-mono pl-5">{dep.codigo}</span>
                  )}
                  {dep.direccion && (
                    <span className="text-[11px] text-slate-500 truncate w-full pl-5">
                      {dep.direccion}
                    </span>
                  )}
                  {!dep.activo && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full mt-1 ml-5">
                      inactivo
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Selected deposit panel ── */}
          {depositoSeleccionado && (
            <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 overflow-hidden">
              {/* Panel header */}
              <div className="px-5 pt-5 pb-4 border-b border-white/10 space-y-4">
                {/* Title row */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2 flex-wrap">
                      <Warehouse size={16} className="text-indigo-400 flex-shrink-0" />
                      {depositoSeleccionado.nombre}
                      {depositoSeleccionado.codigo && (
                        <span className="text-xs text-slate-500 font-normal font-mono">
                          ({depositoSeleccionado.codigo})
                        </span>
                      )}
                      {!depositoSeleccionado.activo && (
                        <span className="text-[11px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                          inactivo
                        </span>
                      )}
                    </h3>
                    {depositoSeleccionado.direccion && (
                      <p className="text-xs text-slate-500 mt-1 ml-6">
                        {depositoSeleccionado.direccion}
                      </p>
                    )}
                  </div>
                  {selectedDepositoId && (
                    <Link
                      to={`/app/stock?deposito_id=${selectedDepositoId}`}
                      className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 flex-shrink-0 mt-0.5"
                    >
                      Historial
                      <ChevronRight size={12} />
                    </Link>
                  )}
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                      Productos
                    </div>
                    <div className="text-2xl font-bold text-slate-200">{metricas.totalProductos}</div>
                  </div>
                  <div
                    className={`rounded-xl border px-3 py-2.5 transition-colors ${
                      metricas.bajominimo > 0
                        ? 'bg-rose-500/10 border-rose-500/30'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                      {metricas.bajominimo > 0 && (
                        <AlertTriangle size={9} className="text-rose-400" />
                      )}
                      Stock bajo
                    </div>
                    <div
                      className={`text-2xl font-bold ${
                        metricas.bajominimo > 0 ? 'text-rose-300' : 'text-slate-200'
                      }`}
                    >
                      {metricas.bajominimo}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                      Reservados
                    </div>
                    <div className="text-2xl font-bold text-slate-200">
                      {metricas.totalReservado}
                    </div>
                  </div>
                </div>

                {/* Tab navigation */}
                <div className="flex gap-1">
                  {tabs.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTab(id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === id
                          ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      <Icon size={13} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Tab content ── */}
              <div className="p-5">
                {/* ────────────────── INVENTARIO TAB ────────────────── */}
                {activeTab === 'inventario' && (
                  <div className="space-y-4">
                    {/* Toolbar */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        className="input-modern text-sm flex-1"
                        placeholder="Buscar por código o nombre..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                      />
                      <select
                        className="input-modern text-sm sm:w-48"
                        value={categoriaFiltroId === '' ? '' : String(categoriaFiltroId)}
                        onChange={(e) =>
                          setCategoriaFiltroId(e.target.value ? Number(e.target.value) : '')
                        }
                      >
                        <option value="">Todas las categorías</option>
                        {categorias.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowTransfer((v) => !v)}
                        className={`flex items-center gap-1.5 h-10 px-3 rounded-lg border text-sm transition-colors whitespace-nowrap ${
                          showTransfer
                            ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        <ArrowRightLeft size={13} />
                        Transferir
                      </button>
                    </div>

                    {/* Transfer panel */}
                    {showTransfer && (
                      <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-emerald-300 flex items-center gap-2">
                            <ArrowRightLeft size={13} />
                            Transferir stock entre depósitos
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowTransfer(false)}
                            className="text-slate-500 hover:text-slate-300"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <form
                          onSubmit={onTransferir}
                          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end"
                        >
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Producto</label>
                            <ProductPicker
                              options={transferProductOptions}
                              value={transferProductoId === '' ? null : Number(transferProductoId)}
                              onChange={(id) =>
                                setTransferProductoId(id == null ? '' : Number(id))
                              }
                              placeholder="Seleccionar..."
                              buttonClassName="h-9 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">
                              Depósito destino
                            </label>
                            <select
                              className="input-modern text-sm w-full"
                              value={
                                transferDestinoId === '' ? '' : String(transferDestinoId)
                              }
                              onChange={(e) =>
                                setTransferDestinoId(
                                  e.target.value ? Number(e.target.value) : '',
                                )
                              }
                            >
                              <option value="">Seleccionar...</option>
                              {depositos
                                .filter((d) => d.id !== selectedDepositoId && d.activo)
                                .map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.nombre}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Cantidad</label>
                            <input
                              type="number"
                              className="input-modern text-sm w-full"
                              value={transferCantidad}
                              onChange={(e) => setTransferCantidad(e.target.value)}
                              min={1}
                              step={1}
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="block text-[11px] text-slate-400">
                              Motivo (opcional)
                            </label>
                            <input
                              className="input-modern text-sm w-full"
                              value={transferMotivo}
                              onChange={(e) => setTransferMotivo(e.target.value)}
                              placeholder="opcional"
                            />
                            <button
                              type="submit"
                              disabled={
                                transferLoading ||
                                !transferProductoId ||
                                !transferDestinoId ||
                                !transferCantidad
                              }
                              className="h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-60 transition-colors"
                            >
                              {transferLoading ? 'Transfiriendo...' : 'Transferir'}
                            </button>
                          </div>
                        </form>

                        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                Lote
                              </div>
                              <div className="text-sm text-slate-200">
                                {transferSummary.totalProductos} producto
                                {transferSummary.totalProductos === 1 ? '' : 's'} seleccionado
                                {transferSummary.totalProductos === 1 ? '' : 's'}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {transferSummary.totalUnidades} unidad
                                {transferSummary.totalUnidades === 1 ? '' : 'es'} a mover
                              </div>
                            </div>
                            {transferItems.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setTransferItems([])}
                                className="text-xs text-slate-400 hover:text-slate-200"
                              >
                                Limpiar lote
                              </button>
                            )}
                          </div>

                          {transferItems.length === 0 ? (
                            <div className="text-sm text-slate-500">
                              Usa el boton "Mover" en los productos que quieras transferir y luego ajusta la cantidad.
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              {transferItems.map((item) => (
                                <div
                                  key={item.producto_id}
                                  className="grid grid-cols-[minmax(0,1fr)_92px_36px] gap-2 items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm text-slate-100 truncate">
                                      {item.nombre}
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate">
                                      {item.codigo} · {item.categoria} · disponible {item.disponible}
                                    </div>
                                  </div>
                                  <input
                                    type="number"
                                    className="input-modern h-9 text-sm w-full"
                                    value={item.cantidad}
                                    onChange={(e) =>
                                      updateTransferItemCantidad(item.producto_id, e.target.value)
                                    }
                                    min={1}
                                    step={1}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeTransferItem(item.producto_id)}
                                    className="h-9 rounded-lg bg-white/10 text-slate-300 hover:bg-white/15"
                                    aria-label={`Quitar ${item.nombre}`}
                                  >
                                    <X size={14} className="mx-auto" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                if (!transferLoading) {
                                  void onTransferirLote({ preventDefault() {} } as FormEvent);
                                }
                              }}
                              disabled={
                                transferLoading ||
                                !transferDestinoId ||
                                transferItems.length === 0
                              }
                              className="h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 text-white text-sm font-medium disabled:opacity-60 transition-colors"
                            >
                              {transferLoading
                                ? 'Transfiriendo lote...'
                                : `Transferir lote (${transferSummary.totalProductos})`}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Inventory table */}
                    {loadingInventario ? (
                      <div className="flex items-center gap-2 text-slate-400 text-sm py-6">
                        <Loader2 size={16} className="animate-spin" />
                        Cargando inventario...
                      </div>
                    ) : inventarioFiltrado.length === 0 ? (
                      <div className="text-center py-10">
                        <Package size={32} className="mx-auto mb-2 text-slate-700" />
                        <p className="text-sm text-slate-500">Sin productos en este depósito</p>
                        {busqueda && (
                          <button
                            type="button"
                            className="text-xs text-indigo-400 hover:text-indigo-300 mt-1.5 underline"
                            onClick={() => setBusqueda('')}
                          >
                            Limpiar búsqueda
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-[11px] text-slate-500 uppercase tracking-wider border-b border-white/10">
                              <th className="pb-2 pr-3 font-medium">Código</th>
                              <th className="pb-2 pr-3 font-medium">Producto</th>
                              <th className="pb-2 pr-3 font-medium hidden md:table-cell">
                                Categoría
                              </th>
                              <th className="pb-2 pr-3 font-medium text-right">Disponible</th>
                              <th className="pb-2 pr-3 font-medium text-right hidden sm:table-cell">
                                Reservado
                              </th>
                              <th className="pb-2 pr-3 font-medium text-right hidden sm:table-cell">
                                Mínimo
                              </th>
                              <th className="pb-2 font-medium text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inventarioFiltrado.map((row) => {
                              const bajo =
                                row.stock_minimo != null &&
                                row.cantidad_disponible < row.stock_minimo;
                              return (
                                <tr
                                  key={row.producto_id}
                                  className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                                    bajo ? 'bg-rose-500/5' : ''
                                  }`}
                                >
                                  <td className="py-2.5 pr-3 text-xs text-slate-500 font-mono">
                                    {row.codigo}
                                  </td>
                                  <td className="py-2.5 pr-3 text-slate-200">
                                    <div className="flex items-center gap-1.5">
                                      {bajo && (
                                        <AlertTriangle
                                          size={11}
                                          className="text-rose-400 flex-shrink-0"
                                        />
                                      )}
                                      {row.nombre}
                                    </div>
                                  </td>
                                  <td className="py-2.5 pr-3 text-xs text-slate-500 hidden md:table-cell">
                                    {row.categoria}
                                  </td>
                                  <td className="py-2.5 pr-3 text-right">
                                    <span
                                      className={`font-semibold tabular-nums ${
                                        bajo ? 'text-rose-300' : 'text-slate-200'
                                      }`}
                                    >
                                      {row.cantidad_disponible}
                                    </span>
                                  </td>
                                  <td className="py-2.5 pr-3 text-right hidden sm:table-cell tabular-nums">
                                    {row.cantidad_reservada > 0 ? (
                                      <span className="text-amber-300">{row.cantidad_reservada}</span>
                                    ) : (
                                      <span className="text-slate-700">—</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 pr-3 text-right text-slate-500 hidden sm:table-cell tabular-nums">
                                    {row.stock_minimo != null ? (
                                      row.stock_minimo
                                    ) : (
                                      <span className="text-slate-700">—</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        className="px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs hover:bg-emerald-500/25 transition-colors"
                                        onClick={() => addTransferItem(row)}
                                      >
                                        Mover
                                      </button>
                                      <button
                                        type="button"
                                        className="px-2 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs hover:bg-indigo-500/25 transition-colors"
                                        onClick={() =>
                                          setAjusteModal({
                                            productoId: row.producto_id,
                                            productoNombre: row.nombre,
                                            tipo: 'entrada',
                                            cantidad: '',
                                            motivo: '',
                                          })
                                        }
                                      >
                                        Ajustar
                                      </button>
                                      <button
                                        type="button"
                                        className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/25 transition-colors"
                                        onClick={() =>
                                          setReservaModal({
                                            productoId: row.producto_id,
                                            productoNombre: row.nombre,
                                            cantidad: '',
                                          })
                                        }
                                      >
                                        Reserva
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ────────────────── VENDEDORES TAB ────────────────── */}
                {activeTab === 'vendedores' && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-400">
                      Asigná qué usuarios tienen acceso a{' '}
                      <span className="text-slate-200 font-medium">
                        {depositoSeleccionado.nombre}
                      </span>{' '}
                      y con qué rol.
                    </p>

                    {loadingUsuarios ? (
                      <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                        <Loader2 size={16} className="animate-spin" />
                        Cargando usuarios...
                      </div>
                    ) : usuarios.length === 0 ? (
                      <p className="text-slate-500 text-sm">No hay usuarios en el sistema.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {usuarios.map((u) => {
                            const editado = usuariosEditados.get(u.id) ?? {
                              asignado: u.asignado,
                              rol_deposito: u.rol_deposito,
                            };
                            return (
                              <div
                                key={u.id}
                                className={`rounded-xl border px-4 py-3 flex items-center gap-3 transition-all ${
                                  editado.asignado
                                    ? 'bg-indigo-600/15 border-indigo-500/40'
                                    : 'bg-white/5 border-white/10'
                                }`}
                              >
                                {/* Avatar */}
                                <div
                                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 select-none ${
                                    editado.asignado
                                      ? 'bg-indigo-500/30 text-indigo-200'
                                      : 'bg-white/10 text-slate-500'
                                  }`}
                                >
                                  {u.nombre.charAt(0).toUpperCase()}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-slate-200 truncate">
                                    {u.nombre}
                                  </div>
                                  <div className="text-xs text-slate-500 truncate">{u.email}</div>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="text-[10px] bg-white/10 text-slate-400 px-1.5 py-0.5 rounded">
                                      {ROLE_LABELS[u.rol] ?? u.rol}
                                    </span>
                                    {editado.asignado && (
                                      <select
                                        className="text-[11px] bg-transparent border border-white/20 rounded px-1.5 py-0.5 text-slate-300 hover:border-white/40 transition-colors"
                                        value={editado.rol_deposito ?? ''}
                                        onChange={(e) =>
                                          setRolDeposito(u.id, e.target.value || null)
                                        }
                                      >
                                        <option value="">Sin rol específico</option>
                                        {ROL_DEPOSITO_OPTIONS.map((o) => (
                                          <option key={o.value} value={o.value}>
                                            {o.label}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                </div>

                                {/* Toggle switch */}
                                <button
                                  type="button"
                                  onClick={() => toggleUsuario(u.id)}
                                  className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors ${
                                    editado.asignado ? 'bg-indigo-500' : 'bg-white/20'
                                  }`}
                                  aria-label={editado.asignado ? 'Desasignar' : 'Asignar'}
                                >
                                  <span
                                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                                      editado.asignado ? 'left-5' : 'left-0.5'
                                    }`}
                                  />
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={onGuardarVendedores}
                            disabled={savingUsuarios}
                            className="h-9 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-60 transition-colors"
                          >
                            {savingUsuarios ? 'Guardando...' : 'Guardar asignaciones'}
                          </button>
                          <span className="text-xs text-slate-500">
                            {Array.from(usuariosEditados.values()).filter((v) => v.asignado).length}{' '}
                            usuario
                            {Array.from(usuariosEditados.values()).filter((v) => v.asignado).length !== 1
                              ? 's'
                              : ''}{' '}
                            asignado
                            {Array.from(usuariosEditados.values()).filter((v) => v.asignado).length !== 1
                              ? 's'
                              : ''}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ────────────────── EDITAR TAB ────────────────── */}
                {activeTab === 'editar' && isManager && (
                  <div className="space-y-6 max-w-md">
                    {/* Edit form */}
                    <form onSubmit={onEditarDeposito} className="space-y-4">
                      <h4 className="text-sm font-semibold text-slate-200">
                        Información del depósito
                      </h4>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Nombre *</label>
                        <input
                          className="input-modern text-sm w-full"
                          value={editForm.nombre}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, nombre: e.target.value }))
                          }
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">
                          Código (opcional)
                        </label>
                        <input
                          className="input-modern text-sm w-full font-mono"
                          value={editForm.codigo}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, codigo: e.target.value }))
                          }
                          placeholder="Ej: DEP-001"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">
                          Dirección (opcional)
                        </label>
                        <input
                          className="input-modern text-sm w-full"
                          value={editForm.direccion}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, direccion: e.target.value }))
                          }
                          placeholder="Ej: Av. Corrientes 1234, CABA"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={editLoading}
                        className="h-9 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-60 transition-colors"
                      >
                        {editLoading ? 'Guardando...' : 'Guardar cambios'}
                      </button>
                    </form>

                    {/* Danger zone — admin only */}
                    {isAdmin && (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-rose-400">Zona de peligro</h4>
                        <p className="text-xs text-slate-400">
                          Desactivar el depósito lo ocultará de las operaciones activas. El stock e
                          historial se conservan y pueden reactivarse.
                        </p>
                        {!confirmDeactivate ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDeactivate(true)}
                            className="h-8 px-4 rounded-lg border border-rose-500/40 text-rose-400 text-sm hover:bg-rose-500/10 transition-colors"
                          >
                            Desactivar depósito
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-rose-300">¿Confirmar desactivación?</span>
                            <button
                              type="button"
                              onClick={onDesactivarDeposito}
                              disabled={deactivateLoading}
                              className="h-7 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium disabled:opacity-60 transition-colors"
                            >
                              {deactivateLoading ? 'Desactivando...' : 'Sí, desactivar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeactivate(false)}
                              className="h-7 px-3 rounded-lg bg-white/10 text-slate-300 text-xs hover:bg-white/15 transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════ MODALS ════════════════ */}

      {/* New deposit modal */}
      {showNuevoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowNuevoModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-zinc-900 border border-white/15 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Warehouse size={16} className="text-indigo-400" />
                Nuevo depósito
              </h3>
              <button
                type="button"
                onClick={() => setShowNuevoModal(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={onCrearDeposito} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nombre *</label>
                <input
                  className="input-modern text-sm w-full"
                  value={nuevoForm.nombre}
                  onChange={(e) => setNuevoForm((p) => ({ ...p, nombre: e.target.value }))}
                  placeholder="Ej: Sucursal Norte"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Código (opcional)</label>
                <input
                  className="input-modern text-sm w-full font-mono"
                  value={nuevoForm.codigo}
                  onChange={(e) => setNuevoForm((p) => ({ ...p, codigo: e.target.value }))}
                  placeholder="Ej: SUC-N"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Dirección (opcional)
                </label>
                <input
                  className="input-modern text-sm w-full"
                  value={nuevoForm.direccion}
                  onChange={(e) =>
                    setNuevoForm((p) => ({ ...p, direccion: e.target.value }))
                  }
                  placeholder="Ej: Av. San Martín 500"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={nuevoLoading}
                  className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-60 transition-colors"
                >
                  {nuevoLoading ? 'Creando...' : 'Crear depósito'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNuevoModal(false)}
                  className="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-sm transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ajuste modal */}
      {ajusteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setAjusteModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-white/15 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">Ajuste de stock</h3>
              <button
                type="button"
                onClick={() => setAjusteModal(null)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              <span className="text-slate-200 font-medium">{ajusteModal.productoNombre}</span>
              {' · '}
              {depositoSeleccionado?.nombre}
            </p>

            <div className="space-y-3">
              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                {(['entrada', 'salida'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAjusteModal((p) => (p ? { ...p, tipo: t } : p))}
                    className={`h-10 rounded-xl text-sm font-medium transition-colors ${
                      ajusteModal.tipo === t
                        ? t === 'entrada'
                          ? 'bg-emerald-600/30 border border-emerald-500/50 text-emerald-300'
                          : 'bg-rose-600/30 border border-rose-500/50 text-rose-300'
                        : 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    {t === 'entrada' ? '+ Entrada' : '− Salida'}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Cantidad</label>
                <input
                  type="number"
                  className="input-modern text-sm w-full"
                  value={ajusteModal.cantidad}
                  onChange={(e) =>
                    setAjusteModal((p) => (p ? { ...p, cantidad: e.target.value } : p))
                  }
                  min={1}
                  step={1}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Motivo (opcional)</label>
                <input
                  className="input-modern text-sm w-full"
                  value={ajusteModal.motivo}
                  onChange={(e) =>
                    setAjusteModal((p) => (p ? { ...p, motivo: e.target.value } : p))
                  }
                  placeholder="Ej: mercadería recibida"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onAplicarAjuste}
                  disabled={ajusteLoading || !ajusteModal.cantidad}
                  className={`flex-1 h-10 rounded-xl text-white text-sm font-medium disabled:opacity-60 transition-colors ${
                    ajusteModal.tipo === 'entrada'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {ajusteLoading ? 'Aplicando...' : 'Aplicar ajuste'}
                </button>
                <button
                  type="button"
                  onClick={() => setAjusteModal(null)}
                  className="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-sm transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reserva modal */}
      {reservaModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setReservaModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-white/15 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">Reserva de stock</h3>
              <button
                type="button"
                onClick={() => setReservaModal(null)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              <span className="text-slate-200 font-medium">{reservaModal.productoNombre}</span>
              {' · '}
              {depositoSeleccionado?.nombre}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Cantidad</label>
                <input
                  type="number"
                  className="input-modern text-sm w-full"
                  value={reservaModal.cantidad}
                  onChange={(e) =>
                    setReservaModal((p) => (p ? { ...p, cantidad: e.target.value } : p))
                  }
                  min={1}
                  step={1}
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onReserva('reservar')}
                  disabled={reservaLoading || !reservaModal.cantidad}
                  className="flex-1 h-10 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium disabled:opacity-60 transition-colors"
                >
                  {reservaLoading ? '...' : 'Reservar'}
                </button>
                <button
                  type="button"
                  onClick={() => onReserva('liberar')}
                  disabled={reservaLoading || !reservaModal.cantidad}
                  className="flex-1 h-10 rounded-xl bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium disabled:opacity-60 transition-colors"
                >
                  Liberar
                </button>
                <button
                  type="button"
                  onClick={() => setReservaModal(null)}
                  className="h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-sm transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
