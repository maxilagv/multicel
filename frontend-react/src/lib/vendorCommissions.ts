import * as XLSX from 'xlsx';

export type Periodo = 'dia' | 'semana' | 'mes';
export type CommissionMode = 'por_lista' | 'por_producto' | 'por_total_venta';

export type CommissionListRow = {
  lista_codigo: string;
  lista_nombre: string;
  porcentaje: number;
  activo?: boolean;
  source?: string;
};

export type VendorCommissionConfig = {
  usuario_id: number;
  vendedor?: { id: number; nombre?: string; email?: string; activo?: boolean };
  sueldo_fijo: number;
  comision_tipo: CommissionMode;
  periodo_liquidacion: Periodo;
  comision_fija?: {
    porcentaje: number;
    base_tipo: 'bruto' | 'neto';
    vigencia_desde?: string | null;
    vigencia_hasta?: string | null;
    activo?: boolean;
  };
  comision_listas?: {
    usa_configuracion_global: boolean;
    global: CommissionListRow[];
    overrides: CommissionListRow[];
    listas: CommissionListRow[];
    porcentajes?: Record<string, number>;
  };
  productos?: {
    total: number;
    con_comision: number;
    sin_comision: number;
  };
};

export type VendorLiquidacion = {
  vendedor: { id: number; nombre?: string | null; email?: string | null; activo?: boolean };
  periodo: { periodo: Periodo; desde: string; hasta: string };
  configuracion: {
    usuario_id: number;
    sueldo_fijo: number;
    comision_tipo: CommissionMode;
    periodo_liquidacion: Periodo;
    porcentaje_fijo: number;
    base_tipo: 'bruto' | 'neto';
    usa_configuracion_global: boolean;
    listas_globales: CommissionListRow[];
    listas_vendedor: CommissionListRow[];
    listas_efectivas: CommissionListRow[];
  };
  resumen: {
    ventas_count: number;
    ventas_total: number;
    ventas_base_comision_total: number;
    comision_monto: number;
    sueldo_fijo: number;
    pagado_total: number;
    adelantos_total: number;
    total_devengado: number;
    saldo: number;
    modo_activo: CommissionMode;
    modos_presentes: string[];
    mixed_modes: boolean;
  };
  ventas: Array<{
    id: number;
    fecha?: string | null;
    fecha_venta?: string | null;
    fecha_entrega?: string | null;
    cliente?: string | null;
    total: number;
    neto: number;
    estado_pago?: string | null;
    estado_entrega?: string | null;
    listas: string[];
    productos: number;
    comision_total: number;
  }>;
  breakdown: {
    active_mode: CommissionMode;
    mixed_modes: boolean;
    modes_presentes: string[];
    por_lista: {
      items: Array<{
        lista_codigo: string;
        lista_nombre: string;
        total_vendido: number;
        comision_pct: number | null;
        comision_monto: number;
        ventas_count: number;
      }>;
      total_vendido: number;
      total_comision: number;
    };
    por_producto: {
      items: Array<{
        producto_id: number;
        producto_nombre: string;
        cantidad: number;
        total_vendido: number;
        comision_pct: number | null;
        comision_monto: number;
      }>;
      total_vendido: number;
      total_comision: number;
    };
    por_total_venta: {
      porcentaje: number;
      base_tipo: 'bruto' | 'neto';
      total_base: number;
      total_comision: number;
    };
  };
  pagos_periodo: Array<{
    id: number;
    periodo: Periodo;
    desde: string;
    hasta: string;
    monto_calculado: number;
    monto_pagado: number;
    fecha_pago?: string | null;
    metodo?: string | null;
    notas?: string | null;
  }>;
  adelantos_periodo: Array<{
    id: number;
    monto: number;
    fecha?: string | null;
    notas?: string | null;
    creado_en?: string | null;
  }>;
  historial_pagos?: Array<any>;
};

export function formatMoney(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-AR');
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-AR');
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function humanizePeriodo(periodo: Periodo) {
  if (periodo === 'dia') return 'Diario';
  if (periodo === 'semana') return 'Semanal';
  return 'Mensual';
}

export function humanizeMode(mode: string) {
  if (mode === 'por_lista') return 'Por Lista de Precios';
  if (mode === 'por_total_venta') return 'Porcentaje Fijo sobre Total';
  return 'Por Producto Individual';
}

export function humanizeBaseType(value: string) {
  return value === 'neto' ? 'Sobre precio sin IVA (neto)' : 'Sobre precio de venta (bruto)';
}

export function buildDateRangeForPeriodo(periodo: Periodo) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = new Date(end.getTime());

  if (periodo === 'dia') {
    start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  } else if (periodo === 'semana') {
    const day = end.getDay();
    const daysSinceMonday = (day + 6) % 7;
    start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - daysSinceMonday);
  } else {
    start = new Date(end.getFullYear(), end.getMonth(), 1);
  }

  return {
    desde: start.toISOString().slice(0, 10),
    hasta: end.toISOString().slice(0, 10),
  };
}

export function exportPayrollWorkbook(
  items: Array<{
    nombre: string;
    periodo?: string;
    ventas_total: number;
    comision_monto: number;
    sueldo_fijo: number;
    adelantos_total: number;
    saldo: number;
  }>,
  meta: { periodoLabel: string; desde: string; hasta: string }
) {
  const workbook = XLSX.utils.book_new();
  const summaryRows = items.map((item) => ({
    Vendedor: item.nombre,
    Periodo: meta.periodoLabel,
    'Total Ventas': item.ventas_total,
    Comisión: item.comision_monto,
    'Sueldo Fijo': item.sueldo_fijo,
    Adelantos: item.adelantos_total,
    'Saldo a Pagar': item.saldo,
  }));

  summaryRows.push({
    Vendedor: 'TOTAL',
    Periodo: '',
    'Total Ventas': items.reduce((acc, item) => acc + Number(item.ventas_total || 0), 0),
    Comisión: items.reduce((acc, item) => acc + Number(item.comision_monto || 0), 0),
    'Sueldo Fijo': items.reduce((acc, item) => acc + Number(item.sueldo_fijo || 0), 0),
    Adelantos: items.reduce((acc, item) => acc + Number(item.adelantos_total || 0), 0),
    'Saldo a Pagar': items.reduce((acc, item) => acc + Number(item.saldo || 0), 0),
  });

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Resumen Nomina');
  XLSX.writeFile(workbook, `sueldos-${meta.desde}_al_${meta.hasta}.xlsx`);
}

export function exportVendorLiquidacionWorkbook(liquidacion: VendorLiquidacion) {
  const workbook = XLSX.utils.book_new();
  const ventasSheet = liquidacion.ventas.map((venta) => ({
    Fecha: formatDate(venta.fecha || venta.fecha_venta || venta.fecha_entrega),
    Venta: `#${venta.id}`,
    Cliente: venta.cliente || '-',
    Lista: (venta.listas || []).join(', '),
    Total: venta.total,
    Comisión: venta.comision_total,
  }));

  const resumenSheet = [
    { Concepto: 'Ventas del período', Monto: liquidacion.resumen.ventas_total },
    { Concepto: 'Comisión', Monto: liquidacion.resumen.comision_monto },
    { Concepto: 'Sueldo fijo', Monto: liquidacion.resumen.sueldo_fijo },
    { Concepto: 'Adelantos', Monto: -Math.abs(liquidacion.resumen.adelantos_total) },
    { Concepto: 'Pagos registrados', Monto: -Math.abs(liquidacion.resumen.pagado_total) },
    { Concepto: 'Saldo a pagar', Monto: liquidacion.resumen.saldo },
  ];

  const breakdownSheet =
    liquidacion.breakdown.active_mode === 'por_lista'
      ? liquidacion.breakdown.por_lista.items.map((item) => ({
          Lista: item.lista_nombre,
          'Total Vendido': item.total_vendido,
          '% Comisión': item.comision_pct ?? '',
          'Comisión $': item.comision_monto,
        }))
      : liquidacion.breakdown.active_mode === 'por_producto'
      ? liquidacion.breakdown.por_producto.items.map((item) => ({
          Producto: item.producto_nombre,
          Cantidad: item.cantidad,
          'Total Vendido': item.total_vendido,
          '% Comisión': item.comision_pct ?? '',
          'Comisión $': item.comision_monto,
        }))
      : [
          {
            'Base de cálculo': liquidacion.breakdown.por_total_venta.total_base,
            '% Comisión': liquidacion.breakdown.por_total_venta.porcentaje,
            'Tipo base': liquidacion.breakdown.por_total_venta.base_tipo,
            'Comisión $': liquidacion.breakdown.por_total_venta.total_comision,
          },
        ];

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(resumenSheet), 'Resumen');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(ventasSheet), 'Ventas');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(breakdownSheet), 'Calculo');
  XLSX.writeFile(
    workbook,
    `liquidacion-${liquidacion.vendedor.nombre || liquidacion.vendedor.id}-${liquidacion.periodo.desde}_al_${liquidacion.periodo.hasta}.xlsx`
  );
}
