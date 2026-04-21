import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

export type ProductosParams = {
  q?: string;
  category_id?: number;
  include_descendants?: boolean;
  limit?: number;
  offset?: number;
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  paginated?: boolean;
  all?: boolean;
};

export type ProductosPaginatedResponse<T = Record<string, unknown>> = {
  data: T[];
  total?: number;
  page?: number;
  totalPages?: number;
};

export function useProductosList<T = Record<string, unknown>>(params: ProductosParams = {}, enabled = true) {
  return useQuery<T[] | ProductosPaginatedResponse<T>>({
    queryKey: queryKeys.productos.list(params),
    queryFn: async () => (await Api.productos(params)) as T[] | ProductosPaginatedResponse<T>,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useProductosTrash<T = Record<string, unknown>>(params: { limit?: number; offset?: number } = {}, enabled = true) {
  return useQuery<T[]>({
    queryKey: queryKeys.productos.trash(params),
    queryFn: async () => (await Api.productosPapelera(params)) as T[],
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}
