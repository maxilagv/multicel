import type { LicenseStatus } from '../context/LicenseContext';

export type FeatureKey =
  | 'usuarios'
  | 'arca'
  | 'ai'
  | 'marketplace'
  | 'cloud'
  | 'aprobaciones'
  | 'crm'
  | 'postventa'
  | 'multideposito';

export const FEATURE_LIST: { key: FeatureKey; label: string }[] = [
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'arca', label: 'ARCA' },
  { key: 'ai', label: 'Predicciones / IA' },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'cloud', label: 'Cloud Sync' },
  { key: 'aprobaciones', label: 'Aprobaciones' },
  { key: 'crm', label: 'CRM' },
  { key: 'postventa', label: 'Postventa' },
  { key: 'multideposito', label: 'Multideposito' },
];

export const FEATURE_LABELS: Record<FeatureKey, string> = FEATURE_LIST.reduce(
  (acc, f) => {
    acc[f.key] = f.label;
    return acc;
  },
  {} as Record<FeatureKey, string>
);

export function hasFeature(
  status: LicenseStatus | null,
  feature?: FeatureKey | null
) {
  if (!feature) return true;
  if (!status) return true;
  if (!status.licensed) return false;
  const features = Array.isArray(status.features) ? status.features : [];
  return features.includes(feature);
}
