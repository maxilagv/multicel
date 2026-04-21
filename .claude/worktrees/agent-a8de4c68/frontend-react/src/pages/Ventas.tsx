import { useCallback, useEffect, useMemo, useState } from 'react';
import ChartCard from '../ui/ChartCard';
import DataTable from '../ui/DataTable';
import { Api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { getRoleFromToken } from '../lib/auth';
import { usePriceLabels } from '../lib/priceLabels';
import ProductPicker from '../components/ProductPicker';
import { useMediaQuery } from '../lib/useMediaQuery';
import { trackMobileEvent } from '../lib/mobileTelemetry';

type Cliente = { id: number; nombre: string; apellido?: string };
type Producto = {
  id: number;
  name: string;
  codigo?: string | null;
  price: number;
  category_name?: string;
  stock_quantity?: number | null;
  precio_final?: number | null;
  price_local?: number | null;
  price_distribuidor?: number | null;
  costo_pesos?: number | null;
  costo_dolares?: number | null;
  margen_local?: number | null;
  margen_distribuidor?: number | null;
};
type Venta = {
  id: number;
  cliente_id: number;
  cliente_nombre: string;
  fecha: string;
  total: number;
  descuento: number;
  impuestos: number;
  neto: number;
  estado_pago: string;
  estado_entrega?: 'pendiente' | 'entregado';
  caja_tipo?: 'home_office' | 'sucursal';
  oculto?: boolean;
  es_reserva?: boolean;
  total_pagado?: number;
  saldo_pendiente?: number;
  price_list_type?: 'local' | 'distribuidor' | 'final' | null;
};

type Deposito = {
  id: number;
  nombre: string;
  codigo?: string | null;
};

type VentaDetalleItem = {
  id: number;
  producto_id: number;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  descuento_oferta?: number;
  descuento_oferta_pct?: number;
  subtotal_neto?: number;
  lista_precio_codigo?: 'local' | 'distribuidor' | 'final' | 'oferta' | null;
  oferta_precio_id?: number | null;
  oferta_nombre?: string | null;
  oferta_tipo?: string | null;
};

type ItemDraft = {
	producto_id: number | '';
	cantidad: string;
	precio_unitario: string;
  };

type MetodoPago = {
  id: number;
  nombre: string;
  moneda?: string | null;
  activo?: boolean;
};

type PagoMetodoDraft = {
  metodo_id: string;
  monto: string;
  moneda?: string | null;
};
type ReferidoInfo = {
  codigo: string;
  descuento_aplicado: number;
  comision_monto: number;
  alianza_nombre?: string | null;
  pyme_nombre?: string | null;
};

type FacturaInfo = {
  id: number;
  estado: string;
  numero_factura?: string | null;
  cae?: string | null;
  cae_vto?: string | null;
  error?: string | null;
  total?: number | null;
  tipo_comprobante?: string | null;
  punto_venta?: number | null;
};

type PuntoVentaArca = {
  id: number;
  punto_venta: number;
  nombre?: string | null;
  activo?: boolean | number;
};

export default function Ventas() {
  const { accessToken } = useAuth();
  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isFletero = role === 'fletero';
  const canCreateSale = !isFletero;
  const canOverrideComprobante = role === 'admin' || role === 'gerente';
  const { labels: priceLabels } = usePriceLabels();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [depositoId, setDepositoId] = useState<number | ''>('');
  const [esReserva, setEsReserva] = useState(false);
  const [detalleVenta, setDetalleVenta] = useState<{
    abierto: boolean;
    venta: Venta | null;
    items: VentaDetalleItem[];
    loading: boolean;
    error: string | null;
  }>({
    abierto: false,
    venta: null,
    items: [],
    loading: false,
    error: null,
  });
  const [remitoModal, setRemitoModal] = useState<{
    abierto: boolean;
    venta: Venta | null;
    observaciones: string;
    loading: boolean;
    error: string | null;
  }>({
    abierto: false,
    venta: null,
    observaciones: '',
    loading: false,
    error: null,
  });
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([]);
  const [metodosPagoLoading, setMetodosPagoLoading] = useState(false);
  const [metodosPagoError, setMetodosPagoError] = useState<string | null>(null);
  const [pagoModal, setPagoModal] = useState<{
    abierto: boolean;
    venta: Venta | null;
    fecha: string;
    metodos: PagoMetodoDraft[];
    saving: boolean;
    error: string | null;
  }>({
    abierto: false,
    venta: null,
    fecha: new Date().toISOString().slice(0, 10),
    metodos: [{ metodo_id: '', monto: '', moneda: '' }],
    saving: false,
    error: null,
  });

  // Nueva venta state
  const [open, setOpen] = useState(false);
  const [clienteId, setClienteId] = useState<number | ''>('');
  const [fecha, setFecha] = useState<string>(() => new Date().toISOString().slice(0, 16)); // yyyy-MM-ddTHH:mm
  const [descuento, setDescuento] = useState<number>(0);
  const [impuestos, setImpuestos] = useState<number>(0);
  const [items, setItems] = useState<ItemDraft[]>([{ producto_id: '', cantidad: '1', precio_unitario: '' }]);
  const [error, setError] = useState<string>('');
  const [priceType, setPriceType] = useState<'local' | 'distribuidor' | 'final'>('local');
  const [referidoCodigo, setReferidoCodigo] = useState('');
  const [referidoInfo, setReferidoInfo] = useState<ReferidoInfo | null>(null);
  const [referidoError, setReferidoError] = useState('');
  const [referidoLoading, setReferidoLoading] = useState(false);
  const [facturaInfo, setFacturaInfo] = useState<FacturaInfo | null>(null);
  const [facturaSnapshot, setFacturaSnapshot] = useState<any>(null);
  const [facturaLoading, setFacturaLoading] = useState(false);
  const [facturaError, setFacturaError] = useState<string | null>(null);
  const [emitLoading, setEmitLoading] = useState(false);
  const [puntosVentaArca, setPuntosVentaArca] = useState<PuntoVentaArca[]>([]);
  const [emitForm, setEmitForm] = useState({
    punto_venta_id: '',
    tipo_comprobante: '',
    concepto: '1',
    fecha_serv_desde: '',
    fecha_serv_hasta: '',
    fecha_vto_pago: '',
  });

  async function loadAll() {
    const startedAt = Date.now();
    setLoading(true);
    setError('');
    try {
      if (isFletero) {
        const v = await Api.ventas({ view: isMobile ? 'mobile' : undefined });
        setVentas(v || []);
        setClientes([]);
        setProductos([]);
        setDepositos([]);
        setDepositoId('');
        if (isMobile) {
          trackMobileEvent('ventas_load_success', {
            role: 'fletero',
            ventas: Array.isArray(v) ? v.length : 0,
            duration_ms: Date.now() - startedAt,
          });
        }
        return;
      }
      const [v, c, p, d] = await Promise.all([
        Api.ventas({ view: isMobile ? 'mobile' : undefined }),
        Api.clientes({ all: true, view: isMobile ? 'mobile' : undefined }),
        Api.productos({ all: true }),
        Api.depositos(),
      ]);
      setVentas(v || []);
      setClientes(c || []);
      setProductos(
        (p || []).map((r: any) => ({
          id: Number(r.id),
          name: r.name,
          codigo: r.codigo || null,
          price: Number(r.price || 0),
          category_name: r.category_name,
          stock_quantity:
            typeof r.stock_quantity !== 'undefined' && r.stock_quantity !== null
              ? Number(r.stock_quantity)
              : null,
          precio_final:
            typeof r.precio_final !== 'undefined' && r.precio_final !== null
              ? Number(r.precio_final)
              : null,
          price_local:
            typeof r.price_local !== 'undefined' && r.price_local !== null
              ? Number(r.price_local)
              : null,
          price_distribuidor:
            typeof r.price_distribuidor !== 'undefined' && r.price_distribuidor !== null
              ? Number(r.price_distribuidor)
              : null,
          costo_pesos:
            typeof r.costo_pesos !== 'undefined' && r.costo_pesos !== null
              ? Number(r.costo_pesos)
              : null,
          costo_dolares:
            typeof r.costo_dolares !== 'undefined' && r.costo_dolares !== null
              ? Number(r.costo_dolares)
              : null,
          margen_local:
            typeof r.margen_local !== 'undefined' && r.margen_local !== null
              ? Number(r.margen_local)
              : null,
            margen_distribuidor:
              typeof r.margen_distribuidor !== 'undefined' && r.margen_distribuidor !== null
                ? Number(r.margen_distribuidor)
                : null,
          })),
      );
      const deps: Deposito[] = (d || []).map((dep: any) => ({
        id: dep.id,
        nombre: dep.nombre,
        codigo: dep.codigo ?? null,
      }));
      setDepositos(deps);
      if (!depositoId && deps.length > 0) {
        setDepositoId(deps[0].id);
      }
      if (isMobile) {
        trackMobileEvent('ventas_load_success', {
          role: role || 'unknown',
          ventas: Array.isArray(v) ? v.length : 0,
          clientes: Array.isArray(c) ? c.length : 0,
          productos: Array.isArray(p) ? p.length : 0,
          duration_ms: Date.now() - startedAt,
        });
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar las ventas');
      if (isMobile) {
        trackMobileEvent('ventas_load_error', {
          role: role || 'unknown',
          message: e?.message || 'No se pudieron cargar las ventas',
          duration_ms: Date.now() - startedAt,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadArcaSupport() {
    if (isFletero) {
      setPuntosVentaArca([]);
      return;
    }
    try {
      const pvs = await Api.arcaPuntosVenta();
      setPuntosVentaArca((pvs || []) as PuntoVentaArca[]);
    } catch {
      setPuntosVentaArca([]);
    }
  }

  useEffect(() => {
    loadAll();
    loadArcaSupport();
  }, [isFletero, isMobile]);

  useEffect(() => {
    if (isFletero) {
      setMetodosPago([]);
      setMetodosPagoError(null);
      setMetodosPagoLoading(false);
      return;
    }
    let active = true;
    (async () => {
      setMetodosPagoLoading(true);
      setMetodosPagoError(null);
      try {
        const rows = await Api.metodosPago();
        if (!active) return;
        setMetodosPago(Array.isArray(rows) ? (rows as MetodoPago[]) : []);
      } catch (e: any) {
        if (!active) return;
        setMetodosPagoError(e?.message || 'No se pudieron cargar los metodos de pago');
        setMetodosPago([]);
      } finally {
        if (active) setMetodosPagoLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isFletero]);

  const productosById = useMemo(() => new Map(productos.map(p => [p.id, p])), [productos]);
  const productOptions = useMemo(
    () =>
      productos.map((p) => ({
        id: p.id,
        name: p.name,
        category_name: p.category_name || null,
        codigo: p.codigo || null,
        stock_quantity: typeof p.stock_quantity === 'number' ? p.stock_quantity : null,
        extra:
          Number.isFinite(Number(p.price)) && Number(p.price) > 0
            ? `Precio base: $${Number(p.price).toFixed(2)}`
            : null,
      })),
    [productos],
  );

  const calculatePriceByType = useCallback((prod: Producto | undefined) => {
    if (!prod) return 0;
    const basePrice = Number(prod.price || 0);
    const costoPesos = typeof prod.costo_pesos === 'number' ? prod.costo_pesos || 0 : 0;
    const margenLocal =
      typeof prod.margen_local === 'number' && prod.margen_local !== null
        ? prod.margen_local
        : 0.15;
    const margenDistribuidor =
      typeof prod.margen_distribuidor === 'number' && prod.margen_distribuidor !== null
        ? prod.margen_distribuidor
        : 0.45;

    const precioLocalCalc = costoPesos > 0 ? costoPesos * (1 + margenLocal) : 0;
    const precioDistribuidorCalc = costoPesos > 0 ? costoPesos * (1 + margenDistribuidor) : 0;

    let priceToUse = 0;

    switch (priceType) {
      case 'final': {
        const finalManual =
          typeof prod.precio_final === 'number' && prod.precio_final > 0 ? prod.precio_final : 0;
        priceToUse = finalManual || precioLocalCalc || basePrice || precioDistribuidorCalc;
        break;
      }
      case 'distribuidor': {
        const dist =
          typeof prod.price_distribuidor === 'number' && prod.price_distribuidor > 0
            ? prod.price_distribuidor
            : 0;
        priceToUse = dist || precioDistribuidorCalc || basePrice || precioLocalCalc;
        break;
      }
      case 'local':
      default: {
        const local =
          typeof prod.price_local === 'number' && prod.price_local > 0 ? prod.price_local : 0;
        priceToUse = local || precioLocalCalc || basePrice || precioDistribuidorCalc;
        break;
      }
    }

    try {
      console.log('[Ventas] auto precio', {
        priceType,
        prodId: prod.id,
        basePrice,
        precio_local: prod.price_local,
        precio_distribuidor: prod.price_distribuidor,
        precio_final: prod.precio_final,
        costo_pesos: prod.costo_pesos,
        margen_local: prod.margen_local,
        margen_distribuidor: prod.margen_distribuidor,
        precioLocalCalc,
        precioDistribuidorCalc,
        priceToUse,
      });
    } catch {}

    return priceToUse > 0 ? priceToUse : 0;
  }, [priceType]);

  // Recalculate all item prices when the global priceType changes
  useEffect(() => {
    setItems(prevItems =>
      prevItems.map(it => {
        const prod = productosById.get(Number(it.producto_id));
        const newAutoPrice = calculatePriceByType(prod);
        // Only update the price if the product is already selected
        if (it.producto_id) {
          return { ...it, precio_unitario: newAutoPrice > 0 ? String(newAutoPrice) : '' };
        }
        return it;
      })
    );
  }, [priceType, productosById, calculatePriceByType]);
  

  const subtotal = useMemo(() => {
    return items.reduce((acc, it) => {
      const unit = Number(it.precio_unitario || 0);
      const qty = Number(it.cantidad || 0);
      return acc + unit * qty;
    }, 0);
  }, [items]);

  const referidoDescuento = useMemo(
    () => Number(referidoInfo?.descuento_aplicado || 0),
    [referidoInfo]
  );
  const neto = useMemo(
    () => subtotal - (descuento || 0) - referidoDescuento + (impuestos || 0),
    [subtotal, descuento, referidoDescuento, impuestos]
  );
  const labelPrecioLista = useCallback(
    (code?: string | null) => {
      const normalized = String(code || '').trim().toLowerCase();
      if (normalized === 'oferta') return 'Oferta';
      if (normalized === 'distribuidor') return priceLabels.distribuidor;
      if (normalized === 'final') return priceLabels.final;
      if (normalized === 'local') return priceLabels.local;
      return '-';
    },
    [priceLabels]
  );
  const totalDetalle = useMemo(
    () => detalleVenta.items.reduce((acc, it) => acc + Number(it.subtotal || 0), 0),
    [detalleVenta.items]
  );
  const totalDetalleDescuentoOferta = useMemo(
    () => detalleVenta.items.reduce((acc, it) => acc + Number(it.descuento_oferta || 0), 0),
    [detalleVenta.items]
  );
  const totalDetalleNeto = useMemo(
    () =>
      detalleVenta.items.reduce((acc, it) => {
        if (typeof it.subtotal_neto === 'number') return acc + Number(it.subtotal_neto || 0);
        return acc + Number(it.subtotal || 0) - Number(it.descuento_oferta || 0);
      }, 0),
    [detalleVenta.items]
  );
  const totalPagoMetodos = useMemo(
    () =>
      (pagoModal.metodos || []).reduce((acc, row) => {
        const monto = Number(String(row.monto || '').replace(',', '.'));
        return acc + (Number.isFinite(monto) && monto > 0 ? monto : 0);
      }, 0),
    [pagoModal.metodos]
  );

  function addItemRow() { setItems(prev => [...prev, { producto_id: '', cantidad: '1', precio_unitario: '' }]); }
  function removeItemRow(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }
  function updateItem(idx: number, patch: Partial<ItemDraft>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function ventaSaldoPendiente(venta: Venta) {
    const saldoDirecto = Number(venta.saldo_pendiente);
    if (Number.isFinite(saldoDirecto)) return Math.max(0, Math.round(saldoDirecto * 100) / 100);
    const netoVenta = Number(venta.neto || 0);
    const pagadoVenta = Number(venta.total_pagado || 0);
    return Math.max(0, Math.round((netoVenta - pagadoVenta) * 100) / 100);
  }

  function canRegistrarPagoVenta(venta: Venta) {
    if (venta.estado_pago === 'cancelado') return false;
    return ventaSaldoPendiente(venta) > 0.009;
  }

  function abrirPagoModal(venta: Venta) {
    setPagoModal({
      abierto: true,
      venta,
      fecha: new Date().toISOString().slice(0, 10),
      metodos: [{ metodo_id: '', monto: '', moneda: '' }],
      saving: false,
      error: null,
    });
  }

  function cerrarPagoModal() {
    setPagoModal({
      abierto: false,
      venta: null,
      fecha: new Date().toISOString().slice(0, 10),
      metodos: [{ metodo_id: '', monto: '', moneda: '' }],
      saving: false,
      error: null,
    });
  }

  function updatePagoMetodo(index: number, patch: Partial<PagoMetodoDraft>) {
    setPagoModal((prev) => ({
      ...prev,
      metodos: prev.metodos.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  function addPagoMetodoRow() {
    setPagoModal((prev) => ({
      ...prev,
      metodos: [...prev.metodos, { metodo_id: '', monto: '', moneda: '' }],
    }));
  }

  function removePagoMetodoRow(index: number) {
    setPagoModal((prev) => ({
      ...prev,
      metodos:
        prev.metodos.length <= 1
          ? prev.metodos
          : prev.metodos.filter((_, i) => i !== index),
    }));
  }

  async function registrarPagoVenta() {
    if (!pagoModal.venta || pagoModal.saving) return;
    if (!metodosPago.length) {
      setPagoModal((prev) => ({
        ...prev,
        error: 'No hay metodos de pago configurados en el sistema.',
      }));
      return;
    }
    const venta = pagoModal.venta;
    const saldoPendiente = ventaSaldoPendiente(venta);
    const parsedRows = pagoModal.metodos.map((row) => {
      const metodoId = Number(row.metodo_id);
      const monto = Number(String(row.monto || '').replace(',', '.'));
      const metodo = metodosPago.find((m) => Number(m.id) === metodoId);
      return {
        metodo_id: metodoId,
        monto,
        moneda: String(row.moneda || metodo?.moneda || '').trim().toUpperCase(),
      };
    });
    const validRows = parsedRows.filter(
      (row) => Number.isInteger(row.metodo_id) && row.metodo_id > 0 && Number.isFinite(row.monto) && row.monto > 0
    );
    if (!validRows.length) {
      setPagoModal((prev) => ({ ...prev, error: 'Completa metodos y montos validos.' }));
      return;
    }
    const total = validRows.reduce((acc, row) => acc + row.monto, 0);
    if (total <= 0) {
      setPagoModal((prev) => ({ ...prev, error: 'El total del pago es invalido.' }));
      return;
    }
    if (total - saldoPendiente > 0.01) {
      setPagoModal((prev) => ({
        ...prev,
        error: `El pago excede el saldo pendiente ($${saldoPendiente.toFixed(2)}).`,
      }));
      return;
    }

    setPagoModal((prev) => ({ ...prev, saving: true, error: null }));
    try {
      await Api.crearPago({
        venta_id: venta.id,
        cliente_id: venta.cliente_id,
        monto: total,
        fecha: pagoModal.fecha || undefined,
        metodos: validRows.map((row) => ({
          metodo_id: row.metodo_id,
          monto: row.monto,
          moneda: row.moneda || undefined,
        })),
      });
      if (isMobile) {
        trackMobileEvent('venta_pago_registrado', {
          venta_id: venta.id,
          total,
          metodos: validRows.length,
        });
      }
      await loadAll();
      cerrarPagoModal();
    } catch (e: any) {
      setPagoModal((prev) => ({
        ...prev,
        saving: false,
        error: e?.message || 'No se pudo registrar el pago',
      }));
    }
  }

  useEffect(() => {
    if (!referidoCodigo.trim()) {
      setReferidoInfo(null);
      setReferidoError('');
    }
  }, [referidoCodigo]);

  async function validarReferido() {
    const code = referidoCodigo.trim();
    if (!code) {
      setReferidoError('Ingresa un codigo de referido');
      setReferidoInfo(null);
      return;
    }
    setReferidoLoading(true);
    setReferidoError('');
    try {
      const data = await Api.marketplaceValidarReferido({ codigo: code, total: subtotal });
      setReferidoInfo(data as ReferidoInfo);
    } catch (e: any) {
      setReferidoInfo(null);
      setReferidoError(e?.message || 'No se pudo validar el referido');
    } finally {
      setReferidoLoading(false);
    }
  }

  async function submitVenta() {
    setError('');
    try {
      if (!canCreateSale) {
        setError('Tu perfil solo tiene acceso a descargar remitos.');
        return;
      }
      if (!clienteId) {
        setError('Selecciona un cliente');
        return;
      }
      const cleanItems = items
        .map(it => ({
          producto_id: Number(it.producto_id),
          cantidad: Math.max(1, parseInt(it.cantidad || '0', 10) || 0),
          precio_unitario: Number(it.precio_unitario || 0),
        }))
        .filter(it => it.producto_id > 0 && it.cantidad > 0 && it.precio_unitario > 0);

      if (!cleanItems.length) {
        setError('Agrega al menos un producto con cantidad y precio vÃ¡lidos');
        return;
      }
      const body = {
        cliente_id: Number(clienteId),
        fecha: new Date(fecha).toISOString(),
        descuento: Number(descuento || 0),
        impuestos: Number(impuestos || 0),
        items: cleanItems,
        deposito_id: depositoId ? Number(depositoId) : undefined,
        es_reserva: Boolean(esReserva),
        referido_codigo: referidoCodigo.trim() || undefined,
        price_list_type: priceType,
      };

      await Api.crearVenta(body);
      if (isMobile) {
        trackMobileEvent('venta_creada', {
          cliente_id: Number(clienteId),
          items: cleanItems.length,
          subtotal: Number(subtotal.toFixed(2)),
          neto: Number(neto.toFixed(2)),
        });
      }
      // reset form
      setClienteId('');
      setFecha(new Date().toISOString().slice(0,16));
      setDescuento(0);
      setImpuestos(0);
      setItems([{ producto_id: '', cantidad: '1', precio_unitario: '' }]);
      setEsReserva(false);
      setReferidoCodigo('');
      setReferidoInfo(null);
      setReferidoError('');
      setOpen(false);
      await loadAll();
    } catch (e: any) {
      if (import.meta?.env?.DEV) {
        console.error('[Ventas] Error creando venta', e);
      }
      setError(e?.message || 'Error al crear la venta');
    }
  }

  async function ocultarVenta(venta: Venta) {
    if (!window.confirm(`Â¿Ocultar la venta #${venta.id} del listado principal?`)) return;
    try {
      await Api.ocultarVenta(venta.id);
      await loadAll();
    } catch (e: any) {
      alert(e?.message || 'No se pudo ocultar la venta');
    }
  }

  async function cancelarVenta(venta: Venta) {
    const entregada = (venta.estado_entrega || 'pendiente') === 'entregado';
    if (entregada) {
      alert('No se puede cancelar una venta ya entregada.');
      return;
    }
    const motivo = window.prompt('Motivo de cancelacion (opcional):', '');
    if (motivo === null) return;
    try {
      await Api.cancelarVenta(venta.id, motivo ? { motivo } : {});
      await loadAll();
    } catch (e: any) {
      alert(e?.message || 'No se pudo cancelar la venta');
    }
  }

  function canEntregarVenta(venta: Venta) {
    if (isFletero) return false;
    if ((venta.estado_entrega || 'pendiente') !== 'pendiente') return false;
    const caja = venta.caja_tipo || 'sucursal';
    if (caja === 'home_office') {
      return role === 'admin';
    }
    return true;
  }

  function abrirRemitoModal(venta: Venta) {
    setRemitoModal({
      abierto: true,
      venta,
      observaciones: '',
      loading: false,
      error: null,
    });
  }

  function cerrarRemitoModal() {
    setRemitoModal({
      abierto: false,
      venta: null,
      observaciones: '',
      loading: false,
      error: null,
    });
  }

  async function descargarRemitoPdf() {
    if (!remitoModal.venta || remitoModal.loading) return;
    setRemitoModal((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const blob = await Api.descargarRemito(remitoModal.venta.id, remitoModal.observaciones);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `remito-${remitoModal.venta.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      cerrarRemitoModal();
    } catch (e: any) {
      setRemitoModal((prev) => ({
        ...prev,
        loading: false,
        error: e?.message || 'No se pudo descargar el remito',
      }));
    }
  }

  async function loadFactura(ventaId: number) {
    setFacturaLoading(true);
    setFacturaError(null);
    try {
      const data: any = await Api.arcaFactura(ventaId);
      setFacturaInfo((data?.factura || null) as FacturaInfo | null);
      setFacturaSnapshot(data?.snapshot || null);
    } catch (e: any) {
      const msg = e?.message || 'No se pudo cargar la factura';
      setFacturaInfo(null);
      setFacturaSnapshot(null);
      if (String(msg).toLowerCase().includes('factura no encontrada')) {
        setFacturaError(null);
      } else {
        setFacturaError(msg);
      }
    } finally {
      setFacturaLoading(false);
    }
  }

  async function emitirFactura() {
    if (!detalleVenta.venta || emitLoading) return;
    setFacturaError(null);
    setEmitLoading(true);
    try {
      const conceptoNum = Number(emitForm.concepto || 1);
      const body: any = {
        venta_id: detalleVenta.venta.id,
        concepto: conceptoNum,
      };
      if (emitForm.punto_venta_id) body.punto_venta_id = Number(emitForm.punto_venta_id);
      if (canOverrideComprobante && emitForm.tipo_comprobante) {
        body.tipo_comprobante = emitForm.tipo_comprobante;
      }
      if (conceptoNum !== 1) {
        body.fecha_serv_desde = emitForm.fecha_serv_desde;
        body.fecha_serv_hasta = emitForm.fecha_serv_hasta;
        body.fecha_vto_pago = emitForm.fecha_vto_pago;
      }
      await Api.arcaEmitirFactura(body);
      await loadFactura(detalleVenta.venta.id);
    } catch (e: any) {
      setFacturaError(e?.message || 'No se pudo emitir la factura');
    } finally {
      setEmitLoading(false);
    }
  }

  async function descargarFacturaPdf() {
    if (!detalleVenta.venta) return;
    try {
      const blob = await Api.arcaFacturaPdf(detalleVenta.venta.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `factura-${detalleVenta.venta.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setFacturaError(e?.message || 'No se pudo descargar la factura');
    }
  }

  async function abrirDetalleVenta(venta: Venta) {
    setDetalleVenta({
      abierto: true,
      venta,
      items: [],
      loading: true,
      error: null,
    });
    setFacturaInfo(null);
    setFacturaSnapshot(null);
    setFacturaError(null);
    try {
      const rows = await Api.ventaDetalle(venta.id);
      setDetalleVenta((prev) => ({
        ...prev,
        items: (rows || []) as VentaDetalleItem[],
        loading: false,
      }));
      await loadFactura(venta.id);
    } catch (e: any) {
      setDetalleVenta((prev) => ({
        ...prev,
        loading: false,
        error: e?.message || 'No se pudo cargar el detalle de la venta',
      }));
    }
  }

  function cerrarDetalleVenta() {
    setDetalleVenta({
      abierto: false,
      venta: null,
      items: [],
      loading: false,
      error: null,
    });
    setFacturaInfo(null);
    setFacturaSnapshot(null);
    setFacturaError(null);
  }

  useEffect(() => {
    if (!detalleVenta.venta) return;
    const baseDate = new Date(detalleVenta.venta.fecha);
    const dateStr = Number.isNaN(baseDate.getTime())
      ? new Date().toISOString().slice(0, 10)
      : baseDate.toISOString().slice(0, 10);
    setEmitForm({
      punto_venta_id: '',
      tipo_comprobante: '',
      concepto: '1',
      fecha_serv_desde: dateStr,
      fecha_serv_hasta: dateStr,
      fecha_vto_pago: dateStr,
    });
  }, [detalleVenta.venta]);

  const abiertas = (ventas || []).filter(
    v =>
      !v.oculto &&
      v.estado_pago !== 'cancelado' &&
      (v.estado_entrega || 'pendiente') !== 'entregado',
  );
  const historial = (ventas || []).filter(
    v =>
      !v.oculto &&
      ((v.estado_entrega || 'pendiente') === 'entregado' || v.estado_pago === 'cancelado'),
  ).sort((a, b) => b.id - a.id);

  function actionClass(base: string, compact = false) {
    if (compact) return `touch-target px-3 py-1.5 rounded border text-xs ${base}`;
    return `px-2 py-1 rounded border text-xs ${base}`;
  }

  function renderOpenSaleActions(v: Venta, compact = false) {
    return (
      <>
        {!isFletero && (
          <button
            onClick={() => abrirDetalleVenta(v)}
            className={actionClass('bg-slate-500/20 border-slate-500/30 hover:bg-slate-500/30 text-slate-200', compact)}
          >
            Detalle
          </button>
        )}
        {!isFletero && canRegistrarPagoVenta(v) && (
          <button
            onClick={() => abrirPagoModal(v)}
            className={actionClass('bg-cyan-500/20 border-cyan-500/30 hover:bg-cyan-500/30 text-cyan-200', compact)}
          >
            Registrar pago
          </button>
        )}
        {!isFletero && canEntregarVenta(v) && (
          <button
            onClick={async () => {
              try {
                await Api.entregarVenta(v.id);
                await loadAll();
              } catch (e: any) {
                alert(e?.message || 'No se pudo marcar entregado');
              }
            }}
            className={actionClass('bg-emerald-500/20 border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-200', compact)}
          >
            Marcar entregado
          </button>
        )}
        {!isFletero && canEntregarVenta(v) && (
          <button
            onClick={() => cancelarVenta(v)}
            className={actionClass('bg-rose-500/20 border-rose-500/30 hover:bg-rose-500/30 text-rose-200', compact)}
          >
            Cancelar
          </button>
        )}
        <button
          onClick={() => abrirRemitoModal(v)}
          className={actionClass('bg-white/10 border-white/20 hover:bg-white/20 text-slate-200', compact)}
        >
          Remito PDF
        </button>
        {!isFletero && (v.estado_entrega || 'pendiente') === 'entregado' && (
          <button
            onClick={() => ocultarVenta(v)}
            className={actionClass('bg-slate-700/60 border-slate-500/60 hover:bg-slate-600/80 text-slate-100', compact)}
          >
            Ocultar
          </button>
        )}
      </>
    );
  }

  function renderHistorySaleActions(v: Venta, compact = false) {
    return (
      <>
        {!isFletero && (
          <button
            onClick={() => abrirDetalleVenta(v)}
            className={actionClass('bg-slate-500/20 border-slate-500/30 hover:bg-slate-500/30 text-slate-200', compact)}
          >
            Detalle
          </button>
        )}
        {!isFletero && canRegistrarPagoVenta(v) && (
          <button
            onClick={() => abrirPagoModal(v)}
            className={actionClass('bg-cyan-500/20 border-cyan-500/30 hover:bg-cyan-500/30 text-cyan-200', compact)}
          >
            Registrar pago
          </button>
        )}
        {v.estado_pago !== 'cancelado' && (
          <button
            onClick={() => abrirRemitoModal(v)}
            className={actionClass('bg-white/10 border-white/20 hover:bg-white/20 text-slate-200', compact)}
          >
            Remito PDF
          </button>
        )}
        {!isFletero && (
          <button
            onClick={() => ocultarVenta(v)}
            className={actionClass('bg-slate-700/60 border-slate-500/60 hover:bg-slate-600/80 text-slate-100', compact)}
          >
            Ocultar
          </button>
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <ChartCard title="Ventas" right={
        canCreateSale ? (
          <button onClick={() => setOpen(o => !o)} className="px-3 py-1.5 rounded bg-primary-500/20 border border-primary-500/30 hover:bg-primary-500/30 text-primary-200 text-sm">{open ? 'Cancelar' : 'Nueva venta'}</button>
        ) : null
      }>
        {open && canCreateSale && (
          <div className="mb-4 p-3 app-panel space-y-3">
            {error && <div className="text-rose-300 text-sm">{error}</div>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm">
                <div className="text-slate-400 mb-1">Cliente</div>
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : '')} className="w-full input-modern text-sm">
                  <option value="">Seleccionar</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.apellido ? ` ${c.apellido}` : ''}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <div className="text-slate-400 mb-1">Fecha</div>
                <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full input-modern text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <div className="text-slate-400 mb-1">Descuento</div>
                  <input type="number" step="0.01" value={descuento} onChange={(e) => setDescuento(Number(e.target.value))} className="w-full input-modern text-sm" />
                </label>
                <label className="text-sm">
                  <div className="text-slate-400 mb-1">Impuestos</div>
                  <input type="number" step="0.01" value={impuestos} onChange={(e) => setImpuestos(Number(e.target.value))} className="w-full input-modern text-sm" />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm">
                <div className="text-slate-400 mb-1">Deposito</div>
                <select
                  value={depositoId}
                  onChange={(e) => setDepositoId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full input-modern text-sm"
                >
                  <option value="">Seleccionar...</option>
                  {depositos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre} {d.codigo ? `(${d.codigo})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm flex items-center gap-2 mt-6">
                <input
                  type="checkbox"
                  className="rounded border-white/20"
                  checked={esReserva}
                  onChange={(e) => setEsReserva(e.target.checked)}
                />
                <span className="text-slate-300">
                  Reserva (permitir sin stock)
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm md:col-span-2">
                <div className="text-slate-400 mb-1">Codigo de referido</div>
                <div className="flex gap-2">
                  <input
                    value={referidoCodigo}
                    onChange={(e) => setReferidoCodigo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        validarReferido();
                      }
                    }}
                    className="w-full input-modern text-sm"
                    placeholder="Ej: REF-ABC123"
                  />
                  <button
                    type="button"
                    onClick={validarReferido}
                    className="px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20 text-xs text-slate-200"
                    disabled={referidoLoading}
                  >
                    {referidoLoading ? 'Validando...' : 'Validar'}
                  </button>
                </div>
                {referidoInfo && (
                  <div className="mt-1 text-xs text-emerald-200">
                    {referidoInfo.alianza_nombre || 'Alianza'} - descuento ${Number(referidoInfo.descuento_aplicado || 0).toFixed(2)}
                  </div>
                )}
                {referidoError && (
                  <div className="mt-1 text-xs text-rose-300">{referidoError}</div>
                )}
              </label>
            </div>

            <div className="mt-2 text-sm">
              <div className="flex items-center gap-4 text-slate-300">
                <label className="flex items-center gap-2">
                  <span className="text-slate-400">Tipo de Precio:</span>
                    <select
                      value={priceType}
                      onChange={(e) => setPriceType(e.target.value as 'local' | 'distribuidor' | 'final')}
                      className="bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                    >
                      <option value="local">{priceLabels.local}</option>
                      <option value="distribuidor">{priceLabels.distribuidor}</option>
                      <option value="final">{priceLabels.final}</option>
                    </select>
                  </label>
              </div>
            </div>

            {isMobile ? (
              <div className="space-y-3">
                {items.map((it, idx) => {
                  const prod = productosById.get(Number(it.producto_id));
                  const autoPrice = calculatePriceByType(prod);
                  const qty = Number(it.cantidad || 0);
                  const effectivePrice = Number(it.precio_unitario || 0);
                  return (
                    <article key={idx} className="app-panel p-3 space-y-2">
                      <div className="text-xs text-slate-400">Item #{idx + 1}</div>
                      <ProductPicker
                        options={productOptions}
                        value={it.producto_id === '' ? null : Number(it.producto_id)}
                        onChange={(id) => {
                          const newProdId = id == null ? '' : Number(id);
                          const newProd =
                            newProdId === '' ? undefined : productosById.get(Number(newProdId));
                          const newAutoPrice = calculatePriceByType(newProd);
                          updateItem(idx, {
                            producto_id: newProdId,
                            precio_unitario: newAutoPrice > 0 ? String(newAutoPrice) : '',
                          });
                        }}
                        placeholder="Seleccionar producto"
                        buttonClassName="h-11"
                        panelClassName="min-w-[320px]"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-xs">
                          <div className="text-slate-400 mb-1">Precio</div>
                          <input
                            type="number"
                            step="0.01"
                            placeholder={autoPrice > 0 ? autoPrice.toFixed(2) : 'Ingrese precio'}
                            value={it.precio_unitario}
                            onChange={(e) => updateItem(idx, { precio_unitario: e.target.value })}
                            className="w-full bg-white/10 border border-white/10 rounded px-2 py-1.5"
                          />
                        </label>
                        <label className="text-xs">
                          <div className="text-slate-400 mb-1">Cantidad</div>
                          <input
                            type="number"
                            min={1}
                            value={it.cantidad}
                            onChange={(e) => updateItem(idx, { cantidad: e.target.value })}
                            className="w-full bg-white/10 border border-white/10 rounded px-2 py-1.5"
                          />
                        </label>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-200">
                          Subtotal: ${Number(effectivePrice * qty).toFixed(2)}
                        </div>
                        <button
                          onClick={() => removeItemRow(idx)}
                          className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/30 hover:bg-rose-500/30 text-rose-200 text-xs"
                        >
                          Quitar
                        </button>
                      </div>
                    </article>
                  );
                })}
                <button
                  onClick={addItemRow}
                  className="touch-target w-full px-3 py-2 rounded bg-white/10 border border-white/10 hover:bg-white/15 text-slate-200 text-sm"
                >
                  + Agregar item
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-slate-400">
                    <tr>
                      <th className="py-2 px-2">Producto</th>
                      <th className="py-2 px-2">Precio</th>
                      <th className="py-2 px-2">Cantidad</th>
                      <th className="py-2 px-2">Subtotal</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {items.map((it, idx) => {
                      const prod = productosById.get(Number(it.producto_id));
                      const autoPrice = calculatePriceByType(prod);
                      const qty = Number(it.cantidad || 0);
                      const effectivePrice = Number(it.precio_unitario || 0);

                      return (
                        <tr key={idx} className="border-t border-white/10">
                          <td className="py-2 px-2">
                            <ProductPicker
                              options={productOptions}
                              value={it.producto_id === '' ? null : Number(it.producto_id)}
                              onChange={(id) => {
                                const newProdId = id == null ? '' : Number(id);
                                const newProd =
                                  newProdId === '' ? undefined : productosById.get(Number(newProdId));
                                const newAutoPrice = calculatePriceByType(newProd);
                                updateItem(idx, {
                                  producto_id: newProdId,
                                  precio_unitario: newAutoPrice > 0 ? String(newAutoPrice) : '',
                                });
                              }}
                              placeholder="Seleccionar producto"
                              className="min-w-[18rem]"
                              buttonClassName="h-10"
                              panelClassName="min-w-[420px]"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              step="0.01"
                              placeholder={autoPrice > 0 ? autoPrice.toFixed(2) : 'Ingrese precio'}
                              value={it.precio_unitario}
                              onChange={(e) => updateItem(idx, { precio_unitario: e.target.value })}
                              className="w-28 bg-white/10 border border-white/10 rounded px-2 py-1"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input type="number" min={1} value={it.cantidad} onChange={(e) => updateItem(idx, { cantidad: e.target.value })} className="w-20 bg-white/10 border border-white/10 rounded px-2 py-1" />
                          </td>
                          <td className="py-2 px-2">${(effectivePrice * qty).toFixed(2)}</td>
                          <td className="py-2 px-2">
                            <button onClick={() => removeItemRow(idx)} className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/30 hover:bg-rose-500/30 text-rose-200 text-xs">Quitar</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-2">
                  <button onClick={addItemRow} className="px-2 py-1 rounded bg-white/10 border border-white/10 hover:bg-white/15 text-slate-200 text-xs">+ Agregar item</button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-6 text-sm">
              <div className="text-slate-300">Subtotal: <span className="font-semibold text-slate-100">${subtotal.toFixed(2)}</span></div>
              {referidoDescuento > 0 && (
                <div className="text-slate-300">
                  Desc. referido: <span className="font-semibold text-slate-100">-${referidoDescuento.toFixed(2)}</span>
                </div>
              )}
              <div className="text-slate-300">Neto: <span className="font-semibold text-slate-100">${neto.toFixed(2)}</span></div>
              <button onClick={submitVenta} className="px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-200 text-sm">Crear venta</button>
            </div>
          </div>
        )}

        {isMobile ? (
          <div className="space-y-3">
            {(loading ? [] : abiertas).map((v) => (
              <article key={v.id} className="app-panel p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-100">Venta #{v.id}</div>
                  <span className="text-[11px] text-slate-400">{v.estado_entrega || 'pendiente'}</span>
                </div>
                <div className="text-xs text-slate-300">{v.cliente_nombre}</div>
                <div className="text-[11px] text-slate-400">{new Date(v.fecha).toLocaleString()}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="app-panel p-2">
                    <div className="text-slate-400">Total</div>
                    <div className="text-slate-100 font-medium">${Number(v.total || 0).toFixed(2)}</div>
                  </div>
                  <div className="app-panel p-2">
                    <div className="text-slate-400">Neto</div>
                    <div className="text-slate-100 font-medium">${Number(v.neto || 0).toFixed(2)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">{renderOpenSaleActions(v, true)}</div>
              </article>
            ))}
            {!loading && abiertas.length === 0 && (
              <div className="py-6 text-center text-slate-400 app-panel">Sin ventas</div>
            )}
          </div>
        ) : (
          <DataTable
            headers={
              <thead className="text-left text-slate-400">
                <tr>
                  <th className="py-2 px-2">ID</th>
                  <th className="py-2 px-2">Cliente</th>
                  <th className="py-2 px-2">Fecha</th>
                  <th className="py-2 px-2">Total</th>
                  <th className="py-2 px-2">Neto</th>
                  <th className="py-2 px-2">Reserva</th>
                  <th className="py-2 px-2">Entrega</th>
                  <th className="py-2 px-2">Acciones</th>
                </tr>
              </thead>
            }
          >
            <tbody className="text-slate-200">
              {(loading ? [] : abiertas).map((v) => (
                <tr key={v.id} className="border-t border-white/10 hover:bg-white/5">
                  <td className="py-2 px-2">{v.id}</td>
                  <td className="py-2 px-2">{v.cliente_nombre}</td>
                  <td className="py-2 px-2">{new Date(v.fecha).toLocaleString()}</td>
                  <td className="py-2 px-2">${Number(v.total || 0).toFixed(2)}</td>
                  <td className="py-2 px-2">${Number(v.neto || 0).toFixed(2)}</td>
                  <td className="py-2 px-2">
                    {v.es_reserva ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs border bg-amber-500/20 border-amber-500/40 text-amber-200">
                        Reserva
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-2 px-2">{v.estado_entrega || 'pendiente'}</td>
                  <td className="py-2 px-2 space-x-2">{renderOpenSaleActions(v)}</td>
                </tr>
              ))}
              {!loading && abiertas.length === 0 && (
                <tr><td className="py-3 px-2 text-slate-400" colSpan={8}>Sin ventas</td></tr>
              )}
            </tbody>
          </DataTable>
        )}
      </ChartCard>

      {/* Historial de ventas entregadas o canceladas */}
      <ChartCard title="Historial" right={null}>
        {isMobile ? (
          <div className="space-y-3">
            {(loading ? [] : historial).map((v) => (
              <article key={v.id} className="app-panel p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-100">Venta #{v.id}</div>
                  <span className="text-[11px] text-slate-400">{v.estado_pago}</span>
                </div>
                <div className="text-xs text-slate-300">{v.cliente_nombre}</div>
                <div className="text-[11px] text-slate-400">{new Date(v.fecha).toLocaleString()}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="app-panel p-2">
                    <div className="text-slate-400">Total</div>
                    <div className="text-slate-100 font-medium">${Number(v.total || 0).toFixed(2)}</div>
                  </div>
                  <div className="app-panel p-2">
                    <div className="text-slate-400">Neto</div>
                    <div className="text-slate-100 font-medium">${Number(v.neto || 0).toFixed(2)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">{renderHistorySaleActions(v, true)}</div>
              </article>
            ))}
            {!loading && historial.length === 0 && (
              <div className="py-6 text-center text-slate-400 app-panel">Sin historial</div>
            )}
          </div>
        ) : (
          <DataTable
            headers={
              <thead className="text-left text-slate-400">
                <tr>
                  <th className="py-2 px-2">ID</th>
                  <th className="py-2 px-2">Cliente</th>
                  <th className="py-2 px-2">Fecha</th>
                  <th className="py-2 px-2">Total</th>
                  <th className="py-2 px-2">Neto</th>
                  <th className="py-2 px-2">Reserva</th>
                  <th className="py-2 px-2">Entrega</th>
                  <th className="py-2 px-2">Acciones</th>
                </tr>
              </thead>
            }
          >
            <tbody className="text-slate-200">
              {(loading ? [] : historial).map((v) => (
                <tr key={v.id} className="border-t border-white/10 hover:bg-white/5">
                  <td className="py-2 px-2">{v.id}</td>
                  <td className="py-2 px-2">{v.cliente_nombre}</td>
                  <td className="py-2 px-2">{new Date(v.fecha).toLocaleString()}</td>
                  <td className="py-2 px-2">${Number(v.total || 0).toFixed(2)}</td>
                  <td className="py-2 px-2">${Number(v.neto || 0).toFixed(2)}</td>
                  <td className="py-2 px-2">
                    {v.es_reserva ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs border bg-amber-500/20 border-amber-500/40 text-amber-200">
                        Reserva
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-2 px-2">{v.estado_entrega || 'pendiente'}</td>
                  <td className="py-2 px-2 space-x-2">{renderHistorySaleActions(v)}</td>
                </tr>
              ))}
              {!loading && historial.length === 0 && (
                <tr><td className="py-3 px-2 text-slate-400" colSpan={8}>Sin historial</td></tr>
              )}
            </tbody>
          </DataTable>
        )}
      </ChartCard>

      {pagoModal.abierto && pagoModal.venta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4">
          <div className="app-card mobile-modal-card w-full max-w-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400">Registrar pago</div>
                <div className="text-base text-slate-100">
                  Venta #{pagoModal.venta.id} - {pagoModal.venta.cliente_nombre}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Saldo pendiente: ${ventaSaldoPendiente(pagoModal.venta).toFixed(2)}
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-xs"
                onClick={cerrarPagoModal}
                disabled={pagoModal.saving}
              >
                Cerrar
              </button>
            </div>

            {metodosPagoError && (
              <div className="text-xs text-rose-300">{metodosPagoError}</div>
            )}
            {pagoModal.error && (
              <div className="text-xs text-rose-300">{pagoModal.error}</div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Formas de pago</span>
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-white/10 border border-white/10 text-xs"
                  onClick={addPagoMetodoRow}
                  disabled={pagoModal.saving}
                >
                  Agregar metodo
                </button>
              </div>
              {metodosPagoLoading && (
                <div className="text-xs text-slate-400">Cargando metodos...</div>
              )}
              {!metodosPagoLoading && !metodosPago.length && (
                <div className="text-xs text-amber-200">
                  No hay metodos de pago configurados.
                </div>
              )}
              {pagoModal.metodos.map((row, index) => {
                const metodo = metodosPago.find((m) => String(m.id) === String(row.metodo_id));
                const moneda = row.moneda || metodo?.moneda || 'ARS';
                return (
                  <div
                    key={`pago-${index}`}
                    className="grid grid-cols-1 md:grid-cols-[1.4fr_0.8fr_auto] gap-2 items-center"
                  >
                    <select
                      className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                      value={row.metodo_id}
                      onChange={(e) => {
                        const value = e.target.value;
                        const metodoSel = metodosPago.find((m) => String(m.id) === value);
                        updatePagoMetodo(index, {
                          metodo_id: value,
                          moneda: metodoSel?.moneda || '',
                        });
                      }}
                      disabled={pagoModal.saving || metodosPagoLoading}
                    >
                      <option value="">Selecciona metodo</option>
                      {metodosPago.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                        value={row.monto}
                        onChange={(e) => updatePagoMetodo(index, { monto: e.target.value })}
                        disabled={pagoModal.saving}
                      />
                      <span className="text-[11px] text-slate-400 w-10 text-right">{moneda || 'ARS'}</span>
                    </div>
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs disabled:opacity-50"
                      onClick={() => removePagoMetodoRow(index)}
                      disabled={pagoModal.metodos.length <= 1 || pagoModal.saving}
                    >
                      Quitar
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
              <label className="block text-sm">
                <div className="text-slate-400 mb-1">Fecha</div>
                <input
                  type="date"
                  className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                  value={pagoModal.fecha}
                  onChange={(e) => setPagoModal((prev) => ({ ...prev, fecha: e.target.value }))}
                  disabled={pagoModal.saving}
                />
              </label>
              <div className="text-sm text-slate-300 md:text-right">
                Total a registrar: <span className="font-semibold text-slate-100">${totalPagoMetodos.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-white/10 border border-white/20 hover:bg-white/20 text-slate-200 text-xs"
                onClick={cerrarPagoModal}
                disabled={pagoModal.saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-cyan-500/20 border border-cyan-500/30 hover:bg-cyan-500/30 text-cyan-100 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={registrarPagoVenta}
                disabled={pagoModal.saving || !metodosPago.length || totalPagoMetodos <= 0}
              >
                {pagoModal.saving ? 'Registrando...' : 'Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detalleVenta.abierto && detalleVenta.venta && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-2 sm:p-4">
          <div className="app-card mobile-modal-card w-full max-w-4xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400">Detalle de venta</div>
                <div className="text-base text-slate-100">
                  Venta #{detalleVenta.venta.id} - {detalleVenta.venta.cliente_nombre}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Lista aplicada: {labelPrecioLista(detalleVenta.venta.price_list_type || 'local')}
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-xs"
                onClick={cerrarDetalleVenta}
                disabled={detalleVenta.loading}
              >
                Cerrar
              </button>
            </div>
            {detalleVenta.error && (
              <div className="text-xs text-rose-300">{detalleVenta.error}</div>
            )}
            {detalleVenta.loading ? (
              <div className="py-6 text-center text-slate-400">Cargando detalle...</div>
            ) : isMobile ? (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {detalleVenta.items.map((it) => (
                  <article key={it.id} className="app-panel p-3 text-xs space-y-2">
                    <div className="text-slate-100 font-medium">{it.producto_nombre}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-slate-400">Cantidad</div>
                        <div className="text-slate-100">{Number(it.cantidad || 0)}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Lista</div>
                        <div className="text-slate-100">{labelPrecioLista(it.lista_precio_codigo)}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-slate-400">Oferta</div>
                        <div className="text-slate-100">
                          {it.oferta_precio_id
                            ? `${it.oferta_nombre || `Oferta #${it.oferta_precio_id}`} (${Number(
                                it.descuento_oferta_pct || 0
                              ).toFixed(2)}%)`
                            : '-'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Precio</div>
                        <div className="text-slate-100">${Number(it.precio_unitario || 0).toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Subtotal bruto</div>
                        <div className="text-slate-100">${Number(it.subtotal || 0).toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Desc. oferta</div>
                        <div className="text-slate-100">${Number(it.descuento_oferta || 0).toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Subtotal neto</div>
                        <div className="text-slate-100">
                          $
                          {Number(
                            typeof it.subtotal_neto === 'number'
                              ? it.subtotal_neto
                              : Number(it.subtotal || 0) - Number(it.descuento_oferta || 0)
                          ).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
                {!detalleVenta.items.length && (
                  <div className="app-panel p-3 text-xs text-slate-400">Sin items registrados</div>
                )}
                <div className="app-panel p-3 text-xs grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-slate-400">Total bruto</div>
                    <div className="text-slate-100">${totalDetalle.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Desc. oferta</div>
                    <div className="text-slate-100">${totalDetalleDescuentoOferta.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Total neto</div>
                    <div className="text-slate-100">${totalDetalleNeto.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto text-xs md:text-sm max-h-[60vh]">
                <table className="min-w-full">
                  <thead className="text-left text-slate-400">
                    <tr>
                      <th className="py-1 pr-2">Producto</th>
                      <th className="py-1 pr-2">Cantidad</th>
                      <th className="py-1 pr-2">Lista</th>
                      <th className="py-1 pr-2">Oferta</th>
                      <th className="py-1 pr-2">Precio</th>
                      <th className="py-1 pr-2">Subtotal bruto</th>
                      <th className="py-1 pr-2">Desc. oferta</th>
                      <th className="py-1 pr-2">Subtotal neto</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {detalleVenta.items.map((it) => (
                      <tr key={it.id} className="border-t border-white/10 hover:bg-white/5">
                        <td className="py-1 pr-2">{it.producto_nombre}</td>
                        <td className="py-1 pr-2">{Number(it.cantidad || 0)}</td>
                        <td className="py-1 pr-2">{labelPrecioLista(it.lista_precio_codigo)}</td>
                        <td className="py-1 pr-2">
                          {it.oferta_precio_id
                            ? `${it.oferta_nombre || `Oferta #${it.oferta_precio_id}`} (${Number(
                                it.descuento_oferta_pct || 0
                              ).toFixed(2)}%)`
                            : '-'}
                        </td>
                        <td className="py-1 pr-2">${Number(it.precio_unitario || 0).toFixed(2)}</td>
                        <td className="py-1 pr-2">${Number(it.subtotal || 0).toFixed(2)}</td>
                        <td className="py-1 pr-2">${Number(it.descuento_oferta || 0).toFixed(2)}</td>
                        <td className="py-1 pr-2">
                          $
                          {Number(
                            typeof it.subtotal_neto === 'number'
                              ? it.subtotal_neto
                              : Number(it.subtotal || 0) - Number(it.descuento_oferta || 0)
                          ).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {!detalleVenta.items.length && (
                      <tr>
                        <td className="py-2 text-slate-400" colSpan={8}>
                          Sin items registrados
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/10">
                      <td className="py-2 pr-2 text-right text-slate-400" colSpan={5}>
                        Total bruto
                      </td>
                      <td className="py-2 pr-2 text-slate-200">${totalDetalle.toFixed(2)}</td>
                      <td className="py-2 pr-2 text-slate-200">${totalDetalleDescuentoOferta.toFixed(2)}</td>
                      <td className="py-2 pr-2 text-slate-200">${totalDetalleNeto.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="mt-4 p-3 app-panel space-y-3">
              <div className="text-sm font-semibold text-slate-200">Factura ARCA</div>
              {facturaLoading && <div className="text-xs text-slate-400">Cargando factura...</div>}
              {facturaError && <div className="text-xs text-rose-300">{facturaError}</div>}
              {!facturaLoading && !facturaInfo && (
                <div className="text-xs text-slate-400">Sin factura emitida.</div>
              )}
              {facturaInfo && (
                <div className="text-xs text-slate-200 space-y-1">
                  <div>Estado: <span className="text-slate-100">{facturaInfo.estado}</span></div>
                  <div>Numero: <span className="text-slate-100">{facturaInfo.numero_factura || '-'}</span></div>
                  <div>CAE: <span className="text-slate-100">{facturaInfo.cae || '-'}</span></div>
                  <div>Vto CAE: <span className="text-slate-100">{facturaInfo.cae_vto || '-'}</span></div>
                  {facturaInfo.error && (
                    <div className="text-rose-300">Error: {facturaInfo.error}</div>
                  )}
                </div>
              )}

              {facturaInfo?.estado === 'emitida' ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={descargarFacturaPdf}
                    className="px-3 py-1.5 rounded bg-white/10 border border-white/20 hover:bg-white/20 text-slate-200 text-xs"
                  >
                    Descargar factura PDF
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                    <label className="block">
                      <div className="text-slate-400 mb-1">Punto de venta</div>
                      <select
                        className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-slate-100"
                        value={emitForm.punto_venta_id}
                        onChange={(e) => setEmitForm((prev) => ({ ...prev, punto_venta_id: e.target.value }))}
                      >
                        <option value="">Auto (por deposito)</option>
                        {puntosVentaArca.map((pv) => (
                          <option key={pv.id} value={pv.id}>
                            {String(pv.punto_venta).padStart(4, '0')} {pv.nombre ? `- ${pv.nombre}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <div className="text-slate-400 mb-1">Concepto</div>
                      <select
                        className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-slate-100"
                        value={emitForm.concepto}
                        onChange={(e) => setEmitForm((prev) => ({ ...prev, concepto: e.target.value }))}
                      >
                        <option value="1">Productos</option>
                        <option value="2">Servicios</option>
                        <option value="3">Productos y servicios</option>
                      </select>
                    </label>
                    {canOverrideComprobante && (
                      <label className="block">
                        <div className="text-slate-400 mb-1">Tipo comprobante</div>
                        <select
                          className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-slate-100"
                          value={emitForm.tipo_comprobante}
                          onChange={(e) => setEmitForm((prev) => ({ ...prev, tipo_comprobante: e.target.value }))}
                        >
                          <option value="">Automatico</option>
                          <option value="A">Factura A</option>
                          <option value="B">Factura B</option>
                          <option value="C">Factura C</option>
                        </select>
                      </label>
                    )}
                  </div>

                  {emitForm.concepto !== '1' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                      <label className="block">
                        <div className="text-slate-400 mb-1">Servicio desde</div>
                        <input
                          type="date"
                          className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-slate-100"
                          value={emitForm.fecha_serv_desde}
                          onChange={(e) => setEmitForm((prev) => ({ ...prev, fecha_serv_desde: e.target.value }))}
                        />
                      </label>
                      <label className="block">
                        <div className="text-slate-400 mb-1">Servicio hasta</div>
                        <input
                          type="date"
                          className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-slate-100"
                          value={emitForm.fecha_serv_hasta}
                          onChange={(e) => setEmitForm((prev) => ({ ...prev, fecha_serv_hasta: e.target.value }))}
                        />
                      </label>
                      <label className="block">
                        <div className="text-slate-400 mb-1">Vto pago</div>
                        <input
                          type="date"
                          className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-slate-100"
                          value={emitForm.fecha_vto_pago}
                          onChange={(e) => setEmitForm((prev) => ({ ...prev, fecha_vto_pago: e.target.value }))}
                        />
                      </label>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={emitirFactura}
                    className="px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-200 text-xs"
                    disabled={emitLoading}
                  >
                    {emitLoading ? 'Emitiendo...' : facturaInfo?.estado === 'error' ? 'Reintentar emision' : 'Emitir factura'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {remitoModal.abierto && remitoModal.venta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4">
          <div className="app-card mobile-modal-card w-full max-w-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400">Remito de entrega</div>
                <div className="text-base text-slate-100">
                  Venta #{remitoModal.venta.id} - {remitoModal.venta.cliente_nombre}
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-xs"
                onClick={cerrarRemitoModal}
                disabled={remitoModal.loading}
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400">Observaciones (opcional)</label>
              <textarea
                className="input-modern w-full text-sm min-h-[100px]"
                placeholder="Ej: Pago mitad efectivo, mitad transferencia."
                value={remitoModal.observaciones}
                onChange={(e) =>
                  setRemitoModal((prev) => ({ ...prev, observaciones: e.target.value }))
                }
              />
            </div>

            {remitoModal.error && (
              <div className="text-xs text-rose-300">{remitoModal.error}</div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                className="input-modern text-sm"
                onClick={cerrarRemitoModal}
                disabled={remitoModal.loading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="h-9 rounded-lg bg-emerald-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={descargarRemitoPdf}
                disabled={remitoModal.loading}
              >
                {remitoModal.loading ? 'Generando...' : 'Descargar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
