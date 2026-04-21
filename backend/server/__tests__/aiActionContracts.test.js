const {
  deriveActionType,
  buildExecutionContract,
  validateExecutionContract,
  getFallbackStatusForExecutionFailure,
} = require('../services/aiActionContracts');

describe('aiActionContracts', () => {
  test('detecta reactivacion comercial desde la propuesta del cliente', () => {
    expect(
      deriveActionType({
        source_key: 'cliente:15',
        category: 'ventas',
      })
    ).toBe('customer_reactivation_review');
  });

  test('arma un contrato valido y estricto para n8n', () => {
    const contract = buildExecutionContract({
      proposal: {
        id: 25,
        proposal_key: 'workspace:reactivacion_cliente:25',
        source_key: 'cliente:25',
        title: 'Volver a contactar a Alicia',
        summary: 'Hace 65 dias que no compra.',
        why_text: 'No tiene deuda pendiente y todavia responde bien.',
        recommended_action: 'Mandar mensaje corto y personal.',
        expected_impact: 'Puede recuperar una venta.',
        entity_type: 'cliente',
        entity_id: 25,
        entity_name: 'Alicia Gomez',
        requires_approval: true,
        evidence: {
          dias_desde_ultima_compra: 65,
          lead_score: 82,
          total_gastado: 320000,
          total_compras: 6,
          whatsapp_opt_in: true,
          email: 'alicia@example.com',
        },
      },
      businessScope: {
        timezone: 'America/Argentina/Buenos_Aires',
        business_name: 'Kaisen Demo',
        business_address: 'Calle 123',
        depositos_visibles: [{ id: 1, nombre: 'Central', codigo: 'CTR', rol: 'principal' }],
      },
      operatorUserId: 9,
    });

    expect(contract.action_type).toBe('customer_reactivation_review');
    expect(contract.workflow_key).toBe('crm.reactivation.review');
    expect(contract.action_payload.suggested_channels).toEqual(
      expect.arrayContaining(['whatsapp', 'email', 'task'])
    );
    expect(validateExecutionContract(contract)).toEqual(
      expect.objectContaining({ ok: true })
    );
  });

  test('vuelve a pendiente cuando la automatizacion falla despues de una aprobacion', () => {
    expect(
      getFallbackStatusForExecutionFailure({
        requires_approval: true,
        approval_estado: 'aprobado',
      })
    ).toBe('pendiente');
  });

  test('manda a revision cuando falla sin aprobacion cerrada', () => {
    expect(
      getFallbackStatusForExecutionFailure({
        requires_approval: true,
        approval_estado: 'pendiente',
      })
    ).toBe('en_revision');
  });
});
