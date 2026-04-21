const reportExecutiveService = require('./reportExecutiveService');
const aiWorkspaceService = require('./aiWorkspaceService');
const llmService = require('./llmService');
const logger = require('../lib/logger');

const PRESET_LABELS = {
  overview: 'Como viene el negocio',
  today: 'Que debo atender hoy',
  cash: 'Donde se me va la caja',
  clients: 'Que clientes conviene recuperar',
  stock: 'Que mercaderia tengo que mirar ya',
};

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function currency(value) {
  return `$${safeNumber(value, 0).toLocaleString('es-AR', {
    maximumFractionDigits: 0,
  })}`;
}

function percent(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return `${Number(value).toFixed(1)}%`;
}

function inferIntent({ question = '', preset = '' } = {}) {
  const normalizedPreset = String(preset || '').trim().toLowerCase();
  if (PRESET_LABELS[normalizedPreset]) return normalizedPreset;

  const text = String(question || '').trim().toLowerCase();
  if (!text) return 'overview';
  if (
    text.includes('catalog') ||
    text.includes('catalogo') ||
    text.includes('web') ||
    text.includes('tienda online') ||
    text.includes('ecommerce') ||
    text.includes('e-commerce') ||
    text.includes('promocion') ||
    text.includes('promocionar') ||
    text.includes('promover') ||
    text.includes('publicar')
  ) {
    return 'catalog';
  }
  if (text.includes('hoy') || text.includes('atender') || text.includes('urgente')) return 'today';
  if (text.includes('caja') || text.includes('gasto') || text.includes('cobranza')) return 'cash';
  if (text.includes('cliente') || text.includes('reactivar') || text.includes('vender')) return 'clients';
  if (text.includes('stock') || text.includes('mercader') || text.includes('reposicion')) return 'stock';
  return 'overview';
}

function statusTone(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['urgente', 'critico', 'alta'].includes(normalized)) return 'urgente';
  if (['atencion', 'media'].includes(normalized)) return 'atencion';
  return 'estable';
}

function normalizeProposalCard(proposal) {
  return {
    title: proposal.title,
    tone: statusTone(proposal.priority_level),
    summary: proposal.summary,
    why_it_matters: proposal.why_text,
    next_step: proposal.recommended_action,
    impact: proposal.expected_impact,
  };
}

function buildOverviewCards(reportData, priorities) {
  const cashNet = safeNumber(reportData?.kpis?.cashflow?.neto, 0);
  const salesTrend = percent(reportData?.trends?.ventas_pct);
  const marginTotal = safeNumber(reportData?.kpis?.ganancia_neta?.total, 0);
  const highAlerts = safeNumber(reportData?.riesgos?.alertas_resumen?.high, 0);

  return [
    {
      title: 'Ventas del periodo',
      tone: salesTrend && Number(reportData?.trends?.ventas_pct) < 0 ? 'atencion' : 'estable',
      summary: `${currency(reportData?.kpis?.ventas?.total)} en ${safeNumber(reportData?.kpis?.ventas?.count, 0)} operaciones.`,
      why_it_matters: salesTrend
        ? `Frente al periodo anterior, las ventas se movieron ${salesTrend}.`
        : 'Todavia no hay suficiente comparacion para medir tendencia.',
      next_step: 'Revisar si el ritmo de ventas alcanza para cumplir el objetivo del mes.',
    },
    {
      title: 'Caja neta',
      tone: cashNet < 0 ? 'urgente' : cashNet === 0 ? 'atencion' : 'estable',
      summary: cashNet < 0 ? `La caja va ${currency(cashNet)}.` : `La caja suma ${currency(cashNet)}.`,
      why_it_matters: `Entraron ${currency(reportData?.kpis?.cashflow?.cash_in)} y salieron ${currency(reportData?.kpis?.cashflow?.cash_out)}.`,
      next_step: cashNet < 0 ? 'Priorizar cobranzas y compras realmente necesarias.' : 'Sostener el ritmo y evitar gastos que no ayuden a vender o cobrar mejor.',
    },
    {
      title: 'Margen del periodo',
      tone: marginTotal <= 0 ? 'urgente' : marginTotal < safeNumber(reportData?.kpis?.ventas?.total, 0) * 0.1 ? 'atencion' : 'estable',
      summary: `El resultado neto estimado es ${currency(marginTotal)}.`,
      why_it_matters: 'Este numero muestra si lo vendido realmente deja aire despues de cubrir gastos.',
      next_step: 'Mirar lineas con margen flojo y revisar precios antes de tocar volumen.',
    },
    {
      title: 'Prioridades abiertas',
      tone: highAlerts > 0 || safeNumber(priorities?.summary?.pendientes_aprobacion, 0) > 0 ? 'atencion' : 'estable',
      summary: `${safeNumber(priorities?.summary?.total_abiertas, 0)} temas abiertos y ${safeNumber(priorities?.summary?.pendientes_aprobacion, 0)} esperando decision.`,
      why_it_matters: highAlerts > 0
        ? `Hay ${highAlerts} alertas altas detectadas en la operacion.`
        : 'No aparecen alertas graves en este corte.',
      next_step: 'Resolver primero lo que impacta ventas, caja o faltantes.',
    },
  ];
}

function buildTodayCards(priorities) {
  const proposals = Array.isArray(priorities?.proposals) ? priorities.proposals : [];
  return proposals.slice(0, 4).map(normalizeProposalCard);
}

function buildCashCards(reportData) {
  const debtRows = Array.isArray(reportData?.riesgos?.deudas) ? reportData.riesgos.deudas : [];
  return [
    {
      title: 'Entradas y salidas',
      tone: safeNumber(reportData?.kpis?.cashflow?.neto, 0) < 0 ? 'urgente' : 'estable',
      summary: `${currency(reportData?.kpis?.cashflow?.cash_in)} entraron y ${currency(reportData?.kpis?.cashflow?.cash_out)} salieron.`,
      why_it_matters: 'Si sale mas de lo que entra, la caja empieza a presionar toda la operacion.',
      next_step: 'Cortar gastos postergables y acelerar pagos pendientes de clientes.',
    },
    {
      title: 'Cobranza del periodo',
      tone: safeNumber(reportData?.kpis?.cobranza_ratio, 0) < 0.6 ? 'atencion' : 'estable',
      summary: reportData?.kpis?.cobranza_ratio == null
        ? 'No hay ratio de cobranza suficiente para este corte.'
        : `Se cobro el ${percent(safeNumber(reportData?.kpis?.cobranza_ratio, 0) * 100)} de lo vendido.`,
      why_it_matters: 'Vender no alcanza si despues el dinero no entra a tiempo.',
      next_step: 'Revisar clientes con saldo pendiente y contactar primero a los de mayor monto.',
    },
    {
      title: 'Deudas a seguir',
      tone: debtRows.length > 0 ? 'atencion' : 'estable',
      summary: debtRows.length
        ? `${debtRows.length} clientes aparecen con deuda en este corte.`
        : 'No aparecen deudas relevantes en este corte.',
      why_it_matters: debtRows[0]
        ? `${debtRows[0].nombre} debe ${currency(debtRows[0].deuda_pendiente)}.`
        : 'La deuda no marca hoy un foco critico.',
      next_step: debtRows.length
        ? 'Empezar por los saldos altos y con mas atraso.'
        : 'Mantener seguimiento preventivo para que no se acumule atraso.',
    },
  ];
}

function buildClientCards(reportData, priorities) {
  const proposals = (priorities?.proposals || []).filter((item) => item.category === 'ventas');
  const topClients = Array.isArray(reportData?.top?.clientes) ? reportData.top.clientes : [];

  const proposalCards = proposals.slice(0, 2).map(normalizeProposalCard);
  const topCards = topClients.slice(0, 2).map((client) => ({
    title: client.nombre || 'Cliente destacado',
    tone: 'estable',
    summary: `Movio ${currency(client.total)} en el periodo.`,
    why_it_matters: 'Sirve como referencia para cuidar a los clientes que ya estan comprando bien.',
    next_step: 'Confirmar si hay stock, seguimiento y respuesta rapida para sostener la relacion.',
  }));

  return [...proposalCards, ...topCards].slice(0, 4);
}

function buildStockCards(reportData, priorities) {
  const lowStock = Array.isArray(reportData?.riesgos?.stock_bajo) ? reportData.riesgos.stock_bajo : [];
  const proposals = (priorities?.proposals || []).filter(
    (item) => item.category === 'stock' || item.category === 'rentabilidad'
  );

  const stockCards = lowStock.slice(0, 2).map((item) => ({
    title: item.nombre || 'Producto a revisar',
    tone: 'urgente',
    summary: `Quedan ${safeNumber(item.disponible, 0)} unidades y el minimo sugerido es ${safeNumber(item.stock_minimo, 0)}.`,
    why_it_matters: 'Si se corta este producto, el problema aparece antes en ventas que en el deposito.',
    next_step: 'Revisar compra pendiente, tiempos del proveedor y reposicion inmediata.',
  }));

  return [...stockCards, ...proposals.slice(0, 2).map(normalizeProposalCard)].slice(0, 4);
}

function buildCatalogCards(reportData, priorities) {
  const topProducts = Array.isArray(reportData?.top?.productos) ? reportData.top.productos : [];
  const lowStockNames = new Set(
    (Array.isArray(reportData?.riesgos?.stock_bajo) ? reportData.riesgos.stock_bajo : [])
      .map((item) => String(item?.nombre || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const promotableProducts = topProducts.filter(
    (item) => !lowStockNames.has(String(item?.nombre || '').trim().toLowerCase())
  );
  const featured = promotableProducts.slice(0, 3);
  const stockSensitive = topProducts.filter((item) =>
    lowStockNames.has(String(item?.nombre || '').trim().toLowerCase())
  );
  const openCommercialPriorities =
    safeNumber(priorities?.summary?.por_area?.ventas, 0) +
    safeNumber(priorities?.summary?.por_area?.rentabilidad, 0);

  return [
    {
      title: 'Implementar lo minimo viable',
      tone: 'atencion',
      summary: 'Subi un catalogo simple, rapido y usable desde el celular antes de pensar en algo complejo.',
      why_it_matters:
        'Si la experiencia tarda o confunde, el catalogo no ayuda a vender aunque tenga muchos productos.',
      next_step:
        'Arrancar con home, categorias claras, ficha simple, boton de WhatsApp y precios visibles.',
    },
    {
      title: 'Ordenar datos antes de publicar',
      tone: openCommercialPriorities > 0 ? 'atencion' : 'estable',
      summary: 'Antes de difundirlo, asegura stock, precio y foto en los productos que quieras empujar.',
      why_it_matters:
        'Un catalogo con precios desactualizados o productos sin disponibilidad erosiona confianza rapido.',
      next_step:
        'Definir un bloque inicial de productos publicados con control de stock y precio confirmado.',
    },
    {
      title: 'Productos para promocionar primero',
      tone: featured.length > 0 ? 'estable' : 'atencion',
      summary:
        featured.length > 0
          ? featured.map((item) => item.nombre).join(', ')
          : 'Todavia no aparece un grupo claro de productos para empujar de entrada.',
      why_it_matters:
        featured.length > 0
          ? 'Son productos que ya muestran movimiento y no aparecen hoy entre los mas sensibles por stock.'
          : 'Conviene revisar top ventas y stock antes de definir la promocion inicial.',
      next_step:
        stockSensitive.length > 0
          ? `Evitar empujar fuerte ${stockSensitive
              .slice(0, 2)
              .map((item) => item.nombre)
              .join(' y ')} hasta confirmar reposicion.`
          : 'Publicar primero 6 a 12 productos fuertes y medir consulta real antes de ampliar el catalogo.',
    },
  ];
}

function buildCardsByIntent(intent, reportData, priorities) {
  if (intent === 'today') return buildTodayCards(priorities);
  if (intent === 'cash') return buildCashCards(reportData);
  if (intent === 'clients') return buildClientCards(reportData, priorities);
  if (intent === 'stock') return buildStockCards(reportData, priorities);
  if (intent === 'catalog') return buildCatalogCards(reportData, priorities);
  return buildOverviewCards(reportData, priorities);
}

function buildPriorityActions(priorities, intent) {
  const proposals = Array.isArray(priorities?.proposals) ? priorities.proposals : [];
  const filtered =
    intent === 'clients'
      ? proposals.filter((item) => item.category === 'ventas')
      : intent === 'stock'
      ? proposals.filter((item) => item.category === 'stock' || item.category === 'rentabilidad')
      : intent === 'cash'
      ? proposals.filter((item) => item.category === 'cobranzas' || item.category === 'rentabilidad')
      : proposals;

  return filtered.slice(0, 5).map((item) => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    next_step: item.recommended_action,
    needs_approval: Boolean(item.requires_approval),
  }));
}

function buildEvidenceByIntent(intent, reportData, priorities) {
  if (intent === 'cash') {
    return [
      {
        label: 'Caja neta',
        value: currency(reportData?.kpis?.cashflow?.neto),
      },
      {
        label: 'Entradas',
        value: currency(reportData?.kpis?.cashflow?.cash_in),
      },
      {
        label: 'Salidas',
        value: currency(reportData?.kpis?.cashflow?.cash_out),
      },
      {
        label: 'Cobranza',
        value:
          reportData?.kpis?.cobranza_ratio == null
            ? 'Sin ratio'
            : `${safeNumber(reportData?.kpis?.cobranza_ratio, 0).toFixed(1)}%`,
      },
    ];
  }

  if (intent === 'clients') {
    const ventasOpen = safeNumber(priorities?.summary?.por_area?.ventas, 0);
    const topClient = Array.isArray(reportData?.top?.clientes) ? reportData.top.clientes[0] : null;
    return [
      {
        label: 'Oportunidades',
        value: String(ventasOpen),
      },
      {
        label: 'Mejor cliente',
        value: topClient?.nombre || 'Sin dato',
      },
      {
        label: 'Venta top',
        value: topClient ? currency(topClient.total) : '$0',
      },
      {
        label: 'Prioridades abiertas',
        value: String(safeNumber(priorities?.summary?.total_abiertas, 0)),
      },
    ];
  }

  if (intent === 'stock') {
    const lowStock = Array.isArray(reportData?.riesgos?.stock_bajo) ? reportData.riesgos.stock_bajo : [];
    const topStock = lowStock[0] || null;
    const stockOpen =
      safeNumber(priorities?.summary?.por_area?.stock, 0) +
      safeNumber(priorities?.summary?.por_area?.rentabilidad, 0);
    return [
      {
        label: 'Productos a revisar',
        value: String(lowStock.length),
      },
      {
        label: 'Mas delicado',
        value: topStock?.nombre || 'Sin foco claro',
      },
      {
        label: 'Disponible',
        value: topStock ? String(safeNumber(topStock.disponible, 0)) : '0',
      },
      {
        label: 'Prioridades de stock',
        value: String(stockOpen),
      },
    ];
  }

  if (intent === 'today') {
    return [
      {
        label: 'Prioridades abiertas',
        value: String(safeNumber(priorities?.summary?.total_abiertas, 0)),
      },
      {
        label: 'Pendientes de aprobacion',
        value: String(safeNumber(priorities?.summary?.pendientes_aprobacion, 0)),
      },
      {
        label: 'Alertas altas',
        value: String(safeNumber(reportData?.riesgos?.alertas_resumen?.high, 0)),
      },
      {
        label: 'Ventas',
        value: currency(reportData?.kpis?.ventas?.total),
      },
    ];
  }

  if (intent === 'catalog') {
    const topProducts = Array.isArray(reportData?.top?.productos) ? reportData.top.productos : [];
    const lowStockNames = new Set(
      (Array.isArray(reportData?.riesgos?.stock_bajo) ? reportData.riesgos.stock_bajo : [])
        .map((item) => String(item?.nombre || '').trim().toLowerCase())
        .filter(Boolean)
    );
    const promotable = topProducts.filter(
      (item) => !lowStockNames.has(String(item?.nombre || '').trim().toLowerCase())
    );
    const firstPromotion = promotable[0] || topProducts[0] || null;
    return [
      {
        label: 'Ventas del periodo',
        value: currency(reportData?.kpis?.ventas?.total),
      },
      {
        label: 'Top producto',
        value: firstPromotion?.nombre || 'Sin dato',
      },
      {
        label: 'Productos top',
        value: String(topProducts.length),
      },
      {
        label: 'Stock sensible',
        value: String(lowStockNames.size),
      },
    ];
  }

  return [
    {
      label: 'Ventas',
      value: currency(reportData?.kpis?.ventas?.total),
    },
    {
      label: 'Caja neta',
      value: currency(reportData?.kpis?.cashflow?.neto),
    },
    {
      label: 'Resultado neto',
      value: currency(reportData?.kpis?.ganancia_neta?.total),
    },
    {
      label: 'Prioridades abiertas',
      value: String(safeNumber(priorities?.summary?.total_abiertas, 0)),
    },
  ];
}

function buildFallbackAnswer({ intent, reportData, priorities, cards }) {
  if (intent === 'today') {
    if (!cards.length) {
      return 'Hoy no aparecen prioridades urgentes nuevas. Aun asi conviene revisar ventas, cobranzas y stock antes de cerrar el dia.';
    }
    return `Hoy lo mas importante es resolver ${cards.length} temas concretos. Empeza por "${cards[0].title}" y despues seguí con los puntos que afectan ventas, caja o faltantes.`;
  }

  if (intent === 'cash') {
    return `La caja muestra ${currency(reportData?.kpis?.cashflow?.neto)} en el periodo. Conviene mirar primero cobranzas pendientes, despues gastos que no sean imprescindibles y por ultimo compras que puedan esperar sin cortar ventas.`;
  }

  if (intent === 'clients') {
    const salesActions = safeNumber(priorities?.summary?.por_area?.ventas, 0);
    return `Hay ${salesActions} oportunidades comerciales abiertas para recuperar clientes o sostener buenas cuentas. La prioridad no es hablarle a todos, sino elegir pocos casos con chance real de volver.`;
  }

  if (intent === 'stock') {
    const lowStock = Array.isArray(reportData?.riesgos?.stock_bajo) ? reportData.riesgos.stock_bajo.length : 0;
    return `Aparecen ${lowStock} productos con stock delicado en este corte. Lo importante es evitar quiebres en productos que venden y no seguir acumulando en los que hoy inmovilizan caja.`;
  }

  if (intent === 'catalog') {
    const topProducts = Array.isArray(reportData?.top?.productos) ? reportData.top.productos : [];
    const lowStockNames = new Set(
      (Array.isArray(reportData?.riesgos?.stock_bajo) ? reportData.riesgos.stock_bajo : [])
        .map((item) => String(item?.nombre || '').trim().toLowerCase())
        .filter(Boolean)
    );
    const promotable = topProducts.filter(
      (item) => !lowStockNames.has(String(item?.nombre || '').trim().toLowerCase())
    );
    const promoNames = promotable.slice(0, 3).map((item) => item.nombre);

    return (
      `Si queres sacar el catalogo web ahora mismo, empeza por una version simple: portada clara, categorias, ficha corta por producto, precio visible y boton directo de consulta o compra por WhatsApp. ` +
      `No intentes publicar todo de entrada; primero subi un bloque chico, prolijo y facil de mantener.\n\n` +
      (promoNames.length > 0
        ? `Para promocionar primero, empuja ${promoNames.join(', ')} porque ya muestran movimiento y no aparecen entre los productos mas sensibles por stock en este corte. `
        : 'Antes de promocionar fuerte, conviene definir un bloque inicial de productos con stock confirmado y precio revisado. ') +
      `El siguiente paso correcto es publicar entre 6 y 12 productos fuertes, medir consultas reales y despues ampliar.`
    );
  }

  return `El negocio muestra ${currency(reportData?.kpis?.ventas?.total)} vendidos, ${currency(reportData?.kpis?.cashflow?.neto)} de caja neta y ${safeNumber(priorities?.summary?.total_abiertas, 0)} prioridades abiertas. Lo recomendable es sostener lo que ya funciona y actuar rapido donde haya riesgo sobre caja, margen o faltantes.`;
}

function isWeakLlmAnswer(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (text.length < 80) return true;
  const normalized = text.toLowerCase();
  if (
    normalized.endsWith('aunque') ||
    normalized.endsWith('pero') ||
    normalized.endsWith('y') ||
    normalized.endsWith('ademas') ||
    normalized.endsWith('ya que') ||
    normalized.endsWith(':') ||
    normalized.endsWith(',')
  ) {
    return true;
  }
  return false;
}

async function tryLlmAnswer({ intent, question, cards, evidence, reportData, priorities }) {
  if (process.env.AI_LLM_ENABLED !== 'true') return null;

  const payload = JSON.stringify(
    {
      intent,
      question,
      cards,
      evidence,
      report_summary: {
        range: reportData?.range || null,
        kpis: reportData?.kpis || null,
        trends: reportData?.trends || null,
      },
      priorities_summary: priorities?.summary || null,
    },
    null,
    2
  );

  const messages = [
    {
      role: 'system',
      content:
        'Eres un asesor ejecutivo para una pyme. Responde en espanol simple, sin lenguaje tecnico y sin inventar datos. ' +
        'Explica primero la situacion general y cierra con el siguiente paso mas conveniente. Usa como maximo 3 parrafos cortos.',
    },
    {
      role: 'user',
      content:
        `Pregunta del usuario: ${question}\n\n` +
        `Datos disponibles:\n${payload}`,
    },
  ];

  return llmService.callLLM({ messages, maxTokens: 500 });
}

async function buildExecutiveAssistantReply({
  question = '',
  preset = '',
  rangeInput = {},
  filters = {},
  requestedByUsuarioId = null,
} = {}) {
  const intent = inferIntent({ question, preset });
  const resolvedQuestion = String(question || '').trim() || PRESET_LABELS[intent];

  const [reportData, priorities] = await Promise.all([
    reportExecutiveService.buildExecutiveReportData({
      rangeInput,
      filters,
      historyDays: 90,
      forecastDays: 14,
      insightsLimit: 10,
      topLimit: 5,
    }),
    aiWorkspaceService.getWorkspaceDashboard({
      requestedByUsuarioId,
      forceRefresh: false,
    }),
  ]);

  const cards = buildCardsByIntent(intent, reportData, priorities);
  const priorityActions = buildPriorityActions(priorities, intent);
  const evidence = buildEvidenceByIntent(intent, reportData, priorities);

  let answer = buildFallbackAnswer({
    intent,
    reportData,
    priorities,
    cards,
  });
  let usedLlm = false;

  try {
    const llmAnswer = await tryLlmAnswer({
      intent,
      question: resolvedQuestion,
      cards,
      evidence,
      reportData,
      priorities,
    });
    if (llmAnswer && !isWeakLlmAnswer(llmAnswer)) {
      answer = llmAnswer;
      usedLlm = true;
    }
  } catch (error) {
    logger.warn({ err: error }, '[executive-assistant] llm fallback');
  }

  return {
    generated_at: new Date().toISOString(),
    question: resolvedQuestion,
    intent,
    answer,
    used_llm: usedLlm,
    range: reportData?.range || null,
    cards,
    priority_actions: priorityActions,
    evidence,
    priorities_summary: priorities?.summary || null,
  };
}

module.exports = {
  PRESET_LABELS,
  buildExecutiveAssistantReply,
  __test__: {
    inferIntent,
    buildFallbackAnswer,
    buildCardsByIntent,
    buildEvidenceByIntent,
    isWeakLlmAnswer,
  },
};
