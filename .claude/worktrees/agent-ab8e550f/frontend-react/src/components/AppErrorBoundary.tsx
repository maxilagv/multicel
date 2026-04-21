import React from 'react';

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export default class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Error inesperado en la aplicacion',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      console.error('[AppErrorBoundary]', error, info);
    } catch {
      // ignore logging errors
    }
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-xl border border-rose-500/40 bg-slate-900/80 p-5">
            <div className="text-sm uppercase tracking-[0.2em] text-rose-300 mb-2">Error de interfaz</div>
            <div className="text-sm text-slate-200 mb-4">
              Se produjo un error al renderizar la aplicacion.
            </div>
            <div className="text-xs text-slate-400 break-words mb-5">
              {this.state.message || 'Sin detalle disponible'}
            </div>
            <button
              type="button"
              className="h-9 px-3 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-xs"
              onClick={this.handleReload}
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
