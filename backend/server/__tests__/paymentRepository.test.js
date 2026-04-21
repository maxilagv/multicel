describe('paymentRepository', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('normaliza fecha ISO antes de insertar un pago asociado a venta', async () => {
    const mockClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 99, neto: 1850, estado_pago: 'pendiente', cliente_id: 7 }],
        })
        .mockResolvedValueOnce({ lastID: 321 })
        .mockResolvedValueOnce({ rows: [{ total: 1850 }] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    jest.doMock('../db/pg', () => ({
      withTransaction: async (callback) => callback(mockClient),
      query: jest.fn(),
    }));

    const repo = require('../db/repositories/paymentRepository');

    await repo.crearPago({
      venta_id: 99,
      cliente_id: 7,
      monto: 1850,
      fecha: '2026-03-09T22:16:10.214Z',
      metodo: 'efectivo',
    });

    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO pagos'),
      [99, 7, 1850, '2026-03-09 22:16:10', 'efectivo', null]
    );
  });
});
