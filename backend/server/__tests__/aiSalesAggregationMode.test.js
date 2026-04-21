const service = require('../services/aiService');

describe('aiService sales aggregation mode', () => {
  test('usa delivered cuando la adopcion es suficiente', () => {
    expect(
      service.__test__.chooseSalesAggregationMode({
        configuredMode: 'auto',
        totalCount: 100,
        deliveredCount: 80,
        minDeliveredRatio: 0.6,
        minDeliveredCount: 20,
      })
    ).toBe('delivered');
  });

  test('vuelve a all cuando la adopcion de entregas es baja', () => {
    expect(
      service.__test__.chooseSalesAggregationMode({
        configuredMode: 'auto',
        totalCount: 100,
        deliveredCount: 5,
        minDeliveredRatio: 0.6,
        minDeliveredCount: 20,
      })
    ).toBe('all');
  });

  test('respeta el modo forzado all', () => {
    expect(
      service.__test__.chooseSalesAggregationMode({
        configuredMode: 'all',
        totalCount: 100,
        deliveredCount: 100,
      })
    ).toBe('all');
  });

  test('arma el filtro delivered con fecha efectiva', () => {
    const strategy = service.__test__.buildSalesAggregationStrategy('delivered', 'v');
    expect(strategy.dateExpr).toContain('COALESCE(v.fecha_entrega, v.fecha)');
    expect(strategy.whereSql).toContain("v.estado_entrega = 'entregado'");
  });
});
