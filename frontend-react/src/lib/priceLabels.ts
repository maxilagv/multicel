/**
 * priceLabels.ts
 *
 * Hook de compatibilidad que expone las etiquetas de precio
 * leyendo del PriceConfigContext (carga única al inicio de sesión).
 * No realiza peticiones HTTP propias.
 */
import { usePriceConfig, DEFAULT_PRICE_TIERS } from '../context/PriceConfigContext';

export type PriceLabels = {
  local: string;
  distribuidor: string;
  final: string;
  local_enabled: boolean;
  distribuidor_enabled: boolean;
};

export const DEFAULT_PRICE_LABELS: PriceLabels = {
  local: DEFAULT_PRICE_TIERS[0].label,
  distribuidor: DEFAULT_PRICE_TIERS[1].label,
  final: DEFAULT_PRICE_TIERS[2].label,
  local_enabled: true,
  distribuidor_enabled: true,
};

/**
 * Devuelve las etiquetas de precio configuradas por el tenant.
 * Lee del contexto global — sin fetch propio.
 */
export function usePriceLabels() {
  const { tiers, loading } = usePriceConfig();

  const labels: PriceLabels = {
    local:               tiers.find((t) => t.key === 'local')?.label        ?? DEFAULT_PRICE_LABELS.local,
    distribuidor:        tiers.find((t) => t.key === 'distribuidor')?.label ?? DEFAULT_PRICE_LABELS.distribuidor,
    final:               tiers.find((t) => t.key === 'final')?.label        ?? DEFAULT_PRICE_LABELS.final,
    local_enabled:       tiers.find((t) => t.key === 'local')?.enabled      ?? true,
    distribuidor_enabled: tiers.find((t) => t.key === 'distribuidor')?.enabled ?? true,
  };

  return { labels, loading, error: null };
}
