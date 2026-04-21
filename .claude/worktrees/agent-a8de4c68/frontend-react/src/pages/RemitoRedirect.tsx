import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import Button from '../ui/Button';
import { Api } from '../lib/api';

export default function RemitoRedirect() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const downloadRemito = useCallback(async () => {
    const ventaId = Number(id);
    if (!Number.isInteger(ventaId) || ventaId <= 0) {
      setError('ID de venta invalido');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setDone(false);
    try {
      const blob = await Api.descargarRemito(ventaId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'No se pudo descargar el remito');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    downloadRemito();
  }, [downloadRemito]);

  return (
    <div className="space-y-4 max-w-xl">
      <div className="app-card p-4 space-y-3">
        <h2 className="text-lg sm:text-xl font-semibold text-slate-100">Remito</h2>
        <p className="text-sm text-slate-400">Descarga del remito asociado a la venta.</p>
        {loading && (
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <Spinner />
            Generando remito...
          </div>
        )}
        {error && <Alert kind="error" message={error} />}
        {!loading && !error && done && (
          <div className="text-sm text-slate-300 space-y-3">
            <div>Remito generado. Si no se abrio automaticamente, podes reintentar.</div>
            <Button className="touch-target" variant="outline" onClick={downloadRemito}>
              Reintentar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
