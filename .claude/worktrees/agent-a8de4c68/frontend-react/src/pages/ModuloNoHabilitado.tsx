import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';

export default function ModuloNoHabilitado({
  featureLabel,
}: {
  featureLabel?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-6 text-slate-200">
      <div className="text-lg font-semibold">Modulo no habilitado</div>
      <p className="text-sm text-slate-400 mt-2">
        {featureLabel
          ? `El modulo "${featureLabel}" no esta incluido en tu licencia.`
          : 'Este modulo no esta incluido en tu licencia.'}
      </p>
      <div className="mt-4 flex items-center gap-2">
        <Button type="button" onClick={() => navigate('/app/configuracion')}>
          Ir a Licencias
        </Button>
        <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
          Volver
        </Button>
      </div>
    </div>
  );
}
