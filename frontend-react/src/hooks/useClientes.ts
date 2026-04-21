import { useMemo } from 'react';
import type { Cliente } from '../types/entities';
import { useClientesList } from './useClientesList';

interface UseClientesOptions {
  autoLoad?: boolean;
  estado?: 'activo' | 'inactivo';
  q?: string;
  all?: boolean;
  view?: 'mobile' | 'full';
}

interface UseClientesResult {
  clientes: Cliente[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<unknown>;
}

export function useClientes({
  autoLoad = true,
  estado,
  q,
  all,
  view,
}: UseClientesOptions = {}): UseClientesResult {
  const query = useClientesList(
    {
      ...(estado !== undefined ? { estado } : {}),
      ...(q !== undefined ? { q } : {}),
      ...(all !== undefined ? { all } : {}),
      ...(view !== undefined ? { view } : {}),
    },
    autoLoad
  );

  return useMemo(
    () => ({
      clientes: query.data || [],
      loading: query.isLoading || query.isFetching,
      error: query.error instanceof Error ? query.error.message : null,
      reload: query.refetch,
    }),
    [query.data, query.error, query.isFetching, query.isLoading, query.refetch]
  );
}
