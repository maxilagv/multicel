import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

export type ComprasParams = {
  limit?: number;
  offset?: number;
};

export function useComprasList<T = Record<string, unknown>>(params: ComprasParams = {}, enabled = true) {
  return useQuery<T[]>({
    queryKey: queryKeys.compras.list(params),
    queryFn: async () => (await Api.compras(params)) as T[],
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCompraDetalle<T = Record<string, unknown>>(id: number | null, enabled = true) {
  return useQuery<T[]>({
    queryKey: id ? queryKeys.compras.detail(id) : [...queryKeys.compras.all(), 'detail', 'empty'],
    queryFn: async () => {
      if (!id) return [];
      return (await Api.compraDetalle(id)) as T[];
    },
    staleTime: 30_000,
    enabled: enabled && Boolean(id),
  });
}
