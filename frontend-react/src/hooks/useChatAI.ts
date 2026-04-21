import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api';

export type ChatMessage = {
  id:        string;
  role:      'user' | 'assistant';
  content:   string;
  timestamp: Date;
  loading?:  boolean;
};

type HistoryEntry = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  '¿Cómo vamos hoy? Mostrame el resumen del día',
  '¿Cuánto vendimos este mes vs el mes pasado?',
  '¿Qué productos tienen stock crítico?',
  '¿Cuáles son los 5 productos más rentables del trimestre?',
  '¿Qué clientes tienen deuda pendiente?',
  '¿Cómo evolucionaron las ventas este año mes a mes?',
  '¿Qué categoría genera más ingresos?',
  '¿Cómo le fue al negocio financieramente este mes?',
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useChatAI() {
  const [messages,  setMessages]  = useState<ChatMessage[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  // Historial en formato que acepta el backend (sin metadatos de UI)
  const historyRef = useRef<HistoryEntry[]>([]);
  const sessionRef = useRef<string | null>(null);

  const sendMessage = useCallback(async (userText: string) => {
    if (!userText.trim() || loading) return;

    const text    = userText.trim().slice(0, 2000);
    const userMsg: ChatMessage = {
      id:        uid(),
      role:      'user',
      content:   text,
      timestamp: new Date(),
    };
    const placeholderMsg: ChatMessage = {
      id:        uid(),
      role:      'assistant',
      content:   '',
      timestamp: new Date(),
      loading:   true,
    };

    setMessages((prev) => [...prev, userMsg, placeholderMsg]);
    setLoading(true);
    setError(null);

    try {
      const result = await apiFetch<{ reply: string; history: HistoryEntry[]; session_id?: string | null }>(
        '/api/chat/message',
        {
          method: 'POST',
          body:   JSON.stringify({ message: text, history: historyRef.current.slice(-20), session_id: sessionRef.current }),
        }
      );

      // Actualizar historial interno con lo que devuelve el server
      if (Array.isArray(result.history)) {
        historyRef.current = result.history.slice(-40);
      }
      if (result.session_id) {
        sessionRef.current = result.session_id;
      }

      const assistantMsg: ChatMessage = {
        id:        uid(),
        role:      'assistant',
        content:   result.reply,
        timestamp: new Date(),
      };

      // Reemplazar el placeholder con la respuesta real
      setMessages((prev) => {
        const withoutPlaceholder = prev.filter((m) => !m.loading);
        return [...withoutPlaceholder, assistantMsg];
      });
    } catch (err: any) {
      const errMsg =
        err?.message?.includes('401')
          ? 'Sesión expirada. Volvé a iniciar sesión.'
          : 'No se pudo obtener respuesta del agente. Intentá de nuevo.';
      setError(errMsg);

      setMessages((prev) => {
        const withoutPlaceholder = prev.filter((m) => !m.loading);
        return [
          ...withoutPlaceholder,
          {
            id:        uid(),
            role:      'assistant',
            content:   `⚠️ ${errMsg}`,
            timestamp: new Date(),
          },
        ];
      });
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    historyRef.current = [];
    sessionRef.current = null;
  }, []);

  return {
    messages,
    loading,
    error,
    suggestions: SUGGESTIONS,
    sendMessage,
    clearChat,
  };
}
