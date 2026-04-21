import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';

type Props = {
  featureLabel?: string;
  /** Verdadero cuando el admin desactivó el módulo (no es problema de licencia). */
  adminDisabled?: boolean;
};

export default function ModuloNoHabilitado({ featureLabel, adminDisabled = false }: Props) {
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-6 text-slate-200">
      <div className="text-lg font-semibold">
        {adminDisabled ? 'Módulo desactivado' : 'Módulo no habilitado'}
      </div>
      <p className="text-sm text-slate-400 mt-2">
        {adminDisabled
          ? 'Este módulo está desactivado. Podés habilitarlo desde Configuración → Módulos del sistema.'
          : featureLabel
          ? `El módulo "${featureLabel}" no está incluido en tu licencia.`
          : 'Este módulo no está incluido en tu licencia.'}
      </p>
      <div className="mt-4 flex items-center gap-2">
        <Button type="button" onClick={() => navigate('/app/configuracion')}>
          {adminDisabled ? 'Ir a Configuración' : 'Ir a Licencias'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
          Volver
        </Button>
      </div>
    </div>
  );
}
