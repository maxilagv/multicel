import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { getErrorDetails } from '../lib/errors';

type PageErrorBoundaryState = {
  hasError: boolean;
  message: string;
  technicalMessage: string;
};

type PageErrorBoundaryProps = {
  children: React.ReactNode;
  pageName?: string;
};

export default class PageErrorBoundary extends React.Component<
  PageErrorBoundaryProps,
  PageErrorBoundaryState
> {
  constructor(props: PageErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      technicalMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    const details = getErrorDetails(error);
    return {
      hasError: true,
      message: details.message,
      technicalMessage: details.technicalMessage,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      console.error('[PageErrorBoundary]', error, info);
    } catch {
      // ignore
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      message: '',
      technicalMessage: '',
    });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section className="app-card p-6 sm:p-8">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-amber-200">
            <AlertTriangle size={14} />
            Recuperacion de pantalla
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-slate-50">
            {this.props.pageName || 'Esta pagina'} tuvo un problema.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
            {this.state.message ||
              'No pudimos renderizar esta vista correctamente. Puedes reintentar sin perder el resto de la aplicacion.'}
          </p>
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400">
            Detalle tecnico: {this.state.technicalMessage || 'Sin detalle disponible'}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
            >
              <RotateCcw size={16} />
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.location.protocol === 'file:') {
                  window.location.hash = '/app/dashboard';
                  return;
                }
                window.location.assign('/app/dashboard');
              }}
              className="inline-flex min-h-[44px] items-center rounded-xl border border-white/15 px-4 text-sm text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      </section>
    );
  }
}
