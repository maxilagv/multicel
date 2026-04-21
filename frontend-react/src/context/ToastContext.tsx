import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  duration?: number;
}

interface ToastApi {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
}

// ─── State ────────────────────────────────────────────────────────────────────

type Action =
  | { type: 'ADD'; toast: Toast }
  | { type: 'REMOVE'; id: string };

function reducer(state: Toast[], action: Action): Toast[] {
  switch (action.type) {
    case 'ADD':
      return [...state.slice(-4), action.toast]; // máximo 5 toasts visibles
    case 'REMOVE':
      return state.filter((t) => t.id !== action.id);
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastApi | null>(null);

// ─── Styles ───────────────────────────────────────────────────────────────────

const kindStyles: Record<ToastKind, { bar: string; icon: string; label: string }> = {
  success: {
    bar: 'bg-emerald-500',
    icon: '✓',
    label: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  error: {
    bar: 'bg-rose-500',
    icon: '✕',
    label: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },
  warning: {
    bar: 'bg-amber-500',
    icon: '⚠',
    label: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  info: {
    bar: 'bg-cyan-500',
    icon: 'i',
    label: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },
};

// ─── Toast Item ───────────────────────────────────────────────────────────────

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const s = kindStyles[toast.kind];
  return (
    <div
      role="alert"
      className="relative flex items-start gap-3 rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-sm px-4 py-3 w-full max-w-sm overflow-hidden"
      style={{ animation: 'slideInRight 0.2s ease-out' }}
    >
      <div className={`absolute left-0 inset-y-0 w-1 rounded-l-xl ${s.bar}`} />
      <span
        className={`mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[11px] font-bold border ${s.label}`}
      >
        {s.icon}
      </span>
      <p className="flex-1 text-sm text-slate-100 leading-snug pr-2">{toast.message}</p>
      <button
        onClick={onDismiss}
        aria-label="Cerrar notificación"
        className="flex-shrink-0 text-slate-500 hover:text-slate-200 transition-colors text-lg leading-none mt-0.5"
      >
        ×
      </button>
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

let _counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(reducer, []);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    dispatch({ type: 'REMOVE', id });
  }, []);

  const add = useCallback((kind: ToastKind, message: string, duration = 4000) => {
    const id = `toast-${++_counter}`;
    dispatch({ type: 'ADD', toast: { id, kind, message, duration } });
    const timer = setTimeout(() => dismiss(id), duration);
    timers.current.set(id, timer);
  }, [dismiss]);

  const api: ToastApi = {
    success: (m, d) => add('success', m, d),
    error: (m, d) => add('error', m, d),
    info: (m, d) => add('info', m, d),
    warning: (m, d) => add('warning', m, d),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          aria-atomic="false"
          className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 items-end"
        >
          <style>{`
            @keyframes slideInRight {
              from { opacity: 0; transform: translateX(24px); }
              to   { opacity: 1; transform: translateX(0); }
            }
          `}</style>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
