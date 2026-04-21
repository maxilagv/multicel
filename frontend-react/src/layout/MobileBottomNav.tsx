import { NavLink } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLicense } from '../context/LicenseContext';
import { useViewMode } from '../context/ViewModeContext';
import { useTenantModules } from '../context/TenantModulesContext';
import { getRoleFromToken } from '../lib/auth';
import { getBottomNavItems } from './navigationConfig';

export default function MobileBottomNav() {
  const { accessToken } = useAuth();
  const { status } = useLicense();
  const { viewMode } = useViewMode();
  const { modules } = useTenantModules();
  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const items = useMemo(() => getBottomNavItems(role, status, viewMode, modules), [role, status, viewMode, modules]);

  if (!items.length) return null;

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 app-bottom-nav">
      <nav className="mx-auto max-w-3xl rounded-2xl border border-slate-200 dark:border-white/15 bg-white/95 dark:bg-black/70 backdrop-blur-xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
        <ul className={`grid ${items.length >= 4 ? 'grid-cols-4' : items.length === 3 ? 'grid-cols-3' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => [
                    'flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                    isActive ? 'text-indigo-600 dark:text-cyan-200' : 'text-slate-500 dark:text-slate-300',
                  ].join(' ')}
                >
                  <Icon size={17} strokeWidth={2.2} />
                  <span>{item.shortLabel}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
