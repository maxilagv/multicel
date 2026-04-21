import { useEffect, useState, type FormEvent } from 'react';
import { Api } from '../lib/api';
import Alert from '../components/Alert';

export default function Configuracion() {
  const [dolarBlue, setDolarBlue] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await Api.getDolarBlue();
        if (!mounted) return;
        const valor =
          data && typeof (data as any).valor === 'number'
            ? (data as any).valor
            : null;
        if (valor != null) {
          setDolarBlue(String(valor));
        }
      } catch (e) {
        if (!mounted) return;
        setError(
          e instanceof Error
            ? e.message
            : 'No se pudo cargar el dólar blue'
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  async function onSubmitDolar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const valorNum = Number(dolarBlue);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      setError('Ingresá un valor de dólar válido mayor a 0');
      return;
    }
    setSaving(true);
    try {
      await Api.setDolarBlue(valorNum);
      setSuccess('Dólar blue actualizado correctamente');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudo guardar el valor de dólar'
      );
    } finally {
      setSaving(false);
    }
  }

  async function onResetPanel() {
    setResetError(null);
    setResetSuccess(null);
    const confirmed = window.confirm(
      'Seguro que quieres borrar todos los datos del panel (clientes, productos, ventas, etc.)? Esta accion no se puede deshacer.'
    );
    if (!confirmed) return;
    setResetting(true);
    try {
      await Api.resetPanelData();
      setResetSuccess('Datos del panel limpiados correctamente.');
    } catch (e) {
      setResetError(
        e instanceof Error
          ? e.message
          : 'No se pudieron limpiar los datos del panel'
      );
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="app-title">Configuracion</div>
        <div className="app-subtitle">Parametros base del sistema</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">Datos del negocio</div>
          <div className="space-y-3">
            <input
              className="input-modern w-full text-sm"
              placeholder="Nombre del comercio (opcional)"
            />
            <input
              className="input-modern w-full text-sm"
              placeholder="Email de contacto (opcional)"
            />
            <input
              className="input-modern w-full text-sm"
              placeholder="Moneda de facturación (ej: ARS)"
            />
          </div>
        </div>

        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">Branding</div>
          <div className="space-y-3">
            <input
              className="input-modern w-full text-sm"
              placeholder="URL del logo (opcional)"
            />
            <input
              className="input-modern w-full text-sm"
              placeholder="Subtítulo o lema (opcional)"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">
            Dólar blue para precios
          </div>
          <div className="space-y-3">
            {error && <Alert kind="error" message={error} />}
            {success && <Alert kind="info" message={success} />}
            <form onSubmit={onSubmitDolar} className="space-y-2">
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
                <input
                  className="input-modern flex-1 text-sm"
                  placeholder="Ej: 1500"
                  type="number"
                  step="0.01"
                  value={dolarBlue}
                  onChange={(e) => setDolarBlue(e.target.value)}
                  disabled={loading || saving}
                />
                <button
                  type="submit"
                  className="h-11 rounded-lg bg-emerald-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={loading || saving}
                >
                  {saving ? 'Guardando...' : 'Guardar dólar'}
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Este valor se usará como tipo de cambio base (dólar blue) para
                los cálculos de precios de todos los productos en USD.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
