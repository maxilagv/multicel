jest.mock('../../db/repositories/ownerRepository', () => ({
  listProductsForPricing: jest.fn(),
  applyRepricing: jest.fn(),
  listRepricingRules: jest.fn(),
}));

jest.mock('../../db/repositories/configRepository', () => ({
  getDolarBlue: jest.fn(),
}));

const ownerRepo = require('../../db/repositories/ownerRepository');
const service = require('../../services/ownerIntelligenceService');

describe('ownerIntelligenceService bulk price', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('buildBulkPricePreview builds fixed prices for a selected category', async () => {
    ownerRepo.listProductsForPricing.mockResolvedValue([
      {
        id: 101,
        nombre: 'A01',
        precio_venta: 0,
        precio_local: 0,
        precio_distribuidor: 0,
        precio_final: 0,
      },
      {
        id: 102,
        nombre: 'A02',
        precio_venta: 800,
        precio_local: 750,
        precio_distribuidor: 700,
        precio_final: 900,
      },
    ]);

    const preview = await service.buildBulkPricePreview({
      categoryId: 15,
      includeDescendants: true,
      limit: 250,
      prices: {
        precio_venta: 1500,
        precio_local: 1400,
      },
    });

    expect(ownerRepo.listProductsForPricing).toHaveBeenCalledWith({
      productIds: [],
      categoryId: 15,
      includeDescendants: true,
      limit: 250,
    });
    expect(preview).toEqual([
      {
        producto_id: 101,
        producto: 'A01',
        precio_actual: {
          venta: 0,
          local: 0,
          distribuidor: 0,
          final: 0,
        },
        precio_sugerido: {
          venta: 1500,
          local: 1400,
          distribuidor: 0,
          final: 0,
        },
      },
      {
        producto_id: 102,
        producto: 'A02',
        precio_actual: {
          venta: 800,
          local: 750,
          distribuidor: 700,
          final: 900,
        },
        precio_sugerido: {
          venta: 1500,
          local: 1400,
          distribuidor: 700,
          final: 900,
        },
      },
    ]);
  });

  test('applyBulkPrice only updates changed rows', async () => {
    ownerRepo.listProductsForPricing.mockResolvedValue([
      {
        id: 201,
        nombre: 'A03',
        precio_venta: 1200,
        precio_local: 1200,
        precio_distribuidor: 900,
        precio_final: 1400,
      },
      {
        id: 202,
        nombre: 'A04',
        precio_venta: 1000,
        precio_local: 1000,
        precio_distribuidor: 800,
        precio_final: 1300,
      },
    ]);
    ownerRepo.applyRepricing.mockResolvedValue(1);

    const out = await service.applyBulkPrice({
      categoryId: 33,
      prices: {
        precio_venta: 1200,
        precio_local: 1200,
        precio_distribuidor: 950,
      },
      userId: 9,
    });

    expect(ownerRepo.applyRepricing).toHaveBeenCalledWith({
      updates: [
        {
          producto_id: 201,
          precio_venta: 1200,
          precio_local: 1200,
          precio_distribuidor: 950,
          precio_final: 1400,
        },
        {
          producto_id: 202,
          precio_venta: 1200,
          precio_local: 1200,
          precio_distribuidor: 950,
          precio_final: 1300,
        },
      ],
      userId: 9,
    });
    expect(out.changed).toBe(1);
    expect(out.preview).toHaveLength(2);
  });
});
