const http = require('http');
const https = require('https');
const { URL } = require('url');

const AI_ENABLED = process.env.AI_LLM_ENABLED === 'true';
const PROVIDER_ORDER = (process.env.AI_PROVIDER_ORDER || 'openai,gemini,deepseek,local')
  .split(',')
  .map((p) => p.trim().toLowerCase())
  .filter(Boolean);

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-pro';
const LOCAL_AI_MODE = (process.env.LOCAL_AI_MODE || '').trim().toLowerCase();
const LOCAL_AI_BASE_URL = process.env.LOCAL_AI_BASE_URL || process.env.LOCAL_AI_URL;
const LOCAL_AI_MODEL = process.env.LOCAL_AI_MODEL;

const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 15000);

function withTimeout(promise, ms = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('AI provider timeout')), ms);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function httpRequest(rawUrl, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(rawUrl);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options = {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers,
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
            text: data,
          });
        });
      });

      req.on('error', (err) => reject(err));

      if (body) {
        req.write(body);
      }
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function callOpenAI({ messages, model = 'gpt-4o-mini', maxTokens = 512 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const body = JSON.stringify({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.2,
  });

  const res = await withTimeout(
    httpRequest('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    })
  );

  if (!res.ok) {
    throw new Error(`OpenAI error: ${res.status} ${res.text || ''}`.trim());
  }

  const data = JSON.parse(res.text || '{}');
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('OpenAI: empty response');
  return content;
}

async function callGemini({ messages, model = GEMINI_MODEL, maxTokens = 512 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const contents = (messages || []).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = JSON.stringify({
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.2,
    },
  });

  // Usar la API v1 (modelos 1.5 requieren v1, no v1beta)
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

  const res = await withTimeout(
    httpRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    })
  );

  if (!res.ok) {
    throw new Error(`Gemini error: ${res.status} ${res.text || ''}`.trim());
  }

  const data = JSON.parse(res.text || '{}');
  const text = data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  if (!text) throw new Error('Gemini: empty response');
  return text;
}

async function callDeepSeek({ messages, maxTokens = 512 }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');

  const url = process.env.DEEPSEEK_CHAT_COMPLETIONS_URL;
  if (!url) {
    throw new Error('DEEPSEEK_CHAT_COMPLETIONS_URL not configured');
  }

  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  const body = JSON.stringify({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.2,
  });

  const res = await withTimeout(
    httpRequest(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    })
  );

  if (!res.ok) {
    throw new Error(`DeepSeek error: ${res.status} ${res.text || ''}`.trim());
  }

  const data = JSON.parse(res.text || '{}');
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('DeepSeek: empty response');
  return content;
}

async function callOpenAICompatible({
  baseUrl,
  apiKey,
  messages,
  model,
  maxTokens = 512,
}) {
  if (!baseUrl) throw new Error('LOCAL_AI_BASE_URL not configured');
  if (!apiKey) throw new Error('LOCAL_AI_API_KEY not configured');
  if (!model) throw new Error('LOCAL_AI_MODEL not configured');

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = JSON.stringify({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.2,
  });

  const res = await withTimeout(
    httpRequest(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    })
  );

  if (!res.ok) {
    throw new Error(`Local OpenAI-compatible error: ${res.status} ${res.text || ''}`.trim());
  }

  const data = JSON.parse(res.text || '{}');
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('Local OpenAI-compatible: empty response');
  return content;
}

async function callLocal({ messages, maxTokens = 512 }) {
  if (LOCAL_AI_MODE === 'openai' || LOCAL_AI_MODE === 'openai-compatible' || LOCAL_AI_MODE === 'jan') {
    return callOpenAICompatible({
      baseUrl: LOCAL_AI_BASE_URL,
      apiKey: process.env.LOCAL_AI_API_KEY,
      messages,
      model: LOCAL_AI_MODEL,
      maxTokens,
    });
  }

  const baseUrl = LOCAL_AI_BASE_URL;
  if (!baseUrl) throw new Error('LOCAL_AI_BASE_URL not configured');

  const url = `${baseUrl.replace(/\/$/, '')}/chat`;
  const body = JSON.stringify({ messages, max_tokens: maxTokens });

  const res = await withTimeout(
    httpRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    })
  );

  if (!res.ok) {
    throw new Error(`Local AI error: ${res.status} ${res.text || ''}`.trim());
  }

  const data = JSON.parse(res.text || '{}');
  if (!data || typeof data.content !== 'string') {
    throw new Error('Local AI: invalid response shape');
  }
  return data.content;
}

async function callLLM({ messages, maxTokens = 512 }) {
  if (!AI_ENABLED) {
    throw new Error('AI LLM is disabled (AI_LLM_ENABLED=false)');
  }
  if (!Array.isArray(messages) || !messages.length) {
    throw new Error('messages is required');
  }

  const errors = [];
  for (const provider of PROVIDER_ORDER) {
    try {
      if (provider === 'openai') {
        return await callOpenAI({ messages, maxTokens });
      }
      if (provider === 'gemini') {
        return await callGemini({ messages, maxTokens });
      }
      if (provider === 'deepseek') {
        return await callDeepSeek({ messages, maxTokens });
      }
      if (provider === 'local') {
        return await callLocal({ messages, maxTokens });
      }
    } catch (err) {
      errors.push(`${provider}: ${err.message}`);
    }
  }

  throw new Error(`No AI provider available. Errors: ${errors.join(' | ')}`);
}

async function generateCrmSuggestion({ oportunidad, actividades }) {
  const opp = oportunidad || {};
  const acts = actividades || [];

  const lines = [];
  lines.push(`Oportunidad: ${opp.titulo || 'Sin título'}`);
  lines.push(`Cliente: ${opp.cliente_nombre || 'Desconocido'}`);
  lines.push(`Fase: ${opp.fase || 'sin fase'}`);
  lines.push(`Valor estimado: ${opp.valor_estimado != null ? opp.valor_estimado : 'n/d'}`);
  lines.push(`Probabilidad: ${opp.probabilidad != null ? opp.probabilidad : 'n/d'}`);
  lines.push('');
  lines.push('Actividades recientes:');
  if (!acts.length) {
    lines.push('- (sin actividades registradas)');
  } else {
    acts.forEach((a) => {
      lines.push(`- [${a.estado}] ${a.tipo} - ${a.asunto || ''}`);
    });
  }

  const userSummary = lines.join('\n');

  const messages = [
    {
      role: 'system',
      content:
        'Eres un asistente de CRM en español. Respondes de forma breve y accionable. ' +
        'Devuelve siempre una respuesta en markdown con secciones claras: "Resumen", "Próximo paso sugerido" y "Mensaje sugerido al cliente".',
    },
    {
      role: 'user',
      content: `Con estos datos de una oportunidad, dime cómo avanzar:\n\n${userSummary}`,
    },
  ];

  const content = await callLLM({ messages, maxTokens: 600 });
  return content;
}

async function generateTicketReply({ ticket, eventos }) {
  const t = ticket || {};
  const evs = eventos || [];

  const lines = [];
  lines.push(`Ticket: ${t.asunto || 'Sin asunto'}`);
  lines.push(`Cliente: ${t.cliente_nombre || 'Desconocido'}`);
  lines.push(`Estado actual: ${t.estado || 'n/d'}`);
  lines.push(`Prioridad: ${t.prioridad || 'n/d'}`);
  lines.push(`Tipo: ${t.tipo || 'n/d'}`);
  lines.push('');
  lines.push('Descripción del problema:');
  lines.push(t.descripcion || '(sin descripción)');
  lines.push('');
  lines.push('Historial de eventos:');
  if (!evs.length) {
    lines.push('- (sin eventos registrados)');
  } else {
    evs.forEach((e) => {
      lines.push(`- [${e.tipo}] ${e.detalle || ''}`);
    });
  }

  const userSummary = lines.join('\n');

  const messages = [
    {
      role: 'system',
      content:
        'Eres un asistente de soporte postventa en español. ' +
        'Redactas respuestas amables, claras y profesionales para clientes. ' +
        'Incluye una sección "Resumen interno" y otra "Respuesta sugerida al cliente".',
    },
    {
      role: 'user',
      content:
        'Con estos datos del ticket, redacta una respuesta sugerida al cliente y un breve resumen interno:\n\n' +
        userSummary,
    },
  ];

  const content = await callLLM({ messages, maxTokens: 600 });
  return content;
}

async function generateExecutiveReportNarrative({ data }) {
  const payload = JSON.stringify(data || {}, null, 2);

  const messages = [
    {
      role: 'system',
      content:
        'Eres un director financiero para PYMEs. Escribes en espanol claro, directo y accionable. ' +
        'Usa solo los datos del JSON provisto. No inventes numeros ni porcentajes. ' +
        'Si falta un dato, indicalo explicitamente. ' +
        'Devuelve una respuesta en markdown con estas secciones: ' +
        '"Resumen ejecutivo", "Riesgos criticos", "Oportunidades", "Acciones proximos 7 dias", "Datos clave".',
    },
    {
      role: 'user',
      content:
        'Usa el siguiente JSON como unica fuente de verdad. ' +
        'No agregues datos externos ni supuestos. Responde en español:\n\n' +
        payload,
    },
  ];

  const content = await callLLM({ messages, maxTokens: 900 });
  return content;
}

async function generatePredictionsNarrative({ data }) {
  const payload = JSON.stringify(data || {}, null, 2);

  const messages = [
    {
      role: 'system',
      content:
        'Eres un analista de operaciones y stock para PYMEs. Respondes en espanol claro y accionable. ' +
        'Usa solo los datos del JSON provisto. No inventes numeros. ' +
        'Si falta un dato, indicalo. ' +
        'Devuelve markdown con secciones: "Resumen", "Riesgos de stock", "Precios a revisar", "Anomalias", "Acciones sugeridas".',
    },
    {
      role: 'user',
      content:
        'Usa el siguiente JSON como unica fuente de verdad para resumir predicciones y alertas:\n\n' +
        payload,
    },
  ];

  const content = await callLLM({ messages, maxTokens: 800 });
  return content;
}

module.exports = {
  callLLM,
  generateCrmSuggestion,
  generateTicketReply,
  generateExecutiveReportNarrative,
  generatePredictionsNarrative,
};
