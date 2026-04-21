import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';

export type LicenseStatus = {
  licensed: boolean;
  features: string[];
  max_users: number | null;
  expires_at: string | null;
  install_id: string | null;
  reason: string | null;
  license_type?: 'full' | 'demo';
  demo_active?: boolean;
  demo_started_at?: string | null;
  demo_expires_at?: string | null;
  demo_days_left?: number | null;
  demo_days_total?: number | null;
};

type LicenseContextType = {
  status: LicenseStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const CLOUD_FEATURES = [
  'usuarios',
  'arca',
  'ai',
  'marketplace',
  'cloud',
  'aprobaciones',
  'crm',
  'postventa',
  'multideposito',
  'integraciones',
  'fabricacion',
] as const;

const CLOUD_STATUS: LicenseStatus = {
  licensed: true,
  features: [...CLOUD_FEATURES],
  max_users: null,
  expires_at: null,
  install_id: null,
  reason: null,
  license_type: 'full',
  demo_active: false,
  demo_started_at: null,
  demo_expires_at: null,
  demo_days_left: null,
  demo_days_total: null,
};

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<LicenseStatus | null>(null);

  const refresh = useCallback(async () => {
    setStatus(isAuthenticated ? CLOUD_STATUS : null);
  }, [isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ status, loading: false, error: null, refresh }),
    [status, refresh],
  );

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense() {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error('useLicense must be used within LicenseProvider');
  return ctx;
}
