import { Bell, Search, Sun, Moon, LogOut, Menu } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLicense } from '../context/LicenseContext';

type Props = {
  onToggleSidebar?: () => void;
  onOpenMobileMenu?: () => void;
  isMobile?: boolean;
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

export default function Navbar({ onToggleSidebar, onOpenMobileMenu, isMobile = false }: Props) {
  const { theme, toggle } = useTheme();
  const { logout } = useAuth();
  const { status: licenseStatus } = useLicense();
  const [nowMs, setNowMs] = useState(() => Date.now());

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

  return (
    <header className="h-[72px] bg-black/40 backdrop-blur-xl border-b border-white/10 px-3 sm:px-4 lg:px-6 flex items-center justify-between text-slate-200">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        {isMobile ? (
          <button
            onClick={onOpenMobileMenu}
            className="rounded-xl h-11 w-11 inline-flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-100 text-sm border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
            aria-label="Abrir menu"
          >
            <Menu size={18} />
          </button>
        ) : (
          <button
            onClick={onToggleSidebar}
            className="rounded-xl px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-100 text-sm border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
          >
            Menu
          </button>
        )}
        <div className="min-w-0">
          <div className="text-base sm:text-lg font-semibold text-white truncate">Dashboard</div>
          <div className="hidden sm:block text-xs text-slate-400">Inicio / Dashboard</div>
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <div className="hidden lg:flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-200">
          <span className={`h-2 w-2 rounded-full ${licenseActive ? 'bg-emerald-400 animate-[loginPulse_2s_ease-in-out_infinite]' : 'bg-rose-400'}`} />
          <span>{licenseLabel || licenseBadge}</span>
        </div>
        <div className="hidden md:flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-slate-200">
          <Search size={16} />
          <input placeholder="Buscar..." className="bg-transparent outline-none w-48 lg:w-56 text-sm" />
        </div>
        <button className="h-10 w-10 inline-flex items-center justify-center rounded-xl hover:bg-white/10 text-slate-200 border border-transparent hover:border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40">
          <Bell size={18} />
        </button>
        <button onClick={toggle} className="h-10 w-10 inline-flex items-center justify-center rounded-xl hover:bg-white/10 text-slate-200 border border-transparent hover:border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40" title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button onClick={logout} className="h-10 w-10 inline-flex items-center justify-center rounded-xl hover:bg-white/10 text-slate-200 border border-transparent hover:border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40" title="Cerrar sesion">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
