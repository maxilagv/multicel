import { useState, useRef, useEffect, Fragment } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MessageCircle,
  X,
  Send,
  Trash2,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { useChatAI, type ChatMessage } from '../hooks/useChatAI';

// ─── Markdown renderer simple ─────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode[] {
  // Detectar **bold** y *italic*
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i} className="text-slate-300">{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="space-y-0.5 my-1">
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  lines.forEach((line, i) => {
    // Lista con - o *
    if (/^[-*]\s/.test(line)) {
      listItems.push(
        <li key={i} className="flex gap-2 items-start">
          <span className="text-violet-400 mt-0.5 shrink-0">•</span>
          <span>{renderInline(line.slice(2))}</span>
        </li>
      );
      return;
    }

    // Flush lista antes de otro tipo de elemento
    flushList();

    // Encabezados
    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="font-semibold text-white text-sm mt-2 mb-0.5">{renderInline(line.slice(4))}</h4>);
      return;
    }
    if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="font-bold text-white text-sm mt-2 mb-0.5">{renderInline(line.slice(3))}</h3>);
      return;
    }
    if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="font-bold text-white text-base mt-2 mb-1">{renderInline(line.slice(2))}</h2>);
      return;
    }

    // Línea vacía → separador visual
    if (!line.trim()) {
      elements.push(<div key={i} className="h-1.5" />);
      return;
    }

    // Párrafo normal
    elements.push(
      <p key={i} className="leading-relaxed">
        {renderInline(line)}
      </p>
    );
  });

  flushList();

  return <div className="space-y-0.5 text-sm text-slate-200">{elements}</div>;
}

// ─── Bubble de mensaje ────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {/* Avatar asistente */}
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center mt-0.5">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
      )}

      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
          isUser
            ? 'bg-violet-600 text-white rounded-tr-sm'
            : 'bg-white/8 border border-white/10 rounded-tl-sm'
        }`}
      >
        {msg.loading ? (
          <div className="flex gap-1 items-center py-0.5 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
          </div>
        ) : isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <MarkdownMessage content={msg.content} />
        )}
      </div>

      {/* Avatar usuario */}
      {isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center mt-0.5 text-xs font-bold text-white">
          Vos
        </div>
      )}
    </motion.div>
  );
}

// ─── Pantalla de bienvenida ───────────────────────────────────────────────────
function WelcomeScreen({ suggestions, onSuggest }: { suggestions: string[]; onSuggest: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-6 text-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
        <Sparkles className="w-7 h-7 text-violet-400" />
      </div>
      <div>
        <p className="font-semibold text-white text-base">Agente Kaisen</p>
        <p className="text-slate-400 text-xs mt-1 max-w-[220px]">
          Preguntame sobre ventas, stock, clientes, finanzas o cualquier dato del negocio.
        </p>
      </div>
      <div className="w-full grid grid-cols-1 gap-2 mt-2">
        {suggestions.slice(0, 4).map((s) => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            className="text-left text-xs bg-white/5 hover:bg-white/10 border border-white/10 hover:border-violet-500/40 rounded-xl px-3 py-2 text-slate-300 hover:text-white transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── ChatWidget principal ─────────────────────────────────────────────────────
export default function ChatWidget() {
  const [open,  setOpen]  = useState(false);
  const [input, setInput] = useState('');
  const { messages, loading, suggestions, sendMessage, clearChat } = useChatAI();
  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const hasMessages = messages.length > 0;

  // Auto-scroll al último mensaje
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  // Focus input cuando abre
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  // Cerrar con Escape
  useEffect(() => {
    const handler = () => setOpen(false);
    window.addEventListener('kaisen:escape', handler);
    return () => window.removeEventListener('kaisen:escape', handler);
  }, []);

  const handleSend = () => {
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (s: string) => {
    sendMessage(s);
  };

  return (
    <>
      {/* Panel del chat */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed bottom-20 right-4 sm:right-6 z-50 w-[min(360px,calc(100vw-2rem))] h-[520px] flex flex-col rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
            style={{ background: 'rgba(10,12,24,0.97)', backdropFilter: 'blur(20px)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/10 bg-white/3 shrink-0">
              <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold leading-none">Agente Kaisen</p>
                <p className="text-slate-400 text-xs mt-0.5">Datos reales del negocio</p>
              </div>
              <div className="flex items-center gap-1">
                {hasMessages && (
                  <button
                    onClick={clearChat}
                    title="Limpiar conversación"
                    className="p-1.5 rounded-lg hover:bg-white/8 text-slate-400 hover:text-white transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/8 text-slate-400 hover:text-white transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scroll-smooth">
              {!hasMessages ? (
                <WelcomeScreen suggestions={suggestions} onSuggest={handleSuggestion} />
              ) : (
                messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 px-3 pb-3 pt-2 border-t border-white/8">
              <div className="flex gap-2 items-end bg-white/6 border border-white/12 rounded-xl px-3 py-2 focus-within:border-violet-500/50 transition-colors">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Preguntame sobre tu negocio…"
                  rows={1}
                  disabled={loading}
                  className="flex-1 resize-none bg-transparent text-white text-sm placeholder:text-slate-500 outline-none leading-relaxed max-h-28 overflow-y-auto disabled:opacity-50"
                  style={{ scrollbarWidth: 'none' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="shrink-0 w-7 h-7 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
              <p className="text-slate-600 text-[10px] mt-1.5 text-center">
                Enter para enviar · Shift+Enter nueva línea
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Botón flotante */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        title={open ? 'Cerrar agente' : 'Abrir agente'}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-5 right-4 sm:right-6 z-50 w-12 h-12 rounded-2xl bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-900/50 flex items-center justify-center transition-colors"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="w-5 h-5 text-white" />
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <MessageCircle className="w-5 h-5 text-white" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dot de online */}
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900" />
      </motion.button>
    </>
  );
}
