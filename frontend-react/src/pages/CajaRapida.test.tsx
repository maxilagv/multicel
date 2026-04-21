import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CajaRapida from './CajaRapida';
import { renderWithProviders } from '../test/renderWithProviders';
import { Api } from '../lib/api';

vi.mock('../lib/api', () => ({
  Api: {
    productos: vi.fn(),
    clientes: vi.fn(),
    depositos: vi.fn(),
    metodosPago: vi.fn(),
    crearVenta: vi.fn(),
    crearPago: vi.fn(),
  },
}));

describe('CajaRapida', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    Object.defineProperty(window, 'print', {
      writable: true,
      value: vi.fn(),
    });

    vi.mocked(Api.productos).mockResolvedValue([
      {
        id: 1,
        name: 'Coca Cola 2L',
        codigo: '7790001',
        price: 1500,
        precio_final: 1850,
        stock_quantity: 12,
        category_name: 'Bebidas',
      },
    ] as any);
    vi.mocked(Api.clientes).mockResolvedValue([
      { id: 7, nombre: 'Consumidor Final' },
    ] as any);
    vi.mocked(Api.depositos).mockResolvedValue([]);
    vi.mocked(Api.metodosPago).mockResolvedValue([
      { id: 11, nombre: 'Efectivo', moneda: 'ARS', activo: true },
    ] as any);
    vi.mocked(Api.crearVenta).mockResolvedValue({ id: 101 } as any);
    vi.mocked(Api.crearPago).mockResolvedValue({ ok: true } as any);
  });

  it('crea una venta completa desde caja rapida', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CajaRapida />);

    await screen.findByTestId('buscar-producto');
    await screen.findByText('Coca Cola 2L');

    await user.click(screen.getByTestId('producto-coca-cola-2l'));
    await user.click(screen.getByTestId('btn-cobrar-efectivo'));
    await user.type(screen.getByPlaceholderText('0,00'), '2000');
    await user.click(screen.getByRole('button', { name: /^cobrar$/i }));

    await waitFor(() => {
      expect(Api.crearVenta).toHaveBeenCalledTimes(1);
    });

    expect(Api.crearPago).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('ticket')).toHaveTextContent('Venta #101');
  });
});
