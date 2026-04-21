const service = require('../services/executiveAssistantService');

describe('executiveAssistantService', () => {
  test('detecta la intencion de caja desde una pregunta en lenguaje natural', () => {
    expect(
      service.__test__.inferIntent({
        question: 'decime donde se me esta yendo la caja esta semana',
      })
    ).toBe('cash');
  });

  test('detecta la intencion de catalogo web y promocion', () => {
    expect(
      service.__test__.inferIntent({
        question: 'quiero hacer mi catalogo web, que productos deberia promocionar primero?',
      })
    ).toBe('catalog');
  });

  test('arma una respuesta de respaldo clara para prioridades del dia', () => {
    const answer = service.__test__.buildFallbackAnswer({
      intent: 'today',
      reportData: {},
      priorities: {},
      cards: [
        {
          title: 'Contactar a un cliente',
        },
      ],
    });

    expect(answer).toMatch(/Contactar a un cliente/);
    expect(answer).toMatch(/Hoy/);
  });

  test('genera tarjetas de overview con ventas, caja y margen', () => {
    const cards = service.__test__.buildCardsByIntent(
      'overview',
      {
        kpis: {
          ventas: { total: 1200000, count: 18 },
          cashflow: { cash_in: 900000, cash_out: 700000, neto: 200000 },
          ganancia_neta: { total: 250000 },
        },
        trends: { ventas_pct: 12.5 },
        riesgos: { alertas_resumen: { high: 1 } },
      },
      {
        summary: {
          total_abiertas: 4,
          pendientes_aprobacion: 1,
        },
      }
    );

    expect(cards).toHaveLength(4);
    expect(cards[0].title).toMatch(/Ventas/);
    expect(cards[1].title).toMatch(/Caja/);
  });

  test('arma evidencia relevante para stock sin mezclar metricas de caja', () => {
    const evidence = service.__test__.buildEvidenceByIntent(
      'stock',
      {
        riesgos: {
          stock_bajo: [
            { nombre: 'Producto A', disponible: 2 },
            { nombre: 'Producto B', disponible: 4 },
          ],
        },
      },
      {
        summary: {
          por_area: {
            stock: 2,
            rentabilidad: 1,
          },
        },
      }
    );

    expect(evidence[0].label).toMatch(/Productos a revisar/);
    expect(evidence[1].value).toBe('Producto A');
    expect(evidence[3].value).toBe('3');
  });

  test('descarta una respuesta LLM debil o cortada', () => {
    expect(service.__test__.isWeakLlmAnswer('Actualmente, tus ventas bajaron un 40% respecto al mes anterior, aunque')).toBe(true);
    expect(service.__test__.isWeakLlmAnswer('La caja viene estable y no hay alertas graves. Conviene sostener el foco y revisar solo lo critico.')).toBe(false);
  });
});
