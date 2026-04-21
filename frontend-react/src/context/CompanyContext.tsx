import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { Api } from '../lib/api';

export interface CompanyData {
  name: string;
  logoUrl: string;
  address: string;
  clientMode: 'manual' | 'anonymous' | 'later';
}

const FALLBACK: CompanyData = {
  name: 'Mi Empresa',
  logoUrl: '',
  address: '',
  clientMode: 'manual',
};

interface CompanyContextType {
  company: CompanyData;
  isLoaded: boolean;
  refresh: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType>({
  company: FALLBACK,
  isLoaded: false,
  refresh: async () => {},
});

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [company, setCompany] = useState<CompanyData>(FALLBACK);
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const data = (await Api.businessProfile()) as Record<string, string>;
      const name = String(data.nombre || '').trim() || FALLBACK.name;
      setCompany({
        name,
        logoUrl: String(data.logo_url || '').trim(),
        address: String(data.direccion || '').trim(),
        clientMode: (['manual', 'anonymous', 'later'] as const).includes(
          data.client_mode as 'manual' | 'anonymous' | 'later'
        )
          ? (data.client_mode as CompanyData['clientMode'])
          : 'manual',
      });
      document.title = `${name} — ERP`;
    } catch {
      // Mantener fallback sin ruido
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchProfile();
    } else {
      setCompany(FALLBACK);
      setIsLoaded(false);
    }
  }, [isAuthenticated, fetchProfile]);

  return (
    <CompanyContext.Provider value={{ company, isLoaded, refresh: fetchProfile }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
