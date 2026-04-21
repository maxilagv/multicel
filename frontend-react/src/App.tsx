import AppRouter from './routes/AppRouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LicenseProvider } from './context/LicenseContext';
import { ToastProvider } from './context/ToastContext';
import { ViewModeProvider } from './context/ViewModeContext';
import { CompanyProvider } from './context/CompanyContext';
import { TenantModulesProvider } from './context/TenantModulesContext';
import { PriceConfigProvider } from './context/PriceConfigContext';
import { queryClient } from './lib/queryClient';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ViewModeProvider>
          <AuthProvider>
            <LicenseProvider>
              <TenantModulesProvider>
                <PriceConfigProvider>
                  <CompanyProvider>
                    <ToastProvider>
                      <AppRouter />
                    </ToastProvider>
                  </CompanyProvider>
                </PriceConfigProvider>
              </TenantModulesProvider>
            </LicenseProvider>
          </AuthProvider>
        </ViewModeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
