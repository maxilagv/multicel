import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Barcode,
  CreditCard,
  Landmark,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingBasket,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import HelpTooltip from '../components/HelpTooltip';
import { useToast } from '../context/ToastContext';
import { useViewMode } from '../context/ViewModeContext';
import { Api } from '../lib/api';
import { formatARS, formatFechaHora } from '../lib/formatters';
import type { Cliente, Deposito, MetodoPago, Producto } from '../types/entities';

type CartItem = {
  productId: number;
  quantity: number;
};

type PaymentPreset = MetodoPago & {
  slug: 'efectivo' | 'tarjeta' | 'transferencia' | 'otro';
  source: 'api' | 'fallback';
};

type CompletedSale = {
  id: number;
  total: number;
  paidWith: string;
  change: number;
  customerName: string;
  createdAt: string;
  items: Array<{
    name: string;
    quantity: number;
    subtotal: number;
  }>;
};

function resolveProductPrice(
  product: Producto | undefined,
  priceListType: 'local' | 'distribuidor' | 'final',
) {
  if (!product) return 0;
  const candidates =
    priceListType === 'final'
      ? [product.precio_final, product.price_local, product.price_distribuidor, product.price]
      : priceListType === 'distribuidor'
      ? [product.price_distribuidor, product.price_local, product.precio_final, product.price]
      : [product.price_local, product.price_distribuidor, product.precio_final, product.price];

  for (const candidate of candidates) {
    const value = Number(candidate || 0);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function normalizeMethodName(name?: string | null): PaymentPreset['slug'] {
  const lower = String(name || '').trim().toLowerCase();
  if (lower.includes('transfer')) return 'transferencia';
  if (lower.includes('tarjeta')) return 'tarjeta';
  if (lower.includes('efectivo')) return 'efectivo';
  return 'otro';
}

function parsePositiveInt(value: string | null): number | null {
  const id = Number(value || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function buildFallbackMethods(): PaymentPreset[] {
  return [
    { id: 1, nombre: 'Efectivo', moneda: 'ARS', activo: true, slug: 'efectivo', source: 'fallback' },
    { id: 2, nombre: 'Tarjeta', moneda: 'ARS', activo: true, slug: 'tarjeta', source: 'fallback' },
    { id: 3, nombre: 'Transferencia', moneda: 'ARS', activo: true, slug: 'transferencia', source: 'fallback' },
  ];
}

function findDefaultCustomer(rows: Cliente[]) {
  const normalized = rows.find((row) =>
    `${row.nombre || ''} ${row.apellido || ''}`.toLowerCase().includes('consumidor final'),
  );
  return normalized || rows[0] || null;
}

export default function CajaRapida() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isSimpleView, viewMode } = useViewMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDepositoId = useMemo(
    () => parsePositiveInt(searchParams.get('deposito_id')),
    [searchParams]
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [productQuery, setProductQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedPaymentSlug, setSelectedPaymentSlug] = useState<PaymentPreset['slug']>('efectivo');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [selectedDepositoId, setSelectedDepositoId] = useState<number | ''>('');
  const [priceListType, setPriceListType] = useState<'local' | 'distribuidor' | 'final'>('final');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [autoPrint, setAutoPrint] = useState(true);
  const [inlineError, setInlineError] = useState('');
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);

  const deferredProductQuery = useDeferredValue(productQuery);
  const effectiveDepositoId =
    typeof selectedDepositoId === 'number' && Number.isInteger(selectedDepositoId) && selectedDepositoId > 0
      ? selectedDepositoId
      : requestedDepositoId;

  const productsQuery = useQuery({
    queryKey: ['productos', 'caja-rapida', effectiveDepositoId || 'all'],
    queryFn: async () =>
      (await Api.productos({
        all: true,
        deposito_id: effectiveDepositoId || undefined,
      })) as Producto[],
    staleTime: 60_000,
  });

  const customersQuery = useQuery({
    queryKey: ['clientes', 'caja-rapida', effectiveDepositoId || 'all'],
    queryFn: async () =>
      (await Api.clientes({
        all: true,
        deposito_id: effectiveDepositoId || undefined,
      })) as Cliente[],
    staleTime: 60_000,
  });

  const depositosQuery = useQuery({
    queryKey: ['depositos', 'caja-rapida'],
    queryFn: async () => {
      try {
        return (await Api.depositos()) as Deposito[];
      } catch {
        return [] as Deposito[];
      }
    },
    staleTime: 60_000,
  });

  const paymentMethodsQuery = useQuery({
    queryKey: ['metodos-pago', 'caja-rapida'],
    queryFn: async () => {
      try {
        const rows = (await Api.metodosPago()) as MetodoPago[];
        const activeRows = Array.isArray(rows) ? rows.filter((row) => row.activo !== false) : [];
        if (!activeRows.length) return buildFallbackMethods();
        return activeRows.map((row) => ({
          ...row,
          slug: normalizeMethodName(row.nombre),
          source: 'api' as const,
        })) as PaymentPreset[];
      } catch {
        return buildFallbackMethods();
      }
    },
    staleTime: 60_000,
  });

  const products = useMemo(
    () => (Array.isArray(productsQuery.data) ? productsQuery.data : []),
    [productsQuery.data],
  );
  const customers = useMemo(
    () => (Array.isArray(customersQuery.data) ? customersQuery.data : []),
    [customersQuery.data],
  );
  const depositos = useMemo(
    () => (Array.isArray(depositosQuery.data) ? depositosQuery.data : []),
    [depositosQuery.data],
  );
  const paymentMethods = useMemo(
    () => (Array.isArray(paymentMethodsQuery.data) ? paymentMethodsQuery.data : []),
    [paymentMethodsQuery.data],
  );

  const productsById = useMemo(() => {
    const map = new Map<number, Producto>();
    for (const product of products) map.set(Number(product.id), product);
    return map;
  }, [products]);

  const cartRows = useMemo(
    () =>
      cart
        .map((item) => {
          const product = productsById.get(item.productId);
          const unitPrice = resolveProductPrice(product, priceListType);
          return {
            product,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice,
            subtotal: unitPrice * item.quantity,
          };
        })
        .filter((row) => row.product),
    [cart, priceListType, productsById],
  );

  const total = useMemo(
    () => cartRows.reduce((acc, row) => acc + Number(row.subtotal || 0), 0),
    [cartRows],
  );

  const effectiveReceived = Number(String(receivedAmount || '').replace(',', '.'));
  const changeAmount =
    selectedPaymentSlug === 'efectivo' && Number.isFinite(effectiveReceived)
      ? Math.max(0, effectiveReceived - total)
      : 0;

  const filteredProducts = useMemo(() => {
    const query = deferredProductQuery.trim().toLowerCase();
    if (!query) return products.slice(0, 12);
    return products
      .filter((product) => {
        const haystack = [product.name, product.codigo || '', product.category_name || '']
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 12);
  }, [deferredProductQuery, products]);

  const selectedPayment = useMemo(
    () => paymentMethods.find((method) => method.slug === selectedPaymentSlug) || paymentMethods[0] || null,
    [paymentMethods, selectedPaymentSlug],
  );

  const selectedCustomer = useMemo(
    () => customers.find((customer) => Number(customer.id) === Number(selectedCustomerId)) || null,
    [customers, selectedCustomerId],
  );

  useEffect(() => {
    if (!customers.length) {
      if (selectedCustomerId) setSelectedCustomerId('');
      return;
    }
    const currentExists = customers.some(
      (customer) => Number(customer.id) === Number(selectedCustomerId || 0),
    );
    if (currentExists) return;
    const defaultCustomer = findDefaultCustomer(customers);
    setSelectedCustomerId(Number(defaultCustomer?.id || customers[0]?.id || ''));
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    if (!depositos.length) return;
    const requestedExists =
      requestedDepositoId != null &&
      depositos.some((deposito) => Number(deposito.id) === Number(requestedDepositoId));
    if (requestedExists && Number(selectedDepositoId || 0) !== Number(requestedDepositoId)) {
      setSelectedDepositoId(requestedDepositoId);
      return;
    }
    if (!selectedDepositoId) {
      setSelectedDepositoId(Number(depositos[0].id));
    }
  }, [depositos, requestedDepositoId, selectedDepositoId]);

  useEffect(() => {
    const focusRequested = searchParams.get('focus');
    if (focusRequested !== 'search') return;
    searchInputRef.current?.focus();
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('focus');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (requestedDepositoId === effectiveDepositoId) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (effectiveDepositoId) next.set('deposito_id', String(effectiveDepositoId));
      else next.delete('deposito_id');
      return next;
    }, { replace: true });
  }, [effectiveDepositoId, requestedDepositoId, setSearchParams]);

  useEffect(() => {
    const handleFocusSearch = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('kaisen:focus-product-search', handleFocusSearch as EventListener);
    return () =>
      window.removeEventListener('kaisen:focus-product-search', handleFocusSearch as EventListener);
  }, []);

  const saleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomerId) {
        throw new Error('Elegi un cliente antes de cobrar.');
      }
      if (!cartRows.length) {
        throw new Error('Agrega al menos un producto para continuar.');
      }
      if (selectedPaymentSlug === 'efectivo' && effectiveReceived > 0 && effectiveReceived < total) {
        throw new Error('El monto recibido no alcanza para cubrir el total.');
      }

      const sale = await Api.crearVenta({
        cliente_id: Number(selectedCustomerId),
        fecha: new Date().toISOString(),
        descuento: 0,
        impuestos: 0,
        deposito_id: selectedDepositoId ? Number(selectedDepositoId) : undefined,
        caja_tipo: 'sucursal',
        price_list_type: priceListType,
        items: cartRows.map((row) => ({
          producto_id: Number(row.productId),
          cantidad: Number(row.quantity),
          precio_unitario: Number(row.unitPrice),
        })),
      });

      if (total > 0) {
        if (selectedPayment?.source === 'api' && selectedPayment?.id) {
          await Api.crearPago({
            venta_id: Number(sale.id),
            cliente_id: Number(selectedCustomerId),
            fecha: new Date().toISOString(),
            metodos: [
              {
                metodo_id: Number(selectedPayment.id),
                monto: Number(total.toFixed(2)),
                moneda: selectedPayment.moneda || 'ARS',
              },
            ],
          });
        } else {
          await Api.crearPago({
            venta_id: Number(sale.id),
            cliente_id: Number(selectedCustomerId),
            fecha: new Date().toISOString(),
            monto: Number(total.toFixed(2)),
            metodo: selectedPaymentSlug,
          });
        }
      }

      return sale;
    },
    onSuccess: (sale) => {
      const snapshot: CompletedSale = {
        id: Number(sale.id),
        total,
        paidWith: selectedPayment?.nombre || selectedPaymentSlug,
        change: changeAmount,
        customerName:
          [selectedCustomer?.nombre, selectedCustomer?.apellido].filter(Boolean).join(' ') ||
          'Consumidor final',
        createdAt: new Date().toISOString(),
        items: cartRows.map((row) => ({
          name: row.product?.name || 'Producto',
          quantity: row.quantity,
          subtotal: row.subtotal,
        })),
      };

      setCompletedSale(snapshot);
      setCart([]);
      setProductQuery('');
      setReceivedAmount('');
      setInlineError('');
      toast.success(`Venta #${sale.id} registrada correctamente.`);

      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['informes'] });

      if (autoPrint) {
        window.setTimeout(() => window.print(), 180);
      }
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'No se pudo completar la venta.';
      setInlineError(message);
      toast.error(message);
    },
  });

  function addProduct(product: Producto) {
    const productId = Number(product.id);
    setInlineError('');
    setCompletedSale(null);
    setCart((current) => {
      const existing = current.find((item) => item.productId === productId);
      if (existing) {
        return current.map((item) =>
          item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...current, { productId, quantity: 1 }];
    });
    startTransition(() => setProductQuery(''));
    searchInputRef.current?.focus();
  }

  function updateQuantity(productId: number, delta: number) {
    setCart((current) =>
      current
        .map((item) =>
          item.productId === productId ? { ...item, quantity: item.quantity + delta } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function removeProduct(productId: number) {
    setCart((current) => current.filter((item) => item.productId !== productId));
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!filteredProducts.length) return;
    addProduct(filteredProducts[0]);
  }

  const loading =
    productsQuery.isLoading ||
    customersQuery.isLoading ||
    paymentMethodsQuery.isLoading;

  const hasOperationalData = products.length > 0 && customers.length > 0;

  return (
    <div className="space-y-6">
      <section className="app-card relative overflow-hidden px-5 py-5 sm:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.12),transparent_32%)]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-cyan-200">
              <ShoppingBasket size={14} />
              Venta en menos de 3 minutos
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">
              Caja Rapida
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Buscas el producto, ajustas cantidades y cobras sin modales ni formularios largos. Pensada para mostrador, teclado y touch.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Modo</div>
              <div className="mt-2 text-sm font-semibold text-slate-100">
                {viewMode === 'simple' ? 'Vista simple' : 'Vista completa'}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Atajos</div>
              <div className="mt-2 text-sm font-semibold text-slate-100">F1, F3, Ctrl+P</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Impresion</div>
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-100">
                <input
                  type="checkbox"
                  checked={autoPrint}
                  onChange={(event) => setAutoPrint(event.target.checked)}
                  className="rounded border-white/20 bg-black/30"
                />
                Ticket al cobrar
              </label>
            </div>
          </div>
        </div>
      </section>

      {!hasOperationalData && !loading ? (
        <section className="app-card p-6">
          <div className="text-lg font-semibold text-slate-100">Faltan datos iniciales</div>
          <p className="mt-2 max-w-xl text-sm text-slate-300">
            Para usar Caja Rapida necesitas al menos un producto y un cliente activo. Completa el onboarding y vuelve a esta pantalla.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href="/app/productos"
              className="inline-flex min-h-[44px] items-center rounded-xl bg-cyan-500 px-4 text-sm font-medium text-slate-950"
            >
              Ir a productos
            </a>
            <a
              href="/app/clientes"
              className="inline-flex min-h-[44px] items-center rounded-xl border border-white/15 px-4 text-sm text-slate-200"
            >
              Ir a clientes
            </a>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="app-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                Buscar producto
                <HelpTooltip text="Puedes buscar por nombre, codigo interno o codigo de barras. Con Enter agregas el primer resultado." />
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Escribe, escanea o pega el codigo y presiona Enter.
              </p>
            </div>
            {!isSimpleView && (
              <div className="flex flex-wrap gap-2">
                {(['final', 'local', 'distribuidor'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPriceListType(option)}
                    className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.18em] transition ${
                      priceListType === option
                        ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-100'
                        : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleSearchSubmit} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Producto o codigo</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  ref={searchInputRef}
                  data-testid="buscar-producto"
                  type="search"
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  placeholder="Ej. Coca Cola 2L o 779..."
                  className="w-full rounded-2xl border border-white/10 bg-black/30 py-4 pl-12 pr-4 text-base text-slate-100 outline-none transition focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/20"
                />
              </div>
            </label>
            <button
              type="button"
              onClick={() => {
                searchInputRef.current?.focus();
                searchInputRef.current?.select();
              }}
              className="inline-flex min-h-[58px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm text-slate-100 transition hover:bg-white/10"
            >
              <Barcode size={18} />
              Escanear codigo
            </button>
          </form>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => {
              const unitPrice = resolveProductPrice(product, priceListType);
              return (
                <button
                  key={product.id}
                  type="button"
                  data-testid={`producto-${String(product.name || '')
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, '-')}`}
                  onClick={() => addProduct(product)}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">{product.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {product.codigo || 'Sin codigo'} · {product.category_name || 'General'}
                      </div>
                    </div>
                    <div className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100">
                      {typeof product.stock_quantity === 'number'
                        ? `Stock ${product.stock_quantity}`
                        : 'Stock s/d'}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-lg font-semibold text-slate-50">{formatARS(unitPrice)}</div>
                    <div className="text-xs uppercase tracking-[0.16em] text-cyan-200">Agregar</div>
                  </div>
                </button>
              );
            })}
            {!filteredProducts.length && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-slate-400">
                No encontramos productos con esa busqueda.
              </div>
            )}
          </div>
        </section>
        <section className="space-y-6">
          <section className="app-card p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-lg font-semibold text-slate-50">
                  Resumen de venta
                  <HelpTooltip text="En vista simple se muestran solo datos operativos: producto, cantidad, total y cobro. Cambia a vista completa para elegir lista de precios y ajustar mas detalles." />
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  {cartRows.length
                    ? `${cartRows.length} producto${cartRows.length > 1 ? 's' : ''} listos para cobrar`
                    : 'Todavia no agregaste productos'}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-right">
                <div className="text-[11px] uppercase tracking-[0.16em] text-amber-100">Total</div>
                <div className="mt-1 text-2xl font-semibold text-slate-50">{formatARS(total)}</div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {cartRows.map((row) => (
                <article
                  key={row.productId}
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-100">
                        {row.product?.name}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {formatARS(row.unitPrice)} c/u
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Quitar ${row.product?.name}`}
                      onClick={() => removeProduct(row.productId)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-200"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(row.productId, -1)}
                        aria-label={`Restar una unidad de ${row.product?.name}`}
                        className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-100 transition hover:bg-white/10"
                      >
                        <Minus size={18} />
                      </button>
                      <div className="min-w-[72px] rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-center text-lg font-semibold text-slate-50">
                        {row.quantity}
                      </div>
                      <button
                        type="button"
                        onClick={() => updateQuantity(row.productId, 1)}
                        aria-label={`Sumar una unidad de ${row.product?.name}`}
                        className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-100 transition hover:bg-white/10"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Subtotal</div>
                      <div className="mt-1 text-xl font-semibold text-slate-50">
                        {formatARS(row.subtotal)}
                      </div>
                    </div>
                  </div>
                </article>
              ))}

              {!cartRows.length && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-400">
                  Busca un producto y presiona Enter para agregarlo al carrito.
                </div>
              )}
            </div>
          </section>

          <section className="app-card p-5 sm:p-6">
            <div className="flex items-center gap-2 text-lg font-semibold text-slate-50">
              Cobro
              <HelpTooltip text="Puedes cobrar con efectivo, tarjeta o transferencia. Si el sistema no permite listar metodos configurados, Caja Rapida usa presets seguros para que el vendedor igual pueda operar." />
            </div>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Cliente</span>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <select
                    value={selectedCustomerId}
                    onChange={(event) =>
                      setSelectedCustomerId(event.target.value ? Number(event.target.value) : '')
                    }
                    className="w-full rounded-2xl border border-white/10 bg-black/30 py-4 pl-12 pr-4 text-base text-slate-100 outline-none transition focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/20"
                  >
                    <option value="">Selecciona un cliente</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {[customer.nombre, customer.apellido].filter(Boolean).join(' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              {!isSimpleView && depositos.length > 1 && (
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Deposito de salida</span>
                  <select
                    value={selectedDepositoId}
                    onChange={(event) =>
                      setSelectedDepositoId(event.target.value ? Number(event.target.value) : '')
                    }
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-base text-slate-100 outline-none transition focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/20"
                  >
                    <option value="">Automatico</option>
                    {depositos.map((deposito) => (
                      <option key={deposito.id} value={deposito.id}>
                        {deposito.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!isSimpleView && depositos.length === 1 && (
                <div className="block">
                  <span className="mb-2 block text-sm text-slate-300">Deposito de salida</span>
                  <div className="w-full rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-base text-cyan-100">
                    {depositos[0].nombre}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-2 text-sm text-slate-300">Metodo de cobro</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {paymentMethods.map((method) => {
                    const Icon =
                      method.slug === 'efectivo'
                        ? Landmark
                        : method.slug === 'tarjeta'
                        ? CreditCard
                        : method.slug === 'transferencia'
                        ? Printer
                        : ShoppingBasket;
                    const selected = selectedPaymentSlug === method.slug;
                    return (
                      <button
                        key={`${method.source}-${method.slug}-${method.id}`}
                        type="button"
                        data-testid={`btn-cobrar-${method.slug}`}
                        onClick={() => setSelectedPaymentSlug(method.slug)}
                        className={`rounded-2xl border px-4 py-4 text-left transition ${
                          selected
                            ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-50'
                            : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-black/20">
                            <Icon size={18} />
                          </div>
                          <div>
                            <div className="text-sm font-semibold">{method.nombre}</div>
                            <div className="text-xs text-slate-400">
                              {method.source === 'api' ? 'Configurado' : 'Preset rapido'}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedPaymentSlug === 'efectivo' && (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm text-slate-300">Recibido</span>
                    <input
                      inputMode="decimal"
                      value={receivedAmount}
                      onChange={(event) => setReceivedAmount(event.target.value)}
                      placeholder="0,00"
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-base text-slate-100 outline-none transition focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/20"
                    />
                  </label>
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4">
                    <div className="text-sm text-emerald-100">Vuelto</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-50">
                      {formatARS(changeAmount)}
                    </div>
                  </div>
                </div>
              )}

              {inlineError && (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {inlineError}
                </div>
              )}

              {completedSale && (
                <div
                  data-testid="ticket"
                  className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-50"
                >
                  Venta #{completedSale.id} registrada para {completedSale.customerName}. Total {formatARS(completedSale.total)} con {completedSale.paidWith}. {completedSale.change > 0 ? `Vuelto ${formatARS(completedSale.change)}.` : ''}
                </div>
              )}

              <button
                type="button"
                onClick={() => saleMutation.mutate()}
                disabled={saleMutation.isPending || !cartRows.length || !selectedCustomerId}
                className="inline-flex min-h-[58px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-amber-300 via-cyan-300 to-emerald-300 px-6 text-base font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saleMutation.isPending ? 'Cobrando...' : 'Cobrar'}
              </button>
            </div>
          </section>
        </section>
      </div>

      {completedSale && (
        <section className="caja-ticket-print" aria-hidden="true">
          <div className="text-xl font-bold">Kaisen ERP</div>
          <div className="mt-1 text-sm">Ticket de venta #{completedSale.id}</div>
          <div className="mt-1 text-sm">Fecha: {formatFechaHora(completedSale.createdAt)}</div>
          <div className="mt-1 text-sm">Cliente: {completedSale.customerName}</div>
          <div className="mt-4 border-t border-black pt-3 text-sm">
            {completedSale.items.map((item) => (
              <div key={`${completedSale.id}-${item.name}`} className="flex justify-between gap-4">
                <span>
                  {item.name} x{item.quantity}
                </span>
                <span>{formatARS(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-black pt-3 text-base font-semibold">
            Total: {formatARS(completedSale.total)}
          </div>
          <div className="mt-1 text-sm">Cobro: {completedSale.paidWith}</div>
          <div className="mt-1 text-sm">Vuelto: {formatARS(completedSale.change)}</div>
        </section>
      )}
    </div>
  );
}
