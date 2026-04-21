import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import { BRAND } from '../config/branding';
import TextInput from '../components/TextInput';
import Spinner from '../components/Spinner';
import Alert from '../components/Alert';
import { login, setupAdmin, setupStatus } from '../lib/api';
import { clearApiBase, clearAppMode } from '../lib/storage';
import Button from '../ui/Button';
import AnimatedOrbs from '../ui/AnimatedOrbs';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login: setAuthTokens } = useAuth();

  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupRequired, setSetupRequired] = useState<boolean>(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adminNombre, setAdminNombre] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupSuccess, setSetupSuccess] = useState<string | null>(null);

  useEffect(() => {
    clearAppMode();
    clearApiBase();

    let active = true;
    (async () => {
      setCheckingSetup(true);
      try {
        const data = await setupStatus();
        if (!active) return;
        setSetupRequired(Boolean(data?.requiresSetup));
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'No se pudo verificar el estado inicial');
      } finally {
        if (active) setCheckingSetup(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const canSubmit = useMemo(
    () => email.trim().length > 0 && password.trim().length > 0 && !loading && !setupRequired,
    [email, password, loading, setupRequired],
  );

  const canSetupSubmit = useMemo(
    () =>
      adminNombre.trim().length > 0 &&
      adminEmail.trim().length > 0 &&
      adminPassword.trim().length >= 6 &&
      adminPasswordConfirm.trim().length >= 6 &&
      adminPassword === adminPasswordConfirm &&
      !setupLoading,
    [adminNombre, adminEmail, adminPassword, adminPasswordConfirm, setupLoading],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      const { accessToken, refreshToken } = await login(email.trim(), password);
      setAuthTokens(accessToken, refreshToken, remember);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesion');
    } finally {
      setLoading(false);
    }
  }

  async function onSetupSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSetupSubmit) return;

    setSetupError(null);
    setSetupSuccess(null);
    setSetupLoading(true);
    try {
      await setupAdmin({
        nombre: adminNombre.trim(),
        email: adminEmail.trim(),
        password: adminPassword,
      });

      setSetupRequired(false);
      setSetupSuccess('Admin creado. Ya puedes iniciar sesion.');
      setEmail(adminEmail.trim());
      setAdminNombre('');
      setAdminEmail('');
      setAdminPassword('');
      setAdminPasswordConfirm('');
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'No se pudo crear el admin');
    } finally {
      setSetupLoading(false);
    }
  }

  const inputClass =
    'h-12 rounded-[10px] bg-black/30 border border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/80 focus:ring-2 focus:ring-indigo-400/20 focus:bg-black/40';
  const labelClass = 'text-sm font-medium text-slate-200';

  return (
    <div className="login-root min-h-screen w-full flex items-center justify-center relative overflow-hidden px-4 sm:px-6">
      <AnimatedOrbs />
      <div className="w-full max-w-[480px]">
        <div className="relative z-10 rounded-[24px] bg-[#111118]/80 backdrop-blur-[20px] border border-[#6366f1]/20 shadow-[0_24px_60px_rgba(0,0,0,0.45),0_0_40px_rgba(99,102,241,0.2)] p-8 sm:p-12">
          <Logo {...BRAND} />

          <div className="mt-6 text-xs text-slate-400">
            Acceso cloud centralizado.
          </div>

          {checkingSetup && (
            <div className="mt-5 flex items-center gap-2 text-sm text-slate-300">
              <Spinner size={16} />
              <span>Verificando estado inicial...</span>
            </div>
          )}

          {!checkingSetup && setupRequired && (
            <form onSubmit={onSetupSubmit} className="mt-6 space-y-4">
              <div className="text-sm font-semibold text-slate-200">Configuracion inicial</div>
              <p className="text-xs text-slate-400">
                Crea el usuario administrador para habilitar el sistema.
              </p>

              <Alert kind="error" message={setupError} />
              <Alert kind="info" message={setupSuccess} />

              <TextInput
                label="Nombre"
                type="text"
                name="admin-nombre"
                value={adminNombre}
                onChange={(e) => setAdminNombre(e.target.value)}
                required
                className={inputClass}
                labelClassName={labelClass}
              />
              <TextInput
                label="Email admin"
                type="email"
                name="admin-email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
                className={inputClass}
                labelClassName={labelClass}
              />
              <TextInput
                label="Contrasena"
                type="password"
                name="admin-password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
                revealable
                className={inputClass}
                labelClassName={labelClass}
              />
              <TextInput
                label="Confirmar contrasena"
                type="password"
                name="admin-password-confirm"
                value={adminPasswordConfirm}
                onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                required
                revealable
                className={inputClass}
                labelClassName={labelClass}
              />

              <Button type="submit" disabled={!canSetupSubmit}>
                {setupLoading ? 'Creando admin...' : 'Crear admin'}
              </Button>
            </form>
          )}

          {!checkingSetup && (
            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              <Alert kind="error" message={error} />
              <Alert kind="info" message={setupSuccess} />

              <TextInput
                label="Email"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
                required
                className={inputClass}
                labelClassName={labelClass}
              />

              <TextInput
                label="Contrasena"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                revealable
                className={inputClass}
                labelClassName={labelClass}
              />

              <label className="inline-flex items-center gap-2 select-none text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="rounded border-white/20 bg-black/40"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>Recordarme</span>
              </label>

              <Button type="submit" disabled={!canSubmit}>
                {loading ? 'Ingresando...' : 'Ingresar'}
              </Button>

              {setupRequired && (
                <p className="text-xs text-amber-300">
                  Debes crear el admin primero para poder iniciar sesion.
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
