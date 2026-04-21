import { createPortal } from 'react-dom';
import { Keyboard, Printer, RefreshCcw, Search, ShoppingBasket, X } from 'lucide-react';

type KeyboardShortcutsDialogProps = {
  open: boolean;
  onClose: () => void;
};

const SHORTCUTS = [
  {
    id: 'f1',
    shortcut: 'F1',
    label: 'Caja rapida',
    detail: 'Abre la pantalla simple para vender sin formularios largos.',
    icon: ShoppingBasket,
  },
  {
    id: 'f2',
    shortcut: 'F2',
    label: 'Nueva venta',
    detail: 'Abre el modulo completo de ventas con el formulario listo.',
    icon: Keyboard,
  },
  {
    id: 'f3',
    shortcut: 'F3',
    label: 'Buscar producto',
    detail: 'Lleva el foco al buscador principal de Caja Rapida.',
    icon: Search,
  },
  {
    id: 'f5',
    shortcut: 'F5',
    label: 'Actualizar datos',
    detail: 'Recarga la pantalla actual para ver la informacion mas reciente.',
    icon: RefreshCcw,
  },
  {
    id: 'print',
    shortcut: 'Ctrl + P',
    label: 'Imprimir',
    detail: 'Abre la impresion del ticket o de la vista actual.',
    icon: Printer,
  },
  {
    id: 'help',
    shortcut: '?',
    label: 'Ver atajos',
    detail: 'Abre este panel de ayuda desde cualquier pantalla no editable.',
    icon: Keyboard,
  },
  {
    id: 'escape',
    shortcut: 'Esc',
    label: 'Cerrar',
    detail: 'Cierra paneles y modales que escuchen el evento global de salida.',
    icon: X,
  },
] as const;

export default function KeyboardShortcutsDialog({
  open,
  onClose,
}: KeyboardShortcutsDialogProps) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar panel de atajos"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Panel de atajos de teclado"
        className="relative z-10 w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/95 shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="border-b border-white/10 bg-gradient-to-r from-amber-500/15 via-transparent to-cyan-500/15 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.26em] text-amber-200">
                Flujo sin mouse
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-slate-50">
                Atajos para operar mas rapido
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-300">
                Pensados para caja, mostrador y escritorio. Funcionan mejor cuando quieres vender sin navegar modulo por modulo.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar panel"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="grid gap-3 px-6 py-6 md:grid-cols-2">
          {SHORTCUTS.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">{item.label}</h3>
                      <kbd className="rounded-lg border border-white/15 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-200">
                        {item.shortcut}
                      </kbd>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>,
    document.body,
  );
}
