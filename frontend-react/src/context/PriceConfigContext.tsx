import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { Api } from '../lib/api';

export type PriceTierKey = 'local' | 'distribuidor' | 'final';

export type PriceTier = {
  key: PriceTierKey;
  label: string;
  enabled: boolean;
};

export type PriceListConfig = {
  id: number;
  key: string;
  slug: string;
  legacy_code?: string | null;
  nombre: string;
  label: string;
  descripcion?: string | null;
  margen_ratio?: number;
  enabled: boolean;
  activo: boolean;
  orden_visual?: number;
  is_system?: boolean;
  can_disable?: boolean;
};

export const DEFAULT_PRICE_TIERS: PriceTier[] = [
  { key: 'local', label: 'Precio Local', enabled: true },
  { key: 'distribuidor', label: 'Precio Distribuidor', enabled: true },
  { key: 'final', label: 'Precio Final', enabled: true },
];

const DEFAULT_PRICE_LISTS: PriceListConfig[] = DEFAULT_PRICE_TIERS.map((tier, index) => ({
  id: index + 1,
  key: tier.key,
  slug: tier.key,
  legacy_code: tier.key,
  nombre: tier.label,
  label: tier.label,
  descripcion: null,
  margen_ratio: tier.key === 'distribuidor' ? 0.45 : 0.15,
  enabled: tier.enabled,
  activo: tier.enabled,
  orden_visual: (index + 1) * 10,
  is_system: true,
  can_disable: tier.key !== 'final',
}));

type PriceConfigContextType = {
  tiers: PriceTier[];
  lists: PriceListConfig[];
  getLabel: (key: PriceTierKey | string) => string;
  isEnabled: (key: PriceTierKey | string) => boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const PriceConfigContext = createContext<PriceConfigContextType>({
  tiers: DEFAULT_PRICE_TIERS,
  lists: DEFAULT_PRICE_LISTS,
  getLabel: (key) => DEFAULT_PRICE_TIERS.find((t) => t.key === key)?.label ?? key,
  isEnabled: () => true,
  loading: false,
  refresh: async () => {},
});

function normalizeTierFromList(
  lists: PriceListConfig[],
  key: PriceTierKey,
  fallback: PriceTier
): PriceTier {
  const list =
    lists.find((item) => item.legacy_code === key) ||
    lists.find((item) => item.key === key) ||
    null;
  if (!list) return fallback;
  return {
    key,
    label: list.label || list.nombre || fallback.label,
    enabled: key === 'final' ? true : list.enabled !== false,
  };
}

export function PriceConfigProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [tiers, setTiers] = useState<PriceTier[]>(DEFAULT_PRICE_TIERS);
  const [lists, setLists] = useState<PriceListConfig[]>(DEFAULT_PRICE_LISTS);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setTiers(DEFAULT_PRICE_TIERS);
      setLists(DEFAULT_PRICE_LISTS);
      return;
    }
    setLoading(true);
    try {
      const data = await Api.listasPrecio({ inactivas: true });
      const normalizedLists = Array.isArray(data) && data.length
        ? data.map((item: any) => ({
            id: Number(item.id),
            key: String(item.key || item.legacy_code || item.slug || item.nombre || ''),
            slug: String(item.slug || item.legacy_code || item.key || ''),
            legacy_code: item.legacy_code || null,
            nombre: String(item.nombre || item.label || item.key || ''),
            label: String(item.label || item.nombre || item.key || ''),
            descripcion: item.descripcion || null,
            margen_ratio:
              typeof item.margen_ratio === 'number'
                ? item.margen_ratio
                : Number(item.margen_ratio || 0),
            enabled: item.enabled !== false && item.activo !== false,
            activo: item.enabled !== false && item.activo !== false,
            orden_visual:
              typeof item.orden_visual === 'number'
                ? item.orden_visual
                : Number(item.orden_visual || 0),
            is_system: Boolean(item.is_system),
            can_disable: item.can_disable !== false,
          }))
        : DEFAULT_PRICE_LISTS;

      setLists(normalizedLists);
      setTiers([
        normalizeTierFromList(normalizedLists, 'local', DEFAULT_PRICE_TIERS[0]),
        normalizeTierFromList(normalizedLists, 'distribuidor', DEFAULT_PRICE_TIERS[1]),
        normalizeTierFromList(normalizedLists, 'final', DEFAULT_PRICE_TIERS[2]),
      ]);
    } catch {
      setTiers(DEFAULT_PRICE_TIERS);
      setLists(DEFAULT_PRICE_LISTS);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getLabel = useCallback(
    (key: PriceTierKey | string) =>
      lists.find((item) => item.key === key || item.slug === key || item.legacy_code === key)?.label ??
      tiers.find((t) => t.key === key)?.label ??
      key,
    [lists, tiers]
  );

  const isEnabled = useCallback(
    (key: PriceTierKey | string) =>
      lists.find((item) => item.key === key || item.slug === key || item.legacy_code === key)
        ?.enabled ??
      tiers.find((t) => t.key === key)?.enabled ??
      true,
    [lists, tiers]
  );

  const value = useMemo(
    () => ({ tiers, lists, getLabel, isEnabled, loading, refresh }),
    [tiers, lists, getLabel, isEnabled, loading, refresh]
  );

  return <PriceConfigContext.Provider value={value}>{children}</PriceConfigContext.Provider>;
}

export function usePriceConfig() {
  return useContext(PriceConfigContext);
}
