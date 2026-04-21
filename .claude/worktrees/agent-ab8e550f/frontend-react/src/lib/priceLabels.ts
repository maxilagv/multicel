import { useEffect, useState } from 'react';
import { Api } from './api';

export type PriceLabels = {
  local: string;
  distribuidor: string;
  final: string;
};

export const DEFAULT_PRICE_LABELS: PriceLabels = {
  local: 'Precio Distribuidor',
  distribuidor: 'Precio Mayorista',
  final: 'Precio Final',
};

export function usePriceLabels() {
  const [labels, setLabels] = useState<PriceLabels>(DEFAULT_PRICE_LABELS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await Api.getPriceLabels();
        if (!active) return;
        setLabels({
          local: data?.local || DEFAULT_PRICE_LABELS.local,
          distribuidor: data?.distribuidor || DEFAULT_PRICE_LABELS.distribuidor,
          final: data?.final || DEFAULT_PRICE_LABELS.final,
        });
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'No se pudieron cargar los nombres de precios');
        setLabels(DEFAULT_PRICE_LABELS);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return { labels, loading, error };
}
