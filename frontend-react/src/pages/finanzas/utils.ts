import type { PeriodKey } from './types';

export type PieDatum = { name: string; value: number };

export function toLocalDateString(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computeRange(period: PeriodKey, desde: string, hasta: string): { desde: string; hasta: string } | null {
  const now = new Date();
  const todayStr = toLocalDateString(now);

  if (period === '24h') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return { desde: toLocalDateString(d), hasta: todayStr };
  }
  if (period === '7d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { desde: toLocalDateString(d), hasta: todayStr };
  }
  if (period === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return { desde: toLocalDateString(d), hasta: todayStr };
  }
  if (!desde || !hasta) return null;
  return { desde, hasta };
}

export function buildPieData<T>(
  items: T[],
  limit: number,
  getValue: (item: T) => number,
  getLabel: (item: T) => string
): PieDatum[] {
  const normalized = items
    .map((item) => ({
      name: getLabel(item),
      value: Number(getValue(item) || 0),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  if (!normalized.length || limit <= 0) return [];

  const top = normalized.slice(0, limit);
  const resto = normalized.slice(limit);
  const restoTotal = resto.reduce((acc, item) => acc + item.value, 0);

  if (restoTotal > 0) {
    top.push({ name: 'Otros', value: restoTotal });
  }

  return top;
}

export function buildBudgetPie(presupuesto: number, real: number): PieDatum[] {
  if (presupuesto <= 0) return [];
  const realCap = Math.min(real, presupuesto);
  const restante = Math.max(presupuesto - real, 0);
  return [
    { name: 'Real', value: realCap },
    { name: 'Restante', value: restante },
  ];
}

export function normalizePresupuestoTipo(tipo: string): 'ventas' | 'gastos' {
  const raw = (tipo || '').toLowerCase();
  if (['venta', 'ventas', 'ingreso', 'ingresos'].includes(raw)) return 'ventas';
  if (['gasto', 'gastos', 'egreso', 'egresos'].includes(raw)) return 'gastos';
  return 'gastos';
}

export function ownerSeverityLabel(severity?: string) {
  if (severity === 'critical') return 'Critica';
  if (severity === 'warn') return 'Media';
  return 'Baja';
}

export function ownerSeverityClass(severity?: string) {
  if (severity === 'critical') return 'bg-rose-500/20 border-rose-500/40 text-rose-200';
  if (severity === 'warn') return 'bg-amber-500/20 border-amber-500/40 text-amber-200';
  return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200';
}

export function riskBucketLabel(bucket?: string) {
  if (bucket === 'critical') return 'Critico';
  if (bucket === 'high') return 'Alto';
  if (bucket === 'medium') return 'Medio';
  return 'Bajo';
}

export function riskBucketClass(bucket?: string) {
  if (bucket === 'critical') return 'bg-rose-500/20 border-rose-500/40 text-rose-200';
  if (bucket === 'high') return 'bg-orange-500/20 border-orange-500/40 text-orange-200';
  if (bucket === 'medium') return 'bg-amber-500/20 border-amber-500/40 text-amber-200';
  return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200';
}

export function marginClass(margenPct: number) {
  if (margenPct >= 25) return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200';
  if (margenPct >= 10) return 'bg-amber-500/20 border-amber-500/40 text-amber-200';
  return 'bg-rose-500/20 border-rose-500/40 text-rose-200';
}
