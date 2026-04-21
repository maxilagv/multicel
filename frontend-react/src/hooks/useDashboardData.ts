import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import type {
  InsightItem,
  InsightsResponse,
  MovimientoFinanciero,
} from '../types/entities';

export type DashboardSummary = {
  deudas: number;
  clientesCount: number;
  stockItems: number;
  ops: Array<{
    fecha: string;
    tipo: string;
    detalle: string;
    monto: number;
  }>;
};

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: async () => {
      const [deudas, clientes, inventario, ventas, compras] = await Promise.all([
        Api.deudas(),
        Api.clientes({ estado: 'activo' }),
        Api.inventario(),
        Api.ventas({ limit: 50 }),
        Api.compras({ limit: 50 }),
      ]);

      const ops = [
        ...(ventas || [])
          .filter((venta: any) => !venta.oculto)
          .map((venta: any) => ({
            fecha: venta.fecha,
            tipo: 'Venta',
            detalle: venta.cliente_nombre
              ? `Venta a ${venta.cliente_nombre}`
              : `Venta #${venta.id}`,
            monto: Number(venta.neto ?? venta.total ?? 0),
          })),
        ...(compras || []).map((compra: any) => ({
          fecha: compra.fecha,
          tipo: 'Compra',
          detalle: compra.proveedor_nombre
            ? `Compra a ${compra.proveedor_nombre}`
            : `Compra #${compra.id}`,
          monto: Number(compra.total_costo ?? 0),
        })),
      ]
        .sort(
          (a, b) =>
            new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
        )
        .slice(0, 10);

      return {
        deudas: (deudas || []).reduce(
          (acc: number, row: any) => acc + Number(row.deuda_pendiente || 0),
          0
        ),
        clientesCount: Array.isArray(clientes) ? clientes.length : 0,
        stockItems: (inventario || []).reduce(
          (acc: number, row: any) => acc + Number(row.cantidad_disponible || 0),
          0
        ),
        ops,
      };
    },
    staleTime: 30_000,
  });
}

export function useDashboardInsights(aiEnabled: boolean) {
  return useQuery<InsightsResponse | null>({
    queryKey: queryKeys.dashboard.insights({ days: 14, history: 90, limit: 9 }),
    queryFn: async () => (await Api.aiInsights({ days: 14, history: 90, limit: 9 })) as InsightsResponse,
    enabled: aiEnabled,
    staleTime: 30_000,
  });
}

export function useDashboardMovimientos(range: { desde: string; hasta: string } | null) {
  return useQuery<MovimientoFinanciero[]>({
    queryKey: queryKeys.dashboard.movimientos(range || { empty: true }),
    queryFn: async () => {
      if (!range) return [];
      const data = await Api.movimientosFinancieros({
        ...range,
        agregado: 'dia',
      });
      return (data || []).map((row: any) => ({
        fecha: row.fecha,
        totalVentas: Number(row.totalVentas || 0),
        totalGastos: Number(row.totalGastos || 0),
        gananciaNeta: Number(row.gananciaNeta || 0),
      }));
    },
    enabled: Boolean(range),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export type DashboardInsightItem = InsightItem;
