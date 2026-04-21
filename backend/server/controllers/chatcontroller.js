'use strict';

const chatService = require('../services/chatService');
const agentRuntimeService = require('../services/agentRuntimeService');
const { buildChatReply } = require('../services/agentContracts');
const logger      = require('../lib/logger');

function isChatBridgeEnabled() {
  const raw = String(process.env.AI_AGENT_CHAT_BRIDGE_ENABLED || 'true').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on';
}

function currentUserId(req) {
  return req?.user?.sub ? Number(req.user.sub) : null;
}

function currentUserRole(req) {
  return req?.authUser?.rol || req?.user?.role || null;
}

/**
 * POST /api/chat/message
 * Body: { message: string, history?: Array<{ role: string, content: string }> }
 * Response: { reply: string, history: Array }
 */
async function sendMessage(req, res) {
  try {
    const { message, history, session_id: sessionId } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'El campo "message" es requerido' });
    }

    const trimmedMessage = message.trim().slice(0, 2000);

    // Validar y sanitizar historial
    const safeHistory = Array.isArray(history)
      ? history
          .filter((h) => h && typeof h.role === 'string' && typeof h.content === 'string')
          .map((h) => ({ role: h.role, content: h.content.slice(0, 2000) }))
          .slice(-20)
      : [];

    if (isChatBridgeEnabled()) {
      const envelope = await agentRuntimeService.runAgent({
        input: {
          surface: 'widget',
          question: trimmedMessage,
          session_id: sessionId || null,
        },
        requestedByUsuarioId: currentUserId(req),
        requestedByRole: currentUserRole(req),
      });
      const reply = buildChatReply(envelope);
      const nextHistory = [...safeHistory, { role: 'user', content: trimmedMessage }, { role: 'assistant', content: reply }].slice(-40);
      return res.json({
        reply,
        history: nextHistory,
        session_id: envelope?.session?.id || null,
        agent: envelope,
      });
    }

    const result = await chatService.chat({
      message: trimmedMessage,
      history: safeHistory,
    });

    return res.json(result);
  } catch (err) {
    logger.error({ err }, 'chatController: error procesando mensaje');
    return res.status(500).json({ error: 'Error al procesar el mensaje' });
  }
}

/**
 * GET /api/chat/models
 * Diagnóstico: lista los modelos Gemini disponibles para la API key configurada.
 */
async function listModels(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY no configurada' });

  try {
    const https = require('https');
    const data  = await new Promise((resolve, reject) => {
      https.get(
        `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}&pageSize=50`,
        (r) => {
          let body = '';
          r.on('data', (c) => { body += c; });
          r.on('end', () => resolve(JSON.parse(body || '{}')));
        }
      ).on('error', reject);
    });

    const models = (data.models || []).map((m) => ({
      name:    m.name,
      methods: m.supportedGenerationMethods,
    }));
    return res.json({ models });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { sendMessage, listModels };
