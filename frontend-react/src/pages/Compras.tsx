import { type ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, CheckSquare, FileDown, Package, Search, Square, Upload } from 'lucide-react';
import { Api } from '../lib/api';
import Alert from '../components/Alert';
import SpreadsheetImportPanel from '../components/SpreadsheetImportPanel';
import VirtualizedTable from '../components/VirtualizedTable';
import CategoryTreePicker from '../components/CategoryTreePicker';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getRoleFromToken } from '../lib/auth';
import ProductPicker from '../components/ProductPicker';
import { useCompraDetalle, useComprasList } from '../hooks/queries/useCompras';
import { type CategoryNode } from '../lib/categoryTree';

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

type CatPickerProducto = {
  id: number;
  name: string;
  codigo: string | null;
  category_name: string;
  stock_quantity: number;
  costo_pesos: number | null;
  costo_dolares: number | null;
};

type CatPickerCategoryEntry = { id: number; name: string };

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

function mapCompraRow(row: any): CompraRow {
  return {
    id: Number(row.id),
    proveedor_nombre: row.proveedor_nombre,
    fecha: row.fecha,
    total_costo: Number(row.total_costo ?? 0),
    moneda: row.moneda || 'ARS',
    estado: row.estado || 'pendiente',
    estado_recepcion: row.estado_recepcion,
    oc_numero: row.oc_numero ?? null,
    adjunto_url: row.adjunto_url ?? null,
    total_cantidad: row.total_cantidad ? Number(row.total_cantidad) : 0,
    total_recibida: row.total_recibida ? Number(row.total_recibida) : 0,
  };
}

function mapCompraDetalleRow(row: any, monedaFallback: string): CompraDetalleItem {
  return {
    id: Number(row.id),
    producto_id: Number(row.producto_id),
    producto_nombre: row.producto_nombre,
    cantidad: Number(row.cantidad || 0),
    cantidad_recibida: Number(row.cantidad_recibida || 0),
    costo_unitario: Number(row.costo_unitario || 0),
    costo_envio: Number(row.costo_envio || 0),
    subtotal: Number(row.subtotal || 0),
    moneda: row.moneda || monedaFallback,
    tipo_cambio: row.tipo_cambio ? Number(row.tipo_cambio) : null,
  };
}

export default function Compras() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const canManagePurchases = role === 'admin' || role === 'gerente';
  const comprasQuery = useComprasList<any>({}, true);

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

  // ── Agregar por Categoría ──────────────────────────────────────────────────
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [catPickerCategoryIds, setCatPickerCategoryIds] = useState<CatPickerCategoryEntry[]>([]);
  const [catPickerStagingId, setCatPickerStagingId] = useState<number | null>(null);
  const [catPickerBulkCost, setCatPickerBulkCost] = useState<string>('');
  const [catPickerBulkQty, setCatPickerBulkQty] = useState<string>('');
  const [catPickerIncludeDesc, setCatPickerIncludeDesc] = useState(true);
  const [catPickerProductos, setCatPickerProductos] = useState<CatPickerProducto[]>([]);
  const [catPickerSelectedIds, setCatPickerSelectedIds] = useState<Set<number>>(new Set());
  const [catPickerLoading, setCatPickerLoading] = useState(false);
  const [catPickerError, setCatPickerError] = useState<string | null>(null);
  const [catPickerSearched, setCatPickerSearched] = useState(false);

  const [plantillaDownloading, setPlantillaDownloading] = useState(false);
  const [plantillaUploading, setPlantillaUploading] = useState(false);

  const [selectedCompra, setSelectedCompra] = useState<CompraRow | null>(null);
  const [detalleCompra, setDetalleCompra] = useState<CompraDetalleItem[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [recepcionItems, setRecepcionItems] = useState<RecepcionItem[]>([]);
  const [recepcionNotas, setRecepcionNotas] = useState('');
  const [recepcionSubmitting, setRecepcionSubmitting] = useState(false);
  const detalleQuery = useCompraDetalle(
    selectedCompra ? Number(selectedCompra.id) : null,
    Boolean(selectedCompra),
  );

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
    try {
      const response = await comprasQuery.refetch();
      const mapped = Array.isArray(response.data)
        ? response.data.map(mapCompraRow)
        : [];
      setCompras(mapped);
      return mapped;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando compras');
      return [];
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

  async function loadCategoryTree() {
    try {
      const data = (await Api.categoriasTree()) as CategoryNode[];
      setCategoryTree(Array.isArray(data) ? data : []);
    } catch {
      // árbol no crítico, no bloquea el flujo
    }
  }

  async function handleDescargarPlantillaFundas() {
    setPlantillaDownloading(true);
    try {
      const blob = await Api.descargarPlantillaFundas();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plantilla-pedido-fundas-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error descargando la plantilla');
    } finally {
      setPlantillaDownloading(false);
    }
  }

  async function handleImportarPlantillaFundas(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPlantillaUploading(true);
    try {
      const result = await Api.importarPlantillaFundas(file);
      const msg = result.errores?.length
        ? `Compra #${result.compra?.id} creada con ${result.importados} productos. ${result.errores.length} SKU no encontrados.`
        : `Compra #${result.compra?.id} creada con ${result.importados} productos.`;
      toast.success(msg);
      await Promise.all([loadProductos(), loadCompras()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error importando la plantilla');
    } finally {
      setPlantillaUploading(false);
    }
  }

  useEffect(() => {
    loadProductos();
    loadProveedores();
    loadDepositos();
    loadDolarBlue();
    loadCategoryTree();
  }, []);

  useEffect(() => {
    setLoadingCompras(comprasQuery.isLoading || comprasQuery.isFetching);
    if (comprasQuery.isError) {
      setError('Error cargando compras');
      return;
    }
    const rows = Array.isArray(comprasQuery.data)
      ? comprasQuery.data.map(mapCompraRow)
      : [];
    setCompras(rows);
  }, [comprasQuery.data, comprasQuery.isError, comprasQuery.isFetching, comprasQuery.isLoading]);

  useEffect(() => {
    if (moneda === 'ARS') {
      setTipoCambio('');
      return;
    }
    if (!tipoCambio && dolarBlue && dolarBlue > 0) {
      setTipoCambio(String(dolarBlue));
    }
  }, [moneda, dolarBlue, tipoCambio]);

  useEffect(() => {
    setLoadingDetalle(detalleQuery.isLoading || detalleQuery.isFetching);
    if (!selectedCompra) {
      setDetalleCompra([]);
      setRecepcionItems([]);
      return;
    }
    if (detalleQuery.isError) {
      setError('No se pudo cargar el detalle');
      setDetalleCompra([]);
      setRecepcionItems([]);
      return;
    }
    const mapped = Array.isArray(detalleQuery.data)
      ? detalleQuery.data.map((row: any) =>
          mapCompraDetalleRow(row, selectedCompra.moneda),
        )
      : [];
    setDetalleCompra(mapped);
    setRecepcionItems(
      mapped
        .map((item) => {
          const pendiente = Math.max(0, item.cantidad - item.cantidad_recibida);
          return {
            producto_id: item.producto_id,
            producto_nombre: item.producto_nombre,
            pendiente,
            cantidad_recibir: pendiente > 0 ? String(pendiente) : '0',
          };
        })
        .filter((item) => item.pendiente > 0),
    );
  }, [
    detalleQuery.data,
    detalleQuery.isError,
    detalleQuery.isFetching,
    detalleQuery.isLoading,
    selectedCompra,
  ]);

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

  // ── Agregar por Categoría — lógica ──────────────────────────────────────────

  function findNodeName(id: number, nodes: CategoryNode[]): string {
    for (const node of nodes) {
      if (node.id === id) return node.name;
      const found = findNodeName(id, node.children || []);
      if (found) return found;
    }
    return '';
  }

  function agregarCategoriaAlPicker() {
    if (!catPickerStagingId) return;
    if (catPickerCategoryIds.some((c) => c.id === catPickerStagingId)) return;
    const name = findNodeName(catPickerStagingId, categoryTree) || `Cat. ${catPickerStagingId}`;
    setCatPickerCategoryIds((prev) => [...prev, { id: catPickerStagingId, name }]);
    setCatPickerStagingId(null);
  }

  async function buscarProductosByCategoria() {
    if (catPickerCategoryIds.length === 0) {
      setCatPickerError('Agregá al menos una subcategoría primero con el botón "+ Agregar".');
      return;
    }
    setCatPickerLoading(true);
    setCatPickerError(null);
    setCatPickerProductos([]);
    setCatPickerSelectedIds(new Set());
    setCatPickerSearched(true);
    try {
      // Consulta en paralelo para cada categoría seleccionada, luego fusiona sin duplicados
      const results = await Promise.all(
        catPickerCategoryIds.map((cat) =>
          Api.productos({ category_id: cat.id, include_descendants: catPickerIncludeDesc, all: true })
        )
      );
      const seen = new Set<number>();
      const merged: CatPickerProducto[] = [];
      for (const data of results) {
        const rows = (Array.isArray(data) ? data : (data as any)?.data ?? []) as any[];
        for (const r of rows) {
          const id = Number(r.id);
          if (!seen.has(id)) {
            seen.add(id);
            merged.push({
              id,
              name:           String(r.name || ''),
              codigo:         r.codigo ?? null,
              category_name:  String(r.category_name || ''),
              stock_quantity: Number(r.stock_quantity ?? 0),
              costo_pesos:    r.costo_pesos != null ? Number(r.costo_pesos) : null,
              costo_dolares:  r.costo_dolares != null ? Number(r.costo_dolares) : null,
            });
          }
        }
      }
      setCatPickerProductos(merged);
      if (merged.length === 0) {
        setCatPickerError('No se encontraron productos en las categorías seleccionadas.');
      } else {
        setCatPickerSelectedIds(new Set(merged.map((p) => p.id)));
      }
    } catch (e) {
      setCatPickerError(e instanceof Error ? e.message : 'Error buscando productos');
    } finally {
      setCatPickerLoading(false);
    }
  }

  function toggleCatPickerProduct(id: number) {
    setCatPickerSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCatPickerAll() {
    const allSelected = catPickerProductos.every((p) => catPickerSelectedIds.has(p.id));
    if (allSelected) {
      setCatPickerSelectedIds(new Set());
    } else {
      setCatPickerSelectedIds(new Set(catPickerProductos.map((p) => p.id)));
    }
  }

  function resolverCostoPreLlenado(p: CatPickerProducto): string {
    // Pre-llena el costo según la moneda activa del formulario de compra
    if (moneda === 'ARS' && p.costo_pesos != null && p.costo_pesos > 0) {
      return String(p.costo_pesos);
    }
    if (moneda === 'USD' && p.costo_dolares != null && p.costo_dolares > 0) {
      return String(p.costo_dolares);
    }
    return '';
  }

  function agregarSeleccionadosAlPedido() {
    const seleccionados = catPickerProductos.filter((p) => catPickerSelectedIds.has(p.id));
    if (seleccionados.length === 0) return;

    // IDs ya presentes en el pedido para evitar duplicados exactos
    const yaEnPedido = new Set(items.map((i) => Number(i.producto_id)).filter(Boolean));
    const nuevos     = seleccionados.filter((p) => !yaEnPedido.has(p.id));
    const duplicados = seleccionados.length - nuevos.length;

    if (nuevos.length === 0) {
      toast.warning('Todos los productos seleccionados ya están en el pedido.');
      return;
    }

    const costoOverride = catPickerBulkCost.trim() !== '' ? catPickerBulkCost : null;
    const qtyOverride = catPickerBulkQty.trim() !== '' ? catPickerBulkQty : null;
    const nuevosItems: CompraItem[] = nuevos.map((p) => ({
      id:            `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      producto_id:   p.id,
      cantidad:      qtyOverride ?? '',
      costo_unitario: costoOverride ?? resolverCostoPreLlenado(p),
      costo_envio:   '',
    }));

    // Si el único item existente está vacío (formulario limpio), lo reemplazamos
    const soloItemVacio =
      items.length === 1 &&
      items[0].producto_id === '' &&
      items[0].cantidad === '' &&
      items[0].costo_unitario === '';

    setItems((prev) => (soloItemVacio ? nuevosItems : [...prev, ...nuevosItems]));

    const msg = duplicados > 0
      ? `${nuevos.length} producto${nuevos.length !== 1 ? 's' : ''} agregado${nuevos.length !== 1 ? 's' : ''} al pedido. ${duplicados} ya estaban y se omitieron.`
      : `${nuevos.length} producto${nuevos.length !== 1 ? 's' : ''} agregado${nuevos.length !== 1 ? 's' : ''} al pedido.`;
    toast.success(msg);

    // Limpiar el picker y cerrarlo
    setCatPickerOpen(false);
    setCatPickerProductos([]);
    setCatPickerSelectedIds(new Set());
    setCatPickerCategoryIds([]);
    setCatPickerStagingId(null);
    setCatPickerBulkCost('');
    setCatPickerBulkQty('');
    setCatPickerSearched(false);
    setCatPickerError(null);
  }

  async function loadDetalle(compra: CompraRow) {
    setSelectedCompra(compra);
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

        {/* ── Plantilla de Pedido de Fundas ── */}
        {canManagePurchases && (
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-indigo-300 text-sm font-semibold">
                <Package size={15} />
                Plantilla de pedido — Fundas
              </div>
              <span className="text-xs text-slate-400 flex-1">
                Descargá la planilla, completá el proveedor y las cantidades, y subila para registrar la compra automáticamente.
              </span>
              <button
                type="button"
                disabled={plantillaDownloading}
                onClick={handleDescargarPlantillaFundas}
                className="flex items-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50"
              >
                <FileDown size={13} />
                {plantillaDownloading ? 'Generando...' : 'Descargar planilla'}
              </button>
              <label className={[
                'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all',
                plantillaUploading
                  ? 'border-white/10 bg-white/5 text-slate-500 pointer-events-none'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
              ].join(' ')}>
                <Upload size={13} />
                {plantillaUploading ? 'Importando...' : 'Subir planilla completada'}
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  disabled={plantillaUploading}
                  onChange={handleImportarPlantillaFundas}
                />
              </label>
            </div>
          </div>
        )}

        <SpreadsheetImportPanel
          title="Importar compras desde Excel"
          description="Agrupa filas por compra, valida proveedor y producto, y puede procesar archivos grandes en segundo plano con seguimiento de progreso."
          templateName="plantilla-compras.csv"
          templateHeaders={[
            'compra_ref',
            'proveedor',
            'producto_codigo',
            'fecha',
            'moneda',
            'cantidad',
            'costo_unitario',
            'tipo_cambio',
            'oc_numero',
            'adjunto_url',
          ]}
          upload={(file, opts) =>
            Api.importarComprasExcel(file, {
              dryRun: opts?.dryRun,
              async: opts?.async,
            })
          }
          onCompleted={async () => {
            await Promise.all([comprasQuery.refetch(), loadProductos()]);
          }}
        />

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

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded border border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
                onClick={() => setItems((prev) => [...prev, newItem()])}
              >
                + Agregar item
              </button>

              {/* ── Botón toggle Agregar por Categoría ── */}
              <button
                type="button"
                onClick={() => {
                  setCatPickerOpen((v) => !v);
                  if (!catPickerOpen) {
                    setCatPickerError(null);
                  }
                }}
                className={[
                  'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                  catPickerOpen
                    ? 'border-violet-500/60 bg-violet-500/15 text-violet-300'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white',
                ].join(' ')}
              >
                <Package size={13} />
                Agregar por categoría
                {catPickerOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>

            {/* ── Panel Agregar por Categoría ── */}
            {catPickerOpen && (
              <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4 space-y-4">

                {/* Header del panel */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-violet-300 text-sm font-semibold">
                    <Package size={15} />
                    Agregar productos por categoría
                  </div>
                  <span className="text-xs text-slate-400">
                    Buscá una categoría, elegí los productos y agregalos al pedido de una vez.
                  </span>
                </div>

                {/* Fila: selector staging + botón agregar + botón buscar */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-6 space-y-1">
                    <div className="text-xs text-slate-400 font-medium">Agregar subcategoría</div>
                    <CategoryTreePicker
                      tree={categoryTree}
                      value={catPickerStagingId}
                      onChange={setCatPickerStagingId}
                      allowClear
                      placeholder="Seleccionar subcategoría..."
                    />
                  </div>

                  <div className="md:col-span-3 flex items-end pb-0.5">
                    <button
                      type="button"
                      disabled={!catPickerStagingId || catPickerCategoryIds.some((c) => c.id === catPickerStagingId)}
                      onClick={agregarCategoriaAlPicker}
                      className={[
                        'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-all w-full justify-center',
                        !catPickerStagingId || catPickerCategoryIds.some((c) => c.id === catPickerStagingId)
                          ? 'border-white/10 bg-white/5 text-slate-500 cursor-not-allowed'
                          : 'border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20',
                      ].join(' ')}
                    >
                      + Agregar
                    </button>
                  </div>

                  <div className="md:col-span-3 flex justify-end items-end pb-0.5">
                    <button
                      type="button"
                      disabled={catPickerCategoryIds.length === 0 || catPickerLoading}
                      onClick={buscarProductosByCategoria}
                      className={[
                        'flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all',
                        catPickerCategoryIds.length === 0 || catPickerLoading
                          ? 'border border-white/10 bg-white/5 text-slate-500 cursor-not-allowed'
                          : 'bg-violet-600 text-white hover:bg-violet-500',
                      ].join(' ')}
                    >
                      <Search size={13} />
                      {catPickerLoading ? 'Buscando...' : 'Buscar productos'}
                    </button>
                  </div>
                </div>

                {/* Chips de categorías seleccionadas */}
                {catPickerCategoryIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">Subcategorías:</span>
                    {catPickerCategoryIds.map((cat) => (
                      <span
                        key={cat.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-xs text-violet-300"
                      >
                        {cat.name}
                        <button
                          type="button"
                          onClick={() =>
                            setCatPickerCategoryIds((prev) => prev.filter((c) => c.id !== cat.id))
                          }
                          className="text-violet-400 hover:text-white leading-none"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {catPickerCategoryIds.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCatPickerCategoryIds([])}
                        className="text-xs text-slate-500 hover:text-slate-300"
                      >
                        Limpiar todo
                      </button>
                    )}
                  </div>
                )}

                {/* Checkbox incluir subcategorías */}
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-300 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={catPickerIncludeDesc}
                      onChange={(e) => setCatPickerIncludeDesc(e.target.checked)}
                      className="accent-violet-500"
                    />
                    Incluir subcategorías anidadas de cada selección
                  </label>
                </div>

                {/* Error del picker */}
                {catPickerError && (
                  <Alert kind="error" message={catPickerError} />
                )}

                {/* Tabla de resultados */}
                {catPickerSearched && !catPickerLoading && catPickerProductos.length > 0 && (
                  <div className="space-y-2">
                    {/* Costo y cantidad únicos para todos */}
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                      <span className="text-xs text-amber-300 font-semibold whitespace-nowrap">
                        Aplicar a todos:
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap">
                        Cantidad
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={catPickerBulkQty}
                          onChange={(e) => setCatPickerBulkQty(e.target.value)}
                          placeholder="—"
                          className="input-modern text-xs h-7 w-20"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap">
                        Costo ({moneda})
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={catPickerBulkCost}
                          onChange={(e) => setCatPickerBulkCost(e.target.value)}
                          placeholder="—"
                          className="input-modern text-xs h-7 w-28"
                        />
                      </label>
                      {(catPickerBulkQty || catPickerBulkCost) && (
                        <button
                          type="button"
                          onClick={() => { setCatPickerBulkQty(''); setCatPickerBulkCost(''); }}
                          className="text-xs text-slate-500 hover:text-slate-300"
                        >
                          × Limpiar
                        </button>
                      )}
                      <span className="text-xs text-slate-500 ml-auto">
                        Dejar vacío = valor individual por producto
                      </span>
                    </div>

                    {/* Barra de control: seleccionar todos + contador */}
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <button
                        type="button"
                        onClick={toggleCatPickerAll}
                        className="flex items-center gap-1.5 hover:text-slate-200 transition-colors"
                      >
                        {catPickerProductos.every((p) => catPickerSelectedIds.has(p.id))
                          ? <CheckSquare size={13} className="text-violet-400" />
                          : <Square size={13} />
                        }
                        {catPickerProductos.every((p) => catPickerSelectedIds.has(p.id))
                          ? 'Deseleccionar todos'
                          : 'Seleccionar todos'
                        }
                      </button>
                      <span>
                        {catPickerSelectedIds.size} de {catPickerProductos.length} seleccionado{catPickerProductos.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Tabla */}
                    <div className="overflow-x-auto rounded-lg border border-white/10">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="bg-slate-800/60 text-left text-slate-400">
                            <th className="py-2 pl-3 pr-2 w-8"></th>
                            <th className="py-2 pr-3">Producto</th>
                            <th className="py-2 pr-3">Código</th>
                            <th className="py-2 pr-3">Categoría</th>
                            <th className="py-2 pr-3 text-center">Stock actual</th>
                            <th className="py-2 pr-3 text-right">
                              Costo {moneda === 'USD' ? 'USD' : 'ARS'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {catPickerProductos.map((p, idx) => {
                            const selected  = catPickerSelectedIds.has(p.id);
                            const costo     = moneda === 'USD' ? p.costo_dolares : p.costo_pesos;
                            const stockBajo = p.stock_quantity === 0;
                            return (
                              <tr
                                key={p.id}
                                onClick={() => toggleCatPickerProduct(p.id)}
                                className={[
                                  'border-t border-white/8 cursor-pointer transition-colors',
                                  selected
                                    ? 'bg-violet-500/12 hover:bg-violet-500/18'
                                    : idx % 2 === 0
                                    ? 'bg-transparent hover:bg-white/5'
                                    : 'bg-white/3 hover:bg-white/7',
                                ].join(' ')}
                              >
                                <td className="py-2 pl-3 pr-2">
                                  {selected
                                    ? <CheckSquare size={14} className="text-violet-400" />
                                    : <Square size={14} className="text-slate-600" />
                                  }
                                </td>
                                <td className="py-2 pr-3 font-medium text-slate-200">
                                  {p.name}
                                </td>
                                <td className="py-2 pr-3 text-slate-400">
                                  {p.codigo || '-'}
                                </td>
                                <td className="py-2 pr-3 text-slate-400">
                                  {p.category_name || '-'}
                                </td>
                                <td className="py-2 pr-3 text-center">
                                  <span className={[
                                    'inline-flex items-center rounded px-1.5 py-0.5 font-semibold',
                                    stockBajo
                                      ? 'bg-rose-500/20 text-rose-300'
                                      : 'text-slate-300',
                                  ].join(' ')}>
                                    {p.stock_quantity}
                                  </span>
                                </td>
                                <td className="py-2 pr-3 text-right text-slate-300">
                                  {costo != null && costo > 0
                                    ? `${costo.toFixed(2)}`
                                    : <span className="text-slate-500">—</span>
                                  }
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Botón Agregar al pedido */}
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={catPickerSelectedIds.size === 0}
                        onClick={agregarSeleccionadosAlPedido}
                        className={[
                          'flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-all',
                          catPickerSelectedIds.size === 0
                            ? 'border border-white/10 bg-white/5 text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-900/30',
                        ].join(' ')}
                      >
                        <Package size={14} />
                        Agregar {catPickerSelectedIds.size > 0 ? `${catPickerSelectedIds.size} producto${catPickerSelectedIds.size !== 1 ? 's' : ''}` : 'seleccionados'} al pedido
                      </button>
                    </div>
                  </div>
                )}

                {/* Estado vacío post-búsqueda sin error */}
                {catPickerSearched && !catPickerLoading && catPickerProductos.length === 0 && !catPickerError && (
                  <div className="py-4 text-center text-xs text-slate-500">
                    No se encontraron productos en la categoría seleccionada.
                  </div>
                )}
              </div>
            )}
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
            <VirtualizedTable
              items={compras}
              rowKey={(compra) => compra.id}
              maxHeight={420}
              estimateSize={46}
              tableClassName="min-w-full text-xs"
              renderHeader={() => (
                <tr className="text-left text-slate-400 border-b border-white/10">
                  <th className="py-2 pl-1 pr-3 w-12">#</th>
                  <th className="py-2 pr-4 whitespace-nowrap">Fecha</th>
                  <th className="py-2 pr-4">Proveedor</th>
                  <th className="py-2 pr-4 whitespace-nowrap">OC</th>
                  <th className="py-2 pr-4 text-right whitespace-nowrap">Total</th>
                  <th className="py-2 pr-4 whitespace-nowrap">Estado</th>
                  <th className="py-2 pr-1"></th>
                </tr>
              )}
              renderRow={(compra) => (
                <>
                  <td className="py-2 pl-1 pr-3 text-slate-500">{compra.id}</td>
                  <td className="py-2 pr-4 whitespace-nowrap text-slate-300">
                    {compra.fecha
                      ? new Date(compra.fecha).toLocaleDateString('es-AR', {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                        })
                      : '-'}
                  </td>
                  <td className="py-2 pr-4 font-medium text-slate-200">
                    {compra.proveedor_nombre}
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {compra.oc_numero || <span className="text-slate-600">—</span>}
                  </td>
                  <td className="py-2 pr-4 text-right whitespace-nowrap font-medium text-slate-200">
                    {Number(compra.total_costo || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    <span className="text-slate-400 font-normal">{compra.moneda}</span>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <span className={[
                      'inline-block rounded px-2 py-0.5 text-xs capitalize',
                      (compra.estado_recepcion || compra.estado) === 'recibido'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : (compra.estado_recepcion || compra.estado) === 'parcial'
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-slate-500/20 text-slate-400',
                    ].join(' ')}>
                      {compra.estado_recepcion || compra.estado}
                    </span>
                  </td>
                  <td className="py-2 pr-1">
                    <button
                      type="button"
                      className="text-xs text-cyan-400 hover:text-cyan-200 whitespace-nowrap"
                      onClick={() => loadDetalle(compra)}
                    >
                      Ver detalle
                    </button>
                  </td>
                </>
              )}
              emptyState={
                <tr>
                  <td className="py-3 text-slate-400" colSpan={7}>
                    Sin compras registradas.
                  </td>
                </tr>
              }
            />
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
