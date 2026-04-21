export const queryKeys = {
  ventas: {
    all: () => ['ventas'] as const,
    list: (params: Record<string, unknown> = {}) => ['ventas', 'list', params] as const,
    detail: (id: number) => ['ventas', 'detail', id] as const,
  },
  clientes: {
    all: () => ['clientes'] as const,
    list: (params: Record<string, unknown> = {}) => ['clientes', 'list', params] as const,
    detail: (id: number) => ['clientes', 'detail', id] as const,
    trash: (params: Record<string, unknown> = {}) => ['clientes', 'trash', params] as const,
  },
  productos: {
    all: () => ['productos'] as const,
    list: (params: Record<string, unknown> = {}) => ['productos', 'list', params] as const,
    detail: (id: number) => ['productos', 'detail', id] as const,
    trash: (params: Record<string, unknown> = {}) => ['productos', 'trash', params] as const,
  },
  compras: {
    all: () => ['compras'] as const,
    list: (params: Record<string, unknown> = {}) => ['compras', 'list', params] as const,
    detail: (id: number) => ['compras', 'detail', id] as const,
  },
  dashboard: {
    all: () => ['dashboard'] as const,
    summary: () => ['dashboard', 'summary'] as const,
    insights: (params: Record<string, unknown>) => ['dashboard', 'insights', params] as const,
    movimientos: (params: Record<string, unknown>) => ['dashboard', 'movimientos', params] as const,
  },
  finanzas: {
    all: () => ['finanzas'] as const,
    overview: (params: Record<string, unknown>) => ['finanzas', 'overview', params] as const,
  },
  arca: {
    config: () => ['arca', 'config'] as const,
    puntosVenta: () => ['arca', 'puntos-venta'] as const,
    depositos: () => ['arca', 'depositos'] as const,
    libroIva: (params: Record<string, unknown>) => ['arca', 'libro-iva', params] as const,
  },
  imports: {
    job: (id: string) => ['imports', 'job', id] as const,
  },
};
