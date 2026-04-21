import { useMemo } from 'react';
import type { Venta } from '../types/entities';
import { useVentasList } from './useVentasList';

interface UseVentasOptions {
  autoLoad?: boolean;
  clienteId?: number;
  limit?: number;
  view?: 'mobile' | 'full';
}

interface UseVentasResult {
  ventas: Venta[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<unknown>;
}

export function useVentas({
  autoLoad = true,
  clienteId,
  limit,
  view,
}: UseVentasOptions = {}): UseVentasResult {
  const query = useVentasList(
    {
      ...(clienteId !== undefined ? { cliente_id: clienteId } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(view !== undefined ? { view } : {}),
    },
    autoLoad
  );

  return useMemo(
    () => ({
      ventas: query.data || [],
      loading: query.isLoading || query.isFetching,
      error: query.error instanceof Error ? query.error.message : null,
      reload: query.refetch,
    }),
    [query.data, query.error, query.isFetching, query.isLoading, query.refetch]
  );
}
