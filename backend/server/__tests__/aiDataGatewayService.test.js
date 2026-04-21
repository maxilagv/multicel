const service = require('../services/aiDataGatewayService');

describe('aiDataGatewayService', () => {
  test('arma un envelope estable con scope, filtros y hash', () => {
    const envelope = service.__test__.buildEnvelope({
      dataset: 'sales_snapshot',
      filters: { desde: '2026-04-01', hasta: '2026-04-16' },
      scope: service.__test__.buildScope({
        dataset: 'sales_snapshot',
        branchId: 3,
        companyId: 1,
        requestSource: 'internal:test',
        period: '2026-04',
      }),
      records: [{ venta_id: 10, monto: 2500 }],
      summary: { ventas: { total: 2500 } },
    });

    expect(envelope.dataset).toBe('sales_snapshot');
    expect(envelope.schema_version).toBe('v1');
    expect(envelope.scope.branch_id).toBe(3);
    expect(envelope.records_used).toBe(1);
    expect(typeof envelope.hash).toBe('string');
    expect(envelope.hash).toHaveLength(64);
  });

  test('normaliza limites invalidos sin romper el contrato', () => {
    expect(service.__test__.normalizeLimit(undefined, 100, 500)).toBe(100);
    expect(service.__test__.normalizeLimit(900, 100, 500)).toBe(500);
    expect(service.__test__.normalizeLimit(25, 100, 500)).toBe(25);
  });
});
