import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, X, FileDown, CheckSquare, Square, AlertTriangle, PackageX } from 'lucide-react';
import { Api } from '../lib/api';
import { usePriceLabels } from '../lib/priceLabels';
import { uploadImageToCloudinary } from '../lib/cloudinary';
import { useToast } from '../context/ToastContext';
import Button from '../ui/Button';
import Alert from '../components/Alert';
import VirtualizedTable from '../components/VirtualizedTable';
import CategoryTreePicker from '../components/CategoryTreePicker';
import {
  type CategoryNode,
  buildPathLabelFromDbPath,
  flattenCategoryTree,
} from '../lib/categoryTree';

type Producto = {
  id: number;
  name: string;
  codigo?: string | null;
  category_id: number;
  category_name: string;
  category_path?: string | null;
  description?: string | null;
  image_url?: string | null;
  price: number;
  stock_quantity: number;
  stock_minimo?: number;
  comision_pct?: number | null;
  precio_modo?: 'auto' | 'manual' | null;
  costo_pesos?: number | null;
  costo_dolares?: number | null;
  tipo_cambio?: number | null;
  margen_local?: number | null;
  margen_distribuidor?: number | null;
  price_local?: number | null;
  price_distribuidor?: number | null;
  precio_final?: number | null;
  deleted_at?: string | null;
};

type StockFilter = 'nulo' | 'bajo' | 'ambos';

type HistorialRow = {
  id: number;
  producto_id: number;
  proveedor_id: number | null;
  proveedor_nombre?: string | null;
  fecha: string;
  costo_pesos: number | null;
  costo_dolares: number | null;
  tipo_cambio: number | null;
  margen_local: number | null;
  margen_distribuidor: number | null;
  precio_local: number | null;
  precio_distribuidor: number | null;
  usuario_nombre?: string | null;
};

type FormState = {
  name: string;
  codigo: string;
  description: string;
  price: string;
  image_url: string;
  category_id: string;
  stock_quantity: string;
  comision_pct: string;
  precio_modo: 'auto' | 'manual';
  precio_local: string;
  precio_distribuidor: string;
  costo_pesos: string;
  costo_dolares: string;
  tipo_cambio: string;
  margen_local: string;
  margen_distribuidor: string;
  precio_final: string;
};

const emptyForm: FormState = {
  name: '',
  codigo: '',
  description: '',
  price: '',
  image_url: '',
  category_id: '',
  stock_quantity: '',
  comision_pct: '',
  precio_modo: 'auto',
  precio_local: '',
  precio_distribuidor: '',
  costo_pesos: '',
  costo_dolares: '',
  tipo_cambio: '',
  margen_local: '',
  margen_distribuidor: '',
  precio_final: '',
};

function buildEmptyForm(tipoCambio: string) {
  return { ...emptyForm, tipo_cambio: tipoCambio || '' };
}

export default function Productos() {
  const navigate = useNavigate();
  const toast = useToast();
  const { labels: priceLabels } = usePriceLabels();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [categoryFilterId, setCategoryFilterId] = useState<number | null>(null);
  const [includeDescendants, setIncludeDescendants] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Modo Proveedor ──
  const [supplierMode, setSupplierMode] = useState(false);
  const [stockFilter, setStockFilter] = useState<StockFilter>('ambos');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [deletedProductos, setDeletedProductos] = useState<Producto[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState>(() => buildEmptyForm(''));
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null);
  const [codigoLookupMsg, setCodigoLookupMsg] = useState<string | null>(null);
  const [codigoLookupError, setCodigoLookupError] = useState<string | null>(null);
  const [codigoLookupLoading, setCodigoLookupLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const [historialProducto, setHistorialProducto] = useState<Producto | null>(null);
  const [historial, setHistorial] = useState<HistorialRow[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState<string | null>(null);

  // Precios por lista dinámica
  const [productPriceRows, setProductPriceRows] = useState<any[]>([]);
  const [priceRowsLoading, setPriceRowsLoading] = useState(false);
  const [commissionPreview, setCommissionPreview] = useState<any | null>(null);
  const [commissionPreviewLoading, setCommissionPreviewLoading] = useState(false);

  const [lastCostoEdit, setLastCostoEdit] = useState<'pesos' | 'dolares' | null>(null);
  const [dolarBlue, setDolarBlue] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProductos, setTotalProductos] = useState(0);
  const filteredProductos = productos;
  const flatCategories = useMemo(() => flattenCategoryTree(categoryTree), [categoryTree]);
  const categoryById = useMemo(
    () => new Map(flatCategories.map((c) => [Number(c.id), c])),
    [flatCategories],
  );

  const costoPesosNumber = useMemo(
    () => Number(form.costo_pesos || '0') || 0,
    [form.costo_pesos]
  );
  const costoDolaresNumber = useMemo(
    () => Number(form.costo_dolares || '0') || 0,
    [form.costo_dolares]
  );
  const tipoCambioNumber = useMemo(
    () => (form.tipo_cambio ? Number(form.tipo_cambio) || 0 : 0),
    [form.tipo_cambio]
  );
  const margenLocalNumber = useMemo(
    () => (form.margen_local ? Number(form.margen_local) / 100 : 0.15),
    [form.margen_local]
  );
  const margenDistribuidorNumber = useMemo(
    () => (form.margen_distribuidor ? Number(form.margen_distribuidor) / 100 : 0.45),
    [form.margen_distribuidor]
  );

  const precioLocalCalc = useMemo(() => {
    if (costoPesosNumber > 0) return costoPesosNumber * (1 + margenLocalNumber);
    return 0;
  }, [costoPesosNumber, margenLocalNumber]);

  const precioDistribuidorCalc = useMemo(() => {
    if (costoPesosNumber > 0) return costoPesosNumber * (1 + margenDistribuidorNumber);
    return 0;
  }, [costoPesosNumber, margenDistribuidorNumber]);

  const canSubmit = useMemo(() => {
    const hasCore =
      form.name &&
      form.category_id;
    const hasAnyCost =
      (form.costo_pesos && Number(form.costo_pesos || '0') > 0) ||
      (form.costo_dolares && Number(form.costo_dolares || '0') > 0);
    const hasManualLocal =
      form.precio_local !== '' && Number(form.precio_local || '0') > 0;
    if (form.precio_modo === 'manual') {
      return Boolean(hasCore && hasManualLocal);
    }
    return Boolean(hasCore && hasAnyCost);
  }, [form]);

  useEffect(() => {
    if (!tipoCambioNumber || tipoCambioNumber <= 0 || !lastCostoEdit) return;

    if (lastCostoEdit === 'dolares' && costoDolaresNumber > 0) {
      const nuevoPesos = Number((costoDolaresNumber * tipoCambioNumber).toFixed(2));
      const actualPesos = Number(form.costo_pesos || '0') || 0;
      if (!Number.isNaN(nuevoPesos) && nuevoPesos !== actualPesos) {
        setForm((prev) => ({ ...prev, costo_pesos: String(nuevoPesos) }));
      }
    } else if (lastCostoEdit === 'pesos' && costoPesosNumber > 0) {
      const nuevoDolares = Number((costoPesosNumber / tipoCambioNumber).toFixed(2));
      const actualDolares = Number(form.costo_dolares || '0') || 0;
      if (!Number.isNaN(nuevoDolares) && nuevoDolares !== actualDolares) {
        setForm((prev) => ({ ...prev, costo_dolares: String(nuevoDolares) }));
      }
    }
  }, [tipoCambioNumber, lastCostoEdit, costoPesosNumber, costoDolaresNumber, form.costo_pesos, form.costo_dolares]);

  async function load(pageToLoad?: number, overrideStockFilter?: StockFilter | null) {
    const targetPage = pageToLoad ?? currentPage ?? 1;
    setLoading(true);
    setError(null);
    // Cuando cambia la página mantenemos la selección para que el usuario no pierda lo ya tildado
    try {
      const q = search.trim() || undefined;
      const activeStockFilter = overrideStockFilter !== undefined ? overrideStockFilter : (supplierMode ? stockFilter : undefined);
      const [prodsResponse, configDolar, deletedRows] = await Promise.all([
        Api.productos({
          q,
          page: targetPage,
          paginated: true,
          category_id: categoryFilterId ?? undefined,
          include_descendants: categoryFilterId ? includeDescendants : undefined,
          ...(activeStockFilter ? { stock_filter: activeStockFilter } : {}),
        }),
        Api.getDolarBlue().catch(() => null),
        Api.productosPapelera({ limit: 20 }).catch(() => []),
      ]);
      const resp: any = prodsResponse || {};
      const data = (resp.data || resp) as Producto[];
      setProductos(data);
      setDeletedProductos(Array.isArray(deletedRows) ? (deletedRows as Producto[]) : []);
      if (configDolar && typeof (configDolar as any).valor === 'number') {
        setDolarBlue((configDolar as any).valor);
      }
      const total = Number(resp.total ?? data.length ?? 0);
      const pageFromApi = Number(resp.page ?? targetPage) || targetPage;
      const totalPagesFromApi = Number(resp.totalPages ?? 1) || 1;
      setTotalProductos(total);
      setCurrentPage(pageFromApi);
      setTotalPages(totalPagesFromApi);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando productos');
    } finally {
      setLoading(false);
    }
  }

  async function loadCategoryTree() {
    try {
      const data = (await Api.categoriasTree()) as CategoryNode[];
      setCategoryTree(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las categorias');
    }
  }

  useEffect(() => {
    loadCategoryTree();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setCurrentPage(1);
      load(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search, categoryFilterId, includeDescendants, supplierMode, stockFilter]);

  useEffect(() => {
    if (!dolarBlue) return;
    setForm((prev) => {
      if (editingProducto || prev.tipo_cambio) return prev;
      return { ...prev, tipo_cambio: String(dolarBlue) };
    });
  }, [dolarBlue, editingProducto]);

  useEffect(() => {
    if (!editingProducto?.id) {
      setProductPriceRows([]);
      return;
    }
    setPriceRowsLoading(true);
    Api.productoPrecios(editingProducto.id)
      .then((rows: any) => setProductPriceRows(Array.isArray(rows) ? rows : []))
      .catch(() => setProductPriceRows([]))
      .finally(() => setPriceRowsLoading(false));
  }, [editingProducto?.id]);

  useEffect(() => {
    if (!editingProducto?.id) {
      setCommissionPreview(null);
      return;
    }
    setCommissionPreviewLoading(true);
    Api.productoComisionPreview(editingProducto.id)
      .then((preview: any) => setCommissionPreview(preview || null))
      .catch(() => setCommissionPreview(null))
      .finally(() => setCommissionPreviewLoading(false));
  }, [editingProducto?.id]);

  async function handleImageFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadingImage(true);
    try {
      const url = await uploadImageToCloudinary(file);
      setForm((prev) => ({ ...prev, image_url: url }));
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'No se pudo subir la imagen';
      setUploadError(msg);
    } finally {
      setUploadingImage(false);
    }
  }

  async function runImport(dryRun: boolean) {
    if (!importFile) {
      setImportError('Selecciona un archivo .xlsx o .csv');
      return;
    }
    setImportError(null);
    setImportResult(null);
    if (dryRun) {
      setPreviewing(true);
    } else {
      setImporting(true);
    }
    try {
      const result = await Api.importarProductosExcel(importFile, { dryRun });
      setImportResult(result);
      if (!dryRun) {
        await load(currentPage);
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'No se pudo importar el archivo');
    } finally {
      setPreviewing(false);
      setImporting(false);
    }
  }

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    const priceMode = form.precio_modo === 'manual' ? 'manual' : 'auto';
    const normalizedImageUrl = form.image_url.trim();
    const payload: any = {
      name: form.name,
      codigo: form.codigo.trim() || undefined,
      description: form.description,
      category_id: Number(form.category_id),
      stock_quantity: Number(form.stock_quantity || '0'),
      comision_pct:
        form.comision_pct !== ''
          ? Number(form.comision_pct) || 0
          : undefined,
      precio_modo: priceMode,
      precio_costo_pesos: costoPesosNumber || undefined,
      precio_costo_dolares: costoDolaresNumber || undefined,
      tipo_cambio: tipoCambioNumber || undefined,
      margen_local: margenLocalNumber,
      margen_distribuidor: margenDistribuidorNumber,
      precio_final:
        form.precio_final !== ''
          ? Number(form.precio_final) || 0
          : undefined,
    };
    if (normalizedImageUrl) {
      payload.image_url = normalizedImageUrl;
    } else if (editingProducto) {
      payload.image_url = null;
    }
    if (priceMode === 'manual') {
      payload.price_local = form.precio_local !== '' ? Number(form.precio_local) || 0 : undefined;
      payload.price_distribuidor =
        form.precio_distribuidor !== '' ? Number(form.precio_distribuidor) || 0 : undefined;
      if (payload.price_local != null) {
        payload.price = payload.price_local;
      }
    } else {
      payload.price = precioLocalCalc > 0 ? precioLocalCalc : undefined;
    }
    try {
      if (editingProducto) {
        await Api.actualizarProducto(editingProducto.id, payload);
      } else {
        await Api.crearProducto(payload);
      }
      const keepTipoCambio = form.tipo_cambio || (dolarBlue ? String(dolarBlue) : '');
      setForm(buildEmptyForm(keepTipoCambio));
      setEditingProducto(null);
      setCodigoLookupMsg(null);
      setCodigoLookupError(null);
      await load(currentPage);
    } catch (e: any) {
      if (e && e.code === 'APPROVAL_REQUIRED') {
        const id = e.aprobacionId || e.aprobacion_id;
        const baseMsg =
          'El cambio requiere aprobación de un administrador o gerente y ya quedó registrado.';
        setError(
          id ? `${baseMsg} ID de aprobación: ${id}.` : baseMsg
        );
        return;
      }
      setError(
        e instanceof Error
          ? e.message
          : editingProducto
          ? 'No se pudo actualizar el producto'
          : 'No se pudo crear el producto'
      );
    }
  }

  function startEdit(p: Producto) {
    setError(null);
    setUploadError(null);
    setEditingProducto(p);
    setHistorialProducto(null);
    setForm({
      name: p.name || '',
      codigo: p.codigo || '',
      description: (p.description as string | null) || '',
      price: '',
      image_url: p.image_url || '',
      category_id: p.category_id ? String(p.category_id) : '',
      stock_quantity: String(p.stock_quantity ?? ''),
      comision_pct: p.comision_pct != null ? String(p.comision_pct) : '',
      precio_modo: p.precio_modo === 'manual' ? 'manual' : 'auto',
      precio_local: p.price_local != null ? String(p.price_local) : '',
      precio_distribuidor: p.price_distribuidor != null ? String(p.price_distribuidor) : '',
      costo_pesos: p.costo_pesos != null ? String(p.costo_pesos) : '',
      costo_dolares: p.costo_dolares != null ? String(p.costo_dolares) : '',
      tipo_cambio: p.tipo_cambio != null ? String(p.tipo_cambio) : '',
      margen_local:
        p.margen_local != null
          ? String((p.margen_local * 100).toFixed(2))
          : emptyForm.margen_local,
      margen_distribuidor:
        p.margen_distribuidor != null
          ? String((p.margen_distribuidor * 100).toFixed(2))
          : emptyForm.margen_distribuidor,
      precio_final: p.precio_final != null ? String(p.precio_final) : '',
    });
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // ignore
    }
  }

  async function lookupCodigo() {
    const codigo = form.codigo.trim();
    if (!codigo) {
      setCodigoLookupError('Ingresa un codigo');
      setCodigoLookupMsg(null);
      return;
    }
    setCodigoLookupLoading(true);
    setCodigoLookupError(null);
    setCodigoLookupMsg(null);
    try {
      const prod = await Api.productoPorCodigo(codigo);
      setCodigoLookupMsg('Producto encontrado, listo para editar.');
      startEdit(prod as Producto);
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.toLowerCase().includes('no encontrado')) {
        setCodigoLookupMsg('Codigo libre, listo para crear.');
      } else {
        setCodigoLookupError(msg || 'No se pudo verificar el codigo');
      }
    } finally {
      setCodigoLookupLoading(false);
    }
  }

  async function cargarHistorial(p: Producto) {
    setHistorialProducto(p);
    setHistorial([]);
    setHistorialError(null);
    setHistorialLoading(true);
    try {
      const rows = await Api.productoHistorial(p.id);
      setHistorial(rows as HistorialRow[]);
    } catch (e) {
      setHistorialError(
        e instanceof Error
          ? e.message
          : 'No se pudo cargar el historial de precios'
      );
    } finally {
      setHistorialLoading(false);
    }
  }

  // ── Modo Proveedor — helpers ──────────────────────────────────────────────

  function toggleSupplierMode() {
    const next = !supplierMode;
    setSupplierMode(next);
    if (!next) {
      // Al salir del modo limpiamos selección
      setSelectedIds(new Set());
    }
  }

  function toggleSelectProduct(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(filteredProductos.map((p) => p.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  const allSelected = filteredProductos.length > 0 && filteredProductos.every((p) => selectedIds.has(p.id));
  const someSelected = selectedIds.size > 0;

  function getStockFilterLabel(): string {
    if (stockFilter === 'nulo')  return 'Stock Nulo';
    if (stockFilter === 'bajo')  return 'Stock Bajo';
    return 'Stock Nulo y Stock Bajo';
  }

  async function handleGenerarPdf() {
    if (!someSelected) return;
    setGeneratingPdf(true);
    try {
      const selectedProducts = filteredProductos
        .filter((p) => selectedIds.has(p.id))
        .map((p) => ({
          id:             p.id,
          name:           p.name,
          codigo:         p.codigo ?? null,
          category_name:  p.category_name ?? null,
          stock_quantity: p.stock_quantity,
          stock_minimo:   p.stock_minimo ?? 0,
          cantidad_solicitada: null as null,
        }));

      const blob = await Api.generarPedidoProveedorPdf({
        productos:   selectedProducts,
        filterLabel: getStockFilterLabel(),
      });

      // Disparo de descarga en el browser
      const url      = URL.createObjectURL(blob);
      const anchor   = document.createElement('a');
      const dateStr  = new Date().toISOString().slice(0, 10);
      anchor.href     = url;
      anchor.download = `pedido_proveedor_${dateStr}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      toast.success(`PDF generado con ${selectedProducts.length} producto${selectedProducts.length !== 1 ? 's' : ''}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo generar el PDF');
    } finally {
      setGeneratingPdf(false);
    }
  }

  function getCategoryLabel(product: Producto) {
    const fromPath = buildPathLabelFromDbPath(product.category_path, categoryById);
    if (fromPath) return fromPath;
    const fromMap = categoryById.get(Number(product.category_id));
    if (fromMap?.pathLabel) return fromMap.pathLabel;
    return product.category_name || '-';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="app-title">Productos</h2>
        <button
          type="button"
          onClick={toggleSupplierMode}
          className={[
            'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all',
            supplierMode
              ? 'border-sky-500 bg-sky-500/20 text-sky-300 hover:bg-sky-500/30'
              : 'border-white/20 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white',
          ].join(' ')}
        >
          <Truck size={16} />
          {supplierMode ? 'Salir del modo proveedor' : 'Modo Proveedor'}
        </button>
      </div>
      <div className="app-card p-4 space-y-4">
        <div className="app-panel p-3 space-y-2">
          <div className="text-sm font-semibold text-slate-200">Importar productos desde Excel</div>
          <div className="text-xs text-slate-400">
            Columnas sugeridas: nombre, categoria o category_path (ej: Fundas &gt; Samsung &gt; Brillo), precio o costo_pesos, stock, codigo (opcional), image_url (opcional).
          </div>
          {importError && <Alert kind="error" message={importError} />}
          {importResult && (
            <Alert
              kind={importResult?.totals?.errors ? 'error' : 'info'}
              message={`Filas: ${importResult?.totals?.rows || 0} | ${importResult?.dry_run ? 'A importar' : 'Creados'}: ${importResult?.dry_run ? (importResult?.totals?.would_create || 0) : (importResult?.totals?.created || 0)} | Omitidos: ${importResult?.totals?.skipped || 0} | Errores: ${importResult?.totals?.errors || 0}`}
            />
          )}
          <div className="flex flex-col md:flex-row gap-2 items-start md:items-center">
            <input
              type="file"
              accept=".xlsx,.csv"
              className="input-modern text-sm"
              onChange={(e) => {
                setImportFile(e.target.files?.[0] || null);
                setImportError(null);
                setImportResult(null);
              }}
            />
            <div className="flex gap-2">
              <Button type="button" loading={previewing} onClick={() => runImport(true)}>
                {previewing ? 'Analizando...' : 'Vista previa'}
              </Button>
              <Button type="button" loading={importing} onClick={() => runImport(false)}>
                {importing ? 'Importando...' : 'Importar'}
              </Button>
            </div>
          </div>
          {importResult?.preview?.length ? (
            <div className="text-xs text-slate-300">
              Vista previa (primeras filas validas):
              <div className="overflow-x-auto mt-2">
                <table className="min-w-full text-xs">
                  <thead className="text-left text-slate-400">
                    <tr>
                      <th className="py-1 pr-2">Fila</th>
                      <th className="py-1 pr-2">Nombre</th>
                      <th className="py-1 pr-2">CategorÃ­a</th>
                      <th className="py-1 pr-2">Precio</th>
                      <th className="py-1 pr-2">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {importResult.preview.map((p: any) => (
                      <tr key={`${p.row}-${p.name}`} className="border-t border-white/10">
                        <td className="py-1 pr-2">{p.row}</td>
                        <td className="py-1 pr-2">{p.name}</td>
                        <td className="py-1 pr-2">{p.categoria || '-'}</td>
                        <td className="py-1 pr-2">{p.precio != null ? `$${Number(p.precio).toFixed(2)}` : '-'}</td>
                        <td className="py-1 pr-2">{p.stock ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {importResult?.errors?.length ? (
            <div className="text-xs text-rose-200">
              Errores (primeros 20):
              <ul className="mt-1 space-y-1">
                {importResult.errors.slice(0, 20).map((err: any, idx: number) => (
                  <li key={`${err.row}-${err.field}-${idx}`}>
                    Fila {err.row}: {err.field} - {err.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <form onSubmit={onSubmitForm} className="space-y-5">

          {/* Alerts */}
          {(error || uploadError) && (
            <div className="space-y-1">
              {error && <Alert kind="error" message={error} />}
              {uploadError && <Alert kind="error" message={uploadError} />}
            </div>
          )}
          {(codigoLookupError || codigoLookupMsg) && (
            <div className="space-y-1">
              {codigoLookupError && <Alert kind="error" message={codigoLookupError} />}
              {codigoLookupMsg && <Alert kind="info" message={codigoLookupMsg} />}
            </div>
          )}
          {editingProducto && (
            <div className="flex items-center justify-between rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <span>Editando: <span className="font-semibold">{editingProducto.name}</span></span>
              <button
                type="button"
                className="underline hover:text-amber-100"
                onClick={() => {
                  setEditingProducto(null);
                  const keepTipoCambio = form.tipo_cambio || (dolarBlue ? String(dolarBlue) : '');
                  setForm(buildEmptyForm(keepTipoCambio));
                }}
              >
                Cancelar edición
              </button>
            </div>
          )}

          {/* ── Información básica ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Nombre <span className="text-rose-400">*</span></label>
              <input
                className="input-modern text-sm w-full"
                placeholder="Ej: Funda Samsung A54"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Código de barras</label>
              <div className="flex gap-2">
                <input
                  className="input-modern text-sm flex-1"
                  placeholder="Escanear o ingresar"
                  value={form.codigo}
                  onChange={(e) => {
                    setForm({ ...form, codigo: e.target.value });
                    setCodigoLookupMsg(null);
                    setCodigoLookupError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      lookupCodigo();
                    }
                  }}
                />
                <button
                  type="button"
                  className="whitespace-nowrap rounded-lg border border-white/20 bg-white/10 px-3 py-1 text-xs text-slate-200 hover:bg-white/20"
                  onClick={lookupCodigo}
                  disabled={codigoLookupLoading}
                >
                  {codigoLookupLoading ? 'Verificando...' : 'Verificar'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Descripción</label>
              <input
                className="input-modern text-sm w-full"
                placeholder="Descripción opcional"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>

          {/* ── Categoría e imagen ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Categoría</label>
              <CategoryTreePicker
                tree={categoryTree}
                value={form.category_id ? Number(form.category_id) : null}
                onChange={(id) => setForm({ ...form, category_id: id ? String(id) : '' })}
                placeholder="Seleccionar categoría"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Imagen (opcional)</label>
              <input
                type="file"
                accept="image/*"
                className="input-modern text-sm w-full"
                onChange={handleImageFileChange}
              />
              <input
                className="input-modern text-xs w-full mt-1.5"
                placeholder="O pegar URL de imagen"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
              {uploadingImage && (
                <span className="text-[11px] text-slate-400">Subiendo imagen...</span>
              )}
            </div>
          </div>

          {/* ── Costo ── */}
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Costo</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">En pesos (ARS)</label>
                <input
                  className="input-modern text-sm w-full"
                  placeholder="0.00"
                  type="number"
                  step="0.01"
                  value={form.costo_pesos}
                  onChange={(e) =>
                    setForm((prev) => {
                      setLastCostoEdit('pesos');
                      return { ...prev, costo_pesos: e.target.value };
                    })
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">En dólares (USD)</label>
                <input
                  className="input-modern text-sm w-full"
                  placeholder="0.00"
                  type="number"
                  step="0.01"
                  value={form.costo_dolares}
                  onChange={(e) =>
                    setForm((prev) => {
                      setLastCostoEdit('dolares');
                      return { ...prev, costo_dolares: e.target.value };
                    })
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tipo de cambio</label>
                <input
                  className="input-modern text-sm w-full"
                  placeholder="Dólar blue"
                  type="number"
                  step="0.0001"
                  value={form.tipo_cambio}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, tipo_cambio: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          {/* ── Precios ── */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Precios</div>
              <select
                className="input-modern py-1 px-2 text-xs"
                value={form.precio_modo}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, precio_modo: e.target.value === 'manual' ? 'manual' : 'auto' }))
                }
              >
                <option value="auto">Automático (por márgenes)</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            {form.precio_modo === 'manual' ? (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{priceLabels.local}</label>
                  <input
                    className="input-modern text-sm w-full"
                    placeholder="0.00"
                    type="number"
                    step="0.01"
                    value={form.precio_local}
                    onChange={(e) => setForm({ ...form, precio_local: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{priceLabels.distribuidor}</label>
                  <input
                    className="input-modern text-sm w-full"
                    placeholder="0.00"
                    type="number"
                    step="0.01"
                    value={form.precio_distribuidor}
                    onChange={(e) => setForm({ ...form, precio_distribuidor: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{priceLabels.final}</label>
                  <input
                    className="input-modern text-sm w-full"
                    placeholder="0.00"
                    type="number"
                    step="0.01"
                    value={form.precio_final}
                    onChange={(e) => setForm({ ...form, precio_final: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">% Margen {priceLabels.local}</label>
                  <input
                    className="input-modern text-sm w-full"
                    placeholder="Ej: 30"
                    type="number"
                    step="0.01"
                    value={form.margen_local}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, margen_local: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">% Margen {priceLabels.distribuidor}</label>
                  <input
                    className="input-modern text-sm w-full"
                    placeholder="Ej: 20"
                    type="number"
                    step="0.01"
                    value={form.margen_distribuidor}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, margen_distribuidor: e.target.value }))
                    }
                  />
                </div>
                <div className="flex flex-col justify-center rounded-xl border border-sky-500/25 bg-sky-500/8 px-4 py-3 gap-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Vista previa</div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{priceLabels.local}</span>
                    <span className="font-semibold text-sky-200">${precioLocalCalc.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{priceLabels.distribuidor}</span>
                    <span className="font-semibold text-sky-200">${precioDistribuidorCalc.toFixed(2)}</span>
                  </div>
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs text-slate-400 mb-1">{priceLabels.final} (opcional)</label>
                  <input
                    className="input-modern text-sm w-full"
                    placeholder="Precio final al cliente — dejar vacío para calcular automáticamente"
                    type="number"
                    step="0.01"
                    value={form.precio_final}
                    onChange={(e) => setForm({ ...form, precio_final: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Stock y comisión ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Stock inicial</label>
              <input
                className="input-modern text-sm w-full"
                placeholder="0"
                type="number"
                value={form.stock_quantity}
                onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">% Comisión (opcional)</label>
              <input
                className="input-modern text-sm w-full"
                placeholder="0"
                type="number"
                step="0.01"
                value={form.comision_pct}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, comision_pct: e.target.value }))
                }
              />
            </div>
          </div>

          <Button disabled={!canSubmit} className="w-full">
            {editingProducto ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </form>

        {/* ── Precios por lista dinámica ── */}
        {editingProducto && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Precios por lista</h3>
              {priceRowsLoading && (
                <span className="text-xs text-slate-400 animate-pulse">Cargando…</span>
              )}
            </div>
            {!priceRowsLoading && productPriceRows.length === 0 && (
              <p className="text-xs text-slate-500">No hay listas de precios configuradas.</p>
            )}
            {productPriceRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="text-left py-1.5 pr-3 font-medium">Lista</th>
                      <th className="text-right py-1.5 pr-3 font-medium">Precio</th>
                      <th className="text-center py-1.5 pr-3 font-medium">Modo</th>
                      <th className="text-right py-1.5 font-medium">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productPriceRows.map((row: any) => (
                      <tr key={row.lista_id} className="border-b border-slate-700/40 last:border-0">
                        <td className="py-1.5 pr-3 text-slate-200 font-medium">{row.lista_nombre ?? `Lista ${row.lista_id}`}</td>
                        <td className="py-1.5 pr-3 text-right text-emerald-400 font-semibold">
                          {row.precio != null ? `$${Number(row.precio).toFixed(2)}` : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-center">
                          {row.precio_modo === 'manual'
                            ? <span className="inline-block rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5">manual</span>
                            : <span className="inline-block rounded-full bg-sky-500/15 text-sky-300 px-2 py-0.5">auto</span>}
                        </td>
                        <td className="py-1.5 text-right text-slate-300">
                          {row.margen_override_ratio != null
                            ? `${(Number(row.margen_override_ratio) * 100).toFixed(1)}%`
                            : <span className="text-slate-500">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Panel Modo Proveedor ── */}
        {editingProducto && (
          <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/8 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Comisión a vendedores - Vista previa</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Referencia rápida para validar cuánto representa la comisión por lista en este producto.
                </p>
              </div>
              {commissionPreviewLoading && (
                <span className="text-xs text-slate-400 animate-pulse">Calculando…</span>
              )}
            </div>

            {commissionPreview?.preview_por_lista?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="text-left py-1.5 pr-3 font-medium">Lista</th>
                      <th className="text-right py-1.5 pr-3 font-medium">Precio venta</th>
                      <th className="text-right py-1.5 pr-3 font-medium">Comisión %</th>
                      <th className="text-right py-1.5 font-medium">Comisión $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissionPreview.preview_por_lista.map((row: any) => (
                      <tr key={row.lista_codigo} className="border-b border-slate-700/40 last:border-0">
                        <td className="py-1.5 pr-3 text-slate-200 font-medium">{row.lista_nombre}</td>
                        <td className="py-1.5 pr-3 text-right text-slate-300">
                          {row.precio_venta != null ? `$${Number(row.precio_venta).toFixed(2)}` : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-slate-300">{Number(row.comision_pct || 0).toFixed(2)}%</td>
                        <td className="py-1.5 text-right font-semibold text-cyan-200">
                          {row.comision_monto != null ? `$${Number(row.comision_monto).toFixed(2)}` : <span className="text-slate-500">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !commissionPreviewLoading && (
                <p className="text-xs text-slate-500">No hay vista previa disponible para este producto.</p>
              )
            )}

            {commissionPreview?.nota && (
              <p className="text-[11px] text-slate-500">{commissionPreview.nota}</p>
            )}
          </div>
        )}

        {supplierMode && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/8 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sky-300 text-sm font-semibold">
              <Truck size={15} />
              Modo Proveedor activo
              <span className="ml-auto text-xs text-sky-400/70 font-normal">
                Filtrá por stock crítico, seleccioná los productos y descargá el PDF para enviar al proveedor.
              </span>
            </div>

            {/* Chips de filtro de stock */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Mostrar:</span>
              {(
                [
                  { value: 'nulo',  label: 'Sin stock',        icon: <PackageX size={12} />,     color: 'rose'   },
                  { value: 'bajo',  label: 'Stock bajo',       icon: <AlertTriangle size={12} />, color: 'amber'  },
                  { value: 'ambos', label: 'Sin stock + Bajo', icon: <AlertTriangle size={12} />, color: 'sky'    },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStockFilter(opt.value)}
                  className={[
                    'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all',
                    stockFilter === opt.value
                      ? opt.color === 'rose'
                        ? 'border-rose-500 bg-rose-500/20 text-rose-300'
                        : opt.color === 'amber'
                        ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                        : 'border-sky-500 bg-sky-500/20 text-sky-300'
                      : 'border-white/15 bg-white/5 text-slate-400 hover:border-white/30 hover:text-slate-200',
                  ].join(' ')}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-3 grid grid-cols-1 lg:grid-cols-12 gap-2 items-center">
          <div className="lg:col-span-5 flex items-center gap-2">
            <span className="text-slate-400 text-sm whitespace-nowrap">Buscar:</span>
            <input
              className="input-modern text-sm w-full"
              placeholder="Nombre de producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="lg:col-span-5">
            <CategoryTreePicker
              tree={categoryTree}
              value={categoryFilterId}
              onChange={setCategoryFilterId}
              allowClear
              placeholder="Filtrar por categoria (arbol)"
            />
          </div>
          <label className="lg:col-span-2 flex items-center gap-2 text-xs text-slate-300 select-none">
            <input
              type="checkbox"
              checked={includeDescendants}
              onChange={(e) => setIncludeDescendants(e.target.checked)}
              disabled={!categoryFilterId}
            />
            Incluir subcategorias
          </label>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-8 text-center text-slate-500">Cargando...</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-400">
                <tr>
                  {supplierMode && (
                    <th className="py-2 pr-2 w-8">
                      <button
                        type="button"
                        title={allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                        onClick={allSelected ? deselectAll : selectAll}
                        className="text-sky-400 hover:text-sky-300 transition-colors"
                      >
                        {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    </th>
                  )}
                  <th className="py-2">Nombre</th>
                  <th className="py-2">Código</th>
                  <th className="py-2">Categoría</th>
                  <th className="py-2">Costo ARS</th>
                  <th className="py-2">{priceLabels.local}</th>
                  <th className="py-2">{priceLabels.distribuidor}</th>
                  <th className="py-2">{priceLabels.final}</th>
                  <th className="py-2">Stock</th>
                  {supplierMode && <th className="py-2">S. Mínimo</th>}
                  {!supplierMode && <th className="py-2">Acciones</th>}
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {filteredProductos.length === 0 && productos.length > 0 && (
                  <tr>
                    <td className="py-2 text-slate-400" colSpan={9}>
                      Sin productos que coincidan con la búsqueda
                    </td>
                  </tr>
                )}
                {filteredProductos.map((p) => {
                  const isSelected  = selectedIds.has(p.id);
                  const stockNulo   = p.stock_quantity === 0;
                  const stockMin    = p.stock_minimo ?? 0;
                  const stockBajo   = !stockNulo && stockMin > 0 && p.stock_quantity <= stockMin;
                  const rowHighlight = supplierMode
                    ? stockNulo
                      ? 'bg-rose-500/8 border-rose-500/20'
                      : stockBajo
                      ? 'bg-amber-500/8 border-amber-500/20'
                      : ''
                    : '';
                  return (
                    <tr
                      key={p.id}
                      className={[
                        'border-t border-white/10 hover:bg-white/5 transition-colors',
                        rowHighlight,
                        supplierMode && isSelected ? 'bg-sky-500/10 border-sky-500/20' : '',
                      ].join(' ')}
                      onClick={supplierMode ? () => toggleSelectProduct(p.id) : undefined}
                      style={supplierMode ? { cursor: 'pointer' } : undefined}
                    >
                      {supplierMode && (
                        <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => toggleSelectProduct(p.id)}
                            className={isSelected ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'}
                          >
                            {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        </td>
                      )}
                      <td className="py-2 font-medium">{p.name}</td>
                      <td className="py-2 text-slate-400">{p.codigo || '-'}</td>
                      <td className="py-2">{getCategoryLabel(p)}</td>
                      <td className="py-2">
                        {p.costo_pesos != null
                          ? `$${p.costo_pesos.toFixed(2)}`
                          : '-'}
                      </td>
                      <td className="py-2">
                        {p.price_local != null
                          ? `$${p.price_local.toFixed(2)}`
                          : '-'}
                      </td>
                      <td className="py-2">
                        {p.price_distribuidor != null
                          ? `$${p.price_distribuidor.toFixed(2)}`
                          : '-'}
                      </td>
                      <td className="py-2">
                        {p.precio_final != null
                          ? `$${p.precio_final.toFixed(2)}`
                          : `$${p.price.toFixed(2)}`}
                      </td>
                      <td className="py-2">
                        <span className={[
                          'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold',
                          stockNulo
                            ? 'bg-rose-500/20 text-rose-300'
                            : stockBajo
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'text-slate-200',
                        ].join(' ')}>
                          {p.stock_quantity}
                        </span>
                      </td>
                      {supplierMode && (
                        <td className="py-2 text-slate-400 text-xs">{stockMin}</td>
                      )}
                      {!supplierMode && (
                        <td className="py-2 space-x-2">
                          <button
                            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-xs"
                            onClick={() => startEdit(p)}
                          >
                            Editar
                          </button>
                          <button
                            className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 text-xs"
                            onClick={async () => {
                              if (!window.confirm(`Eliminar producto ${p.name}?`))
                                return;
                              try {
                                await Api.eliminarProducto(p.id);
                                await load(currentPage);
                              } catch (e: any) {
                                setError(e?.message || 'No se pudo eliminar');
                              }
                            }}
                          >
                            Eliminar
                          </button>
                          <button
                            className="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-200 text-xs"
                            onClick={() => cargarHistorial(p)}
                          >
                            Historial
                          </button>
                          <button
                            className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 text-xs"
                            onClick={() => navigate(`/app/integraciones?syncProductId=${p.id}`)}
                          >
                            Publicar en ML
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-3 flex items-center justify-end gap-3 text-sm text-slate-300">
          <button
            className="px-3 py-1 rounded bg-white/5 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || currentPage <= 1}
            onClick={() => {
              if (loading || currentPage <= 1) return;
              load(currentPage - 1);
            }}
          >
            Anterior
          </button>
          <span>
            Página {Math.min(Math.max(currentPage, 1), Math.max(totalPages, 1))} de{' '}
            {Math.max(totalPages, 1)}
            {totalProductos ? ` (${totalProductos} productos)` : ''}
          </span>
          <button
            className="px-3 py-1 rounded bg-white/5 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || currentPage >= totalPages}
            onClick={() => {
              if (loading || currentPage >= totalPages) return;
              load(currentPage + 1);
            }}
          >
            Siguiente
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-100">Papelera de productos</div>
              <div className="text-xs text-slate-400">
                Los productos eliminados quedan aca para poder restaurarlos sin perder historial.
              </div>
            </div>
            <div className="text-xs text-slate-400">
              {deletedProductos.length} elemento{deletedProductos.length === 1 ? '' : 's'}
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-400">
                <tr>
                  <th className="py-2">Nombre</th>
                  <th className="py-2">Codigo</th>
                  <th className="py-2">Categoria</th>
                  <th className="py-2">Eliminado</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {deletedProductos.map((producto) => (
                  <tr key={producto.id} className="border-t border-white/10 hover:bg-white/5">
                    <td className="py-2">{producto.name}</td>
                    <td className="py-2">{producto.codigo || '-'}</td>
                    <td className="py-2">{getCategoryLabel(producto)}</td>
                    <td className="py-2">
                      {producto.deleted_at ? new Date(producto.deleted_at).toLocaleString() : '-'}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200 transition hover:bg-emerald-500/20"
                        onClick={async () => {
                          try {
                            await Api.restaurarProducto(producto.id);
                            await load(currentPage);
                          } catch (requestError: any) {
                            setError(requestError?.message || 'No se pudo restaurar el producto');
                          }
                        }}
                      >
                        Restaurar
                      </button>
                    </td>
                  </tr>
                ))}
                {!deletedProductos.length && (
                  <tr>
                    <td className="py-4 text-slate-400" colSpan={5}>
                      No hay productos en papelera.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Barra flotante Modo Proveedor ── */}
        {supplierMode && someSelected && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-2xl border border-sky-500/40 bg-slate-900/95 px-6 py-3 shadow-2xl shadow-sky-900/30 backdrop-blur-md">
            <div className="flex items-center gap-2 text-sky-300 text-sm">
              <CheckSquare size={16} />
              <span className="font-semibold">{selectedIds.size}</span>
              <span className="text-slate-400">producto{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}</span>
            </div>
            <div className="h-4 w-px bg-white/20" />
            <button
              type="button"
              onClick={deselectAll}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-slate-200 transition-colors"
            >
              <X size={13} />
              Limpiar
            </button>
            <button
              type="button"
              onClick={handleGenerarPdf}
              disabled={generatingPdf}
              className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              <FileDown size={15} />
              {generatingPdf ? 'Generando PDF...' : 'Generar PDF para Proveedor'}
            </button>
          </div>
        )}

        {historialProducto && (
          <div className="mt-6 border-t border-white/10 pt-4 space-y-2">
            <div className="text-sm font-medium text-slate-200">
              Historial de precios para {historialProducto.name}
            </div>
            {historialLoading ? (
              <div className="text-xs text-slate-400">
                Cargando historial...
              </div>
            ) : historialError ? (
              <Alert kind="error" message={historialError} />
            ) : historial.length === 0 ? (
              <div className="text-xs text-slate-400">
                Sin historial registrado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs md:text-sm">
                  <thead className="text-left text-slate-400">
                    <tr>
                      <th className="py-1 pr-2">Fecha</th>
                      <th className="py-1 pr-2">Proveedor</th>
                      <th className="py-1 pr-2">Costo ARS</th>
                      <th className="py-1 pr-2">Costo USD</th>
                      <th className="py-1 pr-2">TC</th>
                      <th className="py-1 pr-2">% {priceLabels.local}</th>
                      <th className="py-1 pr-2">% {priceLabels.distribuidor}</th>
                      <th className="py-1 pr-2">{priceLabels.local} ARS</th>
                      <th className="py-1 pr-2">{priceLabels.distribuidor} ARS</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {historial.map((h) => (
                      <tr
                        key={h.id}
                        className="border-t border-white/10 hover:bg-white/5"
                      >
                        <td className="py-1 pr-2">
                          {h.fecha
                            ? new Date(h.fecha).toLocaleString()
                            : '-'}
                        </td>
                        <td className="py-1 pr-2">
                          {h.proveedor_nombre || '-'}
                        </td>
                        <td className="py-1 pr-2">
                          {h.costo_pesos != null
                            ? `$${h.costo_pesos.toFixed(2)}`
                            : '-'}
                        </td>
                        <td className="py-1 pr-2">
                          {h.costo_dolares != null
                            ? `$${h.costo_dolares.toFixed(2)}`
                            : '-'}
                        </td>
                        <td className="py-1 pr-2">
                          {h.tipo_cambio != null
                            ? h.tipo_cambio.toFixed(2)
                            : '-'}
                        </td>
                        <td className="py-1 pr-2">
                          {h.margen_local != null
                            ? `${(h.margen_local * 100).toFixed(1)}%`
                            : '-'}
                        </td>
                        <td className="py-1 pr-2">
                          {h.margen_distribuidor != null
                            ? `${(h.margen_distribuidor * 100).toFixed(1)}%`
                            : '-'}
                        </td>
                        <td className="py-1 pr-2">
                          {h.precio_local != null
                            ? `$${h.precio_local.toFixed(2)}`
                            : '-'}
                        </td>
                        <td className="py-1 pr-2">
                          {h.precio_distribuidor != null
                            ? `$${h.precio_distribuidor.toFixed(2)}`
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
