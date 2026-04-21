import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type { MovimientoFinanciero } from '../../types/entities';

export type FinanzasRange = {
  desde: string;
  hasta: string;
};

export function useFinanzasOverview(range: FinanzasRange | null, enabled = true) {
  return useQuery<MovimientoFinanciero[]>({
    queryKey: queryKeys.finanzas.overview(range || { empty: true }),
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
        margenTotal: Number(row.margenTotal || 0),
      }));
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled: enabled && Boolean(range),
  });
}
