import type { RiesgoMora, RecordatorioCobranza } from './types';

export function riesgoLabel(bucket: RiesgoMora['bucket']) {
  if (bucket === 'critical') return 'Critica';
  if (bucket === 'high') return 'Alta';
  if (bucket === 'medium') return 'Media';
  return 'Baja';
}

export function riesgoClass(bucket: RiesgoMora['bucket']) {
  if (bucket === 'critical') return 'bg-rose-500/20 border-rose-500/40 text-rose-200';
  if (bucket === 'high') return 'bg-orange-500/20 border-orange-500/40 text-orange-200';
  if (bucket === 'medium') return 'bg-amber-500/20 border-amber-500/40 text-amber-200';
  return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200';
}

export function recordatorioStatusLabel(status: RecordatorioCobranza['status']) {
  if (status === 'sent') return 'Enviado';
  if (status === 'failed') return 'Fallido';
  if (status === 'cancelled') return 'Cancelado';
  return 'Pendiente';
}

export function parseMonto(value: string) {
  const num = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(num) ? num : 0;
}
