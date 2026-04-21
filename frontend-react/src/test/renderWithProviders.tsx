import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { LicenseProvider } from '../context/LicenseContext';
import { ToastProvider } from '../context/ToastContext';
import { ViewModeProvider } from '../context/ViewModeContext';
import { CompanyProvider } from '../context/CompanyContext';

type ExtendedOptions = RenderOptions & {
  routerProps?: MemoryRouterProps;
};

export function renderWithProviders(ui: ReactElement, options: ExtendedOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const { routerProps, ...renderOptions } = options;

  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} {...routerProps}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <LicenseProvider>
              <CompanyProvider>
                <ViewModeProvider>
                  <ToastProvider>{ui}</ToastProvider>
                </ViewModeProvider>
              </CompanyProvider>
            </LicenseProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </MemoryRouter>,
    renderOptions,
  );
}
