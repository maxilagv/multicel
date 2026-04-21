const service = require('../services/ownerIntelligenceService');

describe('ownerIntelligenceService risk model', () => {
  test('computeRiskBucket asigna bucket correcto', () => {
    expect(service.computeRiskBucket(20)).toBe('low');
    expect(service.computeRiskBucket(45)).toBe('medium');
    expect(service.computeRiskBucket(70)).toBe('high');
    expect(service.computeRiskBucket(90)).toBe('critical');
  });

  test('computeRiskScore sube con deuda y atraso', () => {
    const low = service.computeRiskScore({
      deuda_pendiente: 2000,
      deuda_mas_90: 0,
      dias_promedio_atraso: 5,
      promesas_incumplidas: 0,
      promesas_totales: 0,
      last_payment_date: new Date().toISOString(),
    }, 100000);

    const high = service.computeRiskScore({
      deuda_pendiente: 120000,
      deuda_mas_90: 70000,
      dias_promedio_atraso: 95,
      promesas_incumplidas: 2,
      promesas_totales: 3,
      last_payment_date: '2024-01-01',
    }, 100000);

    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(100);
  });
});

