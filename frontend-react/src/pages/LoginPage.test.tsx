import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './Login';
import { renderWithProviders } from '../test/renderWithProviders';
import { login, loginWithMfa, setupAdmin, setupStatus } from '../lib/api';

vi.mock('../lib/api', () => ({
  Api: {},
  login: vi.fn(),
  loginWithMfa: vi.fn(),
  setupStatus: vi.fn(),
  setupAdmin: vi.fn(),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.mocked(setupStatus).mockResolvedValue({ requiresSetup: false });
    vi.mocked(login).mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    } as any);
    vi.mocked(loginWithMfa).mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    } as any);
    vi.mocked(setupAdmin).mockResolvedValue({ ok: true } as any);
  });

  it('permite iniciar sesion y navega al panel', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app" element={<div>App Home</div>} />
      </Routes>,
      {
        routerProps: { initialEntries: ['/login'] },
      },
    );

    await screen.findByLabelText(/email/i);

    await user.type(screen.getByLabelText(/email/i), 'owner@kaisen.test');
    await user.type(screen.getByLabelText(/^contrasena$/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('owner@kaisen.test', 'secret123');
    });

    expect(await screen.findByText('App Home')).toBeInTheDocument();
  });

  it('pide codigo MFA cuando el backend lo requiere', async () => {
    const user = userEvent.setup();
    vi.mocked(login).mockRejectedValueOnce(
      Object.assign(new Error('Ingresa el codigo de tu app autenticadora para continuar.'), {
        code: 'MFA_REQUIRED',
        mfaRequired: true,
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      {
        routerProps: { initialEntries: ['/login'] },
      },
    );

    await screen.findByLabelText(/email/i);

    await user.type(screen.getByLabelText(/email/i), 'owner@kaisen.test');
    await user.type(screen.getByLabelText(/^contrasena$/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /ingresar/i }));

    expect(await screen.findByLabelText(/codigo de autenticacion/i)).toBeInTheDocument();
  });
});
