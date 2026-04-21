const { __test__ } = require('../services/clientSegmentationService');

describe('client segmentation service', () => {
  test('marks a highly engaged customer as vip', () => {
    const score = __test__.calculateLeadScore({
      telefono_e164: '+5491112345678',
      email: 'vip@example.com',
      total_compras: 7,
      dias_desde_ultima_compra: 12,
      total_gastado: 850000,
      respondio_whatsapp: true,
      whatsapp_opt_in: true,
      oportunidades_activas: 1,
      deuda_pendiente: 0,
      whatsapp_status: 'valid',
    });

    expect(score).toBe(100);
    expect(__test__.deriveLeadSegment(score)).toBe('vip');
  });

  test('marks a cold customer with debt as inactive', () => {
    const score = __test__.calculateLeadScore({
      telefono_e164: null,
      email: null,
      total_compras: 1,
      dias_desde_ultima_compra: 240,
      total_gastado: 15000,
      respondio_whatsapp: false,
      whatsapp_opt_in: false,
      oportunidades_activas: 0,
      deuda_pendiente: 25000,
      whatsapp_status: 'blocked',
    });

    expect(score).toBe(0);
    expect(__test__.deriveLeadSegment(score)).toBe('inactivo');
  });

  test('builds a simple business insight for the customer view', () => {
    const insight = __test__.buildClientInsight({
      lead_score: 74,
      lead_segmento: 'frecuente',
      ultima_compra_at: '2026-04-10T12:00:00.000Z',
      total_compras: 6,
      total_gastado: 220000,
      deuda_pendiente: 0,
      oportunidades_activas: 1,
      respondio_whatsapp: true,
      whatsapp_opt_in: true,
      fecha_nacimiento: '1991-07-18',
    }, new Date('2026-04-15T12:00:00.000Z'));

    expect(insight.lead_segmento).toBe('frecuente');
    expect(insight.dias_desde_ultima_compra).toBe(5);
    expect(insight.sugerencia).toContain('Mantener contacto');
  });
});
