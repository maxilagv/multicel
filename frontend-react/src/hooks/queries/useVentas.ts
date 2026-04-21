import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type { Venta } from '../../types/entities';

export type VentasParams = {
  cliente_id?: number;
  limit?: number;
  offset?: number;
  view?: 'mobile' | 'full';
};

export function useVentasList(params: VentasParams = {}, enabled = true) {
  return useQuery<Venta[]>({
    queryKey: queryKeys.ventas.list(params),
    queryFn: async () => (await Api.ventas(params)) as Venta[],
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCrearVenta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => Api.crearVenta(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ventas.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.finanzas.all() });
    },
  });
}
