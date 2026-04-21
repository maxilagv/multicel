import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type { Cliente } from '../../types/entities';

export type ClientesParams = {
  q?: string;
  estado?: 'activo' | 'inactivo' | 'todos';
  limit?: number;
  offset?: number;
  all?: boolean;
  view?: 'mobile' | 'full';
};

export function useClientesList(params: ClientesParams = {}, enabled = true) {
  return useQuery<Cliente[]>({
    queryKey: queryKeys.clientes.list(params),
    queryFn: async () => (await Api.clientes(params)) as Cliente[],
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useClientesTrash(params: { limit?: number; offset?: number; view?: 'mobile' | 'full' } = {}, enabled = true) {
  return useQuery<Cliente[]>({
    queryKey: queryKeys.clientes.trash(params),
    queryFn: async () => (await Api.clientesPapelera(params)) as Cliente[],
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}
