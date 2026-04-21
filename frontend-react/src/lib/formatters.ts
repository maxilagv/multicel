/**
 * Formateadores centralizados.
 * Usar siempre estas funciones en lugar de toFixed() directo.
 * Garantizan el formato argentino estándar: $1.000.000,50
 */

const _ars = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const _arsCompact = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** $1.000.000,50 */
export function formatARS(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? _ars.format(n) : '$0,00';
}

/** $1.000.000 (sin decimales, para métricas grandes) */
export function formatARSCompact(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? _arsCompact.format(n) : '$0';
}

/** 02/03/2026 */
export function formatFecha(
  value: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('es-AR', opts ?? { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** 02/03/2026 14:30 */
export function formatFechaHora(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 35,0% */
export function formatPorcentaje(value: number | null | undefined, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(decimals)}%`;
}
