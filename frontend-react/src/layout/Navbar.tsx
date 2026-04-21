import { Bell, Keyboard, Search, Sun, Moon, LogOut, Menu } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLicense } from '../context/LicenseContext';
import { useViewMode } from '../context/ViewModeContext';
import { getRoleFromToken } from '../lib/auth';

type Props = {
  onToggleSidebar?: () => void;
  onOpenMobileMenu?: () => void;
  onOpenShortcuts?: () => void;
  isMobile?: boolean;
};

const ROUTE_LABELS: Record<string, { title: string; breadcrumb: string }> = {
  '/app/dashboard': { title: 'Dashboard', breadcrumb: 'Inicio / Dashboard' },
  '/app/mi-sucursal': { title: 'Mi sucursal', breadcrumb: 'Operacion / Mi sucursal' },
  '/app/caja': { title: 'Caja rapida', breadcrumb: 'Operacion / Caja rapida' },
  '/app/ventas': { title: 'Ventas', breadcrumb: 'Operacion / Ventas' },
  '/app/comprobantes': { title: 'Comprobantes', breadcrumb: 'Operacion / Cuenta empresa' },
  '/app/clientes': { title: 'Clientes', breadcrumb: 'Gestion / Clientes' },
  '/app/productos': { title: 'Productos', breadcrumb: 'Gestion / Productos' },
  '/app/stock': { title: 'Stock', breadcrumb: 'Gestion / Stock' },
  '/app/finanzas': { title: 'Finanzas', breadcrumb: 'Analisis / Finanzas' },
  '/app/informes': { title: 'Informes', breadcrumb: 'Analisis / Informes' },
  '/app/agente': { title: 'Agente del negocio', breadcrumb: 'Agente / Centro del negocio' },
  '/app/asistente-negocio': { title: 'Agente del negocio', breadcrumb: 'Agente / Centro del negocio' },
  '/app/prioridades': { title: 'Agente del negocio', breadcrumb: 'Agente / Centro del negocio' },
  '/app/predicciones': { title: 'Agente del negocio', breadcrumb: 'Agente / Centro del negocio' },
};

function formatCountdown(expiresAt: string | null | undefined, nowMs: number) {
  if (!expiresAt) return null;
  const exp = Date.parse(expiresAt);
  if (!Number.isFinite(exp)) return null;
  const diff = Math.max(0, exp - nowMs);
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}

export default function Navbar({
  onToggleSidebar,
  onOpenMobileMenu,
  onOpenShortcuts,
  isMobile = false,
}: Props) {
  const { theme, toggle } = useTheme();
  const { logout, accessToken } = useAuth();
  const { status: licenseStatus } = useLicense();
  const { viewMode, toggleViewMode } = useViewMode();
  const location = useLocation();
  const navigate = useNavigate();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);

  useEffect(() => {
    if (!licenseStatus?.demo_active || !licenseStatus?.demo_expires_at) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, [licenseStatus?.demo_active, licenseStatus?.demo_expires_at]);

  const demoCountdown = useMemo(
    () => formatCountdown(licenseStatus?.demo_expires_at, nowMs),
    [licenseStatus?.demo_expires_at, nowMs]
  );

  const licenseLabel = (() => {
    if (!licenseStatus) return 'Licencia: -';
    if (!licenseStatus.licensed) return 'Licencia: Inactiva';
    if (licenseStatus.license_type === 'demo') {
      const total = licenseStatus.demo_days_total != null ? `${licenseStatus.demo_days_total} dias` : 'demo';
      const left = demoCountdown || (licenseStatus.demo_days_left != null ? `${licenseStatus.demo_days_left}d` : null);
      return left ? `Licencia: Demo (${total}) - Restan ${left}` : `Licencia: Demo (${total})`;
    }
    return 'Licencia: Activa';
  })();

  const licenseActive = Boolean(licenseStatus?.licensed);
  const licenseBadge = licenseActive ? 'Licencia activa' : 'Licencia inactiva';
  const routeMeta = ROUTE_LABELS[location.pathname] || {
    title: 'Kaisen',
    breadcrumb: 'Operacion / Modulo',
  };

  return (
    <header className="h-[72px] bg-white/90 dark:bg-black/40 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 px-3 sm:px-4 lg:px-6 flex items-center justify-between text-slate-700 dark:text-slate-200">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        {isMobile ? (
          <button
            onClick={onOpenMobileMenu}
            className="rounded-xl h-11 w-11 inline-flex items-center justify-center bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-100 text-sm border border-slate-200 dark:border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
            aria-label="Abrir menu"
          >
            <Menu size={18} />
          </button>
        ) : (
          <button
            onClick={onToggleSidebar}
            className="rounded-xl px-3 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-100 text-sm border border-slate-200 dark:border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
          >
            Menu
          </button>
        )}
        <div className="min-w-0">
          <div className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate">{routeMeta.title}</div>
          <div className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">{routeMeta.breadcrumb}</div>
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <div className="hidden lg:flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-200">
          <span className={`h-2 w-2 rounded-full ${licenseActive ? 'bg-emerald-400 animate-[loginPulse_2s_ease-in-out_infinite]' : 'bg-rose-400'}`} />
          <span>{licenseLabel || licenseBadge}</span>
        </div>
        <div className="hidden md:flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-2 text-sm text-slate-600 dark:text-slate-200">
          <Search size={16} />
          <input placeholder="Buscar..." className="bg-transparent outline-none w-48 lg:w-56 text-sm" />
        </div>
        <button
          type="button"
          onClick={toggleViewMode}
          className="hidden lg:inline-flex min-h-[40px] items-center rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 px-3 text-xs text-slate-600 dark:text-slate-200 transition hover:bg-slate-200 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
          aria-label={`Cambiar a ${viewMode === 'simple' ? 'vista completa' : 'vista simple'}`}
        >
          {viewMode === 'simple' ? 'Vista simple' : 'Vista completa'}
        </button>
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="h-10 w-10 inline-flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-200 border border-transparent hover:border-slate-200 dark:hover:border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
          aria-label="Abrir panel de atajos"
          title="Atajos"
        >
          <Keyboard size={18} />
        </button>
        <button
          type="button"
          onClick={() => navigate(role === 'gerente_sucursal' ? '/app/mi-sucursal' : '/app/finanzas')}
          className="h-10 w-10 inline-flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-200 border border-transparent hover:border-slate-200 dark:hover:border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
          aria-label="Ver alertas operativas"
          title="Alertas"
        >
          <Bell size={18} />
        </button>
        <button onClick={toggle} className="h-10 w-10 inline-flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-200 border border-transparent hover:border-slate-200 dark:hover:border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40" title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button onClick={logout} className="h-10 w-10 inline-flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-200 border border-transparent hover:border-slate-200 dark:hover:border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40" title="Cerrar sesion">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
