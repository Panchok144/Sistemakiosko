import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50 text-center">
          <div className="mb-4 rounded-full bg-rose-100 p-4">
            <span className="text-4xl">⚠️</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Ups, algo salió mal</h1>
          <p className="mt-2 max-w-md text-slate-500">
            Ocurrió un error inesperado en la interfaz. Intenta recargar la página para volver a la normalidad.
          </p>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-indigo-600 px-6 py-2 font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Recargar Página
            </button>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.href = '/';
              }}
              className="rounded-xl border border-slate-300 bg-white px-6 py-2 font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              Cerrar Sesión Segura
            </button>
          </div>
          <details className="mt-8 max-w-lg text-left text-xs text-slate-400">
            <summary className="cursor-pointer font-semibold uppercase tracking-wider text-slate-500">Detalles técnicos</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-800 p-3 text-rose-300 whitespace-pre-wrap">
              {this.state.error?.toString()}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}
