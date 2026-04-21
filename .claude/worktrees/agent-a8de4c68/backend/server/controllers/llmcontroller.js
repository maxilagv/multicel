const { query } = require('../db/pg');
const llm = require('../services/llmService');
const ai = require('../services/aiService');

async function crmSuggestion(req, res) {
  try {
    if (process.env.AI_LLM_ENABLED !== 'true') {
      return res.status(503).json({ error: 'AI LLM deshabilitada' });
    }

    const { oportunidad_id } = req.body || {};
    if (!oportunidad_id) {
      return res.status(400).json({ error: 'oportunidad_id es requerido' });
    }

    const oppId = Number(oportunidad_id);
    if (!Number.isFinite(oppId) || oppId <= 0) {
      return res.status(400).json({ error: 'oportunidad_id inválido' });
    }

    const { rows: oppRows } = await query(
      `SELECT o.id,
              o.cliente_id,
              c.nombre AS cliente_nombre,
              o.titulo,
              o.fase,
              o.valor_estimado,
              o.probabilidad
         FROM crm_oportunidades o
         LEFT JOIN clientes c ON c.id = o.cliente_id
        WHERE o.id = $1`,
      [oppId]
    );

    if (!oppRows.length) {
      return res.status(404).json({ error: 'Oportunidad no encontrada' });
    }

    const oportunidad = oppRows[0];

    const { rows: actRows } = await query(
      `SELECT a.id,
              a.tipo,
              a.asunto,
              a.descripcion,
              a.estado,
              a.fecha_hora
         FROM crm_actividades a
        WHERE a.oportunidad_id = $1
        ORDER BY a.fecha_hora DESC
        LIMIT 20`,
      [oppId]
    );

    const suggestion = await llm.generateCrmSuggestion({
      oportunidad,
      actividades: actRows,
    });

    return res.json({ suggestion });
  } catch (err) {
    console.error('Error en crmSuggestion:', err);
    return res.status(500).json({ error: 'No se pudo generar la sugerencia con IA' });
  }
}

async function ticketReply(req, res) {
  try {
    if (process.env.AI_LLM_ENABLED !== 'true') {
      return res.status(503).json({ error: 'AI LLM deshabilitada' });
    }

    const { ticket_id } = req.body || {};
    if (!ticket_id) {
      return res.status(400).json({ error: 'ticket_id es requerido' });
    }

    const tId = Number(ticket_id);
    if (!Number.isFinite(tId) || tId <= 0) {
      return res.status(400).json({ error: 'ticket_id inválido' });
    }

    const { rows: ticketRows } = await query(
      `SELECT t.id,
              t.asunto,
              t.descripcion,
              t.estado,
              t.prioridad,
              t.tipo,
              c.nombre AS cliente_nombre
         FROM tickets t
         LEFT JOIN clientes c ON c.id = t.cliente_id
        WHERE t.id = $1`,
      [tId]
    );

    if (!ticketRows.length) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    const ticket = ticketRows[0];

    const { rows: eventos } = await query(
      `SELECT e.id,
              e.tipo,
              e.detalle,
              e.creado_en
         FROM ticket_eventos e
        WHERE e.ticket_id = $1
        ORDER BY e.creado_en ASC
        LIMIT 50`,
      [tId]
    );

    const reply = await llm.generateTicketReply({ ticket, eventos });

    return res.json({ reply });
  } catch (err) {
    console.error('Error en ticketReply:', err);
    return res.status(500).json({ error: 'No se pudo generar la respuesta con IA' });
  }
}

async function explainForecast(req, res) {
  try {
    if (process.env.AI_LLM_ENABLED !== 'true') {
      return res.status(503).json({ error: 'AI LLM deshabilitada' });
    }

    const { producto_id, history_days, forecast_days } = req.body || {};
    if (!producto_id) {
      return res.status(400).json({ error: 'producto_id es requerido' });
    }

    const id = Number(producto_id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'producto_id inválido' });
    }

    const historyDays = Math.max(7, Number(history_days || 90));
    const forecastDays = Math.max(1, Number(forecast_days || 14));

    const detail = await ai.forecastDetail({
      productoId: id,
      historyDays,
      forecastDays,
    });

    const { rows: invRows } = await query(
      `SELECT COALESCE(cantidad_disponible,0) AS disponible
         FROM inventario
        WHERE producto_id = $1`,
      [id]
    );
    const disponible = invRows.length ? Number(invRows[0].disponible || 0) : 0;

    const lines = [];
    lines.push(`Producto: ${detail.producto_nombre}`);
    lines.push(`Promedio diario estimado: ${detail.daily_avg}`);
    lines.push(`Días de historia: ${historyDays}`);
    lines.push(`Horizonte de pronóstico: ${forecastDays}`);
    lines.push(`Stock disponible actual: ${disponible}`);
    lines.push('');
    lines.push('Historial (últimos puntos):');
    const histSlice = detail.history.slice(-10);
    histSlice.forEach((h) => {
      const d = new Date(h.dia);
      const ds = Number.isNaN(d.getTime()) ? String(h.dia) : d.toISOString().slice(0, 10);
      lines.push(`- ${ds}: ${h.unidades} unidades`);
    });
    lines.push('');
    lines.push('Pronóstico (primeros puntos):');
    const forecastSlice = detail.forecast.slice(0, 10);
    forecastSlice.forEach((f) => {
      const d = new Date(f.dia);
      const ds = Number.isNaN(d.getTime()) ? String(f.dia) : d.toISOString().slice(0, 10);
      lines.push(`- ${ds}: ${f.unidades} unidades estimadas`);
    });

    const messages = [
      {
        role: 'system',
        content:
          'Eres un analista de inventario y demanda en español. ' +
          'Explicas de forma breve, clara y accionable.',
      },
      {
        role: 'user',
        content:
          'Con estos datos explica la situación de demanda y stock y da una recomendación práctica:\n\n' +
          lines.join('\n'),
      },
    ];

    const explanation = await llm.callLLM({ messages, maxTokens: 600 });

    return res.json({ explanation });
  } catch (err) {
    console.error('Error en explainForecast:', err);
    if (err && typeof err.message === 'string' && err.message.includes('No AI provider available')) {
      return res
        .status(503)
        .json({ error: 'No hay proveedor de IA disponible (revisa las API keys y el crédito de OpenAI/Gemini/DeepSeek).' });
    }
    return res.status(500).json({ error: 'No se pudo generar la explicación con IA' });
  }
}

module.exports = {
  crmSuggestion,
  ticketReply,
  explainForecast,
};
